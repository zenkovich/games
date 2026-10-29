#!/usr/bin/env python3
"""Writes the SVG sprites of the WordFall main screen into Assets/WordFall/Svg from the HTML layout
(Tools/WordFall/CssScreen/game.css). Every element of the page becomes one image of its CSS box in rem
(1 rem = 1 concept pixel; the game draws it at 768/471 game pixels per rem) with the outer shadows
around it, painted in the browser's order: outer shadows, background, border, inset shadows (bands and
rings that follow the rounded corners), the shine of the buttons, the icon glyphs of the page's icon
font placed as the page places them. The engine's SVG has no blur, clip path or conic gradient, so the
one blurred shadow (--sink) is a band with the alpha ramp of the blur and the rainbow is a fan of sectors.

The CSS box of every image and its margins (the shadows outside the box) go to Tools/WordFall/svg_sprites.json
for the layout script (restyle_main_screen.py).

    python3 Tools/WordFall/build_svg_sprites.py
"""
import hashlib
import json
import math
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from shapely import affinity
from shapely.geometry import MultiPolygon, Polygon, box

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "Assets" / "WordFall" / "Svg"
ICONS = TTFont(ROOT / "Work" / "CssScreen" / "concept_icons.ttf")
ICON_CMAP = ICONS.getBestCmap()
ICON_GLYPHS = ICONS.getGlyphSet()
UPEM = ICONS["head"].unitsPerEm
BASELINE = ((UPEM - (ICONS["hhea"].ascent - ICONS["hhea"].descent)) / 2 + ICONS["hhea"].ascent) / UPEM  # line-height: 1

DROP = [dict(dy=2, color=(110, 60, 15, .22)), dict(dy=3, color=(110, 60, 15, .1))]              # --drop
SINK = dict(inset=True, dy=4, blur=4, spread=-2, color=(90, 60, 30, .35))                         # --sink


# ---------------------------------------------------------------- geometry (y down, rem)

def rrect(x, y, w, h, r):
    if r <= 0:
        return box(x, y, x + w, y + h)
    r = min(r, w / 2, h / 2)
    return box(x + r, y + r, x + w - r, y + h - r).buffer(r, quad_segs=24)


def ellipse(cx, cy, rx, ry, segments=256):
    return Polygon([(cx + rx * math.cos(2 * math.pi * i / segments), cy + ry * math.sin(2 * math.pi * i / segments)) for i in range(segments)])


def path_of(geom):
    parts = []
    polys = geom.geoms if isinstance(geom, MultiPolygon) else [geom]
    for poly in polys:
        if poly.is_empty or poly.area < 1e-4:
            continue
        for ring in [poly.exterior] + list(poly.interiors):
            pts = list(ring.coords)[:-1]
            parts.append("M" + " L".join("%.3f %.3f" % p for p in pts) + "Z")
    return "".join(parts)


def rgba(c):
    return "rgb(%d,%d,%d)" % c[:3], (c[3] if len(c) > 3 else 1.0)


