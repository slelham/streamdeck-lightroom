#!/usr/bin/env bash
# Nuclear reinstall: quit Stream Deck, wipe plugin folder, copy v1.4.5, verify.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

EXPECTED="1.4.5.0"
BRANCH="$(git branch --show-current 2>/dev/null || true)"

echo "== Force reinstall Stream Deck Lightroom plugin =="
echo "Checkout: $ROOT"
echo "Branch:   ${BRANCH:-unknown}"
echo

if [[ "$BRANCH" != "cursor/readable-icons-b738" ]]; then
  echo "Wrong branch. Switching to cursor/readable-icons-b738…"
  git fetch origin cursor/readable-icons-b738
  git checkout cursor/readable-icons-b738
  git pull --ff-only origin cursor/readable-icons-b738
fi

# Confirm source stamp before build
SRC_MAN="$ROOT/streamdeck/com.cursor.lightroom.sdPlugin/manifest.json"
if ! grep -q "\"Version\": \"$EXPECTED\"" "$SRC_MAN" 2>/dev/null; then
  echo "Source manifest is not $EXPECTED yet — building…"
fi

if [[ "$(uname -s)" == "Darwin" ]]; then
  DEST="$HOME/Library/Application Support/com.elgato.StreamDeck/Plugins/com.cursor.lightroom.sdPlugin"
  if pgrep -x "Stream Deck" >/dev/null 2>&1 || pgrep -f "Stream Deck.app" >/dev/null 2>&1; then
    echo "Quitting Stream Deck (required so the plugin folder can be replaced)…"
    osascript -e 'quit app "Stream Deck"' >/dev/null 2>&1 || true
    # wait up to ~10s
    for _ in $(seq 1 20); do
      if ! pgrep -f "Stream Deck" >/dev/null 2>&1; then
        break
      fi
      sleep 0.5
    done
    sleep 1
  fi
else
  DEST="${APPDATA:-$HOME/AppData/Roaming}/Elgato/StreamDeck/Plugins/com.cursor.lightroom.sdPlugin"
  echo "If Stream Deck is open, quit it now, then press Enter."
  read -r _
fi

echo "Building…"
(
  cd "$ROOT/streamdeck"
  if [[ ! -d node_modules ]]; then
    npm install
  fi
  npm run build:all
)

# Stamp a plain text version file for easy eyeballing
echo "1.4.5" > "$ROOT/streamdeck/com.cursor.lightroom.sdPlugin/VERSION.txt"

echo "Wiping old plugin at:"
echo "  $DEST"
rm -rf "$DEST"
mkdir -p "$(dirname "$DEST")"
cp -R "$ROOT/streamdeck/com.cursor.lightroom.sdPlugin" "$DEST"

# Also install Lightroom companion
"$ROOT/scripts/install-lightroom-plugin.sh"

echo
echo "Verifying install…"
"$ROOT/scripts/which-version.sh"

echo
echo "Done. Open Stream Deck now."
echo "Connection key must show: v1.4.5 Online"
echo "If the title still says v1.4.0:"
echo "  1. Delete the Connection key from the profile"
echo "  2. Drag Lightroom Classic → Connection onto the pad again"
echo "  3. Press it once"
