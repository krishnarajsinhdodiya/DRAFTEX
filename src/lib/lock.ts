// The lock file a running DRAFTEX writes into its data folder. Scripts that
// replace or move the data (restore, move-data, update) refuse while it is
// held by a live process. Kept apart from src/lib/backup so the supervisor
// can read it without loading the database driver.
// Imported by Node scripts under type stripping: relative imports only.
import fs from "node:fs";
import path from "node:path";
import type { DataPaths } from "./paths.ts";

/** Written while the app runs, so a restore script can refuse to swap a live database. */
export const LOCK_FILE = "draftex.lock";

/** True when a DRAFTEX server that wrote the lock is still running. */
export function appRunning(paths: DataPaths, alive = processAlive): boolean {
  const file = path.join(paths.root, LOCK_FILE);
  if (!fs.existsSync(file)) return false;
  const pid = Number(fs.readFileSync(file, "utf8").trim());
  return Number.isInteger(pid) && pid > 0 && pid !== process.pid && alive(pid);
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function writeLock(paths: DataPaths): void {
  fs.writeFileSync(path.join(paths.root, LOCK_FILE), String(process.pid));
}

export function removeLock(paths: DataPaths): void {
  const file = path.join(paths.root, LOCK_FILE);
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8").trim() === String(process.pid)) {
    fs.rmSync(file, { force: true });
  }
}
