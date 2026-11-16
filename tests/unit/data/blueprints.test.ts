// CO blueprints' data layer (Phase 15, D108) and its gate 8 rules: a user
// sees a blueprint they made or one that is SHARED; only its maker may change,
// share or delete it; admins get nothing extra. Every other-person call uses
// the exact ID (guessed IDs). Invented codes only.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/data";
import { ConflictError, NotFoundError } from "@/lib/data";
import { BLUEPRINT_TAKEN, examGroupOf } from "@/lib/data/blueprints";
import { EXAM_GROUPS } from "@/lib/templates/labels";
import { ExamKind } from "@/generated/prisma/enums";
import { createTestDb, type TestDb } from "../../support/db";

let t: TestDb;
let a: Actor;
let b: Actor;
let admin: Actor;
let priv: string;

const fields = (over: Record<string, unknown> = {}) => ({
  courseCode: "XX604T",
  examGroup: "SESSIONAL",
  unit: "MARKS",
  tolerance: 1,
  targets: [
    { co: "XX604T.01", target: 10 },
    { co: "XX604T.02", target: 5 },
  ],
  ...over,
});

async function makeUser(email: string, role: "ADMIN" | "FACULTY"): Promise<Actor> {
  const u = await t.db.user.create({ data: { name: email, email, passwordHash: "x", role } });
  return { userId: u.id, role };
}

beforeAll(async () => {
  t = await createTestDb();
  a = await makeUser("a@example.test", "FACULTY");
  b = await makeUser("b@example.test", "FACULTY");
  admin = await makeUser("admin@example.test", "ADMIN");
  priv = (await t.data.blueprints.create(a, fields())).id;
});
afterAll(() => t?.close());

describe("exam groups", () => {
  it("every exam kind belongs to its D59 group", () => {
    for (const k of Object.values(ExamKind)) {
      const g = examGroupOf(k);
      expect((EXAM_GROUPS[g].kinds as readonly string[]).includes(k)).toBe(true);
    }
  });
});

describe("owner", () => {
  it("creates, reads, updates with a version, and lists", async () => {
    const v = await t.data.blueprints.get(a, priv);
    expect(v).toMatchObject({ mine: true, courseCode: "XX604T", version: 1, sharing: "PRIVATE" });
    const u = await t.data.blueprints.update(a, priv, 1, fields({ tolerance: 2 }));
    expect(u).toMatchObject({ tolerance: 2, version: 2 });
    await expect(t.data.blueprints.update(a, priv, 1, fields())).rejects.toThrow(ConflictError);
    expect((await t.data.blueprints.list(a)).map((x) => x.id)).toContain(priv);
  });

  it("one per course and exam group", async () => {
    await expect(t.data.blueprints.create(a, fields())).rejects.toThrow(BLUEPRINT_TAKEN);
    const other = await t.data.blueprints.create(a, fields({ examGroup: "END_SEMESTER" }));
    await expect(t.data.blueprints.update(a, other.id, other.version, fields())).rejects.toThrow(
      BLUEPRINT_TAKEN,
    );
    await t.data.blueprints.remove(a, other.id);
  });

  it("refuses invalid fields", async () => {
    await expect(t.data.blueprints.create(a, fields({ targets: [] }))).rejects.toThrow();
    await expect(t.data.blueprints.create(a, fields({ unit: "PERCENT" }))).rejects.toThrow(/100%/);
  });

  it("matches a paper by course code (any case) and exam kind", async () => {
    expect((await t.data.blueprints.match(a, " xx604t ", "SESSIONAL_2"))?.id).toBe(priv);
    expect(await t.data.blueprints.match(a, "XX604T", "END_SEMESTER")).toBeNull();
  });
});

describe("gate 8: others' private blueprints do not exist", () => {
  it.each([
    ["colleague", () => b],
    ["admin", () => admin],
  ])("for a %s, by every function", async (_, who) => {
    const x = who();
    await expect(t.data.blueprints.get(x, priv)).rejects.toThrow(NotFoundError);
    await expect(t.data.blueprints.update(x, priv, 2, fields())).rejects.toThrow(NotFoundError);
    await expect(t.data.blueprints.setSharing(x, priv, "SHARED")).rejects.toThrow(NotFoundError);
    await expect(t.data.blueprints.remove(x, priv)).rejects.toThrow(NotFoundError);
    expect((await t.data.blueprints.list(x)).map((v) => v.id)).not.toContain(priv);
    expect(await t.data.blueprints.match(x, "XX604T", "SESSIONAL_1")).toBeNull();
  });
});

describe("sharing", () => {
  it("colleagues read a shared one, never change it; unsharing hides it again", async () => {
    await t.data.blueprints.setSharing(a, priv, "SHARED");
    const seen = await t.data.blueprints.get(b, priv);
    expect(seen).toMatchObject({ mine: false, ownerName: "a@example.test" });
    expect((await t.data.blueprints.match(b, "XX604T", "SESSIONAL_1"))?.id).toBe(priv);
    await expect(t.data.blueprints.update(b, priv, seen.version, fields())).rejects.toThrow(
      NotFoundError,
    );
    await expect(t.data.blueprints.setSharing(b, priv, "PRIVATE")).rejects.toThrow(NotFoundError);
    await expect(t.data.blueprints.remove(b, priv)).rejects.toThrow(NotFoundError);
    // Own blueprints come first in the list and win the match.
    const mine = await t.data.blueprints.create(b, fields());
    expect((await t.data.blueprints.list(b))[0]?.id).toBe(mine.id);
    expect((await t.data.blueprints.match(b, "XX604T", "SESSIONAL_1"))?.id).toBe(mine.id);
    await t.data.blueprints.remove(b, mine.id);
    await t.data.blueprints.setSharing(a, priv, "PRIVATE");
    await expect(t.data.blueprints.get(b, priv)).rejects.toThrow(NotFoundError);
  });

  it("every write is audited with the id only", async () => {
    const rows = await t.db.auditLog.findMany({ where: { entity: "blueprint", entityId: priv } });
    expect(rows.map((r) => r.action)).toEqual(
      expect.arrayContaining(["create", "update", "share", "unshare"]),
    );
    expect(rows.every((r) => r.detail === null)).toBe(true);
  });

  it("delete removes it for good", async () => {
    await t.data.blueprints.remove(a, priv);
    await expect(t.data.blueprints.get(a, priv)).rejects.toThrow(NotFoundError);
  });
});
