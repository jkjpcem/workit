#!/bin/sh
# Releases apps-script-template/Code.gs to every ES copy: copies it to es-engine/Code.gs, which
# each copy's Loader.gs fetches within the hour. Run it as part of "update WiSH school", after
# Joon's school copy is on the same version, then commit and push to main.
# Usage: apps-script-template/release-es-engine.sh
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SRC="$ROOT/apps-script-template/Code.gs"
OUT="$ROOT/es-engine/Code.gs"
# The same checks Loader.gs makes before it runs a new engine.
grep -q "^const ADMIN_PASSWORD = '';$" "$SRC" || { echo "Stopped: the admin password isn't blank." >&2; exit 1; }
grep -q "^const WORKIT_VERSION = [0-9]*;" "$SRC" || { echo "Stopped: no WORKIT_VERSION." >&2; exit 1; }
grep -q "^function doPost(" "$SRC" || { echo "Stopped: no doPost." >&2; exit 1; }
node -e "new Function(require('fs').readFileSync(process.argv[1], 'utf8'))" "$SRC" || { echo "Stopped: Code.gs doesn't read as code." >&2; exit 1; }
mkdir -p "$(dirname "$OUT")"
cp "$SRC" "$OUT"
echo "ES engine is now v$(sed -n 's/^const WORKIT_VERSION = \([0-9]*\);/\1/p' "$OUT"). Commit and push to main to send it to every ES copy."
