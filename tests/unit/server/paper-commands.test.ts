// Gate 8 at the command layer: another user's paper, guessed by ID, is "not
// found" for every operation the paper screens can ask for.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/data";
import { coOptions, paperCommands } from "@/server/paper-commands";
import { createTestDb, type TestDb } from "../../support/db";
import { templateFields, testSlot } from "../data/fixtures";

let t: TestDb;
let owner: Actor;
let other: Actor;
let admin: Actor;
let privateTemplate: string;
let paperId: string;

async function makeUser(email: string, role: "ADMIN" | "FACULTY"): Promise<Actor> {
  const u = await t.db.user.create({ data: { name: email, email, passwordHash: "x", role } });
  return { userId: u.id, role };
}

beforeAll(async () => {
  t = await createTestDb();
  await t.data.system.syncCatalogue();
  owner = await makeUser("o@example.com", "FACULTY");
  other = await makeUser("x@example.com", "FACULTY");
  admin = await makeUser("a@example.com", "ADMIN");
  privateTemplate = (await t.data.templates.create(owner, templateFields("Mine"))).id;
  const r = await paperCommands(t.data, owner).create(privateTemplate, { title: "Mine" });
  if (!r.ok) throw new Error(r.message);
  paperId = r.value;
  await paperCommands(t.data, owner).saveSlot(paperId, testSlot());
});
afterAll(() => t.close());

describe("paper commands", () => {
  it("start a paper from a template, taking program and exam from it", async () => {
    const p = await t.data.papers.get(owner, paperId);
    expect(p).toMatchObject({
      title: "Mine",
      program: "B_PHARM",
      examKind: "END_SEMESTER",
      semesterOrYear: 1,
    });
  });

  it("fill code, title and semester from a chosen course, on create and on change", async () => {
    const course = await t.data.courses.getByCode(owner, "BP604T");
    const c = paperCommands(t.data, owner);
    const r = await c.create(privateTemplate, {
      title: "With course",
      courseId: course.id,
      examDate: "2026-11-20",
    });
    expect(r.ok).toBe(true);
    const id = (r as { value: string }).value;
    expect(await t.data.papers.get(owner, id)).toMatchObject({
      courseCode: "BP604T",
      courseTitle: course.title,
      semesterOrYear: course.semesterOrYear,
      examDate: new Date("2026-11-20"),
    });
    const other604 = await t.data.courses.getByCode(owner, "BP101T");
    expect(await c.updateDetails(id, 1, { courseId: other604.id, title: "Renamed" })).toEqual({
      ok: true,
      value: 2,
    });
    expect(await t.data.papers.get(owner, id)).toMatchObject({
      courseCode: "BP101T",
      title: "Renamed",
    });
    expect(await c.updateDetails(id, 1, { title: "Stale" })).toMatchObject({ ok: false });
    expect(coOptions(course)[0]).toEqual({ value: "BP604T.01", label: course.outcomes[0]?.text });
  });

  it("report invalid input field by field", async () => {
    const r = await paperCommands(t.data, owner).create(privateTemplate, { title: " " });
    expect(r).toMatchObject({
      ok: false,
      issues: [{ path: "title", message: "Give the paper a title." }],
    });
    expect(
      await paperCommands(t.data, owner).create(privateTemplate, { title: "x", courseId: "nope" }),
    ).toMatchObject({
      ok: false,
      message: "Course was not found.",
    });
  });

  it("move, duplicate and clear questions", async () => {
    const c = paperCommands(t.data, owner);
    expect(
      await c.moveSlot(paperId, { groupKey: "g1", position: 1 }, { groupKey: "g1", position: 2 }),
    ).toEqual({ ok: true, value: null });
    expect(await c.duplicateSlot(paperId, { groupKey: "g1", position: 2 })).toEqual({
      ok: true,
      value: { groupKey: "g1", position: 3 },
    });
    expect(await c.clearSlot(paperId, { groupKey: "g1", position: 3 })).toEqual({
      ok: true,
      value: null,
    });
    expect(await t.db.slot.count({ where: { paperId } })).toBe(1);
  });

  it("save an answer key and duplicate the paper for an ATKT exam", async () => {
    const c = paperCommands(t.data, owner);
    const key = {
      groupKey: "g1",
      position: 3,
      content: testSlot().content,
      marks: 1,
      answerKey: testSlot().content,
      keyCriteria: [{ text: "Definition", marks: 1 }],
    };
    expect((await c.saveSlot(paperId, key)).ok).toBe(true);
    const bad = await c.saveSlot(paperId, { ...key, keyCriteria: [{ text: "", marks: -1 }] });
    expect(bad.ok).toBe(false);
    const copy = await c.duplicate(paperId, {
      title: "Mine (ATKT)",
      examKind: "SUPPLEMENTARY_ATKT",
      examDate: "2027-06-01",
    });
    if (!copy.ok) throw new Error(copy.message);
    const p = await t.data.papers.getWithSlots(owner, copy.value);
    expect(p).toMatchObject({ examKind: "SUPPLEMENTARY_ATKT", derivedFromPaperId: paperId });
    expect(p.examDate?.toISOString()).toBe("2027-06-01T00:00:00.000Z");
    expect(p.slots.find((x) => x.position === 3)?.keyCriteria).toEqual(key.keyCriteria);
    const invalid = await c.duplicate(paperId, { title: "", examKind: "NOPE" });
    expect(invalid.ok).toBe(false);
    const next = await c.duplicate(paperId, {
      title: "Next year",
      examKind: "END_SEMESTER",
      academicYear: "2027-28",
    });
    if (!next.ok) throw new Error(next.message);
    expect((await t.data.papers.get(owner, next.value)).academicYear).toBe("2027-28");
    await t.data.papers.remove(owner, copy.value);
    await t.data.papers.remove(owner, next.value);
    await c.clearSlot(paperId, { groupKey: "g1", position: 3 });
  });

  it("mark a copy Final, refuse changes, put it back to Draft and restore its version", async () => {
    const c = paperCommands(t.data, owner);
    const copy = await c.duplicate(paperId, { title: "Lockable", examKind: "END_SEMESTER" });
    if (!copy.ok) throw new Error(copy.message);
    const id = copy.value;
    expect(await c.setStatus(id, 1, "FINAL")).toEqual({ ok: true, value: 2 });
    const refused = await c.saveSlot(id, testSlot());
    expect(refused).toMatchObject({ ok: false, message: expect.stringMatching(/Choose Edit/) });
    expect((await c.setStatus(id, 2, "PRINTED")).ok).toBe(false);
    expect((await c.updateDetails(id, 2, { status: "DRAFT", title: "x" })).ok).toBe(false);
    expect(await c.setStatus(id, 2, "DRAFT")).toEqual({ ok: true, value: 3 });
    const [v] = await t.data.papers.listVersions(owner, id);
    const restored = await c.restoreVersion(id, v?.id, "Lockable again");
    if (!restored.ok) throw new Error(restored.message);
    expect((await t.data.papers.get(owner, restored.value)).status).toBe("DRAFT");
    expect((await c.restoreVersion(id, "missing", "x")).ok).toBe(false);
    await t.data.papers.remove(owner, id);
    await t.data.papers.remove(owner, restored.value);
  });
});

