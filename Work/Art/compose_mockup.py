#!/usr/bin/env python3
"""Composes the generated sprites into static mockups of the game screens (Work/Concepts/).
Same coordinates as the runtime layout (design 540x960, origin at the centre, y up) so the
mockup doubles as a layout check before the engine runs."""
import math
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SPRITES = os.path.join(ROOT, "Assets", "ZeroLine")
FONTS = os.path.join(ROOT, "Assets", "Fonts")
OUT = os.path.join(ROOT, "Work", "Concepts")
S = 2
W, H = 540, 960
CELL, TILE, BOARD_Y = 92, 82, -40

WHITE = (255, 255, 255, 255)
MUTED = (150, 158, 200, 255)
GREEN = (70, 230, 130, 255)


def sprite(name, w=None, h=None):
    img = Image.open(os.path.join(SPRITES, name)).convert("RGBA")
    if w is not None:
        img = img.resize((int(w * S), int(h * S)), Image.LANCZOS)
    return img


def font(size, heavy=True):
    return ImageFont.truetype(os.path.join(FONTS, "GameFontHeavy.ttf" if heavy else "GameFont.ttf"), int(size * S))


def to_px(x, y):
    return (W / 2 + x) * S, (H / 2 - y) * S


def paste(canvas, img, cx, cy, scale=1.0):
    if scale != 1.0:
        img = img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS)
    px, py = to_px(cx, cy)
    canvas.alpha_composite(img, (int(px - img.width / 2), int(py - img.height / 2)))


def text(canvas, s, cx, cy, size, color=WHITE, heavy=True, anchor="mm"):
    px, py = to_px(cx, cy)
    ImageDraw.Draw(canvas).text((px, py), s, font=font(size, heavy), fill=color, anchor=anchor)


def cell_center(c, r):
    return (c - 2) * CELL, (r - 2) * CELL + BOARD_Y


def fmt(v):
    return str(v)


def draw_board(canvas, rows, selected, ready):
    paste(canvas, sprite("board_tray.png", 480, 480), 0, BOARD_Y)
    values = {}
    for r_idx, row in enumerate(rows):
        r = 4 - r_idx
        for c, v in enumerate(row):
            values[(c, r)] = v
    sel = set(selected)
    for (c, r), v in values.items():
        x, y = cell_center(c, r)
        scale = 1.12 if (c, r) in sel else 1.0
        if (c, r) in sel:
            glow = sprite("tile_glow.png", 106, 106)
            if ready:
                glow = tint(glow, GREEN)
            paste(canvas, glow, x, y, scale)
        name = "tile_zero.png" if v == 0 else ("tile_pos.png" if v > 0 else "tile_neg.png")
        paste(canvas, sprite(name, TILE, TILE), x, y, scale)
        text(canvas, fmt(v), x, y + 2, 44)
    # line over the selected tiles
    color = GREEN if ready else WHITE
    line = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(line)
    pts = [to_px(*cell_center(c, r)) for (c, r) in selected]
    for a, b in zip(pts, pts[1:]):
        d.line([a, b], fill=color, width=14 * S)
    for p in pts:
        d.ellipse([p[0] - 7 * S, p[1] - 7 * S, p[0] + 7 * S, p[1] + 7 * S], fill=color)
    line.putalpha(line.split()[3].point(lambda a: int(a * 0.7)))
    canvas.alpha_composite(line)


def tint(img, color):
    r, g, b, a = img.split()
    out = Image.new("RGBA", img.size, color[:3] + (0,))
    out.putalpha(a)
    return out


def draw_hud(canvas, score, time_left, expr, status, best):
    text(canvas, "SCORE", -150, 400, 22, MUTED)
    text(canvas, str(score), -150, 360, 52)
    paste(canvas, sprite("timer_badge.png", 96, 96), 190, 385)
    text(canvas, str(time_left), 190, 386, 40)
    paste(canvas, sprite("pill.png", 440, 54), 0, 290)
    text(canvas, expr, 0, 291, 26)
    if status:
        text(canvas, status, 0, 228, 30, GREEN if status == "READY" else WHITE)
    text(canvas, "BEST " + str(best), 0, -340, 22, MUTED)


def base():
    canvas = Image.new("RGBA", (W * S, H * S))
    canvas.alpha_composite(sprite("bg.png").resize((W * S, H * S), Image.LANCZOS))
    return canvas


ROWS = [
    [3, -2, 5, -1, 4],
    [-1, 6, -3, 2, -7],
    [2, -5, 0, 1, -2],
    [-4, 3, 7, -8, 1],
    [1, -1, -6, 4, 3],
]


def gameplay():
    canvas = base()
    draw_hud(canvas, 1240, 47, "3 + -2 + -1 = 0", "READY", 2310)
    # path: (0,4)=3 -> (1,4)=-2 -> (1,3)=... use L-shape: 3 (0,4), -2 (1,4), -1 (0,3)? not adjacent chain; use (0,4)->(1,4)->(1,3)
    rows = [row[:] for row in ROWS]
    rows[0][0], rows[0][1], rows[1][1] = 3, -2, -1
    draw_board(canvas, rows, [(0, 4), (1, 4), (1, 3)], True)
    canvas.save(os.path.join(OUT, "mockup_gameplay.png"))
    print("wrote mockup_gameplay.png")


def gameplay_incomplete():
    canvas = base()
    draw_hud(canvas, 1240, 47, "3 + -2", "SUM: +1", 2310)
    rows = [row[:] for row in ROWS]
    rows[0][0], rows[0][1], rows[1][1] = 3, -2, -1
    draw_board(canvas, rows, [(0, 4), (1, 4)], False)
    canvas.save(os.path.join(OUT, "mockup_gameplay_incomplete.png"))
    print("wrote mockup_gameplay_incomplete.png")


def gameover():
    canvas = base()
    draw_hud(canvas, 1240, 0, "TIME'S UP", "", 2310)
    draw_board(canvas, ROWS, [], False)
    dim = Image.new("RGBA", canvas.size, (10, 12, 28, 170))
    canvas.alpha_composite(dim)
    paste(canvas, sprite("panel.png", 440, 360), 0, 20)
    text(canvas, "TIME'S UP", 0, 150, 40)
    text(canvas, "SCORE", 0, 85, 22, MUTED)
    text(canvas, "1240", 0, 45, 56)
    text(canvas, "BEST 2310", 0, -15, 26, MUTED)
    paste(canvas, sprite("btn.png", 260, 76), 0, -90)
    text(canvas, "PLAY AGAIN", 0, -87, 28)
    canvas.save(os.path.join(OUT, "mockup_gameover.png"))
    print("wrote mockup_gameover.png")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    gameplay()
    gameplay_incomplete()
    gameover()
