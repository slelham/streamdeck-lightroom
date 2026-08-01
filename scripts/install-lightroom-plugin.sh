#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/lightroom/StreamDeckLightroom.lrplugin"

# Basic sanity: required files present
for f in Info.lua InitPlugin.lua Bridge.lua Actions.lua Presets.lua Library.lua Json.lua Config.lua; do
  if [[ ! -f "$SRC/$f" ]]; then
    echo "Missing $f in Lightroom plugin bundle" >&2
    exit 1
  fi
done

if [[ "$(uname -s)" == "Darwin" ]]; then
  DEST="$HOME/Library/Application Support/Adobe/Lightroom/Modules/StreamDeckLightroom.lrplugin"
else
  DEST="${APPDATA:-$HOME/AppData/Roaming}/Adobe/Lightroom/Modules/StreamDeckLightroom.lrplugin"
fi

mkdir -p "$(dirname "$DEST")"
rm -rf "$DEST"
cp -R "$SRC" "$DEST"

echo "Installed Lightroom companion plugin v1.4.5 to:"
echo "  $DEST"
echo
echo "Next:"
echo "  1. Quit and reopen Lightroom Classic (reload is not enough for sockets)"
echo "  2. File → Plug-in Manager → enable “Stream Deck Lightroom”"
echo "  3. File → Plug-in Extras → Stream Deck Bridge: Status (should report 1.4.5)"
echo "  4. Ports should be commands 59837 / state 59838"
