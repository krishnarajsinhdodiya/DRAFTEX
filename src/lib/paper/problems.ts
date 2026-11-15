// Compile and serializer problems in plain English, placed on the question
// that caused them (SPEC §8 "errors map to the slot"). Pure and client-safe.
// Messages name the question ("Q.2(3)"), never quote its text (SPEC §11.7).
import type { Diagnostic } from "@/lib/latex/log";
import type { SerializeIssue } from "@/lib/latex/serialize";
import type { GroupNumbers } from "./numbering";

export interface Problem {
  /** "error" stops the PDF; "note" is printed anyway (memory.md, runtime warnings). */
  level: "error" | "note";
  message: string;
  /** "<groupKey>.<position>" when it belongs to one question. */
  slotId?: string;
  /** The engine's own words, behind a disclosure. */
  raw?: string;
}

const EXPLAIN: [RegExp, string, string][] = [
  // D106: raised by \dxMerged (src/lib/latex/table.ts).
  [
    /DXMERGEDCELL/,
    "merged-cell",
    "has a merged table cell whose text needs more lines than the rows it spans; shorten the text, widen its column or merge more rows",
  ],
  [
    /DXNARROWTABLE/,
    "narrow-table",
    "has a table column too narrow for this page; widen the table or use fewer columns",
  ],
  [/Undefined control sequence/i, "unknown-command", "uses a command LaTeX does not know"],
  [/Missing \$ inserted/i, "maths-outside", "has maths outside an equation"],
  [
    /Extra \}, or forgotten \$|Missing \} inserted|Missing \{ inserted|Extra \}/i,
    "brace",
    "has an unmatched brace",
  ],
  [
    /Paragraph ended before|Runaway argument|File ended while scanning/i,
    "unfinished",
    "has an unfinished command (a brace may be missing)",
  ],
  [
    /Missing \\right|Extra \\right|Missing \\left|Extra \\left/i,
    "left-right",
    "has a \\left without its \\right (or the other way round)",
  ],
  [/Misplaced alignment tab character &/i, "stray-ampersand", "has an & outside a table"],
  [
    /Double (?:sub|super)script/i,
    "double-script",
    "has two subscripts or superscripts in a row; add braces",
  ],
  [
    /File .* not found|Unable to load picture|cannot open image/i,
    "missing-picture",
    "uses a picture that is missing; insert it again",
  ],
  [/Overfull \\hbox/i, "too-wide", "has a line that is too wide for the page"],
  [/Overfull \\vbox/i, "too-tall", "is too tall for the page"],
  [/Underfull/i, "loose", "has a loosely spaced line"],
  [/Missing character/i, "missing-char", "uses a character the paper's font cannot print"],
];

function match(message: string): [string, string] {
  const hit = EXPLAIN.find(([re]) => re.test(message));
  return hit ? [hit[1], hit[2]] : ["other", "could not be typeset"];
}

export function explain(message: string): string {
  return match(message)[1];
}

/** "g2.3" → "Q.2(3)"; unknown ids fall back to "a question". */
export function slotLabel(numbers: GroupNumbers[], slotId: string): string {
  const dot = slotId.lastIndexOf(".");
  const group = numbers.find((n) => n.key === slotId.slice(0, dot));
  return group?.slotLabels[Number(slotId.slice(dot + 1)) - 1] ?? "A question";
}

/** Gate 3 tolerance applies at run time too: overfull boxes up to 1 pt are not worth a note. */
function worthTelling(d: Diagnostic): boolean {
  return !(d.kind === "overfull" && (d.overfullPt ?? Infinity) <= 1);
}

export function fromSerializer(issues: SerializeIssue[], numbers: GroupNumbers[]): Problem[] {
  return issues.map((i) =>
    i.slotId
      ? {
          level: "error",
          slotId: i.slotId,
          message: `${slotLabel(numbers, i.slotId)}: ${i.message}`,
        }
      : { level: "error", message: i.message },
  );
}

export function fromDiagnostics(diags: Diagnostic[], numbers: GroupNumbers[]): Problem[] {
  const out: Problem[] = [];
  const seen = new Set<string>();
  for (const d of diags.filter(worthTelling)) {
    const level = d.severity === "error" ? "error" : "note";
    const what = d.slotId ? slotLabel(numbers, d.slotId) : "The paper";
    const message = `${what} ${explain(d.message)}.`;
    const key = `${level}|${d.slotId ?? ""}|${message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ level, message, raw: d.message, ...(d.slotId ? { slotId: d.slotId } : {}) });
  }
  return out;
}

/**
 * What the compile history keeps: kinds, slots and line numbers, never text
 * (SPEC §11.7). At most 500 characters.
 */
export function errorSummary(diags: Diagnostic[]): string | null {
  const errors = diags.filter((d) => d.severity === "error");
  if (errors.length === 0) return null;
  return errors
    .map(
      (d) => `${match(d.message)[0]}${d.slotId ? `@${d.slotId}` : ""}${d.line ? `:${d.line}` : ""}`,
    )
    .join(", ")
    .slice(0, 500);
}
