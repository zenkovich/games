#!/bin/bash
# Copies the Python of the AI image to UI node - XuToWei/Image-To-UI's skill (upstream/, never edited), its agent
# (agent/) and the host contract (PORTING.md) - from AssetsLine into the o2 editor's tools: o2/Tools/ImageToUi/.
# Usage: tools/sync-image-to-ui.sh [<AssetsLine>/image-to-ui]
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
src="${1:-$root/../AssetsLine/image-to-ui}"
dst="$root/o2/Tools/ImageToUi"

if [ ! -f "$src/agent/agent.py" ] || [ ! -f "$src/upstream/image-to-ui/scripts/workflow.py" ]; then
    echo "no image-to-ui bundle at $src" >&2
    exit 1
fi

rm -rf "$dst/upstream" "$dst/agent"
mkdir -p "$dst"
rsync -a --exclude '__pycache__' --exclude '*.pyc' --exclude '.DS_Store' "$src/upstream" "$src/agent" "$dst/"
cp "$src/PORTING.md" "$dst/PORTING.md"
echo "synced $src -> $dst ($(find "$dst" -type f | wc -l | tr -d ' ') files)"
