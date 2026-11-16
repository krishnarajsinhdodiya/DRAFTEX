// Bank keyset pages and full-text search (Phase 16; D113, D127-D130) on the
// invented perf seed: rows tie on updatedAt in batches of 25, some are in
// Trash, some are shared by course. Results are compared with a plain
// JavaScript reference that applies the D73 rule to every row.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/data";
import { createTestDb, type TestDb } from "../../support/db";
import { seedBank } from "../../perf/seed-bank";

let t: TestDb;
let author: Actor;
let colleague: Actor;
let admin: Actor;

async function user(email: string, role: "ADMIN" | "FACULTY"): Promise<Actor> {
  const u = await t.db.user.create({ data: { name: email, email, passwordHash: "x", role } });
  return { userId: u.id, role };
}

/** Every row the actor may see, newest first, computed without SQL (D73, D129). */
async function reference(actor: Actor) {
  const shares = await t.db.bankCourseShare.findMany();
  const rows = await t.db.question.findMany({
    select: {
      id: true,
      ownerId: true,
      sharing: true,
      courseCode: true,
      deletedAt: true,
      updatedAt: true,
      createdAt: true,
      searchText: true,
      tags: true,
    },
  });
  return rows
    .filter(
      (q) =>
        q.deletedAt === null &&
        (q.ownerId === actor.userId ||
          q.sharing === "SHARED" ||
          shares.some((s) => s.ownerId === q.ownerId && s.courseCode === q.courseCode)),
    )
    .map((q) => ({ ...q, t: (q.updatedAt ?? q.createdAt).getTime() }))
    .sort((a, b) => (a.t === b.t ? (a.id < b.id ? 1 : -1) : a.t < b.t ? 1 : -1));
}

async function walk(actor: Actor, filter: Record<string, unknown> = {}) {
  const ids: string[] = [];
  let page = await t.data.bank.list(actor, filter);
  const pages = [page];
  ids.push(...page.rows.map((r) => r.id));
  while (page.older) {
    page = await t.data.bank.list(actor, { ...filter, after: page.older });
    pages.push(page);
    ids.push(...page.rows.map((r) => r.id));
  }
  return { ids, pages };
}

beforeAll(async () => {
  t = await createTestDb();
  admin = await user("admin@example.test", "ADMIN");
  author = await user("author@example.test", "FACULTY");
  colleague = await user("colleague@example.test", "FACULTY");
  await seedBank(t.db, { author: author.userId, colleague: colleague.userId }, 300);
});
afterAll(() => t.close());

describe("keyset pages", () => {
  it("walk every visible row once, in order, across tied times", async () => {
    for (const actor of [author, colleague, admin]) {
      const { ids, pages } = await walk(actor);
      expect(ids).toEqual((await reference(actor)).map((r) => r.id));
      expect(pages.slice(0, -1).every((p) => p.rows.length === 50)).toBe(true);
      expect(pages[0]?.newer).toBeNull();
      expect(pages.at(-1)?.older).toBeNull();
    }
  });

  it("go back with Newer to the same pages", async () => {
    const { pages } = await walk(author);
    expect(pages.length).toBeGreaterThan(2);
    for (let i = pages.length - 1; i > 0; i--) {
      const back = await t.data.bank.list(author, { before: pages[i]!.newer! });
      expect(back.rows.map((r) => r.id)).toEqual(pages[i - 1]!.rows.map((r) => r.id));
      expect(back.newer === null).toBe(i === 1);
      expect(back.older).not.toBeNull();
    }
  });

  it("gives an admin only what any colleague sees (D73)", async () => {
    const shared = (await reference(admin)).map((r) => r.id);
    expect(shared.length).toBeGreaterThan(0);
    expect((await walk(admin)).ids).toEqual(shared);
    expect((await walk(admin)).ids).toEqual((await walk(admin, { scope: "shared" })).ids);
  });
});

describe("search", () => {
  it("finds what the old JavaScript filter found, in the same order", async () => {
    const all = await reference(author);
    for (const word of ["paracetamol", "butyl", "Stability", "100%_sure", "50%", "item 7)"]) {
      const lower = word.toLowerCase();
      const words = lower.split(" ");
      const expected = all
        .filter((q) => {
          const hay = [q.searchText ?? "", ...((q.tags as string[] | null) ?? [])]
            .join("\n")
            .toLowerCase();
          return words.every((w) => hay.includes(w));
        })
        .map((q) => q.id);
      const got = (await walk(author, { q: word })).ids;
      // The index also covers the answer, course and COs (D126): a superset, same order.
      expect(
        expected.every((id) => got.includes(id)),
        word,
      ).toBe(true);
      expect(
        got.filter((id) => expected.includes(id)),
        word,
      ).toEqual(expected);
    }
  });

  it("never treats typed text as FTS5 syntax or LIKE wildcards", async () => {
    for (const q of ['"', "NEAR(", "*", "-", "a OR b", "title:x", "%", "_", "😀", "ΔG", "\\"]) {
      await expect(t.data.bank.list(author, { q })).resolves.toBeDefined();
    }
    expect((await t.data.bank.list(author, { q: "%" })).rows.length).toBe(
      (await walk(author, { q: "%" })).pages[0]!.rows.length,
    );
    expect((await t.data.bank.list(author, { q: "zzzzqq" })).rows).toEqual([]);
  });

  it("combines search, filters and pages", async () => {
    const { ids } = await walk(author, { q: "of", course: "XX605T", scope: "shared" });
    const ref = (await reference(author)).filter(
      (q) => q.courseCode === "XX605T" && q.ownerId !== author.userId,
    );
    expect(ids).toEqual(ref.map((q) => q.id));
  });
});
