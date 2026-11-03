// Starts the built app on a fresh, throwaway data folder for end-to-end tests.
// Never touches the real data folder. Usage: node scripts/e2e-server.ts [port]
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

const port = process.argv[2] ?? "3211";
const dataDir = path.join(os.tmpdir(), `draftex-e2e-${port}`);
fs.rmSync(dataDir, { recursive: true, force: true });
fs.mkdirSync(dataDir, { recursive: true });
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

const nextBin = require.resolve("next/dist/bin/next");
const child = spawn(
  process.execPath,
  [nextBin, "start", "--hostname", "127.0.0.1", "--port", port],
  {
    stdio: "inherit",
    env,
  },
);
const stop = () => child.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  process.exit(code ?? 0);
});
