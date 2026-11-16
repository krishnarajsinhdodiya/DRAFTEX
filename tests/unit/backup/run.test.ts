// Backups and restore against a real migrated database in a throwaway data folder.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backupFileName } from "@/lib/backup/archive";
import {
  LOCK_FILE,
  PENDING_FILE,
  RestoredButNotMigrated,
  appRunning,
  applyPendingRestore,
  applyRestore,
  autoBackupIfDue,
  cancelRestore,
  createBackup,
  inspectBackup,
  knownMigrations,
  listBackups,
  pendingRestore,
  removeLock,
  stageRestore,
  writeLock,
} from "@/lib/backup/run";
import { type DataPaths, dataPaths } from "@/lib/paths";
import { copyMigratedDatabase } from "../../support/db";

const REPO = process.cwd();
const SHA = "b".repeat(64);
let root: string;
let paths: DataPaths;

/** A data folder as `npm run db:migrate` leaves it, with one user and one picture. */
function makeDataFolder(dir: string, userName = "Teacher"): DataPaths {
  fs.mkdirSync(dir, { recursive: true });
  const p = dataPaths(dir);
  // A copy of one migrated database: replaying every migration per test passed 10 s on Windows CI.
  copyMigratedDatabase(p.database);
  const db = new Database(p.database);
  db.pragma("journal_mode = WAL");
  db.exec(
    "CREATE TABLE _prisma_migrations (id TEXT PRIMARY KEY, checksum TEXT, finished_at DATETIME, migration_name TEXT, logs TEXT, rolled_back_at DATETIME, started_at DATETIME, applied_steps_count INTEGER)",
  );
  const ins = db.prepare(
    "INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, started_at, applied_steps_count) VALUES (?, 'x', CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, 1)",
  );
  knownMigrations(REPO).forEach((m, i) => ins.run(String(i), m));
  db.prepare(
    "INSERT INTO User (id, name, email, passwordHash, role, createdAt, updatedAt) VALUES (?, ?, ?, 'x', 'ADMIN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
  ).run(userName, userName, `${userName}@example.com`);
  db.close();
  fs.mkdirSync(p.assets, { recursive: true });
  fs.writeFileSync(path.join(p.assets, `${SHA}.png`), `picture of ${userName}`);
  fs.writeFileSync(path.join(p.assets, "stray.txt"), "not an asset");
  fs.writeFileSync(p.config, '{"mode":"local"}');
  return p;
}

const userName = (p: DataPaths) => {
  const db = new Database(p.database, { readonly: true });
  try {
    return (db.prepare("SELECT name FROM User").get() as { name: string }).name;
  } finally {
    db.close();
  }
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "dx-backup-"));
  paths = makeDataFolder(path.join(root, "data"));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const ctx = (now = new Date(2026, 10, 4, 10, 0, 0)) => ({
  paths,
  repoRoot: REPO,
  appVersion: "0.6.0",
  now: () => now,
});

describe("createBackup", () => {
  it("copies the live database, pictures and settings into a checked zip", async () => {
    const b = await createBackup(ctx(), "manual");
    expect(b.name).toBe("DRAFTEX-backup-2026-11-04_100000-manual.zip");
    expect(listBackups(paths).map((x) => x.name)).toEqual([b.name]);
    const zip = fs.readFileSync(path.join(paths.backups, b.name));
    const r = inspectBackup(zip, REPO);
    if (!r.ok) throw new Error(r.message);
    expect(r.summary).toMatchObject({ users: 1, papers: 0, pictures: 1 });
    expect(r.summary.manifest.migrations).toEqual(knownMigrations(REPO));
    expect(Object.keys(r.files)).not.toContain("assets/stray.txt");
    // Two in the same second get different names.
    expect((await createBackup(ctx(), "manual")).name).toBe(
      "DRAFTEX-backup-2026-11-04_100000-manual-2.zip",
    );
  });

  it("makes a daily backup only when the last one is a day old, and keeps 14", async () => {
    expect(await autoBackupIfDue(ctx())).not.toBeNull();
    expect(await autoBackupIfDue(ctx(new Date(2026, 10, 5, 9, 0)))).toBeNull();
    for (let d = 5; d <= 20; d++) await autoBackupIfDue(ctx(new Date(2026, 10, d, 11, 0)));
    await createBackup(ctx(new Date(2026, 0, 1)), "manual");
    fs.writeFileSync(path.join(paths.backups, "keep-me.zip"), "x");
    const autos = listBackups(paths).filter((b) => b.kind === "auto");
    expect(autos).toHaveLength(14);
    expect(autos.at(-1)?.name).toBe(backupFileName(new Date(2026, 10, 7, 11, 0), "auto"));
    expect(listBackups(paths).filter((b) => b.kind === "manual")).toHaveLength(1);
    expect(fs.existsSync(path.join(paths.backups, "keep-me.zip"))).toBe(true);
  });

  it("lists nothing when there is no backups folder", () => {
    expect(listBackups(dataPaths(path.join(root, "none")))).toEqual([]);
  });
});

