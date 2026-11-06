// A paper version as PDF (D57): the stored snapshot is compiled again, laid
// out as an export (empty questions left out), so it shows what was printed.
// Results are cached by LaTeX hash like previews; nothing is written to disk.
import { createHash } from "node:crypto";
import type { Actor, DataLayer } from "@/lib/data";
import { bundleSegments, compactForExport } from "@/lib/export/bundle";
import { type CompileService, isCompileRejected } from "@/lib/latex/compile";
import { serializeKey } from "@/lib/latex/key";
import { serializePaper } from "@/lib/latex/serialize";
import { paperInput } from "@/lib/paper/assemble";
import type { Doc } from "@/lib/paper/schema";
import { paperSnapshotSchema } from "@/lib/paper/snapshot";
import { PROGRAM_LABEL } from "@/lib/templates/labels";
import type { ResolveImages } from "./images";
import { type PaperPreviewDeps, type PreviewKind, keySlots } from "./paper-preview";

export interface VersionPdfDeps {
  data: Pick<DataLayer, "papers">;
  compile: Pick<CompileService, "compile">;
  images: ResolveImages;
  cache: PaperPreviewDeps["cache"];
}

export type VersionPdfOutcome =
  | { ok: true; pdf: Buffer; fileName: string }
  | { ok: false; status: 409 | 422 | 429; message: string };

/** Throws NotFoundError for a version that is not of one of the actor's papers. */
export async function versionPdf(
  deps: VersionPdfDeps,
  actor: Actor,
  paperId: string,
  versionId: string,
  kind: PreviewKind,
): Promise<VersionPdfOutcome> {
  const v = await deps.data.papers.getVersion(actor, paperId, versionId);
  const p = v.data.paper;
  const slots = v.data.slots.map((s) => ({ ...s, content: s.content as Doc }));
  const full = paperInput({
    snapshot: paperSnapshotSchema.parse(p.templateSnapshot),
    courseCode: p.courseCode,
    courseTitle: p.courseTitle,
    program: p.program,
    semesterOrYear: p.semesterOrYear,
    examKind: p.examKind,
    examDate: p.examDate ? new Date(p.examDate) : null,
    instructionsOverride: p.instructionsOverride,
    slots,
  });
  const c = compactForExport(full, keySlots(slots));
  if (c.paper.slots.length === 0) {
    return { ok: false, status: 422, message: "This version has no questions." };
  }
  const ser = kind === "KEY" ? serializeKey(c.paper, c.keys) : serializePaper(c.paper);
  if (!ser.ok) {
    return { ok: false, status: 422, message: "This version could not be typeset again." };
  }
  const assets = await deps.images(ser.assets, actor.userId);
  if (typeof assets === "string") return { ok: false, status: 422, message: assets };

  const date = v.createdAt;
  const name = bundleSegments({
    programLabel: PROGRAM_LABEL[p.program],
    courseCode: p.courseCode,
    title: p.title,
    date,
  })[2];
  const fileName = `${name}${kind === "KEY" ? " key" : ""}.pdf`;
  const cacheKey = `${actor.userId}:${createHash("sha256").update(ser.tex).digest("hex")}`;
  const hit = deps.cache.get(cacheKey);
  if (hit) return { ok: true, pdf: hit.pdf, fileName };
  try {
    const res = await deps.compile.compile({
      userId: actor.userId,
      tex: ser.tex,
      assets,
      slotRanges: ser.slotRanges,
      supersedeKey: `version:${kind}:${actor.userId}:${versionId}`,
    });
    if (!res.ok || !res.pdf) {
      return {
        ok: false,
        status: 422,
        message: res.timedOut
          ? "Making the PDF took too long. Try again."
          : "This version could not be typeset again.",
      };
    }
    deps.cache.set(cacheKey, { pdf: res.pdf, problems: [] });
    return { ok: true, pdf: res.pdf, fileName };
  } catch (e) {
    if (isCompileRejected(e)) {
      if (e.reason === "superseded") return { ok: false, status: 409, message: e.message };
      if (e.reason === "rate-limit") return { ok: false, status: 429, message: e.message };
    }
    throw e;
  }
}
