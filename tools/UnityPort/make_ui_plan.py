"""Converts captured UI Toolkit layouts (PortCapture dumps) into a widget plan for the o2 prototype builder.

Each prototype is cut from the capture where its view is visible; elements hidden there are taken from
other captures of the same view (by element path). Coordinates become o2 layouts: rectangles relative to
the parent widget, y up. Output: Work/Unity/ui_plan.json, read by the DragonPortBuild suite.
"""
import glob
import json
import os
import re
import sys

from PIL import Image

from port_common import ASSETS, CAPTURE, DC, REPO, load_json

SPRITES = load_json(os.path.join(ASSETS, DC, "Sprites", "sprites.json"))
FONTS = {
    "ChelaOne-Regular SDF": f"{DC}/Fonts/ChelaOne-Regular.ttf",
    "Ander Hedge SDF": f"{DC}/Fonts/AnderHedge.ttf",
}
RT_SUBSTITUTES = {"LevelMeterThumbnail": "baked:LevelMeterThumbnail"}
BAKED = os.path.join(ASSETS, DC, "Sprites", "UI", "Baked")


def round_rect_sprite(radius):
    """White rounded rectangle for nine-slicing, baked once per radius."""
    from port_bake import bake_round_rect
    return bake_round_rect(radius)

# Elements that receive clicks in the original (RegisterCallback<ClickEvent> on non-Button elements)
CLICKABLE_NAMES = {
    "char-data-stats-chartab", "char-data-skills-chartab", "char-data-bio-chartab",
    "shop-gold-shoptab", "shop-gem-shoptab", "shop-potion-shoptab",
    "tabs__inbox-tab", "tabs__deleted-tab",
    "char-skills__icon1", "char-skills__icon2", "char-skills__icon3",
    "level-meter__counter-group", "gear-item__icon", "mailbox__message",
}
CLICKABLE_CLASSES = {"chartab", "shoptab", "mailtab", "gear-item", "mailbox__item", "unity-toggle"}
CLICKABLE_TYPES = {"DropdownField", "Toggle", "SlideToggle", "RadioButtonGroup"}

_size_cache = {}


def image_size(asset):
    if asset not in _size_cache:
        _size_cache[asset] = Image.open(os.path.join(ASSETS, asset)).size
    return _size_cache[asset]


def visible(e):
    return e["s"].get("display") != "None" and not e.get("hidden_by_parent")


def strip_rich(text):
    return re.sub(r"</?[a-zA-Z]+(=[^>]*)?>", "", text or "")


def color(c):
    return [round(float(v), 4) for v in c]


def parse_vec(s):
    nums = re.findall(r"-?\d+(?:\.\d+)?", s or "")
    return [float(n) for n in nums]


def node_key(e, idx_by_type):
    if e["n"]:
        return e["n"]
    t = e["t"]
    idx_by_type[t] = idx_by_type.get(t, -1) + 1
    return "%s#%d" % (t, idx_by_type[t])


def index_paths(root):
    """path -> (element, parent)"""
    res = {}

    def walk(e, parent, path):
        res[path] = (e, parent)
        counts = {}
        for c in e.get("ch", []):
            walk(c, e, path + "/" + node_key(c, counts))

    walk(root, None, root["n"] or "root")
    return res


class Captures:
    def __init__(self):
        self.docs = {}
        for folder, prefix in ((CAPTURE, ""), (CAPTURE + "Win", "w_")):
            for f in sorted(glob.glob(os.path.join(folder, "*.ui.json"))):
                stem = prefix + os.path.basename(f)[3:-len(".ui.json")]
                docs = load_json(f)
                self.docs[stem] = {d["doc"]: (d, index_paths(d["root"])) for d in docs}

    def lookup(self, stem, doc, path):
        d = self.docs.get(stem, {}).get(doc)
        return d[1].get(path) if d else None

    def find_path(self, stem, doc, name):
        d = self.docs[stem][doc]
        for p, (e, _) in d[1].items():
            if e["n"] == name:
                return p
        raise KeyError(f"{name} not found in {stem}/{doc}")


