// Opening the browser from the desktop shortcut (`npm start -- --open`).
// Imported by Node scripts under type stripping: relative imports only.
import type { AppConfig } from "../config.ts";

/** The address this computer's browser uses, or null in server mode (only the HTTPS proxy answers). */
export function localAppUrl(config: Pick<AppConfig, "mode" | "port">): string | null {
  if (config.mode === "server") return null;
  return `http://127.0.0.1:${config.port}/`;
}

/**
 * The program and arguments that open `url` in the default browser. No shell is
 * involved; `url` is always DRAFTEX's own loopback address.
 */
export function browserCommand(
  platform: NodeJS.Platform,
  url: string,
): { file: string; args: string[] } {
  if (platform === "win32")
    return { file: "rundll32.exe", args: ["url.dll,FileProtocolHandler", url] };
  if (platform === "darwin") return { file: "open", args: [url] };
  return { file: "xdg-open", args: [url] };
}

/** Polls `probe` until it answers true or `timeoutMs` passes. */
export async function waitUntil(
  probe: () => Promise<boolean>,
  timeoutMs: number,
  intervalMs = 500,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => number = Date.now,
): Promise<boolean> {
  const end = now() + timeoutMs;
  for (;;) {
    if (await probe()) return true;
    if (now() >= end) return false;
    await sleep(intervalMs);
  }
}

/**
 * Whether a copy of DRAFTEX is really running. A lock that names a live
 * process is not enough: after a crash or a forced stop the lock stays
 * behind, and Windows soon gives its process id to another program. So the
 * lock must be backed by an app that answers at its address; one that is
 * still starting gets `waitMs` to answer.
 */
export async function alreadyRunning(
  lockSaysRunning: boolean,
  url: string | null,
  answers: (url: string) => Promise<boolean>,
  waitMs = 10_000,
  wait: typeof waitUntil = waitUntil,
): Promise<boolean> {
  if (!lockSaysRunning) return false;
  if (!url) return true;
  return wait(() => answers(url), waitMs);
}
