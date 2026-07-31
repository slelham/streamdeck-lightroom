#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/lightroom/StreamDeckLightroom.lrplugin"

if [[ "$(uname -s)" == "Darwin" ]]; then
  DEST="$HOME/Library/Application Support/Adobe/Lightroom/Modules/StreamDeckLightroom.lrplugin"
else
  DEST="${APPDATA:-$HOME/.config}/Adobe/Lightroom/Modules/StreamDeckLightroom.lrplugin"
fi

mkdir -p "$(dirname "$DEST")"
rm -rf "$DEST"
cp -R "$SRC" "$DEST"
echo "Installed Lightroom companion plugin to:"
echo "  $DEST"
echo
echo "Next: open Lightroom Classic → File → Plug-in Manager → enable Stream Deck Lightroom"
echo "Ports: commands 59837, state 59838"
