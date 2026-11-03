// Makes a backup of the data folder now (D31). The update scripts call it
// with --kind before-update; by hand it is a manual backup.
// Usage: node scripts/backup.ts [--kind manual|before-update]
import fs from "node:fs";
import path from "node:path";
import { createBackup } from "../src/lib/backup/run.ts";
import { DataDirError, dataPaths, findRepoRoot, getDataDir } from "../src/lib/paths.ts";

const kindArg = process.argv[process.argv.indexOf("--kind") + 1];
const kind =
  process.argv.includes("--kind") && kindArg === "before-update" ? "before-update" : "manual";

try {
  const repoRoot = findRepoRoot(process.cwd());
  const paths = dataPaths(getDataDir());
  if (!fs.existsSync(paths.database)) {
    console.log(`[backup] No database in ${paths.root} yet; nothing to back up.`);
    process.exit(0);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
    version: string;
  };
  const b = await createBackup({ paths, repoRoot, appVersion: pkg.version }, kind);
  console.log(
    `[backup] Saved ${path.join(paths.backups, b.name)} (${Math.ceil(b.bytes / 1024)} KB).`,
  );
  console.log("[backup] It holds unreleased exam papers: keep it somewhere private.");
} catch (e) {
  if (e instanceof DataDirError) console.error(`[backup] ${e.message}`);
  else console.error(`[backup] The backup failed: ${(e as Error).message}`);
  process.exit(1);
}
