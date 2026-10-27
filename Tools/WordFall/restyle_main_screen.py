#!/usr/bin/env python3
"""Lays the WordFall main screen out after the concept Assets/Generated/concept_new.png with the sprites
the Test pipeline's composer saved into WordFall/SpritesNew (Tools/WordFall/save_composer_layers.py).
Geometry: Tools/WordFall/main_screen_layout.py (concept pixels times 768/471, the screen is 768x1673).

Rewrites GameScreen.proto in place - ids and prototype links kept, the Tasks section (the level's words
panel and the strip of the other tasks) rebuilt - and the Tile, WordSlot, Booster, IconButton and
FxFlyingLetter prototypes: their sprites, letter styles and the layouts of the tile's layers. Rerunning
it on its own output gives the same result; afterwards the prototypes are the source of truth.

    python3 Tools/WordFall/restyle_main_screen.py
"""
import copy
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import main_screen_layout as C

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "Assets"
PROTOS = ASSETS / "WordFall" / "Prototypes"
OLD = "WordFall/Sprites/"
NEW = "WordFall/SpritesNew/"

FONT_HEAVY = "3f1c9a52e07b4d68a91c5d2b8e447a10"   # Rounded Mplus Black: letters and numbers
TEXT_FONT_PATH = "WordFall/text_font.ttf"          # Roboto: the concept's thin captions and counters

W, H = C.SCREEN_W, C.SCREEN_H
TEXT = {"r": C.TEXT[0], "g": C.TEXT[1], "b": C.TEXT[2], "a": 255}
DIGIT = {"r": 92, "g": 58, "b": 30, "a": 255}
LIGHT = {"r": 255, "g": 247, "b": 234, "a": 255}

TILE = 100.0        # board tile: the concept's 61.3 px
TILE_ASPECT = 1.03  # the tile sprite carries its shadow below
OLD_TILE = 88.0
CELL = round(C.CELL * C.S, 2)

SPRITE_MAP = {
    "ui_tile.png": "layer_tile.png",
    "ui_btn_accept.png": "layer_accept_btn.png",
    "ui_btn_cancel.png": "layer_cancel_btn.png",
    "ui_input_tray.png": "layer_input_back.png",
    "ui_moves_box.png": "layer_moves_bg.png",
    "ui_bar_fill.png": "layer_progress_fill.png",
    # the concept's buttons: magnifiers for the boosters aimed at a cell, bulbs for the hints; the
    # composer has no layer for the fifth (shuffle) button, it keeps its old sprite
    "ui_booster_hammer.png": "layer_search_btn.png",
    "ui_booster_x2.png": "layer_search_plus_btn.png",
    "ui_booster_hint.png": "layer_hint_btn.png",
    "ui_booster_joker.png": "layer_hint_btn_yellow.png",
}
TINTS = [NEW + "layer_tile.png", NEW + "layer_tile2.png", NEW + "layer_tile3.png", NEW + "layer_tile4.png"]
# boosters in the order of the concept's row: magnifier, magnifier+, blue bulb, yellow bulb, shuffle
BOOSTER_SLOT = {0: 0, 4: 1, 2: 2, 3: 3, 1: 4}

random.seed("wordfall-main-screen")


def new_id():
    return random.getrandbits(63) | 1


def meta(path):
    return json.loads((ASSETS / (path + ".meta")).read_text())["Value"]


def asset_id(path):
    return meta(path)["mId"]


def data(node):
    return node["Data"] if "Data" in node else node["Value"]


def child(node, name):
    for ch in data(node).get("Children") or []:
        if data(ch).get("mName") == name:
            return ch
    raise KeyError(name)


def layer(node, name):
    for lay in data(node).get("Layers") or []:
        value = lay.get("Value", lay)
        if value.get("name") == name:
            return value
    raise KeyError(name)


def drawable(value):
    return value["mDrawable"]["Value"]


def set_sprite(value, path):
    """sprite value points at path; a 9-sliced image (slices in its meta) draws sliced"""
    value["mImageAsset"] = {"id": asset_id(path), "path": path}
    border = meta(path).get("sliceBorder")
    if border:
        value["mMode"] = "Sliced"
        value["mSlices"] = dict(border)
    else:
        value.pop("mMode", None)
        value.pop("mSlices", None)


