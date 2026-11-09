#!/usr/bin/env bash
# Refresh this copy from dykamino-coder/gpui-kamin-ide.
# Usage: scripts/sync-from-monorepo.sh <path-to-gpui-kamin-ide checkout> [<ref>, default origin/main]
set -euo pipefail
src="${1:?path to gpui-kamin-ide}"
ref="${2:-origin/main}"
here="$(cd "$(dirname "$0")/.." && pwd)"
paths=(package.json package-lock.json tsconfig.json src
  builtin-extensions/claude-bridge/package.json
  extensions/claude-bridge/extension
  extensions/claude-bridge/workspace
  extensions/claude-bridge/webview
  extensions/claude-bridge/server/src/ui/src/lib/terminal-console)
sha="$(git -C "$src" rev-parse "$ref")"
for p in "${paths[@]}"; do git -C "$here" rm -r -q --ignore-unmatch -- "$p"; done
git -C "$src" archive --format=tar "$sha" "${paths[@]}" | tar -xf - -C "$here"
printf 'gpui-kamin-ide %s\n' "$sha" > "$here/UPSTREAM.txt"
git -C "$here" add -A
echo "synced from $sha; review 'git diff --cached' and commit"
