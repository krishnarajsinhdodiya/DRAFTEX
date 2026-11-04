import { strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  backupFileName,
  buildBackup,
  checkBackup,
  parseBackupName,
  prunable,
  sha256,
  unzipCapped,
} from "@/lib/backup/archive";

const MIGRATIONS = ["20261103054957_init", "20261103120000_catalogue"];
const SHA = "a".repeat(64);

function backup(over: Partial<Parameters<typeof buildBackup>[0]> = {}) {
  return buildBackup({
    db: strToU8("SQLite format 3"),
    config: strToU8('{"mode":"local"}'),
    assets: { [`${SHA}.png`]: strToU8("png") },
    appVersion: "0.6.0",
    createdAt: new Date("2026-11-04T10:00:00Z"),
    kind: "manual",
    migrations: MIGRATIONS,
    ...over,
  });
}

describe("backup names", () => {
  it("sort by time and carry their kind", () => {
    const at = new Date(2026, 10, 4, 9, 5, 7);
    expect(backupFileName(at, "auto")).toBe("DRAFTEX-backup-2026-11-04_090507-auto.zip");
    expect(backupFileName(at, "manual", 2)).toBe("DRAFTEX-backup-2026-11-04_090507-manual-2.zip");
    expect(parseBackupName(backupFileName(at, "before-restore"))).toEqual({
      at,
      kind: "before-restore",
    });
    expect(parseBackupName("DRAFTEX-backup-2026-11-04_090507-manual-2.zip")?.kind).toBe("manual");
    expect(parseBackupName("notes.zip")).toBeNull();
    expect(parseBackupName("DRAFTEX-backup-2026-11-04_090507-other.zip")).toBeNull();
  });

  it("prune only automatic backups beyond the newest 14", () => {
    const autos = Array.from({ length: 16 }, (_, i) =>
      backupFileName(new Date(2026, 10, i + 1), "auto"),
    );
    const manual = backupFileName(new Date(2026, 0, 1), "manual");
    const gone = prunable([...autos, manual]);
    expect(gone).toEqual([autos[1], autos[0]]);
    expect(prunable(autos, 20)).toEqual([]);
  });
});

describe("checkBackup", () => {
  it("accepts what buildBackup makes", () => {
    const r = checkBackup(backup(), MIGRATIONS);
    if (!r.ok) throw new Error(r.message);
    expect(r.manifest).toMatchObject({ format: 1, kind: "manual", appVersion: "0.6.0" });
    expect(Object.keys(r.files).sort()).toEqual(
      ["assets/" + SHA + ".png", "config.json", "data.db", "manifest.json"].sort(),
    );
    expect(checkBackup(backup({ config: null, assets: {} }), MIGRATIONS).ok).toBe(true);
  });

  it("refuses a backup from a newer DRAFTEX", () => {
    const r = checkBackup(
      backup({ migrations: [...MIGRATIONS, "20270101000000_future"] }),
      MIGRATIONS,
    );
    expect(r).toEqual({
      ok: false,
      message:
        "This backup was made by a newer DRAFTEX (0.6.0). Update DRAFTEX first, then restore it.",
    });
  });

  it.each([
    ["a path outside the folder", { "../evil.txt": strToU8("x") }],
    ["an absolute path", { "/etc/passwd": strToU8("x") }],
    ["an unknown file", { "notes.txt": strToU8("x") }],
    ["a picture with a bad name", { "assets/x.png": strToU8("x") }],
  ])("refuses %s before unpacking anything", (_l, extra) => {
    const r = checkBackup(zipSync({ "data.db": strToU8("db"), ...extra }), MIGRATIONS);
    expect(r).toEqual({ ok: false, message: "This file is not a DRAFTEX backup." });
  });

  it("refuses damaged, incomplete and foreign zips", () => {
    expect(checkBackup(strToU8("not a zip"), MIGRATIONS)).toMatchObject({
      ok: false,
      message: "The backup file is damaged and cannot be opened.",
    });
    expect(checkBackup(zipSync({ "data.db": strToU8("db") }), MIGRATIONS)).toMatchObject({
      message: "This file is not a DRAFTEX backup.",
    });
    expect(
      checkBackup(zipSync({ "data.db": strToU8("db"), "manifest.json": strToU8("{") }), MIGRATIONS),
    ).toMatchObject({ message: "This file is not a DRAFTEX backup." });

    const good = checkBackup(backup(), MIGRATIONS);
    if (!good.ok) throw new Error("setup");
    const manifest = JSON.parse(new TextDecoder().decode(good.files["manifest.json"]));
    const rezip = (files: Record<string, Uint8Array>, m = manifest) =>
      zipSync({ ...files, "manifest.json": strToU8(JSON.stringify(m)) });
    const { "manifest.json": _m, ...rest } = good.files;
    expect(_m).toBeDefined();

    const missing = { ...rest };
    delete missing["config.json"];
    expect(checkBackup(rezip(missing), MIGRATIONS)).toMatchObject({
      message: "The backup is incomplete: some files are missing or extra.",
    });
    expect(
      checkBackup(rezip({ ...rest, "data.db": strToU8("tampered") }), MIGRATIONS),
    ).toMatchObject({
      message: "The backup is damaged: a file does not match its checksum.",
    });
    const db = rest["data.db"] as Uint8Array;
    expect(sha256(db)).toBe(manifest.files["data.db"].sha256);
  });
});

describe("unzipCapped", () => {
  const big = new Uint8Array(200_000); // zeros: a few hundred bytes once compressed
  const zip = zipSync({ "a.bin": big, "b.txt": strToU8("hello") }, { level: 9 });

  it("unpacks what unzipSync unpacks", () => {
    expect(unzipCapped(zip, () => 1e9, 1e9)).toEqual(unzipSync(zip));
  });

  it("stops at the real inflated size, whatever the zip declares", () => {
    expect(zip.length).toBeLessThan(5_000);
    expect(() => unzipCapped(zip, (n) => (n === "a.bin" ? 100_000 : 1e9), 1e9)).toThrow();
    expect(() => unzipCapped(zip, () => 1e9, 150_000)).toThrow();
    expect(Object.keys(unzipCapped(zip, () => 200_000, 200_005))).toEqual(["a.bin", "b.txt"]);
  });

  it("makes checkBackup refuse a zip whose entries differ from its directory", () => {
    const good = backup();
    // Rename data.db in the local header only; the central directory still says data.db.
    const bytes = new Uint8Array(good);
    const name = new TextEncoder().encode("data.db");
    for (let i = 0; i + 30 + name.length < bytes.length; i++) {
      const isLocal =
        bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 3 && bytes[i + 3] === 4;
      if (isLocal && name.every((c, j) => bytes[i + 30 + j] === c)) {
        bytes[i + 30 + 6] = "c".charCodeAt(0);
        break;
      }
    }
    expect(checkBackup(bytes, MIGRATIONS)).toEqual({
      ok: false,
      message: "This file is not a DRAFTEX backup.",
    });
  });
});
