// The question bank's data layer (Phase 11) and its gate 8 rules:
//   a user sees bank question Q only when Q is not in Trash and (the user
//   wrote Q, or Q is SHARED, or Q's author shares Q's course) (D73);
//   only the author may change, share, delete or restore Q (D74);
//   usage history is per user (D75); admins get nothing extra.
// Every other-person call uses the exact ID (guessed IDs). Invented text only.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/data";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/data";
import { InvalidQuestionError } from "@/lib/data/errors";
import type { BankFieldsInput } from "@/lib/bank/question";
import type { Doc } from "@/lib/paper/schema";
import { createTestDb, type TestDb } from "../../support/db";
import { paperMeta, templateFields, testSlot } from "./fixtures";

let t: TestDb;
let a: Actor; // author
let b: Actor; // colleague
let admin: Actor;
let courseId: string;
let templateId: string;
let q1: string; // private
let q2: string; // SHARED
let q3: string; // course XX605T, shared by course
const SHA = "c".repeat(64);

const para = (text: string) => ({
  type: "paragraph" as const,
  content: [{ type: "text" as const, text }],
});
const doc = (...content: Doc["content"]): Doc => ({ type: "doc", content });

function fields(text: string, over: Partial<BankFieldsInput> = {}): BankFieldsInput {
  return {
    courseId,
    courseCode: "XX604T",
    coTag: "XX604T.01",
    bloomLevel: "REMEMBER",
    marks: 2,
    type: "SHORT",
    content: doc(para(text)),
    ...over,
  };
}

async function makeUser(email: string, role: "ADMIN" | "FACULTY"): Promise<Actor> {
  const u = await t.db.user.create({ data: { name: email, email, passwordHash: "x", role } });
  return { userId: u.id, role };
}

async function makeCourse(code: string, outcomes: number) {
  const c = await t.db.course.create({
    data: {
      code,
      title: `Invented ${code}`,
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
      outcomes: {
        create: Array.from({ length: outcomes }, (_, i) => ({
          number: i + 1,
          text: `CO ${i + 1}`,
        })),
      },
      units: { create: [{ number: 1, title: "Unit one", hours: 10 }] },
    },
  });
  return c.id;
}

const notFound = expect.any(NotFoundError) as unknown;

beforeAll(async () => {
  t = await createTestDb();
  a = await makeUser("author@example.com", "FACULTY");
  b = await makeUser("colleague@example.com", "FACULTY");
  admin = await makeUser("admin@example.com", "ADMIN");
  courseId = await makeCourse("XX604T", 3);
  await makeCourse("XX605T", 2);
  await makeCourse("XX607T AEC1", 2);
  await makeCourse("XX699I", 0);
  templateId = (await t.data.templates.create(a, templateFields("Bank template"))).id;
  await t.data.templates.setVisibility(a, templateId, "GLOBAL");
  q1 = (await t.data.bank.create(a, fields("Private invented question."))).question.id;
  q2 = (await t.data.bank.create(a, fields("Shared invented question."))).question.id;
  await t.data.bank.setSharing(a, q2, "SHARED");
  q3 = (
    await t.data.bank.create(
      a,
      fields("Course-shared invented question.", {
        courseId: null,
        courseCode: "xx605t",
        coTag: "XX605T.02",
      }),
    )
  ).question.id;
  await t.data.bank.setCourseShare(a, "XX605T", true);
});

afterAll(async () => {
  await t.close();
});

