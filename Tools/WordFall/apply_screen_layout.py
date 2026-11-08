#!/usr/bin/env python3
"""Moves the WordFall main screen onto the layout of the "Wordfall main" pipeline: Generated/UI/Screen.proto
(868x1813, its raster sprites and Roboto fonts in Generated/UI/Screen_Resources).

Geometry and art come from Screen.proto: the words panel and the moves box on top, the objectives
(plaques 2x2) under them, the progress row with the star, the board panel with the cells drawn in it, the
row of boosters. The game keeps its own widgets and scripts: GameScreen.proto is rewritten in place (ids
and prototype links kept), and so are the Tile, WordSlot, Booster and FxFlyingLetter prototypes.

The game stacks the sections tighter than the layout (compact): the words block a bit smaller, short gaps,
a permanent row of the word tray between the progress and the board, the board right over smaller boosters.
The board panel gets a bottom frame as thin as its other sides (WordFall/ScreenUI/board_panel.png, cut from
the layout sprite), the background is flat, of the reference's colour.

The sprites of Screen_Resources/Sprites are packed into the atlas Screen_Resources/ScreenUI.atlas: every
image meta gets its atlasId. The scene camera fits the layout size.

    python3 Tools/WordFall/apply_screen_layout.py

Rerunning it on its own output gives the same result; afterwards the prototypes are the source of truth.
"""
import copy
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "Assets"
PROTOS = ASSETS / "WordFall" / "Prototypes"
LAYOUT = ASSETS / "Generated" / "UI" / "Screen.proto"
RES = "Generated/UI/Screen_Resources/"
SPRITES = RES + "Sprites/"
ATLAS = RES + "ScreenUI.atlas"
DERIVED = "WordFall/ScreenUI/"
BOARD_PANEL = DERIVED + "board_panel.png"

WHITE = {"r": 255, "g": 255, "b": 255, "a": 255}  # a text without its colour: the font style paints it
PAPER = {"r": 240, "g": 214, "b": 179, "a": 255}  # the flat background of the reference image
RIDGE = {"r": 150, "g": 106, "b": 72, "a": 255}  # the board panel between its cells

# board tile colours (the model's tint 0..3) and the doubled tile
TINTS = ["icon_tile_cream", "icon_tile_gold", "icon_tile_gold", "icon_tile_orange"]
DOUBLED = "icon_tile_yellow"
# booster (index of the model) -> button of the toolbar
BOOSTER_BUTTONS = {0: "search", 4: "search_plus", 2: "hint_blue", 3: "hint_gold", 1: "shuffle"}

SLOT = 72          # tile of the word tray and of the letters flying to the bar
OBJECTIVES = 6     # plaques in the pool: up to five tasks and the score

MARGIN = 14            # the screen top to the words block
WORDS_SCALE = 0.92     # the words block and the moves box
BUTTONS_SCALE = 0.82   # the boosters
TRAY_HEIGHT = 96
TRAY_BUTTON = 92
GAPS = {"objectives": 12, "progress": 8, "tray": 8, "board": 10, "toolbar": 10}  # above each section

random.seed("wordfall-screen-layout")


def new_id():
    return random.getrandbits(63) | 1


def meta(path):
    return json.loads((ASSETS / (path + ".meta")).read_text())["Value"]


def asset_id(path):
    return meta(path)["mId"]


def data(node):
    return node["Data"] if "Data" in node else node["Value"]


def name_of(node):
    return data(node).get("mName", "")


def child(node, name):
    for ch in data(node).get("Children") or []:
        if name_of(ch) == name:
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


# ---------------------------------------------------------------- layout source

class Layout:
    """world rects (centre origin, y up) of the nodes of Screen.proto by their path of names"""

    def __init__(self):
        doc = json.loads(LAYOUT.read_text(encoding="utf-8"))
        self.rects = {}
        self.nodes = {}
        self.scales = {}
        self._walk(doc["mActor"], (0.0, 0.0, 0.0, 0.0), "")

    def _walk(self, node, parent, path):
        d = data(node)
        t = d.get("Transform") or {}
        amin, amax = t.get("anchorMin", {}), t.get("anchorMax", {})
        omin, omax = t.get("offsetMin", {}), t.get("offsetMax", {})
        left, bottom, right, top = parent
        w, h = right - left, top - bottom
        rect = (left + amin.get("x", 0.0) * w + omin.get("x", 0.0), bottom + amin.get("y", 0.0) * h + omin.get("y", 0.0),
                left + amax.get("x", 0.0) * w + omax.get("x", 0.0), bottom + amax.get("y", 0.0) * h + omax.get("y", 0.0))
        self.rects[path] = rect
        self.nodes[path] = node
        for ch in d.get("Children") or []:
            self._walk(ch, rect, (path + "/" if path else "") + name_of(ch))

    def rect(self, path):
        return self.rects[path]

    def text(self, path):
        text = dict(drawable(layer(self.nodes[path], "text")))
        text["mHeight"] = max(1, round(text["mHeight"] * self.scale(path)))
        return text

    def scale(self, path):
        return self.scales.get(path, 1.0)

    def fit(self, prefix, k=1.0, pivot=(0.0, 0.0), dx=0.0, dy=0.0):
        """the node and its subtree scaled by k about the pivot, then shifted"""
        for path, r in self.rects.items():
            if path == prefix or path.startswith(prefix + "/"):
                self.rects[path] = (pivot[0] + (r[0] - pivot[0]) * k + dx, pivot[1] + (r[1] - pivot[1]) * k + dy,
                                    pivot[0] + (r[2] - pivot[0]) * k + dx, pivot[1] + (r[3] - pivot[1]) * k + dy)
                self.scales[path] = self.scale(path) * k

    def screen(self):
        return self.rects[""]


