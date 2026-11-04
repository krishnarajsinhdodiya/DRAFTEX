// "Move data folder" (D45): copies the whole data folder to a new place,
// checks every file arrived unchanged, then points draftex.local.json at the
// copy. DRAFTEX must be stopped. The old folder is left for the user to
// delete once they have seen the app working from the new one.
// Imported by Node scripts under type stripping: relative imports only.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { appRunning } from "../lock.ts";
import { POINTER_FILE, dataPaths } from "../paths.ts";

export class MoveError extends Error {
  override name = "MoveError";
}

export interface MoveRequest {
  from: string;
  to: string;
  repoRoot: string;
  env: Record<string, string | undefined>;
}

export interface MoveResult {
  to: string;
  files: number;
  bytes: number;
}

const isInside = (child: string, parent: string): boolean => {
  const rel = path.relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
};

/** Every file under `dir`, as paths relative to it, sorted. */
export function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const child = path.join(rel, entry.name);
      if (entry.isDirectory()) walk(child);
      else out.push(child);
    }
  };
  walk("");
  return out.sort();
}

function sha256(file: string): string {
  const hash = createHash("sha256");
  const fd = fs.openSync(file, "r");
  try {
    const buf = Buffer.alloc(1 << 20);
    let n: number;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) hash.update(buf.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

/** Checks the request without changing anything; returns the resolved target. */
export function checkMove(req: MoveRequest): string {
  if (req.env.DRAFTEX_DATA_DIR?.trim()) {
    throw new MoveError(
      "The data folder is set by DRAFTEX_DATA_DIR on this computer. Change that setting instead.",
    );
  }
  if (!path.isAbsolute(req.to)) {
    throw new MoveError(`Give the new folder as a full path; "${req.to}" is not one.`);
  }
  const from = path.resolve(req.from);
  const to = path.resolve(req.to);
  if (to === from) throw new MoveError("The new folder is the folder DRAFTEX already uses.");
  if (isInside(to, from)) throw new MoveError("The new folder cannot be inside the current one.");
  if (isInside(from, to)) throw new MoveError("The new folder cannot contain the current one.");
  if (appRunning(dataPaths(from))) {
    throw new MoveError("DRAFTEX is running. Close its window first, then move the folder.");
  }
  const stat = fs.statSync(to, { throwIfNoEntry: false });
  if (stat) {
    if (!stat.isDirectory()) throw new MoveError(`"${to}" is a file, not a folder.`);
    if (fs.readdirSync(to).length > 0) {
      throw new MoveError(`"${to}" is not empty. Choose a new or empty folder.`);
    }
  } else if (!fs.existsSync(path.dirname(to))) {
    throw new MoveError(`The folder "${path.dirname(to)}" does not exist.`);
  }
  return to;
}

export function moveDataFolder(
  req: MoveRequest,
  log: (msg: string) => void = () => {},
): MoveResult {
  const to = checkMove(req);
  const from = path.resolve(req.from);
  const created = !fs.existsSync(to);
  const files = listFiles(from);
  let bytes = 0;
  try {
    log(`Copying ${files.length} files…`);
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from)) {
      fs.cpSync(path.join(from, entry), path.join(to, entry), {
        recursive: true,
        errorOnExist: true,
        force: false,
      });
    }
    log("Checking the copy…");
    const copied = listFiles(to);
    if (copied.join("\n") !== files.join("\n")) {
      throw new MoveError("The copy does not hold the same files as the original.");
    }
    for (const rel of files) {
      if (sha256(path.join(from, rel)) !== sha256(path.join(to, rel))) {
        throw new MoveError(`"${rel}" changed while it was copied.`);
      }
      bytes += fs.statSync(path.join(to, rel)).size;
    }
  } catch (e) {
    // Only what this move made is removed; the original is never touched.
    if (created) fs.rmSync(to, { recursive: true, force: true });
    else
      for (const entry of fs.readdirSync(to))
        fs.rmSync(path.join(to, entry), { recursive: true, force: true });
    if (e instanceof MoveError) throw e;
    throw new MoveError(`The copy failed (${(e as Error).message}). Nothing was changed.`);
  }
  const pointer = path.join(req.repoRoot, POINTER_FILE);
  const tmp = `${pointer}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify({ dataDir: to }, null, 2)}\n`);
  fs.renameSync(tmp, pointer);
  return { to, files: files.length, bytes };
}