describe("saving (D72 amended, D77, D85)", () => {
  it("stores the catalogue course's code, title and programme", async () => {
    const q = await t.data.bank.get(a, q1);
    expect(q).toMatchObject({
      courseCode: "XX604T",
      courseTitle: "Invented XX604T",
      warnings: [],
    });
    expect(q.searchText).toBe("Private invented question.");
  });

  it("links a typed catalogue code and saves a CO the syllabus does not list, with a warning (D85)", async () => {
    const q = await t.data.bank.get(a, q3);
    expect(q.courseId).not.toBeNull();
    const r = await t.data.bank.create(
      a,
      fields("Old-syllabus invented question.", {
        courseId: null,
        courseCode: "XX605T",
        courseTitle: "Old title typed by the user",
        coTag: "XX605T.05",
      }),
    );
    expect(r.warnings).toEqual(["CO XX605T.05 is not in the syllabus list for XX605T."]);
    expect(r.question.courseTitle).toBe("Old title typed by the user");
    expect((await t.data.bank.get(a, r.question.id)).warnings).toEqual(r.warnings);
  });

  it("takes courses outside the catalogue with a CO of that code", async () => {
    const r = await t.data.bank.create(
      a,
      fields("An M.Pharm invented question.", {
        courseId: null,
        courseCode: "MPH101T",
        courseTitle: "Invented Advanced Course",
        program: "M_PHARM",
        coTag: "MPH101T.07",
        unit: 5,
      }),
    );
    const q = await t.data.bank.get(a, r.question.id);
    expect(q).toMatchObject({ courseId: null, program: "M_PHARM", warnings: [], unit: 5 });
    const odd = await t.data.bank.create(
      a,
      fields("y", { courseId: null, courseCode: "MPH101T", coTag: "CO1" }),
    );
    expect(odd.warnings[0]).toMatch(/does not look like a CO of MPH101T/);
    await expect(
      t.data.bank.create(a, fields(" ", { courseId: null, courseCode: "MPH101T" })),
    ).rejects.toBeInstanceOf(InvalidQuestionError);
  });

  it("knows elective tags (D63) and courses without COs", async () => {
    await expect(
      t.data.bank.create(
        a,
        fields("Elective invented question.", {
          courseId: null,
          courseCode: "XX607T AEC1",
          coTag: "XX607T.02 AEC1",
        }),
      ),
    ).resolves.toBeTruthy();
    const z = await t.data.bank.create(
      a,
      fields("z", { courseId: null, courseCode: "XX607T AEC1", coTag: "XX607TAEC1.02" }),
    );
    expect(z.warnings[0]).toMatch(/not in the syllabus list/);
    await expect(
      t.data.bank.create(
        a,
        fields("Internship invented question.", {
          courseId: null,
          courseCode: "XX699I",
          coTag: "XX699I.03",
        }),
      ),
    ).resolves.toBeTruthy();
  });

  it("refuses a missing Bloom level, a missing CO and another person's picture", async () => {
    await expect(
      t.data.bank.create(a, { ...fields("w"), bloomLevel: undefined as never }),
    ).rejects.toThrow();
    await expect(
      t.data.bank.create(a, { ...fields("w"), coTag: undefined as never }),
    ).rejects.toThrow();
    expect((await t.data.bank.create(a, fields("w", { unit: 3 }))).warnings).toEqual([
      "Unit 3 is not in the syllabus list for XX604T.",
    ]);
    await t.data.assets.add(b, {
      sha256: SHA,
      mime: "image/png",
      bytes: 10,
      originalName: "b.png",
    });
    await expect(
      t.data.bank.create(
        a,
        fields("pic", { content: doc({ type: "image", attrs: { sha256: SHA, ext: "png" } }) }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses Advanced LaTeX without permission", async () => {
    await expect(
      t.data.bank.create(
        a,
        fields("adv", {
          content: doc(para("adv"), { type: "advancedLatex", attrs: { latex: "x" } }),
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("warns, never blocks, on a duplicate written by hand (D76)", async () => {
    const r = await t.data.bank.create(a, fields("PRIVATE  invented question."));
    expect(r.duplicates).toEqual([{ id: q1, deletedAt: null }]);
    expect((await t.data.bank.get(a, r.question.id)).duplicates).toBe(1);
    await t.data.bank.remove(a, r.question.id);
  });

  it("updates with the version and rejects a stale one", async () => {
    const r = await t.data.bank.create(a, fields("Versioned invented question."));
    const u = await t.data.bank.update(
      a,
      r.question.id,
      1,
      fields("Versioned, changed.", { marks: 4 }),
    );
    expect(u.question).toMatchObject({ version: 2, marks: 4 });
    await expect(t.data.bank.update(a, r.question.id, 1, fields("again"))).rejects.toBeInstanceOf(
      ConflictError,
    );
  });
});

describe.each([
  ["a colleague", () => b],
  ["an administrator", () => admin],
])("gate 8: what %s may do", (_label, who) => {
  it("never lists, gets or searches a private question", async () => {
    const all = await t.data.bank.list(who());
    const ids = all.rows.map((r) => r.id);
    expect(ids).not.toContain(q1);
    expect(ids).toEqual(expect.arrayContaining([q2, q3]));
    expect((await t.data.bank.list(who(), { q: "private" })).rows).toEqual([]);
    expect((await t.data.bank.list(who(), { scope: "mine" })).rows.map((r) => r.id)).not.toContain(
      q2,
    );
    await expect(t.data.bank.get(who(), q1)).rejects.toEqual(notFound);
    await expect(t.data.bank.copyToMine(who(), q1)).rejects.toEqual(notFound);
    expect((await t.data.bank.filterOptions(who())).map((c) => c.code)).toEqual([
      "XX604T",
      "XX605T",
    ]);
  });

  it("cannot change, share, trash, restore or purge any of A's questions", async () => {
    for (const id of [q1, q2, q3]) {
      await expect(t.data.bank.update(who(), id, 1, fields("hijack"))).rejects.toEqual(notFound);
      await expect(t.data.bank.setSharing(who(), id, "PRIVATE")).rejects.toEqual(notFound);
      await expect(t.data.bank.remove(who(), id)).rejects.toEqual(notFound);
      await expect(t.data.bank.restore(who(), id)).rejects.toEqual(notFound);
      await expect(t.data.bank.purge(who(), id)).rejects.toEqual(notFound);
    }
    expect(await t.data.bank.emptyTrash(who())).toBe(0);
    expect((await t.data.bank.get(a, q2)).sharing).toBe("SHARED");
  });

  it("cannot insert a private question, nor into A's paper", async () => {
    const own = await t.data.papers.create(who(), templateId, paperMeta());
    await expect(
      t.data.bank.insert(who(), q1, own.id, { groupKey: "g2", position: 1 }),
    ).rejects.toEqual(notFound);
    const aPaper = await t.data.papers.create(a, templateId, paperMeta());
    await expect(
      t.data.bank.insert(who(), q2, aPaper.id, { groupKey: "g2", position: 1 }),
    ).rejects.toEqual(notFound);
    await expect(t.data.bank.addFromPaper(who(), aPaper.id)).rejects.toEqual(notFound);
  });
});

describe("sharing changes (D73, D74)", () => {
  it("hides a question again when unshared or put in Trash", async () => {
    await t.data.bank.setSharing(a, q2, "PRIVATE");
    await expect(t.data.bank.get(b, q2)).rejects.toEqual(notFound);
    await t.data.bank.setSharing(a, q2, "SHARED");
    await t.data.bank.remove(a, q2);
    await expect(t.data.bank.get(b, q2)).rejects.toEqual(notFound);
    expect((await t.data.bank.listTrash(b)).map((x) => x.id)).not.toContain(q2);
    await t.data.bank.restore(a, q2);
    await expect(t.data.bank.get(b, q2)).resolves.toBeTruthy();
  });

  it("covers new questions of a shared course and stops when the share ends", async () => {
    const later = (
      await t.data.bank.create(
        a,
        fields("Later course question.", {
          courseId: null,
          courseCode: "XX605T",
          coTag: "XX605T.01",
        }),
      )
    ).question.id;
    await expect(t.data.bank.get(b, later)).resolves.toMatchObject({ courseShared: true });
    expect((await t.data.bank.courseShares(a)).map((s) => s.courseCode)).toEqual(["XX605T"]);
    await t.data.bank.setCourseShare(a, "XX605T", false);
    await expect(t.data.bank.get(b, later)).rejects.toEqual(notFound);
    await expect(t.data.bank.get(b, q3)).rejects.toEqual(notFound);
    expect(await t.data.bank.courseShares(b)).toEqual([]);
    await t.data.bank.setCourseShare(a, "XX605T", true);
  });

  it("copies a shared question to the colleague's bank, privately, once", async () => {
    const copy = await t.data.bank.copyToMine(b, q2);
    expect(copy).toMatchObject({ ownerId: b.userId, sharing: "PRIVATE" });
    await expect(t.data.bank.copyToMine(b, q2)).rejects.toThrow(/Already in your bank/);
    await expect(t.data.bank.copyToMine(a, q2)).rejects.toThrow(/already yours/);
    await expect(t.data.bank.get(a, copy.id)).rejects.toEqual(notFound);
  });

  it("does not compare a colleague's new question with A's private ones", async () => {
    const r = await t.data.bank.create(b, fields("Private invented question."));
    expect(r.duplicates).toEqual([]);
  });
});

describe("insert and usage history (D75, D78)", () => {
  it("copies a shared question into a slot and records the use for the inserter only", async () => {
    const paper = await t.data.papers.create(
      b,
      templateId,
      paperMeta({ title: "B's invented paper" }),
    );
    const r = await t.data.bank.insert(b, q2, paper.id, { groupKey: "g2", position: 1 });
    expect(r.marksDiffer).toBe(true);
    const full = await t.data.papers.getWithSlots(b, paper.id);
    const slot = full.slots[0];
    expect(slot).toMatchObject({
      marks: 4,
      coTag: "XX604T.01",
      bloomLevel: "REMEMBER",
      questionId: q2,
    });
    expect((await t.data.bank.get(b, q2)).uses.map((u) => u.paperTitle)).toEqual([
      "B's invented paper",
    ]);
    expect((await t.data.bank.get(a, q2)).uses).toEqual([]);
    const listed = (await t.data.bank.list(a)).rows.find((x) => x.id === q2);
    expect(listed?.lastUse).toBeNull();
    // Later edits on either side do not touch the other.
    await t.data.bank.update(
      a,
      q2,
      (await t.data.bank.get(a, q2)).version,
      fields("Changed in bank."),
    );
    const after = await t.data.papers.getWithSlots(b, paper.id);
    expect(after.slots[0]?.content).toEqual(doc(para("Shared invented question.")));
  });

  it("copies a shared question's pictures to the inserter (D22 pattern)", async () => {
    const pic = "d".repeat(64);
    await t.data.assets.add(a, { sha256: pic, mime: "image/png", bytes: 5, originalName: "a.png" });
    const id = (
      await t.data.bank.create(
        a,
        fields("With a picture.", {
          content: doc(para("With a picture."), {
            type: "image",
            attrs: { sha256: pic, ext: "png" },
          }),
        }),
      )
    ).question.id;
    await t.data.bank.setSharing(a, id, "SHARED");
    const paper = await t.data.papers.create(b, templateId, paperMeta());
    await t.data.bank.insert(b, id, paper.id, { groupKey: "g3", position: 2 });
    expect(await t.db.asset.count({ where: { ownerId: b.userId, sha256: pic } })).toBe(1);
  });

  it("refuses a Final paper and a place the paper does not have", async () => {
    const paper = await t.data.papers.create(a, templateId, paperMeta());
    await expect(
      t.data.bank.insert(a, q1, paper.id, { groupKey: "g2", position: 99 }),
    ).rejects.toEqual(notFound);
    await t.data.papers.update(a, paper.id, 1, { status: "FINAL" });
    await expect(
      t.data.bank.insert(a, q1, paper.id, { groupKey: "g2", position: 1 }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("add from a paper (D76, D77)", () => {
  it("adds tagged questions, skipping with reasons, then skips them as duplicates", async () => {
    const paper = await t.data.papers.create(
      a,
      templateId,
      paperMeta({ title: "Source paper", courseId, courseCode: "XX604T" }),
    );
    const slot = (g: string, n: number, text: string, over = {}) =>
      t.data.papers.saveSlot(a, paper.id, {
        ...testSlot({ groupKey: g, position: n, marks: g === "g2" ? 4 : 1 }),
        content: doc(para(text)),
        ...over,
      });
    await slot("g1", 1, "Objective invented one.", { coTag: "XX604T.02", bloomLevel: "APPLY" });
    await slot("g1", 2, "No level.", { coTag: "XX604T.02" });
    await slot("g1", 3, "No CO.", { bloomLevel: "APPLY" });
    await slot("g1", 4, "Wrong CO.", { coTag: "XX605T.01", bloomLevel: "APPLY" });
    await slot("g1", 5, "objective  INVENTED one.", { coTag: "XX604T.02", bloomLevel: "APPLY" });
    await slot("g2", 1, "Private invented question.", { coTag: "XX604T.01", bloomLevel: "APPLY" });
    await slot("g2", 2, "Printable? 😀", { coTag: "XX604T.01", bloomLevel: "APPLY" });

    const first = await t.data.bank.addFromPaper(a, paper.id);
    expect(first.added.map(({ label, warning }) => ({ label, warning }))).toEqual([
      { label: "Q.1(1)", warning: undefined },
      { label: "Q.1(4)", warning: "CO XX605T.01 is not in the syllabus list for XX604T." },
    ]);
    expect(first.skipped).toEqual([
      { label: "Q.1(2)", reason: "No Bloom level." },
      { label: "Q.1(3)", reason: "No CO." },
      { label: "Q.1(5)", reason: "Same as Q.1(1) on this paper." },
      { label: "Q.2(1)", reason: "Already in your bank." },
      { label: "Q.2(2)", reason: expect.stringMatching(/cannot be printed/) as unknown },
    ]);
    const added = await t.data.bank.get(a, first.added[0]?.id ?? "");
    expect(added).toMatchObject({ type: "OBJECTIVE", marks: 1, sourcePaperId: paper.id });
    expect(added.uses.map((u) => u.paperTitle)).toEqual(["Source paper"]);

    await t.data.bank.remove(a, added.id);
    const again = await t.data.bank.addFromPaper(a, paper.id, { groupKey: "g1", position: 1 });
    expect(again).toEqual({
      added: [],
      skipped: [{ label: "Q.1(1)", reason: "Already in your Trash." }],
    });
    await expect(
      t.data.bank.addFromPaper(a, paper.id, { groupKey: "g3", position: 1 }),
    ).rejects.toEqual(notFound);
  });

  it("uses a typed course code, and says so when the paper has none", async () => {
    const typed = await t.data.papers.create(
      a,
      templateId,
      paperMeta({ courseCode: "PD301T", program: "PHARM_D" }),
    );
    await t.data.papers.saveSlot(a, typed.id, {
      ...testSlot({ groupKey: "g2", position: 1, marks: 4 }),
      content: doc(para("Pharm.D invented question.")),
      coTag: "PD301T.04",
      bloomLevel: "EVALUATE",
    });
    const r = await t.data.bank.addFromPaper(a, typed.id);
    expect(r.added).toHaveLength(1);
    expect(await t.data.bank.get(a, r.added[0]?.id ?? "")).toMatchObject({
      courseCode: "PD301T",
      program: "PHARM_D",
      warnings: [],
    });

    const none = await t.data.papers.create(a, templateId, paperMeta({ courseCode: "" }));
    await t.data.papers.saveSlot(a, none.id, testSlot());
    expect((await t.data.bank.addFromPaper(a, none.id)).skipped[0]?.reason).toMatch(
      /no course code/,
    );
  });
});

describe("Trash (D82)", () => {
  it("lists, restores, purges and empties the author's own; old ones are purged", async () => {
    const id = (await t.data.bank.create(a, fields("Trash invented question."))).question.id;
    await t.data.bank.remove(a, id);
    const listed = (await t.data.bank.listTrash(a)).find((x) => x.id === id);
    expect(listed).toMatchObject({
      text: "Trash invented question.",
      courseCode: "XX604T",
      daysLeft: 30,
    });
    await expect(t.data.bank.get(a, id)).rejects.toEqual(notFound);
    await t.data.bank.restore(a, id);
    await t.data.bank.remove(a, id);
    await t.data.bank.purge(a, id);
    await expect(t.data.bank.purge(a, id)).rejects.toEqual(notFound);

    const old = (await t.data.bank.create(a, fields("Old trash question."))).question.id;
    await t.data.bank.remove(a, old);
    expect(
      await t.data.system.purgeOldTrash(new Date(Date.now() + 31 * 86_400_000)),
    ).toBeGreaterThan(0);
    expect(await t.db.question.count({ where: { id: old } })).toBe(0);
    expect(await t.data.bank.emptyTrash(a)).toBe(0);
  });

  it("audits bank actions without text", async () => {
    const rows = await t.db.auditLog.findMany({ where: { entity: "Question" } });
    expect(rows.length).toBeGreaterThan(5);
    for (const r of rows) expect(r.detail ?? "").not.toMatch(/invented/i);
  });
});

describe("list", () => {
  it("filters and pages", async () => {
    const r = await t.data.bank.list(a, {
      course: "XX604T",
      bloom: "REMEMBER",
      marks: 2,
      type: "SHORT",
    });
    expect(r.rows.every((x) => x.courseCode === "XX604T" && x.mine)).toBe(true);
    expect((await t.data.bank.list(a, { co: "XX605T.02" })).rows.map((x) => x.id)).toEqual([q3]);
    expect((await t.data.bank.list(a, { unit: 5 })).rows).toHaveLength(1);
    expect((await t.data.bank.list(b, { scope: "shared" })).rows.every((x) => !x.mine)).toBe(true);
    const first = await t.data.bank.list(a);
    expect([first.older, first.newer]).toEqual([null, null]);
    expect((await t.data.bank.list(a, { after: "not-a-cursor" })).rows).toEqual(first.rows);
    expect((await t.data.bank.list(a, { q: "%" })).rows).toEqual([]);
  });
});
