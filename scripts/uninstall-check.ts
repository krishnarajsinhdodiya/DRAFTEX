// Run by uninstall-windows.ps1 / uninstall-macos.sh before anything is removed
// (D52). Stops if DRAFTEX is running; otherwise prints the data folder, which
// uninstall never touches, so the script can tell the user where the papers are.
// Usage: node scripts/uninstall-check.ts
import fs from "node:fs";
import { appRunning } from "../src/lib/lock.ts";
import { DataDirError, dataPaths, peekDataDir } from "../src/lib/paths.ts";

let dir: string;
try {
  dir = peekDataDir();
} catch (e) {
  if (!(e instanceof DataDirError)) throw e;
  // A configured folder that is missing (an unplugged drive): nothing is running from it.
  console.error(`[uninstall] Note: ${e.message}`);
  console.log("(not found)");
  process.exit(0);
}
if (fs.existsSync(dir) && appRunning(dataPaths(dir))) {
  console.error("[uninstall] STOPPED: DRAFTEX is running. Close its window, then run this again.");
  process.exit(1);
}
console.log(dir);
