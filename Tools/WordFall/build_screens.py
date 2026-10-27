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

SCREEN_W, SCREEN_H = 768, 1673
LETTERS = "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЫЬЭЮЯ"
TOOLS = ["cell", "ice", "stone", "crate", "chain", "snow", "parcel", "bomb", "rocket", "fireworks", "letter", "erase"]


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


# the Tile prototype is drawn at 100 px: its centred layers (ice, crate, bonus) and texts follow the size
def tile(name, cx, cy, size, depth):
    node = load_proto("Tile")
    data = node["Data"]
    data["mName"] = name
    data["mDrawingDepth"] = float(depth)
    place(data, cx - size / 2, cy - size * 0.515, size, size * 1.03)
    k = size / 100.0
    for layer in data.get("Layers") or []:
        value = layer.get("Value", layer)
        lay = value.get("layout")
        if lay and lay.get("mAnchorMin") == {"x": 0.5, "y": 0.5} and lay.get("mAnchorMax") == {"x": 0.5, "y": 0.5}:
            for key in ("mOffsetMin", "mOffsetMax"):
                lay[key] = {"x": round(lay[key]["x"] * k, 1), "y": round(lay[key]["y"] * k, 1)}
        elif lay and value.get("name") == "points":
            for key in ("mOffsetMin", "mOffsetMax"):
                lay[key] = {"x": round(lay[key]["x"] * k, 1), "y": round(lay[key]["y"] * k, 1)}
        drawable = value.get("mDrawable", {})
        if drawable.get("Type") == "o2::Text":
            drawable["Value"]["mHeight"] = max(10, round(drawable["Value"]["mHeight"] * k))
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
DARK_TEXT = color(52, 26, 12)
LIGHT_TEXT = color(255, 247, 234)
NEW = "WordFall/SpritesNew/"
TASK_TYPES = ["Length", "Powerup", "ClearIce", "AnyWords", "WordScore", "Letter", "Deliver", "Melt", "Crates"]
TASK_NAMES = {"Length": "ДЛИНА", "Powerup": "БОНУС", "ClearIce": "ВЕСЬ ЛЁД", "AnyWords": "СЛОВА", "WordScore": "ОЧКИ СЛОВА",
              "Letter": "БУКВА", "Deliver": "КОНВЕРТЫ", "Melt": "СНЕЖКИ", "Crates": "ЯЩИКИ"}
# a task type's icon: a sprite, or a letter tile with a symbol
TASK_ICONS = {"Length": ("tile", "5"), "Powerup": ("sprite", "WordFall/Sprites/powerup_bomb.png"), "ClearIce": ("sprite", "WordFall/Sprites/ui_ice.png"),
              "AnyWords": ("sprite", NEW + "layer_rainbow_star.png"), "WordScore": ("tile", "18+"), "Letter": ("tile", "А"),
              "Deliver": ("sprite", "WordFall/Sprites/ui_envelope.png"), "Melt": ("sprite", "WordFall/Sprites/ui_snowball.png"),
              "Crates": ("sprite", "WordFall/Sprites/ui_crate.png")}
LEVEL_ROWS = 12
WORD_ROWS = 8
NAME_KEYS = "0123456789_-"  # "_" — пробел


def new_sprite(name, path, depth=0.0, enabled=True):
    value = {"name": name, "mDrawable": sprite_value(path), "mUID": new_id()}
    if depth:
        value["mDepth"] = float(depth)
    if not enabled:
        value["mEnabled"] = False
    return {"Type": "o2::WidgetLayer", "Value": value}


def sprite_value(path, col=None):
    border = json.load(open(ASSETS / (path + ".meta")))["Value"].get("sliceBorder")
    value = {"Type": "o2::Sprite", "Value": {"mImageAsset": {"id": asset_id(path), "path": path}}}
    if border:
        value["Value"]["mMode"] = "Sliced"
        value["Value"]["mSlices"] = dict(border)
    if col:
        value["Value"]["mColor"] = col
    return value