def width(r):
    return r[2] - r[0]


def height(r):
    return r[3] - r[1]


def centre(r):
    return ((r[0] + r[2]) / 2, (r[1] + r[3]) / 2)


def grow(r, dx, dy):
    return (r[0] - dx, r[1] - dy, r[2] + dx, r[3] + dy)


def union(*rects):
    return (min(r[0] for r in rects), min(r[1] for r in rects), max(r[2] for r in rects), max(r[3] for r in rects))


def rnd(v):
    return round(v, 2)


# ---------------------------------------------------------------- the game's arrangement of the layout (y up)

def compact(L):
    """sections of the layout stacked top-down with short gaps; adds the rect "tray" and the board's frame cut"""
    screen = L.screen()
    k = WORDS_SCALE

    board, first, last = L.rect("board"), L.rect("letters/r0c0"), L.rect("letters/r7c6")
    L.board_cut = round((last[1] - board[1]) - (board[3] - first[3]))

    words = L.rect("word_board")
    moves = L.rect("moves")
    pivot = (words[0], words[3])
    dy = screen[3] - MARGIN - words[3]
    L.fit("word_board", k, pivot, 0, dy)
    L.fit("words", k, pivot, 0, dy)
    L.fit("moves", k, (moves[2], words[3]), 0, dy)
    # the moves box takes the width the words panel gave up, its texts stay in its middle
    gap = moves[0] - words[2]
    old = L.rect("moves")
    left = L.rect("word_board")[2] + gap
    L.fit("moves", 1.0, (0, 0), (left - old[0]) / 2, 0)
    m = L.rect("moves")
    L.rects["moves"] = (left, m[1], old[2], m[3])
    bottom = min(L.rect("word_board")[1], L.rect("moves")[1])

    def put(prefixes, top, rect):
        for prefix in prefixes:
            L.fit(prefix, 1.0, (0, 0), 0, top - rect[3])

    put(["objectives"], bottom - GAPS["objectives"], L.rect("objectives"))
    bottom = L.rect("objectives")[1]
    put(["star", "progress"], bottom - GAPS["progress"], union(L.rect("star"), L.rect("progress")))
    row = union(L.rect("star"), L.rect("progress"))
    top = row[1] - GAPS["tray"]
    L.rects["tray"] = (row[0], top - TRAY_HEIGHT, row[2], top)
    put(["board", "letters"], L.rect("tray")[1] - GAPS["board"], L.rect("board"))
    b = L.rect("board")
    L.rects["board"] = (b[0], b[1] + L.board_cut, b[2], b[3])

    buttons = [p for p in L.rects if p.startswith("toolbar/") and p.count("/") == 1]
    for path in buttons:
        L.fit(path, BUTTONS_SCALE, centre(L.rect(path)))
    L.rects["toolbar"] = union(*[L.rect(p) for p in buttons])
    put(["toolbar"], L.rect("board")[1] - GAPS["toolbar"], L.rect("toolbar"))
    margin = L.rect("toolbar")[1] - screen[1]
    if margin < 8:
        raise RuntimeError("the sections overflow the screen by %.1f" % (8 - margin))
    return margin


def tray_parts(L):
    """the tray row: the field of the word's tiles, accept and clear at its right"""
    row = L.rect("tray")
    gap = 10.0
    clear = (row[2] - TRAY_BUTTON, row[1], row[2], row[3])
    accept = (clear[0] - gap - TRAY_BUTTON, row[1], clear[0] - gap, row[3])
    field = (row[0], row[1], accept[0] - gap, row[3])
    return field, accept, clear


def make_board_panel(L):
    """the layout's board panel with the bottom frame as thin as the top one: its bottom edge (corners
    included) moves up by the difference and lies under the last row of tiles"""
    from PIL import Image
    source = Image.open(ASSETS / SPRITES / "panel_board_large.png").convert("RGBA")
    w, h = source.size
    cut = L.board_cut
    edge = 19  # the bottom edge under the last row of cells: the gradient and the rounded corners
    out = Image.new("RGBA", (w, h - cut))
    out.paste(source.crop((0, 0, w, h - cut)), (0, 0))
    bottom = source.crop((0, h - edge, w, h))
    blend = 4  # rows where the edge fades in over the cells it covers
    under = out.crop((0, h - cut - edge, w, h - cut - edge + blend))
    out.paste(bottom, (0, h - cut - edge))
    for i in range(blend):
        a = (i + 1) / (blend + 1)
        row = Image.blend(under.crop((0, i, w, i + 1)), bottom.crop((0, i, w, i + 1)), a)
        out.paste(row, (0, h - cut - edge + i))
    path = ASSETS / BOARD_PANEL
    path.parent.mkdir(parents=True, exist_ok=True)
    folder_meta = Path(str(path.parent) + ".meta")
    if not folder_meta.exists():
        folder_meta.write_text(json.dumps({"Type": "o2::DefaultAssetMeta<o2::FolderAsset>",
                                           "Value": {"mId": "%032x" % random.getrandbits(128)}}, indent=4) + "\n")
    out.save(path)
    meta_path = Path(str(path) + ".meta")
    if not meta_path.exists():
        border = meta(SPRITES + "panel_board_large.png").get("sliceBorder")
        value = {"mId": "%032x" % random.getrandbits(128)}
        if border:
            value.update({"sliceBorder": dict(border), "defaultMode": "Sliced"})
        meta_path.write_text(json.dumps({"Type": "o2::ImageAsset::Meta", "Value": value}, indent=4) + "\n")
    return out.size