class Svg:
    def __init__(self, name, width, height):
        self.name, self.width, self.height = name, width, height
        self.defs, self.body, self.ids = [], [], 0

    def gradient(self, x1, y1, x2, y2, stops):
        """stops: [(color, offset 0..1)]"""
        self.ids += 1
        gid = "g%d" % self.ids
        s = "".join('<stop offset="%.4f" stop-color="%s" stop-opacity="%.3f"/>' % ((off,) + rgba(c)) for c, off in stops)
        self.defs.append('<linearGradient id="%s" gradientUnits="userSpaceOnUse" x1="%.3f" y1="%.3f" x2="%.3f" y2="%.3f">%s</linearGradient>'
                         % (gid, x1, y1, x2, y2, s))
        return "url(#%s)" % gid

    def radial(self, cx, cy, r, stops):
        self.ids += 1
        gid = "g%d" % self.ids
        s = "".join('<stop offset="%.4f" stop-color="%s" stop-opacity="%.3f"/>' % ((off,) + rgba(c)) for c, off in stops)
        self.defs.append('<radialGradient id="%s" gradientUnits="userSpaceOnUse" cx="%.3f" cy="%.3f" r="%.3f">%s</radialGradient>'
                         % (gid, cx, cy, r, s))
        return "url(#%s)" % gid

    def fill(self, geom, paint, transform=""):
        d = path_of(geom)
        if not d:
            return
        if isinstance(paint, tuple):
            color, alpha = rgba(paint)
            paint = '%s"%s' % (color, ' fill-opacity="%.3f"' % alpha if alpha < 1 else "")
        else:
            paint += '"'
        self.body.append('<path fill-rule="evenodd" d="%s" fill="%s%s/>' % (d, paint, ' transform="%s"' % transform if transform else ""))

    def raw(self, element):
        self.body.append(element)

    def text(self):
        return ('<svg xmlns="http://www.w3.org/2000/svg" width="%g" height="%g" viewBox="0 0 %g %g">%s%s</svg>\n'
                % (self.width, self.height, self.width, self.height,
                   "<defs>%s</defs>" % "".join(self.defs) if self.defs else "", "".join(self.body)))


# ---------------------------------------------------------------- a CSS box

class Box:
    """border-box w x h at (x, y): radius (or 'round' for 50%), border widths (top, right, bottom, left),
    border colour, background (colour or [(colour, offset)] top to bottom over the padding box) and the
    box-shadow list as written in the CSS (first on top)"""

    def __init__(self, w, h, radius, border, border_color, background, shadows=(), x=0.0, y=0.0):
        self.x, self.y, self.w, self.h = x, y, w, h
        self.radius = radius
        self.bt, self.br, self.bb, self.bl = border if isinstance(border, tuple) else (border,) * 4
        self.border_color, self.background, self.shadows = border_color, background, list(shadows)

    def outer(self):
        if self.radius == "round":
            return ellipse(self.x + self.w / 2, self.y + self.h / 2, self.w / 2, self.h / 2)
        return rrect(self.x, self.y, self.w, self.h, self.radius)

    def padding_rect(self):
        return (self.x + self.bl, self.y + self.bt, self.w - self.bl - self.br, self.h - self.bt - self.bb)

    def padding(self):
        x, y, w, h = self.padding_rect()
        if self.radius == "round":
            return ellipse(x + w / 2, y + h / 2, w / 2, h / 2)
        return rrect(x, y, w, h, self.radius - max(self.bt, self.bl))

    def paint(self, svg):
        outer, pad = self.outer(), self.padding()
        px, py, pw, ph = self.padding_rect()
        for s in reversed([s for s in self.shadows if not s.get("inset")]):
            shape = affinity.translate(outer, s.get("dx", 0), s.get("dy", 0))
            if s.get("spread"):
                shape = shape.buffer(s["spread"], quad_segs=24)
            svg.fill(shape.difference(outer) if s.get("outside_only") else shape, s["color"])
        if isinstance(self.background, list):
            svg.fill(outer, svg.gradient(0, py, 0, py + ph, self.background))
        else:
            svg.fill(outer, self.background)
        if self.border_color and (self.bt or self.br or self.bb or self.bl):
            svg.fill(outer.difference(pad), self.border_color)
        for s in reversed([s for s in self.shadows if s.get("inset")]):
            dx, dy, spread, blur = s.get("dx", 0), s.get("dy", 0), s.get("spread", 0), s.get("blur", 0)
            if blur:
                # a blurred top shadow: the band down to where the blur fades, its alpha the blurred edge
                sigma = blur / 2
                edge = py + dy + spread
                depth = edge - py + 2.5 * sigma
                band = pad.difference(affinity.translate(pad, 0, depth))
                stops = []
                for i in range(9):
                    yy = py + depth * i / 8
                    k = 0.5 * math.erfc((yy - edge) / (sigma * math.sqrt(2)))
                    stops.append(((s["color"][:3]) + (s["color"][3] * k,), i / 8))
                svg.fill(band, svg.gradient(0, py, 0, py + depth, stops))
                continue
            hole = affinity.translate(pad, dx, dy)
            if spread:
                hole = hole.buffer(-spread, quad_segs=24, join_style="round")
            svg.fill(pad.difference(hole), s["color"])


