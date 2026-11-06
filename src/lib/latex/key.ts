// Answer key JSON → LaTeX (SPEC §2 "Answer keys", D33). Pure and
// deterministic, like the paper serializer, whose escaping and sanitiser it
// shares. House style of the hand-written keys: an `article` document with a
// running head, "MARKING SCHEME / MODEL ANSWERS", objective groups in one
// No. | Answer | Marks table, other questions as model answer plus split-up
// marks. Question text is not reprinted.
import { z } from "zod";
import { type KeyCriterion, choiceBlocks, criteriaTotal, keyCriteriaSchema } from "../paper/key.ts";
import { type GroupNumbers, questionNumbers } from "../paper/numbering.ts";
import {
  type Doc,
  type Group,
  type Paper,
  type Slot,
  docSchema,
  paperSchema,
} from "../paper/schema.ts";
import { BLOOM_LABEL, type Bloom, bloomPrinted } from "../paper/bloom.ts";
import type { SlotRange } from "./compile.ts";
import {
  type BlockContext,
  Issues,
  type SerializeResult,
  Writer,
  blocks,
  fill,
  formatMarks,
  inline,
  subPartTags,
  text,
} from "./serialize.ts";

export const KEY_TITLE = "MARKING SCHEME / MODEL ANSWERS";

export const keySlotSchema = z.object({
  groupKey: z.string(),
  position: z.number().int().min(1).max(100),
  answerKey: docSchema.nullable(),
  keyCriteria: keyCriteriaSchema,
});
export type KeySlot = z.input<typeof keySlotSchema>;

/** The running head on the right falls back to the code alone when the title is long. */
const RIGHT_HEAD_MAX = 45;

/** "(Any 4 × 5 = 20 Marks)", "(10 × 1 = 10 Marks)", "(10 Marks)" */
export function groupMarksText(g: Pick<Group, "slots" | "attempt" | "marksEach">): string {
  const total = formatMarks(g.attempt * g.marksEach);
  if (g.slots === 1 && g.attempt === 1) return `(${total} Marks)`;
  const any = g.attempt < g.slots ? "Any " : "";
  return `(${any}${g.attempt} $\\times$ ${formatMarks(g.marksEach)} = ${total} Marks)`;
}

const marksWord = (n: number) => `${formatMarks(n)} ${n === 1 ? "Mark" : "Marks"}`;

/** "B. text" for each choices block with a correct answer; "" when none is set. */
function correctChoices(content: Doc, issues: Issues): string {
  const all = choiceBlocks(content.content);
  const picked = all.map((c, i) => {
    const n = c.attrs?.correct;
    const choice = n === undefined ? undefined : c.content[n];
    if (!choice || n === undefined) return null;
    const letter = String.fromCharCode(65 + n);
    const lead = all.length > 1 ? `(${String.fromCharCode(97 + i)}) ` : "";
    return `${lead}\\textbf{${letter}.} ${inline(choice.content, issues)}`;
  });
  return picked.filter((x): x is string => x !== null).join("; ");
}

function preamble(w: Writer, left: string, right: string): void {
  w.line("\\RequirePackage{fix-cm}");
  w.line("\\documentclass[12pt, a4paper]{article}");
  w.line("\\usepackage[left=0.8in, right=0.8in, top=1in, bottom=1in, headheight=15pt]{geometry}");
  for (const p of [
    "fancyhdr",
    "graphicx",
    "amsmath",
    "amssymb",
    "siunitx",
    "booktabs",
    "tabularx",
    "enumitem",
  ]) {
    w.line(`\\usepackage{${p}}`);
  }
  w.line();
  w.line("\\pagestyle{fancy}");
  w.line("\\fancyhf{}");
  w.line(`\\fancyhead[L]{\\small \\textbf{${left}}}`);
  w.line(`\\fancyhead[R]{\\small \\textbf{${right}}}`);
  w.line("\\fancyfoot[C]{\\thepage}");
  w.line("\\renewcommand{\\headrulewidth}{0.5pt}");
  w.line("\\setlength{\\parindent}{0pt}");
  w.line("\\newcolumntype{Y}{>{\\raggedright\\arraybackslash}X}");
  w.line("\\newcolumntype{Z}{>{\\centering\\arraybackslash}p{2cm}}");
  w.line(
    "\\newcommand{\\dxKeyPart}[1]{\\par\\vspace{0.3in}\\begin{center}\\large\\textbf{#1}\\end{center}\\hrule height 1pt\\vspace{0.1in}}",
  );
  w.line("%% Right-aligned marks; move to their own line when the heading is long.");
  w.line(
    "\\newcommand{\\dxKeyHead}[2]{\\par\\vspace{0.2in}\\noindent\\textbf{#1}\\nobreak\\hfil\\penalty50\\hskip1em\\hbox{}\\nobreak\\hfil\\textbf{#2}{\\parfillskip=0pt\\finalhyphendemerits=0\\par}\\nobreak\\vspace{0.08in}\\nobreak}",
  );
  w.line("\\newcommand{\\dxBlank}[1][2.5cm]{\\rule{#1}{0.4pt}}");
}

