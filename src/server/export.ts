// "Export" (SPEC §5, D32, D34): compiles the paper and its key, writes
// exports/<Program>/<CourseCode>/<YYYY-MM-DD> <title>/ in the data folder
// and returns the same folder as a zip. Blocked while the paper has errors;
// empty questions and missing answers are warnings the user confirms.
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { type Zippable, zipSync } from "fflate";
import type { Actor, DataLayer } from "@/lib/data";
import { bundleSegments, compactForExport, readme } from "@/lib/export/bundle";
import { CompileRejected, type CompileService } from "@/lib/latex/compile";
import { serializeKey } from "@/lib/latex/key";
import { serializePaper } from "@/lib/latex/serialize";
import { paperInput } from "@/lib/paper/assemble";
import { choiceAnswers, criteriaNote, hasContent } from "@/lib/paper/key";
import { questionNumbers } from "@/lib/paper/numbering";
import { type Problem, errorSummary, fromDiagnostics, fromSerializer } from "@/lib/paper/problems";
import { PROGRAM_LABEL } from "@/lib/templates/labels";
import type { ResolveImages } from "./images";
import { keySlots } from "./paper-preview";

/** Names the paper a folder belongs to; hidden, and left out of the zip. */
const OWNER_FILE = ".draftex-paper";

export interface ExportDeps {
  data: Pick<DataLayer, "papers">;
  compile: Pick<CompileService, "compile">;
  images: ResolveImages;
  /** <data folder>/exports */
  exportsDir: string;
  now?: () => Date;
}

export type ExportOutcome =
  | { ok: true; zip: Uint8Array; fileName: string; folder: string; warnings: Problem[] }
  | {
      ok: false;
      /** 409: warnings to confirm with "Export anyway". */
      status: 409 | 422 | 429;
      message: string;
      problems: Problem[];
    };

/** What the export would leave out or print without an answer. */
export function exportWarnings(
  paper: Awaited<ReturnType<DataLayer["papers"]["getWithSlots"]>>,
): Problem[] {
  const numbers = questionNumbers(paper.snapshot.structure);
  const out: Problem[] = [];
  const bySlot = new Map(paper.slots.map((s) => [`${s.groupKey}.${s.position}`, s]));
  let empty = 0;
  for (const g of numbers) {
    g.slotLabels.forEach((label, i) => {
      const slotId = `${g.key}.${i + 1}`;
      const s = bySlot.get(slotId);
      if (!s || s.content.content.length === 0) {
        empty++;
        return;
      }
      const answer = s.answerKey as Parameters<typeof hasContent>[0];
      const criteria = (s.keyCriteria ?? []) as { text: string; marks: number }[];
      const letters = choiceAnswers(s.content);
      if (letters.some((l) => l === null)) {
        out.push({ level: "note", slotId, message: `${label} has no correct option ticked.` });
      } else if (letters.length === 0 && !hasContent(answer) && criteria.length === 0) {
        out.push({ level: "note", slotId, message: `${label} has no answer in the key.` });
      }
      const note = criteriaNote(criteria, s.marks);
      if (note) out.push({ level: "note", slotId, message: `${label}: ${note}` });
    });
  }
  if (empty > 0) {
    out.unshift({
      level: "note",
      message: `${empty} empty question${empty === 1 ? " is" : "s are"} left out; the rest are numbered without gaps.`,
    });
  }
  return out;
}

