import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BUNDLE_DIGEST, BUNDLE_URL, TECTONIC_VERSION } from "@/lib/latex/pins";
import {
  TectonicSetupError,
  assertRemoteBundlePinned,
  assetFor,
  binaryPath,
  bundleCacheState,
  decodeCacheName,
  download,
  installTectonic,
  isInstalled,
  remoteBundleDigest,
  tarCommand,
  type FetchFn,
} from "@/lib/latex/tectonic";

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dx-tect-"));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function fakeArchive(binary: string): { file: string; bytes: Buffer; sha256: string } {
  const src = path.join(tmp, "src");
  fs.mkdirSync(src, { recursive: true });
  fs.writeFileSync(path.join(src, binary), "#!/bin/sh\necho fake\n");
  const file = path.join(tmp, "fake.tar.gz");
  execFileSync(tarCommand(), ["-czf", file, "-C", src, binary]);
  const bytes = fs.readFileSync(file);
  return { file, bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}

const serve =
  (routes: Record<string, () => Response>): FetchFn =>
  async (url) => {
    const r = routes[url];
    return r ? r() : new Response("nope", { status: 404 });
  };

describe("assetFor / binaryPath", () => {
  it("knows the four pinned targets", () => {
    expect(assetFor("darwin", "arm64").file).toContain("aarch64-apple-darwin");
    expect(assetFor("darwin", "x64").file).toContain("x86_64-apple-darwin");
    expect(assetFor("linux", "x64").file).toContain("linux-gnu");
    expect(assetFor("win32", "x64").binary).toBe("tectonic.exe");
  });

  it("refuses an unpinned platform", () => {
    expect(() => assetFor("linux", "arm64")).toThrow(TectonicSetupError);
  });

  it("builds the binary path", () => {
    expect(binaryPath("/t", "linux", "x64")).toBe(path.join("/t", "tectonic"));
    expect(binaryPath("/t")).toContain("tectonic");
  });
});

describe("tarCommand", () => {
  it("uses the Windows built-in tar.exe", () => {
    expect(tarCommand("win32", { SystemRoot: "D:\\Win" })).toBe("D:\\Win\\System32\\tar.exe");
    expect(tarCommand("win32", {})).toBe("C:\\Windows\\System32\\tar.exe");
    expect(tarCommand("linux", {})).toBe("tar");
  });
});

describe("download", () => {
  it("streams to disk and hashes", async () => {
    const dest = path.join(tmp, "out.bin");
    const fetchFn = serve({ "u://x": () => new Response("hello") });
    const sha = await download(fetchFn, "u://x", dest);
    expect(fs.readFileSync(dest, "utf8")).toBe("hello");
    expect(sha).toBe(createHash("sha256").update("hello").digest("hex"));
  });

  it("handles back-pressure on large bodies", async () => {
    const big = Buffer.alloc(8 * 1024 * 1024, 7);
    const dest = path.join(tmp, "big.bin");
    const sha = await download(
      serve({ "u://big": () => new Response(new Uint8Array(big)) }),
      "u://big",
      dest,
    );
    expect(fs.statSync(dest).size).toBe(big.length);
    expect(sha).toBe(createHash("sha256").update(big).digest("hex"));
  });

  it("fails on an empty body", async () => {
    const fetchFn = serve({ "u://e": () => new Response(null, { status: 200 }) });
    await expect(download(fetchFn, "u://e", path.join(tmp, "o"))).rejects.toThrow(/200/);
  });

  it("fails on HTTP errors", async () => {
    await expect(download(serve({}), "u://missing", path.join(tmp, "o"))).rejects.toThrow(
      /Download failed \(404\)/,
    );
  });
});

