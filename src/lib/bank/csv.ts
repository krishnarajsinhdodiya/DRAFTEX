// CSV import for the question bank (WP-E, D79, D80). Untrusted input: the
// size is checked before decoding, rows are counted while parsing, every cell
// has a length cap, and cells are never interpreted (a backslash is text the
// serializer escapes). CSV that DRAFTEX writes guards cells that start with
// = + - @ against spreadsheet formulas. Pure; the server adds course lookup
// and duplicates (src/server/bank-import.ts).
import { BLOOM_LABEL, BLOOM_LEVELS, type Bloom } from "../paper/bloom.ts";
import { coTag } from "../paper/co-tag.ts";
import type { Doc } from "../paper/schema.ts";
import { GROUP_TYPE_LABEL } from "../templates/labels.ts";
import type {
  BANK_PROGRAMS} from "./question.ts";
import {
  BANK_TYPES,
  type BankFieldsInput,
  type BankType,
  TAGS_MAX,
} from "./question.ts";

export const CSV_MAX_BYTES = 1024 * 1024;
export const CSV_MAX_ROWS = 1000;
export const LONG_CELL_MAX = 4000;
export const SHORT_CELL_MAX = 100;

export type CsvEncoding = "UTF-8 (with BOM)" | "UTF-8" | "Windows-1252";

export class CsvFileError extends Error {
  override name = "CsvFileError";
}

/** Columns in template order; `required` ones must be in the header. */
export const CSV_COLUMNS = [
  { key: "courseCode", header: "course code", required: true, long: false },
  { key: "unit", header: "unit", required: true, long: false },
  { key: "co", header: "co", required: true, long: false },
  { key: "bloom", header: "bloom", required: true, long: false },
  { key: "marks", header: "marks", required: true, long: false },
  { key: "type", header: "type", required: true, long: false },
  { key: "question", header: "question", required: true, long: true },
  { key: "answer", header: "answer", required: true, long: true },
  { key: "tags", header: "tags", required: true, long: false },
  { key: "choiceA", header: "choice a", required: false, long: false },
  { key: "choiceB", header: "choice b", required: false, long: false },
  { key: "choiceC", header: "choice c", required: false, long: false },
  { key: "choiceD", header: "choice d", required: false, long: false },
  { key: "correct", header: "correct", required: false, long: false },
  { key: "courseTitle", header: "course title", required: false, long: false },
  { key: "programme", header: "programme", required: false, long: false },
] as const;
export type CsvKey = (typeof CSV_COLUMNS)[number]["key"];
export type CsvRow = Partial<Record<CsvKey, string>>;

/**
 * Reads the bytes as UTF-8 with BOM, strict UTF-8, or else Windows-1252
 * (Excel's "CSV (Comma delimited)" on Windows), and says which. UTF-16 is
 * refused by name.
 */
export function decodeCsv(bytes: Uint8Array): { text: string; encoding: CsvEncoding } {
  if (bytes.byteLength > CSV_MAX_BYTES) {
    throw new CsvFileError("The file is larger than 1 MB. Split it into smaller files.");
  }
  const [b0, b1, b2] = bytes;
  if ((b0 === 0xff && b1 === 0xfe) || (b0 === 0xfe && b1 === 0xff)) {
    throw new CsvFileError(
      'This file is saved as UTF-16 ("Unicode Text"). In Excel choose Save As, then "CSV UTF-8 (Comma delimited)".',
    );
  }
  if (b0 === 0xef && b1 === 0xbb && b2 === 0xbf) {
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(3)),
      encoding: "UTF-8 (with BOM)",
    };
  }
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "UTF-8" };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(bytes), encoding: "Windows-1252" };
  }
}

/**
 * RFC 4180 with CRLF, LF or CR line ends: commas separate cells, a cell in
 * double quotes may hold commas, quotes ("") and line breaks. Stops with an
 * error past `maxRecords` records or at a quote that is never closed.
 */
