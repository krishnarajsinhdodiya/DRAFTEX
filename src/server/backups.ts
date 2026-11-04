// Process-wide wiring for backups (D28–D31): the context every backup call
// needs, migrations after a restore, and the daily backup timer.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { type BackupContext, autoBackupIfDue } from "@/lib/backup/run";
import { appInfo } from "@/lib/app-info";
import { dataPaths, defaultDeps, getDataDir } from "@/lib/paths";

/* v8 ignore start -- process-wide wiring, exercised by e2e */
export function backupContext(): BackupContext {
  return {
    paths: dataPaths(getDataDir()),
    repoRoot: defaultDeps().repoRoot,
    appVersion: appInfo.version,
  };
}

/** `prisma migrate deploy` for the current data folder, as `npm run db:migrate` does. */
export function runMigrations(repoRoot: string): void {
  const cli = path.join(
    /* turbopackIgnore: true */ repoRoot,
    "node_modules",
    "prisma",
    "build",
    "index.js",
  );
  execFileSync(process.execPath, [cli, "migrate", "deploy"], {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...process.env, CHECKPOINT_DISABLE: "1" },
  });
}

const HOUR = 60 * 60 * 1000;
const globalForBackups = globalThis as unknown as { draftexBackupTimer?: NodeJS.Timeout };

/** Checks every hour (a laptop sleeps through a 24 h timer) whether a daily backup is due. */
export function scheduleDailyBackups(hasUsers: () => Promise<boolean>): void {
  const tick = async () => {
    try {
      // Nothing worth keeping before first-run setup.
      if (!(await hasUsers())) return;
      const made = await autoBackupIfDue(backupContext());
      if (made) console.log(`[backup] Daily backup saved: ${made.name}`);
    } catch (e) {
      console.error(`[backup] The daily backup failed: ${(e as Error).message}`);
    }
  };
  void tick();
  clearInterval(globalForBackups.draftexBackupTimer);
  globalForBackups.draftexBackupTimer = setInterval(() => void tick(), HOUR);
  globalForBackups.draftexBackupTimer.unref();
}
const globalForTrash = globalThis as unknown as { draftexTrashTimer?: NodeJS.Timeout };

/** Removes papers that have been in Trash for 30 days (D51): at startup, then every hour. */
export function scheduleTrashPurge(purge: () => Promise<number>): void {
  const tick = async () => {
    try {
      const n = await purge();
      if (n > 0) console.log(`[trash] Removed ${n} paper(s) that had been in Trash for 30 days.`);
    } catch (e) {
      console.error(`[trash] Emptying old Trash failed: ${(e as Error).message}`);
    }
  };
  void tick();
  clearInterval(globalForTrash.draftexTrashTimer);
  globalForTrash.draftexTrashTimer = setInterval(() => void tick(), HOUR);
  globalForTrash.draftexTrashTimer.unref();
}
/* v8 ignore stop */
