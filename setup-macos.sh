#!/bin/bash
# DRAFTEX setup for macOS. Safe to run again: each step skips what is done.
# Needs no admin rights or Homebrew: Node.js is unpacked into this folder (D43).
# Usage: ./setup-macos.sh [--no-shortcut]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
# Official checksums from https://nodejs.org/dist/v24.22.2/SHASUMS256.txt (checked 2026-11-04).
NODE_VERSION="24.22.2"
case "$(uname -m)" in
  arm64) NODE_SHA256="aa9549349e47dffaa42dcf95d6e06ade8c4bdafc980979883b88767670df385a"; NODE_ARCH="arm64" ;;
  x86_64) NODE_SHA256="d5e336d588c45be0c37dbd52cc29895593009ca4997a77a1fd02815131ed0e52"; NODE_ARCH="x64" ;;
  *) echo "[setup] STOPPED: DRAFTEX needs an Apple silicon or Intel Mac; this one reports $(uname -m)." >&2; exit 1 ;;
esac
RUNTIME="$ROOT/.runtime"
NODE_DIR="$RUNTIME/node"
NODE="$NODE_DIR/bin/node"
STARTED=$(date +%s)
SHORTCUT=1
for arg in "$@"; do
  case "$arg" in
    --no-shortcut) SHORTCUT=0 ;;
    *) echo "[setup] Unknown option: $arg" >&2; exit 2 ;;
  esac
done

say() { echo "[setup] $*"; }
stop() { echo; echo "[setup] STOPPED: $*" >&2; exit 1; }

install_node() {
  if [ -x "$NODE" ] && [ "$("$NODE" --version)" = "v$NODE_VERSION" ]; then
    say "Node.js $NODE_VERSION is already in place."
    return
  fi
  local name="node-v$NODE_VERSION-darwin-$NODE_ARCH"
  local url="https://nodejs.org/dist/v$NODE_VERSION/$name.tar.gz"
  local tmp
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/draftex-node.XXXXXX")"
  trap 'rm -rf "${tmp:-}"; trap - RETURN' RETURN
  say "Downloading Node.js $NODE_VERSION ($NODE_ARCH, about 50 MB)..."
  curl --fail --location --silent --show-error --output "$tmp/$name.tar.gz" "$url" \
    || stop "Could not download $url. Check the internet connection and run setup again."
  local hash
  hash="$(shasum -a 256 "$tmp/$name.tar.gz" | cut -d ' ' -f 1)"
  [ "$hash" = "$NODE_SHA256" ] \
    || stop "The Node.js download does not match its pinned checksum, so it was not used. Try again later."
  say "Checksum matches. Unpacking..."
  tar -xzf "$tmp/$name.tar.gz" -C "$tmp"
  mkdir -p "$RUNTIME"
  rm -rf "$NODE_DIR"
  mv "$tmp/$name" "$NODE_DIR"
  say "Node.js $NODE_VERSION is in $NODE_DIR"
}

desktop_shortcut() {
  local desktop="$HOME/Desktop"
  if [ ! -d "$desktop" ]; then
    say "No Desktop folder; start DRAFTEX with start-macos.command in $ROOT"
    return
  fi
  local link="$desktop/DRAFTEX.command"
  printf '#!/bin/bash\n# Starts DRAFTEX (made by setup-macos.sh).\nexec %q\n' "$ROOT/start-macos.command" >"$link"
  chmod +x "$link"
  say "Desktop shortcut: $link"
}

cd "$ROOT"
say "Setting up DRAFTEX in $ROOT"
if [ ! -e "$ROOT/.git" ]; then
  say "WARNING: this folder was not made with 'git clone' (for example it came from Download ZIP),"
  say "         so update-macos.sh cannot update it later. See the user guide, section 13."
fi
case "$ROOT" in
  */Downloads/* | */Desktop/* | */Documents/* | */Library/Mobile\ Documents/*)
    say "WARNING: DRAFTEX is inside Downloads, Desktop or Documents; a folder such as ~/DRAFTEX is safer." ;;
esac

say "Part 1 of 3: Node.js"
install_node
export PATH="$NODE_DIR/bin:$PATH"
export CHECKPOINT_DISABLE=1 NEXT_TELEMETRY_DISABLED=1

say "Part 2 of 3: The app's packages (npm ci; a few minutes the first time)"
# A dropped connection is the usual failure (ECONNRESET); npm keeps what it has
# downloaded in its cache, so a retry continues instead of starting over.
export NPM_CONFIG_UPDATE_NOTIFIER=false
npm_ok=0
for try in 1 2 3; do
  extra=()
  if [ "$try" -gt 1 ]; then
    say "The download was interrupted. Trying again in 15 seconds (attempt $try of 3); what is already downloaded is kept."
    sleep 15
    extra=(--prefer-offline)
  fi
  if "$NODE_DIR/bin/npm" ci --no-audit --no-fund --loglevel=error --fetch-retries=5 \
    --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000 "${extra[@]+"${extra[@]}"}"; then
    npm_ok=1
    break
  fi
done
[ "$npm_ok" = 1 ] \
  || stop "The packages could not be downloaded after 3 tries. This is almost always the network: try another Wi-Fi or a phone hotspot, then run setup again. What was downloaded is kept."

say "Part 3 of 3: Database, LaTeX engine and app"
"$NODE" "$ROOT/scripts/install.ts" || stop "Setup did not finish. The messages above say why."

took=$((($(date +%s) - STARTED + 30) / 60))
if [ "$took" -lt 1 ]; then took="under a minute"; else took="about $took min"; fi
if [ "$SHORTCUT" = 1 ]; then
  desktop_shortcut
  say "DRAFTEX is set up (took $took). Double-click DRAFTEX on the desktop to start it."
else
  say "No desktop shortcut (--no-shortcut)."
  say "DRAFTEX is set up (took $took). Start it with start-macos.command in $ROOT"
fi