/** D68: "Q.2 (a)", then "(Bloom: Apply) [BP604T.01]" when Bloom is shown. */
function keyLabel(label: string, slot: Slot, group: Group, paper: Paper): string {
  const style = paper.template.style;
  if (!style.showBloom) return label;
  const tags = (t: { bloom?: Bloom | undefined; co?: string | undefined }) => {
    const bits: string[] = [];
    if (t.bloom) bits.push(bloomPrinted(t.bloom));
    if (group.showCoTag === "SLOT" && t.co) bits.push(`[${t.co}]`);
    return bits.join(" ");
  };
  // Sub-parts with their own tags (D67) are listed as the paper prints them.
  const parts = subPartTags(slot, group, style);
  const tail = parts
    ? parts.map((t, i) => `(${String.fromCharCode(97 + i)}) ${tags(t)}`.trim()).join("; ")
    : tags({ bloom: slot.bloomLevel ?? undefined, co: slot.coTag ?? undefined });
  return tail ? `${label} ${tail}` : label;
}

function criteriaTable(criteria: KeyCriterion[], issues: Issues): string[] {
  return [
    "\\par\\smallskip",
    "\\begin{tabularx}{\\linewidth}{@{} Y Z @{}}",
    "  \\toprule",
    "  \\textbf{Criteria} & \\textbf{Marks} \\\\ \\midrule",
    ...criteria.map((c) => `  ${text(c.text, issues)} & ${formatMarks(c.marks)} \\\\`),
    "  \\midrule",
    `  \\textbf{Total} & \\textbf{${formatMarks(criteriaTotal(criteria))}} \\\\ \\bottomrule`,
    "\\end{tabularx}",
  ];
}

export function serializeKey(paperInput: unknown, keyInput: unknown): SerializeResult {
  const paper = paperSchema.safeParse(paperInput);
  const keys = z.array(keySlotSchema).safeParse(keyInput);
  if (!paper.success || !keys.success) {
    const issues = [...(paper.error?.issues ?? []), ...(keys.error?.issues ?? [])];
    return {
      ok: false,
      issues: issues.map((i) => ({
        message: `Invalid answer key data at ${i.path.join(".") || "(root)"}: ${i.message}`,
      })),
    };
  }
  return serializeParsed(paper.data, keys.data);
}

