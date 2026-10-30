#!/bin/sh
# Builds the Tracy profiler GUI from the engine's tracy submodule and prints the path of its executable.
# Rebuilds only when the submodule moved: the GUI connects only to a client of its own version.
#
#   build_gui.sh [--force]
set -e

root="$(cd "$(dirname "$0")/../.." && pwd)"
source="$root/o2/Framework/3rdPartyLibs/tracy"
work="$root/build/tracy-gui"
out="$root/Tools/Tracy"
stamp="$out/Tracy.version"

if [ "$(uname)" = "Darwin" ]; then
    exe="$out/Tracy.app/Contents/MacOS/tracy-profiler"
else
    exe="$out/tracy-profiler"
fi

version="$(awk -F'= *' '/(Major|Minor|Patch) =/ { gsub(/[^0-9]/, "", $2); printf "%s%s", sep, $2; sep = "." }' \
    "$source/public/common/TracyVersion.hpp")"
commit="$(git -C "$source" rev-parse HEAD 2>/dev/null || true)"
wanted="$version $commit"

if [ "${1:-}" != "--force" ] && [ -x "$exe" ] && [ "$(cat "$stamp" 2>/dev/null)" = "$wanted" ]; then
    echo "$exe"
    exit 0
fi

echo "Building the Tracy $version profiler GUI (first build downloads its dependencies)" >&2

# BUNDLE: an app with its own glfw/freetype linked in, so no system packages are needed
cmake -S "$source/profiler" -B "$work" -G Ninja -DCMAKE_BUILD_TYPE=Release -DBUNDLE=ON >&2
cmake --build "$work" --config Release -j 8 >&2

mkdir -p "$out"
rm -rf "$out/Tracy.app" "$out/tracy-profiler"
if [ "$(uname)" = "Darwin" ]; then
    cp -R "$work/tracy-profiler.app" "$out/Tracy.app"
else
    cp "$work/tracy-profiler" "$exe"
fi
echo "$wanted" > "$stamp"

echo "$exe"