# ---------------------------------------------------------------- placement (o2: y up, offsets from anchors)

def place(d, rect, parent):
    """the widget at a world rect, anchored to the bottom-left corner of its parent's world rect"""
    d["Transform"] = {"anchorMin": {"x": 0.0, "y": 0.0}, "anchorMax": {"x": 0.0, "y": 0.0},
                      "offsetMin": {"x": rnd(rect[0] - parent[0]), "y": rnd(rect[1] - parent[1])},
                      "offsetMax": {"x": rnd(rect[2] - parent[0]), "y": rnd(rect[3] - parent[1])}}


def stretch(d):
    d["Transform"] = {"anchorMax": {"x": 1.0, "y": 1.0}, "offsetMax": {"x": 0.0, "y": 0.0}}


def centred(d, w, h, cx=0.0, cy=0.0):
    d["Transform"] = {"anchorMin": {"x": 0.5, "y": 0.5}, "anchorMax": {"x": 0.5, "y": 0.5},
                      "offsetMin": {"x": rnd(cx - w / 2), "y": rnd(cy - h / 2)},
                      "offsetMax": {"x": rnd(cx + w / 2), "y": rnd(cy + h / 2)}}


def layer_box(rect, box):
    """a layer at a world rect inside a widget at the world rect box, by fractions of the box"""
    w, h = width(box), height(box)
    return {"mAnchorMin": {"x": round((rect[0] - box[0]) / w, 4), "y": round((rect[1] - box[1]) / h, 4)},
            "mAnchorMax": {"x": round((rect[2] - box[0]) / w, 4), "y": round((rect[3] - box[1]) / h, 4)}}


# ---------------------------------------------------------------- drawables

def sprite(name, color=None):
    path = name if name.endswith(".png") else SPRITES + name + ".png"
    value = {"mImageAsset": {"id": asset_id(path), "path": path}}
    m = meta(path)
    if m.get("defaultMode") == "Sliced" and m.get("sliceBorder"):
        value["mMode"] = "Sliced"
        value["mSlices"] = dict(m["sliceBorder"])
    if color:
        value["mColor"] = dict(color)
    return {"Type": "o2::Sprite", "Value": value}


def set_sprite(value, name, keep_color=True):
    color = value.get("mDrawable", {}).get("Value", {}).get("mColor") if keep_color else None
    value["mDrawable"] = sprite(name, color)
    value.pop("layout", None)


def image_layer(name, img, depth=0.0, enabled=True, layout=None, color=None):
    value = {"name": name, "mDrawable": sprite(img, color), "mUID": new_id()}
    if depth:
        value["mDepth"] = float(depth)
    if not enabled:
        value["mEnabled"] = False
    if layout:
        value["layout"] = layout
    return {"Type": "o2::WidgetLayer", "Value": value}


FONTS = {}


def text_value(source, content=None, **overrides):
    """a text of the layout: its font, height and colour"""
    value = {"mText": source.get("mText", "") if content is None else content, "mColor": dict(source.get("mColor", WHITE)),
             "mFontAssetId": source["mFontAssetId"], "mHeight": source["mHeight"],
             "mSymbolsDistCoef": 1.0, "mLinesDistanceCoef": 1.0, "mVerAlign": "Middle",
             "mHorAlign": source.get("mHorAlign", "Left")}
    if source.get("mFontStyleAsset"):
        value["mFontStyleAsset"] = dict(source["mFontStyleAsset"])
    value.update(overrides)
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


def widget(name, depth, type_="o2::Widget", enabled=True):
    d = {"mDrawingDepth": float(depth), "mInheritDrawingDepthFromParent": False, "mName": name,
         "mSceneLayer": {"Type": "o2::SceneLayer", "Value": {"mName": "UI"}}, "Id": new_id(),
         "InternalWidgets": [], "Layers": [], "States": []}
    if not enabled:
        d["mEnabled"] = False
    stretch(d)
    return {"Type": type_, "Data": d}


def image(name, img, depth, enabled=True, color=None):
    node = widget(name, depth, "o2::Image", enabled)
    node["Data"]["Layers"] = [image_layer("image", img, color=color)]
    return node


def label(name, text, depth, enabled=True, wrap=False):
    node = widget(name, depth, "o2::Label", enabled)
    node["Data"]["Layers"] = [text_layer("text", text, 0)]
    if wrap:
        node["Data"]["mHorOverflow"] = "Wrap"
    return node


def script_instance(node):
    for comp in data(node).get("Components") or []:
        if comp["Type"] == "o2::ScriptableComponent":
            return comp["Data"].setdefault("mInstance", {})
    raise KeyError("script")


def follow_proto_layers(node, proto_layers):
    """instance layers take the prototype's layers: drawable, layout, depth; missing ones are added"""
    layers = data(node).setdefault("Layers", [])
    linked = {lay.get("PrototypeLink"): lay for lay in layers}
    out = []
    for uid, proto in proto_layers.items():
        lay = linked.get(uid) or {"mUID": new_id(), "PrototypeLink": uid}
        lay["mDrawable"] = copy.deepcopy(proto["mDrawable"])
        for key in ("layout", "mDepth", "mEnabled", "mTransparency"):
            if key in proto:
                lay[key] = copy.deepcopy(proto[key])
            else:
                lay.pop(key, None)
        out.append(lay)
    data(node)["Layers"] = out


