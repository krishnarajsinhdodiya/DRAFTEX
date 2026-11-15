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
  type SubPartAttrs,
  type TableNode,
} from "../paper/schema.ts";
import { type Bloom, bloomPrinted } from "../paper/bloom.ts";
import type { SlotRange } from "./compile.ts";
import { type GroupNumbers, questionNumbers } from "../paper/numbering.ts";
import {
  type CodeLimits,
  VERBATIM_LINE,
  checkCode,
  paperCodeLimits,
  verbatimLatex,
} from "./code.ts";
import { describeChar, escapeText, mapMathUnicode, type QuoteState } from "./escape.ts";
import { type LoadedPackage, packageLines, packagesUsed } from "./packages.ts";
import { sanitizeLatex, type SanitizeMode } from "./sanitize.ts";
import {
  MERGED_CELL_LINES,
  checkTable,
  hasTableOptions,
  mergedCellsUsed,
  tableLatex,
} from "./table.ts";

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

export class Issues {
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
export const inch = (n: number) => `${Number(n.toFixed(3))}in`;

export class Writer {
  private readonly lines: string[] = [];
  line(s = ""): void {
    this.lines.push(...s.split("\n"));
  }
  /** 1-based number of the next line to be written. */
  get next(): number {
    return this.lines.length + 1;
  }
  toString(): string {
    // Verbatim lines reach the engine as written: no indentation in front (D99).
    const strip = new RegExp(`^[ \\t]*${VERBATIM_LINE}`);
    return `${this.lines.map((l) => l.replace(strip, "")).join("\n")}\n`;
  }
}

// ---------- inline ----------

/**
 * Where a long word may break in a narrow column (D61): after a hyphen
 * between letters or digits, a comma, or a closing bracket, when more of
 * the word follows ("N-(4-hydroxyphenyl)acetamide"). A comma before a digit
 * stays ("1,000", "2,6-dione" breaks after the hyphen instead).
 */
const BREAK_AFTER = /(?<=[\p{L}\p{N})\]]-|[)\]])(?=[^\s,.;:)\]-])|(?<=,)(?=[^\s\p{N},.;:)\]-])/u;

