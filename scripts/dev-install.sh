#!/usr/bin/env bash
# Fast local loop: build from THIS checkout and install. No git fetch/pull.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SKIP_TESTS="${SKIP_TESTS:-1}"
QUIT_STREAMDECK="${QUIT_STREAMDECK:-1}"

echo "Local install from: $ROOT"
echo "Branch: $(git branch --show-current 2>/dev/null || echo '(not a git checkout)')"
echo

if [[ "$(uname -s)" == "Darwin" ]]; then
  DEST="$HOME/Library/Application Support/com.elgato.StreamDeck/Plugins/com.cursor.lightroom.sdPlugin"
  if [[ "$QUIT_STREAMDECK" == "1" ]]; then
    if pgrep -x "Stream Deck" >/dev/null 2>&1 || pgrep -f "Stream Deck.app" >/dev/null 2>&1; then
      echo "Quitting Stream Deck so the plugin folder can update…"
      osascript -e 'quit app "Stream Deck"' >/dev/null 2>&1 || true
      sleep 1
    fi
  fi
else
  DEST="${APPDATA:-$HOME/AppData/Roaming}/Elgato/StreamDeck/Plugins/com.cursor.lightroom.sdPlugin"
  echo "Quit Stream Deck before continuing if it is open."
fi

echo "Building…"
(
  cd "$ROOT/streamdeck"
  if [[ ! -d node_modules ]]; then
    npm install
  fi
  npm run build:all
  if [[ "$SKIP_TESTS" != "1" ]]; then
    npm test
  fi
)

# Easy eyeball stamp
if [[ -f "$ROOT/streamdeck/src/version.ts" ]]; then
  ver=$(python3 -c "import re;t=open('streamdeck/src/version.ts').read();m=re.search(r'PLUGIN_VERSION\s*=\s*\"([^\"]+)\"',t);print(m.group(1) if m else '?')" 2>/dev/null || echo "?")
  echo "$ver" > "$ROOT/streamdeck/com.cursor.lightroom.sdPlugin/VERSION.txt"
fi

echo "Installing Stream Deck plugin →"
echo "  $DEST"
rm -rf "$DEST"
mkdir -p "$(dirname "$DEST")"
cp -R "$ROOT/streamdeck/com.cursor.lightroom.sdPlugin" "$DEST"

echo "Installing Lightroom companion…"
"$ROOT/scripts/install-lightroom-plugin.sh"

echo
if [[ -f "$ROOT/scripts/which-version.sh" ]]; then
  "$ROOT/scripts/which-version.sh" || true
fi

echo
echo "Open Stream Deck (and restart Lightroom if you changed the .lrplugin)."
echo "Edit files here, then re-run:  ./scripts/dev-install.sh"
