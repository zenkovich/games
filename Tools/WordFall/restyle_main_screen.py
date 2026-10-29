#!/usr/bin/env python3
"""Lays the WordFall main screen out after the HTML layout (Tools/WordFall/CssScreen/game.html, game.css,
play.css) with its graphics as vector images: the SVG sprites build_svg_sprites.py writes into WordFall/Svg
(one image per element of the page, with the shadows outside its box), drawn by o2::VectorSprite layers.
Geometry: Tools/WordFall/main_screen_layout.py (rem of the page times 768/471, the screen is 768x1673);
fonts: the page's - the concept letters (WordFall/concept_font.ttf), Roboto Bold for the tile values,
Roboto Medium for the captions and counters, Roboto Regular with an outline for the progress.

Rewrites GameScreen.proto in place - ids and prototype links kept, the Tasks section (the words panel and
the strip of the other tasks) rebuilt - and the Tile, WordSlot, Booster, IconButton and FxFlyingLetter
prototypes. Rerunning it on its own output gives the same result; afterwards the prototypes are the
source of truth.

    python3 Tools/WordFall/build_svg_sprites.py
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
SVG = "WordFall/Svg/"
SPRITES = json.loads((ROOT / "Tools" / "WordFall" / "svg_sprites.json").read_text())

S = C.S
W, H = C.SCREEN_W, C.SCREEN_H
PT = 92 / 72  # a text height is in points of the font's 92 dpi

INK = {"r": C.INK[0], "g": C.INK[1], "b": C.INK[2], "a": 255}
LIGHT = {"r": C.LIGHT[0], "g": C.LIGHT[1], "b": C.LIGHT[2], "a": 255}
WHITE = {"r": 255, "g": 245, "b": 225, "a": 255}

# board tile colours (the model's tint 0..3) and the doubled tile
TINTS = ["cream", "peach", "peach", "orange"]
DOUBLED = "yellow"
# booster slot of the concept's row -> its image: magnifier, magnifier with a plus, two bulbs, shuffle
BOOSTER_SLOT = {0: 0, 4: 1, 2: 2, 3: 3, 1: 4}
BOOSTER_IMAGES = ["booster_magnifier", "booster_zoom", "booster_bulb", "booster_bulb_yellow", "booster_shuffle"]

random.seed("wordfall-main-screen-svg")


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


def inst_child(node, proto_doc, name):
    """a child of a prototype instance (stored without its name) by the name of the prototype's child"""
    link = data(child(proto_doc["mActor"], name))["Id"]
    for ch in data(node).get("Children") or []:
        if data(ch).get("PrototypeLink") == link:
            return ch
    raise KeyError(name)


PROTO = {}


def layer(node, name):
    for lay in data(node).get("Layers") or []:
        value = lay.get("Value", lay)
        if value.get("name") == name:
            return value
    raise KeyError(name)


def layers_by_link(node, proto_layers):
    """instance layers of a prototype instance by the name of the prototype's layer"""
    out = {}
    for lay in data(node).get("Layers") or []:
        value = lay.get("Value", lay)
        proto = proto_layers.get(value.get("PrototypeLink"))
        if proto:
            out[proto["name"]] = value
    return out


def drawable(value):
    return value["mDrawable"]["Value"]


# ---------------------------------------------------------------- vector images

def tile_name(size, kind):
    return "tile_%s_%s" % (size, kind)


def svg_path(name):
    return SVG + name + ".svg"


def vector(name, color=None):
    path = svg_path(name)
    value = {"mImageAsset": {"id": asset_id(path), "path": path}}
    border = meta(path).get("sliceBorder")
    if border:
        value["mMode"] = "Sliced"
        value["mSlices"] = dict(border)
    if color:
        value["mColor"] = dict(color)
    return {"Type": "o2::VectorSprite", "Value": value}


def image_layout(name):
    """the layer covers the element's box and the shadows outside it"""
    left, top, right, bottom = SPRITES[name]["margins"]
    if not (left or top or right or bottom):
        return None
    return {"mOffsetMin": {"x": round(-left * S, 2), "y": round(-bottom * S, 2)},
            "mOffsetMax": {"x": round(right * S, 2), "y": round(top * S, 2)}}


