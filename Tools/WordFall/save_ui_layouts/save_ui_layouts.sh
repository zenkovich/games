#!/bin/zsh
# Saves the AI UI layouts of the "Wordfall UI" pipeline into Assets/WordFall/UI the way the layout node's Save to project
# does (UiDoc::ExportLayout), without opening the editor, then turns them into the game's screens (apply_ui_screens.py).
# The export runs inside o2EditorUITests with an invisible window: ZzSaveLayoutsUITest.cpp is put into the o2 tests for the
# run and taken out after it. The layouts' own graphics (backdrops, the season pass) are read from the nodes' cached
# outputs, so the pipeline's uploads need not be synced.
set -e
cd "$(dirname "$0")/../../.."
ROOT=$PWD
WORK=$(mktemp -d)
TEST=o2/Tests/EditorTests/Sources/uitests/ZzSaveLayoutsUITest.cpp
trap 'rm -f "$ROOT/$TEST"; rm -rf "$WORK"' EXIT

python3 - "$ROOT" "$WORK" <<'EOF'
import json, os, shutil, sys
root, work = sys.argv[1], sys.argv[2]
pipeline_path = os.path.join(root, "Assets", "Pipelines", "Wordfall UI.pipeline")
pipeline = json.load(open(pipeline_path))
previews = os.path.join(root, "Work", "Pipelines", "cache", pipeline["id"], "previews")
kit = next(n for n in pipeline["nodes"] if n["type"] == "uiKit")
names = {"f29e0b3e-31d2-4bb8-8da0-a6b3b0140987": "MainScreen", "fa1121fa-5c9e-48f0-a8b2-33b92ac095a8": "VictoryWindow",
         "c67269cb-363c-471b-8148-e9f82cacc771": "ContinueWindow"}
os.makedirs(os.path.join(work, "uploads"))
for node in pipeline["nodes"]:
    if node["id"] not in names:
        continue
    for step in node["config"].get("steps", []):
        for asset in step.get("assets") or []:
            src = os.path.join(previews, "%s.own-%s.png" % (node["id"], asset["name"]))
            if os.path.exists(src):
                shutil.copy(src, os.path.join(work, "uploads", asset["uploadId"]))
spec = {"pipeline": pipeline_path, "kit": os.path.join(previews, kit["id"] + ".txt"), "work": work + "/",
        "layouts": [{"node": node, "name": name, "folder": "WordFall/UI"} for node, name in names.items()]}
json.dump(spec, open(os.path.join(work, "spec.json"), "w"), indent=1)
EOF

cp Tools/WordFall/save_ui_layouts/ZzSaveLayoutsUITest.cpp "$TEST"
cmake --preset mac > /dev/null
cmake --build --preset mac --target o2EditorUITests -j 10
(cd build/o2/Tests/EditorTests && O2_INVISIBLE_WINDOW=1 O2_SAVE_LAYOUTS="$WORK/spec.json" ./o2EditorUITests --gtest_filter='ZzSaveLayouts.*') | grep -E "^==|warning|OK|FAILED"
rm -f "$TEST"
cmake --preset mac > /dev/null

python3 Tools/WordFall/apply_ui_screens.py
