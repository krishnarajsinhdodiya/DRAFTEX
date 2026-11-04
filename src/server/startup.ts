// Runs once when the server starts. Problems the user can fix (a missing
// data folder, a broken settings file, a database that was never set up)
// stop the app with a plain-English message instead of a stack trace.
import fs from "node:fs";
import {
  RestoredButNotMigrated,
  applyPendingRestore,
  removeLock,
  writeLock,
} from "@/lib/backup/run";
import { ConfigError, readConfig } from "@/lib/config";
import { getData } from "@/lib/data";
import { DataDirError, dataPaths, getDataDir } from "@/lib/paths";
import { backupContext, runMigrations, scheduleDailyBackups } from "./backups";
import { getCompileService } from "./compile";

function stop(message: string): never {
  console.error(`\nDRAFTEX cannot start.\n${message}\n`);
  process.exit(1);
}

export async function startup(): Promise<void> {
  let paths;
  try {
    paths = dataPaths(getDataDir());
    readConfig(paths.config);
  } catch (e) {
    if (e instanceof DataDirError || e instanceof ConfigError) stop(e.message);
    throw e;
  }
  // A restore staged by an administrator is applied before anything opens the database (D28).
  try {
    const ctx = backupContext();
    const restored = await applyPendingRestore(ctx, () => runMigrations(ctx.repoRoot));
    if (restored) {
      console.log(
        `[restore] Restored the backup of ${restored.summary.manifest.createdAt}.` +
          (restored.safety ? ` The data it replaced is in backups/${restored.safety.name}.` : ""),
      );
    }
  } catch (e) {
    if (e instanceof RestoredButNotMigrated) stop(e.message);
    stop(
      `The backup could not be restored: ${(e as Error).message}\nYour data was left as it was.`,
    );
  }
  writeLock(paths);
  process.once("exit", () => removeLock(paths));
  if (!fs.existsSync(paths.database)) {
    stop(
      `There is no database in ${paths.root}. Run "npm run db:migrate" once, then start DRAFTEX again.`,
    );
  }
  getCompileService().sweep();
  try {
    const data = await getData();
    await data.auth.deleteExpiredSessions(new Date());
    await data.auth.deleteStaleLoginLocks(new Date());
    const synced = await data.system.syncCatalogue();
    if (synced.created || synced.updated) {
      console.log(`[catalogue] Courses added: ${synced.created}, updated: ${synced.updated}.`);
    }
    // Before first-run setup there is no owner yet; setup runs this again.
    const seeded = await data.system.syncBuiltInTemplates();
    if (seeded.created || seeded.updated) {
      console.log(
        `[templates] Built-in templates added: ${seeded.created}, updated: ${seeded.updated}.`,
      );
    }
    scheduleDailyBackups(() => data.auth.hasUsers());
  } catch {
    stop(
      `The database in ${paths.root} is not up to date. Run "npm run db:migrate", then start DRAFTEX again.`,
    );
  }
}