describe.each([
  ["another faculty member", () => other],
  ["an administrator", () => admin],
])("someone else's paper, guessed by %s", (_label, who) => {
  const c = () => paperCommands(t.data, who());
  it.each([
    ["change its details", () => c().updateDetails(paperId, 1, { title: "x" })],
    ["write a question", () => c().saveSlot(paperId, testSlot())],
    ["clear a question", () => c().clearSlot(paperId, { groupKey: "g1", position: 2 })],
    [
      "move a question",
      () => c().moveSlot(paperId, { groupKey: "g1", position: 2 }, { groupKey: "g1", position: 1 }),
    ],
    ["duplicate a question", () => c().duplicateSlot(paperId, { groupKey: "g1", position: 2 })],
    ["duplicate it", () => c().duplicate(paperId, { title: "x", examKind: "SUPPLEMENTARY_ATKT" })],
    ["delete it", () => c().remove(paperId)],
    ["mark it Final", () => c().setStatus(paperId, 1, "FINAL")],
    ["restore a version of it", () => c().restoreVersion(paperId, "guess", "x")],
    [
      "start a paper from the owner's private template",
      () => c().create(privateTemplate, { title: "x" }),
    ],
  ])("cannot %s", async (_op, op) => {
    const r = await op();
    expect(r.ok).toBe(false);
    expect((r as { message: string }).message).toMatch(/not found/);
  });

  it("leaves the paper untouched", async () => {
    expect(await t.db.slot.count({ where: { paperId } })).toBe(1);
    expect((await t.data.papers.get(owner, paperId)).version).toBe(1);
  });
});
