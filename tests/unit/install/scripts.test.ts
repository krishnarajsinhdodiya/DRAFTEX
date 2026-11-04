// The setup scripts pin the same Node as .nvmrc, with the official SHA-256
// of each archive, and keep the shapes that make them safe to update in place.
import fs from "node:fs";
import { describe, expect, it } from "vitest";

const read = (f: string) => fs.readFileSync(f, "utf8");
const version = read(".nvmrc").trim();
const OFFICIAL = {
  "win-x64.zip": "ca1bff5d8ead13c9f2ea404a176db46bd430704d5b5113734049fa365e7799e2",
  "win-arm64.zip": "f47968c213105077f64c6510f007632c0ca2574802a0b5067c327c49abe1c468",
  "darwin-arm64.tar.gz": "aa9549349e47dffaa42dcf95d6e06ade8c4bdafc980979883b88767670df385a",
  "darwin-x64.tar.gz": "d5e336d588c45be0c37dbd52cc29895593009ca4997a77a1fd02815131ed0e52",
};

describe("setup scripts", () => {
  it("pin Node from .nvmrc with the official checksums (nodejs.org SHASUMS256, 2026-11-04)", () => {
    expect(version).toBe("24.22.2");
    const ps = read("setup-windows.ps1");
    const sh = read("setup-macos.sh");
    expect(ps).toContain(`$NodeVersion = "${version}"`);
    expect(sh).toContain(`NODE_VERSION="${version}"`);
    expect(ps).toContain(`"x64" = "${OFFICIAL["win-x64.zip"]}"`);
    expect(ps).toContain(`"arm64" = "${OFFICIAL["win-arm64.zip"]}"`);
    expect(sh).toContain(`arm64) NODE_SHA256="${OFFICIAL["darwin-arm64.tar.gz"]}"`);
    expect(sh).toContain(`x86_64) NODE_SHA256="${OFFICIAL["darwin-x64.tar.gz"]}"`);
  });

  it("run the shared install step and never clean the folder", () => {
    for (const f of [
      "setup-windows.ps1",
      "setup-macos.sh",
      "update-windows.ps1",
      "update-macos.sh",
    ]) {
      const text = read(f);
      expect(text).not.toMatch(/git\s+(clean|reset|checkout)/);
      expect(text).not.toMatch(/DRAFTEX-data/);
    }
    expect(read("setup-windows.ps1")).toContain("scripts\\install.ts");
    expect(read("setup-macos.sh")).toContain("scripts/install.ts");
  });

  it("back up before pulling, and pull fast-forward only", () => {
    for (const f of ["update-windows.ps1", "update-macos.sh"]) {
      const text = read(f);
      const check = text.indexOf("update-check.ts");
      const backup = text.indexOf("before-update");
      const pull = text.search(/pull"?,? "?--ff-only/);
      expect(check).toBeGreaterThan(-1);
      expect(backup).toBeGreaterThan(check);
      expect(pull).toBeGreaterThan(backup);
    }
  });

  it("read the whole update script before git pull can change it", () => {
    // cmd.exe and sh read scripts as they run; a changed file mid-run runs garbage.
    const bat = read("update-windows.bat")
      .trim()
      .split(/\r?\n/)
      .filter((l) => !/^(@echo off|rem )/i.test(l));
    expect(bat).toHaveLength(1);
    expect(bat[0]).toMatch(/^\(.*exit \/b.*\)$/);
    expect(read("update-macos.sh")).toMatch(/\nmain "\$@"\nexit \$\?\n?$/);
  });

  it("have the encoding, line endings and modes their OS expects", () => {
    // Windows PowerShell 5.1 reads a .ps1 without a byte-order mark as ANSI.
    for (const f of [
      "setup-windows.bat",
      "update-windows.bat",
      "start-windows.bat",
      "setup-windows.ps1",
      "update-windows.ps1",
    ]) {
      expect(read(f)).toMatch(/^[\x20-\x7e\r\n\t]*$/);
    }
    const attributes = read(".gitattributes");
    for (const rule of [
      "*.ps1 text eol=crlf",
      "*.bat text eol=crlf",
      "*.sh text eol=lf",
      "*.command text eol=lf",
    ]) {
      expect(attributes).toContain(rule);
    }
    for (const f of ["setup-macos.sh", "update-macos.sh", "start-macos.command"]) {
      expect(read(f)).not.toContain("\r");
      expect(read(f).startsWith("#!/bin/bash\n")).toBe(true);
      if (process.platform !== "win32") expect(fs.statSync(f).mode & 0o111).not.toBe(0);
    }
  });
});
