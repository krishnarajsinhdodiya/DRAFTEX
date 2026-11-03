// Paper JSON → LaTeX. Pure and deterministic. Reproduces the reference
// template's structure: one `questions` environment per paper, \dxGroupHead
// per group and \dxQOffset so numbering restarts in each group.
import {
  docSchema,
  paperSchema,
  type BlockNode,
  type ChoicesNode,
  type Group,
  type Header,
  type InlineNode,
  type LeafBlockNode,
  type Meta,
  type Paper,
  type ParagraphNode,
  type Slot,
  type Style,
  type Structure,
  type TableNode,
} from "../paper/schema.ts";
import type { SlotRange } from "./compile.ts";
import { type GroupNumbers, questionNumbers } from "../paper/numbering.ts";
import { describeChar, escapeText, mapMathUnicode, type QuoteState } from "./escape.ts";
import { sanitizeLatex, type SanitizeMode } from "./sanitize.ts";

export interface SerializeIssue {
  message: string;
  slotId?: string;
}

export interface SerializeOutput {
  tex: string;
  slotRanges: SlotRange[];
  /** Asset file names used, e.g. assets/<sha>.png */
  assets: string[];
}

export type SerializeResult =
  ({ ok: true } & SerializeOutput) | { ok: false; issues: SerializeIssue[] };

class Issues {
  readonly list: SerializeIssue[] = [];
  slotId: string | undefined;
  add(message: string): void {
    this.list.push(this.slotId ? { message, slotId: this.slotId } : { message });
  }
}