def proto_layers_of(node):
    return {lay["Value"]["mUID"]: lay["Value"] for lay in data(node).get("Layers") or []}


# ---------------------------------------------------------------- tiles

def tile_text_layouts(L, tile_path, size):
    """letter and points of a layout tile, relative to a tile of the given size (fractions of the box)"""
    box = L.rect(tile_path)
    k = size / width(box)
    letter = L.rect(tile_path + "/letter")
    points = L.rect(tile_path + "/points")
    return layer_box(letter, box), layer_box(points, box), k


def style_tile_layers(L, layers, tile_path, size, letter_font=None):
    letter_layout, points_layout, k = tile_text_layouts(L, tile_path, size)
    letter = L.text(tile_path + "/letter")
    points = L.text(tile_path + "/points")
    for lay in layers:
        value = lay.get("Value", lay)
        if value.get("name") == "letter":
            set_text(value, text_value(letter, "", mHeight=max(1, round(letter["mHeight"] * k)), mHorAlign="Middle"))
            value["layout"] = letter_layout
        elif value.get("name") == "points":
            set_text(value, text_value(points, "", mHeight=max(1, round(points["mHeight"] * k)), mHorAlign="Middle"))
            value["layout"] = points_layout


def scale_layer_offsets(value, k):
    lay = value.get("layout")
    if not lay:
        return
    for key in ("mOffsetMin", "mOffsetMax"):
        if key in lay:
            lay[key] = {"x": rnd(lay[key].get("x", 0.0) * k), "y": rnd(lay[key].get("y", 0.0) * k)}


def restyle_tile_proto(L, proto):
    root = data(proto["mActor"])
    size = width(L.rect("letters/r0c0"))
    old = root["Transform"]["offsetMax"]["x"] - root["Transform"]["offsetMin"]["x"]
    k = size / old
    for lay in root["Layers"]:
        value = lay["Value"]
        if value["name"] in ("back", "pressed"):
            set_sprite(value, TINTS[0])
        elif value["name"] not in ("letter", "points"):
            scale_layer_offsets(value, k)
    style_tile_layers(L, root["Layers"], "letters/r0c0", size)
    centred(root, size, size)
    return proto_layers_of(proto["mActor"])


def restyle_slot_proto(L, proto):
    """a tile of the word tray (and the letter flying from the board into it): a board tile, smaller"""
    root = data(proto["mActor"])
    for lay in root["Layers"]:
        if lay["Value"]["name"] == "back":
            set_sprite(lay["Value"], TINTS[0])
    style_tile_layers(L, root["Layers"], "letters/r0c0", SLOT)
    centred(root, SLOT, SLOT)
    return proto_layers_of(proto["mActor"])


def restyle_flying_letter_proto(L, proto):
    """the letter that flies from the tray to the bar"""
    root = data(proto["mActor"])
    for lay in root.get("Layers") or []:
        if lay["Value"].get("name") == "back":
            set_sprite(lay["Value"], TINTS[0])
    style_tile_layers(L, root.get("Layers") or [], "letters/r0c0", SLOT)
    t = root["Transform"]
    cx = (t["offsetMin"]["x"] + t["offsetMax"]["x"]) / 2
    cy = (t["offsetMin"]["y"] + t["offsetMax"]["y"]) / 2
    t["offsetMin"] = {"x": rnd(cx - SLOT / 2), "y": rnd(cy - SLOT / 2)}
    t["offsetMax"] = {"x": rnd(cx + SLOT / 2), "y": rnd(cy + SLOT / 2)}
    return proto_layers_of(proto["mActor"])


def restyle_booster_proto(L, proto):
    """the round button of the toolbar: its base, the icon over it, the press darkening both"""
    btn = child(proto["mActor"], "Btn")
    base = layer(btn, "icon")
    set_sprite(base, "button_blue")
    pressed = layer(btn, "pressed")
    set_sprite(pressed, "button_blue")
    try:
        glyph = layer(btn, "glyph")
    except KeyError:
        glyph = image_layer("glyph", "icon_search")["Value"]
        data(btn)["Layers"].insert(1, {"Type": "o2::WidgetLayer", "Value": glyph})
    glyph["mDrawable"] = sprite("icon_search")
    glyph["mDepth"] = 0.5
    box = L.rect("toolbar/search")
    glyph["layout"] = layer_box(L.rect("toolbar/search/icon"), box)
    centred(data(proto["mActor"]), width(box), height(box))
    return proto_layers_of(btn)


# ---------------------------------------------------------------- screen sections

def restyle_background(root, screen, screen_rect):
    bg = child(root, "BG")
    data(bg)["Transform"]["size"] = {"x": float(width(screen_rect) * 2), "y": float(height(screen_rect) + 120), "z": 0.0}
    for comp in data(bg)["Components"]:
        if comp["Type"] == "o2::ImageComponent":
            path = SPRITES + "white.png"
            comp["Data"]["mImageAsset"] = {"id": asset_id(path), "path": path}
            comp["Data"]["mColor"] = dict(PAPER)
    backdrop = None
    for name in ("Frame", "Backdrop"):
        try:
            backdrop = child(screen, name)
        except KeyError:
            pass
    if backdrop is None:
        backdrop = image("Backdrop", "bg_backdrop", 0.5)
        data(screen)["Children"].insert(0, backdrop)
    data(backdrop)["mName"] = "Backdrop"
    stretch(data(backdrop))
    data(backdrop)["mDrawingDepth"] = 0.5
    set_sprite(layer(backdrop, "image"), "white", keep_color=False)
    layer(backdrop, "image")["mDrawable"]["Value"]["mColor"] = dict(PAPER)