def swap_sprites(value):
    if isinstance(value, dict):
        asset = value.get("mImageAsset")
        if isinstance(asset, dict) and isinstance(asset.get("path"), str) and asset["path"].startswith(OLD):
            file = asset["path"][len(OLD):]
            if file in SPRITE_MAP:
                set_sprite(value, NEW + SPRITE_MAP[file])
        for item in value.values():
            swap_sprites(item)
    elif isinstance(value, list):
        for item in value:
            swap_sprites(item)


def place(d, x, y, w, h):
    """top-left placement inside the parent, y down"""
    d["Transform"] = {"anchorMin": {"x": 0.0, "y": 1.0}, "anchorMax": {"x": 0.0, "y": 1.0},
                      "offsetMin": {"x": float(x), "y": float(-(y + h))}, "offsetMax": {"x": float(x + w), "y": float(-y)}}


def band(d, top, bottom):
    """full-width band of the screen, y from the top"""
    d["Transform"] = {"anchorMin": {"x": 0.0, "y": 1.0}, "anchorMax": {"x": 1.0, "y": 1.0},
                      "offsetMin": {"x": 0.0, "y": float(-bottom)}, "offsetMax": {"x": 0.0, "y": float(-top)}}


def stretch(d):
    d["Transform"] = {"anchorMax": {"x": 1.0, "y": 1.0}, "offsetMax": {"x": 0.0, "y": 0.0}}


def text_value(height, color, font=FONT_HEAVY, halign="Middle", content=""):
    return {"mText": content, "mColor": dict(color), "mFontAssetId": font, "mHeight": height,
            "mSymbolsDistCoef": 1.0, "mLinesDistanceCoef": 1.0, "mVerAlign": "Middle", "mHorAlign": halign}


def sprite_layer(name, path, depth=0.0, enabled=True, layout=None):
    value = {"name": name, "mDrawable": {"Type": "o2::Sprite", "Value": {}}, "mUID": new_id()}
    set_sprite(value["mDrawable"]["Value"], path)
    if depth:
        value["mDepth"] = float(depth)
    if not enabled:
        value["mEnabled"] = False
    if layout:
        value["layout"] = layout
    return {"Type": "o2::WidgetLayer", "Value": value}


def text_layer(name, text, depth, layout=None):
    value = {"name": name, "mDrawable": {"Type": "o2::Text", "Value": text}, "mUID": new_id(), "mDepth": float(depth)}
    if layout:
        value["layout"] = layout
    return {"Type": "o2::WidgetLayer", "Value": value}


def widget(name, depth, type_="o2::Widget", enabled=True):
    d = {"mDrawingDepth": float(depth), "mInheritDrawingDepthFromParent": False, "mName": name,
         "mSceneLayer": {"Type": "o2::SceneLayer", "Value": {"mName": "UI"}}, "Id": new_id(),
         "InternalWidgets": [], "Layers": [], "States": []}
    if not enabled:
        d["mEnabled"] = False
    stretch(d)
    return {"Type": type_, "Data": d}


def image(name, path, depth, enabled=True):
    node = widget(name, depth, "o2::Image", enabled)
    node["Data"]["Layers"] = [sprite_layer("image", path)]
    return node


def label(name, text, depth, enabled=True):
    node = widget(name, depth, "o2::Label", enabled)
    node["Data"]["Layers"] = [text_layer("text", text, 0)]
    return node


def script_instance(node):
    for comp in data(node).get("Components") or []:
        if comp["Type"] == "o2::ScriptableComponent":
            return comp["Data"].setdefault("mInstance", {})
    raise KeyError("script")


def anchored_box(anchor, omin, omax):
    return {"mAnchorMin": {"x": anchor[0], "y": anchor[1]}, "mAnchorMax": {"x": anchor[0], "y": anchor[1]},
            "mOffsetMin": {"x": float(omin[0]), "y": float(omin[1])}, "mOffsetMax": {"x": float(omax[0]), "y": float(omax[1])}}


# ---------------------------------------------------------------- letter tiles

def letter_layout(size, dx=-0.04, dy=0.03):
    return {"mOffsetMin": {"x": round(size * dx, 1), "y": round(size * dy, 1)}, "mOffsetMax": {"x": round(size * dx, 1), "y": round(size * dy, 1)}}


