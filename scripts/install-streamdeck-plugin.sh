#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN_DIR="$ROOT/streamdeck/com.cursor.lightroom.sdPlugin"

echo "Building Stream Deck plugin…"
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

echo
echo "Installed Stream Deck plugin v1.4.5 to:"
echo "  $DEST"
echo
echo "Next:"
echo "  1. Fully quit Stream Deck (menu → Quit), then reopen"
echo "  2. Connection key should show v1.4.5 Online/Offline"
echo "  3. If it still says an older version, delete the Connection key and drag Connection on again"
echo "  4. Install/enable the Lightroom companion: ./scripts/install-lightroom-plugin.sh"
