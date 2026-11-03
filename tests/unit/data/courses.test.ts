import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bpharmCatalogue, type CatalogueCourse } from "@/lib/catalogue";
import { type Actor, ForbiddenError, NotFoundError } from "@/lib/data";
import { syncCatalogue } from "@/lib/data/courses";
import { createTestDb, type TestDb } from "../../support/db";

let t: TestDb;
let faculty: Actor;
let admin: Actor;

beforeAll(async () => {
  t = await createTestDb();
  const f = await t.db.user.create({
    data: { name: "F", email: "f@example.com", passwordHash: "x" },
  });
  const a = await t.db.user.create({
    data: { name: "A", email: "a@example.com", passwordHash: "x", role: "ADMIN" },
  });
  faculty = { userId: f.id, role: "FACULTY" };
  admin = { userId: a.id, role: "ADMIN" };
});

afterAll(async () => {
  await t.close();
});

describe("catalogue sync", () => {
  const total = bpharmCatalogue().courses.length;

  it("seeds every course on an empty database, then changes nothing", async () => {
    expect(await t.data.system.syncCatalogue()).toEqual({
      created: total,
      updated: 0,
      unchanged: 0,
    });
    expect(await t.db.course.count()).toBe(total);
    expect(await t.data.system.syncCatalogue()).toEqual({
      created: 0,
      updated: 0,
      unchanged: total,
    });
  });

  it("repairs a course that drifted, replacing its outcomes and units", async () => {
    const c = await t.db.course.findUniqueOrThrow({ where: { code: "BP604T" } });
    await t.db.course.update({ where: { id: c.id }, data: { title: "Changed" } });
    await t.db.courseOutcome.deleteMany({ where: { courseId: c.id, number: 5 } });
    expect(await t.data.system.syncCatalogue()).toEqual({
      created: 0,
      updated: 1,
      unchanged: total - 1,
    });
    const fixed = await t.data.courses.get(faculty, c.id);
    expect(fixed.id).toBe(c.id); // same row, so papers that point at it keep working
    expect(fixed.title).toBe("AI applications in Pharmaceutical Sciences (Theory)");
    expect(fixed.outcomes.map((o) => o.number)).toEqual([1, 2, 3, 4, 5]);
  });

  it("notices changes to outcome text and unit fields", async () => {
    const base = bpharmCatalogue().courses.find((c) => c.code === "BP101T") as CatalogueCourse;
    const run = (c: CatalogueCourse) => syncCatalogue(t.db, { program: "B_PHARM", courses: [c] });
    const o = structuredClone(base);
    o.outcomes[0]!.text = "Changed outcome.";
    expect(await run(o)).toEqual({ created: 0, updated: 1, unchanged: 0 });
    const u = structuredClone(base);
    u.units[0]!.hours = 7;
    expect(await run(u)).toEqual({ created: 0, updated: 1, unchanged: 0 });
    const fewer = structuredClone(base);
    fewer.units.pop();
    expect(await run(fewer)).toEqual({ created: 0, updated: 1, unchanged: 0 });
    expect(await run(base)).toEqual({ created: 0, updated: 1, unchanged: 0 });
    expect(await run(base)).toEqual({ created: 0, updated: 0, unchanged: 1 });
  });
});

describe("course reads", () => {
  it("are the same for every signed-in user", async () => {
    const a = await t.data.courses.list(faculty);
    const b = await t.data.courses.list(admin);
    expect(a.length).toBe(bpharmCatalogue().courses.length);
    expect(b).toEqual(a);
  });

  it("refuse a missing actor", async () => {
    const nobody = { userId: "", role: "FACULTY" } as Actor;
    await expect(t.data.courses.list(nobody)).rejects.toThrow(ForbiddenError);
    await expect(t.data.courses.getByCode(nobody, "BP101T")).rejects.toThrow(ForbiddenError);
  });

  it("filter by semester, kind and search, in code order", async () => {
    const sem7 = await t.data.courses.list(faculty, {
      program: "B_PHARM",
      semesterOrYear: 7,
      courseKind: "THEORY",
    });
    expect(sem7.map((c) => c.code).slice(0, 3)).toEqual(["BP701T", "BP702T", "BP703T"]);
    expect(sem7.every((c) => c.semesterOrYear === 7 && c.courseKind === "THEORY")).toBe(true);
    expect(
      (await t.data.courses.list(faculty, { search: " cosmeceuticals " })).map((c) => c.code),
    ).toEqual(["BP702T"]);
    expect((await t.data.courses.list(faculty, { search: "BP607T" })).length).toBe(6);
    expect(await t.data.courses.list(faculty, { program: "M_PHARM" })).toEqual([]);
  });

  it("get a course with ordered outcomes and units, by id or code", async () => {
    const c = await t.data.courses.getByCode(faculty, "BP702T");
    expect(c.outcomes.map((o) => o.number)).toEqual([1, 2, 3, 4, 5]);
    expect(c.units.map((u) => u.number)).toEqual([1, 2, 3, 4, 5]);
    expect((await t.data.courses.get(faculty, c.id)).code).toBe("BP702T");
    const elective = await t.data.courses.getByCode(faculty, "BP607T AEC3");
    expect(elective).toMatchObject({
      electiveOf: "BP607T",
      electiveLabel: "AEC – Elective 3",
      ruleSetId: "PCI_2026_BPHARM",
    });
  });

  it("say 'not found' for unknown ids and codes", async () => {
    await expect(
      t.data.courses.get(faculty, "00000000-0000-0000-0000-000000000000"),
    ).rejects.toThrow(NotFoundError);
    await expect(t.data.courses.getByCode(faculty, "BP999T")).rejects.toThrow(NotFoundError);
  });
});