export function parseCsv(text: string, maxRecords: number): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  let line = 1;
  let quoted = false;
  let quoteLine = 0;
  const endCell = () => {
    row.push(cell);
    cell = "";
  };
  const endRow = () => {
    endCell();
    records.push(row);
    row = [];
    if (records.length > maxRecords) {
      throw new CsvFileError(
        `The file has more than ${(maxRecords - 1).toLocaleString("en")} rows. Split it into smaller files.`,
      );
    }
  };
  while (i < text.length) {
    const ch = text[i] as string;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      if (ch === "\r" || ch === "\n") {
        line += 1;
        if (ch === "\r" && text[i + 1] === "\n") i += 1;
        cell += "\n";
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && cell === "") {
      quoted = true;
      quoteLine = line;
      i += 1;
      continue;
    }
    if (ch === ",") {
      endCell();
      i += 1;
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      i += 1;
      line += 1;
      endRow();
      continue;
    }
    cell += ch;
    i += 1;
  }
  if (quoted) {
    throw new CsvFileError(`A quoted cell that starts on line ${quoteLine} is never closed.`);
  }
  if (cell !== "" || row.length > 0) endRow();
  return records;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Maps the header row to column keys; names unknown and missing columns. */
export function readHeader(header: string[]): (CsvKey | null)[] {
  const cells = header.map(norm);
  if (cells.length === 1 && (cells[0] ?? "").includes(";")) {
    throw new CsvFileError(
      "The columns are separated by semicolons. Save the file with commas (CSV UTF-8 in Excel).",
    );
  }
  const keys = cells.map((h) => CSV_COLUMNS.find((c) => c.header === h)?.key ?? null);
  const unknown = header.filter((h, i) => keys[i] === null && h.trim() !== "");
  if (unknown.length) {
    throw new CsvFileError(
      `Unknown column${unknown.length > 1 ? "s" : ""}: ${unknown.map((u) => `"${u.trim().slice(0, 40)}"`).join(", ")}. Use the template's headings.`,
    );
  }
  const seen = new Set<CsvKey>();
  for (const k of keys) {
    if (k && seen.has(k)) {
      throw new CsvFileError(
        `The column "${CSV_COLUMNS.find((c) => c.key === k)?.header}" appears twice.`,
      );
    }
    if (k) seen.add(k);
  }
  const missing = CSV_COLUMNS.filter((c) => c.required && !seen.has(c.key)).map((c) => c.header);
  if (missing.length)
    throw new CsvFileError(
      `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`,
    );
  return keys;
}

/** A cell DRAFTEX wrote with a formula guard (`'=…`) reads back without the apostrophe. */
function unguard(s: string): string {
  return /^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s;
}

/** Control characters other than line breaks and tabs, named. */
function controlChars(s: string): string[] {
  const out = new Set<string>();
  for (const ch of s) {
    const c = ch.codePointAt(0) as number;
    if ((c < 0x20 && c !== 0x0a && c !== 0x09) || (c >= 0x7f && c <= 0x9f)) {
      out.add(`U+${c.toString(16).toUpperCase().padStart(4, "0")}`);
    }
  }
  return [...out];
}

const BLOOM_BY_NAME = new Map<string, Bloom>(
  BLOOM_LEVELS.flatMap((b) => [
    [b.toLowerCase(), b],
    [BLOOM_LABEL[b].toLowerCase(), b],
  ]),
);
BLOOM_BY_NAME.set("analyze", "ANALYZE");

const TYPE_BY_NAME = new Map<string, BankType>(
  BANK_TYPES.flatMap((t) => [
    [t.toLowerCase(), t],
    [t.toLowerCase().replace(/_/g, " "), t],
    [GROUP_TYPE_LABEL[t].toLowerCase(), t],
  ]),
);
TYPE_BY_NAME.set("mcq", "OBJECTIVE");

const PROGRAM_BY_NAME = new Map<string, (typeof BANK_PROGRAMS)[number]>([
  ["b.pharm", "B_PHARM"],
  ["bpharm", "B_PHARM"],
  ["b_pharm", "B_PHARM"],
  ["m.pharm", "M_PHARM"],
  ["mpharm", "M_PHARM"],
  ["m_pharm", "M_PHARM"],
  ["pharm.d", "PHARM_D"],
  ["pharmd", "PHARM_D"],
  ["pharm_d", "PHARM_D"],
]);