def new_image(name, path, x, y, w, h, depth, enabled=True):
    node = widget(name, depth, type_="o2::Image", enabled=enabled)
    place(node["Data"], x, y, w, h)
    node["Data"]["Layers"] = [new_sprite("image", path)]
    return node


def text_drawable(text, height, col, font=FONT_HEAVY, halign="Middle"):
    return {"Type": "o2::Text", "Value": {"mText": text, "mFontAssetId": font, "mHeight": height, "mColor": col,
                                           "mSymbolsDistCoef": 1.0, "mLinesDistanceCoef": 1.0, "mVerAlign": "Middle", "mHorAlign": halign}}


# a small letter tile: the game's tile sprite with a letter (word previews, task icons)
def mini_tile(name, x, y, size, depth, letter="", enabled=True, tint=NEW + "layer_tile.png"):
    node = widget(name, depth, enabled=enabled)
    place(node["Data"], x, y, size, size * 1.03)
    node["Data"]["Layers"] = [
        new_sprite("back", tint),
        new_sprite("found", NEW + "layer_tile4.png", 0.5, enabled=False),
        {"Type": "o2::WidgetLayer", "Value": {"name": "letter", "mDrawable": text_drawable(letter, round(size * 0.6), DARK_TEXT), "mUID": new_id(), "mDepth": 1.0}},
    ]
    return node


def task_icon(name, type_, x, y, size, depth):
    kind, value = TASK_ICONS[type_]
    if kind == "sprite":
        return new_image(name, value, x, y, size, size, depth)
    node = mini_tile(name, x, y, size, depth, value)
    node["Data"]["Layers"][2]["Value"]["mDrawable"]["Value"]["mHeight"] = round(size * (0.36 if len(value) > 2 else 0.6))
    return node


def scroll_bar(name, x, y, w, h, depth):
    node = widget(name, depth, type_="o2::VerticalScrollBar")
    place(node["Data"], x, y, w, h)
    node["Data"]["mMaxValue"] = 1.0
    node["Data"]["mScrollHandleSize"] = 0.2
    node["Data"]["mScrollhandleMinPxSize"] = 60.0
    node["Data"]["Layers"] = [
        {"Type": "o2::WidgetLayer", "Value": {"name": "back", "mDrawable": sprite_value(SPRITES + "white.png", color(14, 26, 60, 200)), "mUID": new_id()}},
        {"Type": "o2::WidgetLayer", "Value": {"name": "handle", "mDrawable": sprite_value(SPRITES + "ui_btn_orange.png"), "mUID": new_id(), "mDepth": 1.0}},
    ]
    sprite = node["Data"]["Layers"][1]["Value"]["mDrawable"]["Value"]
    sprite["mMode"] = "Sliced"
    sprite["mSlices"] = {"left": 26, "bottom": 28, "right": 26, "top": 28}
    return node


def stepper(children, key, caption, x, y, name_w=100, depth=3):
    children.append(label(key + "Name", caption, x, y, name_w, 40, 15, depth, halign="Left"))
    x += name_w + 4
    children.append(pill(key + "Minus", "-", x, y, 44, 40, depth + 2, 26))
    children.append(label(key + "Value", "0", x + 46, y, 64, 40, 22, depth))
    children.append(pill(key + "Plus", "+", x + 112, y, 44, 40, depth + 2, 26))


def board_tiles(children, columns, rows, left, top, cell, size, depth):
    for c in range(columns):
        for r in range(rows):
            cx = left + cell / 2 + c * cell
            cy = top + cell / 2 + (rows - 1 - r) * cell
            children.append(image(f"CellBack_{c}_{r}", "ui_cell_back.png", cx - cell * 0.51, cy - cell * 0.51, cell * 1.02, cell * 1.02, depth - 1))
    for c in range(columns):
        for r in range(rows):
            cx = left + cell / 2 + c * cell
            cy = top + cell / 2 + (rows - 1 - r) * cell
            children.append(tile(f"Tile_{c}_{r}", cx, cy, size, depth))


def editor_background():
    bg = background()
    bg["Data"]["Transform"]["size"] = {"x": float(SCREEN_W * 2), "y": float(SCREEN_H + 80), "z": 0.0}
    return bg