/** Replaces `dir` with the given files, so a half-written folder is never left behind. */
function writeFolder(dir: string, files: Record<string, Uint8Array | string>): void {
  const parent = path.dirname(dir);
  fs.mkdirSync(parent, { recursive: true });
  const tmp = path.join(parent, `.export-${randomUUID()}`);
  try {
    for (const [rel, body] of Object.entries(files)) {
      const file = path.join(tmp, ...rel.split("/"));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, body);
    }
    // Windows cannot rename over an existing folder.
    fs.rmSync(dir, { recursive: true, force: true });
    fs.renameSync(tmp, dir);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Throws NotFoundError for a paper that is not the actor's. */
export async function exportPaper(
  deps: ExportDeps,
  actor: Actor,
  paperId: string,
  opts: { confirmed: boolean },
): Promise<ExportOutcome> {
  const paper = await deps.data.papers.getWithSlots(actor, paperId);
  const numbers = questionNumbers(paper.snapshot.structure);
  const warnings = exportWarnings(paper);
  const full = paperInput({
    ...paper,
    instructionsOverride: paper.instructionsOverride as string[] | null,
  });
  const c = compactForExport(full, keySlots(paper.slots));
  if (c.paper.slots.length === 0) {
    return {
      ok: false,
      status: 422,
      message: "The paper has no questions yet, so there is nothing to export.",
      problems: [],
    };
  }
  // Messages use the editor's numbers, so serialize the uncompacted paper first.
  const check = [
    serializePaper({ ...full, emptySlots: "OMIT" }),
    serializeKey(full, keySlots(paper.slots)),
  ];
  const issues = check.flatMap((r) => (r.ok ? [] : r.issues));
  if (issues.length) {
    return {
      ok: false,
      status: 422,
      message: "Some questions or answers need fixing before the paper can be exported.",
      problems: fromSerializer(issues, numbers),
    };
  }
  if (warnings.length && !opts.confirmed) {
    return { ok: false, status: 409, message: "Check these before exporting.", problems: warnings };
  }

  const docs = [
    { kind: "PAPER" as const, name: "paper", ser: serializePaper(c.paper) },
    { kind: "KEY" as const, name: "key", ser: serializeKey(c.paper, c.keys) },
  ];
  const files: Record<string, Uint8Array | string> = {};
  const problems: Problem[] = [];
  for (const d of docs) {
    // Compacted output of a paper that serialized cleanly above.
    /* v8 ignore next */
    if (!d.ser.ok) throw new Error("Export: compacted paper did not serialize.");
    const assets = await deps.images(d.ser.assets, actor.userId);
    if (typeof assets === "string") {
      return { ok: false, status: 422, message: assets, problems: [] };
    }
    let res;
    try {
      res = await deps.compile.compile({
        userId: actor.userId,
        tex: d.ser.tex,
        assets,
        slotRanges: d.ser.slotRanges,
        supersedeKey: `export:${d.kind}:${actor.userId}:${paperId}`,
      });
    } catch (e) {
      if (e instanceof CompileRejected && e.reason === "rate-limit") {
        return { ok: false, status: 429, message: e.message, problems: [] };
      }
      throw e;
    }
    await deps.data.papers.recordCompile(actor, paperId, {
      kind: d.kind,
      status: res.ok ? "SUCCEEDED" : "FAILED",
      durationMs: res.durationMs,
      errorSummary: errorSummary(res.diagnostics),
    });
    // Line numbers point into the compacted file: name questions by the editor's numbers.
    const found = fromDiagnostics(
      res.diagnostics.map((x) => (x.slotId ? { ...x, slotId: c.origin.get(x.slotId) } : x)),
      numbers,
    );
    if (!res.ok || !res.pdf) {
      // The errors are why it failed; layout notes would bury them.
      const errors = found.filter((p) => p.level === "error");
      return {
        ok: false,
        status: 422,
        message: res.timedOut
          ? "Making the PDFs took too long. Try again."
          : d.kind === "KEY"
            ? "The answer key could not be made. Open the preview's Answer key view to see why."
            : "The paper could not be made. Open the preview to see which question needs a change.",
        problems: errors.length ? errors : found,
      };
    }
    problems.push(...found);
    files[`${d.name}.tex`] = d.ser.tex;
    files[`${d.name}.pdf`] = new Uint8Array(res.pdf);
    for (const a of assets) files[a.name] = new Uint8Array(fs.readFileSync(a.sourcePath));
  }
  files["README.txt"] = readme({ title: paper.title, withKey: true, leftOut: c.leftOut });

  const segments = bundleSegments({
    programLabel: PROGRAM_LABEL[paper.program],
    courseCode: paper.courseCode,
    title: paper.title,
    date: (deps.now ?? (() => new Date()))(),
  });
  // This paper's folder for the day is replaced (D32); another paper with the same
  // title gets a folder of its own instead of overwriting it.
  const base = segments[2];
  for (let n = 2; ; n++) {
    const owner = path.join(deps.exportsDir, ...segments, OWNER_FILE);
    if (!fs.existsSync(owner) || fs.readFileSync(owner, "utf8") === paperId) break;
    segments[2] = `${base} (${n})`;
  }
  files[OWNER_FILE] = paperId;
  writeFolder(path.join(deps.exportsDir, ...segments), files);

  const top = segments[2];
  const zippable: Zippable = {};
  for (const [rel, body] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    if (rel === OWNER_FILE) continue;
    const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
    // PDFs and pictures are compressed already.
    zippable[`${top}/${rel}`] = [bytes, { level: /\.(pdf|png|jpg)$/.test(rel) ? 0 : 6 }];
  }
  return {
    ok: true,
    zip: zipSync(zippable),
    fileName: `${top}.zip`,
    folder: path.join("exports", ...segments),
    warnings: [...warnings, ...problems],
  };
}
