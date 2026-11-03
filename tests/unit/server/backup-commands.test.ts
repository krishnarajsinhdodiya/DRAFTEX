// Gate 8 for backups: only administrators may list, make, download, stage or
// cancel; everyone else gets "not found". Downloads serve only names DRAFTEX made.
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/data";
import { NotFoundError } from "@/lib/data";
import { dataPaths } from "@/lib/paths";
import { backupCommands } from "@/server/backup-commands";
import { createTestDb, type TestDb } from "../../support/db";

let t: TestDb;
let admin: Actor;
let faculty: Actor;
let ctx: Parameters<typeof backupCommands>[1];

beforeAll(async () => {
  t = await createTestDb();
  const mk = async (email: string, role: "ADMIN" | "FACULTY") => {
    const u = await t.db.user.create({ data: { name: email, email, passwordHash: "x", role } });
    return { userId: u.id, role } as Actor;
  };
  admin = await mk("a@example.com", "ADMIN");
  faculty = await mk("f@example.com", "FACULTY");
  // The test database has no Prisma history table; a real one always does.
  await t.db.$executeRawUnsafe(
    "CREATE TABLE _prisma_migrations (id TEXT PRIMARY KEY, checksum TEXT, finished_at DATETIME, migration_name TEXT, logs TEXT, rolled_back_at DATETIME, started_at DATETIME, applied_steps_count INTEGER)",
  );
  ctx = { paths: dataPaths(path.dirname(t.file)), repoRoot: process.cwd(), appVersion: "0.6.0" };
});
afterAll(() => t.close());

describe("backups, for an administrator", () => {
  it("are made, listed, downloaded and audited", async () => {
    const c = backupCommands(t.data, ctx, admin);
    expect(c.list()).toMatchObject({ rows: [], pending: false, folder: ctx.paths.backups });
    const name = await c.backupNow();
    expect(c.list().rows).toEqual([
      expect.objectContaining({ name, kind: "Made by hand", bytes: expect.any(Number) }),
    ]);
    expect(c.file(name)).toBe(path.join(ctx.paths.backups, name));
    for (const bad of ["../data.db", "data.db", "DRAFTEX-backup-2026-01-01_000000-auto.zip"]) {
      expect(() => c.file(bad)).toThrow(NotFoundError);
    }
    const audit = await t.db.auditLog.findMany({ where: { entity: "Backup" } });
    expect(audit.map((a) => [a.action, a.actorId])).toEqual([["backup", admin.userId]]);
  });

  it("stage a valid restore, refuse a bad one, and cancel", async () => {
    const c = backupCommands(t.data, ctx, admin);
    expect(await c.stage(new Uint8Array([1, 2]))).toMatchObject({ ok: false });
    const zip = fs.readFileSync(c.file(c.list().rows[0]?.name as string));
    expect(await c.stage(zip)).toMatchObject({ ok: true, summary: { users: 2 } });
    expect(c.list().pending).toBe(true);
    await c.cancel();
    await c.cancel();
    expect(c.list().pending).toBe(false);
    const actions = (await t.db.auditLog.findMany({ where: { entity: "Backup" } })).map(
      (a) => a.action,
    );
    expect(actions).toEqual(["backup", "stage-restore", "cancel-restore"]);
  });
});

describe("backups, for faculty", () => {
  const c = () => backupCommands(t.data, ctx, faculty);
  it.each([
    ["list them", () => c().list()],
    ["make one", () => c().backupNow()],
    ["download one", () => c().file(fs.readdirSync(ctx.paths.backups)[0] as string)],
    ["stage a restore", () => c().stage(new Uint8Array([1]))],
    ["cancel a restore", () => c().cancel()],
  ])("cannot %s (not found)", async (_op, run) => {
    await expect((async () => run())()).rejects.toBeInstanceOf(NotFoundError);
  });
});