def sprite_of(bg):
    if not bg:
        return None
    if "sprite" in bg:
        key = "sprite:%s/%s" % (bg.get("spriteTex"), bg["sprite"])
    elif "tex" in bg:
        key = "tex:" + bg["tex"]
    elif "rt" in bg:
        key = RT_SUBSTITUTES.get(bg["rt"])
        if not key:
            return None
    else:
        return None
    if key.startswith("baked:"):
        from port_bake import baked_sprite
        return {"asset": baked_sprite(key[6:]), "border": [0, 0, 0, 0]}
    info = SPRITES.get(key)
    if not info:
        print("  ! missing sprite", key, file=sys.stderr)
        return None
    if "spriteBorder" in bg:
        n = 0
        cand = info
        while cand:
            if [round(v) for v in cand.get("border", [0, 0, 0, 0])] == [round(v) for v in bg["spriteBorder"]]:
                return cand
            n += 1
            cand = SPRITES.get(f"{key}#{n}")
    return info


def rotate_layers(layers, mode="r"):
    from port_bake import bake_rotated180
    for layer in layers:
        if layer.get("kind") == "sprite" and not re.search(r"_(rot180|flipH|flipV)\.png$", layer["asset"]):
            layer["asset"], slice_ = bake_rotated180(layer["asset"], layer.get("slice"), mode)
            if slice_:
                layer["slice"] = slice_
        if layer.get("rect") and mode in ("r", "h"):
            pass


def mirror_subtree(node, pw, ph, mode="r"):
    l, b, r, t = node["rect"]
    if mode == "r":
        node["rect"] = [pw - r, ph - t, pw - l, ph - b]
    elif mode == "h":
        node["rect"] = [pw - r, b, pw - l, t]
    else:
        node["rect"] = [l, ph - t, r, ph - b]
    rotate_layers(node.get("layers", []), mode)
    for c in node.get("children", []):
        mirror_subtree(c, r - l, t - b, mode)


def find_desc(e, name):
    for c in e.get("ch", []):
        if c["n"] == name:
            return c
        r = find_desc(c, name)
        if r:
            return r
    return None


def template_kind(c):
    cls = c.get("c", [])
    if "shop-item__template-container" in cls:
        return "ShopItem"
    if "gear-item-spacing" in cls:
        return "GearItem"
    if c["t"] == "TemplateContainer" and any(k["n"] == "MailItem" for k in c.get("ch", [])):
        return "MailItem"
    if c["t"] == "TemplateContainer" and any(k["n"] == "game-char__image" for k in c.get("ch", [])):
        return "CharPortrait"
    return None


def rel_rect_down(e, parent):
    """[x, y, w, h] of e relative to parent, y down (world bounds)."""
    return [round(e["wb"][0] - parent["wb"][0], 2), round(e["wb"][1] - parent["wb"][1], 2), round(e["wb"][2], 2), round(e["wb"][3], 2)]


