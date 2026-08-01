#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN_DIR="$ROOT/streamdeck/com.cursor.lightroom.sdPlugin"
VERSION="$(node -p "require('$ROOT/streamdeck/package.json').version" 2>/dev/null || echo '?')"

echo "Building Stream Deck plugin v${VERSION}…"
(
  cd "$ROOT/streamdeck"
  if [[ ! -d node_modules ]]; then
    npm install
  fi
  # Icons are already committed under imgs/ — do not regenerate (needs Pillow + masters).
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

# Bust Stream Deck cache of key artwork (macOS)
if [[ "$(uname -s)" == "Darwin" ]]; then
  CACHE="$HOME/Library/Application Support/com.elgato.StreamDeck/Cache"
  if [[ -d "$CACHE" ]]; then
    find "$CACHE" -iname '*lightroom*' -delete 2>/dev/null || true
    find "$CACHE" -iname '*com.cursor.lightroom*' -delete 2>/dev/null || true
  fi
fi

MANIFEST_VER="$(node -p "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).Version" "$DEST/manifest.json" 2>/dev/null || echo "?")"
ICON="$DEST/imgs/actions/connection-on.png"
ICON_BYTES="$(wc -c < "$ICON" 2>/dev/null | tr -d ' ' || echo 0)"

echo
echo "Installed Stream Deck plugin v${VERSION} (manifest ${MANIFEST_VER}) to:"
echo "  $DEST"
echo "  connection-on.png size: ${ICON_BYTES} bytes (new AI icons are ~5000+; old SDF icons were ~2000)"
if [[ "${ICON_BYTES:-0}" -lt 4000 ]]; then
  echo "  WARNING: icon looks like the OLD set — wrong repo folder or icons not rebuilt."
fi
echo
echo "Confirm update:"
echo "  • Connection key ICON shows white “v${VERSION}” at the bottom (aperture / link style)"
echo "  • Connection title reads “v${VERSION} Online”"
echo "  • Or run: ./scripts/verify-install.sh"
echo
echo "Next:"
echo "  1. Fully quit Stream Deck (menu bar / tray → Quit) — Force Quit if needed"
echo "  2. Reopen Stream Deck"
echo "  3. If keys still show old art: Profiles → import"
echo "       $DEST/profiles/lightroom-classic*.streamDeckProfile"
echo "  4. Install/enable the Lightroom companion: ./scripts/install-lightroom-plugin.sh"
