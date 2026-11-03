// SPEC §7 permission table, cell by cell, through the commands the template
// screens use (gate 8 with guessed IDs). The button helper must agree with it.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/data";
import { syncBuiltInTemplates } from "@/lib/data/templates";
import { templateAccess } from "@/lib/templates/permissions";
import { BUILT_IN_TEMPLATES } from "@/lib/templates/seeds";
import { templateCommands } from "@/server/template-commands";
import { detail, pageCite, summary } from "@/server/template-view";
import { createTestDb, type TestDb } from "../../support/db";
import { templateFields } from "../data/fixtures";

let t: TestDb;
let admin: Actor;
let owner: Actor;
let other: Actor;
const GUESS = "00000000-0000-4000-8000-000000000000";

async function user(email: string, role: "ADMIN" | "FACULTY"): Promise<Actor> {
  const u = await t.db.user.create({ data: { name: email, email, passwordHash: "x", role } });
  return { userId: u.id, role };
}
const cmd = (a: Actor) => templateCommands(t.data, a);
async function make(visibility: "PRIVATE" | "GLOBAL") {
  const tpl = await t.data.templates.create(owner, templateFields(`T ${Math.random()}`));
  if (visibility === "GLOBAL") await t.data.templates.setVisibility(owner, tpl.id, "GLOBAL");
  return t.data.templates.get(owner, tpl.id);
}
const fields = () => ({ ...templateFields("Edited"), description: "edited" });

beforeAll(async () => {
  t = await createTestDb();
  admin = await user("admin@example.test", "ADMIN");
  owner = await user("owner@example.test", "FACULTY");
  other = await user("other@example.test", "FACULTY");
  await syncBuiltInTemplates(t.db, BUILT_IN_TEMPLATES);
});
afterAll(async () => {
  await t.close();
});

describe("PRIVATE template", () => {
  it("owner: view, edit, copy, publish, delete", async () => {
    const tpl = await make("PRIVATE");
    expect(templateAccess(tpl, owner)).toEqual({
      edit: true,
      copy: true,
      publish: true,
      unpublish: false,
      remove: true,
    });
    expect(await cmd(owner).save(tpl.id, tpl.version, fields())).toEqual({ ok: true, value: 2 });
    expect((await cmd(owner).copy(tpl.id)).ok).toBe(true);
    expect(await cmd(owner).setVisibility(tpl.id, "GLOBAL")).toEqual({ ok: true, value: null });
    expect(await cmd(owner).remove(tpl.id)).toEqual({ ok: true, value: null });
  });

  it.each([
    ["another faculty member", () => other],
    ["an admin", () => admin],
  ])("%s: not found for every action, as for a guessed ID", async (_, who) => {
    const tpl = await make("PRIVATE");
    for (const id of [tpl.id, GUESS]) {
      const c = cmd(who());
      const notFound = { ok: false, message: "Template was not found." };
      expect(await c.save(id, 1, fields())).toEqual(notFound);
      expect(await c.copy(id)).toEqual(notFound);
      expect(await c.setVisibility(id, "GLOBAL")).toEqual(notFound);
      expect(await c.setVisibility(id, "PRIVATE")).toEqual(notFound);
      expect(await c.remove(id)).toEqual(notFound);
      await expect(t.data.templates.get(who(), id)).rejects.toMatchObject({
        name: "NotFoundError",
      });
    }
    expect((await t.data.templates.list(who())).map((x) => x.id)).not.toContain(tpl.id);
    expect((await t.data.templates.get(owner, tpl.id)).version).toBe(1);
  });
});

describe("GLOBAL template", () => {
  it("another faculty member: view and copy only; the copy is theirs, private and linked", async () => {
    const tpl = await make("GLOBAL");
    expect(templateAccess(tpl, other)).toEqual({
      edit: false,
      copy: true,
      publish: false,
      unpublish: false,
      remove: false,
    });
    const c = cmd(other);
    expect(await c.save(tpl.id, tpl.version, fields())).toMatchObject({
      ok: false,
      message: expect.stringContaining("Save a copy"),
    });
    expect(await c.setVisibility(tpl.id, "PRIVATE")).toMatchObject({ ok: false });
    expect(await c.remove(tpl.id)).toMatchObject({ ok: false });
    const copy = await c.copy(tpl.id);
    expect(copy.ok).toBe(true);
    const row = await t.data.templates.get(other, copy.ok ? copy.value : "");
    expect(row).toMatchObject({
      ownerId: other.userId,
      visibility: "PRIVATE",
      derivedFromId: tpl.id,
      title: `${tpl.title} (copy)`,
    });
  });

  it("an admin: view, copy, unpublish and delete, but not edit in place", async () => {
    const tpl = await make("GLOBAL");
    expect(templateAccess(tpl, admin)).toEqual({
      edit: false,
      copy: true,
      publish: false,
      unpublish: true,
      remove: true,
    });
    expect(await cmd(admin).save(tpl.id, tpl.version, fields())).toMatchObject({ ok: false });
    expect(await cmd(admin).setVisibility(tpl.id, "PRIVATE")).toEqual({ ok: true, value: null });
    await t.data.templates.setVisibility(owner, tpl.id, "GLOBAL");
    expect(await cmd(admin).setVisibility(tpl.id, "GLOBAL")).toMatchObject({ ok: false });
    expect(await cmd(admin).remove(tpl.id)).toEqual({ ok: true, value: null });
    await expect(t.data.templates.get(owner, tpl.id)).rejects.toMatchObject({
      name: "NotFoundError",
    });
  });

  it("the owner may unpublish", async () => {
    const tpl = await make("GLOBAL");
    expect(templateAccess(tpl, owner)).toMatchObject({ publish: false, unpublish: true });
    expect(await cmd(owner).setVisibility(tpl.id, "PRIVATE")).toEqual({ ok: true, value: null });
  });
});