def set_image(value, name):
    """a layer's drawable becomes the vector image (its tint colour kept)"""
    color = value.get("mDrawable", {}).get("Value", {}).get("mColor")
    value["mDrawable"] = vector(name, color)
    lay = image_layout(name)
    if lay:
        value["layout"] = lay
    else:
        value.pop("layout", None)


def image_layer(name, image, depth=0.0, enabled=True):
    value = {"name": name, "mDrawable": vector(image), "mUID": new_id()}
    lay = image_layout(image)
    if lay:
        value["layout"] = lay
    if depth:
        value["mDepth"] = float(depth)
    if not enabled:
        value["mEnabled"] = False
    return {"Type": "o2::WidgetLayer", "Value": value}


# ---------------------------------------------------------------- text

FONTS = {}


def font(name):
    return FONTS[name]


def text_height(rem):
    return max(1, round(rem * S / PT))


def text_value(rem, color, font_name, halign="Middle", content="", style=None):
    value = {"mText": content, "mColor": dict(color), "mFontAssetId": font(font_name), "mHeight": text_height(rem),
             "mSymbolsDistCoef": 1.0, "mLinesDistanceCoef": 1.0, "mVerAlign": "Middle", "mHorAlign": halign}
    if style:
        value["mFontStyleAsset"] = {"id": asset_id(style), "path": style}
    return value


def text_layer(name, text, depth, layout=None):
    value = {"name": name, "mDrawable": {"Type": "o2::Text", "Value": text}, "mUID": new_id(), "mDepth": float(depth)}
    if layout:
        value["layout"] = layout
    return {"Type": "o2::WidgetLayer", "Value": value}


def set_text(value, text, keep_content=True):
    old = drawable(value)
    content = old.get("mText", "") if keep_content else text.get("mText", "")
    value["mDrawable"] = {"Type": "o2::Text", "Value": dict(text, mText=content)}


# ---------------------------------------------------------------- placement (o2: y up, offsets from anchors)

def place(d, x, y, w, h):
    """top-left placement inside the parent, rem, y down"""
    d["Transform"] = {"anchorMin": {"x": 0.0, "y": 1.0}, "anchorMax": {"x": 0.0, "y": 1.0},
                      "offsetMin": {"x": round(x * S, 2), "y": round(-(y + h) * S, 2)},
                      "offsetMax": {"x": round((x + w) * S, 2), "y": round(-y * S, 2)}}


def place_px(d, x, y, w, h):
    d["Transform"] = {"anchorMin": {"x": 0.0, "y": 1.0}, "anchorMax": {"x": 0.0, "y": 1.0},
                      "offsetMin": {"x": round(x, 2), "y": round(-(y + h), 2)}, "offsetMax": {"x": round(x + w, 2), "y": round(-y, 2)}}


def band(d, top, bottom):
    """full-width band of the screen, rem from the top"""
    d["Transform"] = {"anchorMin": {"x": 0.0, "y": 1.0}, "anchorMax": {"x": 1.0, "y": 1.0},
                      "offsetMin": {"x": 0.0, "y": round(-bottom * S, 2)}, "offsetMax": {"x": 0.0, "y": round(-top * S, 2)}}


def stretch(d):
    d["Transform"] = {"anchorMax": {"x": 1.0, "y": 1.0}, "offsetMax": {"x": 0.0, "y": 0.0}}


def centred(d, w, h):
    d["Transform"] = {"anchorMin": {"x": 0.5, "y": 0.5}, "anchorMax": {"x": 0.5, "y": 0.5},
                      "offsetMin": {"x": round(-w * S / 2, 2), "y": round(-h * S / 2, 2)},
                      "offsetMax": {"x": round(w * S / 2, 2), "y": round(h * S / 2, 2)}}


