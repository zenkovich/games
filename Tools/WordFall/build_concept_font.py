#!/usr/bin/env python3
"""Builds Assets/WordFall/concept_font.ttf: Roboto Medium with the capital letters, digits and the
slash replaced by the glyphs painted in the concept (Assets/Generated/concept.png). Each glyph is cut
from its cleanest occurrence, scaled 4x, its boundary traced and simplified, and written as a
TrueType outline on Roboto's metrics (cap height 1456 units), so text sizes stay as they are and the
rest of the font (lowercase, Cyrillic, punctuation) is Roboto.

    python3 Tools/WordFall/build_concept_font.py
"""
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from fontTools.ttLib import TTFont
from fontTools.pens.ttGlyphPen import TTGlyphPen

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import concept_layout as C

CONCEPT = ROOT / "Assets" / "Generated" / "concept.png"
BASE_FONT = ROOT / "Assets" / "WordFall" / "roboto_medium.ttf"
OUT_DIR = Path(os.environ.get("CONCEPT_FONT_OUT", ROOT / "Assets" / "WordFall"))
OUT_FONT = OUT_DIR / "concept_font.ttf"
OUT_DIGITS = OUT_DIR / "concept_digits.ttf"  # the tile corner digits, a wider cut than the big ones

CAP_UNITS = 1456   # Roboto's cap height
UPSCALE = 4
DARK = int(os.environ.get("CONCEPT_FONT_DARK", 140))  # luminance below this is ink
SIDE_BEARING = 90  # font units each side of a glyph
SIMPLIFY = float(os.environ.get("CONCEPT_FONT_SIMPLIFY", 1.3))  # outline tolerance, upscaled pixels

ROWS = ["WORDHUK", "TSEARCV", "GAMEPLL", "YKICKVA", "FUNNYQR", "STARTMC", "PLAYTIO", "ERELAXP"]


def luminance(img):
    return np.array(img.convert("L")).astype(float)


def ink_mask(lum, rect, exclude=None, largest_only=False, border_free=False):
    """ink inside a concept rectangle (x0, y0, x1, y1); `exclude` is a rectangle kept out; with
    `border_free` every blob touching the rectangle's edge is dropped (a neighbour's ink) and the rest kept"""
    x0, y0, x1, y1 = rect
    m = lum[y0:y1, x0:x1] < DARK
    if exclude:
        ex0, ey0, ex1, ey1 = exclude
        m[max(0, ey0 - y0):ey1 - y0, max(0, ex0 - x0):ex1 - x0] = False
    # the largest connected blob and anything touching it is the glyph
    labels, n = ndimage.label(m)
    if n == 0:
        raise ValueError("no ink in %s" % (rect,))
    sizes = ndimage.sum(m, labels, range(1, n + 1))
    if border_free:
        edge = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]])))
        keep = [i + 1 for i, s in enumerate(sizes) if s >= 3 and i + 1 not in edge]
    else:
        keep = [int(np.argmax(sizes)) + 1] if largest_only else [i + 1 for i, s in enumerate(sizes) if s >= 0.15 * sizes.max()]
    m = np.isin(labels, keep)
    ys, xs = np.where(m)
    return m, (x0 + xs.min(), y0 + ys.min(), x0 + xs.max() + 1, y0 + ys.max() + 1)


def glyph_field(lum, rect):
    """ink as a smooth field (ink positive) upscaled UPSCALE times"""
    x0, y0, x1, y1 = rect
    pad = 2
    sub = DARK - lum[y0 - pad:y1 + pad, x0 - pad:x1 + pad]
    field = ndimage.zoom(sub, UPSCALE, order=3)
    return field, pad


def trace(binary):
    """closed boundary loops of a binary image as lists of (x, y) in pixel-edge coordinates; the inside
    stays on the left when walking, so outer loops run counter-clockwise in image space"""
    h, w = binary.shape
    inside = np.zeros((h + 2, w + 2), bool)
    inside[1:-1, 1:-1] = binary
    edges = {}
    def add(a, b):
        edges.setdefault(a, []).append(b)
    for y in range(h + 1):
        for x in range(w + 1):
            # horizontal edge between (y-1, x) above and (y, x) below, spanning x..x+1 at height y
            a, b = inside[y, x + 1], inside[y + 1, x + 1]
            if a != b:
                if b:
                    add((x, y), (x + 1, y))      # inside below: walk right
                else:
                    add((x + 1, y), (x, y))      # inside above: walk left
            # vertical edge between (y, x-1) left and (y, x) right, spanning y..y+1 at x
            a, b = inside[y + 1, x], inside[y + 1, x + 1]
            if a != b:
                if a:
                    add((x, y), (x, y + 1))      # inside left: walk down
                else:
                    add((x, y + 1), (x, y))      # inside right: walk up

    def take(v):
        nxt = edges[v].pop()
        if not edges[v]:
            del edges[v]
        return nxt

    loops = []
    while edges:
        start = next(iter(edges))
        loop = [start]
        cur = take(start)
        while cur != start:
            loop.append(cur)
            cur = take(cur)
        loops.append(loop)
    return loops


