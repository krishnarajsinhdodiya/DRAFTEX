// Empty-template previews: serialise with sample header values, resolve the
// header images, compile, and keep recent PDFs in memory by LaTeX hash so an
// unchanged template never compiles twice (D19).
import { createHash } from "node:crypto";
import path from "node:path";
import type { z } from "zod";
import { CompileRejected, type CompileAsset, type CompileService } from "@/lib/latex/compile";
import { serializePaper } from "@/lib/latex/serialize";
import { templateFieldsSchema } from "@/lib/templates/fields";
import { builtInLogoBySha } from "@/lib/templates/logos";
import { previewPaper } from "@/lib/templates/preview";

export const previewRequestSchema = templateFieldsSchema.pick({
  program: true,
  examKind: true,
  courseKind: true,
  durationMinutes: true,
  maxMarks: true,
  structure: true,
  style: true,
  header: true,
});
export type PreviewRequest = z.input<typeof previewRequestSchema>;

export type PreviewOutcome =
  | { ok: true; pdf: Buffer; cached: boolean }
  | { ok: false; status: 409 | 422 | 429 | 500; message: string; details?: string[] };

const ASSET = /^assets\/([a-f0-9]{64})\.(png|jpg|pdf)$/;

/** Header images a preview may use: only the built-in logos until uploads exist (D16). */
export function resolveAssets(names: string[], repoRoot: string): CompileAsset[] | string {
  const out: CompileAsset[] = [];
  for (const name of names) {
    const logo = builtInLogoBySha(ASSET.exec(name)?.[1] ?? "");
    if (!logo || !name.endsWith(`.${logo.ext}`)) {
      return "This template uses an image that is not available. Choose one of the built-in logos.";
    }
    out.push({ name, sourcePath: path.join(repoRoot, logo.file) });
  }
  return out;
}

export class PreviewCache {
  private readonly entries = new Map<string, Buffer>();
  private readonly max: number;
  constructor(max = 40) {
    this.max = max;
  }
  get(key: string): Buffer | undefined {
    const hit = this.entries.get(key);
    if (hit) {
      this.entries.delete(key);
      this.entries.set(key, hit);
    }
    return hit;
  }
  set(key: string, pdf: Buffer): void {
    this.entries.delete(key);
    this.entries.set(key, pdf);
    while (this.entries.size > this.max) {
      this.entries.delete(this.entries.keys().next().value as string);
    }
  }
}

export interface PreviewDeps {
  compile: Pick<CompileService, "compile">;
  repoRoot: string;
  cache: PreviewCache;
}

export async function templatePreview(
  deps: PreviewDeps,
  userId: string,
  input: unknown,
): Promise<PreviewOutcome> {
  const parsed = previewRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      status: 422,
      message: "The template has a field the preview cannot read.",
      details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    };
  }
  const ser = serializePaper(previewPaper(parsed.data));
  if (!ser.ok) {
    return {
      ok: false,
      status: 422,
      message: "The preview could not be made.",
      details: ser.issues.map((i) => i.message),
    };
  }
  const assets = resolveAssets(ser.assets, deps.repoRoot);
  if (typeof assets === "string") return { ok: false, status: 422, message: assets };

  const key = createHash("sha256").update(ser.tex).digest("hex");
  const hit = deps.cache.get(key);
  if (hit) return { ok: true, pdf: hit, cached: true };

  try {
    const res = await deps.compile.compile({
      userId,
      tex: ser.tex,
      assets,
      supersedeKey: `template-preview:${userId}`,
    });
    if (!res.ok || !res.pdf) {
      const errors = res.diagnostics.filter((d) => d.severity === "error").map((d) => d.message);
      return {
        ok: false,
        status: 422,
        message: res.timedOut
          ? "The preview took too long to make. Try again."
          : "The preview could not be compiled.",
        details: errors.slice(0, 5),
      };
    }
    deps.cache.set(key, res.pdf);
    return { ok: true, pdf: res.pdf, cached: false };
  } catch (e) {
    if (e instanceof CompileRejected) {
      if (e.reason === "superseded") return { ok: false, status: 409, message: e.message };
      if (e.reason === "rate-limit") return { ok: false, status: 429, message: e.message };
    }
    throw e;
  }
}