def restyle_hud(L, hud, screen_rect):
    stretch(data(hud))
    data(child(hud, "LevelBox"))["mEnabled"] = False  # the layout shows no level box

    moves = child(hud, "MovesBox")
    moves_rect = L.rect("moves")
    place(data(moves), moves_rect, screen_rect)
    set_sprite(layer(moves, "image"), "panel_parchment_2")
    caption = child(moves, "Caption")
    place(data(caption), L.rect("moves/title"), moves_rect)
    set_text(layer(caption, "text"), text_value(L.text("moves/title")))
    value = child(moves, "Value")
    place(data(value), L.rect("moves/value"), moves_rect)
    set_text(layer(value, "text"), text_value(L.text("moves/value")))

    track_rect = L.rect("progress/track")
    star_rect = L.rect("star")
    row = union(track_rect, star_rect)
    score = child(hud, "ScorePanel")
    place(data(score), row, screen_rect)
    data(score)["Layers"] = []

    # the bar fills its track: the fill sprite runs across the whole track, the track lies under it
    bar = child(score, "Bar")
    place(data(bar), track_rect, row)
    bar_layer = layer(bar, "bar")
    tip = bar_layer.get("Children")
    set_sprite(bar_layer, "icon_progress_fill", keep_color=False)
    bar_layer["mDrawable"]["Value"]["mMode"] = "Sliced"
    bar_layer["mDrawable"]["Value"]["mSlices"] = {"left": 20, "bottom": 20, "right": 20, "top": 20}
    if tip:
        bar_layer["Children"] = tip
    track = layer(bar, "track")
    track["mEnabled"] = True
    track["mDepth"] = -1.0
    track["mDrawable"] = sprite("bar_progress_track")
    track.pop("layout", None)

    score_label = child(score, "ScoreLabel")
    place(data(score_label), track_rect, row)
    set_text(layer(score_label, "text"), text_value(L.text("progress/label"), "", mHorAlign="Middle"))

    try:
        star = child(score, "Star")
    except KeyError:
        star = image("Star", "icon_rainbow_star", 3)
        data(score)["Children"].append(star)
    place(data(star), star_rect, row)
    set_sprite(layer(star, "image"), "icon_rainbow_star", keep_color=False)

    inst = script_instance(hud)
    inst["hudWorldY"] = rnd(centre(track_rect)[1])
    inst["barOffsetY"] = 0.0
    inst["barWidth"] = rnd(width(track_rect))
    inst["barMinFill"] = round(44 / width(track_rect), 3)  # the rounded ends of the fill don't collapse
    inst["barTipInset"] = 12.0
    inst["scorePrefix"] = "Очки: "


def word_tile(L, name, depth, tile_path):
    box = L.rect(tile_path)
    letter = L.text(tile_path + "/letter")
    points = L.text(tile_path + "/points")
    node = widget(name, depth, enabled=False)
    node["Data"]["Layers"] = [
        image_layer("back", "icon_tile_small_cream"),
        image_layer("found", "icon_tile_small_orange", 0.5, enabled=False),
        image_layer("active", "icon_tile_small_blue", 0.6, enabled=False),
        text_layer("letter", text_value(letter, "", mHorAlign="Middle"), 1, layer_box(L.rect(tile_path + "/letter"), box)),
        text_layer("points", text_value(points, "", mHorAlign="Middle"), 2, layer_box(L.rect(tile_path + "/points"), box)),
    ]
    return node


def objective_item(L, index):
    """a plaque of the objectives: base, checkbox, the check over it, the icon (a picture or a letter tile), the caption.
    The view lays the plaques out in a grid and scales their children with the plaque height"""
    plaque = L.rect("objectives/collect")
    item = widget("Item%d" % index, 9, enabled=False)
    base = image("Base", "panel_parchment", 10)
    checkbox = image("Checkbox", "icon_checkbox_empty", 11)
    check = image("Check", "icon_check", 13, enabled=False)
    icon = widget("Icon", 12)
    tile = L.rect("objectives/collect/tile")
    letter = L.text("objectives/collect/letter")
    points = L.text("objectives/collect/points")
    icon["Data"]["Layers"] = [
        image_layer("back", "icon_tile_small_cream_2"),
        image_layer("image", "icon_bonus", 0.5, enabled=False),
        text_layer("letter", text_value(letter, "", mHorAlign="Middle"), 1, layer_box(L.rect("objectives/collect/letter"), tile)),
        text_layer("points", text_value(points, "", mHorAlign="Middle"), 2, layer_box(L.rect("objectives/collect/points"), tile)),
    ]
    caption = label("Label", text_value(L.text("objectives/collect/label"), "", mHorAlign="Left", mWordWrap=True), 12, wrap=True)
    item["Data"]["Children"] = [base, checkbox, check, icon, caption]
    return item