class PlanBuilder:
    def __init__(self, caps):
        self.caps = caps
        self.warnings = []
        self.templates = {}
        self.template_alts = []
        self.exclude = set()

    def convert_scrollview(self, e, parent, path, stems, doc):
        vp = find_desc(e, "unity-content-viewport")
        cc = find_desc(vp, "unity-content-container") if vp else None
        if not vp or not cc:
            return None
        x, y, w, h = rel_rect_down(vp, parent)
        ph = parent["wb"][3]
        cls = e.get("c", [])
        node = {"name": e["n"] or "ScrollView", "type": "ScrollArea", "src": "ScrollView",
                "rect": [x, ph - y - h, x + w, ph - y],
                "horizontal": "unity-scroll-view--horizontal" in cls,
                "vertical": "unity-scroll-view--vertical" in cls or "unity-scroll-view--horizontal" not in cls}
        children, items = [], []
        counts = {}
        for c in cc.get("ch", []):
            cp = path + "/content/" + node_key(c, counts)
            kind = template_kind(c)
            if kind:
                if visible(c):
                    items.append(rel_rect_down(c, vp))
                self.templates.setdefault(kind, []).append(c)
                node["template"] = kind
                continue
            n = self.convert(c, cc, cp, stems, doc)
            if n:
                dx = cc["wb"][0] - vp["wb"][0]
                dyc = cc["wb"][1] - vp["wb"][1]
                hcc, hvp = cc["wb"][3], vp["wb"][3]
                r = n["rect"]
                dy = -hcc + hvp - dyc
                n["rect"] = [r[0] + dx, r[1] + dy, r[2] + dx, r[3] + dy]
                children.append(n)
        if items:
            node["items"] = items
        if children:
            node["children"] = children
        return node

    def rect_of(self, e, parent):
        """o2 rect [left, bottom, right, top] relative to the parent, plus transform extras."""
        extra = {}
        if "lay" in e and parent is not None and "lay" in parent:
            x, y, w, h = e["lay"]
            ph = parent["lay"][3]
        else:
            x, y, w, h = e["wb"]
            if parent is not None:
                x -= parent["wb"][0]
                y -= parent["wb"][1]
                ph = parent["wb"][3]
            else:
                ph = h + y
        s = e["s"]
        tr = parse_vec(s.get("translate"))
        if tr and (abs(tr[0]) > 0.01 or abs(tr[1]) > 0.01) and "lay" in e:
            x += tr[0]
            y += tr[1]
        rot = parse_vec(s.get("rotate"))
        sc = parse_vec(s.get("scale"))
        origin = parse_vec(s.get("transformOrigin"))
        angle = rot[0] if rot else 0.0
        scale = sc[:2] if sc else [1, 1]
        if abs(abs(angle) - 180) < 0.01:
            angle = 0
            scale = [-scale[0], -scale[1]]
        if "lay" in e and (abs(angle) > 0.01 or abs(scale[0] - 1) > 0.001 or abs(scale[1] - 1) > 0.001):
            if w > 0 and h > 0 and origin:
                extra["pivot"] = [origin[0] / w, 1 - origin[1] / h]
            if abs(angle) > 0.01:
                extra["angle"] = -angle
            extra["scale"] = scale
        left, top_down = x, y
        bottom = ph - top_down - h
        return [round(left, 2), round(bottom, 2), round(left + w, 2), round(bottom + h, 2)], extra

    def widget_type(self, e):
        t = e["t"]
        cls = set(e.get("c", []))
        if t in ("Button", "RepeatButton"):
            return "Button"
        if e["n"] in CLICKABLE_NAMES or cls & CLICKABLE_CLASSES or t in CLICKABLE_TYPES or e["n"] == "MailItem":
            return "Button"
        if t in ("Label", "TextElement"):
            return "Label"
        if t == "ScrollView":
            return "ScrollArea"
        return "Widget"

    def layers(self, e, size):
        s = e["s"]
        res = []
        bgc = s.get("backgroundColor", [0, 0, 0, 0])
        radius = int(round(max(s.get("borderTopLeftRadius", 0), s.get("borderBottomRightRadius", 0))))
        if bgc[3] > 0.001:
            if radius > 0 and min(size) > 2 * radius:
                res.append({"name": "bg", "kind": "sprite", "asset": round_rect_sprite(radius), "mode": "Sliced",
                            "slice": [radius] * 4, "color": color(bgc[:3] + [1]), "alpha": round(bgc[3], 4)})
            else:
                res.append({"name": "bg", "kind": "color", "color": color(bgc[:3] + [1]), "alpha": round(bgc[3], 4)})
        bg = s.get("backgroundImage")
        if e["t"] == "Image" and "image" in e:
            im = e["image"]
            bg = {"sprite": im["sprite"], "spriteTex": im["spriteTex"]} if im.get("sprite") else ({"tex": im["tex"]} if im.get("tex") else None)
        info = sprite_of(bg)
        if info:
            asset = info["asset"]
            layer = {"name": "image", "kind": "sprite", "asset": asset}
            tint = s.get("unityBackgroundImageTintColor", [1, 1, 1, 1])
            if tint[:3] != [1, 1, 1]:
                layer["color"] = color(tint[:3] + [1])
            if tint[3] < 0.999:
                layer["alpha"] = round(tint[3], 4)
            border = info.get("border") or [0, 0, 0, 0]
            size_mode = s.get("backgroundSize", "")
            repeat = s.get("backgroundRepeat", "")
            if "Repeat, y:Repeat" in repeat:
                layer["mode"] = "Tiled"
                tile = parse_vec(size_mode)
                iw, ih = image_size(asset)
                if tile and tile[0] > 0:
                    layer["tileScale"] = tile[0] / iw
            elif any(b > 0 for b in border):
                layer["mode"] = "Sliced"
                layer["slice"] = [int(round(b)) for b in border]
            elif "Cover" in size_mode:
                iw, ih = image_size(asset)
                w, h = size
                if iw > 0 and ih > 0 and w > 0 and h > 0:
                    k = max(w / iw, h / ih)
                    cw, ch = w / k / iw, h / k / ih
                    layer["crop"] = [round((1 - cw) / 2, 4), round((1 - ch) / 2, 4), round((1 + cw) / 2, 4), round((1 + ch) / 2, 4)]
            elif "Contain" in size_mode:
                iw, ih = image_size(asset)
                w, h = size
                if iw > 0 and ih > 0 and w > 0 and h > 0:
                    k = min(w / iw, h / ih)
                    fw, fh = iw * k, ih * k
                    ox, oy = (w - fw) / 2, (h - fh) / 2
                    layer["rect"] = [round(ox, 2), round(oy, 2), round(ox + fw, 2), round(oy + fh, 2)]
            res.append(layer)
        widths = [s.get("borderLeftWidth", 0), s.get("borderBottomWidth", 0), s.get("borderRightWidth", 0), s.get("borderTopWidth", 0)]
        bcol = s.get("borderLeftColor", [0, 0, 0, 0])
        if any(w > 0 for w in widths) and bcol[3] > 0.001:
            res.append({"name": "border", "kind": "border", "widths": widths, "color": color(bcol)})
        return res

    def text_of(self, e):
        if "text" not in e:
            return None
        s = e["s"]
        font_def = s.get("unityFontDefinition", "")
        font = None
        for k, v in FONTS.items():
            if k in font_def:
                font = v
        if not font:
            font = FONTS["ChelaOne-Regular SDF"]
        align = s.get("unityTextAlign", "UpperLeft")
        valign = "Top" if align.startswith("Upper") else ("Bottom" if align.startswith("Lower") else "Middle")
        halign = "Left" if align.endswith("Left") else ("Right" if align.endswith("Right") else "Middle")
        if not strip_rich(e["text"]).strip() and e["t"] in ("Button", "RepeatButton"):
            return None
        res = {
            "text": strip_rich(e["text"]),
            "font": font,
            "size": s.get("fontSize", 14),
            "color": color(s.get("color", [0, 0, 0, 1])),
            "halign": halign,
            "valign": valign,
            "wrap": s.get("whiteSpace") != "NoWrap",
            "ellipsis": s.get("textOverflow") == "Ellipsis",
            "padding": [s.get("paddingLeft", 0), s.get("paddingBottom", 0), s.get("paddingRight", 0), s.get("paddingTop", 0)],
        }
        ow = s.get("unityTextOutlineWidth", 0)
        oc = s.get("unityTextOutlineColor", [0, 0, 0, 0])
        if ow > 0 and oc[3] > 0:
            res["outline"] = {"width": ow, "color": color(oc)}
        sh = s.get("textShadow", "")
        m = re.match(r"offset=\((-?[\d.]+), (-?[\d.]+)\), blurRadius=(-?[\d.]+), color=RGBA\(([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+)\)", sh)
        if m and float(m.group(7)) > 0.001:
            res["shadow"] = {"offset": [float(m.group(1)), float(m.group(2))], "blur": float(m.group(3)),
                             "color": [float(m.group(i)) for i in range(4, 8)]}
        return res

    def convert(self, e, parent, path, stems, doc, depth=0):
        """e/parent come from the same capture. stems: capture stems to search hidden elements in."""
        hidden_in_base = False
        if visible(e) and e["s"].get("opacity", 1) < 0.01:
            alts = [self.caps.lookup(stem, doc, path) for stem in stems[1:]] if doc else \
                   [idx.get(path) for idx in self.template_alts]
            for alt in alts:
                if alt and visible(alt[0]) and alt[0]["s"].get("opacity", 1) > 0.01:
                    e, parent = alt
                    break
        if not visible(e):
            alts = [self.caps.lookup(stem, doc, path) for stem in stems[1:]] if doc else \
                   [idx.get(path) for idx in self.template_alts]
            for alt in alts:
                if alt and visible(alt[0]):
                    e, parent = alt
                    hidden_in_base = True
                    break
            else:
                return None
        if e["t"] == "ScrollView":
            return self.convert_scrollview(e, parent, path, stems, doc)
        rect, extra = self.rect_of(e, parent)
        size = (rect[2] - rect[0], rect[3] - rect[1])
        node = {"name": e["n"] or e["t"], "type": self.widget_type(e), "rect": rect, "src": e["t"]}
        node.update(extra)
        s = e["s"]
        if s.get("visibility") == "Hidden" or hidden_in_base:
            node["enabled"] = False
        op = s.get("opacity", 1)
        if op < 0.999:
            node["opacity"] = op
        if e.get("clip"):
            node["clip"] = True
        if e.get("c"):
            node["classes"] = e["c"]
        layers = self.layers(e, size)
        flip = None
        if "angle" not in node and node.get("scale") in ([-1.0, -1.0], [-1.0, 1.0], [1.0, -1.0]):
            flip = {(-1.0, -1.0): "r", (-1.0, 1.0): "h", (1.0, -1.0): "v"}[tuple(node["scale"])]
        mirrored = flip is not None
        if mirrored:
            rotate_layers(layers, flip)
            node.pop("scale", None)
            node.pop("pivot", None)
        if layers:
            node["layers"] = layers
        text = self.text_of(e)
        if text is not None:
            node["text"] = text
        children = []
        kids = e.get("ch", [])
        counts = {}
        for c in kids:
            cp = path + "/" + node_key(c, counts)
            if template_kind(c):
                if visible(c):
                    node.setdefault("items", []).append(rel_rect_down(c, e))
                    node["template"] = template_kind(c)
                continue
            if c["t"] in ("Scroller",) or c["n"] in self.exclude:
                continue
            n = self.convert(c, e, cp, stems, doc, depth + 1)
            if n:
                children.append(n)
        if mirrored:
            # a turn by 180 degrees carries the children along: mirror their rectangles and images
            for c in children:
                mirror_subtree(c, size[0], size[1], flip)
        if children:
            node["children"] = children
        return node

    def build(self, stems, doc, element_name, rect_override=None):
        base = stems[0]
        if doc is None:
            doc = next(iter(self.caps.docs[base]))
        path = self.caps.find_path(base, doc, element_name)
        e, parent = self.caps.lookup(base, doc, path)
        node = self.convert(e, parent, path, stems, doc)
        if node is None:
            raise RuntimeError(f"{element_name} is not visible in {stems}")
        # a prototype root is placed absolutely in the 1920x1080 screen
        x, y, w, h = e["wb"]
        node["rect"] = [x - 960, 540 - y - h, x - 960 + w, 540 - y]
        node["anchors"] = [0.5, 0.5, 0.5, 0.5]
        node.pop("pivot", None)
        return node


