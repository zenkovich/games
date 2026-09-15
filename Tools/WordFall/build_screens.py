#!/usr/bin/env python3
"""Scaffolds the WordFall screens that are not built by hand in the editor:
Assets/WordFall/Prototypes/LevelEditorScreen.proto and the Cheats panel inside
GameScreen.proto. Widgets are full copies of Tile/PillButton/IconButton.proto
with fresh ids, laid out here; the result is an ordinary prototype, editable in
the o2 editor - rerunning the script overwrites the edits.

    python3 Tools/WordFall/build_screens.py [--out DIR]

--out writes both prototypes into DIR instead of Assets (to compare a regeneration).
"""
import copy
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "Assets"
PROTOS = ASSETS / "WordFall" / "Prototypes"
SPRITES = "WordFall/Sprites/"

FONT_HEAVY = "3f1c9a52e07b4d68a91c5d2b8e447a10"
FONT_REGULAR = "8d8ed66fd6814bce8878d2824c90b746"

SCREEN_W, SCREEN_H = 768, 1376
LETTERS = "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЫЬЭЮЯ"
TOOLS = ["addCell", "removeCell", "ice", "stone", "crate", "chain", "snow", "parcel", "bomb", "rocket", "fireworks", "letter", "erase"]


def new_id():
    return random.getrandbits(63) | 1


def asset_id(path):
    return json.load(open(ASSETS / (path + ".meta")))["Value"]["mId"]


# assets embedded into states (animation clips) carry their own asset ids
def fresh_asset_metas(value):
    if isinstance(value, dict):
        if str(value.get("Type", "")).startswith("o2::DefaultAssetMeta<") and "mId" in value.get("Value", {}):
            value["Value"]["mId"] = "%032x" % random.getrandbits(128)
        for item in value.values():
            fresh_asset_metas(item)
    elif isinstance(value, list):
        for item in value:
            fresh_asset_metas(item)


def fresh_ids(node):
    data = node.get("Data") if "Data" in node else node.get("Value")
    if data is None:
        return node
    if "Id" in data:
        data["Id"] = new_id()
    for comp in data.get("Components") or []:
        if "mId" in comp.get("Data", {}):
            comp["Data"]["mId"] = new_id()
    for layer in data.get("Layers") or []:
        value = layer.get("Value", layer)
        if "mUID" in value:
            value["mUID"] = new_id()
    fresh_asset_metas(data.get("States"))
    for child in data.get("Children") or []:
        fresh_ids(child)
    return node


def load_proto(name):
    root = json.load(open(PROTOS / f"{name}.proto"))["mActor"]
    return fresh_ids({"Type": root["Type"], "Data": copy.deepcopy(root["Value"])})


# top-left placement: x, y from the top-left corner of the parent, y grows down
def place(data, x, y, w, h):
    data["Transform"] = {
        "anchorMin": {"x": 0.0, "y": 1.0},
        "anchorMax": {"x": 0.0, "y": 1.0},
        "offsetMin": {"x": float(x), "y": float(-(y + h))},
        "offsetMax": {"x": float(x + w), "y": float(-y)},
    }


def stretch(data):
    data["Transform"] = {"anchorMax": {"x": 1.0, "y": 1.0}, "offsetMax": {"x": 0.0, "y": 0.0}}


def color(r, g, b, a=255):
    return {"r": r, "g": g, "b": b, "a": a}


def widget(name, depth=None, children=None, components=None, enabled=True, type_="o2::Widget"):
    data = {
        "mInheritDrawingDepthFromParent": False,
        "mName": name,
        "mSceneLayer": {"Type": "o2::SceneLayer", "Value": {"mName": "UI"}},
        "Id": new_id(),
        "Transform": {},
        "InternalWidgets": [],
        "Layers": [],
        "States": [],
    }
    if depth is not None:
        data["mDrawingDepth"] = float(depth)
    if not enabled:
        data["mEnabled"] = False
    if children:
        data["Children"] = children
    if components:
        data["Components"] = components
    stretch(data)
    return {"Type": type_, "Data": data}


def sprite(file, col=None, slices=None):
    value = {"mImageAsset": {"id": asset_id(SPRITES + file), "path": SPRITES + file}}
    if col:
        value["mColor"] = col
    if slices:
        value["mMode"] = "Sliced"
        value["mSlices"] = {"left": slices[0], "bottom": slices[1], "right": slices[2], "top": slices[3]}
    return {"Type": "o2::Sprite", "Value": value}