describe("installTectonic", () => {
  it("installs a verified archive, writes a marker, and is idempotent", async () => {
    const a = fakeArchive("tectonic");
    const asset = { file: "fake.tar.gz", sha256: a.sha256, binary: "tectonic" };
    const dir = path.join(tmp, "tools", "tectonic");
    let calls = 0;
    const fetchFn = serve({
      "base://r/fake.tar.gz": () => {
        calls++;
        return new Response(new Uint8Array(a.bytes));
      },
    });
    const logs: string[] = [];
    const bin = await installTectonic({
      tectonicDir: dir,
      fetchFn,
      asset,
      baseUrl: "base://r",
      log: (m) => logs.push(m),
    });
    expect(bin).toBe(path.join(dir, "tectonic"));
    expect(fs.readFileSync(bin, "utf8")).toContain("echo fake");
    expect(isInstalled(dir, asset)).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(dir, "installed.json"), "utf8"))).toEqual({
      version: TECTONIC_VERSION,
      sha256: a.sha256,
    });

    await installTectonic({ tectonicDir: dir, fetchFn, asset, baseUrl: "base://r" });
    expect(calls).toBe(1);
    expect(logs.join("\n")).toMatch(/installed at/);
  });

  it("refuses a checksum mismatch and installs nothing", async () => {
    const a = fakeArchive("tectonic");
    const asset = { file: "fake.tar.gz", sha256: "0".repeat(64), binary: "tectonic" };
    const dir = path.join(tmp, "t");
    await expect(
      installTectonic({
        tectonicDir: dir,
        asset,
        baseUrl: "base://r",
        fetchFn: serve({ "base://r/fake.tar.gz": () => new Response(new Uint8Array(a.bytes)) }),
      }),
    ).rejects.toThrow(/does not match the pinned checksum/);
    expect(fs.existsSync(dir)).toBe(false);
  });

  it("refuses an archive without the binary", async () => {
    const a = fakeArchive("other");
    const asset = { file: "fake.tar.gz", sha256: a.sha256, binary: "tectonic" };
    await expect(
      installTectonic({
        tectonicDir: path.join(tmp, "t"),
        asset,
        baseUrl: "base://r",
        fetchFn: serve({ "base://r/fake.tar.gz": () => new Response(new Uint8Array(a.bytes)) }),
      }),
    ).rejects.toThrow(/does not contain tectonic/);
  });

  it("treats a marker for another version as not installed", () => {
    const dir = path.join(tmp, "t");
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "tectonic"), "");
    const asset = { file: "f", sha256: "abc", binary: "tectonic" };
    fs.writeFileSync(
      path.join(dir, "installed.json"),
      JSON.stringify({ version: "0.1.0", sha256: "abc" }),
    );
    expect(isInstalled(dir, asset)).toBe(false);
    expect(isInstalled(path.join(tmp, "none"), asset)).toBe(false);
  });
});

describe("remote bundle digest", () => {
  const index = (body: string) => () => new Response(new Uint8Array(gzipSync(Buffer.from(body))));

  function bundleServer(digest: string, rangeStatus = 206): FetchFn {
    return async (url, init) => {
      if (url === `${BUNDLE_URL}.index.gz`) return index("exam.cls 0 10\nSHA256SUM 500 64\n")();
      const range = new Headers(init?.headers).get("Range");
      if (url === BUNDLE_URL && range === "bytes=500-563") {
        return new Response(`${digest}`, { status: rangeStatus });
      }
      return new Response("", { status: 404 });
    };
  }

  it("reads SHA256SUM by range request", async () => {
    await expect(remoteBundleDigest(bundleServer(BUNDLE_DIGEST))).resolves.toBe(BUNDLE_DIGEST);
    await expect(assertRemoteBundlePinned(bundleServer(BUNDLE_DIGEST))).resolves.toBeUndefined();
  });

  it("fails loudly when the upstream bundle changed", async () => {
    await expect(assertRemoteBundlePinned(bundleServer("f".repeat(64)))).rejects.toThrow(
      /changed upstream/,
    );
  });

  it("fails when range requests are refused", async () => {
    await expect(remoteBundleDigest(bundleServer(BUNDLE_DIGEST, 200))).rejects.toThrow(
      /refused a range request/,
    );
  });

  it("fails without an index or SHA256SUM entry", async () => {
    await expect(remoteBundleDigest(serve({}))).rejects.toThrow(/Cannot read/);
    await expect(
      remoteBundleDigest(serve({ [`${BUNDLE_URL}.index.gz`]: index("exam.cls 0 1\n") })),
    ).rejects.toThrow(/no SHA256SUM/);
  });
});

describe("bundle cache state", () => {
  const encoded = "https,58,,47,,47,data1b.fullyjustified.net,47,tlextras-2022.0r0.tar";

  it("decodes Tectonic cache names", () => {
    expect(decodeCacheName(encoded)).toBe(BUNDLE_URL);
  });

  it("reports missing, ok and mismatch", () => {
    expect(bundleCacheState(tmp)).toBe("missing");
    const hashes = path.join(tmp, "bundles", "hashes");
    fs.mkdirSync(hashes, { recursive: true });
    expect(bundleCacheState(tmp)).toBe("missing");
    fs.writeFileSync(path.join(hashes, encoded), `${BUNDLE_DIGEST}\n`);
    expect(bundleCacheState(tmp)).toBe("ok");
    fs.writeFileSync(path.join(hashes, encoded), "beef");
    expect(bundleCacheState(tmp)).toBe("mismatch");
  });
});