function serializeParsed(paper: Paper, keys: z.output<typeof keySlotSchema>[]): SerializeResult {
  const { structure, header } = paper.template;
  const meta = paper.meta;
  const issues = new Issues();
  const assets = new Set<string>();
  const w = new Writer();
  const slotRanges: SlotRange[] = [];
  const id = (g: string, p: number) => `${g}.${p}`;
  const slots = new Map<string, Slot>(paper.slots.map((s) => [id(s.groupKey, s.position), s]));
  const keyOf = new Map(keys.map((k) => [id(k.groupKey, k.position), k]));
  const numbers = new Map(questionNumbers(structure).map((n) => [n.key, n]));

  const left = fill((header.lines[0] as { text: string }).text, meta, issues);
  const code = text(meta.courseCode, issues);
  const title = text(meta.courseTitle, issues);
  const right =
    code && title && meta.courseCode.length + meta.courseTitle.length + 2 <= RIGHT_HEAD_MAX
      ? `${code}: ${title}`
      : code || title;

  w.line("%% Answer key generated by DRAFTEX. Edit it in the app, not this file.");
  preamble(w, left, right);
  w.line();
  w.line("\\begin{document}");
  w.line("\\begin{center}");
  w.line(`{\\Large \\textbf{${KEY_TITLE}}\\par}`);
  w.line("\\vspace{5pt}");
  const course = [meta.courseTitle, meta.courseCode ? `[${meta.courseCode}]` : ""]
    .filter(Boolean)
    .join(" ");
  if (course) w.line(`\\textbf{${text(course, issues)}}\\par`);
  const sub = [meta.examTitle, meta.programLine].filter(Boolean).join(" | ");
  if (sub) w.line(`${text(sub, issues)}\\par`);
  const facts = [
    meta.date && `Date: ${meta.date}`,
    meta.maxMarks && `Max. Marks: ${meta.maxMarks}`,
  ].filter(Boolean);
  if (facts.length) w.line(`${text(facts.join(" | "), issues)}\\par`);
  w.line("\\end{center}");

  const filled = (s: Slot | undefined): s is Slot => !!s && s.content.content.length > 0;

  for (const part of structure.parts) {
    const used = part.groups.some((g) =>
      Array.from({ length: g.slots }, (_, i) => slots.get(id(g.key, i + 1))).some(filled),
    );
    if (!used) continue;
    if (part.title) w.line(`\\dxKeyPart{${text(part.title, issues)}}`);
    for (const group of part.groups) {
      const num = numbers.get(group.key) as GroupNumbers;
      const present = Array.from({ length: group.slots }, (_, i) => i + 1).filter((pos) =>
        filled(slots.get(id(group.key, pos))),
      );
      if (present.length === 0) continue;
      const ownNumbers = group.numbering === "QUESTION";
      w.line(`%% DX-GROUP id=${group.key} type=${group.type}`);
      if (!ownNumbers) {
        w.line(
          `\\dxKeyHead{${text(`${num.label} ${group.heading}`, issues)}}{${groupMarksText(group)}}`,
        );
      }
      const ctx: BlockContext = {
        issues,
        assets,
        defaultColumns: 1,
        beforeChoices: 0,
        keyMode: true,
      };
      if (group.type === "OBJECTIVE" && !ownNumbers) {
        // D68: with Bloom shown, objective answers get a Level column.
        const level = paper.template.style.showBloom;
        w.line(`\\begin{tabularx}{\\linewidth}{@{} l Y ${level ? "l " : ""}Z @{}}`);
        w.line("  \\toprule");
        w.line(
          `  \\textbf{No.} & \\textbf{Answer} & ${level ? "\\textbf{Level} & " : ""}\\textbf{Marks} \\\\ \\midrule`,
        );
        for (const pos of present) {
          const slotId = id(group.key, pos);
          const slot = slots.get(slotId) as Slot;
          const key = keyOf.get(slotId);
          issues.slotId = slotId;
          ctx.partsSoFar = 0;
          const start = w.next;
          const choice = correctChoices(slot.content, issues);
          const note = key?.answerKey?.content.length ? blocks(key.answerKey.content, ctx) : "";
          const answer =
            [choice, note].filter(Boolean).join(choice && note ? "\\par " : "") ||
            "\\textit{No answer written.}";
          const last = pos === present.at(-1);
          w.line(`  %% DX-SLOT ${slotId}`);
          w.line(
            `  ${text(num.printed[pos - 1] as string, issues)} & ${answer.split("\n").join("\n  ")} & ${level ? `${slot.bloomLevel ? BLOOM_LABEL[slot.bloomLevel] : "--"} & ` : ""}${formatMarks(slot.marks ?? group.marksEach)} \\\\${last ? " \\bottomrule" : ""}`,
          );
          slotRanges.push({ slotId, startLine: start, endLine: w.next - 1 });
          issues.slotId = undefined;
        }
        w.line("\\end{tabularx}");
        continue;
      }
      for (const pos of present) {
        const slotId = id(group.key, pos);
        const slot = slots.get(slotId) as Slot;
        const key = keyOf.get(slotId);
        issues.slotId = slotId;
        ctx.partsSoFar = 0;
        const start = w.next;
        w.line(`%% DX-SLOT ${slotId}`);
        w.line(
          `\\dxKeyHead{${text(keyLabel(num.slotLabels[pos - 1] as string, slot, group, paper), issues)}}{(${marksWord(slot.marks ?? group.marksEach)})}`,
        );
        const choice = correctChoices(slot.content, issues);
        if (choice) w.line(`Answer: ${choice}\\par`);
        if (key?.answerKey?.content.length) w.line(`${blocks(key.answerKey.content, ctx)}\\par`);
        else if (!choice) w.line("\\textit{No model answer written.}\\par");
        if (key?.keyCriteria.length)
          criteriaTable(key.keyCriteria, issues).forEach((l) => w.line(l));
        slotRanges.push({ slotId, startLine: start, endLine: w.next - 1 });
        issues.slotId = undefined;
      }
    }
  }
  if (slotRanges.length === 0) issues.add("The paper has no questions yet, so there is no key.");
  w.line("\\end{document}");

  if (issues.list.length) return { ok: false, issues: issues.list };
  return { ok: true, tex: w.toString(), slotRanges, assets: [...assets].sort() };
}