def gradient_box(svg, x, y, w, h, angle, stops, shape):
    """a CSS linear-gradient(angle) over the box, painted into shape"""
    a = math.radians(angle)
    length = abs(w * math.sin(a)) + abs(h * math.cos(a))
    cx, cy = x + w / 2, y + h / 2
    ux, uy = math.sin(a), -math.cos(a)
    paint = svg.gradient(cx - ux * length / 2, cy - uy * length / 2, cx + ux * length / 2, cy + uy * length / 2, stops)
    svg.fill(shape, paint)


def ellipse_shine(svg, cx, cy, w, h, angle, color):
    shape = affinity.rotate(ellipse(cx, cy, w / 2, h / 2), angle, origin=(cx, cy))
    svg.fill(shape, color)


def icon(svg, char, px, py, pw, ph, size, color, halo=None, shadow=None, stroke=None):
    """a glyph of the page's icon font centred in the padding box as a line-height: 1 line of that size"""
    name = ICON_CMAP[ord(char)]
    pen = SVGPathPen(ICON_GLYPHS)
    ICON_GLYPHS[name].draw(pen)
    d = pen.getCommands()
    advance = ICONS["hmtx"][name][0] * size / UPEM
    ox = px + (pw - advance) / 2
    oy = py + (ph - size) / 2 + BASELINE * size
    k = size / UPEM

    def glyph(dx, dy, fill, alpha=1.0, extra=""):
        svg.raw('<path d="%s" fill="%s"%s%s transform="translate(%.3f %.3f) scale(%.6f %.6f)"/>'
                % (d, fill, ' fill-opacity="%.3f"' % alpha if alpha < 1 else "", extra, ox + dx, oy + dy, k, -k))

    if halo:
        c, a = rgba(halo)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            glyph(dx, dy, c, a)
    if shadow:
        c, a = rgba(shadow)
        glyph(0, 1, c, a * 0.85)
    if stroke:
        c, a = rgba(stroke[1])
        glyph(0, 0, c, 1.0, ' stroke="%s" stroke-opacity="%.3f" stroke-width="%.3f" stroke-linejoin="round"' % (c, a, stroke[0] / k))
    c, a = rgba(color)
    glyph(0, 0, c, a)


# ---------------------------------------------------------------- the elements of game.css

TILE_SHADOWS = {
    "cream": ((110, 84, 50), (246, 224, 188), [
        (0, 1, (194, 169, 134)), (0, 2, (255, 236, 204)), (0, -1, (170, 144, 108)), (0, -2, (195, 166, 129)), (0, -3, (197, 168, 131)),
        (1, 0, (167, 146, 110)), (-1, 0, (219, 194, 162)), (-2, 0, (255, 232, 201))]),
    "peach": ((110, 84, 50), (237, 200, 148), [
        (0, 1, (210, 183, 141)), (0, 2, (250, 219, 176)), (0, -1, (178, 145, 107)), (0, -2, (198, 163, 118)), (0, -3, (191, 156, 111)),
        (1, 0, (171, 139, 91)), (-1, 0, (219, 190, 150)), (-2, 0, (247, 210, 157))]),
    "orange": ((107, 70, 30), (243, 186, 116), [
        (0, 1, (193, 150, 90)), (0, 2, (250, 205, 140)), (0, 3, (246, 195, 125)), (0, -1, (140, 111, 66)), (0, -2, (196, 147, 94)),
        (0, -3, (190, 146, 94)), (1, 0, (171, 139, 91)), (-1, 0, (214, 170, 108)), (-2, 0, (247, 210, 157))]),
    "yellow": ((120, 80, 20), (243, 193, 70), [
        (0, 1, (205, 150, 50)), (0, 2, (255, 225, 120)), (0, 3, (250, 210, 90)), (0, -1, (150, 100, 30)), (0, -2, (205, 150, 50)),
        (0, -3, (220, 165, 55)), (1, 0, (190, 135, 40)), (-1, 0, (225, 170, 55)), (-2, 0, (255, 215, 100))]),
}
ACTIVE = ((55, 76, 89), (236, 206, 166), [(1, (104, 146, 165)), (2, (103, 152, 174)), (3, (153, 180, 183)), (4, (216, 212, 193))])

