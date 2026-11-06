// Gate 6 for the CSV import (WP-E): 200 random rows made of LaTeX specials,
// primitives (\input, \csname, ^^5c), formula starts (= + - @), quotes,
// commas, line breaks, accents, emoji and control characters are written as a
// real CSV file, read back, and every row is either refused with a named
// reason or becomes a question that compiles with no errors (line-fitting
// notes allowed, as in the editor fuzz). Batches of 20 in the MCQ group.
import { beforeAll, describe, expect, it } from "vitest";
import { CSV_COLUMNS, decodeCsv, readRows, rowToInput, toCsv } from "@/lib/bank/csv";
import { bankCheck } from "@/lib/bank/question";
import type { CompileService } from "@/lib/latex/compile";
import { goldenFailures } from "@/lib/latex/log";
import { serializePaper } from "@/lib/latex/serialize";
import { type Doc, type PaperInput, docSchema } from "@/lib/paper/schema";
import { realCompileService } from "../support/engine";
import { pciEndSem4CreditKsv } from "../fixtures/papers/templates";

const COUNT = 200;
const BATCH = 20;
const SEED = 20261106;

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PIECES = [
  "\\input{/etc/hosts}",
  "\\csname input\\endcsname",
  "^^5cinput",
  "\\write18{calc}",
  "\\def\\x{}",
  "$x$",
  "=cmd|' /C calc'!A0",
  "+SUM(A1)",
  "-2+3",
  "@IMPORT",
  '"quoted, text"',
  "a,b,c",
  "line\nbreak",
  "line\r\nbreak",
  "% # & _ { } ~ ^",
  "37°C ±2 µg",
  "naïve café",
  "α-receptor",
  "50% w/v",
  "😀",
  "\u0007",
  "\u200b",
  "invented",
  "word",
  "tablet",
];

const rand = mulberry32(SEED);
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)] as T;
const text = () => Array.from({ length: 1 + Math.floor(rand() * 6) }, () => pick(PIECES)).join(" ");

const rows = Array.from({ length: COUNT }, (_, i) => {
  const objective = i % 3 === 0;
  const cells: Record<string, string> = {
    "course code": "XX604T",
    unit: "1",
    co: String(1 + (i % 3)),
    bloom: "Apply",
    marks: "1",
    type: objective ? "OBJECTIVE" : "SHORT",
    question: text(),
    answer: i % 2 ? text() : "",
    tags: i % 4 ? "fuzz" : "",
    "choice a": objective ? text() : "",
    "choice b": objective ? text() : "",
    correct: objective ? "a" : "",
  };
  return CSV_COLUMNS.map((c) => cells[c.header] ?? "");
});
const csv = toCsv([CSV_COLUMNS.map((c) => c.header), ...rows]);

const course = {
  code: "XX604T",
  outcomes: [{ number: 1 }, { number: 2 }, { number: 3 }],
  units: [],
};
const accepted: Doc[] = [];
const refused: string[][] = [];

let svc: CompileService;
beforeAll(() => {
  svc = realCompileService();
  const { text: decoded } = decodeCsv(new TextEncoder().encode(csv));
  for (const { row, cells } of readRows(decoded)) {
    const r = rowToInput(cells, row);
    if (!r.input) {
      refused.push(r.errors);
      continue;
    }
    const content = docSchema.parse(r.input.content) as Doc;
    const { errors } = bankCheck(
      { coTag: r.input.coTag, unit: null, content, answerKey: null },
      course,
    );
    if (errors.length) refused.push(errors);
    else accepted.push(content);
  }
});

describe("CSV import fuzz (gate 6)", () => {
  it("reads every row back and gives each refused one a reason", () => {
    expect(accepted.length + refused.length).toBe(COUNT);
    expect(accepted.length).toBeGreaterThan(COUNT / 3);
    expect(refused.length).toBeGreaterThan(0);
    // Only the unprintable pieces make a row fail; each failure names them.
    for (const r of refused) {
      expect(r.some((m) => /cannot be printed/.test(m))).toBe(true);
    }
  });

  it.each(Array.from({ length: COUNT / BATCH }, (_, i) => i))(
    "batch %i of accepted rows compiles",
    async (b) => {
      const docs = accepted.slice(b * BATCH, (b + 1) * BATCH);
      if (docs.length === 0) return;
      const paper: PaperInput = {
        template: pciEndSem4CreditKsv,
        meta: {},
        emptySlots: "OMIT",
        slots: docs.map((content, i) => ({ groupKey: "g1", position: i + 1, content })),
      };
      const ser = serializePaper(paper);
      if (!ser.ok) throw new Error(ser.issues.map((x) => `${x.slotId}: ${x.message}`).join("\n"));
      // Primitives arrive as escaped text, never as commands.
      expect(ser.tex).not.toMatch(/\\input\{\/etc/);
      const res = await svc.compile({ userId: "fuzz", tex: ser.tex, slotRanges: ser.slotRanges });
      const failures = goldenFailures(res.diagnostics)
        .filter((d) => d.kind !== "overfull" && d.kind !== "underfull")
        .map((d) => `${d.slotId ?? "-"}: ${d.message}`);
      expect(failures).toEqual([]);
    },
    120_000,
  );
});
