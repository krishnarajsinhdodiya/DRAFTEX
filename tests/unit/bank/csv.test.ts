// CSV import parsing (D79, D80): encodings, RFC 4180 quoting, caps, header
// checks, row mapping and the formula guard on what DRAFTEX writes.
// Invented text only.
import { describe, expect, it } from "vitest";
import {
  CSV_COLUMNS,
  CSV_MAX_BYTES,
  CSV_MAX_ROWS,
  CsvFileError,
  coCell,
  csvCell,
  csvTemplate,
  decodeCsv,
  parseCsv,
  readHeader,
  readRows,
  rowToInput,
  toCsv,
} from "@/lib/bank/csv";

const HEADER = "course code,unit,co,bloom,marks,type,question,answer,tags";
const enc = (s: string) => new TextEncoder().encode(s);

describe("decodeCsv", () => {
  it("reads UTF-8 with a BOM and says so", () => {
    const r = decodeCsv(new Uint8Array([0xef, 0xbb, 0xbf, ...enc("a,b")]));
    expect(r).toEqual({ text: "a,b", encoding: "UTF-8 (with BOM)" });
  });
  it("reads plain UTF-8", () => {
    expect(decodeCsv(enc("café,µg"))).toEqual({ text: "café,µg", encoding: "UTF-8" });
  });
  it("falls back to Windows-1252 for an Excel file", () => {
    // "café – 5 µg" as Excel's "CSV (Comma delimited)" writes it on Windows.
    const bytes = new Uint8Array([
      0x63, 0x61, 0x66, 0xe9, 0x20, 0x96, 0x20, 0x35, 0x20, 0xb5, 0x67,
    ]);
    expect(decodeCsv(bytes)).toEqual({ text: "café – 5 µg", encoding: "Windows-1252" });
  });
  it("refuses UTF-16 by name and files over 1 MB", () => {
    expect(() => decodeCsv(new Uint8Array([0xff, 0xfe, 0x61, 0]))).toThrow(/UTF-16/);
    expect(() => decodeCsv(new Uint8Array([0xfe, 0xff, 0, 0x61]))).toThrow(/UTF-16/);
    expect(() => decodeCsv(new Uint8Array(CSV_MAX_BYTES + 1))).toThrow(/larger than 1 MB/);
  });
});

describe("parseCsv", () => {
  it("handles quoted commas, quotes and line breaks, with any line ending", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n"multi\r\nline",x\ny\rz', 10)).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["multi\nline", "x"],
      ["y"],
      ["z"],
    ]);
  });
  it("keeps empty cells and a missing last line end", () => {
    expect(parseCsv("a,,\n,b", 10)).toEqual([
      ["a", "", ""],
      ["", "b"],
    ]);
    expect(parseCsv("", 10)).toEqual([]);
  });
  it("names an unclosed quote and stops past the row cap", () => {
    expect(() => parseCsv('a\n"b,\nc', 10)).toThrow(/starts on line 2 is never closed/);
    expect(() => parseCsv("a\nb\nc\n", 2)).toThrow(/more than 1 rows/);
  });
  it("treats a quote inside an unquoted cell as text", () => {
    expect(parseCsv('5" tall,x', 10)).toEqual([['5" tall', "x"]]);
  });
});

