// Phase 9 paper retrieval (D55-D60): search and filters, the Final/Printed
// lock, version snapshots and "Duplicate as…". Invented data only.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Actor, ConflictError, NotFoundError } from "@/lib/data";
import { PAPER_LOCKED, PRINTED_BY_EXPORT, VERSION_HISTORY } from "@/lib/data/papers";
import { createTestDb, type TestDb } from "../../support/db";
import { paperMeta, templateFields, testSlot } from "./fixtures";

let t: TestDb;
let me: Actor;
let templateId: string;

beforeAll(async () => {
  t = await createTestDb();
  const u = await t.db.user.create({
    data: { name: "f", email: "f@example.com", passwordHash: "x", role: "FACULTY" },
  });
  me = { userId: u.id, role: "FACULTY" };
  templateId = (await t.data.templates.create(me, templateFields("T"))).id;
});

afterAll(async () => {
  await t.close();
});

const locked = expect.objectContaining({ message: PAPER_LOCKED }) as unknown;

async function paper(over: Parameters<typeof paperMeta>[0] = {}) {
  return t.data.papers.create(me, templateId, paperMeta(over));
}

describe("search and filters (D59)", () => {
  it("match title, course code and course title, ignoring case, newest edit first", async () => {
    const a = await paper({ title: "Pharmacology mid-term", courseCode: "XX604T" });
    const b = await paper({ title: "Other", courseTitle: "Invented Pharmacology II" });
    const c = await paper({ title: "Chemistry", courseCode: "YY101T", courseTitle: "Chem" });
    const ids = async (f: object) => (await t.data.papers.list(me, f)).map((p) => p.id);
    expect(await ids({ q: "pharmacology" })).toEqual([b.id, a.id]);
    expect(await ids({ q: "xx604" })).toEqual([a.id]);
    expect(await ids({ q: "%" })).toEqual([]);
    expect(await ids({ q: "" })).toEqual(expect.arrayContaining([a.id, b.id, c.id]));
    expect(await ids({ course: "YY101T" })).toEqual([c.id]);
  });

  it("group exam kinds, and filter by year and status", async () => {
    const s = await paper({ examKind: "SESSIONAL_IMPROVEMENT", academicYear: "2030-31" });
    const y = await paper({ examKind: "YEAR_END", academicYear: "2030-31" });
    const k = await paper({ examKind: "SUPPLEMENTARY_ATKT", academicYear: "2031-32" });
    const p = await paper({ examKind: "PRACTICAL_SESSIONAL_1", academicYear: "2031-32" });
    const o = await paper({ examKind: "SYNOPSIS", academicYear: "2031-32" });
    const ids = async (f: object) => (await t.data.papers.list(me, f)).map((x) => x.id);
    expect(await ids({ group: "SESSIONAL", year: "2030-31" })).toEqual([s.id]);
    expect(await ids({ group: "END_SEMESTER", year: "2030-31" })).toEqual([y.id]);
    expect(await ids({ group: "ATKT", year: "2031-32" })).toEqual([k.id]);
    expect(await ids({ group: "PRACTICAL", year: "2031-32" })).toEqual([p.id]);
    expect(await ids({ group: "OTHER", year: "2031-32" })).toEqual([o.id]);
    await t.data.papers.update(me, o.id, 1, { status: "FINAL" });
    expect(await ids({ status: "FINAL", year: "2031-32" })).toEqual([o.id]);
    expect(await ids({ status: "DRAFT", year: "2031-32" })).toEqual([p.id, k.id]);
    await expect(t.data.papers.list(me, { group: "NOPE" } as object)).rejects.toThrow();
  });

  it("offer the actor's own years and courses, and the five most recent papers", async () => {
    const opts = await t.data.papers.filterOptions(me);
    expect(opts.years).toEqual(expect.arrayContaining(["2030-31", "2031-32", "2026-27"]));
    expect(opts.years).not.toContain("");
    expect(opts.courses).toContainEqual({ code: "YY101T", title: "Chem" });
    const recent = await t.data.papers.recent(me);
    expect(recent).toHaveLength(5);
    expect(recent.map((p) => p.id)).toEqual(
      (await t.data.papers.list(me)).slice(0, 5).map((p) => p.id),
    );
  });

  it("leave out papers in Trash", async () => {
    const p = await paper({ title: "Binned paper" });
    await t.data.papers.remove(me, p.id);
    expect(await t.data.papers.list(me, { q: "Binned" })).toEqual([]);
  });
});