def box_layout(box_w, box_h, x, y, w, h):
    """a layer at (x, y, w, h) rem inside a box_w x box_h widget, y down"""
    return {"mAnchorMin": {"x": 0.0, "y": 0.0}, "mAnchorMax": {"x": 0.0, "y": 0.0},
            "mOffsetMin": {"x": round(x * S, 2), "y": round((box_h - y - h) * S, 2)},
            "mOffsetMax": {"x": round((x + w) * S, 2), "y": round((box_h - y) * S, 2)}}


def letter_layout(w, h, size, border=1):
    """.tile .letter: the padding box, the text centred in it"""
    return box_layout(w, h, border, border - C.TEXT_RAISE[size], w - 2 * border, h - 2 * border)


def points_layout(w, h, size, border=1):
    """.tile .points: right/bottom of the padding box, a line of its font size"""
    fsize, right, bottom = C.POINTS[size]
    x1 = w - border - right
    y1 = h - border - bottom
    return box_layout(w, h, x1 - 3 * fsize, y1 - fsize, 3 * fsize, fsize)


def widget(name, depth, type_="o2::Widget", enabled=True):
    d = {"mDrawingDepth": float(depth), "mInheritDrawingDepthFromParent": False, "mName": name,
         "mSceneLayer": {"Type": "o2::SceneLayer", "Value": {"mName": "UI"}}, "Id": new_id(),
         "InternalWidgets": [], "Layers": [], "States": []}
    if not enabled:
        d["mEnabled"] = False
    stretch(d)
    return {"Type": type_, "Data": d}


def image(name, img, depth, enabled=True):
    node = widget(name, depth, "o2::Image", enabled)
    node["Data"]["Layers"] = [image_layer("image", img)]
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


def screen_pos(x, y):
    """rem point of the page -> screen coordinates of the game (centre origin, y up)"""
    return round(x * S - W / 2, 2), round(H / 2 - y * S, 2)


# ---------------------------------------------------------------- tiles

def style_tile_layers(layers, size, w, h):
    for lay in layers:
        value = lay.get("Value", lay)
        name = value.get("name")
        if name == "letter":
            set_text(value, text_value(C.LETTER[size], INK, "letter"))
            value["layout"] = letter_layout(w, h, size)
        elif name == "points":
            set_text(value, text_value(C.POINTS[size][0], INK, "bold", "Right"))
            value["layout"] = points_layout(w, h, size)


def restyle_tile_proto(proto):
    root = data(proto["mActor"])
    for lay in root["Layers"]:
        value = lay["Value"]
        if value["name"] in ("back", "pressed"):
            set_image(value, tile_name("board", "cream"))
    style_tile_layers(root["Layers"], "board", C.TILE, C.TILE)
    centred(root, C.TILE, C.TILE)
    return {lay["Value"]["mUID"]: lay["Value"] for lay in root["Layers"]}


def restyle_slot_proto(proto):
    root = data(proto["mActor"])
    w, h = C.WORD_TILE
    for lay in root["Layers"]:
        if lay["Value"]["name"] == "back":
            set_image(lay["Value"], tile_name("small", "cream"))
    style_tile_layers(root["Layers"], "small", w, h)
    centred(root, w, h)
    return {lay["Value"]["mUID"]: lay["Value"] for lay in root["Layers"]}


def restyle_flying_letter_proto(proto):
    """the letter that flies from the tray to the bar: a small tile"""
    root = data(proto["mActor"])
    w, h = C.WORD_TILE
    for lay in root.get("Layers") or []:
        value = lay["Value"]
        if value.get("mDrawable", {}).get("Type") in ("o2::Sprite", "o2::VectorSprite") and value.get("name") in ("back", "tile", None):
            set_image(value, tile_name("small", "cream"))
    style_tile_layers(root.get("Layers") or [], "small", w, h)
    t = root["Transform"]
    cx = (t["offsetMin"]["x"] + t["offsetMax"]["x"]) / 2
    cy = (t["offsetMin"]["y"] + t["offsetMax"]["y"]) / 2
    t["offsetMin"] = {"x": round(cx - w * S / 2, 2), "y": round(cy - h * S / 2, 2)}
    t["offsetMax"] = {"x": round(cx + w * S / 2, 2), "y": round(cy + h * S / 2, 2)}


