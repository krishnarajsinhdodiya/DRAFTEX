// "View LaTeX" (D104): the LaTeX DRAFTEX writes for a saved paper or its
// answer key, whole or for one question, to read and copy. Nothing here is
// sent to the engine or stored; editing generated LaTeX is not offered,
// because a hand-edited copy would bypass the sanitiser and stop following
// later changes to marks, CO, Bloom, numbering or the template.
import type { Actor, DataLayer } from "@/lib/data";
import { serializeKey } from "@/lib/latex/key";
import { serializePaper } from "@/lib/latex/serialize";
import { paperInput } from "@/lib/paper/assemble";
import { questionNumbers } from "@/lib/paper/numbering";
import { type Problem, fromSerializer } from "@/lib/paper/problems";
import { type PreviewKind, keySlots } from "./paper-preview";

export type PaperLatexOutcome =
  | { ok: true; tex: string }
  | { ok: false; status: 404 | 422; message: string; problems: Problem[] };

/** Slot ids look like "g2.3": a group key, a dot, a position. */
const SLOT_ID_RE = /^[A-Za-z0-9_-]{1,32}\.\d{1,3}$/;

/** Throws NotFoundError for a paper that is not the actor's (or is in Trash). */
export async function paperLatex(
  data: Pick<DataLayer, "papers">,
  actor: Actor,
  paperId: string,
  kind: PreviewKind,
  slotId?: string,
): Promise<PaperLatexOutcome> {
  const paper = await data.papers.getWithSlots(actor, paperId);
  const input = paperInput({
    ...paper,
    instructionsOverride: paper.instructionsOverride as string[] | null,
    snapshot: paper.snapshot,
  });
  const ser = kind === "KEY" ? serializeKey(input, keySlots(paper.slots)) : serializePaper(input);
  if (!ser.ok) {
    const problems = fromSerializer(ser.issues, questionNumbers(paper.snapshot.structure));
    return { ok: false, status: 422, message: "Some questions need fixing first.", problems };
  }
  if (slotId === undefined) return { ok: true, tex: ser.tex };
  const range = SLOT_ID_RE.test(slotId)
    ? ser.slotRanges.find((r) => r.slotId === slotId)
    : undefined;
  if (!range) {
    return {
      ok: false,
      status: 404,
      message:
        kind === "KEY"
          ? "This question has nothing in the answer key yet."
          : "This question is not on the paper yet.",
      problems: [],
    };
  }
  const lines = ser.tex.split("\n").slice(range.startLine - 1, range.endLine);
  return { ok: true, tex: `${lines.join("\n")}\n` };
}