def build_tasks(L, tasks, screen_rect):
    random.seed("wordfall-screen-layout/tasks")
    d = data(tasks)
    stretch(d)
    d["Children"] = []

    words_rect = L.rect("word_board")
    words = widget("Words", 2)
    place(words["Data"], words_rect, screen_rect)
    words["Data"]["Children"] = [image("Panel", "panel_board_small", 2)]
    for r in range(4):
        for i in range(8):
            words["Data"]["Children"].append(word_tile(L, "W%d_%d" % (r, i), 3, "words/puzzle/p"))
    more = label("More", text_value(L.text("words/puzzle/p/letter"), "", mHeight=round(30 * L.scale("words")), mColor={"r": 255, "g": 244, "b": 214, "a": 255},
                                    mHorAlign="Middle"), 4, enabled=False)
    words["Data"]["Children"].append(more)
    d["Children"].append(words)

    objectives_rect = L.rect("objectives")
    objectives = widget("Objectives", 9)
    place(objectives["Data"], objectives_rect, screen_rect)
    objectives["Data"]["Children"] = [objective_item(L, i) for i in range(OBJECTIVES)]
    d["Children"].append(objectives)

    tile0 = L.rect("words/puzzle/p")
    tile1 = L.rect("words/puzzle/u")
    row1 = L.rect("words/brain/b")
    plaque = L.rect("objectives/collect")
    plaques = [L.rect("objectives/" + n) for n in ("collect", "bonus", "find", "score")]

    def local(rect, box):
        """x, y (from the top-left of the box, y down), w, h"""
        return [rnd(rect[0] - box[0]), rnd(box[3] - rect[3]), rnd(width(rect)), rnd(height(rect))]

    one_line = local(L.rect("objectives/collect/label"), plaque)
    two_lines = local(L.rect("objectives/bonus/label"), L.rect("objectives/bonus"))
    top = min(one_line[1], two_lines[1])
    bottom = max(one_line[1] + one_line[3], two_lines[1] + two_lines[3])
    label_box = [min(one_line[0], two_lines[0]), top, rnd(width(plaque) - 8 - min(one_line[0], two_lines[0])), rnd(bottom - top)]

    inst = script_instance(tasks)
    inst.clear()
    inst.update({
        "wordTile": rnd(width(tile0)),
        "wordTileAspect": round(height(tile0) / width(tile0), 4),
        "wordPitchX": rnd(tile1[0] - tile0[0]),
        "wordPitchY": rnd(tile0[1] - row1[1]),
        "wordOriginX": rnd(tile0[0] - words_rect[0]),
        "wordOriginY": rnd(words_rect[3] - tile0[3]),
        "wordsWidth": rnd(max(width(union(*[L.rect(path) for path in L.rects if path.count("/") == 2 and path.startswith("words/" + row + "/")]))
                              for row in ("puzzle", "brain", "logic", "connect"))),
        "plaqueSize": [rnd(width(plaque)), rnd(height(plaque))],
        "plaqueGap": [rnd(plaques[1][0] - plaques[0][2]), rnd(plaques[0][1] - plaques[2][3])],
        "plaqueCheckbox": local(L.rect("objectives/collect/checkbox"), plaque),
        "plaqueCheck": local(L.rect("objectives/collect/check"), plaque),
        "plaqueIcon": local(L.rect("objectives/bonus/icon"), L.rect("objectives/bonus")),
        "plaqueTile": local(L.rect("objectives/collect/tile"), plaque),
        "plaqueLabel": label_box,
        "objectivesSize": [rnd(width(objectives_rect)), rnd(height(objectives_rect))],
    })


def plaque_label(L, node, depth):
    """a short message on a parchment plaque: the label gets the plaque under its text"""
    d = data(node)
    d["mDrawingDepth"] = float(depth)
    d["mEnabled"] = False
    try:
        back = layer(node, "back")
    except KeyError:
        back = image_layer("back", "panel_parchment_2")["Value"]
        d["Layers"].insert(0, {"Type": "o2::WidgetLayer", "Value": back})
    back["mDrawable"] = sprite("panel_parchment_2")
    back["mDepth"] = -1.0
    set_text(layer(node, "text"), text_value(L.text("objectives/collect/label"), "", mHorAlign="Middle"))


def restyle_word_bar(L, word_bar, screen_rect, slot_layers):
    """the tray of the picked word, always on screen between the progress and the board: the field with
    the tiles, accept and clear; a refused word's message covers the progress bar for a moment"""
    row = L.rect("tray")
    place(data(word_bar), row, screen_rect)
    field, accept, clear = tray_parts(L)

    tray = child(word_bar, "Tray")
    place(data(tray), field, row)
    set_sprite(layer(tray, "image"), "panel_board_small")
    message = child(tray, "Message")
    place(data(message), L.rect("progress/track"), field)
    plaque_label(L, message, 30)
    gain = child(tray, "GainLabel")
    set_text(layer(gain, "text"), text_value(L.text("moves/title"), "", mHorAlign="Middle"))
    for i in range(8):
        slot = child(tray, "Slot%d" % i)
        follow_proto_layers(slot, slot_layers)
        centred(data(slot), SLOT, SLOT)
    for name, rect in (("AcceptBtn", accept), ("ClearBtn", clear)):
        place(data(child(word_bar, name)), rect, row)

    inst = script_instance(word_bar)
    for key in ("trayWorldX", "barWorldY", "fadeTime"):
        inst.pop(key, None)
    inst["trayWidth"] = rnd(width(field) - 24)
    inst["trayCenterX"] = 0.0
    inst["slotSize"] = float(SLOT)
    inst["slotGap"] = 6.0
    inst["slotAspect"] = 1.0
    inst["tileSize"] = rnd(width(L.rect("letters/r0c0")))
    inst["tintSprites"] = [SPRITES + t + ".png" for t in TINTS]
    inst["doubledSprite"] = SPRITES + DOUBLED + ".png"