def follow_proto_layers(node, proto_layers):
    """instance layers take the prototype's drawable and layout"""
    for lay in data(node).get("Layers") or []:
        proto = proto_layers.get(lay.get("PrototypeLink"))
        if not proto:
            continue
        lay["mDrawable"] = copy.deepcopy(proto["mDrawable"])
        if "layout" in proto:
            lay["layout"] = copy.deepcopy(proto["layout"])
        else:
            lay.pop("layout", None)


def button_layers(btn_node, proto_layers, img):
    by_name = layers_by_link(btn_node, proto_layers)
    for name, value in by_name.items():
        if name in ("back", "icon", "pressed"):
            set_image(value, img)


# ---------------------------------------------------------------- screen sections

def restyle_hud(hud):
    band(data(hud), 0, C.PROGRESS[1] + C.PROGRESS[3])
    data(child(hud, "LevelBox"))["mEnabled"] = False  # the page shows no level box

    moves = child(hud, "MovesBox")
    place(data(moves), *C.MOVES)
    set_image(layer(moves, "image"), "moves_box")
    caption = child(moves, "Caption")
    place(data(caption), *C.MOVES_CAPTION)
    set_text(layer(caption, "text"), text_value(C.MOVES_CAPTION[3], INK, "medium"))
    value = child(moves, "Value")
    vx, vy, vw, vh = C.MOVES_VALUE
    place(data(value), vx, vy - C.TEXT_RAISE["moves"], vw, vh)
    set_text(layer(value, "text"), text_value(C.MOVES_VALUE[3], INK, "letter"))

    px, py, pw, ph = C.PROGRESS
    score = child(hud, "ScorePanel")
    score["Type"] = "o2::Widget"
    place(data(score), *C.PROGRESS)
    data(score)["Layers"] = []
    data(child(score, "Caption"))["mEnabled"] = False

    # the progress widget is the bar's padding box: the fill fills it, the track with its border lies around
    bx, by, bw, bh = C.BAR
    b = C.BAR_BORDER
    bar = child(score, "Bar")
    place(data(bar), bx + b - px, by + b - py, bw - 2 * b, bh - 2 * b)
    set_image(layer(bar, "bar"), "bar_fill")
    track = layer(bar, "track")
    track["mEnabled"] = True
    track["mDepth"] = -1.0
    track["mDrawable"] = vector("bar_track")
    left, top, right, bottom = SPRITES["bar_track"]["margins"]
    track["layout"] = {"mOffsetMin": {"x": round(-(b + left) * S, 2), "y": round(-(b + bottom) * S, 2)},
                       "mOffsetMax": {"x": round((b + right) * S, 2), "y": round((b + top) * S, 2)}}

    score_label = child(score, "ScoreLabel")
    place(data(score_label), bx + b - px, by + b - py, bw - 2 * b, bh - 2 * b)
    set_text(layer(score_label, "text"), text_value(C.BAR_TEXT, LIGHT, "regular", style="WordFall/bar_text.fntstyle"))

    try:
        star = child(score, "Star")
    except KeyError:
        star = image("Star", "star", 3)
        data(score)["Children"].append(star)
    place(data(star), C.STAR[0] - px, C.STAR[1] - py, C.STAR[2], C.STAR[3])
    set_image(layer(star, "image"), "star")

    inst = script_instance(hud)
    inst["hudWorldY"] = screen_pos(0, by + bh / 2)[1]
    inst["barOffsetY"] = 0.0
    inst["barWidth"] = round((bw - 2 * b) * S, 2)
    inst["barMinFill"] = 0.07
    inst["barTipInset"] = 12.0
    inst["scorePrefix"] = "Очки: "