def simplify(points, tolerance):
    """Douglas-Peucker on a closed polygon"""
    pts = np.array(points, float)

    def dp(idx):
        if len(idx) < 3:
            return list(idx)
        a, b = pts[idx[0]], pts[idx[-1]]
        ab = b - a
        norm = np.hypot(*ab) or 1.0
        d = np.abs((pts[idx[1:-1]] - a) @ np.array([-ab[1], ab[0]])) / norm
        i = int(np.argmax(d)) + 1
        if d[i - 1] > tolerance:
            return dp(idx[:i + 1])[:-1] + dp(idx[i:])
        return [idx[0], idx[-1]]

    n = len(pts)
    far = int(np.argmax(np.hypot(*(pts - pts[0]).T)))
    idx = list(range(n))
    part1 = dp(idx[:far + 1])
    part2 = dp(idx[far:] + [0])
    out = part1[:-1] + part2[:-1]
    return [tuple(pts[i]) for i in out]


class Source:
    """a text sample of the concept: where it is, its cap height in pixels and its baseline row"""
    def __init__(self, cap_px, baseline_y):
        self.scale = CAP_UNITS / cap_px
        self.baseline_y = baseline_y


def build_glyph(lum, rect, source, exclude=None, largest_only=True, lift=0.0, border_free=False, origin=None, dark=None):
    """`lift` moves the outline up by that many concept pixels (sub-pixel variants of a glyph);
    `origin` is the ink box (x0, y0, x1, y1) the outline is placed and advanced by instead of its own
    (layers of one text share it); `dark` overrides the ink threshold"""
    global DARK
    saved = DARK
    if dark is not None:
        DARK = dark
    try:
        return _build_glyph(lum, rect, source, exclude, largest_only, lift, border_free, origin)
    finally:
        DARK = saved


def _build_glyph(lum, rect, source, exclude, largest_only, lift, border_free, origin):
    mask, bbox = ink_mask(lum, rect, exclude, largest_only, border_free)
    field, pad = glyph_field(lum, bbox)
    binary = field > 0
    # only the traced ink of the mask: other ink inside the box (a rim, a digit) stays out
    keep = ndimage.zoom(mask[bbox[1] - rect[1]:bbox[3] - rect[1], bbox[0] - rect[0]:bbox[2] - rect[0]].astype(float), UPSCALE, order=1) > 0.5
    keep = np.pad(keep, pad * UPSCALE)
    binary = binary & ndimage.binary_dilation(keep, iterations=UPSCALE)
    loops = trace(binary)
    s = source.scale / UPSCALE
    x_origin = bbox[0] - pad
    y_origin = bbox[1] - pad
    pen = TTGlyphPen(None)
    ref = origin or bbox
    width_px = (ref[2] - ref[0])
    for loop in loops:
        pts = simplify(loop, SIMPLIFY)
        if len(pts) < 3:
            continue
        conv = [(round((x_origin + px / UPSCALE - ref[0]) * source.scale + SIDE_BEARING),
                 round((source.baseline_y - (y_origin + py / UPSCALE) + lift) * source.scale)) for px, py in pts]
        pen.moveTo(conv[0])
        for p in conv[1:]:
            pen.lineTo(p)
        pen.closePath()
    advance = round(width_px * source.scale) + 2 * SIDE_BEARING
    return pen.glyph(), advance


def split_columns(mask, min_gap=1):
    """runs of ink columns in a mask: one per glyph of a text sample"""
    cols = mask.any(axis=0)
    runs, start = [], None
    for i, v in enumerate(list(cols) + [False]):
        if v and start is None:
            start = i
        if not v and start is not None:
            runs.append((start, i))
            start = None
    merged = []
    for r in runs:
        if merged and r[0] - merged[-1][1] <= min_gap:
            merged[-1] = (merged[-1][0], r[1])
        else:
            merged.append(r)
    return merged


