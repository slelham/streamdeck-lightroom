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
echo "Installed Stream Deck plugin to:"
echo "  $DEST"
echo
echo "Next:"
echo "  1. Restart the Stream Deck app"
echo "  2. Accept the bundled Lightroom Classic profile when prompted"
echo "  3. Install/enable the Lightroom companion: ./scripts/install-lightroom-plugin.sh"