def points_layout(size):
    return anchored_box((1.0, 0.0), (-size * 0.36, size * 0.07), (-size * 0.07, size * 0.33))


def style_letter_layers(layers, size, text_font):
    """letter / points of a tile-like widget of that width"""
    for lay in layers:
        value = lay.get("Value", lay)
        name = value.get("name")
        if name == "letter":
            text = drawable(value)
            text.update({"mFontAssetId": FONT_HEAVY, "mHeight": round(size * 0.62), "mColor": dict(TEXT)})
            value["layout"] = letter_layout(size)
        elif name == "points":
            text = drawable(value)
            text.update({"mFontAssetId": text_font, "mHeight": round(size * 0.27), "mColor": dict(DIGIT), "mHorAlign": "Right"})
            value["layout"] = points_layout(size)


def scale_centred(value, k):
    """centre-anchored layer layout (ice, crate, bonus...) scaled with the tile"""
    lay = value.get("layout")
    if not lay or "mOffsetMin" not in lay:
        return
    amin, amax = lay.get("mAnchorMin", {}), lay.get("mAnchorMax", {})
    if amin.get("x") == 0.5 and amin.get("y") == 0.5 and amax.get("x") == 0.5 and amax.get("y") == 0.5:
        for key in ("mOffsetMin", "mOffsetMax"):
            lay[key] = {"x": round(lay[key]["x"] * k, 1), "y": round(lay[key]["y"] * k, 1)}


def restyle_tile_proto(proto, text_font):
    root = data(proto["mActor"])
    k = TILE / OLD_TILE if abs(root["Transform"]["offsetMax"]["x"] - OLD_TILE / 2) < 0.5 else 1.0
    for lay in root["Layers"]:
        scale_centred(lay["Value"], k)
    style_letter_layers(root["Layers"], TILE, text_font)
    root["Transform"] = {"anchorMin": {"x": 0.5, "y": 0.5}, "anchorMax": {"x": 0.5, "y": 0.5},
                         "offsetMin": {"x": -TILE / 2, "y": -TILE * TILE_ASPECT / 2}, "offsetMax": {"x": TILE / 2, "y": TILE * TILE_ASPECT / 2}}
    return {lay["Value"]["mUID"]: lay["Value"] for lay in root["Layers"]}


def follow_proto_layers(node, proto_layers):
    """instance layers take the prototype's drawable and layout (the instance overrides nothing here)"""
    for lay in data(node).get("Layers") or []:
        proto = proto_layers.get(lay.get("PrototypeLink"))
        if not proto:
            continue
        lay["mDrawable"] = copy.deepcopy(proto["mDrawable"])
        if "layout" in proto:
            lay["layout"] = copy.deepcopy(proto["layout"])


def restyle_slot_proto(proto, size, text_font):
    root = data(proto["mActor"])
    style_letter_layers(root["Layers"], size, text_font)
    return {lay["Value"]["mUID"]: lay["Value"] for lay in root["Layers"]}


# ---------------------------------------------------------------- screen sections

def restyle_hud(hud, text_font):
    band(data(hud), 0, 560)
    data(child(hud, "LevelBox"))["mEnabled"] = False  # the concept shows no level box

    moves = child(hud, "MovesBox")
    x, y, w, h = C.rect(C.MOVES_BOX)
    place(data(moves), x, y, w, h)
    set_sprite(drawable(layer(moves, "image")), NEW + "layer_moves_bg.png")
    caption = child(moves, "Caption")
    place(data(caption), 0, h * 0.13, w, h * 0.2)
    drawable(layer(caption, "text")).update(text_value(round(h * 0.155), TEXT, text_font, content="Ходы:"))
    value = child(moves, "Value")
    place(data(value), 0, h * 0.33, w, h * 0.52)
    drawable(layer(value, "text")).update(text_value(round(h * 0.46), TEXT))

    score = child(hud, "ScorePanel")
    score["Type"] = "o2::Widget"  # the panel itself draws nothing
    top = C.STAR[1]
    sx, sy, sw, sh = C.rect((C.STAR[0], top, C.BAR[2], C.STAR[3]))
    place(data(score), sx, sy, sw, sh)
    data(score)["Layers"] = []
    data(child(score, "Caption"))["mEnabled"] = False

    bar = child(score, "Bar")
    bx, by, bw, bh = C.rect(C.BAR)
    place(data(bar), bx - sx, by - sy, bw, bh)
    set_sprite(drawable(layer(bar, "bar")), NEW + "layer_progress_fill.png")
    track = layer(bar, "track")
    track["mEnabled"] = True
    track["mDepth"] = -1.0
    track["mDrawable"] = {"Type": "o2::Sprite", "Value": {}}
    set_sprite(drawable(track), NEW + "layer_progress_back.png")

    label_ = child(score, "ScoreLabel")
    place(data(label_), bx - sx, by - sy, bw, bh)
    drawable(layer(label_, "text")).update(text_value(round(bh * 0.5), LIGHT, text_font))

    try:
        star = child(score, "Star")
    except KeyError:
        star = image("Star", NEW + "layer_rainbow_star.png", 3)
        data(score)["Children"].append(star)
    tx, ty, tw, th = C.rect(C.STAR)
    place(data(star), tx - sx, ty - sy, tw, th)

    inst = script_instance(hud)
    inst["hudWorldY"] = float(H / 2 - 280)
    inst["barOffsetY"] = 0.0
    inst["barWidth"] = float(bw)
    inst["barMinFill"] = 0.07
    inst["barTipInset"] = 12.0
    inst["scorePrefix"] = "Очки: "


