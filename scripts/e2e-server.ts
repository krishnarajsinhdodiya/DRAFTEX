// Starts the built app on a fresh, throwaway data folder for end-to-end tests.
// Never touches the real data folder.
// Usage: node scripts/e2e-server.ts [port] [local|lan] [start|dev]
// (lan shows a throwaway demo to other devices on the network; "dev" runs
// Next's development server with live reload for UI work). The server runs
// under the same supervisor as `npm start`, so "Restart DRAFTEX" works.
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { dataPaths, peekDataDir } from "../src/lib/paths.ts";

const port = process.argv[2] ?? "3211";
// "0.0.0.0" is the older spelling of lan.
const network = process.argv[3] === "lan" || process.argv[3] === "0.0.0.0" ? "lan" : "local";
const mode = process.argv[4] === "dev" ? "dev" : "start";
// The installed LaTeX engine is shared (linked), so previews compile; nothing else is.
const realTools = dataPaths(peekDataDir()).tools;
const dataDir = path.join(os.tmpdir(), `draftex-e2e-${port}`);
/** Removes the throwaway folder; the tools link is unlinked first so the real tools are never touched. */
function clean(): void {
  const link = path.join(dataDir, "tools");
  if (fs.lstatSync(link, { throwIfNoEntry: false })?.isSymbolicLink()) fs.unlinkSync(link);
  fs.rmSync(dataDir, { recursive: true, force: true });
}
clean();
fs.mkdirSync(dataDir, { recursive: true });
if (fs.existsSync(realTools)) {
  fs.symlinkSync(realTools, path.join(dataDir, "tools"), "junction");
}
const env = {
  ...process.env,
  DRAFTEX_DATA_DIR: dataDir,
  CHECKPOINT_DISABLE: "1",
  NEXT_TELEMETRY_DISABLED: "1",
};

const require = createRequire(import.meta.url);
execFileSync(process.execPath, [require.resolve("prisma/build/index.js"), "migrate", "deploy"], {
  stdio: "inherit",
  env,
});

fs.writeFileSync(
  dataPaths(dataDir).config,
  JSON.stringify({ mode: network, port: Number(port) }, null, 2),
);
const start = path.join(path.dirname(require.resolve("../package.json")), "scripts", "start.ts");
const child = spawn(process.execPath, [start, ...(mode === "dev" ? ["--dev"] : [])], {
  stdio: "inherit",
  env,
});
const stop = () => child.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => {
  clean();
  process.exit(code ?? 0);
});
