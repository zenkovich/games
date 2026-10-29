#!/usr/bin/env python3
"""Static replica of the WordFall concept screen (Assets/Generated/concept.png, 471x1026) in plain
HTML + CSS - simple forms only: one div per tile / panel / button with a border, a gradient and a
shadow, stars and the parchment as clip-path polygons, every text a plain span in an embedded font
whose capitals and digits are traced from the concept (build_concept_font.py; the icons likewise,
build_concept_icons.py). Colours and rectangles are measured from the concept; the size and offset
per kind of text (board letter, corner digit, labels...) are the few numbers in css_screen_calib.json,
refined by --calibrate through headless Chrome.

    python3 Tools/WordFall/build_css_screen.py [--render] [--calibrate[=kind]]

The comparison is 1:1 - Chrome at device scale 1 in a 471x1026 window against the concept, pixel
for pixel. Output: Tools/WordFall/CssScreen/index.html; render, diff and report in Work/CssScreen/.
"""
import base64
import json
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import concept_layout as C

CONCEPT = ROOT / "Assets" / "Generated" / "concept.png"
WORK = ROOT / "Work" / "CssScreen"
FONT = WORK / "concept_font.ttf"
BOLD = ROOT / "Assets" / "WordFall" / "roboto_bold.ttf"
LABEL = ROOT / "Assets" / "WordFall" / "roboto_medium.ttf"
REGULAR = ROOT / "Tools" / "WordFall" / "roboto_regular.ttf"
ICONS = WORK / "concept_icons.ttf"
ICON_BOX = json.load(open(WORK / "concept_icons.json"))
CALIB = Path(__file__).resolve().parent / "css_screen_calib.json"
OUT = Path(__file__).resolve().parent / "CssScreen"
CHROME = os.environ.get("CHROME", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")

W, H = 471, 1026
MOCK = json.load(open(ROOT / "Sources" / "GameUITests" / "Data" / "wordfall_concept_mock.json"))
ROWS = MOCK["rows"]
VALUES = list(MOCK["values"])
VALUES[1], VALUES[3] = "1212122", "2212421"  # the mock misreads four corner digits of the concept
WORDS = [(t["word"], t["values"], t["states"]) for t in MOCK["wordTasks"]]
INK = "#2a0a00"
LIGHT = "#fcfff8"
CAP = 1456 / 2048                                        # Roboto cap height per em
CAP_TOP = ((2048 - 2400) / 2 + 1900) / 2048 - CAP        # cap top below a line-height-1 box top, em

# text kinds: their calibrated numbers (concept px): cap height `size`; letters sit `top` below the
# tile rim, shifted by dx; digits `right` / `bottom` from the tile's corner; labels and icons are
# measured from the concept and shifted by dx, dy
DEFAULT_CALIB = {
    "board": dict(size=31.5, top=15, dx=-1), "digit": dict(size=8.5, right=10, bottom=4),
    "word": dict(size=23, top=9, dx=-1.5), "wdigit": dict(size=6.5, right=5, bottom=3),
    "strip": dict(size=29, top=13, dx=-1),
    "count": dict(size=1, dx=0, dy=0), "moves": dict(size=1, dx=0, dy=0), "movesv": dict(size=1, dx=0, dy=0),
    "bar": dict(size=1, dx=0, dy=0), "icon": dict(size=1, dx=0, dy=0),
}


def load():
    a = np.array(Image.open(CONCEPT).convert("RGB")).astype(int)
    return a, a.mean(axis=2)


def rgb(c):
    return "rgb(%d,%d,%d)" % tuple(int(v) for v in c)


def median_color(a, lum, x0, y0, x1, y1, lo=0, hi=256):
    px = a[y0:y1, x0:x1].reshape(-1, 3)
    l = lum[y0:y1, x0:x1].reshape(-1)
    sel = px[(l >= lo) & (l < hi)]
    return tuple(int(v) for v in np.median(sel if len(sel) else px, axis=0))


def find_tile(lum, x0, y0, x1, y1, pad=8, frac=0.65, thr=125):
    """the rim of a tile expected at (x0, y0, x1, y1): near each expected edge, the outermost of the
    mostly-dark rows / columns that are dark along the straight part of the edge (the bevel line
    inside the rim can be darker, the anti-aliased ring outside it is lighter)"""
    dark = lum < thr
    w, h = x1 - x0, y1 - y0
    rows = [y for y in range(y0 - pad, y1 + pad) if dark[y, x0 - pad:x1 + pad].sum() >= frac * w]
    cols = [x for x in range(x0 - pad, x1 + pad) if dark[y0 - pad:y1 + pad, x].sum() >= frac * h]

    def pick(vals, t, mean, outer):
        n = min(vals, key=lambda v: abs(v - t))
        near = [v for v in vals if abs(v - n) <= 2]
        darkest = min(mean(v) for v in near)
        return outer([v for v in near if mean(v) <= darkest + 12])

    top = pick(rows, y0, lambda y: lum[y, x0 + 8:x1 - 8].mean(), min)
    bottom = pick(rows, y1 - 1, lambda y: lum[y, x0 + 8:x1 - 8].mean(), max)
    left = pick(cols, x0, lambda x: lum[y0 + 8:y1 - 8, x].mean(), min)
    right = pick(cols, x1 - 1, lambda x: lum[y0 + 8:y1 - 8, x].mean(), max)
    return (left, top, right + 1, bottom + 1)


def rim_line(dark, rect, inset=8, lum=None):
    """where the rim of a tile really is and how soft it is: for each edge, along the straight part,
    the darkest pixel of `dark` is the rim (the found rim or its neighbour, not the next tile's) and
    the pixels just inside and outside it carry a share of the rim's darkness in `lum` (the
    concept's rims sit between pixels). Returns the rectangle and, per side (t, r, b, l), the inner
    and outer shares"""
    lum = dark if lum is None else lum
    x0, y0, x1, y1 = rect
    edges = []
    for sl, pos, flip in (((slice(y0 - 3, y0 + 4), slice(x0 + inset, x1 - inset), 1), y0 - 3, False), ((slice(y1 - 4, y1 + 3), slice(x0 + inset, x1 - inset), 1), y1 - 4, True),
                          ((slice(y0 + inset, y1 - inset), slice(x0 - 3, x0 + 4), 0), x0 - 3, False), ((slice(y0 + inset, y1 - inset), slice(x1 - 4, x1 + 3), 0), x1 - 4, True)):
        ys, xs, axis = sl
        i = 2 + int(np.argmin(dark[ys, xs].mean(axis=axis)[2:5]))
        prof = lum[ys, xs].mean(axis=axis)
        share = lambda j, ref: float(np.clip((prof[ref] - prof[j]) / max(1, prof[ref] - prof[i]), 0, 1))
        before, after = share(i - 1, i - 2), share(i + 1, i + 2)
        edges.append((pos + i, (after, before) if not flip else (before, after)))  # (inner, outer)
    (t, ta), (b, ba), (l, la), (r, ra) = edges
    return (l, t, r + 1, b + 1), (ta, ra, ba, la)


def row_color(a, lum, x0, x1, y, lo=0, hi=256, usable=None):
    """the colour of a row of the window: the median of its pixels within lo..hi (or of the usable ones)"""
    if usable is None:
        return median_color(a, lum, x0, y, x1, y + 1, lo, hi)
    sel = a[y, x0:x1][usable[y, x0:x1]]
    return tuple(int(v) for v in np.median(sel, axis=0)) if len(sel) >= min(4, max(2, (x1 - x0) // 2)) else None


def col_color(a, lum, x, y0, y1, lo=0, hi=256, usable=None):
    """the colour of a column of the window, like row_color"""
    if usable is None:
        return median_color(a, lum, x, y0, x + 1, y1, lo, hi)
    sel = a[y0:y1, x][usable[y0:y1, x]]
    return tuple(int(v) for v in np.median(sel, axis=0)) if len(sel) >= 4 else None


def gradient_of(rows, tol=10):
    """a vertical linear-gradient reproducing a list of row colours within tol: the stops of a greedy
    piecewise-linear fit"""
    pts = np.array(rows, float)
    n = len(pts)
    keep, i = [0], 0
    while i < n - 1:
        best = i + 1
        for j in range(i + 1, n):
            t = np.linspace(0, 1, j - i + 1)[:, None]
            if np.abs(pts[i] * (1 - t) + pts[j] * t - pts[i:j + 1]).max() <= tol:
                best = j
            else:
                break
        keep.append(best)
        i = best
    return "linear-gradient(%s)" % ",".join("%s %gpx" % (rgb(pts[k].round()), k + 0.5) for k in keep)


def gradient(a, lum, x0, x1, y0, y1, tol=10, lo=0, hi=256, usable=None):
    rows = [row_color(a, lum, x0, x1, y, lo, hi, usable) for y in range(y0, y1)]
    for i in range(len(rows)):
        if rows[i] is None:
            rows[i] = rows[i - 1] if i and rows[i - 1] else next((r for r in rows[i:] if r), (0, 0, 0))
    return gradient_of(rows, tol)


def polygon(mask, tol=1.5):
    """the outline of a mask as a clip-path polygon, in pixels of the mask"""
    import build_concept_font as F
    up = ndimage.binary_opening(ndimage.zoom(mask.astype(float), 4, order=1) > 0.5, iterations=1)
    loop = sorted(F.trace(up), key=len, reverse=True)[0]
    return "polygon(%s)" % ",".join("%gpx %gpx" % (round(x / 4, 1), round(y / 4, 1)) for x, y in F.simplify(loop, tol * 4))


class Page:
    """mode: full - the page; bg - the page without text; text - the text alone, black on white"""

    def __init__(self, calib, mode):
        self.calib, self.mode = calib, mode
        self.parts = []
        self.texts = {}  # id -> (kind, window, exclude, colour)

    def box(self, cls, rect, style="", inner=""):
        if self.mode == "text":
            return
        x0, y0, x1, y1 = rect
        self.parts.append('<div class="%s" style="left:%gpx;top:%gpx;width:%gpx;height:%gpx;%s">%s</div>'
                          % (cls, x0, y0, x1 - x0, y1 - y0, style, inner))

    def text(self, tid, kind, s, cx, cap_top, cap, color=INK, window=None, exclude=None, cls="", style=""):
        """a text centred at x = cx with its cap top at cap_top and cap height `cap`; a label or icon
        is scaled and shifted by its kind's calibration"""
        c = self.calib[kind]
        if "dy" in c:
            cap, cx, cap_top = cap * c["size"], cx + c["dx"], cap_top + c["dy"]
        size = cap / CAP
        if window:
            self.texts[tid] = (kind, window, exclude, color)
        if self.mode == "bg":
            return
        width = max(60, len(s) * size)
        col = "#000" if self.mode == "text" else color
        self.parts.append('<span class="%s" style="left:%gpx;top:%gpx;width:%gpx;font-size:%gpx;color:%s;%s">%s</span>'
                          % (cls, cx - width / 2, round(cap_top - CAP_TOP * size), width, size, col, style, s))


def panel(p, a, lum, cls, rect, radius, inset=8, lo=0, hi=256, shadow=3, cols=None, measure=True, dark=None, usable=None, margin=None, frame=None):
    """a rounded box built from what the concept paints: the rim as the border (each side its own
    colour and width), the anti-aliased line outside the rim per side, the bands of rows inside the
    top and bottom rims as stacked inset shadows (so they follow the rounded corners), the line just
    inside the left and right rims, the body rows as a gradient, and the rows under the box as drop
    shadows"""
    shadows = []
    x0, y0, x1, y1 = rect
    if frame:  # the same frame for every tile of a state: rim width and colour, the rings inside it
        width, rim, rings = frame
        shadows = ["inset 0 0 0 %dpx %s" % (d + 1, rgb(c)) for d, c in enumerate(rings)]
        px0, px1 = x0 + width + len(rings) + 2, x0 + width + len(rings) + 7
        rows = [row_color(a, lum, px0, px1, y, lo, hi) for y in range(y0 + width + len(rings), y1 - width - len(rings))]
        body = tuple(int(v) for v in np.median(np.array(rows), axis=0))
        for i in range(shadow):
            shadows.append("0 %dpx 0 %s" % (i + 1, rgb(median_color(a, lum, x0 + inset, y1 + i, x1 - inset, y1 + i + 1))))
        flat = [body] * len(rings) + rows + [body] * len(rings)
        p.box(cls, rect, "border-width:%dpx;border-color:%s;border-radius:%dpx;background:%s;box-shadow:%s;"
              % (width, rgb(rim), radius, gradient_of(flat), ",".join(shadows)))
        return
    if measure:
        rect, soft = rim_line(dark if dark is not None else lum, rect, inset, lum)
        x0, y0, x1, y1 = rect
        rim = median_color(a, lum, x0 + inset, y0, x1 - inset, y0 + 1)
        for (inner, outer), outset_at in zip(soft, ("0 -1px", "1px 0", None, "-1px 0")):
            if outer > 0.12 and outset_at:
                shadows.append("%s 0 0 rgba(%d,%d,%d,%.2f)" % (outset_at, *rim, outer))
    else:
        above = median_color(a, lum, x0 + inset, y0 - 1, x1 - inset, y0)
        if max(abs(u - v) for u, v in zip(above, (242, 219, 185))) > 20:
            shadows.append("0 -1px 0 %s" % rgb(above))
    mid_row = lambda y: median_color(a, lum, x0 + inset, y, x1 - inset, y + 1)
    mid_col = lambda x: median_color(a, lum, x, y0 + inset, x + 1, y1 - inset)
    sides = (mid_row(y0), mid_col(x1 - 1), mid_row(y1 - 1), mid_col(x0))
    nxt = (mid_row(y0 + 1), mid_col(x1 - 2), mid_row(y1 - 2), mid_col(x0 + 1))
    widths = tuple(2 if sum(n) / 3 < 140 and max(abs(u - v) for u, v in zip(c, n)) < 30 else 1 for c, n in zip(sides, nxt))
    wt, wr, wb, wl = widths
    px0, px1 = cols or (x0 + inset, x1 - inset)
    if margin:  # read the body from the strip just inside the left rim (the middle holds something else)
        px0, px1 = x0 + wl + 1, x0 + wl + 1 + margin
    else:
        px0 = max(px0, x0 + wl + 3)
    rows = [row_color(a, lum, px0, px1, y, lo, hi, usable) for y in range(y0 + wt, y1 - wb)]
    for i in range(len(rows)):  # a row with nothing to read repeats its neighbour
        if rows[i] is None:
            rows[i] = rows[i - 1] if i and rows[i - 1] else next((r for r in rows[i:] if r), (0, 0, 0))
    n = len(rows)
    body = tuple(int(v) for v in np.median(np.array(rows[n // 3:2 * n // 3]), axis=0))
    far = lambda c: max(abs(u - v) for u, v in zip(c, body)) > 10
    kt = next((i for i in range(min(8, n)) if not far(rows[i])), min(8, n))
    kb = next((i for i in range(min(8, n)) if not far(rows[n - 1 - i])), min(8, n))
    side = {}
    for key, xs in (("l", [x0 + wl + d for d in range(6)]), ("r", [x1 - wr - 1 - d for d in range(6)])):
        band = []
        for x in xs:  # the band of columns inside the side rim, as far as it differs from the body
            c = col_color(a, lum, x, y0 + inset, y1 - inset, lo, hi, usable)
            if not c or not far(c):
                break
            band.append(c)
        side[key] = band
    close = lambda u, v: max(abs(i - j) for i, j in zip(u, v)) < 60
    # a frame of about one colour on all four sides is one ring per depth (their mean), so it
    # follows the corners instead of breaking into four lines
    rings = 0
    while rings < min(kt, kb, len(side["l"]), len(side["r"])) and close(rows[rings], rows[n - 1 - rings]) and close(rows[rings], side["l"][rings]) and close(rows[rings], side["r"][rings]):
        rings += 1
    if rings < 2 or not all(max(abs(u - v) for u, v in zip(c, body)) > 60 for c in (rows[0], rows[n - 1], side["l"][0], side["r"][0])):
        rings = 0  # a highlight or a shadow line is not a frame
    for d in range(rings):
        shadows.append("inset 0 0 0 %dpx %s" % (d + 1, rgb(np.mean([rows[d], rows[n - 1 - d], side["l"][d], side["r"][d]], axis=0))))
    for d in range(rings + 1, kt + 1):
        shadows.append("inset 0 %dpx 0 %s" % (d, rgb(rows[d - 1])))
    for d in range(rings + 1, kb + 1):
        shadows.append("inset 0 -%dpx 0 %s" % (d, rgb(rows[n - d])))
    for key, where in (("l", "%dpx 0"), ("r", "-%dpx 0")):
        for d, c in enumerate(side[key]):
            if d >= rings:
                shadows.append("inset %s 0 %s" % (where % (d + 1), rgb(c)))
    for i in range(shadow):
        shadows.append("0 %dpx 0 %s" % (i + 1, rgb(mid_row(y1 + i))))
    flat = [body] * kt + rows[kt:n - kb] + [body] * kb
    p.box(cls, rect, "border-width:%dpx %dpx %dpx %dpx;border-color:%s %s %s %s;border-radius:%dpx;background:%s;box-shadow:%s;"
          % (wt, wr, wb, wl, *map(rgb, sides), radius, gradient_of(flat), ",".join(shadows)))


def navy_frame(a, lum, navy, x0, y0):
    """an active word tile: its rim is the run of dark navy rows / columns on each side (measured
    along the middle of the edge), the rings the three lines inside the rim. Returns the rim width,
    the rectangle spanning the rims, the rim colour and the ring colours"""
    cx, cy = x0 + 21, y0 + 20

    def run(at, start, step):
        i = start
        while navy[at(i)] >= 100:
            i += step
        n = 0
        while navy[at(i + n * step)] < 100:
            n += 1
        return i, n

    top, nt = run(lambda y: (y, cx), y0 - 6, 1)
    left, nl = run(lambda x: (cy, x), x0 - 6, 1)
    bottom, nb = run(lambda y: (y, cx), y0 + 46, -1)
    right, nr = run(lambda x: (cy, x), x0 + 48, -1)
    width = int(np.median([nt, nl, nb, nr]))  # the navy rim (two pixels), then the light-blue rings
    rect = (left, top, right + 1, bottom + 1)
    rim = median_color(a, lum, left + 8, top, right - 8, top + width)
    rings = [median_color(a, lum, left + 8, top + width + d, right - 8, top + width + d + 1) for d in range(4)]
    return width, rect, rim, rings


def tile(p, a, lum, cls, rect, radius, letter, digit, tid, lkind, dkind, dark=None, frame=None):
    """a letter tile with its corner value"""
    x0, y0, x1, y1 = rect
    panel(p, a, lum, cls, rect, radius, lo=130, cols=(x0 + 3, x0 + 8), dark=dark, frame=frame)
    corner = (x1 - 19, y1 - 21, x1 - 3, y1 - 3) if lkind == "board" else (x1 - 14, y1 - 16, x1 - 3, y1 - 3)
    c = p.calib[lkind]
    p.text(tid, lkind, letter, (x0 + x1) / 2 + c["dx"], y0 + c["top"], c["size"], window=(x0 + 3, y0 + 3, x1 - 3, y1 - 3), exclude=corner, cls="l")
    if digit:
        d = p.calib[dkind]
        p.text(tid + "d", dkind, digit, x1 - d["right"], y1 - d["bottom"] - d["size"], d["size"], window=corner, cls="v")


def star(p, a, lum, rect):
    """a five-point star with rounded tips and notches at the concept's centre and radii (the
    saturated pixels' centroid, the median tip and notch radius), its rainbow sampled around the
    centre and the pale centre; a bevel outline (light top-left, dark bottom-right) and a soft shadow
    under it"""
    x0, y0, x1, y1 = rect
    sub = a[y0:y1, x0:x1]
    m = (sub.max(axis=2) - sub.min(axis=2)) > 70
    labels, n = ndimage.label(m)
    m = labels == (int(np.argmax(ndimage.sum(m, labels, range(1, n + 1)))) + 1)
    ys, xs = np.where(m)
    cx, cy = xs.mean() + 0.5, ys.mean() + 0.5
    for _ in range(3):  # the centre from the five tips, which the shadow does not move
        ang = np.degrees(np.arctan2(ys + 0.5 - cy, xs + 0.5 - cx))
        dist = np.hypot(xs + 0.5 - cx, ys + 0.5 - cy)
        tips = []
        for t in range(-90, 270, 72):
            sel = np.abs((ang - t + 180) % 360 - 180) < 6
            i = np.argmax(np.where(sel, dist, -1))
            tips.append((xs[i] + 0.5, ys[i] + 0.5, dist[i]))
        cx, cy = np.mean([t[0] for t in tips]), np.mean([t[1] for t in tips])
    ro = float(np.mean(sorted(t[2] for t in tips)[1:])) + 1.5
    cx, cy = x0 + cx, y0 + cy
    ri = ro * 0.53
    R = int(np.ceil(ro)) + 2

    def outline(grow):
        """the sharp star's radius per degree, smoothed over +-7 degrees: rounded tips and notches"""
        verts = [((ro if k % 2 == 0 else ri) + grow, np.radians(-90 + 36 * k)) for k in range(10)]
        rad = []
        for t in range(360):
            tt = np.radians(t)
            d = np.array([np.cos(tt), np.sin(tt)])
            best = 0
            for k in range(10):
                r1, a1 = verts[k]
                r2, a2 = verts[(k + 1) % 10]
                p1, p2 = r1 * np.array([np.cos(a1), np.sin(a1)]), r2 * np.array([np.cos(a2), np.sin(a2)])
                e = p2 - p1
                den = d[0] * -e[1] + d[1] * e[0]
                if abs(den) < 1e-9:
                    continue
                s_, u = (p1[0] * -e[1] + p1[1] * e[0]) / den, (d[0] * p1[1] - d[1] * p1[0]) / den
                if s_ > 0 and -1e-6 <= u <= 1 + 1e-6:
                    best = max(best, s_)
            rad.append(best)
        rad = np.convolve(np.pad(rad, 4, mode="wrap"), np.ones(9) / 9, mode="valid")
        return "polygon(%s)" % ",".join("%.1fpx %.1fpx" % (R + rad[t] * np.cos(np.radians(t)), R + rad[t] * np.sin(np.radians(t))) for t in range(0, 360, 3))

    box = (int(round(cx - R)), int(round(cy - R)), int(round(cx - R)) + 2 * R, int(round(cy - R)) + 2 * R)
    rs = ro * 0.42
    stops = ",".join("%s %ddeg" % (rgb(a[int(cy + rs * np.sin(np.radians(t - 90))), int(cx + rs * np.cos(np.radians(t - 90)))]), t) for t in range(0, 361, 15))
    centre = median_color(a, lum, int(cx) - 2, int(cy) - 2, int(cx) + 3, int(cy) + 3, lo=160)
    edge = np.median(sub[m & ~ndimage.binary_erosion(m, iterations=2)], axis=0)
    p.box("star", (box[0] + 2, box[1] + 3, box[2] + 2, box[3] + 3), "clip-path:%s;background:rgba(110,80,50,.3);" % outline(0.5))
    p.box("star", (box[0] + 1, box[1] + 2, box[2] + 1, box[3] + 2), "clip-path:%s;background:rgba(110,80,50,.4);" % outline(0.5))
    p.box("star", box, "clip-path:%s;background:linear-gradient(135deg,rgba(255,255,255,.8) 25%%,rgba(%d,%d,%d,.5) 50%%,rgba(90,60,50,.6));" % (outline(0.6), *edge))
    p.box("star", box, "clip-path:%s;background:radial-gradient(circle,%s 0,transparent 7px),conic-gradient(%s);" % (outline(-0.2), rgb(centre), stops))


def button(p, a, lum, rect, icon, tid):
    """a rounded button with its icon"""
    rect = find_tile(lum, *rect, pad=4, frac=0.5, thr=110)
    panel(p, a, lum, "panel", rect, 10, inset=10, usable=~ndimage.binary_dilation(lum > 185, iterations=2))
    x0, y0 = rect[0], rect[1]
    win = lum[y0 + 3:y0 + 14, x0 + 3:x0 + 14]
    face = np.median(lum[y0 + 3:y0 + 14, x0 + 12:x0 + 30], axis=1)[:, None]
    sh = (win > face + 15) & (win < 215)
    if sh.sum() >= 4:
        hy, hx = np.where(sh)
        alpha = float(np.mean((win - face)[sh]) / (255 - face.mean()))
        p.box("shine", (x0 + 3 + hx.min(), y0 + 3 + hy.min(), x0 + 4 + hx.max(), y0 + 4 + hy.max()), "background:rgba(255,255,255,%.2f);" % min(0.8, alpha))
    ix0, iy0, ix1, iy1 = ICON_BOX[icon]
    p.text(tid, "icon", icon, (ix0 + ix1) / 2, iy0, iy1 - iy0, color=LIGHT, window=(rect[0] + 3, rect[1] + 3, rect[2] - 3, rect[3] - 3), cls="i")


def booster(p, a, lum, x0, x1, icon, tid):
    """a round button as one ellipse: a two-pixel rim on top and one pixel elsewhere, the rows the
    concept paints just inside the rim (the light ring under the top rim, the dark bevel band and
    the light line above it at the bottom, the blends at the sides) as inset shadows that follow the
    curve, the face rows as a gradient, the rows under the button as drop shadows, the highlight and
    the icon with its light halo"""
    y0, y1 = 940, 1013
    row = lum[975]
    x0 = min(range(x0 - 2, x0 + 3), key=lambda x: row[x])
    x1 = max(x for x in range(x1 - 3, x1 + 2) if row[x] < 100) + 1
    cx = (x0 + x1) / 2
    ink = median_color(a, lum, x0, y0, x1, y1, hi=70)
    ok = ~ndimage.binary_dilation(lum < 85, iterations=3) & (lum < 212)
    rows = [row_color(a, lum, int(cx) - 12, int(cx) + 12, y, usable=ok) for y in range(y0 + 2, y1 - 1)]
    for i in range(len(rows)):
        if rows[i] is None:
            rows[i] = rows[i - 1] if i and rows[i - 1] else next((r for r in rows[i:] if r), ink)
    body = rows[len(rows) // 2]
    far = lambda c: max(abs(u - v) for u, v in zip(c, body)) > 12
    kt = next((i for i in range(10) if not far(rows[i])), 10)
    dark = lambda c: sum(c) / 3 < sum(body) / 3 - 35
    kb = next((i for i in range(12) if not dark(rows[-1 - i])), 12)
    shadows = ["0 0 0 1px rgba(%d,%d,%d,.3)" % ink]
    shadows += ["inset 0 %dpx 0 %s" % (d + 1, rgb(rows[d])) for d in range(kt)]
    shadows += ["inset 0 -%dpx 0 %s" % (d + 1, rgb(rows[-1 - d])) for d in range(kb)]
    eq = (y0 + y1) // 2
    shadows += ["inset 1px 0 0 %s" % rgb(median_color(a, lum, x0 + 1, eq - 6, x0 + 2, eq + 6)),
                "inset -1px 0 0 %s" % rgb(median_color(a, lum, x1 - 2, eq - 6, x1 - 1, eq + 6))]
    shadows += ["0 %dpx 0 %s" % (i + 1, rgb(median_color(a, lum, int(cx) - 10, y1 + i, int(cx) + 10, y1 + i + 1))) for i in range(4)]
    flat = [body] * kt + rows[kt:len(rows) - kb] + [body] * kb
    p.box("face", (x0, y0, x1, y1), "border-width:2px 1px 1px 1px;border-color:%s;background:%s;box-shadow:%s;" % (rgb(ink), gradient_of(flat), ",".join(shadows)))
    halo = median_color(a, lum, x0 + 10, y0 + 10, x1 - 10, y1 - 12, lo=190, hi=250)
    p.box("shine", (cx - 23, 950, cx - 10, 958))
    ix0, iy0, ix1, iy1 = ICON_BOX[icon]
    p.text(tid, "icon", icon, (ix0 + ix1) / 2, iy0, iy1 - iy0, color=rgb(median_color(a, lum, ix0, iy0, ix1, iy1, hi=75)),
           window=(x0 + 8, y0 + 10, x1 - 8, y1 - 12), cls="i g", style="text-shadow:1px 0 0 %s,-1px 0 0 %s,0 1px 0 %s,0 -1px 0 %s;" % (("rgba(%d,%d,%d,.7)" % halo,) * 4))


def parchment(p, a, lum, rect, texts):
    """the moves box: the concept's torn silhouette, the rim colour outside and the paper inside"""
    x0, y0, x1, y1 = rect
    m = lum[y0:y1, x0:x1] < 205
    for tx0, ty0, tx1, ty1 in texts:
        m[ty0 - y0:ty1 - y0, tx0 - x0:tx1 - x0] = False
    m = ndimage.binary_fill_holes(ndimage.binary_closing(m, iterations=2))
    labels, n = ndimage.label(m)
    m = labels == (int(np.argmax(ndimage.sum(m, labels, range(1, n + 1)))) + 1)
    edge = m & ~ndimage.binary_erosion(m, iterations=2)
    rim = tuple(int(v) for v in np.median(a[y0:y1, x0:x1][edge], axis=0))
    p.box("parchment", rect, "clip-path:%s;background:%s;" % (polygon(m, 0.6), rgb(rim)),
          '<div class="paper" style="clip-path:%s;background:%s"></div>' % (polygon(ndimage.binary_erosion(m, iterations=2), 0.6), gradient(a, lum, 350, 450, y0, y1, lo=140)))


def label(p, a, lum, tid, kind, s, window, light=False, caps=None, **kw):
    """a free text centred on the concept's ink, with the cap height of the ink in `caps` (the
    capitals / digits of the text; the whole window by default)"""
    x0, y0, x1, y1 = window
    ink = (lum > 200) if light else (lum < 110)
    ys, xs = np.where(ink[y0:y1, x0:x1])
    cx0, cy0, cx1, cy1 = caps or window
    cys = np.where(ink[cy0:cy1, cx0:cx1])[0]
    p.text(tid, kind, s, x0 + (xs.min() + xs.max() + 1) / 2, cy0 + cys.min(), cys.max() + 1 - cys.min(), window=window, **kw)


def build(calib, mode="full"):
    a, lum = load()
    p = Page(calib, mode)

    p.box("panel", (8, 8, 329, 178), "border-color:%s %s %s %s;border-radius:9px;background:%s;box-shadow:0 0 0 1px %s;"
          % (rgb(median_color(a, lum, 200, 8, 300, 9)), rgb(median_color(a, lum, 328, 60, 329, 130)), rgb(median_color(a, lum, 200, 177, 300, 178)),
             rgb(median_color(a, lum, 8, 60, 9, 130)), gradient(a, lum, 300, 326, 9, 177), rgb(median_color(a, lum, 7, 60, 8, 130))))
    # an active tile's rim is dark blue, the others' brown: each kind searches its own colour
    navy = np.where(a[:, :, 2] > a[:, :, 0] + 10, lum, 255)
    brown = np.where(a[:, :, 2] > a[:, :, 0] + 20, 255, lum)
    active = {}
    for w, (word, vals, states) in enumerate(WORDS):
        for l, letter in enumerate(word):
            if states[l] != "a":
                continue
            x0, y0 = 10 + 46 * l, 9 + 42 * w
            active[(w, l)] = navy_frame(a, lum, navy, x0, y0)
    widths = [f[0] for f in active.values()]
    frame = (int(np.median(widths)), tuple(int(v) for v in np.median([f[2] for f in active.values()], axis=0)),
             [tuple(int(v) for v in np.median([f[3][d] for f in active.values()], axis=0)) for d in range(4)])
    for w, (word, vals, states) in enumerate(WORDS):
        for l, letter in enumerate(word):
            x0, y0 = 10 + 46 * l, 9 + 42 * w
            if states[l] == "a":
                tile(p, a, lum, "tile", active[(w, l)][1], 7, letter, vals[l], "w%d_%d" % (w, l), "word", "wdigit", frame=frame)
            else:
                rect = find_tile(brown, x0, y0, x0 + 43, y0 + 41, pad=6)
                tile(p, a, lum, "tile", rect, 7, letter, vals[l], "w%d_%d" % (w, l), "word", "wdigit", dark=brown)

    parchment(p, a, lum, (334, 4, 466, 130), ((342, 16, 460, 47), (344, 48, 458, 108)))
    label(p, a, lum, "moves", "moves", "Moves Left:", (342, 16, 460, 47), cls="t")
    label(p, a, lum, "movesv", "movesv", str(MOCK["moves"]), (344, 48, 458, 108))

    panel(p, a, lum, "panel", (7, 188, 463, 271), 9, inset=12)
    strip = find_tile(lum, 17, 202, 71, 258, pad=6)
    other = MOCK["otherTasks"][0]
    tile(p, a, lum, "tile", strip, 8, other["letter"], None, "stripw", "strip", None)
    label(p, a, lum, "count", "count", "%d/%d" % (other["progress"], other["count"]), (80, 200, 160, 258), cls="t")
    frame = find_tile(lum, 172, 202, 229, 258, pad=4, thr=150)
    panel(p, a, lum, "panel", frame, 7, inset=5, shadow=1, margin=3)
    star(p, a, lum, (frame[0] + 1, frame[1] + 1, frame[2] - 1, frame[3] - 1))
    button(p, a, lum, (238, 200, 291, 257), "θ", "scheck")

    star(p, a, lum, (6, 268, 64, 330))
    panel(p, a, lum, "panel", (70, 284, 463, 322), 7, inset=12, cols=(360, 455), measure=False)
    p.box("fill", (71, 284, 70 + round(393 * C.BAR_FILL_FRACTION), 321), "box-shadow:inset 0 1px 0 %s;background:%s;"
          % (rgb(median_color(a, lum, 80, 284, 128, 285)), gradient(a, lum, 80, 128, 285, 321)))
    p.outline = median_color(a, lum, 240, 290, 352, 318, hi=95)
    label(p, a, lum, "bar", "bar", "Progress: %d / %d" % (MOCK["score"], MOCK["target"]), (131, 287, 352, 320), light=True, caps=(240, 287, 352, 320),
          color=rgb(median_color(a, lum, 240, 290, 352, 318, lo=236)), cls="bar")

    panel(p, a, lum, "panel", (7, 334, 349, 393), 9, inset=12)
    button(p, a, lum, (355, 334, 406, 392), "ζ", "accept")
    button(p, a, lum, (411, 335, 463, 392), "η", "cancel")

    for r in range(8):
        for c in range(7):
            x0, y0 = [8, 75, 142, 209, 277, 344, 406][c], 407 + 66 * r
            rect = find_tile(lum, x0, y0, x0 + (61 if c < 5 else 56), y0 + 56)
            tile(p, a, lum, "tile", rect, 8, ROWS[r][c], VALUES[r][c], "b%d_%d" % (r, c), "board", "digit")

    for i, (x0, x1, icon) in enumerate(((13, 84, "α"), (109, 180, "β"), (204, 276, "γ"), (301, 370, "δ"), (393, 458, "ε"))):
        booster(p, a, lum, x0, x1, icon, "boost%d" % i)

    font = base64.b64encode(FONT.read_bytes()).decode()
    bold = base64.b64encode(BOLD.read_bytes()).decode()
    label_font = base64.b64encode(LABEL.read_bytes()).decode()
    regular = base64.b64encode(REGULAR.read_bytes()).decode()
    icons = base64.b64encode(ICONS.read_bytes()).decode()
    html = """<!doctype html>
<html><head><meta charset="utf-8"><title>WordFall concept screen</title>
<style>
@font-face { font-family: Concept; src: url(data:font/ttf;base64,%s); }
@font-face { font-family: Concept; src: url(data:font/ttf;base64,%s); font-weight: bold; }
@font-face { font-family: Label; src: url(data:font/ttf;base64,%s); }
@font-face { font-family: Text; src: url(data:font/ttf;base64,%s); }
@font-face { font-family: Icons; src: url(data:font/ttf;base64,%s); }
html, body { margin: 0; padding: 0; }
body { width: %dpx; height: %dpx; position: relative; overflow: hidden; background: %s; font-family: Concept, Roboto, sans-serif;
       box-shadow: inset 0 0 0 1px #fffbf3, inset 0 0 0 2px #f3e7d9, inset 0 0 0 6px #eedcc2, inset 0 -4px 0 #fbf2e7; }
div, span { position: absolute; box-sizing: border-box; }
.panel, .tile, .side, .face { border: 1px solid; }
.side, .face, .shine { border-radius: 50%%; }
.face { border: 1px solid; }
.shine { background: rgba(255,255,255,.9); transform: rotate(-37deg); }
.paper { left: 0; top: 0; width: 100%%; height: 100%%; }
.fill { border-radius: 6px 0 0 6px; }
span { line-height: 1; text-align: center; white-space: nowrap; }
.i { font-family: Icons; text-shadow: 0 1px 1px rgba(0,0,0,.35); -webkit-text-stroke: 0.5px rgba(0,0,0,.25); paint-order: stroke fill; }
.g { -webkit-text-stroke: 0; }
.v { font-weight: bold; }
.t { font-family: Label, Roboto, sans-serif; }
.bar { font-family: Text, Roboto, sans-serif; -webkit-text-stroke: 2px rgb(%s); paint-order: stroke fill; }
</style></head><body>
%s
</body></html>
""" % (font, bold, label_font, regular, icons, W, H, "#fff" if mode == "text" else "rgb(242,219,185)", "%d,%d,%d" % p.outline, "\n".join(p.parts))
    path = OUT / "index.html" if mode == "full" else WORK / ("%s.html" % mode)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(html)
    return p, path


def shoot(html, png):
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
                    "--window-size=%d,%d" % (W, H), "--screenshot=%s" % png, "file://%s" % html], check=True, capture_output=True)
    r = np.array(Image.open(png).convert("RGB")).astype(int)
    assert r.shape == (H, W, 3), r.shape
    return r


REGIONS = {"words": (7, 7, 330, 178), "moves": (336, 7, 463, 127), "strip": (7, 188, 463, 272), "bar": (5, 271, 463, 338),
           "input": (7, 333, 463, 393), "board": (7, 404, 463, 932), "boosters": (10, 938, 462, 1016)}


def render():
    r = shoot(OUT / "index.html", WORK / "render.png")
    c, _ = load()
    for tol in (24, 48):
        same = np.abs(r - c).max(axis=2) <= tol
        print("tolerance %d: match %.2f%% (%d px differ)" % (tol, same.mean() * 100, (~same).sum()))
        if tol == 24:
            diff = c.astype(np.uint8).copy()
            diff[~same] = (255, 0, 255)
            Image.fromarray(diff).save(WORK / "diff.png")
            print("  " + "  ".join("%s %.1f%%" % (n, same[y0:y1, x0:x1].mean() * 100) for n, (x0, y0, x1, y1) in REGIONS.items()))


def hex_rgb(s):
    if s.startswith("rgb"):
        return np.array([int(v) for v in s[4:-1].split(",")], float)
    return np.array([int(s.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4)], float)


def calibrate(calib, tol=24):
    """per kind of text: the size and the shift that match the concept best, scored by compositing
    the text layer over the render without text at whole-pixel shifts"""
    page, _ = build(calib, "bg")
    bg = shoot(WORK / "bg.html", WORK / "bg.png")
    concept, _ = load()

    def score(kind, tr, reach):
        best = None
        for dy in range(-reach, reach + 1):
            for dx in range(-reach, reach + 1):
                bad = 0
                for tid, (k, (x0, y0, x1, y1), ex, color) in page.texts.items():
                    if k != kind:
                        continue
                    al = np.pad((255 - tr[y0:y1, x0:x1].mean(axis=2)) / 255, reach)[reach - dy:reach - dy + y1 - y0, reach - dx:reach - dx + x1 - x0][:, :, None]
                    comp = bg[y0:y1, x0:x1] * (1 - al) + hex_rgb(color) * al
                    mask = np.abs(comp - concept[y0:y1, x0:x1]).max(axis=2) > tol
                    if ex:
                        mask[max(0, ex[1] - y0):ex[3] - y0, max(0, ex[0] - x0):ex[2] - x0] = False
                    bad += int(mask.sum())
                if best is None or bad < best[0]:
                    best = (bad, dx, dy)
        return best

    def shifted(c, dx, dy):
        c = dict(c)
        if "top" in c:
            c["dx"], c["top"] = round(c["dx"] + dx, 2), c["top"] + dy
        elif "right" in c:
            c["right"], c["bottom"] = round(c["right"] - dx, 2), c["bottom"] - dy
        else:
            c["dx"], c["dy"] = round(c["dx"] + dx, 2), c["dy"] + dy
        return c

    def trial(kind, cand, reach):
        saved, calib[kind] = calib[kind], cand
        _, html = build(calib, "text")
        result = score(kind, shoot(html, WORK / "text.png"), reach)
        calib[kind] = saved
        return result

    only = [v.split("=", 1)[1] for v in sys.argv if v.startswith("--calibrate=")]
    for kind in sorted({k for k, *_ in page.texts.values()} & (set(only) or {k for k, *_ in page.texts.values()})):
        base = calib[kind]
        best = None
        for f in (0.9, 0.95, 1.0, 1.05, 1.1):
            cand = dict(base, size=round(base["size"] * f, 3))
            bad, dx, dy = trial(kind, cand, 4)
            if best is None or bad < best[0]:
                best = (bad, shifted(cand, dx, dy), f, dx, dy)
        for fx in (0.25, 0.5, 0.75):
            cand = shifted(best[1], fx, 0)
            bad = trial(kind, cand, 0)[0]
            if bad < best[0]:
                best = (bad, cand) + best[2:]
        calib[kind] = best[1]
        print("  %-7s size x%.2f shift %+d %+d -> %s: %d px differ" % (kind, best[2], best[3], best[4], best[1], best[0]))
    json.dump(calib, open(CALIB, "w"), indent=1, sort_keys=True)


def write_fonts_css():
    """the fonts of the hand-written game page (CssScreen/game.html) as data urls"""
    faces = [("Concept", FONT, ""), ("Concept", BOLD, " font-weight: bold;"), ("Label", LABEL, ""), ("Text", REGULAR, ""), ("Icons", ICONS, "")]
    css = "".join("@font-face { font-family: %s; src: url(data:font/ttf;base64,%s);%s }\n"
                  % (name, base64.b64encode(path.read_bytes()).decode(), extra) for name, path, extra in faces)
    (OUT / "fonts.css").write_text(css)


def main():
    calib = {k: dict(v) for k, v in DEFAULT_CALIB.items()}
    if CALIB.exists():
        for k, v in json.load(open(CALIB)).items():
            if k in calib:
                calib[k].update(v)
    if any(v.startswith("--calibrate") for v in sys.argv):
        calibrate(calib)
    page, _ = build(calib)
    write_fonts_css()
    print("wrote", OUT / "index.html", "with", len(page.parts), "elements")
    if "--render" in sys.argv or any(v.startswith("--calibrate") for v in sys.argv):
        render()


if __name__ == "__main__":
    main()