def image(name, file, x, y, w, h, depth, col=None, slices=None):
    node = widget(name, depth, type_="o2::Image")
    place(node["Data"], x, y, w, h)
    node["Data"]["Layers"] = [{"Type": "o2::WidgetLayer", "Value": {"name": "image", "mDrawable": sprite(file, col, slices), "mUID": new_id()}}]
    return node


def image_stretch(name, file, depth, col=None):
    node = widget(name, depth, type_="o2::Image")
    node["Data"]["Layers"] = [{"Type": "o2::WidgetLayer", "Value": {"name": "image", "mDrawable": sprite(file, col), "mUID": new_id()}}]
    return node


# a full-screen dim that also swallows taps under an overlay card (buttons stop the cursor events)
def dim_button(name, depth):
    node = widget(name, depth, type_="o2::Button")
    node["Data"]["Layers"] = [{"Type": "o2::WidgetLayer", "Value": {"name": "back", "mDrawable": sprite("white.png", DIM_COLOR), "mUID": new_id()}}]
    return node


def label(name, text, x, y, w, h, height, depth, font=FONT_HEAVY, col=None, halign="Middle"):
    node = widget(name, depth, type_="o2::Label")
    place(node["Data"], x, y, w, h)
    value = {
        "mText": text,
        "mFontAssetId": font,
        "mHeight": height,
        "mSymbolsDistCoef": 1.0,
        "mLinesDistanceCoef": 1.0,
        "mVerAlign": "Middle",
        "mHorAlign": halign,
    }
    if col:
        value["mColor"] = col
    node["Data"]["Layers"] = [{"Type": "o2::WidgetLayer", "Value": {"name": "text", "mDrawable": {"Type": "o2::Text", "Value": value}, "mUID": new_id()}}]
    return node


def pill(name, caption, x, y, w, h, depth, height=22):
    node = load_proto("PillButton")
    data = node["Data"]
    data["mName"] = name
    data["mDrawingDepth"] = float(depth)
    place(data, x, y, w, h)
    button = data["Children"][0]["Data"]
    button["mDrawingDepth"] = float(depth) + 0.5
    for layer in button["Layers"]:
        if layer["Value"]["name"] == "caption":
            text = layer["Value"]["mDrawable"]["Value"]
            text["mText"] = caption
            text["mHeight"] = height
    return node


def icon_button(name, file, x, y, w, h, depth):
    node = load_proto("IconButton")
    data = node["Data"]
    data["mName"] = name
    data["mDrawingDepth"] = float(depth)
    place(data, x, y, w, h)
    button = data["Children"][0]["Data"]
    button["mDrawingDepth"] = float(depth) + 0.5
    for layer in button["Layers"]:
        layer["Value"]["mDrawable"]["Value"]["mImageAsset"] = {"id": asset_id(SPRITES + file), "path": SPRITES + file}
    return node


def tile(name, cx, cy, size, depth):
    node = load_proto("Tile")
    data = node["Data"]
    data["mName"] = name
    data["mDrawingDepth"] = float(depth)
    place(data, cx - size / 2, cy - size / 2, size, size)
    return node


def script_component(path):
    return {"Type": "o2::ScriptableComponent", "Data": {"mId": new_id(), "mScript": {"id": asset_id(path), "path": path}}}


def background():
    return {
        "Type": "o2::Actor",
        "Data": {
            "mInheritDrawingDepthFromParent": False,
            "mName": "BG",
            "mSceneLayer": {"Type": "o2::SceneLayer", "Value": {"mName": "BG"}},
            "Id": new_id(),
            "Transform": {"pivot": {"x": 0.5, "y": 0.5, "z": 0.0}},
            "Components": [{"Type": "o2::ImageComponent", "Data": {"mImageAsset": {"id": asset_id(SPRITES + "background.png"), "path": SPRITES + "background.png"}, "mId": new_id()}}],
        },
    }


def game_bg(game_screen):
    for child in game_screen["Value"]["Children"]:
        if child["Data"]["mName"] == "BG":
            return fresh_ids(copy.deepcopy(child))
    return background()


# ---------------------------------------------------------------- level editor
PANEL_SLICES = (20, 16, 20, 36)
CARD_SLICES = (40, 40, 40, 40)
CARD_COLOR = color(150, 165, 205)
DIM_COLOR = color(8, 16, 38, 215)
GROUP_COLOR = color(150, 200, 255)
NOTE_COLOR = color(200, 220, 255)
STATUS_COLOR = color(255, 232, 120)