MENU_VIEWS = [
    # prototype, element, captures (first is the base)
    ("Background", "background-graphic", ["menu_home"]),
    ("HomeScreen", "HomeScreen", ["menu_home", "menu_home2"]),
    ("CharScreen", "CharScreen", ["menu_char_stats", "menu_char_skills", "menu_char_bio", "menu_char_next1"]),
    ("InfoScreen", "InfoScreen", ["menu_info"]),
    ("MailScreen", "MailScreen", ["menu_mail", "menu_mail_deleted"]),
    ("ShopScreen", "ShopScreen", ["menu_shop", "menu_shop_gem", "menu_shop_potion"]),
    ("MenuBar", "MenuBar", ["menu_home", "menu_char_stats"]),
    ("OptionsBar", "OptionsBar", ["menu_home"]),
    ("InventoryScreen", "InventoryScreen", ["menu_inventory"]),
    ("SettingsScreen", "SettingsScreen", ["menu_settings"]),
    ("PopUpText", "PopUpText", ["menu_home"]),
]


def walk_nodes(node, fn, parent=None):
    fn(node, parent)
    for c in node.get("children", []):
        walk_nodes(c, fn, node)


def find_node(node, name):
    if node["name"] == name:
        return node
    for c in node.get("children", []):
        r = find_node(c, name)
        if r:
            return r
    return None


