#!/usr/bin/env python3
"""Rebuilds the WordFall main screen as a static HTML page (Work/HtmlScreen/index.html) laid out pixel
by pixel after the concept (Assets/Generated/concept.png): every static part is a 1x crop of the concept,
tiles are crops of the concept with the letters erased by the Test pipeline (its cached edited copies of
the concept; nothing from WordFall/Sprites is used), and all text is live HTML text. `--render` screenshots the page with headless Chrome at 471x1026 and
compares it with the concept per pixel (Work/HtmlScreen/render.png, diff.png).

    python3 Tools/WordFall/build_html_screen.py [--render] [--tol 48]
"""
import json
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import concept_layout as C

CONCEPT = ROOT / "Assets" / "Generated" / "concept.png"
CACHE = ROOT / "Work" / "Pipelines" / "cache" / "56493aba-6ecf-4c9d-a73e-72fa2bdb1015" / "content"
OUT = Path(os.environ.get("HTML_OUT", ROOT / "Work" / "HtmlScreen"))
IMG = OUT / "img"
MOCK = ROOT / "Sources" / "GameUITests" / "Data" / "wordfall_concept_mock.json"
CHROME = os.environ.get("CHROME", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")

LETTER = "#371509"
DIGIT = "#3c200e"
BAR_TEXT = "#7e5a36"
BAR_LIGHT = "#f3e9d8"
CAP = 0.711  # Roboto cap height / em

CELL_RIGHTS = C.CELL_LEFTS[1:] + (466,)
ROW_BOTTOMS = C.ROW_TOPS[1:] + (931,)

# text metrics in concept px: cap height and where the cap top sits (tuned against the concept)
TEXT = {
    "board":  dict(cap=31.5, top=16, dx=-1),
    "digit":  dict(cap=8, right=11, bottom=12),
    "word":   dict(cap=23, top=11, dx=-0.5),
    "wdigit": dict(cap=6.5, right=5, bottom=6),
    "strip":  dict(cap=28, top=17, dx=-1),
    "count":  dict(cap=25, top=18, dx=2, spacing=3),
    "moves":  dict(cap=14, top=27, stroke=0.3),
    "value":  dict(cap=46, top=62),
    "bar":    dict(cap=16.5, top=295, smooth="antialiased"),
}


def font_px(cap):
    return cap / CAP


def text_css(kind):
    """font size, smoothing and stroke of a text kind"""
    m = TEXT[kind]
    css = "font-size:%gpx;-webkit-font-smoothing:%s;" % (font_px(m["cap"]), m.get("smooth", "none"))
    if m.get("stroke"):
        css += "-webkit-text-stroke:%gpx currentColor;" % m["stroke"]
    if m.get("spacing"):
        css += "letter-spacing:%gpx;" % m["spacing"]
    return css


def cap_top_offset(cap):
    """distance from a 1-line box top (line-height 1) to the cap top, Roboto metrics"""
    f = font_px(cap)
    baseline = f * (-(2400 / 2048 - 1) / 2 + 1900 / 2048)
    return baseline - cap


def map_cache():
    """every erase crop -> the cached full-size concept with that erase applied (the chain's last edit)"""
    path = OUT / "cache_map.json"
    if path.exists():
        return json.load(open(path))
    con = np.array(Image.open(CONCEPT).convert("RGB")).astype(int)
    diffs = {}
    for f in sorted(os.listdir(CACHE)):
        try:
            im = Image.open(CACHE / f)
        except Exception:
            continue
        if im.size != (C.CONCEPT_W, C.CONCEPT_H):
            continue
        d = np.abs(np.array(im.convert("RGB")).astype(int) - con).max(axis=2) > 40
        if d.sum():
            diffs[f] = d
    out = {}
    for name, crop in C.CROPS.items():
        erase = crop.get("erase")
        if not erase:
            continue
        rects = [r for _, r in (erase if isinstance(erase, list) else [erase])]
        x0, y0, x1, y1 = crop["rect"]
        inside = np.zeros((C.CONCEPT_H, C.CONCEPT_W), bool)
        for ex0, ey0, ex1, ey1 in rects:
            inside[ey0:ey1, ex0:ex1] = True
        rim = np.zeros_like(inside)
        rim[y0:y1, x0:x1] = True
        rim &= ~inside
        lx0, ly0, lx1, ly1 = rects[-1]
        best = None
        for f, d in diffs.items():
            erased = d[inside].sum()
            if erased < 30 or d[rim].mean() > 0.08:
                continue
            score = (d[ly0:ly1, lx0:lx1].sum() > 20, erased)
            if best is None or score > best[0]:
                best = (score, f)
        if best:
            out[name] = best[1]
    json.dump(out, open(path, "w"), indent=1)
    return out


def main():
    render = "--render" in sys.argv
    tol = int(sys.argv[sys.argv.index("--tol") + 1]) if "--tol" in sys.argv else 48
    if "--text" in sys.argv:  # calibration overrides: {"board": {"cap": 31}}
        for key, fields in json.loads(sys.argv[sys.argv.index("--text") + 1]).items():
            TEXT[key].update(fields)
    quiet = "--quiet" in sys.argv
    IMG.mkdir(parents=True, exist_ok=True)
    concept = Image.open(CONCEPT).convert("RGB")
    cmap = map_cache()
    edited = {}

    def source(name):
        f = cmap.get(name)
        if f and f not in edited:
            edited[f] = Image.open(CACHE / f).convert("RGB")
        return edited[f] if f else None

    def save(name, im):
        im.save(IMG / (name + ".png"))
        return "img/%s.png" % name

    def crop(name, rect, src=None):
        return save(name, (src or concept).crop(rect))

    def mirrored(name, rect, bottom_from_top=0):
        """the clean right edge of a panel and its mirror image as the left edge; `bottom_from_top` rows of
        the top rim flipped vertically give a bottom rim when the concept's own is under the tiles"""
        edge = concept.crop(rect)
        im = Image.new("RGB", (edge.width * 2, edge.height + bottom_from_top))
        im.paste(edge.transpose(Image.FLIP_LEFT_RIGHT), (0, 0))
        im.paste(edge, (edge.width, 0))
        if bottom_from_top:
            top = im.crop((0, 0, im.width, bottom_from_top)).transpose(Image.FLIP_TOP_BOTTOM)
            im.paste(top, (0, edge.height))
        return save(name, im)

    mock = json.load(open(MOCK))
    parts = []  # html snippets

    def box(style, inner="", cls=""):
        parts.append('<div class="%s" style="%s">%s</div>' % (cls, style, inner))

    def rect_style(x0, y0, x1, y1):
        return "left:%gpx;top:%gpx;width:%gpx;height:%gpx;" % (x0, y0, x1 - x0, y1 - y0)

    def img_box(url, rect, extra=""):
        box(rect_style(*rect) + "background:url(%s) 0 0/100%% 100%%;" % url + extra)

    def sliced(url, rect, slices, extra=""):
        l, b, r, t = slices
        box(rect_style(*rect) + "border-style:solid;border-width:%dpx %dpx %dpx %dpx;border-image:url(%s) %d %d %d %d fill;" % (t, r, b, l, url, t, r, b, l) + extra)

    # background
    bg = crop("background", C.CROPS["cc_background"]["rect"])

    # words panel: clean right edge mirrored, 9-sliced
    panel = mirrored("words_panel", C.CROPS["cc_words_panel"]["rect"], bottom_from_top=24)
    sliced(panel, C.PANEL_RECT, (14, 14, 14, 14))
    words = [t for t in mock["wordTasks"]]
    for w, task in enumerate(words):
        for l, letter in enumerate(task["word"]):
            x, y = C.WORD_ORIGIN[0] + 1 + C.WORD_PITCH[0] * l, C.WORD_ORIGIN[1] + C.WORD_PITCH[1] * w
            name = "cc_wslot_%d_%d" % (w, l)
            src = source(name)
            url = crop(name, C.CROPS[name]["rect"], src)  # without an erased copy the concept's letter sits under the text
            m = TEXT["word"]
            inner = '<span class="t" style="left:%gpx;width:44px;top:%gpx;%scolor:%s">%s</span>' % (
                m["dx"], m["top"] - cap_top_offset(m["cap"]), text_css("word"), LETTER, letter)
            d = TEXT["wdigit"]
            inner += '<span class="t r" style="right:%gpx;bottom:%gpx;%scolor:%s">%s</span>' % (
                d["right"], d["bottom"] - (font_px(d["cap"]) - (cap_top_offset(d["cap"]) + d["cap"])), text_css("wdigit"), DIGIT, task["values"][l])
            img_box(url, (x, y, x + 44, y + 44))
            parts[-1] = parts[-1][:-6] + inner + "</div>"

    # moves box
    moves = C.CROPS["cc_moves_bg"]["rect"]
    img_box(crop("moves_bg", moves, source("cc_moves_bg")), moves)
    m = TEXT["moves"]
    box(rect_style(moves[0], m["top"] - cap_top_offset(m["cap"]), moves[2], m["top"] + 40) + text_css("moves") + "color:%s;text-align:center;line-height:1" % LETTER, "Moves Left:")
    m = TEXT["value"]
    box(rect_style(moves[0], m["top"] - cap_top_offset(m["cap"]), moves[2], m["top"] + 80) + text_css("value") + "color:%s;text-align:center;line-height:1" % LETTER, str(mock["moves"]))

    # strip of the other tasks
    strip = mirrored("strip_bg", C.CROPS["cc_strip_bg"]["rect"])
    sliced(strip, C.STRIP_RECT, C.CROPS["cc_strip_bg"]["slices"])
    tile = C.CROPS["cc_strip_tile"]["rect"]
    img_box(crop("strip_tile", tile, source("cc_strip_tile")), tile)
    other = mock["otherTasks"][0]
    m = TEXT["strip"]
    box(rect_style(tile[0], tile[1] + m["top"] - cap_top_offset(m["cap"]), tile[2], tile[3]) + text_css("strip") + "color:%s;text-align:center;line-height:1;margin-left:%gpx" % (LETTER, m["dx"]), other["letter"])
    m = TEXT["count"]
    sx, sy, sw, sh = C.STRIP_TEXT
    box(rect_style(sx + m.get("dx", 0), sy + m["top"] - cap_top_offset(m["cap"]), sx + sw, sy + sh) + text_css("count") + "color:%s;text-align:left;line-height:1" % LETTER, "%d/%d" % (other["progress"], other["count"]))
    for name in ("cc_strip_star", "cc_strip_check", "cc_star", "cc_accept", "cc_cancel"):
        img_box(crop(name[3:], C.CROPS[name]["rect"]), C.CROPS[name]["rect"])

    # progress bar
    back = crop("progress_back", C.CROPS["cc_progress_back"]["rect"])
    sliced(back, C.BAR, C.CROPS["cc_progress_back"]["slices"])
    fill = crop("progress_fill", C.CROPS["cc_progress_fill"]["rect"])
    frac = C.BAR_FILL_FRACTION  # the concept paints its 1200 / 2500 at 43%
    sliced(fill, (C.BAR[0], C.BAR[1], C.BAR[0] + round((C.BAR[2] - C.BAR[0]) * frac), C.BAR[3]), C.CROPS["cc_progress_fill"]["slices"])
    m = TEXT["bar"]
    fill_right = C.BAR[0] + round((C.BAR[2] - C.BAR[0]) * frac)
    label = "Progress: %d / %d" % (mock["score"], mock["target"])
    bar_box = rect_style(C.BAR[0], m["top"] - cap_top_offset(m["cap"]), C.BAR_TEXT_RIGHT, C.BAR[3]) + text_css("bar") + "text-align:center;line-height:1;"
    # the label is dark over the fill and light over the track: the same text twice, clipped at the fill's edge
    clip = fill_right - C.BAR[0]
    box(bar_box + "color:%s;clip-path:inset(0 calc(100%% - %dpx) 0 0);" % (BAR_TEXT, clip), label)
    box(bar_box + "color:%s;clip-path:inset(0 0 0 %dpx);" % (BAR_LIGHT, clip), label)

    # input field
    sliced(crop("input_back", C.CROPS["cc_input_back"]["rect"]), C.CROPS["cc_input_back"]["rect"], C.CROPS["cc_input_back"]["slices"])

    # board: every cell is the concept's own cell, letters erased, at the concept's own place
    rows = mock["rows"]
    for r in range(C.ROWS):
        for c in range(C.COLUMNS):
            rect = (C.CELL_LEFTS[c], C.ROW_TOPS[r], CELL_RIGHTS[c], ROW_BOTTOMS[r])
            name = "cc_cell_%d_%d" % (c, C.ROWS - 1 - r)
            src = source(name)
            url = crop(name, rect, src)  # without an erased copy the concept's own letter sits under the same text
            m = TEXT["board"]
            w = rect[2] - rect[0]
            inner = '<span class="t" style="left:%gpx;width:%dpx;top:%gpx;%scolor:%s">%s</span>' % (
                m["dx"], w, m["top"] - cap_top_offset(m["cap"]), text_css("board"), LETTER, rows[r][c])
            d = TEXT["digit"]
            inner += '<span class="t r" style="right:%gpx;bottom:%gpx;%scolor:%s">%s</span>' % (
                d["right"], d["bottom"] - (font_px(d["cap"]) - (cap_top_offset(d["cap"]) + d["cap"])), text_css("digit"), DIGIT, mock["values"][r][c])
            img_box(url, rect)
            parts[-1] = parts[-1][:-6] + inner + "</div>"

    # the concept's frame: a 1 px light line around the image and the lighter band at its bottom
    for name, rect in (("edge_top", (0, 0, C.CONCEPT_W, 1)), ("edge_bottom", (0, 1020, C.CONCEPT_W, C.CONCEPT_H)),
                       ("edge_left", (0, 0, 1, C.CONCEPT_H)), ("edge_right", (C.CONCEPT_W - 1, 0, C.CONCEPT_W, C.CONCEPT_H))):
        img_box(crop(name, rect), rect)

    # boosters
    for i in range(5):
        name = "cc_btn_%d" % i
        img_box(crop(name[3:], C.CROPS[name]["rect"]), C.CROPS[name]["rect"])

    html = """<!doctype html>
<html><head><meta charset="utf-8"><title>WordFall concept screen</title>
<style>
@font-face { font-family: ConceptSans; src: url(%s); font-weight: 500; }
@font-face { font-family: ConceptDigits; src: url(%s); font-weight: 500; }
html, body { margin: 0; padding: 0; }
body { width: %dpx; height: %dpx; position: relative; overflow: hidden; font-family: ConceptSans, Roboto, sans-serif; font-weight: 500;
       background: url(%s) 0 0/100%% 100%%; }
div { position: absolute; box-sizing: border-box; }
.t { position: absolute; display: block; line-height: 1; text-align: center; white-space: nowrap; -webkit-font-smoothing: none; }
.t.r { text-align: right; width: auto; font-family: ConceptDigits, ConceptSans, sans-serif; }
%s
</style></head><body>
%s
</body></html>
""" % (os.path.relpath(ROOT / "Assets" / "WordFall" / "concept_font.ttf", OUT), os.path.relpath(ROOT / "Assets" / "WordFall" / "concept_digits.ttf", OUT),
       C.CONCEPT_W, C.CONCEPT_H, bg, os.environ.get("HTML_CSS", ""), "\n".join(parts))
    (OUT / "index.html").write_text(html)
    if "--artifact" in sys.argv:  # the page for publishing: no document skeleton, the font embedded, scaled to narrow screens
        import base64
        font = base64.b64encode((ROOT / "Assets" / "WordFall" / "concept_font.ttf").read_bytes()).decode()
        digits = base64.b64encode((ROOT / "Assets" / "WordFall" / "concept_digits.ttf").read_bytes()).decode()
        (OUT / "artifact.html").write_text("""<title>WordFall Concept Screen</title>
<style>
/* a fixed 471x1026 game screen, scaled down to fit narrow viewports */
:root { --page: #2a2320; --screen: #ecd7c1; }
@font-face { font-family: ConceptSans; src: url(data:font/ttf;base64,%s); font-weight: 500; }
@font-face { font-family: ConceptDigits; src: url(data:font/ttf;base64,%s); font-weight: 500; }
html, body { margin: 0; padding: 0; background: var(--page); color: #371509; }
#stage { width: 100vw; height: 100vh; overflow: hidden; display: flex; align-items: flex-start; justify-content: center; padding-block: 0; }
#screen { width: %dpx; height: %dpx; position: relative; overflow: hidden; flex: none; transform-origin: top center;
          font-family: ConceptSans, Roboto, sans-serif; font-weight: 500; background: var(--screen) url(%s) 0 0/100%% 100%%; }
#screen div { position: absolute; box-sizing: border-box; }
.t { position: absolute; display: block; line-height: 1; text-align: center; white-space: nowrap; -webkit-font-smoothing: none; }
.t.r { text-align: right; width: auto; font-family: ConceptDigits, ConceptSans, sans-serif; }
</style>
<div id="stage"><div id="screen">
%s
</div></div>
<script>
(function () {
  var screen = document.getElementById("screen");
  function fit() { screen.style.transform = "scale(" + Math.min(1, (window.innerWidth - 16) / %d, window.innerHeight / %d) + ")"; }
  window.addEventListener("resize", fit); fit();
})();
</script>
""" % (font, digits, C.CONCEPT_W, C.CONCEPT_H, bg, "\n".join(parts), C.CONCEPT_W, C.CONCEPT_H))
    if not quiet:
        print("wrote", OUT / "index.html", "with", len(parts), "boxes")

    if render:
        shot = OUT / "render.png"
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
                        "--window-size=%d,%d" % (C.CONCEPT_W, C.CONCEPT_H), "--screenshot=%s" % shot, "file://%s" % (OUT / "index.html")],
                       check=True, capture_output=True)
        a = np.array(Image.open(shot).convert("RGB")).astype(int)
        b = np.array(concept).astype(int)
        same = np.abs(a - b).max(axis=2) <= tol
        diff = np.array(concept)
        diff[~same] = (255, 0, 255)
        Image.fromarray(diff).save(OUT / "diff.png")
        regions = {"words panel": (8, 7, 330, 175), "moves": (336, 8, 462, 128), "strip": (7, 171, 463, 271), "progress": (7, 284, 463, 325),
                   "input": (8, 336, 462, 392), "board": (7, 404, 463, 932), "boosters": (10, 940, 462, 1010)}
        if quiet:
            print(" ".join("%s=%.3f" % (n.split()[0], same[y0:y1, x0:x1].mean()) for n, (x0, y0, x1, y1) in regions.items()), "all=%.4f" % same.mean())
            return
        print("similarity %.2f%% (tolerance %d)" % (same.mean() * 100, tol))
        for n, (x0, y0, x1, y1) in regions.items():
            s = same[y0:y1, x0:x1]
            print("  %-12s %.1f%%  (share of mismatch %.1f%%)" % (n, s.mean() * 100, (~s).sum() / max(1, (~same).sum()) * 100))


if __name__ == "__main__":
    main()
