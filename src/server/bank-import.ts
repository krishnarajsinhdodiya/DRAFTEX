// CSV import into the question bank (WP-E, D80). Stateless: the preview, the
// save and the error report each read the uploaded file again, so nothing
// with question text waits on the server between steps. A row is "valid",
// "invalid" (with reasons) or "duplicate" (of the actor's own bank, Trash
// included, or of an earlier row of the same file, D76). Same checks as the
// bank (bankFieldsSchema, bankCheck); the save re-checks in the data layer.
import { ZodError } from "zod";
import type { Actor, DataLayer } from "@/lib/data";
import { ALREADY_IN_BANK, ALREADY_IN_TRASH, dupKeyOf } from "@/lib/data/bank";
import {
  type CsvEncoding,
  CSV_COLUMNS,
  type CsvRow,
  decodeCsv,
  readRows,
  rowToInput,
  toCsv,
} from "@/lib/bank/csv";
import { type BankFieldsInput, bankCheck, bankFieldsSchema, plainText } from "@/lib/bank/question";
import { percent, similarTo } from "@/lib/bank/similar";

export type RowStatus = "valid" | "invalid" | "duplicate";

export interface PreviewRow {
  row: number;
  status: RowStatus;
  reasons: string[];
  /** Shown, never blocking (D85): CO or unit outside the syllabus lists. */
  warnings: string[];
  courseCode: string;
  /** The first 120 characters of the question, for the screen. */
  summary: string;
}

export interface ImportPreview {
  encoding: CsvEncoding;
  rows: PreviewRow[];
  counts: Record<RowStatus, number>;
}

interface Checked extends PreviewRow {
  input: BankFieldsInput | null;
  cells: CsvRow;
}

function zodReasons(e: ZodError): string[] {
  return e.issues.map((i) => {
    const field = String(i.path[0] ?? "");
    const name = field === "coTag" ? "co" : field === "courseCode" ? "course code" : field;
    return name ? `${name}: ${i.message}` : i.message;
  });
}

/** Reads and checks every row; throws CsvFileError for a file that cannot be read at all. */
async function check(data: DataLayer, actor: Actor, bytes: Uint8Array) {
  const { text, encoding } = decodeCsv(bytes);
  const rows = readRows(text);
  const courses = new Map<string, Awaited<ReturnType<DataLayer["bank"]["resolveCourse"]>>>();
  const ownKeys = new Map<string, Map<string, boolean>>();
  const inFile = new Map<string, number>();
  // Near-duplicates (D114): own questions per course, then earlier rows of this file.
  const ownTexts = new Map<string, { id: string; text: string }[]>();
  const fileTexts = new Map<string, { id: string; text: string }[]>();
  const out: Checked[] = [];
  for (const { row, cells } of rows) {
    const r = rowToInput(cells, row);
    const base = {
      row,
      cells,
      warnings: [] as string[],
      courseCode: (cells.courseCode ?? "").trim().toUpperCase().slice(0, 40),
      summary: (cells.question ?? "").replace(/\s+/g, " ").trim().slice(0, 120),
    };
    if (!r.input) {
      out.push({ ...base, status: "invalid", reasons: r.errors, input: null });
      continue;
    }
    const parsed = bankFieldsSchema.safeParse(r.input);
    if (!parsed.success) {
      out.push({ ...base, status: "invalid", reasons: zodReasons(parsed.error), input: null });
      continue;
    }
    const f = parsed.data;
    let course = courses.get(f.courseCode);
    if (!course) {
      course = await data.bank.resolveCourse(f);
      courses.set(f.courseCode, course);
    }
    const { errors, warnings } = bankCheck(f, course);
    if (errors.length) {
      out.push({ ...base, warnings, status: "invalid", reasons: errors, input: null });
      continue;
    }
    const key = dupKeyOf(f.content);
    const fileKey = `${course.code}\n${key}`;
    const earlier = inFile.get(fileKey);
    let keys = ownKeys.get(course.code);
    if (!keys) {
      keys = await data.bank.ownDupKeys(actor, course.code);
      ownKeys.set(course.code, keys);
    }
    const own = keys.get(key);
    const reason =
      earlier !== undefined
        ? `Same as row ${earlier}.`
        : own === true
          ? `${ALREADY_IN_BANK}.`
          : own === false
            ? `${ALREADY_IN_TRASH}.`
            : null;
    if (earlier === undefined) inFile.set(fileKey, row);
    if (!reason) {
      const text = plainText(f.content);
      let own = ownTexts.get(course.code);
      if (!own) {
        own = await data.bank.ownTexts(actor, course.code);
        ownTexts.set(course.code, own);
      }
      const rows = fileTexts.get(course.code) ?? [];
      const near = similarTo(text, [...own, ...rows], 1)[0];
      if (near) {
        warnings.push(
          near.id.startsWith("row:")
            ? `Reads almost the same as row ${near.id.slice(4)} (${percent(near.score)}).`
            : `Reads almost the same as a question already in your bank (${percent(near.score)}).`,
        );
      }
      rows.push({ id: `row:${row}`, text });
      fileTexts.set(course.code, rows);
    }
    out.push({
      ...base,
      summary: plainText(f.content).replace(/\s+/g, " ").slice(0, 120),
      warnings,
      status: reason ? "duplicate" : "valid",
      reasons: reason ? [reason] : [],
      input: reason ? null : r.input,
    });
  }
  return { encoding, rows: out };
}

function summarise(encoding: CsvEncoding, rows: Checked[]): ImportPreview {
  const counts = { valid: 0, invalid: 0, duplicate: 0 };
  for (const r of rows) counts[r.status] += 1;
  return {
    encoding,
    counts,
    rows: rows.map(({ row, status, reasons, warnings, courseCode, summary }) => ({
      row,
      status,
      reasons,
      warnings,
      courseCode,
      summary,
    })),
  };
}

export function bankImport(data: DataLayer, actor: Actor) {
  return {
    async preview(bytes: Uint8Array): Promise<ImportPreview> {
      const { encoding, rows } = await check(data, actor, bytes);
      return summarise(encoding, rows);
    },

    /** Saves the valid rows only, in one transaction; returns how many and the preview. */
    async save(bytes: Uint8Array): Promise<{ saved: number; preview: ImportPreview }> {
      const { encoding, rows } = await check(data, actor, bytes);
      const valid = rows.flatMap((r) => (r.status === "valid" && r.input ? [r.input] : []));
      try {
        const saved = valid.length ? await data.bank.createMany(actor, valid) : 0;
        return { saved, preview: summarise(encoding, rows) };
      } catch (e) {
        /* v8 ignore next -- the rows were checked just above with the same rules */
        if (e instanceof ZodError) throw new Error("A row changed between check and save.");
        throw e;
      }
    },

    /** The rows that were not saved, with the reason first and the original cells after. */
    async report(bytes: Uint8Array): Promise<string> {
      const { rows } = await check(data, actor, bytes);
      return toCsv([
        ["row", "status", "problem", ...CSV_COLUMNS.map((c) => c.header)],
        ...rows
          .filter((r) => r.status !== "valid")
          .map((r) => [
            String(r.row),
            r.status,
            r.reasons.join(" "),
            ...CSV_COLUMNS.map((c) => r.cells[c.key] ?? ""),
          ]),
      ]);
    },
  };
}