def complete_numbered_siblings(root):
    """Siblings named <prefix><n>... share structure: children missing in one (never visible in the captures)
    are copied from another, e.g. the "+" of a gear slot that always held gear."""
    import copy

    def fix(node, parent):
        kids = node.get("children", [])
        groups = {}
        for k in kids:
            m = re.match(r"^(.*?)(\d+)(.*)$", k["name"])
            if m:
                groups.setdefault((m.group(1), m.group(3)), []).append((m.group(2), k))
        for (pre, post), members in groups.items():
            if len(members) < 2:
                continue
            def merge(target, tnum, source, snum):
                have = {c["name"].replace(tnum, "#"): c for c in target.get("children", [])}
                for c in source.get("children", []):
                    key = c["name"].replace(snum, "#")
                    if key in have:
                        merge(have[key], tnum, c, snum)
                    else:
                        cc = copy.deepcopy(c)

                        def rename(n):
                            n["name"] = n["name"].replace(snum, tnum)
                            for x in n.get("children", []):
                                rename(x)
                        rename(cc)
                        cc["enabled"] = False
                        target.setdefault("children", []).insert(0, cc)
                        have[key] = cc

            def norm(n, num):
                return {c["name"].replace(num, "#") for c in n.get("children", [])}
            for num, k in members:
                for onum, other in members:
                    if other is not k and norm(k, num) & norm(other, onum):
                        merge(k, num, other, onum)
    walk_nodes(root, fix)