TILE_SIZES = {"board": (61, 61, 8), "small": (44, 40, 7), "medium": (56, 56, 8)}

BUTTONS = {
    "green": dict(rim=(30, 64, 4), edge=(104, 137, 28), light=(176, 218, 86), top=(142, 192, 62), mid=(95, 165, 60),
                  bottom=(55, 149, 54), shade=(29, 128, 57), dark=(15, 105, 65), side=(111, 170, 84)),
    "red": dict(rim=(82, 10, 0), edge=(170, 73, 53), light=(239, 126, 107), top=(218, 92, 68), mid=(204, 73, 60),
                bottom=(188, 58, 48), shade=(165, 50, 45), dark=(136, 43, 43), side=(172, 69, 65)),
}

BOOSTERS = {
    "blue": dict(rim=(13, 43, 71), light=(120, 196, 214), top=(116, 195, 218), mid=(104, 177, 208), bottom=(95, 142, 190),
                 band=(53, 97, 145), shade=(79, 124, 169), side=(50, 85, 115), ink=(10, 44, 80), halo=(173, 221, 243, .7)),
    "yellow": dict(rim=(82, 36, 0), light=(246, 212, 110), top=(242, 202, 86), mid=(239, 192, 78), bottom=(227, 158, 51),
                   band=(179, 111, 20), shade=(205, 140, 40), side=(150, 95, 15), ink=(85, 40, 0), halo=(255, 235, 170, .7)),
    "red": dict(rim=(81, 16, 7), light=(234, 135, 117), top=(235, 122, 103), mid=(220, 99, 84), bottom=(205, 75, 70),
                band=(150, 45, 40), shade=(180, 60, 55), side=(135, 48, 39), ink=(77, 14, 6), halo=(250, 179, 170, .7)),
}
# the concept's row of boosters: magnifier, magnifier with a plus, two bulbs, the shuffle
BOOSTER_ICONS = {"magnifier": ("blue", "α"), "zoom": ("blue", "β"), "bulb": ("blue", "γ"), "bulb_yellow": ("yellow", "δ"),
                 "shuffle": ("red", "ε")}

TORN = [(5, 2), (20, 2), (21, 4), (26, 2), (94, 2), (97, 6), (98, 16), (97, 18), (98, 44), (97, 52), (98, 80), (97, 84),
        (98, 93), (94, 98), (80, 98), (78, 96), (74, 98), (26, 98), (25, 96), (22, 98), (6, 98), (2, 92), (1, 88), (2, 78),
        (1, 74), (2, 34), (1, 30), (2, 20), (1, 13), (2, 6)]

RAINBOW = [(255, 120, 150), (255, 200, 80), (250, 240, 120), (120, 220, 140), (90, 200, 230), (120, 150, 240), (200, 120, 230),
           (255, 120, 150)]


def tile_box(kind, size, x=0, y=0):
    w, h, r = TILE_SIZES[size]
    if kind == "active":
        rim, bg, rings = ACTIVE
        shadows = [dict(inset=True, spread=s, color=c) for s, c in rings] + DROP
    else:
        rim, bg, bands = TILE_SHADOWS[kind]
        shadows = [dict(inset=True, dx=dx, dy=dy, color=c) for dx, dy, c in bands] + DROP
    return Box(w, h, r, 1, rim, bg, shadows, x, y)


