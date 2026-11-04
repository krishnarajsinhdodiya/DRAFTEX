#!/bin/bash
# Starts DRAFTEX and opens it in the browser. Closing this window stops DRAFTEX (D46).
cd "$(dirname "$0")" || exit 1
if [ ! -x .runtime/node/bin/node ]; then
  echo "DRAFTEX is not set up yet. Run setup-macos.sh in this folder first."
  read -r -p "Press Return to close. " _
  exit 1
fi
export PATH="$PWD/.runtime/node/bin:$PATH"
exec .runtime/node/bin/node scripts/start.ts --open
