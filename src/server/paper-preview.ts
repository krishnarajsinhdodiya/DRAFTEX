// The paper editor's live preview (SPEC §8): compile the saved paper or its
// answer key (D23, D33), keep only the newest request per paper and kind, and
// say which question caused each problem. Recent results are cached by LaTeX hash.
import { createHash } from "node:crypto";
import type { Actor, DataLayer } from "@/lib/data";
import { CompileRejected, type CompileService } from "@/lib/latex/compile";
import { type KeySlot, serializeKey } from "@/lib/latex/key";
import { type SerializeResult, serializePaper } from "@/lib/latex/serialize";
import { paperInput } from "@/lib/paper/assemble";
import { questionNumbers } from "@/lib/paper/numbering";
import type { Doc, PaperInput } from "@/lib/paper/schema";
import { type Problem, errorSummary, fromDiagnostics, fromSerializer } from "@/lib/paper/problems";
import type { ResolveImages } from "./images";
import { PreviewCache } from "./template-preview";

export interface PaperPreviewDeps {
  data: Pick<DataLayer, "papers">;
  compile: Pick<CompileService, "compile">;
  images: ResolveImages;
  cache: PreviewCache<{ pdf: Buffer; problems: Problem[] }>;
}

export type PaperPreviewOutcome =
  | { ok: true; pdf: Buffer; problems: Problem[]; cached: boolean }
  | { ok: false; status: 409 | 422 | 429; message: string; problems: Problem[] };

/** Printed in place of a question the engine could not typeset. */
const LEFT_OUT: Doc = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "(This question could not be typeset. Fix it in the editor.)",
          marks: [{ type: "italic" }],
        },
      ],
    },
  ],
};

export function paperPreviewCache() {
  return new PreviewCache<{ pdf: Buffer; problems: Problem[] }>(40);
}

export type PreviewKind = "PAPER" | "KEY";

/** The key fields of stored slots; the key serializer validates them. */
export function keySlots(
  slots: { groupKey: string; position: number; answerKey: unknown; keyCriteria: unknown }[],
): KeySlot[] {
  return slots.map((x) => ({
    groupKey: x.groupKey,
    position: x.position,
    answerKey: (x.answerKey ?? null) as KeySlot["answerKey"],
    keyCriteria: (x.keyCriteria ?? []) as KeySlot["keyCriteria"],
  }));
}

/** Throws NotFoundError for a paper that is not the actor's. */
export async function paperPreview(
  deps: PaperPreviewDeps,
  actor: Actor,
  paperId: string,
  kind: PreviewKind = "PAPER",
): Promise<PaperPreviewOutcome> {
  const paper = await deps.data.papers.getWithSlots(actor, paperId);
  const numbers = questionNumbers(paper.snapshot.structure);
  const instructions = paper.instructionsOverride as string[] | null;
  const input = paperInput({
    ...paper,
    instructionsOverride: instructions,
    snapshot: paper.snapshot,
  });
  const keys = keySlots(paper.slots);
  const make = (paperIn: PaperInput, keysIn: KeySlot[]): SerializeResult =>
    kind === "KEY" ? serializeKey(paperIn, keysIn) : serializePaper(paperIn);
  const ser = make(input, keys);
  const supersedeKey = `paper-preview:${kind}:${actor.userId}:${paperId}`;
  const record = (
    status: "SUCCEEDED" | "FAILED",
    durationMs: number | null,
    summary: string | null,
  ) =>
    deps.data.papers.recordCompile(actor, paperId, {
      kind,
      status,
      durationMs,
      errorSummary: summary,
    });

  if (!ser.ok) {
    const problems = fromSerializer(ser.issues, numbers);
    await record(
      "FAILED",
      null,
      `text@${[...new Set(ser.issues.map((i) => i.slotId ?? "-"))].join(",")}`.slice(0, 500),
    );
    return { ok: false, status: 422, message: "Some questions need fixing first.", problems };
  }
  const assets = await deps.images(ser.assets, actor.userId);
  if (typeof assets === "string") {
    await record("FAILED", null, "missing-picture");
    return {
      ok: false,
      status: 422,
      message: assets,
      problems: [{ level: "error", message: assets }],
    };
  }

  const key = createHash("sha256").update(ser.tex).digest("hex");
  const hit = deps.cache.get(`${actor.userId}:${key}`);
  if (hit) return { ok: true, ...hit, cached: true };

  try {
    const res = await deps.compile.compile({
      userId: actor.userId,
      tex: ser.tex,
      assets,
      slotRanges: ser.slotRanges,
      supersedeKey,
    });
    const problems = fromDiagnostics(res.diagnostics, numbers);
    await record(res.ok ? "SUCCEEDED" : "FAILED", res.durationMs, errorSummary(res.diagnostics));
    // Questions the engine refused are left out once, so the rest of the paper still shows.
    const failed = new Set(
      res.diagnostics
        .filter((d) => d.severity === "error" && d.slotId)
        .map((d) => d.slotId as string),
    );
    const onlySlotErrors = res.diagnostics.every((d) => d.severity !== "error" || d.slotId);
    if (!res.ok && !res.timedOut && failed.size > 0 && onlySlotErrors) {
      const left = (x: { groupKey: string; position: number }) =>
        failed.has(`${x.groupKey}.${x.position}`);
      // In a key only the answer is left out: the question's correct choice still prints.
      const without =
        kind === "KEY"
          ? make(
              input,
              keys.map((k) => (left(k) ? { ...k, answerKey: LEFT_OUT, keyCriteria: [] } : k)),
            )
          : make(
              {
                ...input,
                slots: input.slots.map((x) => (left(x) ? { ...x, content: LEFT_OUT } : x)),
              },
              keys,
            );
      if (without.ok) {
        const again = await deps.compile.compile({
          userId: actor.userId,
          tex: without.tex,
          assets,
          slotRanges: without.slotRanges,
          supersedeKey,
        });
        if (again.ok && again.pdf) {
          deps.cache.set(`${actor.userId}:${key}`, { pdf: again.pdf, problems });
          return { ok: true, pdf: again.pdf, problems, cached: false };
        }
      }
    }
    if (!res.ok || !res.pdf) {
      return {
        ok: false,
        status: 422,
        message: res.timedOut
          ? "The preview took too long to make. Try again."
          : kind === "KEY"
            ? "The answer key could not be made. The answers marked below need a change."
            : "The paper could not be made. The questions marked below need a change.",
        problems,
      };
    }
    deps.cache.set(`${actor.userId}:${key}`, { pdf: res.pdf, problems });
    return { ok: true, pdf: res.pdf, problems, cached: false };
  } catch (e) {
    if (e instanceof CompileRejected) {
      if (e.reason === "superseded")
        return { ok: false, status: 409, message: e.message, problems: [] };
      if (e.reason === "rate-limit")
        return { ok: false, status: 429, message: e.message, problems: [] };
    }
    throw e;
  }
}