/** Text cell → paragraphs, one per line; blank lines are dropped. */
function textDoc(s: string): Doc["content"] {
  return s
    .split("\n")
    .map((l) => l.replace(/\t/g, " ").trim())
    .filter(Boolean)
    .map((l) => ({ type: "paragraph" as const, content: [{ type: "text" as const, text: l }] }));
}

/** A CO cell: the full tag, or a number (`1`, `01`, `CO1`, `CO 1`) made into the course's tag. */
export function coCell(raw: string, courseCode: string): string {
  const s = raw.trim().replace(/\s+/g, " ");
  const n = /^(?:co\s*-?\s*)?(\d{1,2})$/i.exec(s);
  if (n && courseCode) return coTag(courseCode, Number(n[1]));
  return s.toUpperCase();
}

export interface RowResult {
  /** Line-style row number as a spreadsheet shows it (the header is row 1). */
  row: number;
  input: BankFieldsInput | null;
  errors: string[];
}

/** One data row to bank fields, or the reasons it cannot be one. */
export function rowToInput(cells: CsvRow, row: number): RowResult {
  const errors: string[] = [];
  const v: CsvRow = {};
  /** Cells already reported as too long or unprintable; not reported again as empty. */
  const failed = new Set<CsvKey>();
  for (const c of CSV_COLUMNS) {
    const raw = unguard(cells[c.key] ?? "");
    const max = c.long ? LONG_CELL_MAX : SHORT_CELL_MAX;
    if (raw.length > max) {
      errors.push(`${c.header} is longer than ${max.toLocaleString("en")} characters.`);
      failed.add(c.key);
      continue;
    }
    const bad = controlChars(raw);
    if (bad.length) {
      errors.push(
        `${c.header} contains control characters that cannot be printed: ${bad.join(", ")}.`,
      );
      failed.add(c.key);
      continue;
    }
    v[c.key] = c.long ? raw.trim() : raw.trim().replace(/\s+/g, " ");
  }
  const courseCode = (v.courseCode ?? "").toUpperCase();
  if (!courseCode && !failed.has("courseCode")) errors.push("course code is empty.");

  const unit = v.unit ? Number(v.unit) : null;
  if (v.unit && !(Number.isInteger(unit) && (unit as number) >= 1 && (unit as number) <= 20)) {
    errors.push(`unit "${v.unit}" is not a whole number from 1 to 20.`);
  }

  const co = v.co ? coCell(v.co, courseCode) : "";
  if (!co && !failed.has("co")) errors.push("co is empty.");

  const bloom = v.bloom ? BLOOM_BY_NAME.get(v.bloom.toLowerCase()) : undefined;
  if (!v.bloom) {
    if (!failed.has("bloom")) errors.push("bloom is empty.");
  } else if (!bloom) {
    errors.push(
      `bloom "${v.bloom}" is not one of ${BLOOM_LEVELS.map((b) => BLOOM_LABEL[b]).join(", ")}.`,
    );
  }

  const marks = v.marks ? Number(v.marks) : NaN;
  if (!v.marks) {
    if (!failed.has("marks")) errors.push("marks is empty.");
  } else if (!(marks > 0 && marks <= 100))
    errors.push(`marks "${v.marks}" is not a number above 0 and at most 100.`);

  const type = v.type ? TYPE_BY_NAME.get(v.type.toLowerCase()) : undefined;
  if (!v.type) {
    if (!failed.has("type")) errors.push("type is empty.");
  } else if (!type) errors.push(`type "${v.type}" is not one of ${BANK_TYPES.join(", ")}.`);

  const program = v.programme
    ? PROGRAM_BY_NAME.get(v.programme.toLowerCase().replace(/\s+/g, ""))
    : "B_PHARM";
  if (!program) errors.push(`programme "${v.programme}" is not B.Pharm, M.Pharm or Pharm.D.`);

  const question = textDoc(v.question ?? "");
  if (question.length === 0 && !failed.has("question")) errors.push("question is empty.");

  const choiceCells = [v.choiceA, v.choiceB, v.choiceC, v.choiceD];
  const choices = choiceCells.filter((c): c is string => Boolean(c));
  const firstEmpty = choiceCells.findIndex((c) => !c);
  const filledInOrder = firstEmpty === -1 || choiceCells.slice(firstEmpty).every((c) => !c);
  let correct: number | undefined;
  if (v.correct && choices.length) {
    const k = v.correct.trim().toLowerCase().replace(/[().]/g, "");
    const idx = ["a", "b", "c", "d"].indexOf(k);
    if (idx < 0 || idx >= choices.length)
      errors.push(`correct "${v.correct}" is not one of the filled choices (a to d).`);
    else correct = idx;
  }
  if (choices.length) {
    if (type && type !== "OBJECTIVE") errors.push("choices are only for OBJECTIVE questions.");
    if (choices.length < 2) errors.push("an objective question needs at least two choices.");
    if (!filledInOrder) errors.push("fill the choices in order: a, b, c, d.");
  } else if (v.correct) {
    errors.push("correct is set but there are no choices.");
  }

  const tags = (v.tags ?? "")
    .split(";")
    .map((t) => t.trim())
    .filter(Boolean);
  if (tags.length > TAGS_MAX) errors.push(`more than ${TAGS_MAX} tags.`);

  if (errors.length) return { row, input: null, errors };

  const content: Doc = {
    type: "doc",
    content: [
      ...question,
      ...(choices.length
        ? [
            {
              type: "choices" as const,
              attrs: correct === undefined ? {} : { correct },
              content: choices.map((c) => ({
                type: "choice" as const,
                content: [{ type: "text" as const, text: c.replace(/\n+/g, " ") }],
              })),
            },
          ]
        : []),
    ],
  };
  const answer = textDoc(v.answer ?? "");
  return {
    row,
    errors: [],
    input: {
      courseId: null,
      courseCode,
      courseTitle: v.courseTitle ?? "",
      program,
      unit,
      coTag: co,
      bloomLevel: bloom as Bloom,
      marks,
      type: type as BankType,
      content,
      answerKey: answer.length ? { type: "doc", content: answer } : null,
      tags,
    },
  };
}