def word_tile(name, depth):
    w, h = C.WORD_TILE
    node = widget(name, depth, enabled=False)
    node["Data"]["Layers"] = [
        image_layer("back", tile_name("small", "cream")),
        image_layer("found", tile_name("small", "orange"), 0.5, enabled=False),
        image_layer("active", tile_name("small", "active"), 0.6, enabled=False),
        text_layer("letter", text_value(C.LETTER["small"], INK, "letter"), 1, letter_layout(w, h, "small")),
        text_layer("points", text_value(C.POINTS["small"][0], INK, "bold", "Right"), 2, points_layout(w, h, "small")),
    ]
    return node


def build_tasks(tasks):
    random.seed("wordfall-main-screen-svg/tasks")
    d = data(tasks)
    band(d, 0, C.TASK[1] + C.TASK[3] + 4)
    d["Children"] = []

    words = widget("Words", 2)
    place(words["Data"], *C.WORDS)
    words["Data"]["Children"] = [image("Panel", "words_panel", 2)]
    for r in range(4):
        for i in range(8):
            words["Data"]["Children"].append(word_tile("W%d_%d" % (r, i), 3))
    more = label("More", text_value(C.WORD_TILE[1] * 0.5, LIGHT, "medium"), 4, enabled=False)
    words["Data"]["Children"].append(more)
    d["Children"].append(words)

    others = widget("Others", 2)
    tx, ty, tw, th = C.TASK
    place(others["Data"], *C.TASK)
    others["Data"]["Children"] = [image("Back", "task_panel", 2)]
    for i in range(5):
        item = widget("Item%d" % i, 3, enabled=False)
        icon = widget("Icon", 3)
        t = C.TASK_TILE
        icon["Data"]["Layers"] = [
            image_layer("back", tile_name("medium", "cream")),
            {"Type": "o2::WidgetLayer", "Value": {"name": "image", "mDrawable": {"Type": "o2::Sprite", "Value": {
                "mImageAsset": {"id": asset_id("WordFall/Sprites/ui_ice.png"), "path": "WordFall/Sprites/ui_ice.png"}}},
                "mUID": new_id(), "mDepth": 0.5, "mEnabled": False,
                "layout": {"mAnchorMin": {"x": 0.12, "y": 0.12}, "mAnchorMax": {"x": 0.88, "y": 0.88}}}},
            # the strip shrinks its tiles when the tasks don't fit: the letter follows the tile
            text_layer("letter", text_value(C.LETTER["medium"], INK, "letter"), 1,
                       {"mAnchorMin": {"x": 1 / t, "y": 1 / t}, "mAnchorMax": {"x": 1 - 1 / t, "y": 1 - 1 / t},
                        "mOffsetMin": {"x": 0.0, "y": round(C.TEXT_RAISE["medium"] * S, 2)},
                        "mOffsetMax": {"x": 0.0, "y": round(C.TEXT_RAISE["medium"] * S, 2)}}),
        ]
        count = label("Count", text_value(C.TASK_COUNT[1], INK, "medium", "Left"), 3)
        done = image("Done", "button_task_check", 4, enabled=False)
        item["Data"]["Children"] = [icon, count, done]
        others["Data"]["Children"].append(item)
    slot = image("Slot", "star_slot", 3)
    sx, sy, ss = C.TASK_SLOT_STAR
    star = image("Star", "star_small", 4)
    place(star["Data"], sx, sy, ss, ss)
    slot["Data"]["Children"] = [star]
    others["Data"]["Children"].append(slot)
    others["Data"]["Children"].append(image("AllDone", "button_task_check", 4))
    d["Children"].append(others)

    inst = script_instance(tasks)
    inst.clear()
    inst.update({
        "wordTile": round(C.WORD_TILE[0] * S, 2),
        "wordTileAspect": round(C.WORD_TILE[1] / C.WORD_TILE[0], 4),
        "wordPitchX": round((C.WORD_TILE[0] + C.WORD_GAP) * S, 2),
        "wordPitchY": round((C.WORD_TILE[1] + C.WORD_GAP) * S, 2),
        "wordOriginX": round(C.WORDS_INSET * S, 2),
        "wordOriginY": round(C.WORDS_INSET * S, 2),
        "wordsWidth": round((C.WORDS[2] - 2 * C.WORDS_INSET) * S, 2),
        "itemIcon": round(C.TASK_TILE * S, 2),
        "itemCount": round(C.TASK_COUNT[0] * S, 2),
        "itemGap": round(C.TASK_GAP * S, 2),
        "itemFirst": round(C.TASK_PAD * S, 2),
        "slotSize": [round(C.TASK_SLOT[0] * S, 2), round(C.TASK_SLOT[1] * S, 2)],
        "checkSize": [round(C.TASK_CHECK[0] * S, 2), round(C.TASK_CHECK[1] * S, 2)],
        "stripWidth": round(tw * S, 2),
        "stripHeight": round(th * S, 2),
        "countRaise": round(C.TEXT_RAISE["count"] * S, 2),
    })


