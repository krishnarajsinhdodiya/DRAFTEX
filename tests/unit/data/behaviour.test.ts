import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Actor,
  ConflictError,
  ForbiddenError,
  InvalidTemplateError,
  NotFoundError,
} from "@/lib/data";
import { COMPILE_HISTORY } from "@/lib/data/papers";
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

  it("built-ins cannot be edited, toggled or deleted, even by their owner", async () => {
    const tpl = await t.data.templates.create(admin, templateFields("Built-in"));
    await t.db.template.update({
      where: { id: tpl.id },
      data: { builtIn: true, visibility: "GLOBAL" },
    });
    for (const run of [
      () => t.data.templates.update(admin, tpl.id, 1, { title: "x" }),
      () => t.data.templates.setVisibility(admin, tpl.id, "PRIVATE"),
      () => t.data.templates.remove(admin, tpl.id),
    ]) {
      await expect(run()).rejects.toBeInstanceOf(ForbiddenError);
    }
    const listed = await t.data.templates.list(faculty, { program: "B_PHARM" });
    expect(listed[0]?.id).toBe(tpl.id);
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
    expect(kept.templateSnapshot).toEqual({
      structure: tpl.structure,
      style: tpl.style,
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
    await t.data.papers.removeSlot(faculty, p.id, s1.id);
    await expect(t.data.papers.removeSlot(faculty, p.id, s1.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
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
    await t.db.user.update({ where: { id: u.id }, data: { lockedUntil: future, failedLogins: 3 } });
    await t.data.users.resetPassword(admin, u.id, "h2");
    const after = await t.db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after).toMatchObject({
      passwordHash: "h2",
      mustChangePassword: true,
      failedLogins: 0,
      lockedUntil: null,
    });
    expect(await t.db.session.count({ where: { userId: u.id } })).toBe(0);

    await t.db.user.update({ where: { id: u.id }, data: { lockedUntil: future } });
    await t.data.users.unlock(admin, u.id);
    expect((await t.db.user.findUniqueOrThrow({ where: { id: u.id } })).lockedUntil).toBeNull();
    await expect(t.data.users.unlock(admin, "missing")).rejects.toBeInstanceOf(NotFoundError);
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
        "entity",
        "entityId",
        "id",
      ]);
    }
  });
});
