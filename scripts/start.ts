// `npm start` / `npm run dev`: runs server.ts and starts it again when it
// exits with the restart code, so "Restart DRAFTEX" (network mode changes,
// staged restores) needs no terminal (D37). Any other exit ends this script too.
// --open (the desktop shortcut) opens the browser once the app answers; if
// DRAFTEX is already running it only opens the browser. DRAFTEX_NO_BROWSER=1
// skips the browser (CI).
// Usage: node scripts/start.ts [--dev] [--open]
import { execFile, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readConfig } from "../src/lib/config.ts";
import { browserCommand, localAppUrl, waitUntil } from "../src/lib/install/browser.ts";
import { appRunning } from "../src/lib/lock.ts";
import { ENV, RESTART_EXIT_CODE } from "../src/lib/net/runtime.ts";
import { dataPaths, getDataDir } from "../src/lib/paths.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const open = process.argv.includes("--open");
const args = [path.join(root, "server.ts"), ...process.argv.slice(2).filter((a) => a !== "--open")];

let child: ReturnType<typeof spawn> | null = null;
let stopping = false;

function run(): void {
  child = spawn(process.execPath, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, [ENV.supervised]: "1", NEXT_TELEMETRY_DISABLED: "1" },
  });
  child.on("exit", (code, signal) => {
    child = null;
    if (!stopping && code === RESTART_EXIT_CODE) {
      console.log("DRAFTEX is restarting…");
      run();
      return;
    }
    process.exit(code ?? (signal ? 1 : 0));
  });
}

function stop(): void {
  stopping = true;
  if (child) child.kill("SIGTERM");
  else process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
// Closing the window (D46) sends SIGHUP on macOS and Windows.
process.on("SIGHUP", stop);

function openBrowser(url: string): void {
  if (process.env.DRAFTEX_NO_BROWSER === "1") return;
  const { file, args: browserArgs } = browserCommand(process.platform, url);
  execFile(file, browserArgs, (e) => {
    if (e) console.log(`Open ${url} in your browser.`);
  });
}

/** The address to open, or null when there is nothing to open (server mode, bad settings). */
function appUrl(): { url: string | null; running: boolean } {
  try {
    const paths = dataPaths(getDataDir());
    return { url: localAppUrl(readConfig(paths.config)), running: appRunning(paths) };
  } catch {
    // server.ts reports data-folder and settings problems in plain English.
    return { url: null, running: false };
  }
}

async function answers(url: string): Promise<boolean> {
  try {
    const res = await fetch(new URL("login", url), { redirect: "manual" });
    return res.status < 500;
  } catch {
    return false;
  }
}

const target = open ? appUrl() : { url: null, running: false };
if (target.running) {
  console.log("DRAFTEX is already running.");
  if (target.url) openBrowser(target.url);
  process.exit(0);
}
run();
if (target.url) {
  const url = target.url;
  console.log(
    "DRAFTEX is starting. Keep this window open while you use it; closing it stops DRAFTEX.",
  );
  void waitUntil(() => answers(url), 180_000).then((up) => {
    if (up) {
      console.log(`DRAFTEX is ready at ${url}`);
      openBrowser(url);
    }
  });
}
