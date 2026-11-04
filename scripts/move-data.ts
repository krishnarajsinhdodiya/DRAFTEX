// Moves the data folder to another place (D45). DRAFTEX must be stopped.
// Usage: npm run move-data -- "<new folder>"
import os from "node:os";
import { cloudWarning } from "../src/lib/install/cloud.ts";
import { MoveError, moveDataFolder } from "../src/lib/install/move.ts";
import { DataDirError, findRepoRoot, getDataDir } from "../src/lib/paths.ts";

const say = (msg: string) => console.log(`[move-data] ${msg}`);
const to = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!to) {
  console.error('[move-data] Say where to: npm run move-data -- "<new folder>"');
  process.exit(1);
}
try {
  const from = getDataDir();
  const warning = cloudWarning(to, "The new folder", {
    platform: process.platform,
    homedir: os.homedir(),
    env: process.env,
  });
  if (warning) say(`WARNING: ${warning}`);
  say(`Moving ${from} → ${to}`);
  const r = moveDataFolder(
    { from, to, repoRoot: findRepoRoot(process.cwd()), env: process.env },
    say,
  );
  say(`Copied and checked ${r.files} files (${Math.ceil(r.bytes / 1024 / 1024)} MB).`);
  say(`DRAFTEX now uses ${r.to}.`);
  say(`Start DRAFTEX and check your papers. Then you may delete the old folder: ${from}`);
} catch (e) {
  if (e instanceof MoveError || e instanceof DataDirError) {
    console.error(`[move-data] ${e.message}`);
    process.exit(1);
  }
  throw e;
}
