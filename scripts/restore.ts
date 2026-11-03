// Restores a backup into the data folder (D28, D35): for a new computer, an
// empty data folder, or instead of the admin page. DRAFTEX must be stopped.
// The data it replaces is backed up first.
// Usage: node scripts/restore.ts <backup.zip> [--yes]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { appRunning, applyRestore, inspectBackup } from "../src/lib/backup/run.ts";
import { DataDirError, dataPaths, findRepoRoot, getDataDir } from "../src/lib/paths.ts";

const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
const yes = process.argv.includes("--yes");

function fail(message: string): never {
  console.error(`[restore] ${message}`);
  process.exit(1);
}

if (!file) fail('Say which backup to restore: npm run restore -- "<path to the .zip>"');
try {
  const repoRoot = findRepoRoot(process.cwd());
  const paths = dataPaths(getDataDir());
  if (appRunning(paths)) fail("DRAFTEX is running. Stop it first, then restore.");
  if (!fs.existsSync(file)) fail(`There is no file at ${file}.`);
  const zip = fs.readFileSync(file);
  const checked = inspectBackup(zip, repoRoot);
  if (!checked.ok) fail(checked.message);
  const s = checked.summary;
  console.log(
    `[restore] Backup made ${new Date(s.manifest.createdAt).toLocaleString()} by DRAFTEX ${s.manifest.appVersion}:`,
  );
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  console.log(
    `[restore]   ${n(s.users, "person", "people")}, ${n(s.papers, "paper", "papers")}, ${n(s.pictures, "picture", "pictures")}.`,
  );
  const replacing = fs.existsSync(paths.database);
  console.log(
    replacing
      ? `[restore] It replaces everything in ${paths.root}; the current data is backed up first.`
      : `[restore] It goes into ${paths.root}.`,
  );
  if (!yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question("[restore] Type yes to restore: ");
    rl.close();
    if (answer.trim().toLowerCase() !== "yes") fail("Nothing was changed.");
  }
  fs.mkdirSync(paths.root, { recursive: true });
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
    version: string;
  };
  const prismaCli = createRequire(import.meta.url).resolve("prisma/build/index.js");
  const r = await applyRestore({ paths, repoRoot, appVersion: pkg.version }, zip, () =>
    execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
      stdio: "inherit",
      env: { ...process.env, CHECKPOINT_DISABLE: "1" },
    }),
  );
  if (r.safety)
    console.log(`[restore] The replaced data is in ${path.join(paths.backups, r.safety.name)}.`);
  console.log("[restore] Done. Start DRAFTEX and sign in with the accounts from the backup.");
} catch (e) {
  if (e instanceof DataDirError) fail(e.message);
  fail((e as Error).message);
}