/** 7.5 → "7.5", 4 → "4" */
export function formatMarks(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

export function marksLabel(style: Structure["marksStyle"], marks: number): string {
  const m = formatMarks(marks);
  if (style === "PARENS") return `(${m})`;
  if (style === "BRACKETS") return `[${m}]`;
  return `Marks: ${m}`;
}

/** Lengths keep three decimals: hand-written papers use values like 0.125in. */
const inch = (n: number) => `${Number(n.toFixed(3))}in`;

class Writer {
  private readonly lines: string[] = [];
  line(s = ""): void {
    this.lines.push(...s.split("\n"));
  }
  /** 1-based number of the next line to be written. */
  get next(): number {
    return this.lines.length + 1;
  }
  toString(): string {
    return `${this.lines.join("\n")}\n`;
  }
}

// ---------- inline ----------

function text(s: string, issues: Issues, quotes?: QuoteState): string {
  const r = escapeText(s, quotes);
  if (r.ok) return r.value;
  const chars = [...new Set(r.bad.map((b) => describeChar(b.char)))].join(", ");
  issues.add(`This text contains characters that cannot be printed: ${chars}.`);
  return "";
}

function snippet(src: string, mode: SanitizeMode, issues: Issues, what: string): string {
  const mapped = mode === "math" ? mapMathUnicode(src) : src;
  if (mapped.trim() === "") {
    issues.add(`The ${what} is empty.`);
    return "";
  }
  const r = sanitizeLatex(mapped, mode);
  if (r.ok) return r.value.trim();
  for (const i of r.issues) issues.add(`${what[0]?.toUpperCase()}${what.slice(1)}: ${i.message}`);
  return "";
}

/**
 * A line break can only end a line that has something on it: leading,
 * repeated and trailing breaks are dropped ("There's no line here to end").
 */
function usefulBreaks(nodes: InlineNode[]): InlineNode[] {
  const out: InlineNode[] = [];
  for (const n of nodes) {
    if (n.type === "hardBreak" && (out.length === 0 || out.at(-1)?.type === "hardBreak")) continue;
    out.push(n);
  }
  while (out.at(-1)?.type === "hardBreak") out.pop();
  return out;
}

function inline(nodes: InlineNode[] | undefined, issues: Issues): string {
  const quotes: QuoteState = { doubleOpen: false };
  let out = "";
  for (const n of usefulBreaks(nodes ?? [])) {
    switch (n.type) {
      case "text": {
        let t = text(n.text, issues, quotes);
        for (const m of n.marks ?? []) {
          t = {
            bold: `\\textbf{${t}}`,
            italic: `\\textit{${t}}`,
            underline: `\\underline{${t}}`,
            subscript: `\\textsubscript{${t}}`,
            superscript: `\\textsuperscript{${t}}`,
          }[m.type];
        }
        out += t;
        break;
      }
      case "hardBreak":
        out += "\\newline{}";
        break;
      case "mathInline":
        out += `$${snippet(n.attrs.latex, "math", issues, "equation")}$`;
        break;
      case "blank":
        out += n.attrs ? `\\dxBlank[${formatMarks(n.attrs.widthCm)}cm]{}` : "\\dxBlank{}";
        break;
      case "units": {
        const unit = snippet(n.attrs.unit, "math", issues, "unit");
        out += `\\qty{${n.attrs.value.replace(",", ".")}}{${unit}}`;
        break;
      }
    }
  }
  return out;
}

const paragraph = (p: ParagraphNode, issues: Issues) => inline(p.content, issues);

// ---------- blocks ----------

interface BlockContext {
  issues: Issues;
  assets: Set<string>;
  defaultColumns: 1 | 2 | 4;
  beforeChoices: number;
  /** Sub-parts already lettered in this question: a second list carries on (c), (d). */
  partsSoFar?: number;
}

function table(t: TableNode, ctx: BlockContext): string {
  const headerRow = t.attrs?.headerRow ?? true;
  const width = (t.attrs?.widthPercent ?? 80) / 100;
  const cols = Math.max(...t.content.map((r) => r.content.length));
  // A one-column table still fills its width, so it needs a stretchable column.
  const spec = cols === 1 ? "@{}X@{}" : `@{}l${"X".repeat(cols - 1)}@{}`;
  const rows = t.content.map((row) => {
    const cells = row.content.map((c) =>
      (c.content ?? []).map((p) => paragraph(p, ctx.issues)).join(" "),
    );
    while (cells.length < cols) cells.push("");
    return `${cells.join(" & ")}\\\\`;
  });
  const body: string[] = ["\\toprule"];
  rows.forEach((r, i) => {
    body.push(r);
    if (i === 0 && headerRow && rows.length > 1) body.push("\\midrule");
  });
  body.push("\\bottomrule");
  return [
    "\\par\\smallskip",
    `\\begin{tabularx}{${formatMarks(width)}\\linewidth}{${spec}}`,
    ...body.map((b) => `  ${b}`),
    "\\end{tabularx}",
  ].join("\n");
}

function choices(c: ChoicesNode, ctx: BlockContext): string {
  const columns = c.attrs?.columns ?? ctx.defaultColumns;
  const items = c.content.map((ch) => `\\choice ${inline(ch.content, ctx.issues)}`).join(" ");
  const list = `\\begin{choices}\n  ${items}\n\\end{choices}`;
  const lead = `\\vspace{${inch(ctx.beforeChoices)}}`;
  if (columns === 1) return `${lead}\n${list}`;
  return `${lead}\n\\begin{multicols}{${columns}}\n${list}\n\\end{multicols}`;
}

function leaf(b: LeafBlockNode, ctx: BlockContext): string {
  switch (b.type) {
    case "paragraph":
      return paragraph(b, ctx.issues);
    case "mathDisplay":
      return `\\[ ${snippet(b.attrs.latex, "math", ctx.issues, "equation")} \\]`;
    case "image": {
      const name = `assets/${b.attrs.sha256}.${b.attrs.ext}`;
      ctx.assets.add(name);
      // A tall drawing at full width would run off the page; the height cap keeps its shape.
      const opt = b.attrs.widthPercent
        ? `[width=${formatMarks(b.attrs.widthPercent / 100)}\\linewidth,height=0.6\\textheight,keepaspectratio]`
        : "";
      return `\\par\\smallskip\\begin{center}\\includegraphics${opt}{${name}}\\end{center}`;
    }
    case "table":
      return table(b, ctx);
    case "choices":
      return choices(b, ctx);
    case "advancedLatex":
      return snippet(b.attrs.latex, "advanced", ctx.issues, "advanced LaTeX");
    case "orderedList":
    case "bulletList": {
      const env = b.type === "orderedList" ? "enumerate" : "itemize";
      const items = b.content.map(
        (li) => `  \\item ${li.content.map((p) => paragraph(p, ctx.issues)).join("\\par ")}`,
      );
      return `\\begin{${env}}\n${items.join("\n")}\n\\end{${env}}`;
    }
  }
}

/** \question and \part read a leading "[" as their optional points argument. */
const guardBracket = (s: string) => (s.startsWith("[") ? `{}${s}` : s);

/**
 * Joins blocks the way the hand-written papers do: display maths stays inside
 * its paragraph (no \par around \[ \]), other blocks start a new paragraph.
 */
function subParts(b: Extract<BlockNode, { type: "subParts" }>, ctx: BlockContext): string {
  const before = ctx.partsSoFar ?? 0;
  ctx.partsSoFar = before + b.content.length;
  return [
    "\\begin{parts}",
    // exam.cls restarts lettering (and its labels) in every parts list.
    ...(before > 0 ? [`\\setcounter{partno}{${before}}`] : []),
    ...b.content.map((p) => `  \\part ${guardBracket(blocks(p.content, ctx))}`),
    "\\end{parts}",
  ].join("\n");
}

function blocks(nodes: BlockNode[], ctx: BlockContext): string {
  const out: string[] = [];
  let prev: BlockNode["type"] | undefined;
  for (const b of nodes) {
    const s = b.type === "subParts" ? subParts(b, ctx) : leaf(b, ctx);
    if (b.type === "paragraph" && s === "") continue;
    const joinTight =
      prev === undefined ||
      b.type === "mathDisplay" ||
      prev === "mathDisplay" ||
      b.type === "choices" ||
      b.type === "table" ||
      b.type === "image";
    if (prev !== undefined) out.push(joinTight ? "\n" : "\\par\n");
    out.push(s);
    prev = b.type;
  }
  return out.join("");
}

// ---------- document ----------

function fill(template: string, meta: Meta, issues: Issues): string {
  // An empty value takes the brackets around it along: no "Course Title []".
  const blank = (k: string) => k in meta && meta[k as keyof Meta].trim() === "";
  const tidy = template.replace(/\s*[[(]\{\{([a-zA-Z]+)\}\}[\])]/g, (whole, k: string) =>
    blank(k) ? "" : whole,
  );
  const parts = tidy.split(/(\{\{[a-zA-Z]+\}\})/);
  return parts
    .map((p) => {
      const m = /^\{\{([a-zA-Z]+)\}\}$/.exec(p);
      if (!m) return text(p, issues);
      const k = m[1] as keyof Meta;
      if (!(k in meta)) {
        issues.add(`Unknown placeholder {{${k}}} in the header.`);
        return "";
      }
      return text(meta[k], issues);
    })
    .join("");
}

const CANDIDATE: Record<Header["candidateField"], string> = {
  EXAM_NO: "Exam No:",
  ROLL_NO: "Roll No:",
  SEAT_NO: "Seat No:",
  NONE: "",
};

/** `widestOwnLabel`: escaped text of the widest per-question label, if any group numbers each question. */
function preamble(w: Writer, style: Style, header: Header, widestOwnLabel?: string): void {
  const numberEach = widestOwnLabel !== undefined;
  const g = style.geometry;
  // Scalable Computer Modern: maths inside subscript text needs sizes below 5 pt.
  w.line("\\RequirePackage{fix-cm}");
  w.line(`\\documentclass[${style.classSize}pt, a4paper]{exam}`);
  w.line(
    `\\usepackage[left=${inch(g.left)}, top=${inch(g.top)}, total={${inch(g.width)},${inch(g.height)}}]{geometry}`,
  );
  for (const p of [
    "graphicx",
    "multicol",
    "amsmath",
    "amssymb",
    "siunitx",
    "booktabs",
    "tabularx",
  ]) {
    w.line(`\\usepackage{${p}}`);
  }
  if (header.pageNumbers === "X_OF_Y") w.line("\\usepackage{lastpage}");
  if (header.dateRow.style === "ULINE") {
    w.line("\\usepackage[normalem]{ulem}");
    w.line("\\renewcommand\\ULthickness{1.0pt}");
    w.line("\\setlength\\ULdepth{1.3ex}");
  }
  w.line();
  const candidate = CANDIDATE[header.candidateField];
  const numbers = header.pageNumbers === "X_OF_Y";
  if (candidate || numbers) {
    w.line("\\pagestyle{headandfoot}");
    w.line(`\\firstpageheader{}{}{${candidate ? `${candidate}\\,\\rule{2cm}{0.4pt}` : ""}}`);
    w.line("\\runningheader{}{}{}");
    const foot = numbers ? "\\thepage/\\pageref{LastPage}" : "";
    w.line(`\\firstpagefooter{}{${foot}}{}`);
    w.line(`\\runningfooter{}{${foot}}{}`);
  } else {
    w.line("\\pagestyle{empty}");
  }
  const s = style.spacing;
  w.line(
    "\\newcommand{\\dxRuledLine}[1]{\\par\\noindent #1\\par\\vspace{-0.6ex}\\noindent\\rule{\\linewidth}{1pt}\\par}",
  );
  w.line("%% One questions environment per paper (avoids exam.cls duplicate labels);");
  w.line("%% numbering restarts at 1 in each group via \\dxQOffset.");
  w.line("\\newcount\\dxQOffset");
  w.line(
    "%% Space before a heading sits outside the \\uplevel box so it vanishes at the top of a page;",
  );
  w.line(
    "%% the box still starts with (zero) glue so line spacing around it matches \\uplevel{\\vspace{..}..};",
  );
  w.line(
    "%% the heading stays with the first question after it, as LaTeX does for section titles.",
  );
  w.line(
    "%% Not before the first question: there @nobreak would also drop the list's opening \\topsep.",
  );
  w.line(
    "\\makeatletter\\newcommand{\\dxKeepWithNext}{\\ifnum\\value{question}>0 \\@nobreaktrue\\fi}\\makeatother",
  );
  w.line(
    `\\newcommand{\\dxGroupHeadAt}[4]{${numberEach ? "\\global\\let\\dxLabel\\dxGroupLabel" : ""}\\par\\vspace{#1}\\uplevel{\\vspace{0pt}\\noindent\\textbf{#3}\\nobreak\\hfil\\penalty50\\hskip1em\\hbox{}\\nobreak\\hfil\\textbf{#4}\\parfillskip=0pt\\finalhyphendemerits=0\\par\\vspace{#2}}\\global\\dxQOffset=\\value{question}\\relax\\dxKeepWithNext}`,
  );
  w.line(
    `\\newcommand{\\dxGroupHead}[2]{\\dxGroupHeadAt{${inch(s.beforeGroup)}}{${inch(s.afterGroupHead)}}{#1}{#2}}`,
  );
  if (numberEach) {
    w.line("%% Groups that number each question set their own label (Q.6); others count from 1.");
    w.line("\\newcommand{\\dxGroupLabel}{\\the\\numexpr\\value{question}-\\dxQOffset\\relax.}");
    w.line("\\global\\let\\dxLabel\\dxGroupLabel");
    w.line("\\renewcommand{\\questionlabel}{\\dxLabel}");
    w.line("%% Every own label takes the width of the widest, so question texts line up.");
    w.line(`\\newlength\\dxOwnW\\settowidth{\\dxOwnW}{\\textbf{${widestOwnLabel}}}`);
    w.line("\\newcommand{\\dxOwnLabel}[1]{\\gdef\\dxLabel{\\makebox[\\dxOwnW][l]{\\textbf{#1}}}}");
  } else {
    w.line("\\renewcommand{\\questionlabel}{\\the\\numexpr\\value{question}-\\dxQOffset\\relax.}");
  }
  // Inside `questions` a center environment would need an \item and \centering
  // is ignored by \uplevel, so the title is centred with \hfill on both sides.
  w.line(
    `\\newcommand{\\dxPartHead}[1]{\\par\\vspace{${inch(s.beforePart)}}\\uplevel{\\vspace{0pt}\\noindent\\hfill\\textbf{#1}\\hfill\\null\\par\\vspace{${inch(s.afterPart)}}}\\dxKeepWithNext}`,
  );
  const tag = style.coTagStyle === "BOLD" ? "\\textbf{#1}" : "{\\footnotesize #1}";
  w.line(
    "%% Right-aligned tail (CO tag and/or marks); moves to its own line when the last line is full.",
  );
  w.line(
    `\\newcommand{\\dxTail}[1]{{\\unskip\\nobreak\\hfil\\penalty50\\hskip1em\\hbox{}\\nobreak\\hfil${tag}\\parfillskip=0pt\\finalhyphendemerits=0\\par}}`,
  );
  if (numberEach) {
    w.line("%% The same tail, unstyled: a question's own marks (bold) and CO tag.");
    w.line(
      "\\newcommand{\\dxTailRaw}[1]{{\\unskip\\nobreak\\hfil\\penalty50\\hskip1em\\hbox{}\\nobreak\\hfil#1\\parfillskip=0pt\\finalhyphendemerits=0\\par}}",
    );
  }
  w.line("\\newcommand{\\dxBlank}[1][2.5cm]{\\rule{#1}{0.4pt}}");
  w.line("\\renewcommand{\\choicelabel}{\\thechoice.}");
}

function headerBlock(
  w: Writer,
  header: Header,
  style: Style,
  meta: Meta,
  issues: Issues,
  assets: Set<string>,
): void {
  const lines = header.lines.map((l) => {
    const body = fill(l.text, meta, issues);
    const b = l.bold ? `\\textbf{${body}}` : body;
    const size =
      l.size === "large" ? `\\large${l.bold ? "" : " "}` : l.size === "small" ? "\\small " : "";
    if (!size) return `  ${b}\\par`;
    return l.ownLeading ? `  {${size}${b}\\par}` : `  {${size}${b}}\\par`;
  });
  w.line("%% ---------- header ----------");
  if (header.logoLeft) {
    const name = `assets/${header.logoLeft.sha256}.${header.logoLeft.ext}`;
    assets.add(name);
    const lw = formatMarks(style.logoWidth);
    const rw = formatMarks(Number((1 - style.logoWidth - 0.02).toFixed(3)));
    w.line("\\noindent");
    w.line(
      `\\begin{minipage}[c]{${lw}\\textwidth}\\includegraphics[width=\\linewidth]{${name}}\\end{minipage}\\hfill`,
    );
    w.line(`\\begin{minipage}[c]{${rw}\\textwidth}`);
    w.line("\\begin{center}");
    lines.forEach((l) => w.line(l));
    w.line("\\end{center}");
    w.line("\\end{minipage}\\par");
    w.line(`\\vspace{${inch(style.spacing.afterTitle)}}`);
  } else {
    w.line("\\begin{center}");
    lines.forEach((l) => w.line(l));
    w.line("\\end{center}");
  }
  const d = header.dateRow;
  if (d.style !== "NONE") {
    const row = [d.left, d.centre, d.right].map((t) => fill(t, meta, issues)).join("\\hfill ");
    if (d.style === "RULE") w.line(`\\dxRuledLine{${row}}`);
    else w.line(`\\par\\noindent\\uline{${row}}\\par`);
  }
  w.line(`\\vspace{${inch(style.spacing.afterHeader)}}`);
  if (header.instructions.length) {
    w.line("{\\small");
    header.instructions.forEach((i) => w.line(`\\noindent ${text(i, issues)}\\par`));
    w.line("}");
  }
}

function slotTail(slot: Slot, group: Group, structure: Structure, style: Style): string {
  const bits: string[] = [];
  if (group.showCoTag === "SLOT" && slot.coTag) bits.push(`[${slot.coTag}]`);
  if (style.showMarksPerQuestion) {
    bits.push(
      marksLabel(
        structure.marksStyle === "MARKS_COLON" ? "BRACKETS" : structure.marksStyle,
        slot.marks ?? group.marksEach,
      ),
    );
  }
  return bits.length ? `\\dxTail{${bits.join("\\quad ")}}` : "";
}

/** Tail of a question that carries its own number: CO tag, then its marks in bold. */
function ownTail(slot: Slot | undefined, group: Group, structure: Structure, style: Style): string {
  const bits: string[] = [];
  if (group.showCoTag === "SLOT" && slot?.coTag) {
    bits.push(
      style.coTagStyle === "BOLD"
        ? `\\textbf{[${slot.coTag}]}`
        : `{\\footnotesize [${slot.coTag}]}`,
    );
  }
  const style2 = structure.marksStyle === "MARKS_COLON" ? "BRACKETS" : structure.marksStyle;
  bits.push(`\\textbf{${marksLabel(style2, slot?.marks ?? group.marksEach)}}`);
  return `\\dxTailRaw{${bits.join("\\quad ")}}`;
}

function questionBody(slot: Slot, ctx: BlockContext, tail: string): string {
  const content = slot.content.content;
  // A tail belongs to the question text, before any choices block.
  const firstChoices = content.findIndex((b) => b.type === "choices");
  if (!tail || firstChoices <= 0) return `${blocks(content, ctx)}${tail}`;
  return `${blocks(content.slice(0, firstChoices), ctx)}${tail}\n${blocks(content.slice(firstChoices), ctx)}`;
}

export function serializePaper(input: unknown): SerializeResult {
  const parsed = paperSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({
        message: `Invalid paper data at ${i.path.join(".") || "(root)"}: ${i.message}`,
      })),
    };
  }
  return serializeParsed(parsed.data);
}

