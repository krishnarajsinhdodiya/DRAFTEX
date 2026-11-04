// Backups and restore on disk (D28–D31). Shared by the app (admin page,
// daily backups, applying a staged restore at startup) and the
// `npm run backup` / `npm run restore` scripts, so imports stay relative.
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import {
  type BackupKind,
  type Manifest,
  backupFileName,
  buildBackup,
  checkBackup,
  parseBackupName,
  prunable,
} from "./archive.ts";
import type { DataPaths } from "../paths.ts";

export { LOCK_FILE, appRunning, removeLock, writeLock } from "../lock.ts";

/** The upload waiting for the next start (D28). */
export const PENDING_FILE = "restore-pending.zip";

export interface BackupContext {
  paths: DataPaths;
  repoRoot: string;
  appVersion: string;
  now?: () => Date;
}

const ASSET = /^[a-f0-9]{64}\.(?:png|jpg|pdf)$/;

/** Migration folder names this copy of DRAFTEX ships. */
export function knownMigrations(repoRoot: string): string[] {
  const dir = path.join(/* turbopackIgnore: true */ repoRoot, "prisma", "migrations");
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

function appliedMigrations(dbFile: string): string[] {
  const db = new Database(dbFile, { readonly: true, fileMustExist: true });
  try {
    return (
      db
        .prepare(
          "SELECT migration_name AS name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name",
        )
        .all() as { name: string }[]
    ).map((r) => r.name);
  } finally {
    db.close();
  }
}

/** Writes `bytes` beside `file` and renames it into place: never half a file. */
function writeAtomic(file: string, bytes: Uint8Array): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(tmp, bytes);
    fs.renameSync(tmp, file);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

export interface BackupInfo {
  name: string;
  bytes: number;
  at: Date;
  kind: BackupKind;
}

/** Backups in the backups folder, newest first; files DRAFTEX did not name are ignored. */
export function listBackups(paths: DataPaths): BackupInfo[] {
  if (!fs.existsSync(paths.backups)) return [];
  return fs
    .readdirSync(paths.backups)
    .flatMap((name) => {
      const p = parseBackupName(name);
      if (!p) return [];
      return [{ name, bytes: fs.statSync(path.join(paths.backups, name)).size, ...p }];
    })
    .sort((a, b) => b.name.localeCompare(a.name));
}

/**
 * Makes a backup with SQLite's online backup API, so it is consistent while
 * the app runs, then drops automatic backups beyond the newest 14.
 */
export async function createBackup(ctx: BackupContext, kind: BackupKind): Promise<BackupInfo> {
  const { paths } = ctx;
  const at = (ctx.now ?? (() => new Date()))();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "draftex-backup-"));
  try {
    const copy = path.join(tmpDir, "data.db");
    const live = new Database(paths.database, { readonly: true, fileMustExist: true });
    try {
      await live.backup(copy);
    } finally {
      live.close();
    }
    const assets: Record<string, Uint8Array> = {};
    if (fs.existsSync(paths.assets)) {
      for (const name of fs.readdirSync(paths.assets).filter((n) => ASSET.test(n))) {
        assets[name] = fs.readFileSync(path.join(paths.assets, name));
      }
    }
    const zip = buildBackup({
      db: fs.readFileSync(copy),
      config: fs.existsSync(paths.config) ? fs.readFileSync(paths.config) : null,
      assets,
      appVersion: ctx.appVersion,
      createdAt: at,
      kind,
      migrations: appliedMigrations(copy),
    });
    let n = 1;
    while (fs.existsSync(path.join(paths.backups, backupFileName(at, kind, n)))) n++;
    const name = backupFileName(at, kind, n);
    writeAtomic(path.join(paths.backups, name), zip);
    for (const old of prunable(listBackups(paths).map((b) => b.name))) {
      fs.rmSync(path.join(paths.backups, old), { force: true });
    }
    return { name, bytes: zip.length, at, kind };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** Daily backups (D31): one when the newest automatic backup is older than a day. */
export async function autoBackupIfDue(ctx: BackupContext): Promise<BackupInfo | null> {
  const now = (ctx.now ?? (() => new Date()))();
  const last = listBackups(ctx.paths).find((b) => b.kind === "auto");
  if (last && now.getTime() - last.at.getTime() < 24 * 60 * 60 * 1000) return null;
  return createBackup(ctx, "auto");
}

export interface BackupSummary {
  manifest: Manifest;
  users: number;
  papers: number;
  pictures: number;
}

type Checked =
  | { ok: true; summary: BackupSummary; files: Record<string, Uint8Array> }
  | { ok: false; message: string };

/** Everything checkBackup does, plus SQLite's own integrity check of the database inside. */
export function inspectBackup(zip: Uint8Array, repoRoot: string): Checked {
  const c = checkBackup(zip, knownMigrations(repoRoot));
  if (!c.ok) return c;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "draftex-restore-check-"));
  try {
    const file = path.join(tmpDir, "data.db");
    fs.writeFileSync(file, c.files["data.db"] as Uint8Array);
    let db: Database.Database | undefined;
    try {
      db = new Database(file, { readonly: true, fileMustExist: true });
      const [check] = db.pragma("integrity_check") as { integrity_check: string }[];
      if (check?.integrity_check !== "ok") throw new Error("integrity");
      const count = (table: string) =>
        (db?.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number }).n;
      const summary = {
        manifest: c.manifest,
        users: count("User"),
        papers: count("Paper"),
        pictures: Object.keys(c.files).filter((n) => n.startsWith("assets/")).length,
      };
      if (summary.users === 0) throw new Error("empty");
      if (appliedMigrations(file).join() !== c.manifest.migrations.join())
        throw new Error("migrations");
      return { ok: true, summary, files: c.files };
    } catch {
      return {
        ok: false,
        message: "The database in this backup is damaged and cannot be restored.",
      };
    } finally {
      db?.close();
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** Checks an uploaded backup and keeps it for the next start (D28). */
export function stageRestore(
  paths: DataPaths,
  repoRoot: string,
  zip: Uint8Array,
): { ok: true; summary: BackupSummary } | { ok: false; message: string } {
  const c = inspectBackup(zip, repoRoot);
  if (!c.ok) return c;
  writeAtomic(path.join(paths.root, PENDING_FILE), zip);
  return { ok: true, summary: c.summary };
}

export function pendingRestore(paths: DataPaths): boolean {
  return fs.existsSync(path.join(paths.root, PENDING_FILE));
}

export function cancelRestore(paths: DataPaths): void {
  fs.rmSync(path.join(paths.root, PENDING_FILE), { force: true });
}

/** The backup's files are in place but its database could not be brought up to date. */
export class RestoredButNotMigrated extends Error {
  override name = "RestoredButNotMigrated";
  readonly safety: BackupInfo | null;
  constructor(safety: BackupInfo | null) {
    super(
      'The backup was restored, but its database could not be brought up to date. Run "npm run db:migrate", then start DRAFTEX again.' +
        (safety ? ` The data it replaced is in backups/${safety.name}.` : ""),
    );
    this.safety = safety;
  }
}

const DB_FILES = ["data.db", "data.db-wal", "data.db-shm", "data.db-journal"];

/**
 * Replaces the database and pictures with the backup's. This computer's
 * config.json (network mode, port) is kept: a backup made in LAN mode must
 * not open this computer to the network (owner decision 2026-11-04). The
 * current data is backed up first (when there is any) and moved aside until
 * the new files are in place, so a failure part-way puts it back. Then
 * `migrate` brings an older backup's database up to date. Call only while no
 * one has the database open: at startup or from the restore script.
 */
export async function applyRestore(
  ctx: BackupContext,
  zip: Uint8Array,
  migrate: () => void,
): Promise<{ summary: BackupSummary; safety: BackupInfo | null }> {
  const { paths } = ctx;
  const c = inspectBackup(zip, ctx.repoRoot);
  if (!c.ok) throw new Error(c.message);
  const safety = fs.existsSync(paths.database) ? await createBackup(ctx, "before-restore") : null;

  const work = path.join(paths.root, `.restore-${randomUUID()}`);
  const aside = path.join(paths.root, `.replaced-${randomUUID()}`);
  fs.mkdirSync(path.join(work, "assets"), { recursive: true });
  fs.mkdirSync(aside);
  const moved: string[] = [];
  const placed: string[] = [];
  try {
    for (const [name, bytes] of Object.entries(c.files)) {
      if (name === "manifest.json") continue;
      fs.writeFileSync(path.join(work, ...name.split("/")), bytes);
    }
    for (const name of [...DB_FILES, "assets"]) {
      const from = path.join(paths.root, name);
      if (!fs.existsSync(from)) continue;
      fs.renameSync(from, path.join(aside, name));
      moved.push(name);
    }
    for (const name of ["data.db", "assets"]) {
      const from = path.join(work, name);
      if (!fs.existsSync(from)) continue;
      // The data folder is outside the app; there is nothing here for the build to trace.
      fs.renameSync(from, path.join(/* turbopackIgnore: true */ paths.root, name));
      placed.push(name);
    }
  } catch (e) {
    // Put the old data back exactly as it was.
    for (const name of placed)
      fs.rmSync(path.join(paths.root, name), { recursive: true, force: true });
    for (const name of moved) fs.renameSync(path.join(aside, name), path.join(paths.root, name));
    fs.rmSync(aside, { recursive: true, force: true });
    throw e;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  fs.rmSync(aside, { recursive: true, force: true });
  try {
    migrate();
  } catch {
    throw new RestoredButNotMigrated(safety);
  }
  return { summary: c.summary, safety };
}

/** Applies a staged restore, if there is one; the staged file is removed either way. */
export async function applyPendingRestore(
  ctx: BackupContext,
  migrate: () => void,
): Promise<{ summary: BackupSummary; safety: BackupInfo | null } | null> {
  const file = path.join(ctx.paths.root, PENDING_FILE);
  if (!fs.existsSync(file)) return null;
  const zip = fs.readFileSync(file);
  try {
    return await applyRestore(ctx, zip, migrate);
  } finally {
    fs.rmSync(file, { force: true });
  }
}