def word_tile(name, depth, text_font):
    size = C.WORD_TILE[0] * C.S
    node = widget(name, depth, enabled=False)
    node["Data"]["Layers"] = [
        sprite_layer("back", NEW + "layer_tile.png"),
        sprite_layer("found", NEW + "layer_tile4.png", 0.5, enabled=False),
        text_layer("letter", text_value(round(size * 0.62), TEXT), 1, letter_layout(size)),
        text_layer("points", text_value(round(size * 0.27), DIGIT, text_font, "Right"), 2, points_layout(size)),
    ]
    return node


def build_tasks(tasks, text_font):
    d = data(tasks)
    band(d, 0, 460)
    d["Children"] = []

    words = widget("Words", 2)
    place(words["Data"], *C.rect(C.WORDS_PANEL))
    panel = image("Panel", NEW + "layer_word_tasks_bg.png", 2)
    words["Data"]["Children"] = [panel]
    for r in range(C.WORD_ROWS):
        for i in range(C.WORD_SLOTS):
            words["Data"]["Children"].append(word_tile("W%d_%d" % (r, i), 3, text_font))
    more = label("More", text_value(30, LIGHT, text_font), 4, enabled=False)
    words["Data"]["Children"].append(more)
    d["Children"].append(words)

    others = widget("Others", 2)
    sx, sy, sw, sh = C.rect(C.STRIP)
    place(others["Data"], sx, sy, sw, sh)
    others["Data"]["Children"] = [image("Back", NEW + "layer_tasks_back.png", 2)]
    icon_size = C.STRIP_ICON * C.S
    for i in range(5):
        item = widget("Item%d" % i, 3, enabled=False)
        icon = widget("Icon", 3)
        icon["Data"]["Layers"] = [
            sprite_layer("back", NEW + "layer_tile.png"),
            sprite_layer("image", OLD + "ui_ice.png", 0.5, enabled=False),
            text_layer("letter", text_value(round(icon_size * 0.62), TEXT), 1, letter_layout(icon_size, 0, 0.02)),
        ]
        count = label("Count", text_value(round(sh * 0.26), TEXT, text_font, "Left"), 3)
        done = image("Done", NEW + "layer_accept_btn.png", 4, enabled=False)
        item["Data"]["Children"] = [icon, count, done]
        others["Data"]["Children"].append(item)
    check = image("AllDone", NEW + "layer_accept_btn.png", 4)
    size = C.STRIP_CHECK * C.S
    place(check["Data"], sw - size - 18, (sh - size * 1.05) / 2, size, size * 1.05)
    others["Data"]["Children"].append(check)
    d["Children"].append(others)

    px, py, pw, ph = C.rect(C.WORDS_PANEL)
    inst = script_instance(tasks)
    inst.clear()
    inst.update({
        "wordTile": round(C.WORD_TILE[0] * C.S, 1),
        "wordPitchX": round(C.WORD_PITCH[0] * C.S, 1),
        "wordPitchY": round(C.WORD_PITCH[1] * C.S, 1),
        "wordOriginX": round(C.WORD_ORIGIN[0] * C.S, 1),
        "wordOriginY": round(C.WORD_ORIGIN[1] * C.S, 1),
        "wordsWidth": round(pw - 2 * C.WORD_ORIGIN[0] * C.S, 1),
        "itemIcon": round(icon_size, 1),
        "itemPitch": round(C.STRIP_ITEM * C.S, 1),
        "itemFirst": round(C.STRIP_FIRST * C.S, 1),
        "checkSize": round(size, 1),
        "checkRight": 18.0,
        "stripHeight": round(sh, 1),
    })


