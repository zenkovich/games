#!/bin/bash
# Regenerates the o2 side of the port from the Unity export: data, UI prototypes and scenes.
# Usage: Tools/UnityPort/rebuild_port.sh [--import]   (--import also re-imports sprites/spine/fonts/audio)
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/Tools/UnityPort"
if [ "$1" == "--import" ]; then python3 import_assets.py; fi
python3 make_game_data.py
python3 make_ui_plan.py > /dev/null
python3 make_scene_plan.py > /dev/null
cd "$ROOT"
cmake --build --preset mac --target GameUITests BuildAssets -j 10 | grep -E "error" || true
cd "$ROOT/Bin/Mac"
DC_PORT_PLAN="$ROOT/Work/Unity/ui_plan.json" ./GameUITests --gtest_filter='DragonPortBuild.BuildPrototypes' | grep -E "widgets|FAILED" || true
DC_PORT_SCENES="$ROOT/Work/Unity/scene_plan.json" ./GameUITests --gtest_filter='DragonPortBuild.BuildScenes' | grep -E "DragonPortBuild:|FAILED" || true
