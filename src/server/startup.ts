// Runs once when the server starts. Problems the user can fix (a missing
// data folder, a broken settings file, a database that was never set up)
// stop the app with a plain-English message instead of a stack trace.
import fs from "node:fs";
import { ConfigError, readConfig } from "@/lib/config";
import { getData } from "@/lib/data";
import { DataDirError, dataPaths, getDataDir } from "@/lib/paths";
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
  if (!fs.existsSync(paths.database)) {
    stop(
      `There is no database in ${paths.root}. Run "npm run db:migrate" once, then start DRAFTEX again.`,
    );
  }
  getCompileService().sweep();
  try {
    const data = await getData();
    await data.auth.deleteExpiredSessions(new Date());
    const synced = await data.system.syncCatalogue();
    if (synced.created || synced.updated) {
      console.log(`[catalogue] Courses added: ${synced.created}, updated: ${synced.updated}.`);
    }
  } catch {
    stop(
      `The database in ${paths.root} is not up to date. Run "npm run db:migrate", then start DRAFTEX again.`,
    );
  }
}