def restyle_board(L, board, screen_rect, tile_layers):
    tiles = union(L.rect("letters/r0c0"), L.rect("letters/r7c6"))
    place(data(board), tiles, screen_rect)
    size = width(L.rect("letters/r0c0"))
    pitch_x = L.rect("letters/r0c1")[0] - L.rect("letters/r0c0")[0]
    pitch_y = L.rect("letters/r0c0")[1] - L.rect("letters/r1c0")[1]
    cx, cy = centre(tiles)

    children = []
    panel = None
    for ch in data(board)["Children"]:
        name = name_of(ch)
        if name.startswith("Frame_"):
            continue  # the shape frame of the old screen: the panel has the cells drawn in it
        if name == "Panel":
            panel = ch
            continue
        if name.startswith("CellBack_") or name.startswith("Hole_"):
            # a hole of the field shape covers its drawn cell with the panel's colour
            c, r = (int(v) for v in name.split("_")[1:])
            d = data(ch)
            d["mName"] = "Hole_%d_%d" % (c, r)
            d["mDrawingDepth"] = 2.0
            d["mEnabled"] = False
            x = (c - 3) * pitch_x
            y = (r - 3.5) * pitch_y
            centred(d, pitch_x - 4, pitch_y - 3, x, y)
            set_sprite(layer(ch, "image"), "white", keep_color=False)
            layer(ch, "image")["mDrawable"]["Value"]["mColor"] = dict(RIDGE)
        elif name.startswith("Tile_"):
            follow_proto_layers(ch, tile_layers)
            c, r = (int(v) for v in name.split("_")[1:])
            centred(data(ch), size, size, (c - 3) * pitch_x, (r - 3.5) * pitch_y)
        children.append(ch)
    if panel is None:
        panel = image("Panel", BOARD_PANEL, 1)
    place(data(panel), L.rect("board"), tiles)
    data(panel)["mDrawingDepth"] = 1.0
    set_sprite(layer(panel, "image"), BOARD_PANEL, keep_color=False)
    data(board)["Children"] = [panel] + children

    inst = script_instance(board)
    inst["cellSize"] = rnd(pitch_y)
    inst["cellSizeX"] = rnd(pitch_x)
    inst["tileSize"] = rnd(size)
    inst["tileAspect"] = 1.0
    inst["boardCenterX"] = rnd(cx)
    inst["boardCenterY"] = rnd(cy)
    inst.pop("showFrame", None)
    inst.pop("showCellBacks", None)
    inst["tintSprites"] = [SPRITES + t + ".png" for t in TINTS]
    inst["doubledSprite"] = SPRITES + DOUBLED + ".png"


def restyle_boosters(L, boosters, screen_rect, booster_layers):
    toolbar = L.rect("toolbar")
    band = grow(toolbar, 0, 8)
    place(data(boosters), band, screen_rect)
    for index, button in BOOSTER_BUTTONS.items():
        booster = child(boosters, "Booster%d" % index)
        rect = L.rect("toolbar/" + button)
        cx, cy = centre(rect)
        bx, by = centre(band)
        centred(data(booster), width(rect), height(rect), cx - bx, cy - by)
        btn = None
        for ch in data(booster)["Children"]:
            if data(ch).get("PrototypeLink") and ch["Type"] == "o2::Button":
                btn = ch
        follow_proto_layers(btn, booster_layers)
        base = L.nodes["toolbar/" + button + "/base"]
        base_image = drawable(layer(base, "image"))["mImageAsset"]["path"].split("/")[-1][:-4]
        icon = L.nodes["toolbar/" + button + "/icon"]
        icon_image = drawable(layer(icon, "image"))["mImageAsset"]["path"].split("/")[-1][:-4]
        names = {lay["PrototypeLink"]: booster_layers[lay["PrototypeLink"]]["name"] for lay in data(btn)["Layers"]}
        for lay in data(btn)["Layers"]:
            name = names[lay["PrototypeLink"]]
            if name in ("icon", "pressed"):
                lay["mDrawable"]["Value"]["mImageAsset"] = sprite(base_image)["Value"]["mImageAsset"]
            elif name == "glyph":
                lay["mDrawable"] = sprite(icon_image)
                lay["layout"] = layer_box(L.rect("toolbar/" + button + "/icon"), rect)
    # the prompt of an aimed booster covers the tray's field while aiming
    mode = child(boosters, "ModeLabel")
    place(data(mode), tray_parts(L)[0], band)
    plaque_label(L, mode, 35)


def restyle_cheats(L, cheats, screen_rect):
    """the language toggle under the moves box"""
    moves = L.rect("moves")
    lang = child(cheats, "LangToggle")
    w, h = 96.0, 56.0
    x = centre(moves)[0]
    top = moves[1] - 18
    rect = (x - w / 2, top - h, x + w / 2, top)
    data(lang)["Transform"] = {"anchorMin": {"x": 1.0, "y": 1.0}, "anchorMax": {"x": 1.0, "y": 1.0},
                               "offsetMin": {"x": rnd(rect[0] - screen_rect[2]), "y": rnd(rect[1] - screen_rect[3])},
                               "offsetMax": {"x": rnd(rect[2] - screen_rect[2]), "y": rnd(rect[3] - screen_rect[3])}}


