import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DataDirError,
  dataPaths,
  findRepoRoot,
  resolveDataDir,
  type DataDirDeps,
} from "@/lib/paths";

interface FakeFs {
  dirs: Set<string>;
  files: Map<string, string>;
  created: string[];
}

function deps(
  over: Partial<DataDirDeps> & { fake?: Partial<FakeFs> } = {},
): DataDirDeps & { fake: FakeFs } {
  const fake: FakeFs = {
    dirs: over.fake?.dirs ?? new Set(),
    files: over.fake?.files ?? new Map(),
    created: [],
  };
  return {
    env: {},
    platform: "darwin",
    homedir: "/Users/t",
    repoRoot: "/repo",
    exists: (p) => fake.dirs.has(p) || fake.files.has(p),
    isDirectory: (p) => fake.dirs.has(p),
    readFile: (p) => {
      const v = fake.files.get(p);
      if (v === undefined) throw new Error("ENOENT");
      return v;
    },
    mkdir: (p) => {
      fake.created.push(p);
      fake.dirs.add(p);
    },
    ...over,
    fake,
  };
}

describe("resolveDataDir", () => {
  it("uses DRAFTEX_DATA_DIR first, even when a pointer file exists", () => {
    const d = deps({
      env: { DRAFTEX_DATA_DIR: "/env/data" },
      fake: {
        dirs: new Set(["/env/data"]),
        files: new Map([["/repo/draftex.local.json", '{"dataDir":"/p"}']]),
      },
    });
    expect(resolveDataDir(d)).toEqual({ dir: "/env/data", source: "env" });
  });

  it("ignores a blank DRAFTEX_DATA_DIR", () => {
    const d = deps({ env: { DRAFTEX_DATA_DIR: "   " } });
    expect(resolveDataDir(d).source).toBe("default");
  });

  it("rejects a relative env path", () => {
    const d = deps({ env: { DRAFTEX_DATA_DIR: "data" } });
    expect(() => resolveDataDir(d)).toThrow(/must be a full path/);
  });

  it("refuses a configured env folder that does not exist and creates nothing", () => {
    const d = deps({ env: { DRAFTEX_DATA_DIR: "/Volumes/DRAFTEX/DRAFTEX-data" } });
    expect(() => resolveDataDir(d)).toThrow(DataDirError);
    expect(() => resolveDataDir(d)).toThrow(/connect the drive/);
    expect(d.fake.created).toEqual([]);
  });

  it("refuses a configured path that is a file", () => {
    const d = deps({
      env: { DRAFTEX_DATA_DIR: "/x" },
      fake: { files: new Map([["/x", ""]]) },
    });
    expect(() => resolveDataDir(d)).toThrow(/is a file/);
  });

  it("reads the pointer file next", () => {
    const d = deps({
      fake: {
        dirs: new Set(["/Volumes/DRAFTEX/DRAFTEX-data"]),
        files: new Map([
          ["/repo/draftex.local.json", '{ "dataDir": "/Volumes/DRAFTEX/DRAFTEX-data/" }'],
        ]),
      },
    });
    expect(resolveDataDir(d)).toEqual({
      dir: "/Volumes/DRAFTEX/DRAFTEX-data",
      source: "pointer",
    });
  });

  it("refuses a pointer to a missing folder and does not fall back to the default", () => {
    const d = deps({
      fake: { files: new Map([["/repo/draftex.local.json", '{"dataDir":"/gone"}']]) },
    });
    expect(() => resolveDataDir(d)).toThrow(/draftex\.local\.json/);
    expect(d.fake.created).toEqual([]);
  });

  it.each([
    ["not json", /not valid JSON/],
    ['{"dataDir": ""}', /must contain only/],
    ['{"dataDir": "/a", "extra": 1}', /must contain only/],
    ["[]", /must contain only/],
  ])("rejects a malformed pointer file %s", (text, msg) => {
    const d = deps({ fake: { files: new Map([["/repo/draftex.local.json", text]]) } });
    expect(() => resolveDataDir(d)).toThrow(msg);
  });

  it("creates the default folder only when nothing is configured", () => {
    const d = deps();
    expect(resolveDataDir(d)).toEqual({ dir: "/Users/t/DRAFTEX-data", source: "default" });
    expect(d.fake.created).toEqual(["/Users/t/DRAFTEX-data"]);
  });

  it("reuses an existing default folder", () => {
    const d = deps({ fake: { dirs: new Set(["/Users/t/DRAFTEX-data"]) } });
    expect(resolveDataDir(d).dir).toBe("/Users/t/DRAFTEX-data");
    expect(d.fake.created).toEqual([]);
  });

  it("refuses a default path that is a file", () => {
    const d = deps({ fake: { files: new Map([["/Users/t/DRAFTEX-data", ""]]) } });
    expect(() => resolveDataDir(d)).toThrow(/is a file/);
  });

  describe("on Windows", () => {
    const win = { platform: "win32" as const, homedir: "C:\\Users\\t", repoRoot: "C:\\app" };

    it("uses %USERPROFILE%\\DRAFTEX-data by default", () => {
      const d = deps(win);
      expect(resolveDataDir(d).dir).toBe("C:\\Users\\t\\DRAFTEX-data");
    });

    it("accepts drive-letter paths from the pointer file and normalises slashes", () => {
      const d = deps({
        ...win,
        fake: {
          dirs: new Set(["D:\\Papers\\data"]),
          files: new Map([["C:\\app\\draftex.local.json", '{"dataDir":"D:/Papers/data"}']]),
        },
      });
      expect(resolveDataDir(d)).toEqual({ dir: "D:\\Papers\\data", source: "pointer" });
    });

    it("rejects a POSIX-style relative path", () => {
      const d = deps({ ...win, env: { DRAFTEX_DATA_DIR: "Papers\\data" } });
      expect(() => resolveDataDir(d)).toThrow(/C:\\Users\\you/);
    });
  });
});

describe("findRepoRoot", () => {
  it("finds this repository from a nested folder", () => {
    const root = findRepoRoot(path.dirname(fileURLToPath(import.meta.url)));
    expect(fs.existsSync(path.join(root, "package.json"))).toBe(true);
  });

  it("skips package.json files of other packages", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dx-root-"));
    try {
      const nested = path.join(tmp, "a", "b");
      fs.mkdirSync(nested, { recursive: true });
      fs.writeFileSync(path.join(tmp, "package.json"), '{"name":"draftex"}');
      fs.writeFileSync(path.join(tmp, "a", "package.json"), '{"name":"other"}');
      expect(findRepoRoot(nested)).toBe(path.resolve(tmp));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("throws when no DRAFTEX package is found", () => {
    expect(() => findRepoRoot("/", () => "{}")).toThrow(DataDirError);
  });
});

describe("dataPaths", () => {
  it("lays out the data folder", () => {
    const p = dataPaths("/d", "darwin");
    expect(p.database).toBe("/d/data.db");
    expect(p.tectonicCache).toBe("/d/tools/tectonic-cache");
  });

  it("uses backslashes on Windows", () => {
    expect(dataPaths("C:\\d", "win32").tectonicDir).toBe("C:\\d\\tools\\tectonic");
  });
});
