// Resolves the runtime data folder (memory.md "Data dir outside repo").
// Order: DRAFTEX_DATA_DIR env → `dataDir` in <repo>/draftex.local.json → OS default.
// A configured folder that does not exist is an error; only the default is created.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export const POINTER_FILE = "draftex.local.json";
export const DEFAULT_FOLDER_NAME = "DRAFTEX-data";

export class DataDirError extends Error {
  override name = "DataDirError";
}

const pointerSchema = z.object({ dataDir: z.string().min(1) }).strict();

export type DataDirSource = "env" | "pointer" | "default";

export interface DataDirDeps {
  env: Record<string, string | undefined>;
  platform: NodeJS.Platform;
  homedir: string;
  repoRoot: string;
  isDirectory: (p: string) => boolean;
  exists: (p: string) => boolean;
  readFile: (p: string) => string;
  mkdir: (p: string) => void;
}

export interface ResolvedDataDir {
  dir: string;
  source: DataDirSource;
}

function pathApi(platform: NodeJS.Platform): path.PlatformPath {
  return platform === "win32" ? path.win32 : path.posix;
}

function requireExistingFolder(dir: string, where: string, deps: DataDirDeps): string {
  const p = pathApi(deps.platform);
  if (!p.isAbsolute(dir)) {
    throw new DataDirError(
      `The data folder set in ${where} must be a full path (for example ${
        deps.platform === "win32" ? "C:\\Users\\you\\DRAFTEX-data" : "/Users/you/DRAFTEX-data"
      }), but it is "${dir}".`,
    );
  }
  const normalised = p.resolve(dir);
  if (!deps.exists(normalised)) {
    throw new DataDirError(
      `DRAFTEX cannot find its data folder at "${normalised}" (set in ${where}). ` +
        "If it is on an external drive, connect the drive and start DRAFTEX again. " +
        "Nothing was created.",
    );
  }
  if (!deps.isDirectory(normalised)) {
    throw new DataDirError(
      `The data folder "${normalised}" (set in ${where}) is a file, not a folder.`,
    );
  }
  return normalised;
}

export function resolveDataDir(deps: DataDirDeps): ResolvedDataDir {
  const p = pathApi(deps.platform);

  const fromEnv = deps.env.DRAFTEX_DATA_DIR?.trim();
  if (fromEnv) {
    return {
      dir: requireExistingFolder(fromEnv, "the DRAFTEX_DATA_DIR setting", deps),
      source: "env",
    };
  }

  const pointerPath = p.join(deps.repoRoot, POINTER_FILE);
  if (deps.exists(pointerPath)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(deps.readFile(pointerPath));
    } catch {
      throw new DataDirError(
        `${POINTER_FILE} in the DRAFTEX folder is not valid JSON. It should look like {"dataDir": "<full path>"}.`,
      );
    }
    const result = pointerSchema.safeParse(parsed);
    if (!result.success) {
      throw new DataDirError(
        `${POINTER_FILE} in the DRAFTEX folder must contain only {"dataDir": "<full path>"}.`,
      );
    }
    return {
      dir: requireExistingFolder(result.data.dataDir.trim(), POINTER_FILE, deps),
      source: "pointer",
    };
  }

  const dir = p.join(deps.homedir, DEFAULT_FOLDER_NAME);
  if (!deps.exists(dir)) deps.mkdir(dir);
  else if (!deps.isDirectory(dir)) {
    throw new DataDirError(`"${dir}" is a file, so DRAFTEX cannot use it as its data folder.`);
  }
  return { dir, source: "default" };
}

/** Walks up from `start` to the folder whose package.json is named "draftex". */
export function findRepoRoot(
  start: string,
  readFile: (p: string) => string = (f) => fs.readFileSync(f, "utf8"),
): string {
  let dir = path.resolve(start);
  for (;;) {
    try {
      const pkg: unknown = JSON.parse(readFile(path.join(dir, "package.json")));
      if (z.object({ name: z.literal("draftex") }).safeParse(pkg).success) return dir;
    } catch {
      // no package.json here; keep walking up
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new DataDirError(`Cannot find the DRAFTEX app folder above "${start}".`);
    }
    dir = parent;
  }
}

/* v8 ignore start -- wiring of real OS calls; the logic above is unit-tested */
export function defaultDeps(): DataDirDeps {
  return {
    env: process.env,
    platform: process.platform,
    homedir: os.homedir(),
    repoRoot: findRepoRoot(path.dirname(fileURLToPath(import.meta.url))),
    exists: (p) => fs.existsSync(p),
    isDirectory: (p) => fs.statSync(p).isDirectory(),
    readFile: (p) => fs.readFileSync(p, "utf8"),
    mkdir: (p) => fs.mkdirSync(p, { recursive: true }),
  };
}

let cached: ResolvedDataDir | undefined;
export function getDataDir(): string {
  cached ??= resolveDataDir(defaultDeps());
  return cached.dir;
}
/* v8 ignore stop */

export interface DataPaths {
  root: string;
  database: string;
  assets: string;
  exports: string;
  backups: string;
  logs: string;
  config: string;
  tools: string;
  tectonicDir: string;
  tectonicCache: string;
}

export function dataPaths(root: string, platform: NodeJS.Platform = process.platform): DataPaths {
  const p = pathApi(platform);
  const tools = p.join(root, "tools");
  return {
    root,
    database: p.join(root, "data.db"),
    assets: p.join(root, "assets"),
    exports: p.join(root, "exports"),
    backups: p.join(root, "backups"),
    logs: p.join(root, "logs"),
    config: p.join(root, "config.json"),
    tools,
    tectonicDir: p.join(tools, "tectonic"),
    tectonicCache: p.join(tools, "tectonic-cache"),
  };
}
