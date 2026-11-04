import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Actor,
  ConflictError,
  ForbiddenError,
  InvalidTemplateError,
  NotFoundError,
} from "@/lib/data";
import { ADVANCED_NOT_ALLOWED, COMPILE_HISTORY } from "@/lib/data/papers";
import { createTestDb, type TestDb } from "../../support/db";
import { paperMeta, templateFields, testSlot } from "./fixtures";

let t: TestDb;
let faculty: Actor;
let admin: Actor;

async function makeUser(email: string, role: "ADMIN" | "FACULTY"): Promise<Actor> {
  const u = await t.db.user.create({ data: { name: email, email, passwordHash: "x", role } });
  return { userId: u.id, role };
}

beforeAll(async () => {
  t = await createTestDb();
  faculty = await makeUser("f@example.com", "FACULTY");
  admin = await makeUser("a@example.com", "ADMIN");
});

afterAll(async () => {
  await t.close();
});

describe("database file", () => {
  it("runs in WAL mode with foreign keys enforced", async () => {
    const [mode] = await t.db.$queryRawUnsafe<{ journal_mode: string }[]>("PRAGMA journal_mode");
    expect(mode?.journal_mode).toBe("wal");
    const [fk] = await t.db.$queryRawUnsafe<{ foreign_keys: bigint }[]>("PRAGMA foreign_keys");
    expect(Number(fk?.foreign_keys)).toBe(1);
  });
});

