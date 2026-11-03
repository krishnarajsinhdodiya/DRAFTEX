// Compile service (SPEC §9): fresh temp dir per job under the OS temp folder,
// FIFO queue with bounded concurrency, per-user rate limit, wall-clock and
// output-size limits, cleanup in finally plus a startup sweep.
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Engine } from "./engine.ts";
import { looksLikeCacheMiss, parseDiagnostics, type Diagnostic } from "./log.ts";

export const TEX_FILE = "paper.tex";
const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;
const ASSET_NAME = /^assets\/[a-f0-9]{64}\.(?:png|jpg|pdf)$/;

export interface SlotRange {
  slotId: string;
  /** 1-based, inclusive. */
  startLine: number;
  endLine: number;
}

export interface CompileAsset {
  /** Path as written in the .tex, e.g. assets/<sha256>.png */
  name: string;
  sourcePath: string;
}

export interface CompileJob {
  userId: string;
  tex: string;
  assets?: CompileAsset[];
  slotRanges?: SlotRange[];
  /** A newer job with the same key cancels this one while it is still queued. */
  supersedeKey?: string;
}

export interface CompileResult {
  ok: boolean;
  pdf?: Buffer;
  diagnostics: Diagnostic[];
  log: string;
  timedOut: boolean;
  durationMs: number;
  usedNetwork: boolean;
}

export class CompileRejected extends Error {
  override name = "CompileRejected";
  readonly reason: "rate-limit" | "superseded" | "invalid";
  constructor(reason: "rate-limit" | "superseded" | "invalid", message: string) {
    super(message);
    this.reason = reason;
  }
}

export interface CompileServiceOptions {
  engine: Engine;
  tempRoot?: string;
  concurrency?: number;
  timeoutMs?: number;
  maxOutputBytes?: number;
  /** Retry once with the network when the offline cache misses a file. */
  allowNetwork?: boolean;
  rateLimit?: { jobs: number; perMs: number };
  now?: () => number;
}

interface Pending {
  job: CompileJob;
  resolve: (r: CompileResult) => void;
  reject: (e: Error) => void;
}

export function slotForLine(ranges: SlotRange[] | undefined, line: number): string | undefined {
  return ranges?.find((r) => line >= r.startLine && line <= r.endLine)?.slotId;
}

export class CompileService {
  private readonly engine: Engine;
  readonly tempRoot: string;
  private readonly concurrency: number;
  private readonly timeoutMs: number;
  private readonly maxOutputBytes: number;
  private readonly allowNetwork: boolean;
  private readonly rateLimit: { jobs: number; perMs: number };
  private readonly now: () => number;
  private readonly queue: Pending[] = [];
  private running = 0;
  private readonly history = new Map<string, number[]>();

  constructor(opts: CompileServiceOptions) {
    this.engine = opts.engine;
    this.tempRoot = opts.tempRoot ?? path.join(os.tmpdir(), "DRAFTEX");
    this.concurrency = opts.concurrency ?? 2;
    this.timeoutMs = opts.timeoutMs ?? 20_000;
    this.maxOutputBytes = opts.maxOutputBytes ?? 20 * 1024 * 1024;
    this.allowNetwork = opts.allowNetwork ?? true;
    this.rateLimit = opts.rateLimit ?? { jobs: 30, perMs: 60_000 };
    this.now = opts.now ?? Date.now;
  }

  /** Startup sweep: removes every leftover job folder. */
  sweep(): void {
    fs.rmSync(this.tempRoot, { recursive: true, force: true });
  }

  get pending(): number {
    return this.queue.length;
  }

