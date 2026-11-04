// Run by update-windows.ps1 / update-macos.sh before anything changes: the
// update stops if DRAFTEX is running (Windows locks its files) or if files in
// the DRAFTEX folder were edited by hand (git pull would mix or refuse them).
// Usage: node scripts/update-check.ts
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appRunning } from "../src/lib/lock.ts";
import { DataDirError, dataPaths, getDataDir } from "../src/lib/paths.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function stop(msg: string): never {
  console.error(`[update] STOPPED: ${msg}`);
  process.exit(1);
}

try {
  if (appRunning(dataPaths(getDataDir()))) {
    stop("DRAFTEX is running. Close its window, then run the update again.");
  }
} catch (e) {
  if (e instanceof DataDirError) stop(e.message);
  throw e;
}

let changed: string;
try {
  changed = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], {
    cwd: root,
    encoding: "utf8",
  });
} catch {
  stop("Git is not installed or this folder is not a Git copy of DRAFTEX. See the user guide.");
}
if (changed.trim()) {
  stop(
    "Some DRAFTEX files were changed on this computer, so the update would overwrite them:\n" +
      changed
        .trim()
        .split("\n")
        .map((l) => `    ${l.slice(3)}`)
        .join("\n") +
      "\n  Ask whoever set up DRAFTEX to look at them. Your papers are not in this folder and are safe.",
  );
}
console.log("[update] DRAFTEX is stopped and its files are unchanged.");