describe("built-in template", () => {
  it.each([
    ["its owner (the first admin)", () => admin],
    ["a faculty member", () => other],
  ])("%s: view and copy only", async (_, who) => {
    const [b] = await t.data.templates.list(who(), { scope: "BUILT_IN" });
    expect(b).toBeDefined();
    const tpl = b as NonNullable<typeof b>;
    expect(templateAccess(tpl, who())).toEqual({
      edit: false,
      copy: true,
      publish: false,
      unpublish: false,
      remove: false,
    });
    const c = cmd(who());
    expect(await c.save(tpl.id, tpl.version, fields())).toMatchObject({ ok: false });
    expect(await c.setVisibility(tpl.id, "PRIVATE")).toMatchObject({ ok: false });
    expect(await c.remove(tpl.id)).toMatchObject({ ok: false });
    expect((await c.copy(tpl.id, "Mine now")).ok).toBe(true);
  });
});

describe("command input", () => {
  it("rejects malformed IDs, versions, visibilities and fields with plain messages", async () => {
    const tpl = await make("PRIVATE");
    const c = cmd(owner);
    expect(await c.copy(42)).toMatchObject({ ok: false });
    expect(await c.save(tpl.id, 0, fields())).toMatchObject({ ok: false });
    expect(await c.setVisibility(tpl.id, "PUBLIC")).toMatchObject({ ok: false });
    expect(await c.save(tpl.id, 1, { ...fields(), title: "" })).toMatchObject({
      ok: false,
      message: "Some fields are not filled in correctly.",
      issues: [{ message: "Give the template a title.", path: "title" }],
    });
    expect(await c.save(tpl.id, 1, { ...fields(), maxMarks: 99 })).toMatchObject({
      ok: false,
      message: "Fix the problems listed before saving.",
      issues: [expect.objectContaining({ message: expect.stringContaining("add up to 60") })],
    });
    expect(await c.save(tpl.id, 1, fields())).toEqual({ ok: true, value: 2 });
    expect(await c.save(tpl.id, 1, fields())).toMatchObject({
      ok: false,
      message: expect.stringContaining("another window"),
    });
  });

  it("lets unexpected errors through", async () => {
    const broken = templateCommands(
      {
        ...t.data,
        templates: {
          ...t.data.templates,
          remove: () => Promise.reject(new Error("disk full")),
        },
      },
      owner,
    );
    await expect(broken.remove(GUESS)).rejects.toThrow("disk full");
  });
});

describe("template views", () => {
  it("summarise facts, status and ownership", async () => {
    const [b] = await t.data.templates.list(other, {
      scope: "BUILT_IN",
      search: "End-Semester · 4 credits",
    });
    const s = summary(b as NonNullable<typeof b>, other);
    expect(s).toMatchObject({ builtIn: true, mine: false, pci: "COMPLIANT" });
    expect(s.facts).toEqual(["B.Pharm", "Theory", "End-semester", "4 credits"]);
    expect([s.marks, s.duration]).toEqual(["60 marks", "3 hours"]);
    const legacy = (await t.data.templates.list(other, { search: "Legacy" }))[0];
    const d = detail(legacy as NonNullable<typeof legacy>, other);
    expect(d.pci).toBe("NON_PCI");
    expect(d.warnings.length).toBeGreaterThan(0);
    expect(pageCite(28)).toBe("PCI 2026 syllabus, printed page 28");
    expect(pageCite(undefined)).toBeNull();
    const pharmD = (await t.data.templates.list(other, { program: "PHARM_D" }))[0];
    expect(detail(pharmD as NonNullable<typeof pharmD>, other).notice).toMatch(/No PCI 2026/);
  });
});
