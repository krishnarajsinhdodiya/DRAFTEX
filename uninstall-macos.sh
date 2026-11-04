#!/bin/bash
# DRAFTEX uninstall for macOS (D52). Removes the app's own pieces: the Desktop
# launcher, Node.js in .runtime, node_modules and the build. The data folder
# (papers, backups, settings) is never touched. DRAFTEX must be closed.
# Usage: ./uninstall-macos.sh [--yes] [--remove-token]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
NODE="$ROOT/.runtime/node/bin/node"
YES=0
REMOVE_TOKEN=0
for arg in "$@"; do
  case "$arg" in
    --yes) YES=1 ;;
    --remove-token) REMOVE_TOKEN=1 ;;
    *) echo "[uninstall] Unknown option: $arg" >&2; exit 2 ;;
  esac
done

say() { echo "[uninstall] $*"; }
ask() {
  [ "$YES" = 1 ] && return 0
  local answer
  read -r -p "[uninstall] $1 (y/N) " answer
  [[ "$answer" =~ ^([yY]|[yY][eE][sS])$ ]]
}

cd "$ROOT"
DATA_DIR="(unknown)"
if [ -x "$NODE" ]; then
  DATA_DIR="$("$NODE" "$ROOT/scripts/uninstall-check.ts")" || exit 1
fi

say "This removes DRAFTEX's program files from $ROOT and the Desktop launcher."
say "Your papers, backups and settings in $DATA_DIR are KEPT."
if ! ask "Uninstall DRAFTEX now?"; then
  say "Nothing was changed."
  exit 0
fi

LINK="$HOME/Desktop/DRAFTEX.command"
if [ -f "$LINK" ]; then
  if grep -qF "$ROOT/start-macos.command" "$LINK"; then
    rm -f "$LINK"
    say "Removed the Desktop launcher."
  else
    say "Left $LINK alone: it belongs to another copy of DRAFTEX."
  fi
fi

for name in .next node_modules cache .runtime; do
  if [ -e "$ROOT/$name" ]; then
    say "Removing $name ..."
    rm -rf "${ROOT:?}/$name"
  fi
done

if [ "$REMOVE_TOKEN" = 1 ] || { [ "$YES" = 0 ] && ask "Also remove the saved GitHub token used for updates?"; }; then
  printf 'protocol=https\nhost=github.com\n\n' | git credential reject || true
  say "Removed the saved GitHub sign-in for github.com."
fi

say "DRAFTEX is uninstalled. Your papers are still in $DATA_DIR"
say "To finish, delete the folder $ROOT"
say "To use DRAFTEX again later, set it up again; it finds the papers in that folder."
