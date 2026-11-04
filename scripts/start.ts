// `npm start` / `npm run dev`: runs server.ts and starts it again when it
// exits with the restart code, so "Restart DRAFTEX" (network mode changes,
// staged restores) needs no terminal (D37). Any other exit ends this script too.
// Usage: node scripts/start.ts [--dev]
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ENV, RESTART_EXIT_CODE } from "../src/lib/net/runtime.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = [path.join(root, "server.ts"), ...process.argv.slice(2)];

let child: ReturnType<typeof spawn> | null = null;
let stopping = false;

function run(): void {
  child = spawn(process.execPath, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, [ENV.supervised]: "1" },
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

run();
