// Pinned LaTeX toolchain (memory.md "Pinned versions" and "Bundle pin (D1)").

export const TECTONIC_VERSION = "0.17.0";

export interface TectonicAsset {
  file: string;
  sha256: string;
  binary: string;
}

/** Keyed by `${process.platform}-${process.arch}`. */
export const TECTONIC_ASSETS: Readonly<Record<string, TectonicAsset>> = {
  "darwin-arm64": {
    file: "tectonic-0.17.0-aarch64-apple-darwin.tar.gz",
    sha256: "a3f1cac7c5678f01661a92212f58480ae3b0634115d880dbc59e2953ded45667",
    binary: "tectonic",
  },
  "darwin-x64": {
    file: "tectonic-0.17.0-x86_64-apple-darwin.tar.gz",
    sha256: "7c90ef5b6ddb1eb1937e4337add5237b79338e4b9676459fa91187d24d6cdf80",
    binary: "tectonic",
  },
  "win32-x64": {
    file: "tectonic-0.17.0-x86_64-pc-windows-msvc.zip",
    sha256: "f61ce51f0b0ade1015b7de7ef368541c5424e9756ecbd0d7af97d6d48030845f",
    binary: "tectonic.exe",
  },
  "linux-x64": {
    file: "tectonic-0.17.0-x86_64-unknown-linux-gnu.tar.gz",
    sha256: "1a715688baf591e650c8aeb160ae934e181685eecbb38b317de30b269ac5d606",
    binary: "tectonic",
  },
};

export const TECTONIC_RELEASE_BASE =
  "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%400.17.0";

/** Direct archive URL (the relay's default_bundle_v33.tar only redirects here). */
export const BUNDLE_URL = "https://data1b.fullyjustified.net/tlextras-2022.0r0.tar";

/** Content of the bundle's own SHA256SUM entry. */
export const BUNDLE_DIGEST = "6ffe055852f8faf66c0acbe1a7fb27f87b869a90bad1204f3bf4d9683f597c7c";