describe("header", () => {
  it("maps names in any order and case", () => {
    expect(
      readHeader([
        "Question",
        " Course  Code ",
        "unit",
        "CO",
        "bloom",
        "marks",
        "type",
        "answer",
        "tags",
      ]),
    ).toEqual(["question", "courseCode", "unit", "co", "bloom", "marks", "type", "answer", "tags"]);
  });
  it("names unknown, repeated and missing columns, and semicolon files", () => {
    expect(() => readHeader([...HEADER.split(","), "extra"])).toThrow(/Unknown column: "extra"/);
    expect(() => readHeader([...HEADER.split(","), "tags"])).toThrow(/"tags" appears twice/);
    expect(() => readHeader(["course code", "question"])).toThrow(/Missing columns: unit, co/);
    expect(() => readHeader([HEADER.replace(/,/g, ";")])).toThrow(/semicolons/);
  });
  it("needs data rows and caps them", () => {
    expect(() => readRows("")).toThrow(/empty/);
    expect(() => readRows(`${HEADER}\n,,,\n`)).toThrow(/no questions/);
    const many = `${HEADER}\n${"X,1,1,Remember,1,SHORT,q,,\n".repeat(CSV_MAX_ROWS + 1)}`;
    expect(() => readRows(many)).toThrow(/more than 1,000 rows/);
    expect(
      readRows(`${HEADER}\n${"X,1,1,Remember,1,SHORT,q,,\n".repeat(CSV_MAX_ROWS)}`),
    ).toHaveLength(CSV_MAX_ROWS);
  });
  it("numbers rows as a spreadsheet does and skips blank ones", () => {
    const rows = readRows(`${HEADER}\nA,,,,,,q1,,\n\n,,,,,,,,\nB,,,,,,q2,,`);
    expect(rows.map((r) => [r.row, r.cells.courseCode])).toEqual([
      [2, "A"],
      [5, "B"],
    ]);
  });
});

describe("rowToInput", () => {
  const good = {
    courseCode: "xx604t",
    unit: "2",
    co: "CO 3",
    bloom: "analyze",
    marks: "2.5",
    type: "Short",
    question: "Line one\n\nLine two",
    answer: "An answer",
    tags: "a; b ;",
  };

  it("maps a good row; CO numbers become the course's tag", () => {
    const r = rowToInput(good, 2);
    expect(r.errors).toEqual([]);
    expect(r.input).toMatchObject({
      courseCode: "XX604T",
      unit: 2,
      coTag: "XX604T.03",
      bloomLevel: "ANALYZE",
      marks: 2.5,
      type: "SHORT",
      program: "B_PHARM",
      tags: ["a", "b"],
      answerKey: { type: "doc", content: [{ type: "paragraph" }] },
    });
    expect(r.input?.content.content).toHaveLength(2);
  });

  it("accepts labels, elective codes, programmes and an empty unit or answer", () => {
    const r = rowToInput(
      {
        ...good,
        courseCode: "XX607T  AEC1",
        co: "1",
        bloom: "Analyse",
        type: "objective (mcq)",
        unit: "",
        answer: "",
        programme: "M.Pharm",
      },
      3,
    );
    expect(r.input).toMatchObject({
      coTag: "XX607T.01 AEC1",
      bloomLevel: "ANALYZE",
      type: "OBJECTIVE",
      unit: null,
      answerKey: null,
      program: "M_PHARM",
    });
    expect(coCell("bp604t.02", "BP604T")).toBe("BP604T.02");
  });

  it("builds choices for objective rows", () => {
    const r = rowToInput(
      { ...good, type: "MCQ", choiceA: "One", choiceB: "Two", choiceC: "Three", correct: "(c)" },
      2,
    );
    expect(r.input?.content.content.at(-1)).toEqual({
      type: "choices",
      attrs: { correct: 2 },
      content: ["One", "Two", "Three"].map((t) => ({
        type: "choice",
        content: [{ type: "text", text: t }],
      })),
    });
  });

  it("names every problem in a bad row", () => {
    const r = rowToInput(
      {
        courseCode: "",
        unit: "2.5",
        co: "",
        bloom: "Memorise",
        marks: "0",
        type: "Essay",
        question: "",
        programme: "D.Pharm",
        choiceA: "only",
        choiceC: "gap",
        correct: "e",
        tags: Array.from({ length: 11 }, (_, i) => `t${i}`).join(";"),
      },
      9,
    );
    expect(r).toMatchObject({ row: 9, input: null });
    expect(r.errors).toEqual([
      "course code is empty.",
      'unit "2.5" is not a whole number from 1 to 20.',
      "co is empty.",
      expect.stringMatching(/^bloom "Memorise" is not one of Remember, Understand/),
      'marks "0" is not a number above 0 and at most 100.',
      expect.stringMatching(/^type "Essay" is not one of OBJECTIVE/),
      'programme "D.Pharm" is not B.Pharm, M.Pharm or Pharm.D.',
      "question is empty.",
      'correct "e" is not one of the filled choices (a to d).',
      "fill the choices in order: a, b, c, d.",
      "more than 10 tags.",
    ]);
    expect(rowToInput({ ...good, choiceA: "x" }, 2).errors).toEqual([
      "choices are only for OBJECTIVE questions.",
      "an objective question needs at least two choices.",
    ]);
    expect(rowToInput({ ...good, correct: "a" }, 2).errors).toEqual([
      "correct is set but there are no choices.",
    ]);
    expect(rowToInput({ ...good, bloom: "", marks: "", type: "" }, 2).errors).toEqual([
      "bloom is empty.",
      "marks is empty.",
      "type is empty.",
    ]);
  });

  it("handles hostile cells as plain text or a named error", () => {
    const tex = rowToInput(
      { ...good, question: "\\input{/etc/hosts} \\csname input\\endcsname" },
      2,
    );
    expect(tex.input?.content.content[0]).toEqual({
      type: "paragraph",
      content: [{ type: "text", text: "\\input{/etc/hosts} \\csname input\\endcsname" }],
    });
    const formula = rowToInput({ ...good, question: "=cmd|' /C calc'!A0", tags: "@x" }, 2);
    expect(formula.errors).toEqual([]);
    expect(rowToInput({ ...good, question: "'=1+1" }, 2).input?.content.content[0]).toMatchObject({
      content: [{ text: "=1+1" }],
    });
    expect(rowToInput({ ...good, question: "x".repeat(4001) }, 2).errors).toEqual([
      "question is longer than 4,000 characters.",
    ]);
    expect(rowToInput({ ...good, co: "1".repeat(101) }, 2).errors).toEqual([
      "co is longer than 100 characters.",
    ]);
    expect(rowToInput({ ...good, question: "bell\u0007 nul\u0000" }, 2).errors).toEqual([
      "question contains control characters that cannot be printed: U+0007, U+0000.",
    ]);
  });
});

