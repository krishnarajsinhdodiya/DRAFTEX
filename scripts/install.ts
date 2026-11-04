// The part of setup and update that is the same on every OS, run after
// `npm ci` by setup-windows.ps1 / setup-macos.sh: data folder, database,
// LaTeX engine, app build. Safe to run again; each step skips what is done.
// Usage: node scripts/install.ts
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudWarning } from "../src/lib/install/cloud.ts";
import { DataDirError, dataPaths, getDataDir } from "../src/lib/paths.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const env = { ...process.env, CHECKPOINT_DISABLE: "1", NEXT_TELEMETRY_DISABLED: "1" };
const started = Date.now();

const say = (msg: string) => console.log(`[install] ${msg}`);
function fail(msg: string): never {
  console.error(`[install] STOPPED: ${msg}`);
  process.exit(1);
}
const minutes = (ms: number) =>
  ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${(ms / 60_000).toFixed(1)} min`;

function step(n: number, title: string, script: string, args: string[], why: string): void {
  say(`Step ${n} of 5: ${title}`);
  const t = Date.now();
  try {
    execFileSync(process.execPath, [script, ...args], { cwd: root, stdio: "inherit", env });
  } catch {
    fail(`${why} The messages above say what went wrong. Fix it, then run setup again.`);
  }
  say(`  done in ${minutes(Date.now() - t)}.`);
}

say("Step 1 of 5: Finding the data folder");
let dataDir: string;
try {
  dataDir = getDataDir();
} catch (e) {
  if (e instanceof DataDirError) fail(e.message);
  throw e;
}
say(`  Papers, pictures, backups and settings live in ${dataDir}`);
const cloud = { platform: process.platform, homedir: os.homedir(), env: process.env };
for (const [dir, what] of [
  [dataDir, "The data folder"],
  [root, "The DRAFTEX folder"],
] as const) {
  const warning = cloudWarning(dir, what, cloud);
  if (warning) say(`  WARNING: ${warning}`);
}

step(
  2,
  "Preparing the database",
  path.join(root, "scripts", "db-migrate.ts"),
  [],
  "The database could not be prepared.",
);
step(
  3,
  "Installing the LaTeX engine (the first time this downloads packages and takes a few minutes)",
  path.join(root, "scripts", "setup-tectonic.ts"),
  [],
  "The LaTeX engine could not be installed.",
);
const nextCli = require.resolve("next/dist/bin/next");
step(4, "Building the app", nextCli, ["build"], "The app could not be built.");
say("Step 5 of 5: Turning off Next.js usage reporting");
try {
  execFileSync(process.execPath, [nextCli, "telemetry", "disable"], {
    cwd: root,
    stdio: "ignore",
    env,
  });
} catch {
  say("  Could not change the setting; DRAFTEX turns reporting off when it starts anyway.");
}
say(`Finished in ${minutes(Date.now() - started)}. Data folder: ${dataPaths(dataDir).root}`);
