// What the Backups screen can ask for (D28–D31). Administrators only:
// everyone else gets "not found" (memory.md "Admin pages answer 404").
// Independent of Next.js so gate 8 can test it directly.
import fs from "node:fs";
import path from "node:path";
import { BACKUP_KIND_LABEL, MAX_BACKUP_BYTES, parseBackupName } from "@/lib/backup/archive";
import {
  type BackupContext,
  type BackupSummary,
  cancelRestore,
  createBackup,
  listBackups,
  pendingRestore,
  stageRestore,
} from "@/lib/backup/run";
import { type Actor, type DataLayer, NotFoundError } from "@/lib/data";

export interface BackupRow {
  name: string;
  at: string;
  kind: string;
  bytes: number;
}

export function backupCommands(data: Pick<DataLayer, "audit">, ctx: BackupContext, actor: Actor) {
  const admin = () => {
    if (actor.role !== "ADMIN") throw new NotFoundError("Page");
  };
  const audit = (action: string, entityId: string | null) =>
    data.audit.record({ actorId: actor.userId, action, entity: "Backup", entityId });

  /** Only names DRAFTEX made, only from the backups folder. */
  const fileOf = (name: string): string => {
    admin();
    const file = path.join(ctx.paths.backups, name);
    if (!parseBackupName(name) || !fs.existsSync(file)) throw new NotFoundError("Backup");
    return file;
  };

  return {
    list(): { rows: BackupRow[]; pending: boolean; folder: string } {
      admin();
      return {
        rows: listBackups(ctx.paths).map((b) => ({
          name: b.name,
          at: b.at.toISOString(),
          kind: BACKUP_KIND_LABEL[b.kind],
          bytes: b.bytes,
        })),
        pending: pendingRestore(ctx.paths),
        folder: ctx.paths.backups,
      };
    },

    async backupNow(): Promise<string> {
      admin();
      const b = await createBackup(ctx, "manual");
      await audit("backup", b.name);
      return b.name;
    },

    /** The file to send for a download; only names DRAFTEX made, only from the backups folder. */
    file: fileOf,

    /** Deletes one backup for good (a choice the Backups screen confirms first). */
    async remove(name: string): Promise<void> {
      const file = fileOf(name);
      fs.rmSync(file, { force: true });
      await audit("delete-backup", name);
    },

    async stage(
      zip: Uint8Array,
    ): Promise<{ ok: true; summary: BackupSummary } | { ok: false; message: string }> {
      admin();
      if (zip.length > MAX_BACKUP_BYTES) return { ok: false, message: "The backup is too large." };
      const r = stageRestore(ctx.paths, ctx.repoRoot, zip);
      if (r.ok) await audit("stage-restore", r.summary.manifest.createdAt);
      return r;
    },

    async cancel(): Promise<void> {
      admin();
      if (!pendingRestore(ctx.paths)) return;
      cancelRestore(ctx.paths);
      await audit("cancel-restore", null);
    },
  };
}
