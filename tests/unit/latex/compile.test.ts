import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CompileRejected, CompileService, slotForLine } from "@/lib/latex/compile";
import { engineEnv, tectonicArgs, tectonicEngine, type Engine } from "@/lib/latex/engine";
import { BUNDLE_URL } from "@/lib/latex/pins";

const FAKE = fileURLToPath(new URL("../../fixtures/latex/fake-tectonic.mjs", import.meta.url));
const SHA = "a".repeat(64);

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dx-compile-"));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const fakeEngine = (): Engine =>
  tectonicEngine({ binary: process.execPath, prefixArgs: [FAKE], cacheDir: "/cache" });

function service(over: Partial<ConstructorParameters<typeof CompileService>[0]> = {}) {
  return new CompileService({ engine: fakeEngine(), tempRoot: path.join(tmp, "jobs"), ...over });
}

describe("engine", () => {
  it("builds Tectonic arguments with --untrusted and the pinned bundle", () => {
    const req = { workDir: "/w", texFile: "paper.tex", onlyCached: true, timeoutMs: 1 };
    expect(tectonicArgs(req)).toEqual([
      "--untrusted",
      "--keep-logs",
      "--chatter",
      "default",
      "--bundle",
      BUNDLE_URL,
      "--only-cached",
      "paper.tex",
    ]);
    expect(tectonicArgs({ ...req, onlyCached: false })).not.toContain("--only-cached");
  });

  it("passes only a minimal environment", () => {
    const env = engineEnv("/c", { PATH: "/bin", DX_SECRET: "s", DATABASE_URL: "x" });
    expect(env).toEqual({ TECTONIC_CACHE_DIR: "/c", PATH: "/bin" });
  });

  it("runs the binary without a shell and reports exit codes", async () => {
    fs.writeFileSync(path.join(tmp, "paper.tex"), "hello");
    const res = await fakeEngine()({
      workDir: tmp,
      texFile: "paper.tex",
      onlyCached: true,
      timeoutMs: 10_000,
    });
    expect(res.exitCode).toBe(0);
    const out = JSON.parse(res.stdout) as { args: string[]; cache: string; secret: null };
    expect(out.cache).toBe("/cache");
    expect(out.secret).toBeNull();
    expect(out.args).toContain("--untrusted");
  });

  it("reports a binary that cannot start", async () => {
    const engine = tectonicEngine({ binary: path.join(tmp, "missing"), cacheDir: "/c" });
    const res = await engine({ workDir: tmp, texFile: "p.tex", onlyCached: true, timeoutMs: 1000 });
    expect(res.exitCode).toBeNull();
    expect(res.spawnError).toMatch(/ENOENT/);
  });
});

