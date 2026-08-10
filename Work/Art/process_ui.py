#!/usr/bin/env python3
"""Конвейер подготовки UI-спрайтов Word Fall из арта, сгенерированного/извлечённого
Gemini (Work/Art/gen/) в Assets/WordFall/Sprites/ui_*.png.

Только механическая обработка: чистка альфы, кадрирование, сборка 9-slice,
масштаб, pressed-варианты (затемнение + сдвиг вниз). Сам арт — из imagegen.
"""

import os
from collections import deque
from PIL import Image, ImageDraw, ImageEnhance

ROOT = "/Users/andreizenkovich/work/zenkovich.space/gamesTemplate/"
GEN = ROOT + "Work/Art/gen/"
OUT = ROOT + "Assets/WordFall/Sprites/"
PREVIEW = ROOT + "Work/Art/ui/"
os.makedirs(PREVIEW, exist_ok=True)


def save(img, name):
    img.save(OUT + name)
    img.save(PREVIEW + name)
    print("saved", name, img.size)


def flood_key_white(img, threshold=232):
    """Убирает связный с углами почти-белый фон."""
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()
    seen = [[False]*h for _ in range(w)]
    q = deque()
    for x, y in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        q.append((x, y))
    while q:
        x, y = q.popleft()
        if x < 0 or x >= w or y < 0 or y >= h or seen[x][y]:
            continue
        seen[x][y] = True
        r, g, b, a = px[x, y]
        if a > 0 and not (r > threshold and g > threshold and b > threshold):
            continue
        px[x, y] = (r, g, b, 0)
        q.extend([(x+1, y), (x-1, y), (x, y+1), (x, y-1)])
    return img


def alpha_bbox(img, min_alpha=10):
    a = img.getchannel("A").point(lambda v: 255 if v >= min_alpha else 0)
    return a.getbbox()


def crop_bbox(img, pad=0):
    b = alpha_bbox(img)
    b = (max(0, b[0]-pad), max(0, b[1]-pad), min(img.size[0], b[2]+pad), min(img.size[1], b[3]+pad))
    return img.crop(b)


def to_square(img, margin=0.04):
    """Квадратный канвас с полем, объект по центру."""
    s = int(max(img.size) * (1 + margin*2))
    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    canvas.alpha_composite(img, ((s - img.size[0])//2, (s - img.size[1])//2))
    return canvas


def make_nine(img, out_w, out_h, corner):
    """Собирает 9-slice источник out_w×out_h: масштаб по высоте, затем углы
    берутся как есть, кромки — из середины (углы не искажаются)."""
    scale = out_h / img.size[1]
    scaled = img.resize((max(out_w, int(img.size[0]*scale)), out_h), Image.LANCZOS)
    w, h = scaled.size
    out = Image.new("RGBA", (out_w, out_h), (0, 0, 0, 0))
    c = corner
    mid_src = (w//2 - (out_w - 2*c)//2, w//2 + (out_w - 2*c + 1)//2)
    # левый и правый края целиком (вся высота), середина — из центра
    out.paste(scaled.crop((0, 0, c, h)), (0, 0))
    out.paste(scaled.crop((w - c, 0, w, h)), (out_w - c, 0))
    out.paste(scaled.crop((mid_src[0], 0, mid_src[1], h)), (c, 0))
    return out


# ---------------------------------------------------------------- boosters
for key in ["hammer", "shuffle", "hint", "joker", "x2"]:
    img = Image.open(GEN + "booster_%s.png" % key).convert("RGBA")
    img = flood_key_white(img)
    img = to_square(crop_bbox(img, pad=2))
    img = img.resize((160, 160), Image.LANCZOS)
    save(img, "ui_booster_%s.png" % key)

# ---------------------------------------------------------------- tile, ice, sel
# плитка с запечённой тенью; ниже y=152 кроп захватил кусок соседней плитки
tile = Image.open(GEN + "tile_shadow.png").convert("RGBA").crop((0, 0, 175, 152))
tile = to_square(crop_bbox(tile, pad=1), margin=0.05)
tile = tile.resize((160, 160), Image.LANCZOS)
save(tile, "ui_tile.png")

ice = Image.open(GEN + "ice.png").convert("RGBA")
ice = to_square(crop_bbox(ice, pad=1), margin=0.02)
save(ice.resize((160, 160), Image.LANCZOS), "ui_ice.png")

sel = flood_key_white(Image.open(GEN + "tile_sel.png"))
sel = to_square(crop_bbox(sel, pad=2), margin=0.02)
save(sel.resize((160, 160), Image.LANCZOS), "ui_tile_sel.png")

# ---------------------------------------------------------------- panels
cream = crop_bbox(flood_key_white(Image.open(GEN + "panel_cream.png")))
save(make_nine(cream, 96, 96, 30), "ui_panel_cream.png")

board = crop_bbox(Image.open(GEN + "panel_board2.png").convert("RGBA"))
save(make_nine(board, 120, 120, 36), "ui_panel_board.png")

# единый задник панели ввода с выемкой-лотком (из концепта, не слайсится):
# цвет/тени — wordbar_clean (edit_image по кропу концепта, мягкая выемка),
# альфа-форма — из wordbar (extract с корректными прозрачными углами)
shape = crop_bbox(Image.open(GEN + "wordbar.png").convert("RGBA"), pad=1)
wordbar = Image.open(GEN + "wordbar_clean.png").convert("RGBA").resize(shape.size, Image.LANCZOS)
wordbar.putalpha(shape.getchannel("A"))
save(wordbar, "ui_wordbar.png")

# ---------------------------------------------------------------- bar, box
box = crop_bbox(flood_key_white(Image.open(GEN + "box_brown.png")))
save(make_nine(box, 72, 36, 18), "ui_bar_track.png")

fill = crop_bbox(flood_key_white(Image.open(GEN + "bar_fill.png")))
save(make_nine(fill, 72, 30, 15), "ui_bar_fill.png")

# ---------------------------------------------------------------- buttons
pill = crop_bbox(flood_key_white(Image.open(GEN + "btn_accept.png")))
save(make_nine(pill, 176, 58, 26), "ui_btn_orange.png")

cross = crop_bbox(Image.open(GEN + "btn_cross_round.png").convert("RGBA"), pad=2)
cross = to_square(cross, margin=0.02).resize((96, 96), Image.LANCZOS)
save(cross, "ui_btn_cross.png")

badge = crop_bbox(flood_key_white(Image.open(GEN + "badge.png")), pad=1)
save(to_square(badge, margin=0.02).resize((72, 72), Image.LANCZOS), "ui_badge.png")

# ---------------------------------------------------------------- powerups
for key in ["bomb", "rocket", "wand"]:
    img = flood_key_white(Image.open(GEN + "powerup_%s.png" % key))
    img = to_square(crop_bbox(img, pad=2), margin=0.03)
    save(img.resize((128, 128), Image.LANCZOS), "powerup_%s.png" % key)

print("done")