describe("restore", () => {
  async function otherBackup(): Promise<Uint8Array> {
    const otherPaths = makeDataFolder(path.join(root, "other"), "Restored");
    // The other computer was open to its network; restoring must not carry that over.
    fs.writeFileSync(otherPaths.config, '{"mode":"lan","port":3300}');
    const b = await createBackup(
      { paths: otherPaths, repoRoot: REPO, appVersion: "0.6.0" },
      "manual",
    );
    return fs.readFileSync(path.join(otherPaths.backups, b.name));
  }

  it("is staged, can be cancelled, and is applied at the next start", async () => {
    const zip = await otherBackup();
    expect(stageRestore(paths, REPO, new Uint8Array([1, 2, 3]))).toMatchObject({ ok: false });
    expect(pendingRestore(paths)).toBe(false);
    expect(stageRestore(paths, REPO, zip)).toMatchObject({ ok: true, summary: { users: 1 } });
    expect(pendingRestore(paths)).toBe(true);
    cancelRestore(paths);
    expect(pendingRestore(paths)).toBe(false);
    expect(await applyPendingRestore(ctx(), () => {})).toBeNull();

    stageRestore(paths, REPO, zip);
    const migrate = vi.fn();
    const r = await applyPendingRestore(ctx(), migrate);
    expect(migrate).toHaveBeenCalledOnce();
    expect(r?.safety?.kind).toBe("before-restore");
    expect(userName(paths)).toBe("Restored");
    expect(fs.readFileSync(path.join(paths.assets, `${SHA}.png`), "utf8")).toBe(
      "picture of Restored",
    );
    expect(fs.existsSync(path.join(paths.assets, "stray.txt"))).toBe(false);
    expect(fs.readFileSync(paths.config, "utf8")).toBe('{"mode":"local"}');
    expect(fs.existsSync(path.join(paths.root, PENDING_FILE))).toBe(false);
    expect(fs.readdirSync(paths.root).filter((n) => n.startsWith("."))).toEqual([]);
    // The safety backup holds the data that was replaced.
    const safety = fs.readFileSync(path.join(paths.backups, r?.safety?.name as string));
    const again = await applyRestore(ctx(), safety, () => {});
    expect(again.summary.users).toBe(1);
    expect(userName(paths)).toBe("Teacher");
  });

  it("fills an empty data folder without a safety backup", async () => {
    const zip = await otherBackup();
    const empty = dataPaths(path.join(root, "empty"));
    fs.mkdirSync(empty.root);
    const r = await applyRestore(
      { paths: empty, repoRoot: REPO, appVersion: "0.6.0" },
      zip,
      () => {},
    );
    expect(r.safety).toBeNull();
    expect(userName(empty)).toBe("Restored");
    // No settings file: this computer starts in local mode, whatever the backup's was.
    expect(fs.existsSync(empty.config)).toBe(false);
  });

  it("carries the search index, which still finds and updates (Phase 16)", async () => {
    const otherPaths = makeDataFolder(path.join(root, "other"), "Searcher");
    const src = new Database(otherPaths.database);
    src
      .prepare(
        `INSERT INTO "Question" (id, ownerId, createdAt, searchText, sharing, version)
         VALUES ('q1', (SELECT id FROM "User"), CURRENT_TIMESTAMP, 'Invented isobutylphenyl question.', 'PRIVATE', 1)`,
      )
      .run();
    src.close();
    const b = await createBackup(
      { paths: otherPaths, repoRoot: REPO, appVersion: "0.16.0" },
      "manual",
    );
    const empty = dataPaths(path.join(root, "empty"));
    fs.mkdirSync(empty.root);
    await applyRestore(
      { paths: empty, repoRoot: REPO, appVersion: "0.16.0" },
      fs.readFileSync(path.join(otherPaths.backups, b.name)),
      () => {},
    );
    const db = new Database(empty.database);
    try {
      const find = (q: string) =>
        db.prepare(`SELECT question_id FROM question_fts WHERE question_fts MATCH ?`).all(q);
      expect(find('"butyl"')).toEqual([{ question_id: "q1" }]);
      db.exec(`INSERT INTO question_fts(question_fts) VALUES ('integrity-check')`);
      db.prepare(
        `UPDATE "Question" SET searchText = 'Invented tablet question.' WHERE id = 'q1'`,
      ).run();
      expect(find('"butyl"')).toEqual([]);
      expect(find('"tablet"')).toEqual([{ question_id: "q1" }]);
    } finally {
      db.close();
    }
  });

  it("refuses a damaged database and leaves the current data alone", async () => {
    const zip = await otherBackup();
    await expect(applyRestore(ctx(), new Uint8Array([0]), () => {})).rejects.toThrow(
      "The backup file is damaged and cannot be opened.",
    );
    // A backup whose database has no people is not something to restore.
    const db = new Database(dataPaths(path.join(root, "other")).database);
    db.exec("DELETE FROM User");
    db.close();
    const otherPaths = dataPaths(path.join(root, "other"));
    const b = await createBackup(
      { paths: otherPaths, repoRoot: REPO, appVersion: "0.6.0" },
      "manual",
    );
    const noUsers = fs.readFileSync(path.join(otherPaths.backups, b.name));
    expect(inspectBackup(noUsers, REPO)).toEqual({
      ok: false,
      message: "The database in this backup is damaged and cannot be restored.",
    });
    expect(userName(paths)).toBe("Teacher");
    expect(zip.length).toBeGreaterThan(0);
  });

  it("puts the old data back when the swap fails part-way", async () => {
    const zip = await otherBackup();
    const real = fs.renameSync;
    let calls = 0;
    const spy = vi.spyOn(fs, "renameSync").mockImplementation((a, b) => {
      // The backup zip's own rename, the moves aside, then fail on placing the new database.
      if (String(b) === paths.database && ++calls === 1) throw new Error("disk full");
      return real(a, b);
    });
    try {
      await expect(applyRestore(ctx(), zip, () => {})).rejects.toThrow("disk full");
    } finally {
      spy.mockRestore();
    }
    expect(userName(paths)).toBe("Teacher");
    expect(fs.readFileSync(path.join(paths.assets, `${SHA}.png`), "utf8")).toBe(
      "picture of Teacher",
    );
    expect(fs.readdirSync(paths.root).filter((n) => n.startsWith("."))).toEqual([]);
  });
});

