#!/usr/bin/env bash
# Show which plugin version is in this repo vs what Stream Deck has installed.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/streamdeck/com.cursor.lightroom.sdPlugin"

if [[ "$(uname -s)" == "Darwin" ]]; then
  DEST="$HOME/Library/Application Support/com.elgato.StreamDeck/Plugins/com.cursor.lightroom.sdPlugin"
else
  DEST="${APPDATA:-$HOME/AppData/Roaming}/Elgato/StreamDeck/Plugins/com.cursor.lightroom.sdPlugin"
fi

echo "Repo branch:     $(git -C "$ROOT" branch --show-current 2>/dev/null || echo '?')"
echo "Repo commit:     $(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo '?')"
echo

read_ver() {
  local dir="$1"
  if [[ ! -d "$dir" ]]; then
    echo "(missing) $dir"
    return
  fi
  local man="$dir/manifest.json"
  local js="$dir/bin/plugin.js"
  local manVer="?"
  local jsVer="?"
  if [[ -f "$man" ]]; then
    manVer=$(python3 -c "import json;print(json.load(open('$man')).get('Version','?'))" 2>/dev/null || echo '?')
  fi
  if [[ -f "$js" ]]; then
    jsVer=$(python3 -c "
import re
t=open('$js',encoding='utf-8',errors='ignore').read()
m=re.findall(r'v1\.\d+\.\d+', t)
print(m[-1] if m else 'none')
" 2>/dev/null || echo '?')
  fi
  echo "  path:     $dir"
  echo "  manifest: $manVer"
  echo "  plugin.js title stamp: $jsVer"
}

echo "SOURCE (this checkout):"
read_ver "$SRC"
echo
echo "INSTALLED (what Stream Deck loads):"
read_ver "$DEST"
echo

if [[ -f "$DEST/manifest.json" ]]; then
  inst=$(python3 -c "import json;print(json.load(open('$DEST/manifest.json')).get('Version',''))" 2>/dev/null || true)
  if [[ "$inst" != "1.4.5.0" ]]; then
    echo "NOT UPDATED — installed is '$inst', expected 1.4.5.0"
    echo "Run: ./scripts/force-reinstall.sh"
    exit 1
  fi
  echo "OK — installed plugin is 1.4.5.0"
else
  echo "NOT INSTALLED — no plugin at DEST"
  echo "Run: ./scripts/force-reinstall.sh"
  exit 1
fi
