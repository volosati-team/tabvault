#!/usr/bin/env bash
# Publish a TabVault HTML export at a permanent address.
#   ./share.sh ~/Drive/TabVault/shared-1730000000000.html [my-collection]
# The file lands at s/<id>.html and comes back as a GitHub Pages URL that keeps
# working after the tabs themselves are long gone.
set -euo pipefail
src="${1:?usage: share.sh <export.html> [id]}"
id="${2:-$(date +%Y%m%d-%H%M%S)}"
[ -f "$src" ] || { echo "no such file: $src" >&2; exit 1; }
mkdir -p s
cp "$src" "s/$id.html"
git add "s/$id.html"
git commit -q -m "share: $id

Co-Authored-By: Claude Code <noreply@anthropic.com>"
git push -q
echo "https://volosati-team.github.io/tabvault/s/$id.html"
