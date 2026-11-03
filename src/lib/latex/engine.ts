// Runs one Tectonic process. Never a shell: execFile with an argument array.
import { execFile } from "node:child_process";
import { BUNDLE_URL } from "./pins.ts";

export interface EngineRequest {
  workDir: string;
  texFile: string;
  /** true = never touch the network (normal runtime after warm-up). */
  onlyCached: boolean;
  timeoutMs: number;
}

export interface EngineResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  /** Set when the process could not start at all (e.g. ENOENT). */
  spawnError?: string;
}

export type Engine = (req: EngineRequest) => Promise<EngineResult>;

export function tectonicArgs(req: EngineRequest, bundleUrl: string = BUNDLE_URL): string[] {
  return [
    "--untrusted",
    "--keep-logs",
    "--chatter",
    "default",
    "--bundle",
    bundleUrl,
    ...(req.onlyCached ? ["--only-cached"] : []),
    req.texFile,
  ];
}

// Windows needs SystemRoot for networking and APPDATA/LOCALAPPDATA for Tectonic's own config.
const PASS_ENV = [
  "PATH",
  "HOME",
  "USERPROFILE",
  "SystemRoot",
  "APPDATA",
  "LOCALAPPDATA",
  "TEMP",
  "TMP",
  "TMPDIR",
  "LANG",
];

/** Minimal environment: nothing from the app's own secrets reaches the engine. */
export function engineEnv(
  cacheDir: string,
  from: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const env: Record<string, string> = { TECTONIC_CACHE_DIR: cacheDir };
  for (const key of PASS_ENV) {
    const v = from[key];
    if (v !== undefined) env[key] = v;
  }
  return env;
}

export function tectonicEngine(opts: {
  binary: string;
  cacheDir: string;
  bundleUrl?: string;
  /** Test hook: arguments placed before Tectonic's own (e.g. a script for node). */
  prefixArgs?: string[];
}): Engine {
  return (req) =>
    new Promise((resolve) => {
      execFile(
        opts.binary,
        [...(opts.prefixArgs ?? []), ...tectonicArgs(req, opts.bundleUrl)],
        {
          cwd: req.workDir,
          // Next augments ProcessEnv with NODE_ENV; the engine deliberately gets a minimal env.
          env: engineEnv(opts.cacheDir) as NodeJS.ProcessEnv,
          timeout: req.timeoutMs,
          killSignal: "SIGKILL",
          maxBuffer: 16 * 1024 * 1024,
          windowsHide: true,
          encoding: "utf8",
        },
        (err, stdout, stderr) => {
          if (!err) {
            resolve({ exitCode: 0, stdout, stderr, timedOut: false });
            return;
          }
          const code: unknown = err.code;
          resolve({
            exitCode: typeof code === "number" ? code : null,
            stdout,
            stderr,
            timedOut: err.killed === true && err.signal === "SIGKILL",
            ...(typeof code === "string" ? { spawnError: `${code}: ${err.message}` } : {}),
          });
        },
      );
    });
}
