#!/usr/bin/env bash
# Print installed Stream Deck + Lightroom plugin versions on this machine.
set -euo pipefail

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
  if [[ -f "$SD/imgs/actions/connection.png" ]]; then
    echo "Connection icon: present ($(wc -c < "$SD/imgs/actions/connection.png") bytes)"
  else
    echo "Connection icon: MISSING"
  fi
else
  echo "NOT INSTALLED at $SD"
fi

echo
echo "=== Lightroom companion ==="
if [[ -f "$LR/Config.lua" ]]; then
  echo "Path: $LR"
  grep -E 'VERSION_STRING|LrPluginName' "$LR/Config.lua" "$LR/Info.lua" 2>/dev/null || true
else
  echo "NOT INSTALLED at $LR"
fi

echo
echo "Expected for this release: Stream Deck Version 1.3.1.0, Lightroom VERSION_STRING 1.3.1"
echo "Connection key icon should show white text v1.3.1 at the bottom."