describe("CompileService", () => {
  it("compiles, returns the PDF, and removes the job folder", async () => {
    const svc = service();
    const res = await svc.compile({ userId: "u1", tex: "ok" });
    expect(res.ok).toBe(true);
    expect(res.pdf?.toString()).toContain("%PDF");
    expect(res.usedNetwork).toBe(false);
    expect(fs.readdirSync(path.join(tmp, "jobs", "u1"))).toEqual([]);
  });

  it("copies assets by hash into the job folder", async () => {
    const src = path.join(tmp, "img.png");
    fs.writeFileSync(src, "png");
    const res = await service().compile({
      userId: "u1",
      tex: "ok",
      assets: [{ name: `assets/${SHA}.png`, sourcePath: src }],
    });
    expect(res.log).toContain(`assets=${SHA}.png`);
  });

  it("maps errors to slots by line", async () => {
    const res = await service().compile({
      userId: "u1",
      tex: "FAIL",
      slotRanges: [{ slotId: "g1.2", startLine: 3, endLine: 4 }],
    });
    expect(res.ok).toBe(false);
    expect(res.pdf).toBeUndefined();
    expect(res.diagnostics[0]).toMatchObject({ severity: "error", line: 3, slotId: "g1.2" });
  });

  it("keeps warnings but still returns the PDF", async () => {
    const res = await service().compile({ userId: "u1", tex: "WARN" });
    expect(res.ok).toBe(true);
    expect(res.diagnostics).toEqual([
      expect.objectContaining({ kind: "overfull", overfullPt: 3.5, line: 2 }),
    ]);
  });

  it("retries online once after an offline cache miss", async () => {
    const res = await service().compile({ userId: "u1", tex: "MISS" });
    expect(res.ok).toBe(true);
    expect(res.usedNetwork).toBe(true);
  });

  it("does not retry online when the network is not allowed", async () => {
    const res = await service({ allowNetwork: false }).compile({ userId: "u1", tex: "MISS" });
    expect(res.ok).toBe(false);
    expect(res.usedNetwork).toBe(false);
  });

  it("stops a job at the time limit", async () => {
    const res = await service({ timeoutMs: 500 }).compile({ userId: "u1", tex: "SLEEP" });
    expect(res.ok).toBe(false);
    expect(res.timedOut).toBe(true);
    expect(res.diagnostics.at(-1)?.message).toMatch(/longer than 1 seconds/);
  });

  it("rejects oversized output", async () => {
    const res = await service({ maxOutputBytes: 1024 }).compile({ userId: "u1", tex: "BIG" });
    expect(res.ok).toBe(false);
    expect(res.diagnostics.at(-1)?.message).toMatch(/larger than/);
  });

  it("fails when the engine writes no PDF", async () => {
    const res = await service().compile({ userId: "u1", tex: "NOPDF" });
    expect(res.ok).toBe(false);
  });

  it("reports an engine that cannot start", async () => {
    const svc = service({
      engine: tectonicEngine({ binary: path.join(tmp, "x"), cacheDir: "/c" }),
    });
    const res = await svc.compile({ userId: "u1", tex: "ok" });
    expect(res.diagnostics[0]?.message).toMatch(/could not start/);
  });

  it.each([
    [{ userId: "../evil", tex: "" }],
    [{ userId: "u1", tex: "", assets: [{ name: "../../etc/passwd", sourcePath: "/x" }] }],
    [{ userId: "u1", tex: "", assets: [{ name: `assets/${SHA}.svg`, sourcePath: "/x" }] }],
  ])("refuses unsafe ids and asset names %#", async (job) => {
    await expect(service().compile(job)).rejects.toMatchObject({ reason: "invalid" });
  });

  it("rate-limits per user", async () => {
    let t = 0;
    const svc = service({ rateLimit: { jobs: 2, perMs: 1000 }, now: () => t });
    await svc.compile({ userId: "u1", tex: "ok" });
    await svc.compile({ userId: "u1", tex: "ok" });
    await expect(svc.compile({ userId: "u1", tex: "ok" })).rejects.toBeInstanceOf(CompileRejected);
    await expect(svc.compile({ userId: "u2", tex: "ok" })).resolves.toMatchObject({ ok: true });
    t = 1000;
    await expect(svc.compile({ userId: "u1", tex: "ok" })).resolves.toMatchObject({ ok: true });
  });

  it("runs at most `concurrency` jobs, in FIFO order", async () => {
    let active = 0;
    let peak = 0;
    const order: string[] = [];
    const engine: Engine = async (req) => {
      active++;
      peak = Math.max(peak, active);
      order.push(fs.readFileSync(path.join(req.workDir, req.texFile), "utf8"));
      await new Promise((r) => setTimeout(r, 20));
      active--;
      return { exitCode: 1, stdout: "", stderr: "", timedOut: false };
    };
    const svc = service({ engine, concurrency: 2 });
    await Promise.all(["a", "b", "c", "d", "e"].map((tex) => svc.compile({ userId: "u", tex })));
    expect(peak).toBe(2);
    expect(order).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("cancels queued jobs superseded by a newer one with the same key", async () => {
    let open: () => void = () => {};
    const gate = new Promise<void>((r) => (open = r));
    const engine: Engine = async () => {
      await gate;
      return { exitCode: 1, stdout: "", stderr: "", timedOut: false };
    };
    const svc = service({ engine, concurrency: 1 });
    const running = svc.compile({ userId: "u", tex: "1", supersedeKey: "p" });
    const old = svc.compile({ userId: "u", tex: "2", supersedeKey: "p" });
    const other = svc.compile({ userId: "u", tex: "x", supersedeKey: "q" });
    const latest = svc.compile({ userId: "u", tex: "3", supersedeKey: "p" });
    await expect(old).rejects.toMatchObject({ reason: "superseded" });
    expect(svc.pending).toBe(2);
    open();
    await expect(Promise.all([running, other, latest])).resolves.toHaveLength(3);
  });

  it("cleans up even when the engine throws, and the sweep removes leftovers", async () => {
    const svc = service({
      engine: async () => {
        throw new Error("boom");
      },
    });
    await expect(svc.compile({ userId: "u1", tex: "x" })).rejects.toThrow("boom");
    expect(fs.readdirSync(path.join(tmp, "jobs", "u1"))).toEqual([]);
    fs.mkdirSync(path.join(tmp, "jobs", "u9", "stale"), { recursive: true });
    svc.sweep();
    expect(fs.existsSync(path.join(tmp, "jobs"))).toBe(false);
  });

  it("uses the OS temp folder by default", () => {
    expect(new CompileService({ engine: fakeEngine() }).tempRoot).toBe(
      path.join(os.tmpdir(), "DRAFTEX"),
    );
  });
});

describe("slotForLine", () => {
  it("finds the slot that contains a line", () => {
    const ranges = [
      { slotId: "a", startLine: 1, endLine: 2 },
      { slotId: "b", startLine: 3, endLine: 5 },
    ];
    expect(slotForLine(ranges, 4)).toBe("b");
    expect(slotForLine(ranges, 9)).toBeUndefined();
    expect(slotForLine(undefined, 1)).toBeUndefined();
  });
});
