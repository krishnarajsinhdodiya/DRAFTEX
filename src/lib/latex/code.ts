// Code blocks (D98-D101): the rules for the lines a user types, and how wide
// a line may be on a given paper. Pure and client-safe: the editor shows the
// same check the server enforces. fancyvrb prints every character literally,
// but it lets a line run past the frame with no warning at all, and a line
// that starts with \end{Verbatim} ends the block (docs/SECURITY-REVIEW-PHASE13.md).
import { describeChar } from "./escape.ts";

export const MAX_CODE_LINES = 40;
export const TAB_SPACES = 4;

/** Broader than fancyvrb's own match: any spacing and any case. */
export const VERBATIM_END_RE = /^\s*\\end\s*\{\s*Verbatim/i;

/** The fixed options (D99); nothing here comes from the user. */
export const VERBATIM_BEGIN =
  "\\begin{Verbatim}[numbers=left, numbersep=4pt, frame=single, fontsize=\\small, samepage=true]";
export const VERBATIM_END = "\\end{Verbatim}";

/**
 * Marks a line that must reach the engine exactly as written: the Writer
 * strips any indentation in front of it, and the marker itself. Verbatim
 * would print an indent as spaces.
 */
export const VERBATIM_LINE = "\u0001";

/** Characters that have a plain ASCII form, converted with a notice (D100). */
const CONVERT: Record<string, string> = {
  "‘": "'",
  "’": "'",
  "‚": "'",
  "‛": "'",
  "′": "'",
  "“": '"',
  "”": '"',
  "„": '"',
  "‟": '"',
  "″": '"',
  "–": "-",
  "—": "-",
  "‒": "-",
  "−": "-",
  " ": " ",
  " ": " ",
  " ": " ",
};

/**
 * Width of the line a code block sits on, from the engine (exam class,
 * measured 2026-11-13): the question list indents by `question`, a sub-part
 * by `subPart` more. The key is an `article` whose sub-parts are an
 * enumerate list (30 pt).
 */
const INDENT_PT = {
  10: { question: 17.78, subPart: 21.111 },
  11: { question: 19.469, subPart: 23.116 },
  12: { question: 21.024, subPart: 24.936 },
} as const;
/** \small in each class size; a Latin Modern Mono character is 0.525 em. */
const SMALL_PT = { 10: 9, 11: 10, 12: 10.95 } as const;
const MONO_EM = 0.525;
/** frame=single: \fboxsep (3 pt) and \fboxrule (0.4 pt) on both sides. */
const FRAME_PT = 2 * (3 + 0.4);
const PT_PER_IN = 72.27;
/** The key: A4 less 0.8 in on each side (key.ts preamble), 12 pt. */
export const KEY_TEXT_WIDTH_PT = 597.50787 - 2 * 0.8 * PT_PER_IN;
const KEY_LIST_INDENT_PT = 30;

export type CodeDepth = 0 | 1;

export function charWidthPt(classSize: 10 | 11 | 12): number {
  return SMALL_PT[classSize] * MONO_EM;
}

/** Longest line (characters) for a paper's class size and text width; depth 1 = in a sub-part. */
export function paperCodeLimit(
  classSize: 10 | 11 | 12,
  textWidthIn: number,
  depth: CodeDepth,
): number {
  const i = INDENT_PT[classSize];
  const line = textWidthIn * PT_PER_IN - i.question - (depth === 1 ? i.subPart : 0);
  return Math.max(0, Math.floor((line - FRAME_PT) / charWidthPt(classSize)));
}

/** Longest line in the answer key (always 12 pt, fixed margins). */
export function keyCodeLimit(depth: CodeDepth): number {
  const line = KEY_TEXT_WIDTH_PT - (depth === 1 ? KEY_LIST_INDENT_PT : 0);
  return Math.floor((line - FRAME_PT) / charWidthPt(12));
}

export interface CodeLimits {
  /** A question's (or model answer's) own block. */
  top: number;
  /** A block inside a sub-part. */
  subPart: number;
}

export function paperCodeLimits(classSize: 10 | 11 | 12, textWidthIn: number): CodeLimits {
  return {
    top: paperCodeLimit(classSize, textWidthIn, 0),
    subPart: paperCodeLimit(classSize, textWidthIn, 1),
  };
}

export const KEY_CODE_LIMITS: CodeLimits = { top: keyCodeLimit(0), subPart: keyCodeLimit(1) };

const isPrintable = (cp: number) => cp >= 0x20 && cp <= 0x7e;

function nameChar(c: string): string {
  const cp = c.codePointAt(0) as number;
  return cp < 0x20 || (cp >= 0x7f && cp < 0xa0)
    ? `a control character (U+${cp.toString(16).toUpperCase().padStart(4, "0")})`
    : describeChar(c);
}

/** Characters in these lines that no code block can print, named. */
export function unprintableCode(lines: readonly string[]): string[] {
  const bad = new Set<string>();
  for (const l of lines) {
    for (const ch of l.replace(/\r$/, "")) {
      if (ch !== "\t" && CONVERT[ch] === undefined && !isPrintable(ch.codePointAt(0) as number)) {
        bad.add(ch);
      }
    }
  }
  return [...bad].map(nameChar);
}

export interface CodeCheck {
  /** Lines as they print: converted, tabs expanded, trailing spaces dropped. */
  lines: string[];
  /** Errors: the block does not print until they are fixed. */
  problems: string[];
  /** Changes made for printing, shown to the user (not errors). */
  notices: string[];
}

/**
 * Checks and normalises a code block's lines. `maxChars` is the longest line
 * the block's place on the paper allows.
 */
export function checkCode(input: readonly string[], maxChars: number): CodeCheck {
  const problems: string[] = [];
  const notices = new Set<string>();
  const lines = input.map((raw, n) => {
    let line = "";
    for (const ch of raw.replace(/\r$/, "")) {
      const code = ch.codePointAt(0) as number;
      if (ch === "\t") {
        line += " ".repeat(TAB_SPACES);
        notices.add(`Tabs print as ${TAB_SPACES} spaces.`);
      } else if (CONVERT[ch] !== undefined) {
        line += CONVERT[ch];
        notices.add(
          ch === " " || ch === " " || ch === " "
            ? "Non-breaking spaces print as ordinary spaces."
            : "Curly quotes and dashes print as straight ASCII ' \" and -.",
        );
      } else if (isPrintable(code)) line += ch;
    }
    line = line.replace(/ +$/, "");
    if (VERBATIM_END_RE.test(line)) {
      problems.push(`Line ${n + 1} starts with \\end{Verbatim}, which would end the code block.`);
    }
    return line;
  });
  const bad = unprintableCode(input);
  if (bad.length) {
    problems.push(`Code may use plain ASCII characters only; this block has ${bad.join(", ")}.`);
  }
  if (lines.every((l) => l.trim() === "")) problems.push("The code block is empty.");
  if (lines.length > MAX_CODE_LINES) {
    problems.push(
      `A code block may have at most ${MAX_CODE_LINES} lines; this one has ${lines.length}.`,
    );
  }
  const long = lines.map((l, i) => [i + 1, l.length] as const).filter(([, len]) => len > maxChars);
  if (long.length) {
    const [n, len] = long[0] as readonly [number, number];
    const more = long.length > 1 ? ` (and ${long.length - 1} more)` : "";
    problems.push(
      `Line ${n}${more} is ${len} characters; at most ${maxChars} fit inside the frame here. Break the line or shorten it.`,
    );
  }
  return { lines, problems, notices: [...notices] };
}

/** The LaTeX for checked lines (no indentation may be added in front of them). */
export function verbatimLatex(lines: readonly string[]): string {
  return [
    VERBATIM_BEGIN,
    ...lines.map((l) => `${VERBATIM_LINE}${l}`),
    `${VERBATIM_LINE}${VERBATIM_END}`,
  ].join("\n");
}
