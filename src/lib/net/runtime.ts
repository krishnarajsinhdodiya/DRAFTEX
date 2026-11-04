// What the running server was started with (D36, D37). The custom server
// sets these before Next.js loads; app code reads them instead of
// config.json, which may already hold settings for the next start.
// Imported by server.ts under Node type stripping: relative imports only.
import type { NetworkMode } from "../config.ts";

/** Exit code that asks the supervisor (`npm start`) to start the server again. */
export const RESTART_EXIT_CODE = 75;

export const ENV = {
  mode: "DRAFTEX_RUNNING_MODE",
  port: "DRAFTEX_RUNNING_PORT",
  supervised: "DRAFTEX_SUPERVISED",
} as const;

export interface Running {
  mode: NetworkMode;
  port: number;
  /** True when a supervisor will start the server again after a restart exit. */
  supervised: boolean;
}

/** The running settings, or null outside the custom server (tests, scripts). */
export function runningFrom(env: Record<string, string | undefined>): Running | null {
  const mode = env[ENV.mode];
  const port = Number(env[ENV.port]);
  if ((mode !== "local" && mode !== "lan" && mode !== "server") || !Number.isInteger(port)) {
    return null;
  }
  return { mode, port, supervised: env[ENV.supervised] === "1" };
}