def restyle_word_bar(word_bar, slot_layers, button_proto_layers):
    fx, fy, fw, fh = C.FIELD
    top, bottom = fy - 6, fy + fh + 6
    band(data(word_bar), top, bottom)
    tray = child(word_bar, "Tray")
    place(data(tray), fx, fy - top, fw, fh)
    set_image(layer(tray, "image"), "input_field")
    for name in ("Message", "GainLabel"):
        text = drawable(layer(child(tray, name), "text"))
        text["mColor"] = dict(INK)
        text["mFontAssetId"] = font("medium")
    for i in range(8):
        follow_proto_layers(child(tray, "Slot%d" % i), slot_layers)
    for name, box, img in (("AcceptBtn", C.ACCEPT, "button_check"), ("ClearBtn", C.CANCEL, "button_cross")):
        node = child(word_bar, name)
        x, y, w, h = box
        place(data(node), x, y - top, w, h)
        button_layers(inst_child(node, PROTO["IconButton"], "Btn"), button_proto_layers, img)

    inst = script_instance(word_bar)
    inst["trayWorldX"] = screen_pos(fx + fw / 2, 0)[0]
    inst["barWorldY"] = screen_pos(0, fy + fh / 2)[1]
    inst["trayWidth"] = round(C.TRAY_INNER * S, 2)
    inst["trayCenterX"] = 0.0
    inst["slotSize"] = round(C.WORD_TILE[0] * S, 2)
    inst["slotGap"] = round((C.TRAY_SLOT_STEP - C.WORD_TILE[0]) * S, 2)
    inst["slotAspect"] = round(C.WORD_TILE[1] / C.WORD_TILE[0], 4)
    inst["tileSize"] = round(C.TILE * S, 2)
    inst["tintSprites"] = [svg_path(tile_name("small", t)) for t in TINTS]
    inst["doubledSprite"] = svg_path(tile_name("small", DOUBLED))


def restyle_board(board, tile_layers):
    x0, y0 = C.BOARD
    pitch_x, pitch_y = C.PITCH
    width = (C.COLUMNS - 1) * pitch_x + C.TILE
    height = (C.ROWS - 1) * pitch_y + C.TILE
    cx, cy = screen_pos(x0 + width / 2, y0 + height / 2)
    data(board)["Transform"] = {"anchorMin": {"x": 0.5, "y": 0.5}, "anchorMax": {"x": 0.5, "y": 0.5},
                                "offsetMin": {"x": round(cx - width * S / 2, 2), "y": round(cy - height * S / 2, 2)},
                                "offsetMax": {"x": round(cx + width * S / 2, 2), "y": round(cy + height * S / 2, 2)}}
    for ch in data(board)["Children"]:
        name = data(ch).get("mName", "")
        if name.startswith("CellBack_"):
            data(ch)["mEnabled"] = False
        elif name.startswith("Tile_"):
            follow_proto_layers(ch, tile_layers)
    inst = script_instance(board)
    inst["cellSize"] = round(pitch_y * S, 3)
    inst["cellSizeX"] = round(pitch_x * S, 3)
    inst["tileSize"] = round(C.TILE * S, 2)
    inst["tileAspect"] = 1.0
    inst["boardCenterY"] = cy
    inst["showFrame"] = False
    inst["showCellBacks"] = False
    inst["tintSprites"] = [svg_path(tile_name("board", t)) for t in TINTS]
    inst["doubledSprite"] = svg_path(tile_name("board", DOUBLED))


