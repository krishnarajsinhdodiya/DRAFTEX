// Gate 8 (data layer, memory.md D6): user A cannot read, list, compile,
// edit or delete B's private templates, papers, slots or images by any
// data-layer call, even with the exact ID. Admins get no access to private
// records either (SPEC §7). Route-level tests are added in phases 4–6.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/data";
import { ForbiddenError, NotFoundError } from "@/lib/data";
import { createTestDb, type TestDb } from "../../support/db";
import { paperMeta, templateFields, testSlot } from "./fixtures";

let t: TestDb;
let owner: Actor;
let other: Actor;
let admin: Actor;
let privateTemplateId: string;
let globalTemplateId: string;
let paperId: string;
let slotId: string;
const SHA = "a".repeat(64);

async function makeUser(email: string, role: "ADMIN" | "FACULTY"): Promise<Actor> {
  const u = await t.db.user.create({ data: { name: email, email, passwordHash: "x", role } });
  return { userId: u.id, role };
}

beforeAll(async () => {
  t = await createTestDb();
  owner = await makeUser("owner@example.com", "FACULTY");
  other = await makeUser("other@example.com", "FACULTY");
  admin = await makeUser("admin@example.com", "ADMIN");
  privateTemplateId = (await t.data.templates.create(owner, templateFields("Mine"))).id;
  globalTemplateId = (await t.data.templates.create(owner, templateFields("Shared"))).id;
  await t.data.templates.setVisibility(owner, globalTemplateId, "GLOBAL");
  paperId = (await t.data.papers.create(owner, privateTemplateId, paperMeta())).id;
  slotId = (await t.data.papers.saveSlot(owner, paperId, testSlot())).id;
  await t.data.papers.recordCompile(owner, paperId, { kind: "PAPER", status: "SUCCEEDED" });
  await t.data.assets.add(owner, {
    sha256: SHA,
    mime: "image/png",
    bytes: 10,
    originalName: "structure.png",
  });
});

afterAll(async () => {
  await t.close();
});

const notFound = expect.any(NotFoundError) as unknown;
const forbidden = expect.any(ForbiddenError) as unknown;

describe.each([
  ["another faculty member", () => other],
  ["an administrator", () => admin],
])("a PRIVATE template, seen by %s", (_label, who) => {
  it("is missing from lists", async () => {
    const ids = (await t.data.templates.list(who())).map((x) => x.id);
    expect(ids).not.toContain(privateTemplateId);
    expect(ids).toContain(globalTemplateId);
  });

  it.each([
    ["get", () => t.data.templates.get(who(), privateTemplateId)],
    ["update", () => t.data.templates.update(who(), privateTemplateId, 1, { title: "x" })],
    ["save as new", () => t.data.templates.saveAsNew(who(), privateTemplateId)],
    ["publish", () => t.data.templates.setVisibility(who(), privateTemplateId, "GLOBAL")],
    ["unpublish", () => t.data.templates.setVisibility(who(), privateTemplateId, "PRIVATE")],
    ["delete", () => t.data.templates.remove(who(), privateTemplateId)],
    ["start a paper from it", () => t.data.papers.create(who(), privateTemplateId, paperMeta())],
  ])("cannot %s it (not found)", async (_op, run) => {
    await expect(run()).rejects.toEqual(notFound);
  });
});

describe("a GLOBAL template, seen by another faculty member", () => {
  it("can be read, copied and used for a paper", async () => {
    expect((await t.data.templates.get(other, globalTemplateId)).id).toBe(globalTemplateId);
    const copy = await t.data.templates.saveAsNew(other, globalTemplateId);
    expect(copy).toMatchObject({
      ownerId: other.userId,
      visibility: "PRIVATE",
      derivedFromId: globalTemplateId,
    });
    const p = await t.data.papers.create(other, globalTemplateId, paperMeta());
    expect(p.ownerId).toBe(other.userId);
  });

  it.each([
    ["edit it in place", () => t.data.templates.update(other, globalTemplateId, 2, { title: "x" })],
    ["unpublish it", () => t.data.templates.setVisibility(other, globalTemplateId, "PRIVATE")],
    ["delete it", () => t.data.templates.remove(other, globalTemplateId)],
  ])("cannot %s (forbidden)", async (_op, run) => {
    await expect(run()).rejects.toEqual(forbidden);
  });
});