export function text(s: string, issues: Issues, quotes?: QuoteState, breakable = false): string {
  if (breakable) {
    // Each piece is escaped on its own, so the break never lands inside a command;
    // \hspace{0pt} is a break point that also lets the next piece hyphenate.
    const pieces = s.split(BREAK_AFTER);
    if (pieces.length > 1) {
      const q = quotes ?? { doubleOpen: false };
      return pieces.map((x) => text(x, issues, q)).join("\\hspace{0pt}");
    }
  }
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

export function inline(
  nodes: InlineNode[] | undefined,
  issues: Issues,
  opts: { breakable?: boolean; inCell?: boolean } = {},
): string {
  const quotes: QuoteState = { doubleOpen: false };
  let out = "";
  for (const n of usefulBreaks(nodes ?? [])) {
    switch (n.type) {
      case "text": {
        const code = n.marks?.some((m) => m.type === "code");
        let t = code ? codeText(n.text, issues) : text(n.text, issues, quotes, opts.breakable);
        for (const m of n.marks ?? []) {
          t = {
            code: `\\texttt{${t}}`,
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
      case "mathInline": {
        const latex = snippet(n.attrs.latex, "math", issues, "equation");
        if (opts.inCell && cellBreaker(latex)) {
          issues.add(
            "An equation in a table cell cannot use &, \\\\ or \\hline outside a matrix; it would split the table's cells.",
          );
          break;
        }
        out += `$${latex}$`;
        break;
      }
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

/**
 * Inline code (D98): escaped like all text, in the typewriter font. A straight
 * double quote stays straight: `` and '' are not ligatures in that font.
 */
function codeText(s: string, issues: Issues): string {
  return s
    .split('"')
    .map((x) => text(x, issues))
    .join("\\textquotedbl{}");
}

const paragraph = (p: ParagraphNode, issues: Issues) => inline(p.content, issues);

/**
 * True when sanitised maths would end a table cell or row: `&`, `\\` or
 * `\hline` outside an environment (a matrix keeps its own). These were
 * engine errors before (docs/SECURITY-REVIEW-PHASE14.md); now a message.
 */
export function cellBreaker(latex: string): boolean {
  let depth = 0;
  for (let i = 0; i < latex.length; i++) {
    const ch = latex[i];
    if (ch === "&" && depth === 0) return true;
    if (ch !== "\\") continue;
    const name = /^[A-Za-z]+/.exec(latex.slice(i + 1))?.[0];
    if (name === undefined) {
      if (latex[i + 1] === "\\" && depth === 0) return true;
      i++;
      continue;
    }
    if (name === "begin") depth++;
    else if (name === "end") depth = Math.max(0, depth - 1);
    else if (name === "hline" && depth === 0) return true;
    i += name.length;
  }
  return false;
}

// ---------- blocks ----------

export interface BlockContext {
  issues: Issues;
  assets: Set<string>;
  defaultColumns: 1 | 2 | 4;
  beforeChoices: number;
  /** Sub-parts already lettered in this question: a second list carries on (c), (d). */
  partsSoFar?: number;
  /** Answer keys are `article` documents: choices and sub-parts become enumerate lists. */
  keyMode?: boolean;
  /** Right-aligned tail of each sub-part (its Bloom, CO and marks; D67). */
  partTail?: (attrs: SubPartAttrs | undefined) => Tail;
  /** Longest code line at question level and in a sub-part (D100). */
  codeLimits: CodeLimits;
  /** Inside a sub-part: code blocks get the sub-part's width. */
  inSubPart?: boolean;
  /** Inside a table cell (the objective key table): no code blocks (D101). */
  inCell?: boolean;
}

/**
 * What a question or sub-part prints at its end. `inGroup` is the same tail
 * written inside a grouped Advanced LaTeX block (D103), where a size command
 * of the block must not reach it.
 */
export interface Tail {
  plain: string;
  inGroup: string;
}

export const NO_TAIL: Tail = { plain: "", inGroup: "" };

type TableCellNode = TableNode["content"][number]["content"][number];

function table(t: TableNode, ctx: BlockContext): string {
  const cell = (c: TableCellNode, sep: string) =>
    (c.content ?? []).map((p) => inline(p.content, ctx.issues, { inCell: true })).join(sep);
  if (hasTableOptions(t)) {
    if (ctx.inCell) {
      ctx.issues.add(
        "A table with column settings, borders or merged cells cannot go in the answer table of an objective group.",
      );
      return "";
    }
    const problems = checkTable(t);
    for (const p of problems) ctx.issues.add(`Table: ${p}`);
    // D105: in a fixed-width column a cell's own paragraphs keep their lines.
    return problems.length ? "" : tableLatex(t, (c) => cell(c, "\\par "));
  }
  // D106: a table without new options is written exactly as before.
  const headerRow = t.attrs?.headerRow ?? true;
  const width = (t.attrs?.widthPercent ?? 80) / 100;
  const cols = Math.max(...t.content.map((r) => r.content.length));
  // A one-column table still fills its width, so it needs a stretchable column.
  const spec = cols === 1 ? "@{}X@{}" : `@{}l${"X".repeat(cols - 1)}@{}`;
  const rows = t.content.map((row) => {
    const cells = row.content.map((c) => cell(c, " "));
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
  if (ctx.keyMode) {
    const items = c.content.map((ch) => `  \\item ${inline(ch.content, ctx.issues)}`);
    return ["\\begin{enumerate}[label=\\Alph*., nosep]", ...items, "\\end{enumerate}"].join("\n");
  }
  const columns = c.attrs?.columns ?? ctx.defaultColumns;
  // Narrow columns get break points in long words and, only when a line
  // cannot be set otherwise, extra stretch (D61); one column is unchanged.
  // Loose lines are expected there, so they are not reported (\\hbadness).
  const narrow = columns > 1;
  // The \\hspace{0pt} before each option lets its first word hyphenate:
  // TeX never hyphenates a word that follows the label box directly.
  const items = c.content
    .map(
      (ch) =>
        `\\choice ${narrow ? "\\hspace{0pt}" : ""}${inline(ch.content, ctx.issues, { breakable: narrow })}`,
    )
    .join(" ");
  const list = `\\begin{choices}\n  ${items}\n\\end{choices}`;
  const lead = `\\vspace{${inch(ctx.beforeChoices)}}`;
  if (!narrow) return `${lead}\n${list}`;
  return `${lead}\n\\begin{multicols}{${columns}}\\setlength{\\emergencystretch}{3em}\\hbadness=10000\n${list}\n\\end{multicols}`;
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
      return grouped(snippet(b.attrs.latex, "advanced", ctx.issues, "advanced LaTeX"), "", true);
    case "codeBlock": {
      if (ctx.inCell) {
        ctx.issues.add(
          "A code block cannot go in the answer table of an objective group; write the answer as text, or use inline code.",
        );
        return "";
      }
      const limit = ctx.inSubPart ? ctx.codeLimits.subPart : ctx.codeLimits.top;
      const r = checkCode(b.attrs.lines, limit);
      for (const p of r.problems) ctx.issues.add(`Code block: ${p}`);
      return r.problems.length ? "" : verbatimLatex(r.lines);
    }
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
 * D103: an Advanced LaTeX block is a group, so a size or font command inside
 * it stops at its end. The \par sits inside, so the block's own lines keep
 * their spacing; a question's tail, when the block ends the question, goes
 * before it. Before display maths the paragraph stays open (no \par), as it
 * did, so the equation keeps its place in the paragraph; so does a table
 * cell, which ends its paragraph itself (with the strut that sets the row's
 * depth: a \par there moved the key table by 1.7% of the page).
 */
function grouped(latex: string, tail: string, par: boolean): string {
  if (latex === "") return "";
  return `\\begingroup ${latex}${tail}${par ? "\\par" : ""}\\endgroup`;
}

/**
 * D101: a block that starts with code puts its number (or letter) on a line
 * of its own; otherwise the code's first line number prints on top of it.
 */
const ownLine = (content: readonly BlockNode[]) =>
  content[0]?.type === "codeBlock" ? "\\mbox{}\\par\n" : "";

/**
 * Joins blocks the way the hand-written papers do: display maths stays inside
 * its paragraph (no \par around \[ \]), other blocks start a new paragraph.
 */
function subParts(b: Extract<BlockNode, { type: "subParts" }>, ctx: BlockContext): string {
  const before = ctx.partsSoFar ?? 0;
  ctx.partsSoFar = before + b.content.length;
  if (ctx.keyMode) {
    return [
      `\\begin{enumerate}[label=(\\alph*), start=${before + 1}]`,
      ...b.content.map(
        (p) => `  \\item ${ownLine(p.content)}${inPart(ctx, () => blocks(p.content, ctx))}`,
      ),
      "\\end{enumerate}",
    ].join("\n");
  }
  return [
    "\\begin{parts}",
    // exam.cls restarts lettering (and its labels) in every parts list.
    ...(before > 0 ? [`\\setcounter{partno}{${before}}`] : []),
    ...b.content.map(
      (p) =>
        `  \\part ${ownLine(p.content)}${guardBracket(inPart(ctx, () => withTail(p.content, ctx, ctx.partTail?.(p.attrs) ?? NO_TAIL)))}`,
    ),
    "\\end{parts}",
  ].join("\n");
}

function inPart(ctx: BlockContext, f: () => string): string {
  const was = ctx.inSubPart;
  ctx.inSubPart = true;
  try {
    return f();
  } finally {
    ctx.inSubPart = was;
  }
}

/**
 * `tail` is what ends these blocks (a question's Bloom, CO and marks); it
 * goes inside a closing Advanced LaTeX group (D103), else after the blocks.
 */
export function blocks(nodes: BlockNode[], ctx: BlockContext, tail: Tail = NO_TAIL): string {
  const out: string[] = [];
  let prev: BlockNode["type"] | undefined;
  let tailDone = false;
  nodes.forEach((b, i) => {
    let s: string;
    if (b.type === "subParts") s = subParts(b, ctx);
    else if (b.type === "advancedLatex") {
      const last = i === nodes.length - 1;
      const latex = snippet(b.attrs.latex, "advanced", ctx.issues, "advanced LaTeX");
      // A table cell ends its own paragraph (with the strut that sets the row's depth).
      const par = !ctx.inCell && nodes[i + 1]?.type !== "mathDisplay";
      s = grouped(latex, last ? tail.inGroup : "", par);
      if (last && latex !== "") tailDone = true;
    } else s = leaf(b, ctx);
    if (b.type === "paragraph" && s === "") return;
    // Verbatim must close on a line of its own and starts its own paragraph.
    const code = b.type === "codeBlock" || prev === "codeBlock";
    const joinTight =
      prev === undefined ||
      code ||
      b.type === "mathDisplay" ||
      prev === "mathDisplay" ||
      b.type === "choices" ||
      b.type === "table" ||
      b.type === "image";
    if (prev !== undefined) out.push(joinTight ? "\n" : "\\par\n");
    out.push(s);
    prev = b.type;
  });
  if (!tailDone && tail.plain) out.push(prev === "codeBlock" ? `\n${tail.plain}` : tail.plain);
  return out.join("");
}

// ---------- document ----------

export function fill(template: string, meta: Meta, issues: Issues): string {
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
function preamble(
  w: Writer,
  style: Style,
  header: Header,
  packages: LoadedPackage[],
  widestOwnLabel?: string,
  mergedCells = false,
): void {
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
  // D87: only what the paper's own Advanced LaTeX (or a rupee sign) uses.
  for (const line of packageLines(packages)) w.line(line);
  if (mergedCells) for (const line of MERGED_CELL_LINES) w.line(line);
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
  if (style.showBloom) {
    const size = style.coTagStyle === "BOLD" ? "" : "\\footnotesize ";
    w.line("%% Bloom level right after the question text; it moves with the last word.");
    w.line(`\\newcommand{\\dxBloom}[1]{\\unskip\\ \\mbox{${size}#1}}`);
  }
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

/** What a question or sub-part prints at its end: Bloom, CO tag, marks. */
interface TailParts {
  bloom?: Bloom | undefined;
  co?: string | undefined;
  marks?: number | undefined;
}

/** A CO tag never splits at its suffix space (`BP607T.01~AEC1`, D63). */
const coPrint = (tag: string) => tag.replace(/ /g, "~");

/**
 * Inside a grouped Advanced LaTeX block (D103) the tail is set at normal size
 * whatever size the block chose. A footnote-size tag is sized already; the
 * bold style takes the current size, so it gets \normalsize inside its own
 * group, leaving the block's line spacing alone.
 */
const normal = (s: string, reset: boolean) => (reset ? `{\\normalsize ${s}}` : s);

function bloomBit(t: TailParts, style: Style, issues: Issues, reset = false): string {
  if (!style.showBloom || !t.bloom) return "";
  const b = text(bloomPrinted(t.bloom), issues);
  return `\\dxBloom{${normal(b, reset && style.coTagStyle === "BOLD")}}`;
}

const both = (f: (reset: boolean) => string): Tail => ({ plain: f(false), inGroup: f(true) });

function tail(
  t: TailParts,
  group: Group,
  structure: Structure,
  style: Style,
  issues: Issues,
): Tail {
  return both((reset) => tailText(t, group, structure, style, issues, reset));
}

function tailText(
  t: TailParts,
  group: Group,
  structure: Structure,
  style: Style,
  issues: Issues,
  reset: boolean,
): string {
  const bits: string[] = [];
  if (group.showCoTag === "SLOT" && t.co) bits.push(`[${coPrint(t.co)}]`);
  if (t.marks !== undefined) {
    bits.push(
      marksLabel(
        structure.marksStyle === "MARKS_COLON" ? "BRACKETS" : structure.marksStyle,
        t.marks,
      ),
    );
  }
  const tag = normal(bits.join("\\quad "), reset && style.coTagStyle === "BOLD");
  return bloomBit(t, style, issues, reset) + (bits.length ? `\\dxTail{${tag}}` : "");
}

/** Tail of a question that carries its own number: Bloom, CO tag, then its marks in bold. */
function ownTail(
  t: TailParts,
  group: Group,
  structure: Structure,
  style: Style,
  issues: Issues,
): Tail {
  return both((reset) => ownTailText(t, group, structure, style, issues, reset));
}

function ownTailText(
  t: TailParts,
  group: Group,
  structure: Structure,
  style: Style,
  issues: Issues,
  reset: boolean,
): string {
  const bits: string[] = [];
  if (group.showCoTag === "SLOT" && t.co) {
    bits.push(
      style.coTagStyle === "BOLD"
        ? `\\textbf{[${coPrint(t.co)}]}`
        : `{\\footnotesize [${coPrint(t.co)}]}`,
    );
  }
  const style2 = structure.marksStyle === "MARKS_COLON" ? "BRACKETS" : structure.marksStyle;
  bits.push(`\\textbf{${marksLabel(style2, t.marks ?? group.marksEach)}}`);
  // \dxTailRaw does not group its argument: the size change needs its own braces.
  return `${bloomBit(t, style, issues, reset && style.coTagStyle === "BOLD")}\\dxTailRaw{${normal(bits.join("\\quad "), reset)}}`;
}

/** Every sub-part of a question, in order. */
function subPartsOf(slot: Slot) {
  return slot.content.content.flatMap((b) => (b.type === "subParts" ? b.content : []));
}

/**
 * Where a question's tags go (D67, D70; see subPartTags): on its first line,
 * or on each sub-part, the first line then printing none. Sub-part marks
 * print with "show marks per question".
 */
/**
 * Each sub-part's Bloom and CO (unset values follow the question's), or null
 * when the question's own line carries them. D70: with Bloom shown, every
 * sub-part line carries its tags. With Bloom off, sub-parts print their own
 * CO only when one differs from the question's (D67), so papers made before
 * Phase 10 print as they did.
 */
export function subPartTags(
  slot: Slot,
  group: Group,
  style: Style,
): { bloom?: Bloom; co?: string }[] | null {
  const tags = subPartsOf(slot).map((p) => ({
    bloom: p.attrs?.bloom ?? slot.bloomLevel,
    co: p.attrs?.coTag ?? slot.coTag,
  }));
  if (tags.length === 0) return null;
  if (style.showBloom) return tags;
  const coShown = group.showCoTag === "SLOT";
  return tags.some((e) => coShown && e.co !== slot.coTag) ? tags : null;
}

function tailsFor(
  slot: Slot,
  group: Group,
  structure: Structure,
  style: Style,
  issues: Issues,
  ownNumbers: boolean,
): { stem: Tail; part?: (attrs: SubPartAttrs | undefined) => Tail } {
  const own = (a: SubPartAttrs | undefined) => ({
    bloom: a?.bloom ?? slot.bloomLevel,
    co: a?.coTag ?? slot.coTag,
  });
  const parts = subPartsOf(slot);
  const perPart = subPartTags(slot, group, style) !== null;
  const partMarks = style.showMarksPerQuestion && parts.some((p) => p.attrs?.marks != null);
  const stemTags: TailParts = perPart ? {} : { bloom: slot.bloomLevel, co: slot.coTag };
  const stem = ownNumbers
    ? ownTail({ ...stemTags, marks: slot.marks }, group, structure, style, issues)
    : tail(
        {
          ...stemTags,
          marks: style.showMarksPerQuestion ? (slot.marks ?? group.marksEach) : undefined,
        },
        group,
        structure,
        style,
        issues,
      );
  if (!perPart && !partMarks) return { stem };
  return {
    stem,
    part: (a) =>
      tail(
        {
          ...(perPart ? own(a) : {}),
          marks: style.showMarksPerQuestion ? (a?.marks ?? undefined) : undefined,
        },
        group,
        structure,
        style,
        issues,
      ),
  };
}

/**
 * A tail belongs to the text, before any choices block. With Bloom shown it
 * also comes before the first sub-parts list, right after the question's own
 * text (with Bloom off, sub-part questions keep their old layout).
 */
function withTail(content: BlockNode[], ctx: BlockContext, end: Tail, beforeParts = false): string {
  const first = content.findIndex(
    (b) => b.type === "choices" || (beforeParts && b.type === "subParts"),
  );
  if (!end.plain || first <= 0) return blocks(content, ctx, end);
  return `${blocks(content.slice(0, first), ctx, end)}\n${blocks(content.slice(first), ctx)}`;
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
  const codeLimits = paperCodeLimits(style);
  const ownLabels = [...numbers.values()]
    .filter((n) => n.numbering === "QUESTION")
    .flatMap((n) => n.printed);
  // Longest string stands in for widest: labels differ only in their digits.
  const widest = ownLabels.reduce<string | undefined>(
    (a, b) => (a === undefined || b.length > a.length ? b : a),
    undefined,
  );

  w.line("%% Generated by DRAFTEX. Edit the paper in the app, not this file.");
  preamble(
    w,
    style,
    header,
    packagesUsed(paper),
    widest === undefined ? undefined : text(widest, issues),
    mergedCellsUsed(paper),
  );
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
        codeLimits,
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
        if (!slot || !hasContent) {
          const placeholder = ownNumbers
            ? ownTail({ co: slot?.coTag, marks: slot?.marks }, group, structure, style, issues)
                .plain
            : "";
          w.line(`  \\question \\textit{(Question not written yet)}${placeholder}`);
        } else {
          const tails = tailsFor(slot, group, structure, style, issues, ownNumbers);
          ctx.partTail = tails.part;
          // Escaped text writes "[" as {[}, but Advanced LaTeX may start with a
          // bracket, which \question would read as its points argument.
          const raw = withTail(slot.content.content, ctx, tails.stem, style.showBloom);
          ctx.partTail = undefined;
          const body = ownLine(slot.content.content) + guardBracket(raw);
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
  blocks(parsed.data.content, {
    issues,
    assets: new Set(),
    defaultColumns: 2,
    beforeChoices: 0,
    codeLimits: { top: Infinity, subPart: Infinity },
  });
  return issues.list;
}
