// Moving the data folder (D45) between throwaway folders.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MoveError, checkMove, listFiles, moveDataFolder } from "@/lib/install/move";
import { LOCK_FILE } from "@/lib/lock";
import { POINTER_FILE } from "@/lib/paths";

let tmp: string;
let from: string;
let repo: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "draftex-move-"));
  from = path.join(tmp, "old");
  repo = path.join(tmp, "repo");
  fs.mkdirSync(path.join(from, "assets"), { recursive: true });
  fs.mkdirSync(path.join(from, "backups"), { recursive: true });
  fs.mkdirSync(repo);
  fs.writeFileSync(path.join(from, "data.db"), "db");
  fs.writeFileSync(path.join(from, "assets", `${"a".repeat(64)}.png`), Buffer.alloc(3_000_000, 7));
  fs.writeFileSync(path.join(from, "config.json"), "{}");
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const req = (to: string, env: Record<string, string> = {}) => ({ from, to, repoRoot: repo, env });

describe("checkMove", () => {
  it("refuses bad targets with plain messages and changes nothing", () => {
    const refuse = (to: string, text: string, env?: Record<string, string>) =>
      expect(() => checkMove(req(to, env))).toThrow(new RegExp(text));
    refuse(path.join(tmp, "new"), "DRAFTEX_DATA_DIR", { DRAFTEX_DATA_DIR: from });
    refuse("relative/folder", "full path");
    refuse(from, "already uses");
    refuse(path.join(from, "inner"), "inside the current");
    refuse(tmp, "contain the current");
    fs.writeFileSync(path.join(tmp, "file"), "x");
    refuse(path.join(tmp, "file"), "is a file");
    fs.mkdirSync(path.join(tmp, "full"));
    fs.writeFileSync(path.join(tmp, "full", "x"), "x");
    refuse(path.join(tmp, "full"), "not empty");
    refuse(path.join(tmp, "missing", "new"), "does not exist");
    fs.writeFileSync(path.join(from, LOCK_FILE), String(process.ppid));
    if (process.platform !== "win32") refuse(path.join(tmp, "new"), "running");
    expect(fs.existsSync(path.join(repo, POINTER_FILE))).toBe(false);
  });

  it("accepts a new folder or an empty one", () => {
    expect(checkMove(req(path.join(tmp, "new")))).toBe(path.join(tmp, "new"));
    fs.mkdirSync(path.join(tmp, "empty"));
    expect(checkMove(req(path.join(tmp, "empty")))).toBe(path.join(tmp, "empty"));
  });
});

describe("moveDataFolder", () => {
  it("copies every file, checks it and points DRAFTEX at the copy", () => {
    const to = path.join(tmp, "new");
    const log: string[] = [];
    const r = moveDataFolder(req(to), (m) => log.push(m));
    expect(r.files).toBe(3);
    expect(r.bytes).toBe(3_000_000 + 4);
    expect(listFiles(to)).toEqual(listFiles(from));
    expect(fs.readFileSync(path.join(to, "data.db"), "utf8")).toBe("db");
    expect(JSON.parse(fs.readFileSync(path.join(repo, POINTER_FILE), "utf8"))).toEqual({
      dataDir: to,
    });
    expect(fs.existsSync(path.join(from, "data.db"))).toBe(true);
    expect(log).toEqual(["Copying 3 files…", "Checking the copy…"]);
    expect(fs.readdirSync(repo)).toEqual([POINTER_FILE]);
  });

  it("removes a failed copy it created and keeps the original", () => {
    const to = path.join(tmp, "new");
    vi.spyOn(fs, "cpSync").mockImplementation(() => {
      fs.writeFileSync(path.join(to, "data.db"), "half");
      throw new Error("disk full");
    });
    expect(() => moveDataFolder(req(to))).toThrow(/disk full.*Nothing was changed/);
    expect(fs.existsSync(to)).toBe(false);
    expect(fs.existsSync(path.join(repo, POINTER_FILE))).toBe(false);
    expect(fs.readFileSync(path.join(from, "data.db"), "utf8")).toBe("db");
  });

  it("empties but keeps a folder the user made when the check fails", () => {
    const to = path.join(tmp, "empty");
    fs.mkdirSync(to);
    const real = fs.cpSync.bind(fs);
    vi.spyOn(fs, "cpSync").mockImplementation((src, dst, opts) => {
      real(src, dst, opts);
      if (String(dst).endsWith("data.db")) fs.writeFileSync(dst, "xx");
    });
    expect(() => moveDataFolder(req(to))).toThrow(MoveError);
    expect(() => moveDataFolder(req(to))).toThrow(/changed while it was copied/);
    expect(fs.readdirSync(to)).toEqual([]);
  });

  it("notices a file list that differs", () => {
    const to = path.join(tmp, "new");
    const real = fs.cpSync.bind(fs);
    vi.spyOn(fs, "cpSync").mockImplementation((src, dst, opts) => {
      if (!String(dst).endsWith("config.json")) real(src, dst, opts);
    });
    expect(() => moveDataFolder(req(to))).toThrow(/same files/);
    expect(fs.existsSync(to)).toBe(false);
  });
});