  compile(job: CompileJob): Promise<CompileResult> {
    if (!SAFE_SEGMENT.test(job.userId)) {
      return Promise.reject(new CompileRejected("invalid", "Invalid user id."));
    }
    for (const a of job.assets ?? []) {
      if (!ASSET_NAME.test(a.name)) {
        return Promise.reject(new CompileRejected("invalid", `Invalid asset name ${a.name}.`));
      }
    }
    const t = this.now();
    const recent = (this.history.get(job.userId) ?? []).filter(
      (at) => t - at < this.rateLimit.perMs,
    );
    if (recent.length >= this.rateLimit.jobs) {
      return Promise.reject(
        new CompileRejected("rate-limit", "Too many compiles in a short time. Wait a moment."),
      );
    }
    recent.push(t);
    this.history.set(job.userId, recent);

    if (job.supersedeKey !== undefined) {
      for (let i = this.queue.length - 1; i >= 0; i--) {
        const p = this.queue[i];
        if (p && p.job.supersedeKey === job.supersedeKey) {
          this.queue.splice(i, 1);
          p.reject(new CompileRejected("superseded", "A newer compile replaced this one."));
        }
      }
    }
    return new Promise((resolve, reject) => {
      this.queue.push({ job, resolve, reject });
      this.pump();
    });
  }

  private pump(): void {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const next = this.queue.shift() as Pending;
      this.running++;
      this.run(next.job)
        .then(next.resolve, next.reject)
        .finally(() => {
          this.running--;
          this.pump();
        });
    }
  }

  private async run(job: CompileJob): Promise<CompileResult> {
    const started = this.now();
    const dir = path.join(this.tempRoot, job.userId, randomUUID());
    try {
      fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
      fs.writeFileSync(path.join(dir, TEX_FILE), job.tex, "utf8");
      for (const a of job.assets ?? []) {
        fs.copyFileSync(a.sourcePath, path.join(dir, a.name));
      }

      let usedNetwork = false;
      let attempt = await this.attempt(dir, true, job);
      if (
        !attempt.ok &&
        !attempt.timedOut &&
        this.allowNetwork &&
        looksLikeCacheMiss(attempt.diagnostics)
      ) {
        usedNetwork = true;
        attempt = await this.attempt(dir, false, job);
      }
      return { ...attempt, usedNetwork, durationMs: this.now() - started };
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  private async attempt(
    dir: string,
    onlyCached: boolean,
    job: CompileJob,
  ): Promise<Omit<CompileResult, "usedNetwork" | "durationMs">> {
    for (const f of ["paper.pdf", "paper.log"]) fs.rmSync(path.join(dir, f), { force: true });
    const res = await this.engine({
      workDir: dir,
      texFile: TEX_FILE,
      onlyCached,
      timeoutMs: this.timeoutMs,
    });
    const logPath = path.join(dir, "paper.log");
    const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "";
    const diagnostics = parseDiagnostics(res.stderr, log);
    if (res.spawnError) {
      diagnostics.push({
        severity: "error",
        kind: "error",
        message: `The LaTeX engine could not start (${res.spawnError}).`,
      });
    }
    if (res.timedOut) {
      diagnostics.push({
        severity: "error",
        kind: "error",
        message: `Compiling took longer than ${Math.round(this.timeoutMs / 1000)} seconds and was stopped.`,
      });
    }
    for (const d of diagnostics) {
      if (d.line !== undefined && (d.file === undefined || d.file === TEX_FILE)) {
        const slotId = slotForLine(job.slotRanges, d.line);
        if (slotId) d.slotId = slotId;
      }
    }

    const pdfPath = path.join(dir, "paper.pdf");
    let pdf: Buffer | undefined;
    if (res.exitCode === 0 && fs.existsSync(pdfPath)) {
      const size = fs.statSync(pdfPath).size;
      if (size > this.maxOutputBytes) {
        diagnostics.push({
          severity: "error",
          kind: "error",
          message: `The PDF is larger than ${Math.round(this.maxOutputBytes / 1024 / 1024)} MB.`,
        });
      } else {
        pdf = fs.readFileSync(pdfPath);
      }
    }
    const ok = pdf !== undefined && !diagnostics.some((d) => d.severity === "error");
    return { ok, ...(ok ? { pdf } : {}), diagnostics, log, timedOut: res.timedOut };
  }
}