def restyle_word_bar(word_bar, slot_layers):
    top = C.INPUT[1] * C.S - 6
    bottom = C.INPUT[3] * C.S + 6
    band(data(word_bar), top, bottom)
    tray = child(word_bar, "Tray")
    tx, ty, tw, th = C.rect(C.INPUT)
    place(data(tray), tx, ty - top, tw, th)
    for name in ("Message", "GainLabel"):
        drawable(layer(child(tray, name), "text"))["mColor"] = dict(TEXT)
    for i in range(8):
        follow_proto_layers(child(tray, "Slot%d" % i), slot_layers)
    for name, box in (("AcceptBtn", C.ACCEPT), ("ClearBtn", C.CANCEL)):
        node = child(word_bar, name)
        x, y, w, h = C.rect(box)
        place(data(node), x, y - top, w, h)

    inst = script_instance(word_bar)
    inst["trayWorldX"] = round(tx + tw / 2 - W / 2, 1)
    inst["barWorldY"] = round(H / 2 - (ty + th / 2), 1)
    inst["trayWidth"] = round(tw - 44, 1)
    inst["trayCenterX"] = 0.0
    inst["slotSize"] = round(th * 0.72, 1)
    inst["slotGap"] = 4.0
    inst["slotAspect"] = TILE_ASPECT
    inst["tileSize"] = TILE
    inst["tintSprites"] = list(TINTS)


def restyle_board(board, tile_layers):
    x0 = C.BOARD_LEFT * C.S
    y0 = C.BOARD_TOP * C.S
    tile = C.TILE * C.S
    first = (x0 + tile / 2, y0 + tile / 2)
    width, height = C.COLUMNS * CELL, C.ROWS * CELL
    cx = first[0] + (C.COLUMNS - 1) * CELL / 2 - W / 2
    cy = H / 2 - (first[1] + (C.ROWS - 1) * CELL / 2)
    cx = round(cx) if abs(cx) < 1 else round(cx, 1)
    data(board)["Transform"] = {"anchorMin": {"x": 0.5, "y": 0.5}, "anchorMax": {"x": 0.5, "y": 0.5},
                                "offsetMin": {"x": round(cx - width / 2, 1), "y": round(cy - height / 2, 1)},
                                "offsetMax": {"x": round(cx + width / 2, 1), "y": round(cy + height / 2, 1)}}
    for ch in data(board)["Children"]:
        name = data(ch).get("mName", "")
        if name.startswith("CellBack_"):
            data(ch)["mEnabled"] = False
        elif name.startswith("Tile_"):
            follow_proto_layers(ch, tile_layers)
    inst = script_instance(board)
    inst["cellSize"] = CELL
    inst["tileSize"] = TILE
    inst["tileAspect"] = TILE_ASPECT
    inst["boardCenterY"] = round(cy, 1)
    inst["showFrame"] = False
    inst["showCellBacks"] = False
    inst["tintSprites"] = list(TINTS)


def restyle_boosters(boosters, text_font):
    centre_y = C.BOOSTER_Y * C.S
    half = 82
    data(boosters)["Transform"] = {"anchorMax": {"x": 1.0, "y": 0.0},
                                   "offsetMin": {"x": 0.0, "y": round(H - centre_y - half, 1)},
                                   "offsetMax": {"x": 0.0, "y": round(H - centre_y + half, 1)}}
    size = C.BOOSTER_SIZE * C.S
    for index, slot in BOOSTER_SLOT.items():
        booster = child(boosters, "Booster%d" % index)
        x = C.BOOSTER_CENTERS[slot] * C.S - W / 2
        data(booster)["Transform"] = {"offsetMin": {"x": round(x - size / 2, 1), "y": round(-size * 0.55, 1)},
                                      "offsetMax": {"x": round(x + size / 2, 1), "y": round(size * 0.55, 1)}}
    mode = child(boosters, "ModeLabel")
    data(mode)["Transform"] = {"anchorMin": {"x": 0.5, "y": 1.0}, "anchorMax": {"x": 0.5, "y": 1.0},
                               "offsetMin": {"x": -300.0, "y": -6.0}, "offsetMax": {"x": 300.0, "y": 28.0}}
    drawable(layer(mode, "text")).update({"mColor": dict(TEXT), "mHeight": 24})


