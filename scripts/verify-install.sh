#!/usr/bin/env bash
# Print installed Stream Deck + Lightroom plugin versions on this machine.
set -euo pipefail

EXPECTED="1.3.1"

if [[ "$(uname -s)" == "Darwin" ]]; then
  SD="$HOME/Library/Application Support/com.elgato.StreamDeck/Plugins/com.cursor.lightroom.sdPlugin"
  LR="$HOME/Library/Application Support/Adobe/Lightroom/Modules/StreamDeckLightroom.lrplugin"
else
  SD="${APPDATA:-$HOME/AppData/Roaming}/Elgato/StreamDeck/Plugins/com.cursor.lightroom.sdPlugin"
  LR="${APPDATA:-$HOME/AppData/Roaming}/Adobe/Lightroom/Modules/StreamDeckLightroom.lrplugin"
fi

echo "=== Stream Deck plugin ==="
if [[ -f "$SD/manifest.json" ]]; then
  echo "Path: $SD"
  node -p "const j=require(process.argv[1]); 'Name: '+j.Name+'\nVersion: '+j.Version" "$SD/manifest.json"
else
  echo "NOT INSTALLED at:"
  echo "  $SD"
fi

echo
echo "=== Lightroom companion ==="
if [[ -f "$LR/Config.lua" ]]; then
  echo "Path: $LR"
  grep -E 'VERSION_STRING' "$LR/Config.lua" || true
  grep -E 'LrPluginName' "$LR/Info.lua" || true
  if grep -q 'Plugin version' "$LR/Status.lua" 2>/dev/null; then
    echo "Status.lua: includes version (good)"
  else
    echo "Status.lua: OLD (no version line) — re-run ./scripts/install-lightroom-plugin.sh"
  fi
else
  echo "NOT INSTALLED at:"
  echo "  $LR"
fi

echo
echo "Expected: VERSION_STRING \"${EXPECTED}\" and Stream Deck Version ${EXPECTED}.0"
echo
echo "If Status dialog shows Receive/Send connected = false:"
echo "  1. Quit Lightroom completely"
echo "  2. Fully quit Stream Deck (menu bar / tray)"
echo "  3. Open Stream Deck first, then Lightroom"
echo "  4. Press the Connection key — should go Online"
echo "  5. File → Plug-in Extras → Stream Deck Bridge: Status — both should be true"