function serializeParsed(paper: Paper): SerializeResult {
  const { structure, header, style } = paper.template;
  const issues = new Issues();
  const assets = new Set<string>();
  const w = new Writer();
  const slotRanges: SlotRange[] = [];

  const groups = structure.parts.flatMap((p) => p.groups);
  const seen = new Set<string>();
  for (const k of [...structure.parts.map((p) => p.key), ...groups.map((g) => g.key)]) {
    if (seen.has(k)) issues.add(`The key “${k}” is used twice in the template.`);
    seen.add(k);
  }
  const byGroup = new Map<string, Map<number, Slot>>();
  for (const s of paper.slots) {
    const g = groups.find((x) => x.key === s.groupKey);
    if (!g) {
      issues.add(`A question belongs to a group “${s.groupKey}” that is not in the template.`);
      continue;
    }
    if (s.position > g.slots) {
      issues.add(`Question ${s.position} is beyond the ${g.slots} questions of group “${g.key}”.`);
      continue;
    }
    const m = byGroup.get(s.groupKey) ?? new Map<number, Slot>();
    if (m.has(s.position))
      issues.add(`Two questions share position ${s.position} in group “${g.key}”.`);
    m.set(s.position, s);
    byGroup.set(s.groupKey, m);
  }
  if (issues.list.length) return { ok: false, issues: issues.list };

  const numbers = new Map(questionNumbers(structure).map((n) => [n.key, n]));
  const ownLabels = [...numbers.values()]
    .filter((n) => n.numbering === "QUESTION")
    .flatMap((n) => n.printed);
  // Longest string stands in for widest: labels differ only in their digits.
  const widest = ownLabels.reduce<string | undefined>(
    (a, b) => (a === undefined || b.length > a.length ? b : a),
    undefined,
  );

  w.line("%% Generated by DRAFTEX. Edit the paper in the app, not this file.");
  preamble(w, style, header, widest === undefined ? undefined : text(widest, issues));
  w.line();
  w.line("\\begin{document}");
  if (style.body) w.line(`\\fontsize{${style.body.size}}{${style.body.leading}}\\selectfont`);
  w.line();
  headerBlock(w, header, style, paper.meta, issues, assets);
  w.line();
  w.line("\\begin{questions}");

  for (const part of structure.parts) {
    if (part.title) {
      w.line(`%% ---------- part ${part.key} ----------`);
      w.line(`\\dxPartHead{${text(part.title, issues)}}`);
    }
    for (const group of part.groups) {
      // Keys are unique (checked above), so every group has its numbers.
      const num = numbers.get(group.key) as GroupNumbers;
      const ownNumbers = group.numbering === "QUESTION";
      w.line(
        `%% DX-GROUP id=${group.key} type=${group.type} slots=${group.slots} attempt=${group.attempt} marksEach=${formatMarks(group.marksEach)}${ownNumbers ? " numbering=QUESTION" : ""}`,
      );
      if (ownNumbers) {
        // No heading line: each question carries its number and marks (Pharm.D style).
        w.line(`\\par\\vspace{${inch(group.spaceBefore ?? style.spacing.beforeGroup)}}`);
      } else {
        const head = `{${text(num.label as string, issues)} ${text(group.heading, issues)}}{${text(marksLabel(structure.marksStyle, group.attempt * group.marksEach), issues)}}`;
        if (group.spaceBefore === undefined && group.spaceAfterHead === undefined) {
          w.line(`\\dxGroupHead${head}`);
        } else {
          const before = inch(group.spaceBefore ?? style.spacing.beforeGroup);
          const after = inch(group.spaceAfterHead ?? style.spacing.afterGroupHead);
          w.line(`\\dxGroupHeadAt{${before}}{${after}}${head}`);
        }
      }
      const ctx: BlockContext = {
        issues,
        assets,
        defaultColumns:
          group.objectiveLayout === "ONE_COLUMN"
            ? 1
            : group.objectiveLayout === "FOUR_COLUMN"
              ? 4
              : 2,
        beforeChoices: style.spacing.beforeChoices,
      };
      for (let pos = 1; pos <= group.slots; pos++) {
        const slotId = `${group.key}.${pos}`;
        const slot = byGroup.get(group.key)?.get(pos);
        const hasContent = slot && slot.content.content.length > 0;
        if (!hasContent && paper.emptySlots === "OMIT") continue;
        issues.slotId = slotId;
        ctx.partsSoFar = 0;
        const start = w.next;
        w.line(`  %% DX-SLOT ${slotId}`);
        if (ownNumbers) w.line(`  \\dxOwnLabel{${text(num.printed[pos - 1] as string, issues)}}`);
        const tail = ownNumbers
          ? ownTail(slot, group, structure, style)
          : slot
            ? slotTail(slot, group, structure, style)
            : "";
        if (!slot || !hasContent) {
          w.line(`  \\question \\textit{(Question not written yet)}${ownNumbers ? tail : ""}`);
        } else {
          // Escaped text writes "[" as {[}, but Advanced LaTeX may start with a
          // bracket, which \question would read as its points argument.
          const raw = questionBody(slot, ctx, tail);
          const body = guardBracket(raw);
          w.line(`  \\question ${body.split("\n").join("\n  ")}`);
        }
        slotRanges.push({ slotId, startLine: start, endLine: w.next - 1 });
        issues.slotId = undefined;
      }
    }
  }
  if (slotRanges.length === 0) {
    // exam.cls fails on an empty questions environment.
    issues.add("The paper has no questions yet.");
  }
  w.line("\\end{questions}");
  const f = structure.footer;
  if (f.text || f.ornament === "ASTERISKS") {
    w.line(`\\vspace{${inch(style.spacing.beforeFooter)}}`);
    const parts: string[] = [];
    if (f.text) parts.push(`{\\large\\textbf{${text(f.text, issues)}}}`);
    if (f.ornament === "ASTERISKS") parts.push("\\texttt{**********************}");
    w.line(`\\begin{center}${parts.join("\\par")}\\end{center}`);
  }
  w.line("\\end{document}");

  if (issues.list.length) return { ok: false, issues: issues.list };
  return { ok: true, tex: w.toString(), slotRanges, assets: [...assets].sort() };
}

/** Validates one slot's content on its own (used by the editor later). */
export function validateSlotContent(content: unknown): SerializeIssue[] {
  const parsed = docSchema.safeParse(content);
  if (!parsed.success) return parsed.error.issues.map((i) => ({ message: i.message }));
  const issues = new Issues();
  blocks(parsed.data.content, { issues, assets: new Set(), defaultColumns: 2, beforeChoices: 0 });
  return issues.list;
}
