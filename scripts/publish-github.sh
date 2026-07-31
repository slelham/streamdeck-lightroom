#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REPO_NAME="${REPO_NAME:-streamdeck-lightroom}"
VISIBILITY="${VISIBILITY:-public}"

if ! command -v gh >/dev/null; then
  echo "GitHub CLI (gh) is required."
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Not logged into GitHub CLI."
  echo "Run: gh auth login"
  exit 1
fi

if git remote get-url origin >/dev/null 2>&1; then
  echo "Remote 'origin' already set to $(git remote get-url origin)"
else
  gh repo create "$REPO_NAME" \
    --"$VISIBILITY" \
    --source=. \
    --remote=origin \
    --description "Open-source Stream Deck ↔ Lightroom Classic plugin with live presets and profile packs" \
    --push
  echo "Created and pushed github.com/$(gh api user --jq .login)/$REPO_NAME"
  exit 0
fi

git push -u origin HEAD
echo "Pushed to origin"
