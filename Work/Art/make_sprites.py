#!/usr/bin/env python3
"""Generates the Zero Line sprites into Assets/ZeroLine/ at 2x (2 px per design unit)."""
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "Assets", "ZeroLine")
S = 2   # pixels per design unit
SS = 4  # supersampling for anti-aliased shapes


def save(img, name):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name)
    img.save(path)
    print("wrote", os.path.relpath(path, ROOT), img.size)


def rounded_mask(size, radius, box=None):
    w, h = size
    big = Image.new("L", (w * SS, h * SS), 0)
    x0, y0, x1, y1 = box if box else (0, 0, w, h)
    ImageDraw.Draw(big).rounded_rectangle([x0 * SS, y0 * SS, x1 * SS - 1, y1 * SS - 1], radius=radius * SS, fill=255)
    return big.resize((w, h), Image.LANCZOS)


def ellipse_mask(size, box=None):
    w, h = size
    big = Image.new("L", (w * SS, h * SS), 0)
    x0, y0, x1, y1 = box if box else (0, 0, w, h)
    ImageDraw.Draw(big).ellipse([x0 * SS, y0 * SS, x1 * SS - 1, y1 * SS - 1], fill=255)
    return big.resize((w, h), Image.LANCZOS)


def vertical_gradient(size, top, bottom):
    w, h = size
    img = Image.new("RGBA", size)
    px = img.load()
    for y in range(h):
        t = y / max(1, h - 1)
        c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)) + (255,)
        for x in range(w):
            px[x, y] = c
    return img


def solid(size, color):
    return Image.new("RGBA", size, color)


def composite(base, layer, mask):
    return Image.composite(layer, base, mask)


def overlay(base, color, mask):
    """Alpha-blends a translucent color through the mask (composite() would replace the pixels)."""
    layer = Image.new("RGBA", base.size, color[:3] + (0,))
    layer.putalpha(mask.point(lambda v: v * color[3] // 255))
    return Image.alpha_composite(base, layer)


def tile(name, top, bottom, shadow, sparkles=False):
    size = (82 * S, 82 * S)
    radius = 18 * S
    lift = 4 * S
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    # bottom shadow edge gives the tile a little thickness
    img = composite(img, solid(size, shadow + (255,)), rounded_mask(size, radius, (0, lift, size[0], size[1])))
    body = vertical_gradient(size, top, bottom)
    img = composite(img, body, rounded_mask(size, radius, (0, 0, size[0], size[1] - lift)))
    # glossy highlight on the upper half
    gloss_mask = rounded_mask(size, radius - 4 * S, (4 * S, 4 * S, size[0] - 4 * S, size[1] // 2))
    img = overlay(img, (255, 255, 255, 46), gloss_mask)
    if sparkles:
        draw = ImageDraw.Draw(img)
        for (cx, cy, r) in [(14 * S, 16 * S, 6 * S), (66 * S, 60 * S, 4 * S), (62 * S, 14 * S, 3 * S)]:
            star = [(cx, cy - r), (cx + r * 0.28, cy - r * 0.28), (cx + r, cy), (cx + r * 0.28, cy + r * 0.28),
                    (cx, cy + r), (cx - r * 0.28, cy + r * 0.28), (cx - r, cy), (cx - r * 0.28, cy - r * 0.28)]
            draw.polygon(star, fill=(255, 255, 255, 230))
    save(img, name)


def glow():
    # widget layer is the tile rect expanded by 12 units on every side
    size = (106 * S, 106 * S)
    inset = 8 * S
    stroke = Image.new("RGBA", size, (0, 0, 0, 0))
    outer = rounded_mask(size, 22 * S, (inset, inset, size[0] - inset, size[1] - inset))
    inner = rounded_mask(size, 18 * S, (inset + 4 * S, inset + 4 * S, size[0] - inset - 4 * S, size[1] - inset - 4 * S))
    ring = Image.eval(inner, lambda v: 255 - v)
    ring_mask = Image.composite(outer, Image.new("L", size, 0), ring)
    stroke = composite(stroke, solid(size, (255, 255, 255, 255)), ring_mask)
    halo = stroke.filter(ImageFilter.GaussianBlur(9 * S // 2))
    halo_px = halo.split()[3].point(lambda a: min(255, int(a * 1.4)))
    halo.putalpha(halo_px)
    img = Image.alpha_composite(halo, stroke)
    save(img, "tile_glow.png")


def dot():
    size = (16 * S, 16 * S)
    img = composite(Image.new("RGBA", size, (0, 0, 0, 0)), solid(size, (255, 255, 255, 255)), ellipse_mask(size))
    save(img, "dot.png")


def pill():
    size = (440 * S, 54 * S)
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    img = composite(img, solid(size, (86, 94, 160, 255)), rounded_mask(size, 27 * S))
    b = 2 * S
    img = composite(img, solid(size, (42, 47, 85, 240)), rounded_mask(size, 27 * S - b, (b, b, size[0] - b, size[1] - b)))
    save(img, "pill.png")


def badge():
    size = (96 * S, 96 * S)
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    img = composite(img, solid(size, (90, 100, 170, 255)), ellipse_mask(size))
    b = 4 * S
    img = composite(img, solid(size, (42, 47, 85, 255)), ellipse_mask(size, (b, b, size[0] - b, size[1] - b)))
    save(img, "timer_badge.png")


def panel():
    size = (440 * S, 360 * S)
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    img = composite(img, solid(size, (90, 100, 170, 255)), rounded_mask(size, 24 * S))
    b = 3 * S
    img = composite(img, solid(size, (38, 43, 80, 255)), rounded_mask(size, 24 * S - b, (b, b, size[0] - b, size[1] - b)))
    save(img, "panel.png")


def button():
    size = (260 * S, 76 * S)
    lift = 5 * S
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    img = composite(img, solid(size, (23, 138, 74, 255)), rounded_mask(size, 20 * S, (0, lift, size[0], size[1])))
    img = composite(img, vertical_gradient(size, (72, 220, 132), (34, 181, 99)), rounded_mask(size, 20 * S, (0, 0, size[0], size[1] - lift)))
    gloss = rounded_mask(size, 16 * S, (4 * S, 4 * S, size[0] - 4 * S, size[1] // 2))
    img = overlay(img, (255, 255, 255, 40), gloss)
    save(img, "btn.png")


def tray():
    size = (480 * S, 480 * S)
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    img = composite(img, solid(size, (58, 64, 112, 255)), rounded_mask(size, 22 * S))
    b = 2 * S
    img = composite(img, solid(size, (34, 38, 70, 255)), rounded_mask(size, 22 * S - b, (b, b, size[0] - b, size[1] - b)))
    save(img, "board_tray.png")


def background():
    size = (540, 960)
    img = vertical_gradient(size, (32, 36, 70), (16, 18, 38))
    # soft light behind the board
    light = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(light).ellipse([270 - 330, 420 - 330, 270 + 330, 420 + 330], fill=(70, 78, 140, 110))
    light = light.filter(ImageFilter.GaussianBlur(90))
    img = Image.alpha_composite(img, light)
    save(img, "bg.png")


if __name__ == "__main__":
    tile("tile_pos.png", (255, 140, 110), (240, 96, 70), (190, 66, 44))
    tile("tile_neg.png", (96, 190, 255), (48, 140, 235), (28, 96, 176))
    tile("tile_zero.png", (255, 226, 120), (250, 184, 50), (196, 132, 24), sparkles=True)
    glow()
    dot()
    pill()
    badge()
    panel()
    button()
    tray()
    background()