describe("writing", () => {
  it("guards formulas and quotes when needed", () => {
    expect(["=1+1", "+x", "-y", "@z", "\tq", "plain", 'a"b', "a,b", "a\nb"].map(csvCell)).toEqual([
      "'=1+1",
      "'+x",
      "'-y",
      "'@z",
      "'\tq",
      "plain",
      '"a""b"',
      '"a,b"',
      '"a\nb"',
    ]);
    expect(toCsv([["a", "b"]])).toBe("\uFEFFa,b\r\n");
  });
  it("writes a template that reads back as two valid rows", () => {
    const t = csvTemplate();
    const { text, encoding } = decodeCsv(enc(t));
    expect(encoding).toBe("UTF-8 (with BOM)");
    const rows = readRows(text);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => rowToInput(r.cells, r.row).errors)).toEqual([[], []]);
    expect(text.split("\r\n")[0]).toBe(CSV_COLUMNS.map((c) => c.header).join(","));
  });
  it("round-trips its own output, guards included", () => {
    const cells = ["=SUM(A1)", "line\nbreak", 'quote "x"', "-5"];
    const back = parseCsv(decodeCsv(enc(toCsv([cells]))).text, 5)[0];
    expect(back?.map((c) => c.replace(/^'(?=[=+\-@])/, ""))).toEqual(cells);
  });
});

describe("CsvFileError", () => {
  it("is a named error class", () => {
    expect(new CsvFileError("x").name).toBe("CsvFileError");
  });
});