describe("templates", () => {
  it("are created PRIVATE and validated", async () => {
    const tpl = await t.data.templates.create(faculty, templateFields("A"));
    expect(tpl).toMatchObject({ visibility: "PRIVATE", version: 1, ownerId: faculty.userId });
    await expect(
      t.data.templates.create(faculty, { ...templateFields("x"), title: " " }),
    ).rejects.toThrow("Give the template a title.");
  });

  it("reject a save from a stale version", async () => {
    const tpl = await t.data.templates.create(faculty, templateFields("B"));
    const v2 = await t.data.templates.update(faculty, tpl.id, 1, { title: "B2", description: "d" });
    expect(v2).toMatchObject({ title: "B2", description: "d", version: 2 });
    await expect(
      t.data.templates.update(faculty, tpl.id, 1, { title: "B3" }),
    ).rejects.toBeInstanceOf(ConflictError);
    const v3 = await t.data.templates.update(faculty, tpl.id, 2, {
      structure: templateFields("x").structure,
    });
    expect(v3.version).toBe(3);
  });

  it("refuse a save the checker calls broken, on create, edit and copy", async () => {
    const base = templateFields("Broken");
    await expect(t.data.templates.create(faculty, { ...base, maxMarks: 75 })).rejects.toMatchObject(
      {
        name: "InvalidTemplateError",
        issues: [expect.objectContaining({ code: "TOTAL_MISMATCH" })],
      },
    );
    const tpl = await t.data.templates.create(faculty, base);
    await expect(
      t.data.templates.update(faculty, tpl.id, 1, { maxMarks: 50 }),
    ).rejects.toBeInstanceOf(InvalidTemplateError);
    await expect(
      t.data.templates.saveAsNew(faculty, tpl.id, { maxMarks: 50 }),
    ).rejects.toBeInstanceOf(InvalidTemplateError);
    expect((await t.data.templates.get(faculty, tpl.id)).version).toBe(1);
  });

  it("save Non-PCI templates and set the rule set from the program", async () => {
    const legacy = await t.data.templates.create(faculty, {
      ...templateFields("Legacy-ish"),
      durationMinutes: 150,
    });
    expect(legacy.ruleSetId).toBe("PCI_2026_BPHARM");
    const mpharm = await t.data.templates.update(faculty, legacy.id, 1, { program: "M_PHARM" });
    expect(mpharm.ruleSetId).toBeNull();
  });

  it("filter by search text and scope", async () => {
    const mine = await t.data.templates.create(faculty, {
      ...templateFields("Pharmacology finder"),
      description: "zebra",
    });
    const theirs = await t.data.templates.create(admin, templateFields("Admin finder"));
    await t.data.templates.setVisibility(admin, theirs.id, "GLOBAL");
    const ids = async (f: Parameters<typeof t.data.templates.list>[1]) =>
      (await t.data.templates.list(faculty, f)).map((x) => x.id);
    expect(await ids({ search: "finder" })).toEqual(expect.arrayContaining([mine.id, theirs.id]));
    expect(await ids({ search: "zebra" })).toEqual([mine.id]);
    expect(await ids({ search: "finder", scope: "MINE" })).toEqual([mine.id]);
    expect(await ids({ search: "finder", scope: "SHARED" })).toEqual([theirs.id]);
    expect(await ids({ search: "finder", scope: "BUILT_IN" })).toEqual([]);
    expect(await ids({ search: "finder", examKind: "SESSIONAL_1" })).toEqual([]);
  });

  it("leave fields a patch does not name untouched (Zod fills defaults inside partial)", async () => {
    const tpl = await t.data.templates.create(faculty, {
      ...templateFields("Keep"),
      description: "kept",
    });
    const edited = await t.data.templates.update(faculty, tpl.id, 1, { title: "Keep 2" });
    expect(edited).toMatchObject({ description: "kept", creditTier: 4 });
    const copy = await t.data.templates.saveAsNew(faculty, tpl.id, { title: "Keep copy" });
    expect(copy).toMatchObject({ description: "kept", creditTier: 4 });
  });

  it("copies keep the content, take overrides and link back", async () => {
    const tpl = await t.data.templates.create(faculty, templateFields("C"));
    const copy = await t.data.templates.saveAsNew(faculty, tpl.id, { title: "C copy" });
    expect(copy).toMatchObject({ title: "C copy", derivedFromId: tpl.id, maxMarks: 60 });
    expect(copy.structure).toEqual(tpl.structure);
  });

  it("built-ins cannot be edited or toggled, and only an admin deletes or restores them (D50)", async () => {
    const tpl = await t.data.templates.create(admin, templateFields("Built-in"));
    await t.db.template.update({
      where: { id: tpl.id },
      data: { builtIn: true, visibility: "GLOBAL" },
    });
    for (const run of [
      () => t.data.templates.update(admin, tpl.id, 1, { title: "x" }),
      () => t.data.templates.setVisibility(admin, tpl.id, "PRIVATE"),
      () => t.data.templates.remove(faculty, tpl.id),
      () => t.data.templates.restoreBuiltIns(faculty),
    ]) {
      await expect(run()).rejects.toBeInstanceOf(ForbiddenError);
    }
    const listed = await t.data.templates.list(faculty, { program: "B_PHARM" });
    expect(listed[0]?.id).toBe(tpl.id);

    await t.data.templates.remove(admin, tpl.id);
    await expect(t.data.templates.get(faculty, tpl.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await t.data.templates.deletedBuiltInCount(admin)).toBe(1);
    expect(await t.data.templates.deletedBuiltInCount(faculty)).toBe(0);
    expect(await t.data.templates.restoreBuiltIns(admin)).toBe(1);
    expect((await t.data.templates.get(faculty, tpl.id)).id).toBe(tpl.id);
    expect(await t.data.templates.restoreBuiltIns(admin)).toBe(0);
    const audit = await t.db.auditLog.count({ where: { action: "restore-built-ins" } });
    expect(audit).toBe(1);
    await t.db.template.update({ where: { id: tpl.id }, data: { seedKey: "blank" } });
    await expect(t.data.templates.remove(admin, tpl.id)).rejects.toThrow(/New template/);
  });

  it("an admin may unpublish and delete a GLOBAL template but not publish someone's", async () => {
    const tpl = await t.data.templates.create(faculty, templateFields("D"));
    await t.data.templates.setVisibility(faculty, tpl.id, "GLOBAL");
    await expect(t.data.templates.setVisibility(admin, tpl.id, "GLOBAL")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    const unpublished = await t.data.templates.setVisibility(admin, tpl.id, "PRIVATE");
    expect(unpublished.visibility).toBe("PRIVATE");

    const other = await t.data.templates.create(faculty, templateFields("E"));
    await t.data.templates.setVisibility(faculty, other.id, "GLOBAL");
    await t.data.templates.remove(admin, other.id);
    await expect(t.data.templates.get(faculty, other.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("deleted templates leave papers with their snapshot", async () => {
    const tpl = await t.data.templates.create(faculty, templateFields("F"));
    const paper = await t.data.papers.create(faculty, tpl.id, paperMeta());
    await t.data.templates.remove(faculty, tpl.id);
    const kept = await t.data.papers.get(faculty, paper.id);
    expect(kept.templateId).toBe(tpl.id);
    expect(kept.templateSnapshot).toMatchObject({
      title: "F",
      durationMinutes: 180,
      maxMarks: 60,
      structure: tpl.structure,
      header: tpl.header,
    });
    expect((await t.data.templates.list(faculty)).map((x) => x.id)).not.toContain(tpl.id);
  });
});

describe("papers", () => {
  it("keep the course, year and status when a patch names only the title", async () => {
    const tpl = await t.data.templates.create(faculty, templateFields("Patch"));
    const p = await t.data.papers.create(
      faculty,
      tpl.id,
      paperMeta({ courseCode: "XX202T", academicYear: "2026-27", status: "FINAL" }),
    );
    const v2 = await t.data.papers.update(faculty, p.id, 1, { title: "Renamed" });
    expect(v2).toMatchObject({
      title: "Renamed",
      courseCode: "XX202T",
      academicYear: "2026-27",
      status: "FINAL",
    });
  });

  it("check the course, the version and the instructions", async () => {
    const tpl = await t.data.templates.create(faculty, templateFields("P"));
    await expect(
      t.data.papers.create(faculty, tpl.id, paperMeta({ courseId: "missing" })),
    ).rejects.toBeInstanceOf(NotFoundError);
    const course = await t.db.course.create({
      data: {
        code: "XX101T",
        title: "Invented",
        program: "B_PHARM",
        semesterOrYear: 1,
        courseKind: "THEORY",
        credits: 4,
        lectureHrs: 3,
        tutorialHrs: 1,
        practicalHrs: 0,
        maxMarks: 100,
        sessionalMarks: 25,
        endSemMarks: 75,
        endSemMinutes: 180,
      },
    });
    const p = await t.data.papers.create(
      faculty,
      tpl.id,
      paperMeta({ courseId: course.id, instructionsOverride: ["Use blue ink."] }),
    );
    expect(p.instructionsOverride).toEqual(["Use blue ink."]);
    const v2 = await t.data.papers.update(faculty, p.id, 1, {
      instructionsOverride: null,
      status: "FINAL",
    });
    expect(v2).toMatchObject({ instructionsOverride: null, status: "FINAL", version: 2 });
    const v3 = await t.data.papers.update(faculty, p.id, 2, { examDate: new Date("2027-04-01") });
    expect(v3.instructionsOverride).toBeNull();
    await expect(t.data.papers.update(faculty, p.id, 2, { title: "x" })).rejects.toBeInstanceOf(
      ConflictError,
    );
    await t.data.papers.remove(faculty, p.id);
    await expect(t.data.papers.get(faculty, p.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("slots are replaced in place, validated, and removable", async () => {
    const tpl = await t.data.templates.create(faculty, templateFields("S"));
    const p = await t.data.papers.create(faculty, tpl.id, paperMeta());
    const s1 = await t.data.papers.saveSlot(faculty, p.id, testSlot());
    const s2 = await t.data.papers.saveSlot(
      faculty,
      p.id,
      testSlot({
        marks: 7.5,
        coTag: "XX101T.01",
        bloomLevel: "APPLY",
        answerKey: testSlot().content,
      }),
    );
    expect(s2.id).toBe(s1.id);
    expect(s2).toMatchObject({ marks: 7.5, coTag: "XX101T.01", bloomLevel: "APPLY" });
    const cleared = await t.data.papers.saveSlot(faculty, p.id, testSlot({ answerKey: null }));
    expect(cleared.answerKey).toBeNull();
    await expect(
      t.data.papers.saveSlot(
        faculty,
        p.id,
        testSlot({ content: { type: "doc", content: [{ type: "x" }] } as never }),
      ),
    ).rejects.toThrow();
    await t.data.papers.clearSlot(faculty, p.id, testSlot());
    await t.data.papers.clearSlot(faculty, p.id, testSlot());
    expect(await t.db.slot.count({ where: { paperId: p.id } })).toBe(0);
  });

  it("slots only exist at places the paper's template has", async () => {
    const tpl = await t.data.templates.create(faculty, templateFields("Places"));
    const p = await t.data.papers.create(faculty, tpl.id, paperMeta());
    // The part follows from the group when it is left out.
    const s = await t.data.papers.saveSlot(faculty, p.id, testSlot({ partKey: undefined }));
    expect(s.partKey).toBe("p1");
    for (const bad of [
      testSlot({ groupKey: "nope" }),
      testSlot({ position: 21 }),
      testSlot({ partKey: "p9" }),
    ]) {
      await expect(t.data.papers.saveSlot(faculty, p.id, bad)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    }
    await expect(
      t.data.papers.clearSlot(faculty, p.id, { groupKey: "g2", position: 8 }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("moves swap places; marks follow the group; duplicates fill the next empty place", async () => {
    const tpl = await t.data.templates.create(faculty, templateFields("Moves"));
    const p = await t.data.papers.create(faculty, tpl.id, paperMeta());
    const text = (x: string) => ({
      type: "doc" as const,
      content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text: x }] }],
    });
    await t.data.papers.saveSlot(faculty, p.id, testSlot({ content: text("A") }));
    await t.data.papers.saveSlot(
      faculty,
      p.id,
      testSlot({ position: 2, content: text("B"), coTag: "XX101T.02" }),
    );
    const at = async (groupKey: string, position: number) =>
      t.db.slot.findFirst({ where: { paperId: p.id, groupKey, position } });

    await t.data.papers.moveSlot(
      faculty,
      p.id,
      { groupKey: "g1", position: 1 },
      { groupKey: "g1", position: 2 },
    );
    expect((await at("g1", 1))?.content).toEqual(text("B"));
    expect(await at("g1", 1)).toMatchObject({ coTag: "XX101T.02" });
    expect((await at("g1", 2))?.content).toEqual(text("A"));

    // Into an empty place of another group: it takes that group's marks.
    await t.data.papers.moveSlot(
      faculty,
      p.id,
      { groupKey: "g1", position: 2 },
      { groupKey: "g2", position: 3 },
    );
    expect(await at("g1", 2)).toBeNull();
    expect(await at("g2", 3)).toMatchObject({ partKey: "p1", marks: 4 });
    // Moving onto itself changes nothing.
    await t.data.papers.moveSlot(
      faculty,
      p.id,
      { groupKey: "g2", position: 3 },
      { groupKey: "g2", position: 3 },
    );
    expect(await at("g2", 3)).not.toBeNull();

    expect(
      await t.data.papers.duplicateSlot(faculty, p.id, { groupKey: "g2", position: 3 }),
    ).toEqual({ groupKey: "g2", position: 4 });
    for (let i = 5; i <= 7; i++) {
      await t.data.papers.duplicateSlot(faculty, p.id, { groupKey: "g2", position: 3 });
    }
    // Wraps round to the start of the group.
    expect(
      await t.data.papers.duplicateSlot(faculty, p.id, { groupKey: "g2", position: 3 }),
    ).toEqual({ groupKey: "g2", position: 1 });
    await t.data.papers.duplicateSlot(faculty, p.id, { groupKey: "g2", position: 3 });
    await expect(
      t.data.papers.duplicateSlot(faculty, p.id, { groupKey: "g2", position: 3 }),
    ).rejects.toThrow("Every question in Q.2 is written. Clear one first.");
    await expect(
      t.data.papers.duplicateSlot(faculty, p.id, { groupKey: "g3", position: 1 }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("Advanced LaTeX needs the admin's permission; a revoked user may keep, not add", async () => {
    const tpl = await t.data.templates.create(faculty, templateFields("Adv"));
    const p = await t.data.papers.create(faculty, tpl.id, paperMeta());
    const adv = (...latex: string[]) => ({
      type: "doc" as const,
      content: latex.map((l) => ({ type: "advancedLatex" as const, attrs: { latex: l } })),
    });
    await expect(
      t.data.papers.saveSlot(faculty, p.id, testSlot({ content: adv("\\textbf{x}") })),
    ).rejects.toThrow(ADVANCED_NOT_ALLOWED);
    await t.data.users.setAdvancedLatex(admin, faculty.userId, true);
    await t.data.papers.saveSlot(faculty, p.id, testSlot({ content: adv("\\textbf{x}") }));
    await t.data.users.setAdvancedLatex(admin, faculty.userId, false);
    await t.data.papers.saveSlot(faculty, p.id, testSlot({ content: adv("\\textbf{x}") }));
    await expect(
      t.data.papers.saveSlot(faculty, p.id, testSlot({ content: adv("\\textbf{x}", "\\emph{y}") })),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      t.data.papers.saveSlot(faculty, p.id, testSlot({ position: 3, content: adv("\\textbf{x}") })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("answer keys are saved with the question and kept when a save leaves them out", async () => {
    const tpl = await t.data.templates.create(faculty, templateFields("K"));
    const p = await t.data.papers.create(faculty, tpl.id, paperMeta());
    const key = testSlot().content;
    const criteria = [
      { text: "Definition", marks: 1 },
      { text: "Example", marks: 1 },
    ];
    const saved = await t.data.papers.saveSlot(
      faculty,
      p.id,
      testSlot({ marks: 2, answerKey: key, keyCriteria: criteria }),
    );
    expect(saved.keyCriteria).toEqual(criteria);
    const again = await t.data.papers.saveSlot(faculty, p.id, testSlot({ marks: 2 }));
    expect(again.answerKey).toEqual(key);
    expect(again.keyCriteria).toEqual(criteria);
    const emptied = await t.data.papers.saveSlot(
      faculty,
      p.id,
      testSlot({ answerKey: null, keyCriteria: [] }),
    );
    expect(emptied).toMatchObject({ answerKey: null, keyCriteria: null });
    await expect(
      t.data.papers.saveSlot(faculty, p.id, testSlot({ keyCriteria: [{ text: " ", marks: 1 }] })),
    ).rejects.toThrow();
  });

  it("Advanced LaTeX in an answer key follows the same permission", async () => {
    const tpl = await t.data.templates.create(faculty, templateFields("KA"));
    const p = await t.data.papers.create(faculty, tpl.id, paperMeta());
    const adv = {
      type: "doc" as const,
      content: [{ type: "advancedLatex" as const, attrs: { latex: "\\textbf{k}" } }],
    };
    await expect(
      t.data.papers.saveSlot(faculty, p.id, testSlot({ answerKey: adv })),
    ).rejects.toThrow(ADVANCED_NOT_ALLOWED);
    await t.data.users.setAdvancedLatex(admin, faculty.userId, true);
    await t.data.papers.saveSlot(faculty, p.id, testSlot({ answerKey: adv }));
    await t.data.users.setAdvancedLatex(admin, faculty.userId, false);
    await t.data.papers.saveSlot(faculty, p.id, testSlot({ answerKey: adv }));
    await t.data.papers.saveSlot(faculty, p.id, testSlot());
    const kept = await t.data.papers.getWithSlots(faculty, p.id);
    expect(kept.slots[0]?.answerKey).toEqual(adv);
  });

  it("a paper is duplicated with its questions and keys as an undated draft", async () => {
    const tpl = await t.data.templates.create(faculty, templateFields("D"));
    const p = await t.data.papers.create(
      faculty,
      tpl.id,
      paperMeta({ examDate: new Date("2027-04-01T00:00:00Z"), status: "FINAL" }),
    );
    await t.data.papers.saveSlot(
      faculty,
      p.id,
      testSlot({ answerKey: testSlot().content, keyCriteria: [{ text: "All of it", marks: 1 }] }),
    );
    await t.data.papers.saveSlot(
      faculty,
      p.id,
      testSlot({ groupKey: "g2", position: 2, marks: 2 }),
    );
    const copy = await t.data.papers.duplicate(faculty, p.id, {
      title: "Test paper (ATKT)",
      examKind: "SUPPLEMENTARY_ATKT",
    });
    expect(copy).toMatchObject({
      ownerId: faculty.userId,
      title: "Test paper (ATKT)",
      examKind: "SUPPLEMENTARY_ATKT",
      examDate: null,
      status: "DRAFT",
      derivedFromPaperId: p.id,
      courseCode: p.courseCode,
      version: 1,
    });
    const [a, b] = await Promise.all([
      t.data.papers.getWithSlots(faculty, p.id),
      t.data.papers.getWithSlots(faculty, copy.id),
    ]);
    const strip = ({ id, paperId, ...rest }: (typeof a.slots)[number]) => {
      expect([id, paperId]).not.toEqual([undefined, undefined]);
      return rest;
    };
    expect(b.slots.map(strip)).toEqual(a.slots.map(strip));
    expect(b.snapshot).toEqual(a.snapshot);
    await expect(
      t.data.papers.duplicate(faculty, p.id, { title: " ", examKind: "END_SEMESTER" }),
    ).rejects.toThrow();
  });

  it(`keep the newest ${COMPILE_HISTORY} compile jobs`, async () => {
    const tpl = await t.data.templates.create(faculty, templateFields("H"));
    const p = await t.data.papers.create(faculty, tpl.id, paperMeta());
    const ids: number[] = [];
    for (let i = 0; i < COMPILE_HISTORY + 3; i++) {
      ids.push(
        (
          await t.data.papers.recordCompile(faculty, p.id, {
            kind: "PAPER",
            status: "SUCCEEDED",
            durationMs: i,
          })
        ).id,
      );
    }
    const kept = await t.data.papers.listCompiles(faculty, p.id);
    expect(kept).toHaveLength(COMPILE_HISTORY);
    expect(new Set(kept.map((j) => j.id))).toEqual(new Set(ids.slice(3)));
  });
});

describe("images", () => {
  it("validate input and report whether any owner still uses a file", async () => {
    const sha = "b".repeat(64);
    await expect(t.data.assets.get(faculty, "../etc/passwd")).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      t.data.assets.add(faculty, {
        sha256: "nope",
        mime: "image/png",
        bytes: 1,
        originalName: "x",
      }),
    ).rejects.toThrow();
    await t.data.assets.add(faculty, {
      sha256: sha,
      mime: "image/png",
      bytes: 1,
      originalName: "x.png",
    });
    const again = await t.data.assets.add(faculty, {
      sha256: sha,
      mime: "image/png",
      bytes: 1,
      width: 10,
      height: 5,
      originalName: "y.png",
    });
    expect(again).toMatchObject({ originalName: "y.png", width: 10 });
    expect(await t.data.assets.list(faculty)).toHaveLength(1);
    expect(await t.data.assets.fileInUse(sha)).toBe(true);
    await t.data.assets.remove(faculty, sha);
    expect(await t.data.assets.fileInUse(sha)).toBe(false);
  });
});

describe("users", () => {
  it("creates accounts that must change their password, and refuses duplicate emails", async () => {
    const u = await t.data.users.create(admin, {
      name: " Dr Rao ",
      email: " Rao@Example.COM ",
      passwordHash: "h",
    });
    expect(u).toMatchObject({
      name: "Dr Rao",
      email: "rao@example.com",
      role: "FACULTY",
      mustChangePassword: true,
    });
    expect(u).not.toHaveProperty("passwordHash");
    await expect(
      t.data.users.create(admin, { name: "x", email: "rao@example.com", passwordHash: "h" }),
    ).rejects.toThrow("An account with this email already exists.");
    await expect(
      t.data.users.create(admin, { name: "x", email: "not-an-email", passwordHash: "h" }),
    ).rejects.toThrow("Enter an email address");
    expect((await t.data.users.list(admin)).map((x) => x.email)).toContain("rao@example.com");
  });

  it("never leaves DRAFTEX without an active admin", async () => {
    const solo = await createTestDb();
    try {
      const a = await solo.db.user.create({
        data: { name: "a", email: "a@x.org", passwordHash: "h", role: "ADMIN" },
      });
      const actor: Actor = { userId: a.id, role: "ADMIN" };
      await expect(solo.data.users.setActive(actor, a.id, false)).rejects.toThrow(
        "at least one active administrator",
      );
      await expect(solo.data.users.setRole(actor, a.id, "FACULTY")).rejects.toBeInstanceOf(
        ConflictError,
      );
      const b = await solo.data.users.create(actor, {
        name: "b",
        email: "b@x.org",
        passwordHash: "h",
        role: "ADMIN",
      });
      await solo.data.users.setRole(actor, a.id, "FACULTY");
      await expect(solo.data.users.setRole(actor, b.id, "FACULTY")).rejects.toBeInstanceOf(
        ConflictError,
      );
      expect((await solo.data.users.setRole(actor, b.id, "ADMIN")).role).toBe("ADMIN");
    } finally {
      await solo.close();
    }
  });

  it("deactivating and resetting a password sign the user out; reset also unlocks", async () => {
    const u = await t.data.users.create(admin, {
      name: "S",
      email: "s@example.com",
      passwordHash: "h",
    });
    const future = new Date(Date.now() + 60_000);
    await t.data.auth.createSession("s1", u.id, future);
    const off = await t.data.users.setActive(admin, u.id, false);
    expect(off.isActive).toBe(false);
    expect(await t.db.session.count({ where: { userId: u.id } })).toBe(0);
    expect((await t.data.users.setActive(admin, u.id, true)).isActive).toBe(true);

    await t.data.auth.createSession("s2", u.id, future);
    const lock = (address: string) =>
      t.db.loginLock.create({ data: { userId: u.id, address, failures: 0, lockedUntil: future } });
    await lock("10.0.0.1");
    await t.data.users.resetPassword(admin, u.id, "h2");
    const after = await t.db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after).toMatchObject({ passwordHash: "h2", mustChangePassword: true });
    expect(await t.db.loginLock.count({ where: { userId: u.id } })).toBe(0);
    expect(await t.db.session.count({ where: { userId: u.id } })).toBe(0);

    await lock("10.0.0.1");
    await lock("10.0.0.2");
    expect((await t.data.users.list(admin)).find((p) => p.id === u.id)?.loginLocks).toHaveLength(2);
    await t.data.users.unlock(admin, u.id);
    expect(await t.db.loginLock.count({ where: { userId: u.id } })).toBe(0);
    await expect(t.data.users.unlock(admin, "missing")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("an offline reset (D49) works without a signed-in actor and only for active accounts", async () => {
    const u = await t.data.users.create(admin, {
      name: "Offline",
      email: "offline@example.com",
      passwordHash: "h",
    });
    const future = new Date(Date.now() + 60_000);
    await t.data.auth.createSession("off-1", u.id, future);
    await t.db.loginLock.create({
      data: { userId: u.id, address: "10.0.0.9", failures: 5, lockedUntil: future },
    });
    expect(await t.data.system.resetPasswordOffline("  Offline@Example.com ", "h3")).toBe("reset");
    const after = await t.db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after).toMatchObject({ passwordHash: "h3", mustChangePassword: true });
    expect(await t.db.loginLock.count({ where: { userId: u.id } })).toBe(0);
    expect(await t.db.session.count({ where: { userId: u.id } })).toBe(0);
    const row = await t.db.auditLog.findFirstOrThrow({
      where: { action: "reset-password-offline", entityId: u.id },
    });
    expect(row.actorId).toBeNull();

    expect(await t.data.system.resetPasswordOffline("nobody@example.com", "h4")).toBe("unknown");
    expect(await t.data.system.resetPasswordOffline("not an email", "h4")).toBe("unknown");
    await t.data.users.setActive(admin, u.id, false);
    expect(await t.data.system.resetPasswordOffline("offline@example.com", "h4")).toBe("inactive");
    expect((await t.db.user.findUniqueOrThrow({ where: { id: u.id } })).passwordHash).toBe("h3");
  });

  it("Advanced LaTeX is off until an admin allows it, and can be turned off again", async () => {
    const u = await t.data.users.create(admin, {
      name: "Adv",
      email: "adv@example.com",
      passwordHash: "h",
    });
    expect(u.allowAdvancedLatex).toBe(false);
    expect((await t.data.users.setAdvancedLatex(admin, u.id, true)).allowAdvancedLatex).toBe(true);
    expect((await t.data.users.setAdvancedLatex(admin, u.id, false)).allowAdvancedLatex).toBe(
      false,
    );
    const actions = await t.db.auditLog.findMany({
      where: { entityId: u.id },
      select: { action: true },
    });
    expect(actions.map((a) => a.action)).toEqual(
      expect.arrayContaining(["advanced-latex:on", "advanced-latex:off"]),
    );
    await expect(t.data.users.setAdvancedLatex(admin, "missing", true)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("audit log", () => {
  it("records actions without content", async () => {
    const rows = await t.db.auditLog.findMany();
    expect(rows.length).toBeGreaterThan(10);
    for (const r of rows) {
      expect(Object.keys(r).sort()).toEqual([
        "action",
        "actorId",
        "at",
        "detail",
        "entity",
        "entityId",
        "id",
      ]);
      // Detail is a short token (an address, a mode), never free text.
      if (r.detail !== null) expect(r.detail).toMatch(/^[\w.:\[\]-]{1,64}$/);
    }
  });
});

describe("header images (D22)", () => {
  const LOGO = "c".repeat(64);
  const withLogo = (title: string) => {
    const f = templateFields(title);
    return { ...f, header: { ...f.header, logoLeft: { sha256: LOGO, ext: "png" as const } } };
  };

  it("a template may only show the owner's own upload; copies and papers get their own row", async () => {
    await expect(t.data.templates.create(faculty, withLogo("Not mine"))).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await t.data.assets.add(admin, {
      sha256: LOGO,
      mime: "image/png",
      bytes: 3,
      width: 1,
      height: 1,
      originalName: "logo.png",
    });
    const tpl = await t.data.templates.create(admin, withLogo("Admin logo"));
    await t.data.templates.setVisibility(admin, tpl.id, "GLOBAL");
    await expect(
      t.data.templates.update(faculty, tpl.id, tpl.version, { header: withLogo("x").header }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    // A copy may keep the source's logo, even with a changed header.
    const copy = await t.data.templates.saveAsNew(faculty, tpl.id, {
      header: { ...withLogo("x").header, instructions: ["Changed."] },
    });
    expect(await t.data.assets.get(faculty, LOGO)).toMatchObject({ originalName: "logo.png" });
    await t.data.templates.update(faculty, copy.id, copy.version, { header: withLogo("y").header });
    await t.data.assets.remove(faculty, LOGO);

    const p = await t.data.papers.create(faculty, tpl.id, paperMeta());
    expect(p.id).toBeTruthy();
    expect(await t.data.assets.get(faculty, LOGO)).toMatchObject({ mime: "image/png" });
    // Making a paper from one's own template copies nothing.
    const own = await t.data.templates.create(admin, withLogo("Own"));
    await t.data.papers.create(admin, own.id, paperMeta());
    expect(await t.db.asset.count({ where: { sha256: LOGO } })).toBe(2);

    // A copy that swaps in someone else's upload is refused.
    const OTHER = "d".repeat(64);
    await expect(
      t.data.templates.saveAsNew(faculty, tpl.id, {
        header: { ...withLogo("z").header, logoLeft: { sha256: OTHER, ext: "png" } },
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
