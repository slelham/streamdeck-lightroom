#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN_DIR="$ROOT/streamdeck/com.cursor.lightroom.sdPlugin"

if [[ ! -f "$PLUGIN_DIR/bin/plugin.js" ]]; then
  echo "Building Stream Deck plugin first..."
  (
    cd "$ROOT/streamdeck"
    npm install
    npm run build
  )
fi

if [[ "$(uname -s)" == "Darwin" ]]; then
  DEST="$HOME/Library/Application Support/com.elgato.StreamDeck/Plugins/com.cursor.lightroom.sdPlugin"
else
  DEST="${APPDATA:-$HOME/.config}/Elgato/StreamDeck/Plugins/com.cursor.lightroom.sdPlugin"
fi

mkdir -p "$(dirname "$DEST")"
rm -rf "$DEST"
cp -R "$PLUGIN_DIR" "$DEST"
echo "Installed Stream Deck plugin to:"
echo "  $DEST"
echo
echo "Restart the Stream Deck app if the actions do not appear."