describe("a restore whose migrations fail", () => {
  it("says the files are in place and where the replaced data went", async () => {
    const otherPaths = makeDataFolder(path.join(root, "other"), "Restored");
    const b = await createBackup(
      { paths: otherPaths, repoRoot: REPO, appVersion: "0.6.0" },
      "manual",
    );
    const zip = fs.readFileSync(path.join(otherPaths.backups, b.name));
    const err = await applyRestore(ctx(), zip, () => {
      throw new Error("boom");
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RestoredButNotMigrated);
    expect((err as Error).message).toMatch(
      /npm run db:migrate.*backups\/DRAFTEX-backup-.*-before-restore\.zip/,
    );
    expect(userName(paths)).toBe("Restored");
  });
});

describe("the running-app lock", () => {
  it("tells a restore script that DRAFTEX is running", () => {
    expect(appRunning(paths)).toBe(false);
    fs.writeFileSync(path.join(paths.root, LOCK_FILE), "424242");
    expect(appRunning(paths, () => true)).toBe(true);
    expect(appRunning(paths, () => false)).toBe(false);
    expect(appRunning(paths)).toBe(false);
    fs.writeFileSync(path.join(paths.root, LOCK_FILE), "junk");
    expect(appRunning(paths, () => true)).toBe(false);
    writeLock(paths);
    // Our own lock is not "another copy running".
    expect(appRunning(paths, () => true)).toBe(false);
    removeLock(paths);
    expect(fs.existsSync(path.join(paths.root, LOCK_FILE))).toBe(false);
    fs.writeFileSync(path.join(paths.root, LOCK_FILE), "1");
    removeLock(paths);
    expect(fs.existsSync(path.join(paths.root, LOCK_FILE))).toBe(true);
    // pid 1 always exists; signalling it from a normal user is EPERM, which still means alive.
    if (process.platform !== "win32") expect(appRunning(paths)).toBe(true);
  });
});