describe("Final and Printed papers (D55, D56)", () => {
  it("refuse every change until Edit puts them back to Draft", async () => {
    const p = await paper();
    await t.data.papers.saveSlot(me, p.id, testSlot());
    const v2 = await t.data.papers.update(me, p.id, 1, { status: "FINAL" });
    expect(v2.status).toBe("FINAL");
    const place = { groupKey: "g1", position: 1 };
    await expect(t.data.papers.saveSlot(me, p.id, testSlot())).rejects.toEqual(locked);
    await expect(t.data.papers.clearSlot(me, p.id, place)).rejects.toEqual(locked);
    await expect(
      t.data.papers.moveSlot(me, p.id, place, { groupKey: "g1", position: 2 }),
    ).rejects.toEqual(locked);
    await expect(t.data.papers.duplicateSlot(me, p.id, place)).rejects.toEqual(locked);
    await expect(t.data.papers.update(me, p.id, 2, { title: "New" })).rejects.toEqual(locked);
    await expect(
      t.data.papers.update(me, p.id, 2, { status: "DRAFT", title: "New" }),
    ).rejects.toEqual(locked);
    const v3 = await t.data.papers.update(me, p.id, 2, { status: "DRAFT" });
    expect(v3).toMatchObject({ status: "DRAFT", version: 3 });
    expect(await t.db.auditLog.count({ where: { entityId: p.id, action: "reopen" } })).toBe(1);
    await t.data.papers.saveSlot(me, p.id, testSlot({ marks: 2 }));
    // Trash still works on a locked paper.
    await t.data.papers.update(me, p.id, 3, { status: "FINAL" });
    await t.data.papers.remove(me, p.id);
    await t.data.papers.restore(me, p.id);
  });

  it("become Printed only by export, which a stale reopen cannot undo", async () => {
    const p = await paper();
    await expect(t.data.papers.update(me, p.id, 1, { status: "PRINTED" })).rejects.toEqual(
      expect.objectContaining({ message: PRINTED_BY_EXPORT }),
    );
    const at = new Date("2031-01-02T03:04:05Z");
    expect(await t.data.papers.markPrinted(me, p.id, at)).toBe(2);
    expect(await t.data.papers.get(me, p.id)).toMatchObject({ status: "PRINTED", printedAt: at });
    await expect(t.data.papers.saveSlot(me, p.id, testSlot())).rejects.toEqual(locked);
    await expect(t.data.papers.update(me, p.id, 1, { status: "DRAFT" })).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect((await t.data.papers.update(me, p.id, 2, { status: "DRAFT" })).status).toBe("DRAFT");
    // Exporting again is fine from any status.
    await t.data.papers.markPrinted(me, p.id);
    await t.data.papers.markPrinted(me, p.id);
  });
});