def patch_plan(protos):
    import copy
    from port_bake import bake_ring
    for p in protos:
        root = p["root"]
        complete_numbered_siblings(root)
        radial = find_node(root, "level-meter__radial-progress")
        if radial:
            ring = bake_ring(230, 10)
            radial["layers"] = [
                {"name": "track", "kind": "sprite", "asset": ring, "color": [0, 22 / 255, 26 / 255, 1]},
                {"name": "progress", "kind": "sprite", "asset": ring, "mode": "Fill360CW", "color": [209 / 255, 243 / 255, 121 / 255, 1]}]
        delete = find_node(root, "content__delete-button")
        if delete and not find_node(root, "content__undelete-button"):
            undelete = copy.deepcopy(delete)
            undelete["name"] = "content__undelete-button"
            undelete["enabled"] = False
            for layer in undelete.get("layers", []):
                if layer.get("kind") == "sprite":
                    layer["asset"] = SPRITES["tex:Undelete"]["asset"]
            p_buttons = find_node(root, "content__buttons")
            p_buttons["children"].insert(0, undelete)


def anchorize(node, pw=None, ph=None):
    """Turns child rectangles into anchors + offsets: full-span sides stretch, centered ones stay centered,
    the rest keep to the left and the top (the flow direction of UI Toolkit)."""
    l, b, r, t = node["rect"]
    if pw is not None and "anchors" not in node:
        eps = 1.5
        if (abs(l) < eps and abs(r - pw) < eps) or (pw > 0 and 0 <= l < 0.08 * pw and 0 <= pw - r < 0.08 * pw):
            ax, ox = (0, 1), (l, r - pw)
        elif abs(l - (pw - r)) < eps and r - l < pw:
            ax, ox = (0.5, 0.5), (l - pw / 2, r - pw / 2)
        else:
            ax, ox = (0, 0), (l, r)
        if (abs(b) < eps and abs(t - ph) < eps) or (ph > 0 and 0 <= b < 0.08 * ph and 0 <= ph - t < 0.08 * ph):
            ay, oy = (0, 1), (b, t - ph)
        elif abs(b - (ph - t)) < eps and t - b < ph:
            ay, oy = (0.5, 0.5), (b - ph / 2, t - ph / 2)
        else:
            ay, oy = (1, 1), (b - ph, t - ph)
        node["anchors"] = [ax[0], ay[0], ax[1], ay[1]]
        node["rect"] = [round(ox[0], 2), round(oy[0], 2), round(ox[1], 2), round(oy[1], 2)]
    w, h = r - l, t - b
    for c in node.get("children", []):
        anchorize(c, w, h)


GAME_VIEWS = [
    # prototype, document, element, captures, excluded children
    ("GameHUD", "GameScreen", "GameScreen-container", ["w_game_t05.0", "w_game_t01.5"],
     ["PauseScreen", "GameWinScreen", "GameLoseScreen", "debug-log__container", "timer__container"]),
    ("PauseScreen", "GameScreen", "PauseScreen", ["w_game_pause"], []),
    ("GameWinScreen", "GameScreen", "GameWinScreen", ["w_game_end_GameWinScreen"], []),
    ("GameLoseScreen", "GameScreen", "GameLoseScreen", ["game_end_GameLoseScreen"], []),
    ("HeroHealthBar", "Unit_Knight_Jarek", "HealthBarBase", ["w_game_t05.0"], []),
    ("BossHealthBar", "Unit_Dragon_Rustum", "HealthBarBase", ["w_game_t05.0"], []),
]


def text_node(name, rect, font, size, color, extra=None):
    t = {"text": "", "font": font, "size": size, "color": color, "halign": "Middle", "valign": "Middle",
         "wrap": False, "ellipsis": False, "padding": [0, 0, 0, 0]}
    if extra:
        t.update(extra)
    return {"name": name, "type": "Label", "rect": rect, "anchors": [0.5, 0.5, 0.5, 0.5], "text": t}


