#!/bin/bash
# DRAFTEX update for macOS: check -> backup -> git pull -> setup again.
# DRAFTEX must be closed. Everything runs inside main(), which bash reads in
# full before it starts, because git pull may change this file while it runs.
# Usage: ./update-macos.sh [--no-pull] [--no-shortcut]
main() {
  set -euo pipefail
  local root pull=1 shortcut=()
  root="$(cd "$(dirname "$0")" && pwd)"
  for arg in "$@"; do
    case "$arg" in
      --no-pull) pull=0 ;;
      --no-shortcut) shortcut=(--no-shortcut) ;;
      *) echo "[update] Unknown option: $arg" >&2; return 2 ;;
    esac
  done
  local node="$root/.runtime/node/bin/node"
  say() { echo "[update] $*"; }
  stop() { echo; echo "[update] STOPPED: $*" >&2; return 1; }

  cd "$root"
  [ -x "$node" ] || { stop "DRAFTEX is not set up yet. Run setup-macos.sh first."; return 1; }
  export PATH="$root/.runtime/node/bin:$PATH"
  export CHECKPOINT_DISABLE=1 NEXT_TELEMETRY_DISABLED=1

  say "Step 1 of 4: Checking that DRAFTEX is closed"
  "$node" "$root/scripts/update-check.ts" || return 1

  say "Step 2 of 4: Backing up your papers"
  "$node" "$root/scripts/backup.ts" --kind before-update \
    || { stop "The backup failed, so nothing was updated."; return 1; }

  say "Step 3 of 4: Downloading the new version"
  if [ "$pull" = 1 ]; then
    git -C "$root" pull --ff-only \
      || { stop "The new version could not be downloaded. Check the internet connection. Nothing was changed."; return 1; }
  else
    say "Skipped (--no-pull)."
  fi

  say "Step 4 of 4: Installing the new version"
  # A new bash reads the setup script as it is after the pull.
  /bin/bash "$root/setup-macos.sh" "${shortcut[@]+"${shortcut[@]}"}" \
    || { stop "The new version is downloaded but not installed. Run update-macos.sh again; your backup is in the Backups screen."; return 1; }
  say "DRAFTEX is up to date."
}
main "$@"
exit $?