def main():
    lum = luminance(Image.open(CONCEPT))
    glyphs = {}

    # board letters: the first cell of each letter; the digit corner is excluded
    cells = {}
    for r, row in enumerate(ROWS):
        for c, letter in enumerate(row):
            cells.setdefault(letter, (C.CELL_LEFTS[c], C.ROW_TOPS[r]))
    # the baseline and cap height of the board letters, relative to their cell (flat-bottomed letters)
    rel_bottoms, rel_tops = [], []
    for letter in "TEFHLINKMRP":
        x, y = cells[letter]
        _, b = ink_mask(lum, (x + 8, y + 8, x + 58, y + 58), exclude=(x + 42, y + 40, x + 66, y + 66))
        rel_bottoms.append(b[3] - y)
        rel_tops.append(b[1] - y)
    rel_baseline = float(np.median(rel_bottoms))
    board_cap = rel_baseline - float(np.median(rel_tops))
    for letter, (x, y) in cells.items():
        src = Source(cap_px=board_cap, baseline_y=y + rel_baseline)
        glyphs[letter] = build_glyph(lum, (x + 5, y + 6, x + 61, y + 61), src)  # the letter is the largest blob, the digit a separate one

    # B and Z from the word panel (row 1 "BRAIN", row 0 "PUZZLE")
    panel_cap = 24.1
    bx, by = 11, 48
    _, bb = ink_mask(lum, (bx + 5, by + 5, bx + 30, by + 38))
    glyphs["B"] = build_glyph(lum, (bx + 5, by + 5, bx + 30, by + 38), Source(panel_cap, bb[3]))
    zx, zy = 100, 6
    _, zb = ink_mask(lum, (zx + 8, zy + 7, zx + 36, zy + 38))
    glyphs["Z"] = build_glyph(lum, (zx + 8, zy + 7, zx + 36, zy + 38), Source(panel_cap, zb[3]))

    # digits: "35" of the moves box, "1/10" of the strip, "1200" on the bar's fill, "4" and "6" of tile corners
    m35, b35 = ink_mask(lum, (360, 56, 440, 112))
    runs = split_columns(m35)
    three, five = [(b35[0] + r0 if False else 360 + r0, 360 + r1) for r0, r1 in runs][:2]
    digits = Source(cap_px=b35[3] - b35[1], baseline_y=b35[3])
    glyphs["3"] = build_glyph(lum, (three[0], 56, three[1], 112), digits)
    glyphs["5"] = build_glyph(lum, (five[0], 56, five[1], 112), digits)
    m110, b110 = ink_mask(lum, (88, 212, 160, 246))
    runs = [(88 + r0, 88 + r1) for r0, r1 in split_columns(m110)]
    strip = Source(cap_px=b110[3] - b110[1], baseline_y=b110[3])
    glyphs["1"] = build_glyph(lum, (runs[0][0], 212, runs[0][1], 246), strip)
    glyphs["/"] = build_glyph(lum, (runs[1][0], 212, runs[1][1], 246), strip)
    glyphs["0"] = build_glyph(lum, (runs[3][0], 212, runs[3][1], 246), strip)
    # the small digits of the tile corners: 2, 4 and 6 exist nowhere larger (Roboto's own unless asked)
    for digit, letter in (("2", "O"), ("4", "H"), ("6", "W")) if os.environ.get("CONCEPT_FONT_SMALL_DIGITS", "1") == "1" else ():
        x, y = cells[letter]
        rect = (x + 47, y + 45, x + 62, y + 61)
        _, db = ink_mask(lum, rect, largest_only=True)
        glyphs[digit] = build_glyph(lum, rect, Source(cap_px=db[3] - db[1], baseline_y=db[3]), largest_only=True)

    write_font(glyphs, OUT_FONT, "ConceptSans")

    # the corner digits of the board tiles (1, 2, 4, 6) and of the word tiles (3): their own font
    corner = {}
    for digit, letter in (("1", "R"), ("2", "O"), ("4", "H"), ("6", "W")):
        x, y = cells[letter]
        rect = (x + 45, y + 43, x + 62, y + 61)
        _, db = ink_mask(lum, rect, largest_only=True)
        corner[digit] = build_glyph(lum, rect, Source(cap_px=db[3] - db[1], baseline_y=db[3]), largest_only=True)
    rect = (9 + 46 + 28, 6 + 28, 9 + 46 + 43, 6 + 43)  # the 3 of the U tile of PUZZLE
    _, db = ink_mask(lum, rect, largest_only=True)
    corner["3"] = build_glyph(lum, rect, Source(cap_px=db[3] - db[1], baseline_y=db[3]), largest_only=True)
    for digit in "05/":
        corner[digit] = glyphs[digit]
    write_font(corner, OUT_DIGITS, "ConceptDigits")


def write_font(glyphs, path, family):
    font = TTFont(BASE_FONT)
    cmap = font.getBestCmap()
    glyf, hmtx = font["glyf"], font["hmtx"]
    for ch, (glyph, advance) in glyphs.items():
        name = cmap[ord(ch)]
        glyf[name] = glyph
        hmtx[name] = (advance, SIDE_BEARING)
    for rec in font["name"].names:
        if rec.nameID in (1, 3, 4, 6, 16):
            rec.string = rec.toUnicode().replace("Roboto", family)
    font.save(path)
    print("wrote", path.name, "with", len(glyphs), "concept glyphs:", "".join(sorted(glyphs)))


if __name__ == "__main__":
    main()