# ---------------------------------------------------------------- atlas and camera

def used_by_game():
    """texts of the game's prototypes, scene and scripts: a sprite is used when its id or path is in them"""
    files = list(PROTOS.glob("*.proto")) + [ASSETS / "WordFall.scn"] + list((ASSETS / "Scripts" / "WordFall").rglob("*.js"))
    return "\n".join(f.read_text(encoding="utf-8") for f in files)


def pack_atlas():
    """an atlas over the sprites of Screen_Resources/Sprites and the ones cut from them that the game uses:
    the builder packs every image whose meta names it; the unused ones stay out of it"""
    atlas_path = ASSETS / ATLAS
    meta_path = Path(str(atlas_path) + ".meta")
    if meta_path.exists():
        atlas_id = json.loads(meta_path.read_text())["Value"]["mId"]
    else:
        atlas_id = "%032x" % random.getrandbits(128)
        meta_path.write_text(json.dumps({"Type": "o2::AtlasAsset::Meta", "Value": {
            "mId": atlas_id, "common": {"maxSize": {"x": 2048, "y": 1024}, "border": 2}}}, indent=4) + "\n")
    if not atlas_path.exists():
        atlas_path.write_text(json.dumps({"mPages": [], "mImages": []}, indent=4) + "\n")
    used = used_by_game()
    packed = []
    for png in sorted((ASSETS / SPRITES).glob("*.png")) + sorted((ASSETS / DERIVED).glob("*.png")):
        mpath = Path(str(png) + ".meta")
        doc = json.loads(mpath.read_text())
        old = doc["Value"]
        wanted = old["mId"] in used or str(png.relative_to(ASSETS)) in used
        value = {"mId": old["mId"]}
        if wanted:
            value["atlasId"] = atlas_id
            packed.append(png.name)
        value.update({k: v for k, v in old.items() if k not in ("mId", "atlasId")})
        if value != old or list(value) != list(old):
            doc["Value"] = value
            mpath.write_text(json.dumps(doc, indent=4))
    return len(packed)


def fit_scene_camera(screen_rect):
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
        camera["mFixedOrFittedSize"] = {"x": float(width(screen_rect)), "y": float(height(screen_rect))}
        camera["fillColor"] = dict(PAPER)
    indent = 4 if "\n    " in raw else None
    path.write_text(json.dumps(scene, ensure_ascii="\\u0" in raw, indent=indent), encoding="utf-8")


def dump(path, document, raw):
    path.write_text(json.dumps(document, ensure_ascii="\\u0" in raw, indent=4) + "\n", encoding="utf-8")


def main():
    L = Layout()
    screen_rect = L.screen()
    margin = compact(L)
    panel_size = make_board_panel(L)

    def load(name):
        path = PROTOS / f"{name}.proto"
        raw = path.read_text(encoding="utf-8")
        return path, json.loads(raw), raw

    path, proto, raw = load("Tile")
    tile_layers = restyle_tile_proto(L, proto)
    dump(path, proto, raw)

    path, proto, raw = load("WordSlot")
    slot_layers = restyle_slot_proto(L, proto)
    dump(path, proto, raw)

    path, proto, raw = load("FxFlyingLetter")
    flying_layers = restyle_flying_letter_proto(L, proto)
    flying_transform = data(proto["mActor"])["Transform"]
    dump(path, proto, raw)

    path, proto, raw = load("Booster")
    booster_layers = restyle_booster_proto(L, proto)
    dump(path, proto, raw)

    path, doc, raw = load("GameScreen")
    root = doc["mActor"]
    screen = child(root, "Screen")
    data(screen)["Transform"] = {"offsetMin": {"x": screen_rect[0], "y": screen_rect[1]},
                                 "offsetMax": {"x": screen_rect[2], "y": screen_rect[3]}}
    restyle_background(root, screen, screen_rect)
    restyle_hud(L, child(screen, "Hud"), screen_rect)
    build_tasks(L, child(screen, "Tasks"), screen_rect)
    restyle_word_bar(L, child(screen, "WordBar"), screen_rect, slot_layers)
    restyle_board(L, child(screen, "Board"), screen_rect, tile_layers)
    restyle_boosters(L, child(screen, "Boosters"), screen_rect, booster_layers)
    restyle_cheats(L, child(screen, "Cheats"), screen_rect)
    for i in range(4):
        follow_proto_layers(child(screen, "Flyer%d" % i), slot_layers)
    for letter in data(child(screen, "Fx"))["Children"]:
        if name_of(letter).startswith("FxLetter"):
            follow_proto_layers(letter, flying_layers)
            t = data(letter).setdefault("Transform", {})
            for key in ("offsetMin", "offsetMax"):
                t[key] = dict(flying_transform[key])
    dump(path, doc, raw)
    fit_scene_camera(screen_rect)
    images = pack_atlas()
    print("applied", LAYOUT.relative_to(ROOT), "to", path.relative_to(ROOT), "and the Tile/WordSlot/FxFlyingLetter/Booster prototypes;",
          images, "images in", ATLAS, "; board panel %dx%d, bottom margin %.1f" % (panel_size[0], panel_size[1], margin))


if __name__ == "__main__":
    main()
