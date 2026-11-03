// Backup zips (D28–D31): what goes in, how they are named, and the checks a
// zip must pass before anything in it is trusted. Pure: no file system.
import { createHash } from "node:crypto";
import { type Unzipped, type Zippable, unzipSync, zipSync } from "fflate";
import { z } from "zod";

export const BACKUP_FORMAT = 1;
export const KEEP_AUTO = 14;
export const MAX_BACKUP_BYTES = 2 * 1024 ** 3;
const MAX_DB_BYTES = 1024 ** 3;
const MAX_MANIFEST_BYTES = 1024 ** 2;

export const BACKUP_KINDS = ["auto", "manual", "before-restore", "before-update"] as const;
export type BackupKind = (typeof BACKUP_KINDS)[number];

export const BACKUP_KIND_LABEL: Record<BackupKind, string> = {
  auto: "Daily",
  manual: "Made by hand",
  "before-restore": "Before a restore",
  "before-update": "Before an update",
};

/** Every name a backup may hold; anything else means it is not ours. */
const ENTRY = /^(manifest\.json|data\.db|config\.json|assets\/[a-f0-9]{64}\.(?:png|jpg|pdf))$/;

const manifestSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  app: z.literal("DRAFTEX"),
  appVersion: z.string().max(40),
  createdAt: z.iso.datetime(),
  kind: z.enum(BACKUP_KINDS),
  migrations: z.array(z.string().regex(/^[A-Za-z0-9_]{1,200}$/)).max(1000),
  files: z.record(
    z.string().regex(ENTRY),
    z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().min(0) }),
  ),
});
export type Manifest = z.output<typeof manifestSchema>;

export const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

const pad = (n: number) => String(n).padStart(2, "0");

/** DRAFTEX-backup-2026-11-04_101500-auto.zip (local time, sorts by name). */
export function backupFileName(at: Date, kind: BackupKind, n = 1): string {
  const stamp = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}_${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
  return `DRAFTEX-backup-${stamp}-${kind}${n > 1 ? `-${n}` : ""}.zip`;
}

const NAME = new RegExp(
  `^DRAFTEX-backup-(\\d{4})-(\\d{2})-(\\d{2})_(\\d{2})(\\d{2})(\\d{2})-(${BACKUP_KINDS.join("|")})(?:-(\\d+))?\\.zip$`,
);

/** The parts of a backup file name, or null for a name DRAFTEX did not make. */
export function parseBackupName(name: string): { at: Date; kind: BackupKind } | null {
  const m = NAME.exec(name);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, kind] = m as unknown as string[];
  return {
    at: new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)),
    kind: kind as BackupKind,
  };
}

/** Automatic backups beyond the newest `keep`; other kinds are never pruned (D31). */
export function prunable(names: string[], keep = KEEP_AUTO): string[] {
  return names
    .filter((n) => parseBackupName(n)?.kind === "auto")
    .sort()
    .reverse()
    .slice(keep);
}

export function buildBackup(p: {
  db: Uint8Array;
  config: Uint8Array | null;
  assets: Record<string, Uint8Array>;
  appVersion: string;
  createdAt: Date;
  kind: BackupKind;
  migrations: string[];
}): Uint8Array {
  const entries: Record<string, Uint8Array> = { "data.db": p.db };
  if (p.config) entries["config.json"] = p.config;
  for (const [name, bytes] of Object.entries(p.assets)) entries[`assets/${name}`] = bytes;
  const manifest: Manifest = {
    format: BACKUP_FORMAT,
    app: "DRAFTEX",
    appVersion: p.appVersion,
    createdAt: p.createdAt.toISOString(),
    kind: p.kind,
    migrations: p.migrations,
    files: Object.fromEntries(
      Object.entries(entries).map(([n, b]) => [n, { sha256: sha256(b), bytes: b.length }]),
    ),
  };
  const zip: Zippable = {
    "manifest.json": new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`),
  };
  for (const [n, b] of Object.entries(entries)) {
    // The database compresses well; pictures and PDFs do not.
    zip[n] = [b, { level: n === "data.db" || n === "config.json" ? 6 : 0 }];
  }
  return zipSync(zip);
}

export type CheckedBackup =
  { ok: true; manifest: Manifest; files: Unzipped } | { ok: false; message: string };

const NOT_OURS = "This file is not a DRAFTEX backup.";

/**
 * Opens a zip that may come from anywhere. Entry names are checked before
 * anything is unpacked (so no path can leave the data folder), sizes are
 * capped, and every file must match the manifest's checksum. `knownMigrations`
 * are the ones this copy of DRAFTEX has: a backup from a newer copy is refused.
 */
export function checkBackup(zip: Uint8Array, knownMigrations: string[]): CheckedBackup {
  if (zip.length > MAX_BACKUP_BYTES) return { ok: false, message: "The backup is too large." };
  const entries: { name: string; size: number }[] = [];
  let files: Unzipped;
  try {
    unzipSync(zip, {
      filter: (f) => {
        entries.push({ name: f.name, size: f.originalSize });
        return false;
      },
    });
    if (entries.some((e) => !ENTRY.test(e.name))) return { ok: false, message: NOT_OURS };
    const total = entries.reduce((a, e) => a + e.size, 0);
    const db = entries.find((e) => e.name === "data.db");
    const man = entries.find((e) => e.name === "manifest.json");
    if (!db || !man) return { ok: false, message: NOT_OURS };
    if (total > MAX_BACKUP_BYTES || db.size > MAX_DB_BYTES || man.size > MAX_MANIFEST_BYTES) {
      return { ok: false, message: "The backup is too large." };
    }
    files = unzipSync(zip);
  } catch {
    return { ok: false, message: "The backup file is damaged and cannot be opened." };
  }
  let manifest: Manifest;
  try {
    manifest = manifestSchema.parse(JSON.parse(new TextDecoder().decode(files["manifest.json"])));
  } catch {
    return { ok: false, message: NOT_OURS };
  }
  const names = Object.keys(files).filter((n) => n !== "manifest.json");
  if (names.sort().join("\n") !== Object.keys(manifest.files).sort().join("\n")) {
    return { ok: false, message: "The backup is incomplete: some files are missing or extra." };
  }
  for (const n of names) {
    const want = manifest.files[n] as { sha256: string; bytes: number };
    const got = files[n] as Uint8Array;
    if (got.length !== want.bytes || sha256(got) !== want.sha256) {
      return { ok: false, message: "The backup is damaged: a file does not match its checksum." };
    }
  }
  const known = new Set(knownMigrations);
  if (manifest.migrations.some((m) => !known.has(m))) {
    return {
      ok: false,
      message: `This backup was made by a newer DRAFTEX (${manifest.appVersion}). Update DRAFTEX first, then restore it.`,
    };
  }
  return { ok: true, manifest, files };
}
