// Near-duplicates in the data layer and CSV import (D114) and their gate 8
// rule: only the actor's own questions, in the same course, not in Trash,
// are ever compared or named; colleagues' (shared or not) never. Invented text.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/data";
import type { BankFieldsInput } from "@/lib/bank/question";
import { bankImport } from "@/server/bank-import";
import { createTestDb, type TestDb } from "../../support/db";

let t: TestDb;
let a: Actor;
let b: Actor;
let admin: Actor;

const BASE = "Explain the mechanism of action of beta blockers with a neat diagram.";
const NEAR = "Explain the mechanism of action of beta blockers with a diagram.";
const OTHER = "Write a note on the packaging of tablets in strip packs.";

function fields(text: string, courseCode = "XX701T"): BankFieldsInput {
  return {
    courseId: null,
    courseCode,
    courseTitle: "Invented course",
    program: "M_PHARM",
    coTag: `${courseCode}.01`,
    bloomLevel: "UNDERSTAND",
    marks: 5,
    type: "SHORT",
    content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] },
  };
}

async function makeUser(email: string, role: "ADMIN" | "FACULTY"): Promise<Actor> {
  const u = await t.db.user.create({ data: { name: email, email, passwordHash: "x", role } });
  return { userId: u.id, role };
}

let base: string;

beforeAll(async () => {
  t = await createTestDb();
  a = await makeUser("author@example.test", "FACULTY");
  b = await makeUser("colleague@example.test", "FACULTY");
  admin = await makeUser("admin@example.test", "ADMIN");
  base = (await t.data.bank.create(a, fields(BASE))).question.id;
  await t.data.bank.create(a, fields(OTHER));
  // A colleague's shared question that reads almost the same must never be named to a.
  const theirs = (await t.data.bank.create(b, fields(NEAR))).question.id;
  await t.data.bank.setSharing(b, theirs, "SHARED");
});
afterAll(() => t.close());

describe("on save (D114)", () => {
  it("names the actor's own near question in the same course", async () => {
    const r = await t.data.bank.create(a, fields(NEAR));
    expect(r.duplicates).toEqual([]);
    expect(r.similar.map((s) => s.id)).toEqual([base]);
    expect(r.similar[0]!.summary).toBe(BASE);
    expect((await t.data.bank.get(a, base)).similar.map((s) => s.id)).toEqual([r.question.id]);
  });

  it("ignores other courses, Trash, and the exact copy (reported as a duplicate)", async () => {
    expect((await t.data.bank.create(a, fields(NEAR, "XX702T"))).similar).toEqual([]);
    const exact = await t.data.bank.create(a, fields(BASE.toUpperCase()));
    expect(exact.duplicates).toHaveLength(1);
    expect(exact.similar.map((s) => s.id)).not.toContain(base);
  });

  it("never compares with or names a colleague's question, for anyone", async () => {
    const mine = await t.data.bank.create(b, fields(BASE));
    // b's own near question is theirs; a's questions are never listed.
    expect(mine.similar.every((s) => s.summary === NEAR)).toBe(true);
    for (const who of [b, admin]) {
      const pairs = await t.data.bank.possibleDuplicates(who);
      const ids = pairs.flatMap((p) => [p.a.id, p.b.id]);
      expect(ids).not.toContain(base);
    }
    const sharedToA = (await t.data.bank.list(a, { scope: "shared" })).rows[0]!;
    expect((await t.data.bank.get(a, sharedToA.id)).similar).toEqual([]);
  });
});

describe("possible duplicates view (D114)", () => {
  it("lists own pairs only, most alike first, and drops a question moved to Trash", async () => {
    const pairs = await t.data.bank.possibleDuplicates(a);
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs.every((p) => p.courseCode === "XX701T")).toBe(true);
    expect(pairs.some((p) => p.a.id === base || p.b.id === base)).toBe(true);
    for (let i = 1; i < pairs.length; i++) {
      expect(pairs[i - 1]!.score).toBeGreaterThanOrEqual(pairs[i]!.score);
    }
    await t.data.bank.remove(a, base);
    const after = await t.data.bank.possibleDuplicates(a);
    expect(after.some((p) => p.a.id === base || p.b.id === base)).toBe(false);
    await t.data.bank.restore(a, base);
  });
});

describe("CSV import (D114)", () => {
  const HEADER = "course code,unit,co,bloom,marks,type,question,answer,tags";
  const enc = (s: string) => new TextEncoder().encode(s);

  it("warns on a row like a bank question or an earlier row, and still saves it", async () => {
    const file = [
      HEADER,
      `XX701T,,XX701T.01,Understand,5,SHORT,Explain the mechanism of action of beta blockers.,,`,
      `XX703T,,XX703T.01,Understand,5,SHORT,Describe the evaluation tests for capsules such as weight variation.,,`,
      `XX703T,,XX703T.01,Understand,5,SHORT,Describe the evaluation tests for capsules like weight variation.,,`,
    ].join("\r\n");
    const p = await bankImport(t.data, a).preview(enc(file));
    expect(p.counts.valid).toBe(3);
    expect(p.rows[0]!.warnings.join(" ")).toMatch(
      /Reads almost the same as a question already in your bank \(\d+%\)\./,
    );
    expect(p.rows[1]!.warnings).toEqual([]);
    expect(p.rows[2]!.warnings.join(" ")).toMatch(/Reads almost the same as row 3 \(\d+%\)\./);
    // A colleague importing the same file is compared with their own bank only.
    const q = await bankImport(t.data, admin).preview(enc(file));
    expect(q.rows[0]!.warnings).toEqual([]);
  });
});