def restyle_boosters(boosters, booster_proto_layers):
    centre_y = C.BOOSTER_TOP + C.BOOSTER / 2
    half = C.BOOSTER / 2 + 8
    data(boosters)["Transform"] = {"anchorMax": {"x": 1.0, "y": 0.0},
                                   "offsetMin": {"x": 0.0, "y": round((C.CONCEPT_H - centre_y - half) * S, 2)},
                                   "offsetMax": {"x": 0.0, "y": round((C.CONCEPT_H - centre_y + half) * S, 2)}}
    size = C.BOOSTER
    for index, slot in BOOSTER_SLOT.items():
        booster = child(boosters, "Booster%d" % index)
        x = (C.BOOSTER_LEFTS[slot] + size / 2) * S - W / 2
        data(booster)["Transform"] = {"offsetMin": {"x": round(x - size * S / 2, 2), "y": round(-size * S / 2, 2)},
                                      "offsetMax": {"x": round(x + size * S / 2, 2), "y": round(size * S / 2, 2)}}
        button_layers(inst_child(booster, PROTO["Booster"], "Btn"), booster_proto_layers, BOOSTER_IMAGES[slot])
        bx, by, bw, bh = C.BADGE
        for name in ("Badge", "Charge"):
            node = inst_child(booster, PROTO["Booster"], name)
            data(node)["Transform"] = {"anchorMin": {"x": 1.0, "y": 1.0}, "anchorMax": {"x": 1.0, "y": 1.0},
                                       "offsetMin": {"x": round((bx - size) * S, 2), "y": round(-(by + bh) * S, 2)},
                                       "offsetMax": {"x": round((bx + bw - size) * S, 2), "y": round(-by * S, 2)}}
        badge = inst_child(booster, PROTO["Booster"], "Badge")
        for lay in data(badge).get("Layers") or []:
            set_image(lay.get("Value", lay), "charge_badge")
        charge = inst_child(booster, PROTO["Booster"], "Charge")
        for lay in data(charge).get("Layers") or []:
            value = lay.get("Value", lay)
            if value.get("mDrawable", {}).get("Type") == "o2::Text":
                text = drawable(value)
                text.update({"mFontAssetId": font("medium"), "mHeight": text_height(12), "mColor": dict(INK)})
    mode = child(boosters, "ModeLabel")
    band_top = centre_y - half
    data(mode)["Transform"] = {"anchorMin": {"x": 0.5, "y": 1.0}, "anchorMax": {"x": 0.5, "y": 1.0},
                               "offsetMin": {"x": -300.0, "y": round((band_top - C.MODE_TOP - 16) * S, 2)},
                               "offsetMax": {"x": 300.0, "y": round((band_top - C.MODE_TOP) * S, 2)}}
    text = drawable(layer(mode, "text"))
    text.update({"mColor": dict(INK), "mHeight": text_height(14), "mFontAssetId": font("medium")})


def restyle_background(root, screen):
    bg = child(root, "BG")
    data(bg)["Transform"]["size"] = {"x": float(W * 2), "y": float(H + 80), "z": 0.0}
    for comp in data(bg)["Components"]:
        if comp["Type"] == "o2::ImageComponent":
            comp["Data"]["mImageAsset"] = {"id": asset_id("WordFall/Sprites/white.png"), "path": "WordFall/Sprites/white.png"}
            comp["Data"]["mColor"] = {"r": C.PAPER[0], "g": C.PAPER[1], "b": C.PAPER[2], "a": 255}
    # .screen: the paper with its frame under everything of the screen
    children = data(screen)["Children"]
    try:
        frame = child(screen, "Frame")
    except KeyError:
        random.seed("wordfall-main-screen-svg/frame")
        frame = image("Frame", "screen", 0.5)
        children.insert(0, frame)
    stretch(data(frame))
    data(frame)["mDrawingDepth"] = 0.5
    set_image(layer(frame, "image"), "screen")