def synthetic_protos():
    """Pieces the original made at runtime (TextMeshPro damage numbers, particle sprites): templates for the JS."""
    res = []
    ander = FONTS["Ander Hedge SDF"]
    outline = {"width": 3, "color": [0, 0, 0, 1]}
    shadow = {"offset": [0, 6], "blur": 2, "color": [0, 0, 0, 0.8]}
    for name, top, bottom in (("DamageNumberHero", [1, 0.905, 0.404, 1], [1, 0, 0.121, 1]),
                              ("DamageNumberBoss", [1, 0.158, 0.07, 1], [1, 0, 0.021, 1]),
                              ("HealNumber", [0, 0.905, 0, 1], [0, 0, 0, 1])):
        node = text_node(name, [-200, -60, 200, 60], ander, 110, [1, 1, 1, 1],
                         {"outline": outline, "shadow": shadow, "gradient": [top, bottom]})
        res.append({"path": f"{DC}/UI/Game/Fx/{name}.proto", "root": node})
    fx = {"name": "FxSprite", "type": "Widget", "rect": [-50, -50, 50, 50], "anchors": [0.5, 0.5, 0.5, 0.5],
          "layers": [{"name": "image", "kind": "sprite", "asset": f"{DC}/Sprites/VFX/Sprite_Glow_A.png"}]}
    res.append({"path": f"{DC}/UI/Game/Fx/FxSprite.proto", "root": fx})
    return res


def BY_TEX(name):
    for k, v in SPRITES.items():
        if k.startswith("sprite:" + name + "/") or k == "tex:" + name:
            return v["asset"]
    raise KeyError(name)


def main():
    caps = Captures()
    pb = PlanBuilder(caps)
    protos = []
    for name, element, stems in MENU_VIEWS:
        stems = [s for s in stems if s in caps.docs]
        if not stems:
            print("skip", name, "(no capture)")
            continue
        root = pb.build(stems, None, element)
        root["name"] = name
        protos.append({"path": f"{DC}/UI/MainMenu/{name}.proto", "root": root})
        print("plan", name)
    for name, doc, element, stems, exclude in GAME_VIEWS:
        stems = [s for s in stems if s in caps.docs]
        if not stems:
            print("skip", name, "(no capture)")
            continue
        pb.exclude = set(exclude)
        root = pb.build(stems, doc, element)
        pb.exclude = set()
        root["name"] = name
        protos.append({"path": f"{DC}/UI/Game/{name}.proto", "root": root})
        print("plan", name)
    protos.extend(synthetic_protos())

    # every instance in every capture: elements hidden in the first one come from the others
    for stem in caps.docs:
        for docname, (d, _) in caps.docs[stem].items():
            def collect(e):
                kind = template_kind(e)
                if kind:
                    pb.templates.setdefault(kind, []).append(e)
                    return
                for c in e.get("ch", []):
                    collect(c)
            collect(d["root"])
    for kind, instances in pb.templates.items():
        def count_visible(n):
            return (1 if visible(n) else 0) + sum(count_visible(c) for c in n.get("ch", []) if visible(n))
        instances = sorted([i for i in instances if visible(i)], key=lambda i: -count_visible(i))
        e = instances[0]
        pb.template_alts = [index_paths(i) for i in instances[1:]]
        node = pb.convert(e, None, e["n"] or "root", [], None)
        pb.template_alts = []
        w, h = e["wb"][2], e["wb"][3]
        node["name"] = kind
        node["rect"] = [0, -h, w, 0]
        node["anchors"] = [0, 1, 0, 1]
        protos.append({"path": f"{DC}/UI/Templates/{kind}.proto", "root": node})
        print("template", kind)
    patch_plan(protos)
    for p in protos:
        anchorize(p["root"])
    layouts = {}
    for p in protos:
        def grab(n, parent):
            if n.get("items"):
                layouts[n["name"]] = n["items"]
        walk_nodes(p["root"], grab)
    from port_common import write_if_changed, meta as write_meta
    rel = f"{DC}/Data/UiLayouts.json"
    write_if_changed(os.path.join(ASSETS, rel), json.dumps(layouts, indent=1))
    write_meta(rel, "o2::DefaultAssetMeta<o2::DataAsset>")
    out = os.path.join(REPO, "Work", "Unity", "ui_plan.json")
    with open(out, "w") as f:
        json.dump({"prototypes": protos}, f, indent=1)
    print("written", out)


if __name__ == "__main__":
    main()
