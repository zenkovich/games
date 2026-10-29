#!/usr/bin/env python3
"""Builds Work/CssScreen/concept_icons.ttf: an icon font with the flat symbols of the concept screen
(Assets/Generated/concept.png) traced the way build_concept_font.py traces the letters - the booster
icons, the check marks and the cross, each on a Greek letter of Roboto so the CSS page sets them as text.

    python3 Tools/WordFall/build_concept_icons.py
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from fontTools.pens.ttGlyphPen import TTGlyphPen

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_concept_font as F

OUT = F.ROOT / "Work" / "CssScreen" / "concept_icons.ttf"

# char -> (rect, threshold, light): ink is lum < threshold (or > threshold when light)
ICONS = {
    "α": ((22, 950, 74, 1002), 95, False),    # magnifier
    "β": ((118, 950, 170, 1002), 95, False),  # magnifier with a plus
    "γ": ((215, 950, 265, 1002), 95, False),  # bulb, blue button
    "δ": ((312, 950, 360, 1002), 80, False),  # bulb, yellow button
    "ε": ((400, 950, 450, 1002), 85, False),  # shuffle arrows
    "ζ": ((366, 346, 402, 386), 190, True),   # check, input field
    "η": ((416, 340, 458, 388), 190, True),   # cross
    "θ": ((248, 212, 287, 251), 190, True),   # check, strip
}


def glyph(lum, rect, thr, light, lift=0.0, origin=None):
    x0, y0, x1, y1 = rect
    pad = 2
    thr = np.asarray(thr, float)  # a number, or one threshold per column of the padded rectangle
    sub = lum[y0 - pad:y1 + pad, x0 - pad:x1 + pad]
    sub = (sub - thr) if light else (thr - sub)
    mask = sub > 0
    labels, n = ndimage.label(mask)
    sizes = ndimage.sum(mask, labels, range(1, n + 1))
    border = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]])))
    mask = np.isin(labels, [i + 1 for i, s in enumerate(sizes) if s >= 6 and i + 1 not in border])
    ys, xs = np.where(mask)
    bbox = (x0 - pad + xs.min(), y0 - pad + ys.min(), x0 - pad + xs.max() + 1, y0 - pad + ys.max() + 1)
    up = ndimage.zoom(sub, F.UPSCALE, order=3) > 0
    keep = ndimage.zoom(mask.astype(float), F.UPSCALE, order=1) > 0.5
    up &= ndimage.binary_dilation(keep, iterations=F.UPSCALE)
    ref = origin or bbox
    source = F.Source(cap_px=ref[3] - ref[1], baseline_y=ref[3])
    pen = TTGlyphPen(None)
    ox, oy = x0 - pad, y0 - pad
    for loop in F.trace(up):
        pts = F.simplify(loop, 1.3)
        if len(pts) < 3:
            continue
        conv = [(round((ox + px / F.UPSCALE - ref[0]) * source.scale + F.SIDE_BEARING),
                 round((source.baseline_y - (oy + py / F.UPSCALE) + lift) * source.scale)) for px, py in pts]
        pen.moveTo(conv[0])
        for q in conv[1:]:
            pen.lineTo(q)
        pen.closePath()
    advance = round((ref[2] - ref[0]) * source.scale) + 2 * F.SIDE_BEARING
    return (pen.glyph(), advance), bbox


def main():
    lum = F.luminance(Image.open(F.CONCEPT))
    glyphs, boxes = {}, {}
    for ch, (rect, thr, light) in ICONS.items():
        glyphs[ch], boxes[ch] = glyph(lum, rect, thr, light)
        print(ch, "bbox", boxes[ch])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    F.write_font(glyphs, OUT, "ConceptIcons")
    (OUT.with_suffix(".json")).write_text(__import__("json").dumps({ch: list(map(int, b)) for ch, b in boxes.items()}))


if __name__ == "__main__":
    main()