/** Header + data rows of a decoded file; blank rows are left out. */
export function readRows(text: string): { row: number; cells: CsvRow }[] {
  const records = parseCsv(text, CSV_MAX_ROWS + 1);
  const [header, ...data] = records;
  if (!header || header.every((h) => h.trim() === "")) throw new CsvFileError("The file is empty.");
  const keys = readHeader(header);
  const out: { row: number; cells: CsvRow }[] = [];
  data.forEach((cells, i) => {
    if (cells.every((c) => c.trim() === "")) return;
    const row: CsvRow = {};
    keys.forEach((k, j) => {
      if (k) row[k] = cells[j] ?? "";
    });
    out.push({ row: i + 2, cells: row });
  });
  if (out.length === 0) throw new CsvFileError("The file has headings but no questions.");
  return out;
}

// ---------- writing ----------

/** One CSV cell: formula guard (D80), then quoted when needed. */
export function csvCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/** A CSV file as Excel opens it: UTF-8 with BOM, CRLF line ends. */
export function toCsv(rows: string[][]): string {
  return `\uFEFF${rows.map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

/** The downloadable template: headings and two invented example rows. */
export function csvTemplate(): string {
  const headers = CSV_COLUMNS.map((c) => c.header);
  const ex = (o: Partial<Record<CsvKey, string>>) => CSV_COLUMNS.map((c) => o[c.key] ?? "");
  return toCsv([
    headers,
    ex({
      courseCode: "BP604T",
      unit: "1",
      co: "1",
      bloom: "Remember",
      marks: "1",
      type: "OBJECTIVE",
      question: "Which of these is an example of an invented drug class?",
      answer: "",
      tags: "example; delete this row",
      choiceA: "First option",
      choiceB: "Second option",
      choiceC: "Third option",
      choiceD: "Fourth option",
      correct: "b",
    }),
    ex({
      courseCode: "BP604T",
      unit: "2",
      co: "BP604T.02",
      bloom: "Understand",
      marks: "5",
      type: "SHORT",
      question: "Explain an invented process in your own words.",
      answer: "Points the answer should cover.",
      tags: "example",
    }),
  ]);
}
