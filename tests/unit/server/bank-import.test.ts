// CSV import end to end on a test database (WP-E, D80): preview with a
// row-by-row report, save of the valid rows only, the error report, the
// encoding reported, duplicates and hostile cells. Invented text only.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/data";
import { CsvFileError, decodeCsv, parseCsv } from "@/lib/bank/csv";
import { bankImport } from "@/server/bank-import";
import { createTestDb, type TestDb } from "../../support/db";

let t: TestDb;
let a: Actor;
let b: Actor;
const HEADER =
  "course code,unit,co,bloom,marks,type,question,answer,tags,choice a,choice b,correct";
const enc = (s: string) => new TextEncoder().encode(s);

beforeAll(async () => {
  t = await createTestDb();
  const u = await t.db.user.create({
    data: { name: "A", email: "a@example.com", passwordHash: "x", role: "FACULTY" },
  });
  const v = await t.db.user.create({
    data: { name: "B", email: "b@example.com", passwordHash: "x", role: "ADMIN" },
  });
  a = { userId: u.id, role: "FACULTY" };
  b = { userId: v.id, role: "ADMIN" };
  await t.db.course.create({
    data: {
      code: "XX604T",
      title: "Invented Course",
      program: "B_PHARM",
      semesterOrYear: 6,
      courseKind: "THEORY",
      credits: 4,
      lectureHrs: 3,
      tutorialHrs: 1,
      practicalHrs: 0,
      maxMarks: 100,
      sessionalMarks: 25,
      endSemMarks: 75,
      endSemMinutes: 180,
      outcomes: { create: [1, 2].map((n) => ({ number: n, text: `CO ${n}` })) },
      units: { create: [{ number: 1, title: "One", hours: 10 }] },
    },
  });
});

afterAll(async () => {
  await t.close();
});

const file = [
  HEADER,
  "XX604T,1,1,Remember,1,OBJECTIVE,Pick the invented option.,,,Alpha,Beta,b",
  'XX604T,1,CO2,Understand,5,SHORT,"Explain an invented idea, with commas,\nand a line break.",Key points.,tag one; tag two,,,',
  "XX604T,1,1,Remember,1,OBJECTIVE,PICK  the invented option.,,,Alpha,Beta,b",
  "XX604T,1,1,Remember,2,SHORT,Smile 😀 please.,,,,,",
  "XX604T,9,7,Apply,2,LONG,\\input{/etc/hosts} as plain text.,,,,,",
  "MPH101T,,MPH101T.03,Evaluate,10,LONG,=cmd|' /C calc'!A0 is only text.,,,,,",
  "XX604T,1,1,Bogus,2,SHORT,Bad level.,,,,,",
].join("\r\n");

describe("preview", () => {
  it("reports every row and the encoding; nothing is saved", async () => {
    const p = await bankImport(t.data, a).preview(enc(file));
    expect(p.encoding).toBe("UTF-8");
    expect(p.counts).toEqual({ valid: 4, invalid: 2, duplicate: 1 });
    expect(p.rows.map((r) => [r.row, r.status, r.reasons])).toEqual([
      [2, "valid", []],
      [3, "valid", []],
      [4, "duplicate", ["Same as row 2."]],
      [5, "invalid", [expect.stringMatching(/cannot be printed: 😀/)]],
      [6, "valid", []],
      [7, "valid", []],
      [8, "invalid", [expect.stringMatching(/^bloom "Bogus"/)]],
    ]);
    // D85: outside the syllabus lists is a warning, not a reason.
    expect(p.rows[4]?.warnings).toEqual([
      "CO XX604T.07 is not in the syllabus list for XX604T.",
      "Unit 9 is not in the syllabus list for XX604T.",
    ]);
    expect(p.rows[1]?.summary).toBe("Explain an invented idea, with commas, and a line break.");
    expect(await t.db.question.count()).toBe(0);
  });

  it("says Windows-1252 for an Excel file", async () => {
    const bytes = new Uint8Array([
      ...enc(`${HEADER}\r\nXX604T,1,1,Remember,1,SHORT,Caf`),
      0xe9,
      0x20,
      0x96,
      ...enc(" 5 "),
      0xb5,
      ...enc("g,,,,,"),
    ]);
    const p = await bankImport(t.data, a).preview(bytes);
    expect(p.encoding).toBe("Windows-1252");
    expect(p.rows[0]).toMatchObject({ status: "valid", summary: "Café – 5 µg" });
  });

  it("refuses a file it cannot read", async () => {
    await expect(bankImport(t.data, a).preview(enc("a;b;c\n1;2;3"))).rejects.toBeInstanceOf(
      CsvFileError,
    );
  });
});

describe("save", () => {
  it("saves only the valid rows, then finds them as duplicates", async () => {
    const r = await bankImport(t.data, a).save(enc(file));
    expect(r.saved).toBe(4);
    const list = await t.data.bank.list(a);
    expect(list.total).toBe(4);
    const tex = list.rows.find((x) => x.searchText?.startsWith("\\input"));
    expect(tex?.content.content[0]).toEqual({
      type: "paragraph",
      content: [{ type: "text", text: "\\input{/etc/hosts} as plain text." }],
    });
    const mpharm = list.rows.find((x) => x.courseCode === "MPH101T");
    expect(mpharm).toMatchObject({ courseId: null, coTag: "MPH101T.03", unit: null });
    const mcq = list.rows.find((x) => x.type === "OBJECTIVE");
    expect(mcq?.content.content[1]).toMatchObject({ type: "choices", attrs: { correct: 1 } });
    expect(list.rows.find((x) => x.marks === 5)?.tags).toEqual(["tag one", "tag two"]);

    const again = await bankImport(t.data, a).preview(enc(file));
    expect(again.counts).toEqual({ valid: 0, invalid: 2, duplicate: 5 });
    expect(again.rows[0]?.reasons).toEqual(["Already in your bank."]);
    expect(await bankImport(t.data, a).save(enc(file))).toMatchObject({ saved: 0 });
  });

  it("checks another person's import against their own bank only", async () => {
    const p = await bankImport(t.data, b).preview(enc(file));
    expect(p.counts.valid).toBe(4);
    expect((await t.data.bank.list(b)).total).toBe(0);
  });
});

describe("error report", () => {
  it("lists the rows not saved with reasons and the original cells, formula-guarded", async () => {
    const csv = await bankImport(t.data, b).report(enc(file));
    const { text, encoding } = decodeCsv(enc(csv));
    expect(encoding).toBe("UTF-8 (with BOM)");
    const rows = parseCsv(text, 20);
    expect(rows[0]?.slice(0, 4)).toEqual(["row", "status", "problem", "course code"]);
    expect(rows.slice(1).map((r) => [r[0], r[1]])).toEqual([
      ["4", "duplicate"],
      ["5", "invalid"],
      ["8", "invalid"],
    ]);
    const guarded = await bankImport(t.data, b).report(
      enc(`${HEADER}\r\nXX604T,1,1,Bogus,1,SHORT,=HYPERLINK(1),,,,,`),
    );
    expect(guarded).toContain(",'=HYPERLINK(1),");
  });
});
