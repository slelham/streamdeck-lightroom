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

VERSION="$(grep -o 'VERSION_STRING = "[^"]*"' "$SRC/Config.lua" | head -1 | cut -d'"' -f2 || echo '?')"

echo "Installed Lightroom companion plugin v${VERSION} to:"
echo "  $DEST"
echo
echo "Next:"
echo "  1. Quit and reopen Lightroom Classic (reload is not enough for sockets)"
echo "  2. File → Plug-in Manager → enable “Stream Deck Lightroom ${VERSION}” (or 1.3.0)"
echo "  3. File → Plug-in Extras → Stream Deck Bridge: Status — should show version + flag counts"
echo "  4. Ports should be commands 59837 / state 59838"
