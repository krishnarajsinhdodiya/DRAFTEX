// Bank commands (what the screens call), including gate 8 with guessed IDs:
// a colleague or an administrator gets "not found" for another person's
// private question on every command, and cannot change a shared one.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/data";
import { bankCommands } from "@/server/bank-commands";
import { createTestDb, type TestDb } from "../../support/db";
import { paperMeta, templateFields } from "../data/fixtures";

let t: TestDb;
let a: Actor;
let b: Actor;
let admin: Actor;
let privateId: string;
let sharedId: string;
let paperA: string;
let paperB: string;

const doc = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
const fields = (text: string, over: Record<string, unknown> = {}) => ({
  courseCode: "BP604T",
  coTag: "BP604T.01",
  bloomLevel: "APPLY",
  marks: 4,
  type: "SHORT",
  content: doc(text),
  ...over,
});

async function user(email: string, role: "ADMIN" | "FACULTY"): Promise<Actor> {
  const u = await t.db.user.create({ data: { name: email, email, passwordHash: "x", role } });
  return { userId: u.id, role };
}

beforeAll(async () => {
  t = await createTestDb();
  await t.data.system.syncCatalogue();
  a = await user("a@example.com", "FACULTY");
  b = await user("b@example.com", "FACULTY");
  admin = await user("admin@example.com", "ADMIN");
  const ca = bankCommands(t.data, a);
  const p = await ca.save(null, 1, fields("Invented private command question."));
  const s = await ca.save(null, 1, fields("Invented shared command question."));
  if (!p.ok || !s.ok) throw new Error("setup");
  privateId = p.value.id;
  sharedId = s.value.id;
  await ca.setSharing(sharedId, true);
  const tpl = await t.data.templates.create(a, templateFields("Commands template"));
  await t.data.templates.setVisibility(a, tpl.id, "GLOBAL");
  paperA = (await t.data.papers.create(a, tpl.id, paperMeta())).id;
  paperB = (await t.data.papers.create(b, tpl.id, paperMeta())).id;
});

afterAll(async () => {
  await t.close();
});

describe("save", () => {
  it("returns the id, version, syllabus warnings and duplicates", async () => {
    const r = await bankCommands(t.data, a).save(
      null,
      1,
      fields("Invented private command question.", { coTag: "BP604T.42" }),
    );
    expect(r).toMatchObject({
      ok: true,
      value: {
        version: 1,
        duplicates: 1,
        warnings: ["CO BP604T.42 is not in the syllabus list for BP604T."],
      },
    });
  });

  it("lists problems and bad fields instead of throwing", async () => {
    const c = bankCommands(t.data, a);
    expect(await c.save(null, 1, fields(" "))).toMatchObject({
      ok: false,
      issues: [{ message: "The question is empty." }],
    });
    expect(await c.save(null, 1, { ...fields("x"), bloomLevel: "NOPE" })).toMatchObject({
      ok: false,
      issues: [{ path: "bloomLevel" }],
    });
    expect(await c.save("nope", 1, fields("x"))).toMatchObject({ ok: false });
  });

  it("offers syllabus courses with CO and unit suggestions (D85)", async () => {
    const s = await bankCommands(t.data, a).courseSuggestions();
    const c = s.find((x) => x.code === "BP607T AEC1");
    expect(c?.cos[0]?.value).toBe("BP607T.01 AEC1");
    expect(s.find((x) => x.code === "BP604T")?.units[0]?.label).toMatch(/^Unit 1/);
  });
});

describe.each([
  ["a colleague", () => b],
  ["an administrator", () => admin],
])("gate 8: commands for %s", (_l, who) => {
  it("answer not found for the private question on every command", async () => {
    const c = bankCommands(t.data, who());
    await expect(c.get(privateId)).rejects.toThrow(/not found/);
    for (const r of [
      await c.save(privateId, 1, fields("hijack")),
      await c.setSharing(privateId, true),
      await c.copy(privateId),
      await c.remove(privateId),
      await c.restore(privateId),
      await c.purge(privateId),
      await c.insert(privateId, who() === b ? paperB : paperA, { groupKey: "g2", position: 1 }),
    ]) {
      expect(r).toEqual({ ok: false, message: "Question was not found." });
    }
    expect((await c.list({})).rows.map((x) => x.id)).not.toContain(privateId);
  });

  it("can use, never change, the shared question", async () => {
    const c = bankCommands(t.data, who());
    expect((await c.get(sharedId)).mine).toBe(false);
    expect(await c.save(sharedId, 1, fields("hijack"))).toMatchObject({ ok: false });
    expect(await c.setSharing(sharedId, false)).toMatchObject({ ok: false });
    expect(await c.remove(sharedId)).toMatchObject({ ok: false });
    expect(await c.addFromPaper(paperA)).toEqual({ ok: false, message: "Paper was not found." });
  });
});

describe("the colleague's own use", () => {
  it("inserts into their own paper, copies, and manages their Trash", async () => {
    const c = bankCommands(t.data, b);
    expect(await c.insert(sharedId, paperB, { groupKey: "g2", position: 1 })).toMatchObject({
      ok: true,
      value: { marksDiffer: false },
    });
    const copy = await c.copy(sharedId);
    expect(copy.ok).toBe(true);
    const id = copy.ok ? copy.value : "";
    expect(await c.remove(id)).toEqual({ ok: true, value: undefined });
    expect((await c.listTrash()).map((x) => x.id)).toEqual([id]);
    expect(await c.restore(id)).toMatchObject({ ok: true });
    expect(await c.remove(id)).toMatchObject({ ok: true });
    expect(await c.emptyTrash()).toEqual({ ok: true, value: 1 });
    expect(await c.setCourseShare("BP604T", true)).toMatchObject({ ok: true });
    expect((await c.courseShares()).map((s) => s.courseCode)).toEqual(["BP604T"]);
    // The inserted copy can go into the colleague's own bank; this paper's course is XX101T.
    expect(await c.addFromPaper(paperB, { groupKey: "g2", position: 1 })).toMatchObject({
      ok: true,
      value: {
        added: [
          { label: "Q.2(1)", warning: expect.stringMatching(/does not look like a CO of XX101T/) },
        ],
        skipped: [],
      },
    });
  });
});