describe("versions (D57, D58)", () => {
  it("are kept on Final and on export, never twice for the same content", async () => {
    const p = await paper();
    await t.data.papers.saveSlot(me, p.id, testSlot());
    await t.data.papers.update(me, p.id, 1, { status: "FINAL" });
    await t.data.papers.markPrinted(me, p.id);
    let vs = await t.data.papers.listVersions(me, p.id);
    expect(vs.map((v) => v.reason)).toEqual(["FINAL"]);
    await t.data.papers.update(me, p.id, 3, { status: "DRAFT" });
    await t.data.papers.saveSlot(me, p.id, testSlot({ marks: 2 }));
    await t.data.papers.markPrinted(me, p.id);
    vs = await t.data.papers.listVersions(me, p.id);
    expect(vs.map((v) => v.reason)).toEqual(["EXPORT", "FINAL"]);
    const newest = await t.data.papers.getVersion(me, p.id, vs[0]?.id ?? "");
    expect(newest.data.slots).toHaveLength(1);
    expect(newest.data.slots[0]?.marks).toBe(2);
    expect(newest.data.paper.title).toBe("Test paper");
  });

  it(`keep only the newest ${VERSION_HISTORY}`, async () => {
    const p = await paper();
    let version = 1;
    for (let i = 1; i <= VERSION_HISTORY + 3; i++) {
      if (i > 1)
        version = (await t.data.papers.update(me, p.id, version, { status: "DRAFT" })).version;
      await t.data.papers.saveSlot(me, p.id, testSlot({ marks: i }));
      version = await t.data.papers.markPrinted(me, p.id);
    }
    const vs = await t.data.papers.listVersions(me, p.id);
    expect(vs).toHaveLength(VERSION_HISTORY);
    const oldest = await t.data.papers.getVersion(me, p.id, vs.at(-1)?.id ?? "");
    expect(oldest.data.slots[0]?.marks).toBe(4);
  });

  it("restore as a new undated Draft with the questions and keys of that version", async () => {
    const p = await paper({ examDate: new Date("2031-03-01") });
    const key = {
      type: "doc" as const,
      content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text: "Key" }] }],
    };
    await t.data.papers.saveSlot(
      me,
      p.id,
      testSlot({ coTag: "XX101T.01", bloomLevel: "APPLY", answerKey: key }),
    );
    await t.data.papers.markPrinted(me, p.id);
    await t.data.papers.update(me, p.id, 2, { status: "DRAFT" });
    await t.data.papers.clearSlot(me, p.id, { groupKey: "g1", position: 1 });
    const [v] = await t.data.papers.listVersions(me, p.id);
    const copy = await t.data.papers.restoreVersion(me, p.id, v?.id ?? "", "Restored copy");
    expect(copy).toMatchObject({
      title: "Restored copy",
      status: "DRAFT",
      examDate: null,
      derivedFromPaperId: p.id,
      templateId,
      academicYear: "2026-27",
    });
    const full = await t.data.papers.getWithSlots(me, copy.id);
    expect(full.slots).toHaveLength(1);
    expect(full.slots[0]).toMatchObject({
      coTag: "XX101T.01",
      bloomLevel: "APPLY",
      answerKey: key,
    });
    await expect(t.data.papers.restoreVersion(me, p.id, v?.id ?? "", " ")).rejects.toThrow(
      "Give the copy a title.",
    );
  });

  it("are hidden while the paper is in Trash and removed with it", async () => {
    const p = await paper();
    await t.data.papers.markPrinted(me, p.id);
    const [v] = await t.data.papers.listVersions(me, p.id);
    await t.data.papers.remove(me, p.id);
    await expect(t.data.papers.listVersions(me, p.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(t.data.papers.getVersion(me, p.id, v?.id ?? "")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await t.data.papers.purge(me, p.id);
    expect(await t.db.paperSnapshot.count({ where: { paperId: p.id } })).toBe(0);
  });
});

describe("Duplicate as… (D60)", () => {
  it("takes the next academic year, or keeps the source's", async () => {
    const p = await paper({ academicYear: "2026-27" });
    const next = await t.data.papers.duplicate(me, p.id, {
      title: "Next year",
      examKind: "END_SEMESTER",
      academicYear: "2027-28",
    });
    expect(next).toMatchObject({ academicYear: "2027-28", status: "DRAFT", examDate: null });
    const atkt = await t.data.papers.duplicate(me, p.id, {
      title: "ATKT",
      examKind: "SUPPLEMENTARY_ATKT",
    });
    expect(atkt).toMatchObject({ academicYear: "2026-27", examKind: "SUPPLEMENTARY_ATKT" });
  });

  it("works from a Final paper and leaves the source as it was", async () => {
    const p = await paper();
    await t.data.papers.update(me, p.id, 1, { status: "FINAL" });
    const copy = await t.data.papers.duplicate(me, p.id, { title: "C", examKind: "END_SEMESTER" });
    expect(copy.status).toBe("DRAFT");
    expect((await t.data.papers.get(me, p.id)).status).toBe("FINAL");
  });
});