describe.each([
  ["another faculty member", () => other],
  ["an administrator", () => admin],
])("a paper, seen by %s", (_label, who) => {
  it("is missing from lists", async () => {
    expect((await t.data.papers.list(who())).map((p) => p.id)).not.toContain(paperId);
  });

  it.each([
    ["get", () => t.data.papers.get(who(), paperId)],
    ["load for compile or export", () => t.data.papers.getWithSlots(who(), paperId)],
    ["update", () => t.data.papers.update(who(), paperId, 1, { title: "x" })],
    ["delete", () => t.data.papers.remove(who(), paperId)],
    ["write a question", () => t.data.papers.saveSlot(who(), paperId, testSlot())],
    ["clear a question", () => t.data.papers.clearSlot(who(), paperId, testSlot())],
    [
      "move a question",
      () => t.data.papers.moveSlot(who(), paperId, testSlot(), { groupKey: "g1", position: 2 }),
    ],
    ["duplicate a question", () => t.data.papers.duplicateSlot(who(), paperId, testSlot())],
    [
      "record a compile",
      () => t.data.papers.recordCompile(who(), paperId, { kind: "PAPER", status: "QUEUED" }),
    ],
    ["list compiles", () => t.data.papers.listCompiles(who(), paperId)],
  ])("cannot %s (not found)", async (_op, run) => {
    await expect(run()).rejects.toEqual(notFound);
  });

  it("clearing the same place in a paper of their own leaves the owner's question", async () => {
    const own = await t.data.papers.create(who(), globalTemplateId, paperMeta());
    await t.data.papers.clearSlot(who(), own.id, testSlot());
    expect(await t.db.slot.count({ where: { id: slotId } })).toBe(1);
  });

  it("cannot put the owner's picture into a paper of their own by its hash", async () => {
    const own = await t.data.papers.create(who(), globalTemplateId, paperMeta());
    const content = {
      type: "doc" as const,
      content: [{ type: "image" as const, attrs: { sha256: SHA, ext: "png" as const } }],
    };
    await expect(
      t.data.papers.saveSlot(who(), own.id, testSlot({ content })),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      t.data.papers.saveSlot(who(), own.id, testSlot({ answerKey: content })),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe.each([
  ["another faculty member", () => other],
  ["an administrator", () => admin],
])("an image, seen by %s", (_label, who) => {
  it("is missing from lists and cannot be read or deleted", async () => {
    expect(await t.data.assets.list(who())).toEqual([]);
    await expect(t.data.assets.get(who(), SHA)).rejects.toEqual(notFound);
    await expect(t.data.assets.remove(who(), SHA)).rejects.toEqual(notFound);
  });

  it("uploading the same file makes their own row and leaves the owner's alone", async () => {
    await t.data.assets.add(who(), {
      sha256: SHA,
      mime: "image/png",
      bytes: 10,
      originalName: "mine.png",
    });
    expect((await t.data.assets.get(who(), SHA)).originalName).toBe("mine.png");
    expect((await t.data.assets.get(owner, SHA)).originalName).toBe("structure.png");
    await t.data.assets.remove(who(), SHA);
    expect((await t.data.assets.get(owner, SHA)).ownerId).toBe(owner.userId);
  });
});

describe("account administration", () => {
  it.each([
    ["list users", () => t.data.users.list(other)],
    [
      "create a user",
      () => t.data.users.create(other, { name: "x", email: "x@example.com", passwordHash: "h" }),
    ],
    ["deactivate a user", () => t.data.users.setActive(other, owner.userId, false)],
    ["change a role", () => t.data.users.setRole(other, other.userId, "ADMIN")],
    ["reset a password", () => t.data.users.resetPassword(other, owner.userId, "h")],
    ["unlock an account", () => t.data.users.unlock(other, owner.userId)],
    ["allow Advanced LaTeX", () => t.data.users.setAdvancedLatex(other, other.userId, true)],
    ["create an invite", () => t.data.auth.createInvite(other, "id", "ADMIN", new Date(), null)],
    ["list invites", () => t.data.auth.listOpenInvites(other, new Date())],
    ["revoke an invite", () => t.data.auth.revokeInvite(other, "id", new Date())],
  ])("faculty cannot %s", async (_op, run) => {
    await expect(Promise.resolve().then((): Promise<unknown> => run())).rejects.toEqual(forbidden);
  });
});

describe("the owner", () => {
  it("still has full access after all of the above", async () => {
    expect((await t.data.templates.get(owner, privateTemplateId)).deletedAt).toBeNull();
    const p = await t.data.papers.getWithSlots(owner, paperId);
    expect(p.slots.map((s) => s.id)).toEqual([slotId]);
    expect(await t.data.papers.listCompiles(owner, paperId)).toHaveLength(1);
  });
});