def build_level_editor(game_screen):
    children = []
    # header: title, undo / redo, close
    children.append(label("Title", "РЕДАКТОР УРОВНЕЙ", 20, 14, 410, 48, 28, 3, halign="Left"))
    children.append(pill("UndoBtn", "НАЗАД", 424, 14, 124, 48, 5, 17))
    children.append(pill("RedoBtn", "ВПЕРЁД", 552, 14, 124, 48, 5, 17))
    children.append(icon_button("CloseBtn", "ui_btn_cancel.png", 690, 8, 60, 60, 5))

    # the level: previous / pick from the list / next, play
    children.append(pill("PrevBtn", "<", 16, 76, 60, 56, 5, 28))
    children.append(pill("LevelPick", "УРОВЕНЬ", 82, 76, 424, 56, 5, 17))
    children.append(pill("NextBtn", ">", 512, 76, 60, 56, 5, 28))
    children.append(pill("PlayBtn", "ИГРАТЬ", 580, 76, 172, 56, 5))
    for i, (name, caption) in enumerate([("NewBtn", "НОВЫЙ"), ("CopyBtn", "КОПИЯ"), ("DeleteBtn", "УДАЛИТЬ"),
                                         ("UpBtn", "ВЫШЕ"), ("DownBtn", "НИЖЕ"), ("RenameBtn", "ИМЯ")]):
        children.append(pill(name, caption, 16 + i * 123, 140, 119, 44, 5, 15))

    # parameters
    children.append(image("Params", "ui_tasks_panel.png", 16, 192, 736, 200, 2, slices=PANEL_SLICES))
    stepper(children, "Moves", "ХОДЫ", 30, 204)
    stepper(children, "Target", "ЦЕЛЬ", 392, 204, 80)
    children.append(pill("AutoTargetBtn", "АВТО", 652, 204, 94, 40, 5, 15))
    stepper(children, "Difficulty", "СЛОЖНОСТЬ", 30, 250, 124)
    stepper(children, "Vowels", "ГЛАСНЫЕ+", 392, 250, 100)
    stepper(children, "Rare", "РЕДКИЕ+", 30, 296)
    children.append(pill("ResetBtn", "ИСХОДНЫЙ", 392, 296, 172, 40, 5, 15))
    children.append(pill("FilesBtn", "ФАЙЛ", 572, 296, 174, 40, 5, 15))
    children.append(label("ChargesName", "ЗАРЯДЫ", 30, 342, 100, 40, 15, 3, halign="Left"))
    for i in range(5):
        children.append(pill(f"Charge{i}", "3", 134 + i * 64, 342, 58, 40, 5, 18))

    # goals: the level's words (manual and the agent's) and the other tasks, all of them visible
    children.append(new_image("WordsPanel", NEW + "layer_word_tasks_bg.png", 16, 400, 372, 240, 2))
    children.append(label("WordsTitle", "СЛОВА", 30, 406, 250, 32, 15, 3, col=LIGHT_TEXT, halign="Left"))
    children.append(pill("WordsBtn", "ИЗМЕНИТЬ", 270, 404, 110, 34, 5, 13))
    for r in range(4):
        for i in range(8):
            children.append(mini_tile(f"EW{r}_{i}", 28 + i * 44, 444 + r * 46, 42, 3, enabled=False))
    children.append(label("WordsMore", "", 28, 444 + 3 * 46, 350, 44, 16, 4, font=FONT_REGULAR, col=LIGHT_TEXT))
    children.append(new_image("TasksPanel", NEW + "layer_tasks_back.png", 396, 400, 356, 240, 2))
    children.append(label("TasksTitle", "ЗАДАЧИ", 410, 406, 220, 32, 15, 3, col=DARK_TEXT, halign="Left"))
    children.append(pill("TasksBtn", "ИЗМЕНИТЬ", 634, 404, 110, 34, 5, 13))
    for i in range(5):
        children.append(label(f"TaskLine{i}", "", 412, 444 + i * 38, 330, 34, 15, 3, font=FONT_REGULAR, col=DARK_TEXT, halign="Left"))
    children.append(label("StatusLabel", "", 16, 644, 736, 34, 13, 3, font=FONT_REGULAR, col=GROUP_COLOR, halign="Left"))
    children[-1]["Data"]["mHorOverflow"] = "Wrap"

    board = widget("Board", None)
    board["Data"]["Children"] = []
    board_tiles(board["Data"]["Children"], 7, 8, (SCREEN_W - 7 * 90) / 2, 680, 90, 82, 10)
    children.append(board)

    children.append(label("ToolLabel", "", 0, 1406, SCREEN_W, 30, 15, 3, col=STATUS_COLOR))
    tools = widget("Tools", None)
    tools["Data"]["Children"] = []
    for i, name in enumerate(TOOLS):
        cx = 104 + (i % 6) * 112
        cy = 1490 + (i // 6) * 100
        tools["Data"]["Children"].append(tile("Tool_" + name, cx, cy, 84, 12))
    children.append(tools)

    children.append(build_levels_overlay())
    children.append(build_tasks_overlay())
    children.append(build_type_picker())
    children.append(build_words_overlay())
    children.append(build_palette())
    children.append(build_files_overlay())

    screen = widget("Screen", None, children, [script_component("Scripts/WordFall/WordFallLevelEditorView.js")])
    screen["Data"]["Transform"] = {"offsetMin": {"x": -SCREEN_W / 2, "y": -SCREEN_H / 2}, "offsetMax": {"x": SCREEN_W / 2, "y": SCREEN_H / 2}}

    return {
        "mActor": {
            "Type": "o2::Actor",
            "Value": {
                "mName": "LevelEditor",
                "Id": new_id(),
                "Transform": {"pivot": {"x": 0.5, "y": 0.5, "z": 0.0}},
                "Children": [editor_background(), screen],
            },
        }
    }


def card(children, title, x, y, w, h, depth):
    children.append(dim_button("Dim", depth))
    children.append(image("Card", "ui_panel_board.png", x, y, w, h, depth + 1, col=CARD_COLOR, slices=CARD_SLICES))
    children.append(label("Title", title, x, y + 18, w, 44, 26, depth + 2))


# the campaign as a list: twelve rows over the levels, a scroll bar for the long jumps
def build_levels_overlay():
    children = []
    top, row_h = 100, 92
    h = 110 + LEVEL_ROWS * row_h + 150
    card(children, "УРОВНИ КАМПАНИИ", 24, top, 720, h, 80)
    for i in range(LEVEL_ROWS):
        children.append(pill(f"LevelRow{i}", "", 48, top + 84 + i * row_h, 596, row_h - 8, 83, 16))
    children.append(scroll_bar("LevelsScroll", 656, top + 84, 64, LEVEL_ROWS * row_h - 8, 83))
    children.append(label("LevelsStatus", "", 48, top + 92 + LEVEL_ROWS * row_h, 672, 30, 14, 82, font=FONT_REGULAR, col=STATUS_COLOR))
    children.append(pill("LevelsDoneBtn", "ЗАКРЫТЬ", 244, top + 132 + LEVEL_ROWS * row_h, 280, 60, 83))
    return widget("Levels", None, children, enabled=False)


# tasks of the level: a row per task with a type button (its icon beside), a value button (letter,
# bonus kind), two steppers (length or score threshold, count) and a delete cross
TASK_ROWS = 5


def build_tasks_overlay():
    card_x, card_w, rows_top = 34, 700, 110
    card_h = rows_top + TASK_ROWS * 72 + 10 + 30 + 14 + 56 + 30
    top = (SCREEN_H - card_h) // 2
    children = []
    card(children, "ЗАДАЧИ УРОВНЯ", card_x, top, card_w, card_h, 90)
    for i in range(TASK_ROWS):
        y = top + rows_top + i * 72
        x = card_x + 18
        for type_ in TASK_TYPES:
            node = task_icon(f"Task{i}Icon{type_}", type_, x, y + 4, 44, 93)
            node["Data"]["mEnabled"] = False
            children.append(node)
        x += 50
        children.append(pill(f"Task{i}Type", "СЛОВА", x, y, 150, 52, 93, 15))
        x += 156
        children.append(pill(f"Task{i}Value", "", x, y, 104, 52, 93, 18))
        x += 110
        children.append(pill(f"Task{i}AMinus", "-", x, y + 4, 40, 44, 93, 24))
        x += 40
        children.append(label(f"Task{i}A", "", x, y, 52, 52, 17, 92))
        x += 52
        children.append(pill(f"Task{i}APlus", "+", x, y + 4, 40, 44, 93, 24))
        x += 44
        children.append(pill(f"Task{i}BMinus", "-", x, y + 4, 40, 44, 93, 24))
        x += 40
        children.append(label(f"Task{i}B", "", x, y, 48, 52, 17, 92))
        x += 48
        children.append(pill(f"Task{i}BPlus", "+", x, y + 4, 40, 44, 93, 24))
        x += 46
        children.append(icon_button(f"Task{i}Delete", "ui_btn_cancel.png", x, y + 4, 44, 44, 93))
    y = top + rows_top + TASK_ROWS * 72 + 10
    children.append(label("TasksStatus", "", card_x + 24, y, card_w - 48, 30, 14, 92, font=FONT_REGULAR, col=GROUP_COLOR, halign="Left"))
    y += 44
    children.append(pill("AddTaskBtn", "+ ЗАДАЧА", card_x + 24, y, 300, 56, 93))
    children.append(pill("TasksDoneBtn", "ГОТОВО", card_x + card_w - 24 - 300, y, 300, 56, 93))
    return widget("Tasks", None, children, enabled=False)


# the task type as a grid of icons with names: opened by a task's type button and by "+ задача"
def build_type_picker():
    children = []
    w, h = 640, 130 + 3 * 120 + 100
    x, top = (SCREEN_W - w) // 2, (SCREEN_H - h) // 2
    card(children, "ТИП ЗАДАЧИ", x, top, w, h, 95)
    for i, type_ in enumerate(TASK_TYPES):
        cx = x + 24 + (i % 3) * 200
        cy = top + 90 + (i // 3) * 120
        children.append(task_icon(f"TypeIcon{type_}", type_, cx + 66, cy, 64, 98))
        children.append(pill(f"Type{type_}", TASK_NAMES[type_], cx, cy + 66, 196, 46, 98, 14))
    children.append(pill("TypeCancelBtn", "ОТМЕНА", x + (w - 240) // 2, top + h - 84, 240, 56, 98))
    return widget("TypePicker", None, children, enabled=False)


# the level's words: the hand-picked list (edited in the palette) and the agent's parameters
def build_words_overlay():
    children = []
    w, h = 720, 1300
    x, top = 24, (SCREEN_H - h) // 2
    card(children, "СЛОВА УРОВНЯ", x, top, w, h, 86)
    children.append(label("WordsNote", "Вручную — для особых уровней; агент подберёт слова по словарю языка", x + 24, top + 68, w - 48, 30, 13, 88,
                          font=FONT_REGULAR, col=NOTE_COLOR))
    for i in range(WORD_ROWS):
        y = top + 108 + i * 70
        children.append(pill(f"WordRow{i}", "", x + 24, y, 520, 60, 89, 20))
        children.append(icon_button(f"WordRow{i}Delete", "ui_btn_cancel.png", x + 556, y + 6, 48, 48, 89))
    children.append(pill("WordsUpBtn", "ВЫШЕ", x + 616, top + 108, 84, 60, 89, 13))
    children.append(pill("WordsDownBtn", "НИЖЕ", x + 616, top + 108 + (WORD_ROWS - 1) * 70, 84, 60, 89, 13))
    y = top + 108 + WORD_ROWS * 70 + 6
    children.append(label("WordsCount", "", x + 24, y, 400, 36, 15, 88, col=GROUP_COLOR, halign="Left"))
    children.append(pill("AddWordBtn", "+ СЛОВО", x + 440, y - 6, 256, 52, 89, 18))
    y += 64
    children.append(label("AgentTitle", "АГЕНТ ПОДБОРА СЛОВ", x, y, w, 36, 20, 88))
    y += 46
    stepper(children, "AgentCount", "СЛОВ", x + 40, y, 120, 88)
    stepper(children, "AgentMin", "ДЛИНА ОТ", x + 380, y, 120, 88)
    y += 52
    stepper(children, "AgentMax", "ДЛИНА ДО", x + 40, y, 120, 88)
    children.append(pill("AgentPickBtn", "ЗАФИКСИРОВАТЬ", x + 380, y, 300, 44, 89, 15))
    y += 60
    children.append(label("AgentPreview", "", x + 24, y, w - 48, 92, 14, 88, font=FONT_REGULAR, col=STATUS_COLOR))
    for name in ("AgentPreview",):
        children[-1]["Data"]["Layers"][0]["Value"]["mDrawable"]["Value"]["mVerAlign"] = "Top"
    children.append(pill("WordsDoneBtn", "ГОТОВО", x + (w - 300) // 2, top + h - 86, 300, 60, 89))
    return widget("Words", None, children, enabled=False)


# letters for a cell, a task, a word; digits, space and a dash for a level's name
def build_palette():
    palette = widget("Palette", None, enabled=False)
    top = 360
    children = [
        dim_button("Dim", 100),
        image("Card", "ui_panel_board.png", 74, top, 620, 640, 101, col=CARD_COLOR, slices=CARD_SLICES),
        label("Title", "БУКВА В КЛЕТКЕ", 74, top + 16, 620, 44, 24, 102),
    ]
    for i, letter in enumerate(LETTERS):
        cx = 104 + 35 + (i % 8) * 70
        cy = top + 70 + 35 + (i // 8) * 70
        children.append(tile(f"Letter{i}", cx, cy, 64, 103))
    for i, key in enumerate(NAME_KEYS):
        cx = 104 + 35 + (i % 8) * 70
        cy = top + 70 + 35 + (4 + i // 8) * 70
        node = tile(f"Key{i}", cx, cy, 64, 103)
        node["Data"]["mEnabled"] = False
        children.append(node)
    children.append(pill("RandomBtn", "СЛУЧАЙНАЯ", 114, top + 560, 260, 56, 102))
    children.append(pill("CancelBtn", "ОТМЕНА", 394, top + 560, 260, 56, 102))
    palette["Data"]["Children"] = children
    return palette


# campaign and level files: save to the player, load back (Word Fall json or a match-3 level), export
def build_files_overlay():
    x, w = 134, 500
    top = 380
    children = [
        dim_button("Dim", 104),
        image("Card", "ui_panel_board.png", 94, top, 580, 660, 105, col=CARD_COLOR, slices=CARD_SLICES),
        label("Title", "ФАЙЛЫ КАМПАНИИ", 94, top + 20, 580, 44, 26, 106),
        label("Note", "", x, top + 76, w, 28, 15, 106, font=FONT_REGULAR, col=NOTE_COLOR),
        label("Note2", "", x, top + 106, w, 28, 15, 106, font=FONT_REGULAR, col=NOTE_COLOR),
        pill("SaveCampaignBtn", "СОХРАНИТЬ КАМПАНИЮ", x, top + 144, w, 64, 106, 20),
        pill("SaveLevelBtn", "СОХРАНИТЬ УРОВЕНЬ", x, top + 220, w, 64, 106, 20),
        pill("LoadBtn", "ЗАГРУЗИТЬ ИЗ ФАЙЛА", x, top + 296, w, 64, 106, 20),
        pill("ImportMatch3Btn", "ПОЛЕ ИЗ «ТРИ В РЯД»", x, top + 372, w, 64, 106, 20),
        pill("ExportBtn", "ЭКСПОРТ В ASSETS", x, top + 448, w, 64, 106, 20),
        label("FilesStatus", "", x - 20, top + 520, w + 40, 44, 14, 106, font=FONT_REGULAR, col=STATUS_COLOR),
        pill("FilesDoneBtn", "ЗАКРЫТЬ", 264, top + 572, 240, 60, 106),
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
