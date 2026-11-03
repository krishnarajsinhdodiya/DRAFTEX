// Tectonic manager: download, verify and install the pinned binary; check the
// pinned bundle digest both remotely (before first use) and in the local cache.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import {
  BUNDLE_DIGEST,
  BUNDLE_URL,
  TECTONIC_ASSETS,
  TECTONIC_RELEASE_BASE,
  TECTONIC_VERSION,
  type TectonicAsset,
} from "./pins.ts";

const execFileAsync = promisify(execFile);

export class TectonicSetupError extends Error {
  override name = "TectonicSetupError";
}

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export function assetFor(platform: NodeJS.Platform, arch: string): TectonicAsset {
  const asset = TECTONIC_ASSETS[`${platform}-${arch}`];
  if (!asset) {
    throw new TectonicSetupError(
      `DRAFTEX has no pinned LaTeX engine for this computer (${platform}, ${arch}).`,
    );
  }
  return asset;
}

export function binaryPath(
  tectonicDir: string,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string {
  return path.join(tectonicDir, assetFor(platform, arch).binary);
}

const MARKER = "installed.json";

interface Marker {
  version: string;
  sha256: string;
}

export function isInstalled(tectonicDir: string, asset: TectonicAsset): boolean {
  try {
    const marker = JSON.parse(
      fs.readFileSync(path.join(tectonicDir, MARKER), "utf8"),
    ) as Partial<Marker>;
    return (
      marker.version === TECTONIC_VERSION &&
      marker.sha256 === asset.sha256 &&
      fs.existsSync(path.join(tectonicDir, asset.binary))
    );
  } catch {
    return false;
  }
}

/** Streams `url` to `dest` and returns the SHA-256 of the bytes written. */
export async function download(fetchFn: FetchFn, url: string, dest: string): Promise<string> {
  const res = await fetchFn(url, { redirect: "follow" });
  if (!res.ok || !res.body) {
    throw new TectonicSetupError(`Download failed (${res.status}) for ${url}`);
  }
  const hash = createHash("sha256");
  const out = fs.createWriteStream(dest);
  try {
    for await (const chunk of res.body) {
      const buf = Buffer.from(chunk as Uint8Array);
      hash.update(buf);
      if (!out.write(buf)) await new Promise<void>((r) => out.once("drain", () => r()));
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      out.end((err?: Error | null) => (err ? reject(err) : resolve())),
    );
  }
  return hash.digest("hex");
}

/** System bsdtar/GNU tar. On Windows, the built-in tar.exe (bsdtar) also reads zip. */
export function tarCommand(
  platform: NodeJS.Platform = process.platform,
  env: Record<string, string | undefined> = process.env,
): string {
  if (platform === "win32") {
    return path.win32.join(env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
  }
  return "tar";
}

export interface InstallOptions {
  tectonicDir: string;
  fetchFn?: FetchFn;
  platform?: NodeJS.Platform;
  arch?: string;
  baseUrl?: string;
  /** Override for tests; defaults to the pinned asset for this OS. */
  asset?: TectonicAsset;
  log?: (msg: string) => void;
}

/** Idempotent: does nothing when the pinned version is already installed. */
export async function installTectonic(opts: InstallOptions): Promise<string> {
  const platform = opts.platform ?? process.platform;
  const asset = opts.asset ?? assetFor(platform, opts.arch ?? process.arch);
  const log = opts.log ?? (() => {});
  const target = path.join(opts.tectonicDir, asset.binary);
  if (isInstalled(opts.tectonicDir, asset)) {
    log(`LaTeX engine ${TECTONIC_VERSION} is already installed.`);
    return target;
  }

  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "draftex-tectonic-"));
  try {
    const archive = path.join(staging, asset.file);
    log(`Downloading LaTeX engine ${TECTONIC_VERSION}…`);
    const got = await download(
      opts.fetchFn ?? fetch,
      `${opts.baseUrl ?? TECTONIC_RELEASE_BASE}/${asset.file}`,
      archive,
    );
    if (got !== asset.sha256) {
      throw new TectonicSetupError(
        `The downloaded LaTeX engine does not match the pinned checksum (expected ${asset.sha256}, got ${got}). Nothing was installed.`,
      );
    }
    const extracted = path.join(staging, "x");
    fs.mkdirSync(extracted);
    await execFileAsync(tarCommand(platform), ["-xf", archive, "-C", extracted]);
    const binary = path.join(extracted, asset.binary);
    if (!fs.existsSync(binary)) {
      throw new TectonicSetupError(`The engine archive does not contain ${asset.binary}.`);
    }
    fs.mkdirSync(opts.tectonicDir, { recursive: true });
    fs.copyFileSync(binary, target);
    fs.chmodSync(target, 0o755);
    const marker: Marker = { version: TECTONIC_VERSION, sha256: asset.sha256 };
    fs.writeFileSync(path.join(opts.tectonicDir, MARKER), JSON.stringify(marker, null, 2));
    log(`LaTeX engine installed at ${target}`);
    return target;
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

/**
 * Reads the bundle's SHA256SUM entry over HTTP range requests (the same file
 * Tectonic uses to key its cache) and compares it with the pin.
 */
export async function remoteBundleDigest(
  fetchFn: FetchFn = fetch,
  url: string = BUNDLE_URL,
): Promise<string> {
  const idxRes = await fetchFn(`${url}.index.gz`);
  if (!idxRes.ok) {
    throw new TectonicSetupError(`Cannot read the LaTeX bundle index (${idxRes.status}).`);
  }
  const index = gunzipSync(Buffer.from(await idxRes.arrayBuffer())).toString("utf8");
  const line = index.split("\n").find((l) => l.startsWith("SHA256SUM "));
  const [, offset, length] = line?.split(" ") ?? [];
  if (!offset || !length) {
    throw new TectonicSetupError("The LaTeX bundle index has no SHA256SUM entry.");
  }
  const end = Number(offset) + Number(length) - 1;
  const res = await fetchFn(url, { headers: { Range: `bytes=${offset}-${end}` } });
  if (res.status !== 206) {
    throw new TectonicSetupError(
      `The LaTeX bundle server refused a range request (${res.status}).`,
    );
  }
  return (await res.text()).trim();
}

export async function assertRemoteBundlePinned(fetchFn: FetchFn = fetch): Promise<void> {
  const digest = await remoteBundleDigest(fetchFn);
  if (digest !== BUNDLE_DIGEST) {
    throw new TectonicSetupError(
      `The LaTeX package bundle changed upstream (expected ${BUNDLE_DIGEST}, got ${digest}). Do not continue; the pin must be reviewed.`,
    );
  }
}

/** Tectonic names cache entries by URL with ':' → ',58,' and '/' → ',47,'. */
export function decodeCacheName(name: string): string {
  return name.replace(/,(\d+),/g, (_, code: string) => String.fromCharCode(Number(code)));
}

export type CacheState = "missing" | "ok" | "mismatch";

/** Offline check that the local cache was filled from the pinned bundle. */
export function bundleCacheState(cacheDir: string, url: string = BUNDLE_URL): CacheState {
  const hashes = path.join(cacheDir, "bundles", "hashes");
  let entries: string[];
  try {
    entries = fs.readdirSync(hashes);
  } catch {
    return "missing";
  }
  const entry = entries.find((n) => decodeCacheName(n) === url);
  if (!entry) return "missing";
  const digest = fs.readFileSync(path.join(hashes, entry), "utf8").trim();
  return digest === BUNDLE_DIGEST ? "ok" : "mismatch";
}