def star_shape(x, y, size):
    """the page's rounded star: the radius of a sharp five-point star per degree, smoothed over 9 degrees"""
    ro, ri = 48.0, 24.0

    def sharp(t):
        a = t % 72.0
        a = min(a, 72.0 - a)
        tip = (0.0, ro)
        val = (ri * math.sin(math.radians(36)), ri * math.cos(math.radians(36)))
        dx, dy = val[0] - tip[0], val[1] - tip[1]
        sa, ca = math.sin(math.radians(a)), math.cos(math.radians(a))
        det = sa * (-dy) - (-dx) * ca
        return (tip[0] * (-dy) - (-dx) * tip[1]) / det

    r = [sharp(t) for t in range(360)]
    k = 9
    ext = r[-k:] + r + r[:k]
    smooth = [sum(ext[i - k // 2:i + k // 2 + 1]) / k for i in range(k, k + 360)]
    pts = []
    for t in range(0, 360, 3):
        a = math.radians(t - 90)
        pts.append((x + size * (50 + smooth[t] * math.cos(a)) / 100, y + size * (50 + smooth[t] * math.sin(a)) / 100))
    return Polygon(pts)


# ---------------------------------------------------------------- images

class Sprite:
    """an image: the CSS box at (margin left, margin top) inside the image"""

    def __init__(self, name, box_w, box_h, left=0, top=0, right=0, bottom=0, slices=None):
        self.name, self.box_w, self.box_h = name, box_w, box_h
        self.margins = (left, top, right, bottom)
        self.slices = slices
        self.svg = Svg(name, box_w + left + right, box_h + top + bottom)


def make_tile(kind, size):
    w, h, _ = TILE_SIZES[size]
    sp = Sprite("tile_%s_%s" % (size, kind), w, h, bottom=3)
    tile_box(kind, size).paint(sp.svg)
    return sp


def make_panel(name, w, h, radius, border, border_color, background, shadows, bottom=0):
    sp = Sprite(name, w, h, bottom=bottom)
    Box(w, h, radius, border, border_color, background, shadows).paint(sp.svg)
    return sp


def make_button(color, glyph):
    c = BUTTONS[color]
    sp = Sprite("button_%s" % ("check" if glyph == "ζ" else "cross" if glyph == "η" else "task_check"), 52, 56, bottom=3)
    b = Box(52, 56, 10, 1, c["rim"], [(c["top"], 0), (c["mid"], .14), (c["bottom"], .82), (c["mid"], 1)],
            [dict(inset=True, dy=1, color=c["edge"]), dict(inset=True, dy=2, color=c["light"]),
             dict(inset=True, dy=-1, color=c["dark"]), dict(inset=True, dy=-5, color=c["shade"]),
             dict(inset=True, dx=1, color=c["side"]), dict(inset=True, dx=-1, color=c["side"])] + DROP)
    b.paint(sp.svg)
    ellipse_shine(sp.svg, 1 + 3 + 3.5, 1 + 3 + 2, 7, 4, -30, (255, 255, 255, .35))
    icon(sp.svg, glyph, 1, 1, 50, 54, 37, (252, 255, 248), shadow=(0, 0, 0, .35), stroke=(.5, (0, 0, 0, .25)))
    return sp


def make_booster(name):
    color, glyph = BOOSTER_ICONS[name]
    c = BOOSTERS[color]
    sp = Sprite("booster_%s" % name, 72, 72, bottom=4)
    b = Box(72, 72, "round", (2, 1, 1, 1), c["rim"], [(c["top"], 0), (c["top"], .3), (c["mid"], .65), (c["bottom"], 1)],
            [dict(inset=True, dy=8, color=c["light"]), dict(inset=True, dy=-5, color=c["band"]), dict(inset=True, dy=-6, color=c["shade"]),
             dict(inset=True, dx=1, color=c["side"]), dict(inset=True, dx=-1, color=c["side"]),
             dict(dy=3, color=(90, 50, 20, .3)), dict(dy=4, color=(90, 50, 20, .15))])
    b.paint(sp.svg)
    ellipse_shine(sp.svg, 1 + 12 + 7, 2 + 9 + 4, 14, 8, -37, (255, 255, 255, .9))
    icon(sp.svg, glyph, 1, 2, 70, 69, 54, c["ink"], halo=c["halo"])
    return sp


def make_star(name, size):
    """.star: the bevel star with the rainbow inside it and the drop shadow of its filter"""
    k = size / 58.0
    sp = Sprite(name, size, size, right=1 * k, bottom=2.5 * k)
    svg = sp.svg
    outer = star_shape(0, 0, size)
    svg.fill(affinity.translate(outer, 1 * k, 2 * k).buffer(0.5 * k), (110, 80, 50, .2))
    svg.fill(affinity.translate(outer, 1 * k, 2 * k), (110, 80, 50, .32))
    gradient_box(svg, 0, 0, size, size, 160, [((255, 255, 255, .8), .1), ((220, 180, 140, .6), .4), ((90, 60, 50, .7), .75)], outer)
    inset = 1.5 * k
    inner = star_shape(inset, inset, size - 2 * inset)
    cx = cy = size / 2
    svg.fill(inner, RAINBOW[3])
    step = 2
    for t in range(0, 360, step):
        a0, a1 = math.radians(t - 20 - 90), math.radians(t - 20 + step + 0.8 - 90)
        wedge = Polygon([(cx, cy), (cx + size * math.cos(a0), cy + size * math.sin(a0)), (cx + size * math.cos((a0 + a1) / 2), cy + size * math.sin((a0 + a1) / 2)),
                         (cx + size * math.cos(a1), cy + size * math.sin(a1))])
        f = (t + step / 2) / 360 * (len(RAINBOW) - 1)
        i = min(int(f), len(RAINBOW) - 2)
        col = tuple(round(RAINBOW[i][j] + (RAINBOW[i + 1][j] - RAINBOW[i][j]) * (f - i)) for j in range(3))
        svg.fill(inner.intersection(wedge), col)
    svg.fill(inner, svg.radial(cx, cy, 10 * k, [((255, 255, 255, .5), 0), ((255, 255, 255, 0), 1)]))
    return sp


def make_moves():
    sp = Sprite("moves_box", 122, 126)
    svg = sp.svg
    svg.fill(Polygon([(122 * x / 100, 126 * y / 100) for x, y in TORN]), (175, 147, 109))
    paper = Polygon([(2 + 118 * x / 100, 2 + 122 * y / 100) for x, y in TORN])
    svg.fill(paper, svg.gradient(0, 2, 0, 124, [((241, 220, 186), 0), ((250, 228, 194), .06), ((246, 226, 190), .9), ((232, 208, 170), 1)]))
    return sp


def make_bar_fill():
    """.bar .fill: sliced across its width, the HUD stretches it with the score"""
    sp = Sprite("bar_fill", 24, 34, slices=(6, 0, 6, 0))
    Box(24, 34, 5, 0, None, [((255, 206, 123), 0), ((241, 184, 96), .12), ((222, 151, 65), .9), ((172, 121, 66), 1)],
        [dict(inset=True, dy=1, color=(146, 104, 41)), dict(inset=True, dx=-1, color=(165, 110, 50))]).paint(sp.svg)
    return sp


def make_screen():
    """.screen: the paper and its frame, sliced over the whole screen"""
    sp = Sprite("screen", 40, 40, slices=(8, 8, 8, 8))
    Box(40, 40, 0, 0, None, (242, 219, 185),
        [dict(inset=True, spread=1, color=(0xff, 0xfb, 0xf3)), dict(inset=True, spread=2, color=(0xf3, 0xe7, 0xd9)),
         dict(inset=True, spread=6, color=(0xee, 0xdc, 0xc2))]).paint(sp.svg)
    return sp


def sprites():
    out = []
    for size in TILE_SIZES:
        for kind in ("cream", "peach", "orange", "yellow", "active"):
            if size != "small" and kind == "active":
                continue
            out.append(make_tile(kind, size))
    out.append(make_panel("words_panel", 328, 174, 9, 1, (116, 89, 60), [((128, 99, 70), 0), ((142, 105, 74), 1)],
                          [dict(inset=True, dy=1, color=(160, 128, 96)), dict(inset=True, dy=-1, color=(170, 130, 85)), SINK]))
    out.append(make_moves())
    out.append(make_panel("task_panel", 455, 81, 9, 1, (141, 118, 90), (228, 199, 155),
                          [dict(inset=True, dy=1, color=(174, 147, 117)), SINK] + DROP, bottom=3))
    out.append(make_panel("star_slot", 56, 54, 7, 1, (150, 120, 84), (210, 180, 144),
                          [dict(inset=True, dy=1, color=(148, 118, 78)), SINK] + DROP, bottom=3))
    out.append(make_panel("input_field", 338, 59, 9, 1, (141, 121, 95), (249, 236, 217),
                          [dict(inset=True, dy=1, color=(182, 158, 138)), SINK] + DROP, bottom=3))
    out.append(make_panel("bar_track", 393, 38, 7, 2, (118, 89, 52), (138, 103, 76),
                          [dict(inset=True, dy=1, color=(125, 95, 66))] + DROP, bottom=3))
    out.append(make_bar_fill())
    out.append(make_button("green", "ζ"))
    out.append(make_button("red", "η"))
    out.append(make_button("green", "θ"))
    for name in BOOSTER_ICONS:
        out.append(make_booster(name))
    out.append(make_star("star", 58))
    out.append(make_star("star_small", 50))
    out.append(make_panel("charge_badge", 20, 20, 10, 1, (120, 80, 40), (250, 245, 230), []))
    out.append(make_screen())
    return out


def write_meta(path, slices):
    meta_path = path.with_name(path.name + ".meta")
    uid = None
    if meta_path.exists():
        uid = json.loads(meta_path.read_text())["Value"]["mId"]
    uid = uid or hashlib.md5(("wordfall-svg/" + path.name).encode()).hexdigest()
    value = {"mId": uid, "scalableMesh": True, "rasterized": True}
    if slices:
        value["sliceBorder"] = {"left": slices[0], "bottom": slices[3], "right": slices[2], "top": slices[1]}
        value["defaultMode"] = "Sliced"
    meta_path.write_text(json.dumps({"Type": "o2::VectorImageAsset::Meta", "Value": value}, indent=4) + "\n")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    if not (OUT.parent / "Svg.meta").exists():
        (OUT.parent / "Svg.meta").write_text(json.dumps({"Type": "o2::DefaultAssetMeta<o2::FolderAsset>", "Value": {
            "mId": hashlib.md5(b"wordfall-svg-folder").hexdigest()}}, indent=4) + "\n")
    manifest = {}
    for sp in sprites():
        path = OUT / (sp.name + ".svg")
        path.write_text(sp.svg.text())
        write_meta(path, sp.slices)
        manifest[sp.name] = {"size": [round(sp.svg.width, 3), round(sp.svg.height, 3)], "box": [sp.box_w, sp.box_h],
                             "margins": [round(m, 3) for m in sp.margins]}
    (ROOT / "Tools" / "WordFall" / "svg_sprites.json").write_text(json.dumps(manifest, indent=1) + "\n")
    print("wrote", len(manifest), "sprites into", OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