def restyle_scene_camera():
    """the fitted camera of WordFall.scn takes the screen size and the paper colour"""
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
        camera["fillColor"] = {"r": C.PAPER[0], "g": C.PAPER[1], "b": C.PAPER[2], "a": 255}
    indent = 4 if "\n    " in raw else None
    path.write_text(json.dumps(scene, ensure_ascii="\\u0" in raw, indent=indent), encoding="utf-8")


def dump(path, document, raw):
    path.write_text(json.dumps(document, ensure_ascii="\\u0" in raw, indent=4) + "\n", encoding="utf-8")


def main():
    FONTS.update({"letter": asset_id("WordFall/concept_font.ttf"), "bold": asset_id("WordFall/roboto_bold.ttf"),
                  "medium": asset_id("WordFall/roboto_medium.ttf"), "regular": asset_id("WordFall/roboto_regular.ttf")})

    def load(name):
        path = PROTOS / f"{name}.proto"
        raw = path.read_text(encoding="utf-8")
        return path, json.loads(raw), raw

    def proto_layers(doc, child_name=None):
        root = doc["mActor"]
        node = child(root, child_name) if child_name else root
        return {lay["Value"]["mUID"]: lay["Value"] for lay in data(node).get("Layers") or []}

    tile_path, tile_proto, tile_raw = load("Tile")
    tile_layers = restyle_tile_proto(tile_proto)
    dump(tile_path, tile_proto, tile_raw)

    slot_path, slot_proto, slot_raw = load("WordSlot")
    slot_layers = restyle_slot_proto(slot_proto)
    dump(slot_path, slot_proto, slot_raw)

    path, proto, raw = load("FxFlyingLetter")
    restyle_flying_letter_proto(proto)
    dump(path, proto, raw)
    flying_layers = proto_layers(proto)
    flying_transform = data(proto["mActor"])["Transform"]

    path, booster_proto, raw = load("Booster")
    PROTO["Booster"] = booster_proto
    for value in proto_layers(booster_proto, "Btn").values():
        set_image(value, "booster_magnifier")
    for name in ("Badge",):
        for lay in data(child(booster_proto["mActor"], name)).get("Layers") or []:
            set_image(lay["Value"], "charge_badge")
    dump(path, booster_proto, raw)
    booster_layers = proto_layers(booster_proto, "Btn")

    path, button_proto, raw = load("IconButton")
    PROTO["IconButton"] = button_proto
    for value in proto_layers(button_proto, "Btn").values():
        set_image(value, "button_check")
    dump(path, button_proto, raw)
    button_proto_layers = proto_layers(button_proto, "Btn")

    path, doc, raw = load("GameScreen")
    root = doc["mActor"]
    screen = child(root, "Screen")
    data(screen)["Transform"] = {"offsetMin": {"x": -W / 2, "y": -H / 2}, "offsetMax": {"x": W / 2, "y": H / 2}}
    restyle_background(root, screen)
    restyle_hud(child(screen, "Hud"))
    build_tasks(child(screen, "Tasks"))
    restyle_word_bar(child(screen, "WordBar"), slot_layers, button_proto_layers)
    restyle_board(child(screen, "Board"), tile_layers)
    restyle_boosters(child(screen, "Boosters"), booster_layers)
    for i in range(4):
        follow_proto_layers(child(screen, "Flyer%d" % i), slot_layers)
    for letter in data(child(screen, "Fx"))["Children"]:
        if data(letter).get("mName", "").startswith("FxLetter"):
            follow_proto_layers(letter, flying_layers)
            t = data(letter).setdefault("Transform", {})
            for key in ("offsetMin", "offsetMax"):
                t[key] = dict(flying_transform[key])
    dump(path, doc, raw)
    restyle_scene_camera()
    print("restyled", path.relative_to(ROOT), "and the Tile/WordSlot/Booster/IconButton/FxFlyingLetter prototypes")


if __name__ == "__main__":
    main()