def restyle_background(root):
    bg = child(root, "BG")
    data(bg)["Transform"]["size"] = {"x": float(W * 2), "y": float(H + 80), "z": 0.0}
    for comp in data(bg)["Components"]:
        if comp["Type"] == "o2::ImageComponent":
            comp["Data"]["mImageAsset"] = {"id": asset_id(OLD + "white.png"), "path": OLD + "white.png"}
            comp["Data"]["mColor"] = {"r": C.BACKGROUND[0], "g": C.BACKGROUND[1], "b": C.BACKGROUND[2], "a": 255}


def restyle_scene_camera():
    """the fitted camera of WordFall.scn takes the new screen size and the background colour"""
    path = ASSETS / "WordFall.scn"
    raw = path.read_text(encoding="utf-8")
    scene = json.loads(raw)
    cameras = []

    def walk(value):
        if isinstance(value, dict):
            if value.get("Type") == "o2::CameraActor":
                cameras.append(value["Value"])
            for item in value.values():
                walk(item)
        elif isinstance(value, list):
            for item in value:
                walk(item)

    walk(scene)
    if not cameras:
        raise RuntimeError("WordFall.scn has no camera")
    for camera in cameras:
        camera["mFixedOrFittedSize"] = {"x": float(W), "y": float(H)}
        camera["fillColor"] = {"r": C.BACKGROUND[0], "g": C.BACKGROUND[1], "b": C.BACKGROUND[2], "a": 255}
    indent = 4 if "\n    " in raw else None
    path.write_text(json.dumps(scene, ensure_ascii="\\u0" in raw, indent=indent), encoding="utf-8")


def dump(path, document, raw):
    path.write_text(json.dumps(document, ensure_ascii="\\u0" in raw, indent=4) + "\n", encoding="utf-8")


def main():
    text_font = asset_id(TEXT_FONT_PATH)

    def load(name):
        path = PROTOS / f"{name}.proto"
        raw = path.read_text(encoding="utf-8")
        return path, json.loads(raw), raw

    tile_path, tile_proto, tile_raw = load("Tile")
    swap_sprites(tile_proto)
    tile_layers = restyle_tile_proto(tile_proto, text_font)
    dump(tile_path, tile_proto, tile_raw)

    slot_path, slot_proto, slot_raw = load("WordSlot")
    swap_sprites(slot_proto)
    slot_layers = restyle_slot_proto(slot_proto, C.rect(C.INPUT)[3] * 0.72, text_font)
    dump(slot_path, slot_proto, slot_raw)

    for name in ("Booster", "IconButton", "FxFlyingLetter"):
        path, proto, raw = load(name)
        swap_sprites(proto)
        dump(path, proto, raw)

    path, doc, raw = load("GameScreen")
    root = doc["mActor"]
    screen = child(root, "Screen")
    data(screen)["Transform"] = {"offsetMin": {"x": -W / 2, "y": -H / 2}, "offsetMax": {"x": W / 2, "y": H / 2}}
    restyle_background(root)
    swap_sprites(doc)
    restyle_hud(child(screen, "Hud"), text_font)
    build_tasks(child(screen, "Tasks"), text_font)
    restyle_word_bar(child(screen, "WordBar"), slot_layers)
    restyle_board(child(screen, "Board"), tile_layers)
    restyle_boosters(child(screen, "Boosters"), text_font)
    for i in range(4):
        follow_proto_layers(child(screen, "Flyer%d" % i), slot_layers)
    dump(path, doc, raw)
    restyle_scene_camera()
    print("restyled", path.relative_to(ROOT), "and the Tile/WordSlot/Booster/IconButton/FxFlyingLetter prototypes")


if __name__ == "__main__":
    main()