def stepper(children, key, caption, x, y):
    children.append(label(key + "Name", caption, x, y, 100, 40, 15, 3, halign="Left"))
    children.append(pill(key + "Minus", "-", x + 104, y, 48, 40, 5, 26))
    children.append(label(key + "Value", "0", x + 156, y, 70, 40, 24, 3))
    children.append(pill(key + "Plus", "+", x + 230, y, 48, 40, 5, 26))


def board_tiles(children, columns, rows, left, top, cell, size, depth):
    for c in range(columns):
        for r in range(rows):
            cx = left + cell / 2 + c * cell
            cy = top + cell / 2 + (rows - 1 - r) * cell
            children.append(image(f"CellBack_{c}_{r}", "ui_cell_back.png", cx - 49, cy - 49, 98, 98, depth - 1))
    for c in range(columns):
        for r in range(rows):
            cx = left + cell / 2 + c * cell
            cy = top + cell / 2 + (rows - 1 - r) * cell
            children.append(tile(f"Tile_{c}_{r}", cx, cy, size, depth))


def build_level_editor(game_screen):
    children = []
    children.append(label("Title", "РЕДАКТОР УРОВНЕЙ", 0, 18, SCREEN_W, 44, 30, 3))
    children.append(icon_button("CloseBtn", "ui_btn_cancel.png", 680, 8, 64, 64, 5))

    children.append(pill("PrevBtn", "<", 28, 78, 64, 56, 5, 28))
    children.append(label("LevelLabel", "УРОВЕНЬ 1 / 1", 100, 78, 300, 56, 24, 3))
    children.append(pill("NextBtn", ">", 408, 78, 64, 56, 5, 28))
    children.append(pill("PlayBtn", "ИГРАТЬ", 500, 78, 240, 56, 5))

    children.append(image("Params", "ui_tasks_panel.png", 28, 146, 712, 236, 2, slices=PANEL_SLICES))
    stepper(children, "Moves", "ХОДЫ", 44, 160)
    stepper(children, "Target", "ЦЕЛЬ", 404, 160)
    stepper(children, "Vowels", "ГЛАСНЫЕ+", 44, 208)
    stepper(children, "Rare", "РЕДКИЕ+", 404, 208)
    children.append(label("ChargesName", "ЗАРЯДЫ", 44, 256, 100, 40, 15, 3, halign="Left"))
    for i in range(5):
        children.append(pill(f"Charge{i}", "3", 148 + i * 62, 256, 56, 40, 5, 18))
    children.append(pill("ResetBtn", "ИСХОДНЫЙ", 470, 256, 118, 40, 5, 15))
    children.append(pill("FilesBtn", "ФАЙЛ", 600, 256, 118, 40, 5, 15))
    children.append(label("TasksLabel", "", 44, 304, 520, 30, 15, 3, font=FONT_REGULAR, col=NOTE_COLOR, halign="Left"))
    children.append(pill("TasksBtn", "ЗАДАЧИ", 580, 300, 138, 40, 5, 15))
    children.append(label("StatusLabel", "", 44, 338, 680, 30, 14, 3, font=FONT_REGULAR, col=GROUP_COLOR, halign="Left"))

    board = widget("Board", None)
    board["Data"]["Children"] = []
    board_tiles(board["Data"]["Children"], 7, 8, 48, 392, 96, 88, 10)
    children.append(board)

    children.append(label("ToolLabel", "", 0, 1166, SCREEN_W, 28, 15, 3, col=STATUS_COLOR))
    tools = widget("Tools", None)
    tools["Data"]["Children"] = []
    for i, name in enumerate(TOOLS):
        cx = 90 + 42 + (i % 7) * 84
        cy = 1200 + 42 + (i // 7) * 84
        tools["Data"]["Children"].append(tile("Tool_" + name, cx, cy, 76, 12))
    children.append(tools)

    children.append(build_tasks_overlay())

    palette = widget("Palette", None, enabled=False)
    palette_children = [
        dim_button("Dim", 100),
        image("Card", "ui_panel_board.png", 74, 428, 620, 460, 101, col=CARD_COLOR, slices=CARD_SLICES),
        label("Title", "БУКВА В КЛЕТКЕ", 74, 444, 620, 44, 26, 102),
    ]
    for i, letter in enumerate(LETTERS):
        cx = 104 + 35 + (i % 8) * 70
        cy = 498 + 35 + (i // 8) * 70
        palette_children.append(tile(f"Letter{i}", cx, cy, 64, 103))
    palette_children.append(pill("RandomBtn", "СЛУЧАЙНАЯ", 174, 800, 200, 52, 102))
    palette_children.append(pill("CancelBtn", "ОТМЕНА", 394, 800, 200, 52, 102))
    palette["Data"]["Children"] = palette_children
    children.append(palette)
    children.append(build_files_overlay())

    screen = widget("Screen", None, children, [script_component("Scripts/WordFall/WordFallLevelEditorView.js")])
    screen["Data"]["Transform"] = {"offsetMin": {"x": -384.0, "y": -688.0}, "offsetMax": {"x": 384.0, "y": 688.0}}

    return {
        "mActor": {
            "Type": "o2::Actor",
            "Value": {
                "mName": "LevelEditor",
                "Id": new_id(),
                "Transform": {"pivot": {"x": 0.5, "y": 0.5, "z": 0.0}},
                "Children": [game_bg(game_screen), screen],
            },
        }
    }


# tasks of the level: a row per task with a type button, a value button (word, letter, bonus kind),
# two steppers (length or score threshold, count) and a delete cross; the view shows what applies
TASK_ROWS = 5


def build_tasks_overlay():
    card_x, card_w, rows_top = 34, 700, 110
    card_h = rows_top + TASK_ROWS * 72 + 10 + 30 + 14 + 56 + 30
    top = (SCREEN_H - card_h) // 2
    children = [
        dim_button("Dim", 90),
        image("Card", "ui_panel_board.png", card_x, top, card_w, card_h, 91, col=CARD_COLOR, slices=CARD_SLICES),
        label("Title", "ЗАДАЧИ УРОВНЯ", card_x, top + 20, card_w, 44, 26, 92),
    ]
    for i in range(TASK_ROWS):
        y = top + rows_top + i * 72
        x = card_x + 24
        children.append(pill(f"Task{i}Type", "СЛОВО", x, y, 170, 52, 93, 15))
        x += 178
        children.append(pill(f"Task{i}Value", "", x, y, 130, 52, 93, 18))
        x += 138
        children.append(pill(f"Task{i}AMinus", "-", x, y + 4, 40, 44, 93, 24))
        x += 40
        children.append(label(f"Task{i}A", "", x, y, 52, 52, 17, 92))
        x += 52
        children.append(pill(f"Task{i}APlus", "+", x, y + 4, 40, 44, 93, 24))
        x += 48
        children.append(pill(f"Task{i}BMinus", "-", x, y + 4, 40, 44, 93, 24))
        x += 40
        children.append(label(f"Task{i}B", "", x, y, 52, 52, 17, 92))
        x += 52
        children.append(pill(f"Task{i}BPlus", "+", x, y + 4, 40, 44, 93, 24))
        x += 48
        children.append(icon_button(f"Task{i}Delete", "ui_btn_cancel.png", x, y + 4, 44, 44, 93))
    y = top + rows_top + TASK_ROWS * 72 + 10
    children.append(label("TasksStatus", "", card_x + 24, y, card_w - 48, 30, 14, 92, font=FONT_REGULAR, col=GROUP_COLOR, halign="Left"))
    y += 44
    children.append(pill("AddTaskBtn", "+ ЗАДАЧА", card_x + 24, y, 300, 56, 93))
    children.append(pill("TasksDoneBtn", "ГОТОВО", card_x + card_w - 24 - 300, y, 300, 56, 93))
    return widget("Tasks", None, children, enabled=False)


# campaign and level files: save to the player, load back, export into the assets sources
def build_files_overlay():
    x, w = 134, 500
    children = [
        dim_button("Dim", 104),
        image("Card", "ui_panel_board.png", 94, 400, 580, 576, 105, col=CARD_COLOR, slices=CARD_SLICES),
        label("Title", "ФАЙЛЫ КАМПАНИИ", 94, 420, 580, 44, 26, 106),
        label("Note", "", x, 476, w, 28, 15, 106, font=FONT_REGULAR, col=NOTE_COLOR),
        label("Note2", "", x, 506, w, 28, 15, 106, font=FONT_REGULAR, col=NOTE_COLOR),
        pill("SaveCampaignBtn", "СОХРАНИТЬ КАМПАНИЮ", x, 544, w, 64, 106, 20),
        pill("SaveLevelBtn", "СОХРАНИТЬ УРОВЕНЬ", x, 620, w, 64, 106, 20),
        pill("LoadBtn", "ЗАГРУЗИТЬ ИЗ ФАЙЛА", x, 696, w, 64, 106, 20),
        pill("ExportBtn", "ЭКСПОРТ В ASSETS", x, 772, w, 64, 106, 20),
        label("FilesStatus", "", x, 848, w, 30, 14, 106, font=FONT_REGULAR, col=STATUS_COLOR),
        pill("FilesDoneBtn", "ЗАКРЫТЬ", 264, 886, 240, 60, 106),
    ]
    return widget("Files", None, children, enabled=False)


# ---------------------------------------------------------------- cheats panel
# groups of buttons in two columns; a group with one button gets the whole row
def build_cheats_panel():
    groups = [
        ("УРОВЕНЬ", [("WinBtn", "ВЫИГРАТЬ"), ("LoseBtn", "ПРОИГРАТЬ"), ("NextBtn", "СЛЕДУЮЩИЙ"), ("RestartBtn", "ЗАНОВО")]),
        ("РЕСУРСЫ", [("MovesBtn", "+5 ХОДОВ"), ("ScoreBtn", "+100 ОЧКОВ"), ("ChargesBtn", "+3 ЗАРЯДА")]),
        ("ПОЛЕ", [("PowerupBtn", "СЛУЧАЙНЫЙ БОНУС")]),
        ("ОБУЧЕНИЕ", [("TutorialBtn", "ПОКАЗАТЬ ЗАНОВО")]),
        ("РЕДАКТОР УРОВНЕЙ", [("EditorBtn", "ОТКРЫТЬ РЕДАКТОР")]),
    ]
    rows = sum((len(buttons) + 1) // 2 for _, buttons in groups)
    content = 84 + len(groups) * 46 + rows * 68 + 32 + 56
    card_h = content + 40
    top = (SCREEN_H - card_h) // 2
    children = [
        dim_button("Dim", 96),
        image("Card", "ui_panel_board.png", 64, top, 640, card_h, 97, col=CARD_COLOR, slices=CARD_SLICES),
        label("Title", "ЧИТЫ", 64, top + 20, 640, 48, 36, 98),
    ]
    y = top + 84
    for title, buttons in groups:
        children.append(label(title.replace(" ", "") + "Group", title, 96, y, 576, 28, 16, 98, col=GROUP_COLOR, halign="Left"))
        y += 34
        for i, (name, caption) in enumerate(buttons):
            wide = len(buttons) == 1
            children.append(pill(name, caption, 96 + (i % 2) * 296, y + (i // 2) * 68, 576 if wide else 280, 56, 98))
        y += ((len(buttons) + 1) // 2) * 68 + 12
    children.append(pill("CloseBtn", "ЗАКРЫТЬ", 244, y + 20, 280, 56, 98))
    return widget("Panel", None, children, enabled=False)


def rewrite_cheats(game_screen):
    for child in game_screen["Value"]["Children"]:
        if child["Data"]["mName"] != "Screen":
            continue
        for section in child["Data"]["Children"]:
            if section["Data"]["mName"] != "Cheats":
                continue
            toggle = [c for c in section["Data"]["Children"] if c["Data"]["mName"] == "Toggle"]
            section["Data"]["Children"] = toggle + [build_cheats_panel()]
            return
    raise RuntimeError("GameScreen.proto has no Screen/Cheats")


def dump(path, document, ensure_ascii):
    path.write_text(json.dumps(document, indent=4, ensure_ascii=ensure_ascii) + "\n", encoding="utf-8")


def main():
    import sys
    out = PROTOS
    if len(sys.argv) == 3 and sys.argv[1] == "--out":
        out = Path(sys.argv[2])
        out.mkdir(parents=True, exist_ok=True)

    random.seed("wordfall-screens")  # the same ids on every run: reruns don't churn the prototypes
    game_path = PROTOS / "GameScreen.proto"
    raw = game_path.read_text(encoding="utf-8")
    game_screen_doc = json.loads(raw)
    ensure_ascii = "\\u0" in raw

    dump(out / "LevelEditorScreen.proto", build_level_editor(game_screen_doc["mActor"]), ensure_ascii)
    rewrite_cheats(game_screen_doc["mActor"])
    dump(out / "GameScreen.proto", game_screen_doc, ensure_ascii)
    print(f"written {out / 'LevelEditorScreen.proto'}, {out / 'GameScreen.proto'} (Cheats)")


if __name__ == "__main__":
    main()
