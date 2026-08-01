#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN_DIR="$ROOT/streamdeck/com.cursor.lightroom.sdPlugin"
VERSION="$(node -p "require('$ROOT/streamdeck/package.json').version" 2>/dev/null || echo '?')"

echo "Building Stream Deck plugin v${VERSION}…"
(
  cd "$ROOT/streamdeck"
  if [[ ! -d node_modules ]]; then
    npm install
  fi
  npm run build:all
  npm test
  node ../scripts/validate-profiles.mjs
)

if [[ "$(uname -s)" == "Darwin" ]]; then
  DEST="$HOME/Library/Application Support/com.elgato.StreamDeck/Plugins/com.cursor.lightroom.sdPlugin"
else
  # Git Bash / Windows
  DEST="${APPDATA:-$HOME/AppData/Roaming}/Elgato/StreamDeck/Plugins/com.cursor.lightroom.sdPlugin"
fi

mkdir -p "$(dirname "$DEST")"
rm -rf "$DEST"
cp -R "$PLUGIN_DIR" "$DEST"

MANIFEST_VER="$(node -p "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).Version" "$DEST/manifest.json" 2>/dev/null || echo "?")"

echo
echo "Installed Stream Deck plugin v${VERSION} (manifest ${MANIFEST_VER}) to:"
echo "  $DEST"
echo
echo "Confirm update:"
echo "  • Connection key ICON shows white “v1.3.1” at the bottom"
echo "  • Connection title reads “v1.3.1 Online”"
echo "  • Or run: ./scripts/verify-install.sh"
echo
echo "Next:"
echo "  1. Fully quit Stream Deck (menu bar / tray) and reopen"
echo "  2. Accept the bundled Lightroom Classic profile when prompted"
echo "  3. Install/enable the Lightroom companion: ./scripts/install-lightroom-plugin.sh"
