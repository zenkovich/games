"""Resizes generated art into the game asset folders and draws the flat UI primitives (panels, buttons, bars)."""
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ART = os.path.join(ROOT, "Work", "Art")
ASSETS = os.path.join(ROOT, "Assets")


def out(sub, name):
    path = os.path.join(ASSETS, sub)
    os.makedirs(path, exist_ok=True)
    return os.path.join(path, name)


def trim(img, pad=4):
    bbox = img.getbbox()
    if not bbox:
        return img
    l, t, r, b = bbox
    l, t = max(0, l - pad), max(0, t - pad)
    r, b = min(img.width, r + pad), min(img.height, b + pad)
    return img.crop((l, t, r, b))


def fit_square(img, size):
    """Trim, then fit into a square canvas keeping aspect."""
    img = trim(img)
    scale = size / max(img.width, img.height)
    w, h = max(1, round(img.width * scale)), max(1, round(img.height * scale))
    img = img.resize((w, h), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(img, ((size - w) // 2, (size - h) // 2), img)
    return canvas


def convert(src, sub, name, size=None, square=True, trim_alpha=True):
    img = Image.open(os.path.join(ART, src)).convert("RGBA")
    if size is None:
        img.save(out(sub, name))
        return
    if square:
        img = fit_square(img, size)
    else:
        if trim_alpha:
            img = trim(img)
        img = img.resize(size, Image.LANCZOS)
    img.save(out(sub, name))


BALLS = ["wheat", "berry", "cotton", "iron", "gold", "coal", "apple", "honey", "flower", "wood", "resin", "mushroom"]
for b in BALLS:
    convert(f"ball_{b}.png", "Balls", f"{b}.png", 128)

BUILDINGS = ["farm", "mine", "orchard", "sawmill", "bakery", "forge", "weaver", "jeweler",
             "cottage", "townhouse", "manor", "fountain", "park", "cafe", "lot"]
for b in BUILDINGS:
    convert(f"bld_{b}.png", "Buildings", f"{b}.png", 300)

GOODS = ["bread", "pie", "cake", "nails", "tools", "cloth", "dress", "ring", "necklace"]
for g in GOODS:
    convert(f"good_{g}.png", "Goods", f"{g}.png", 128)

for n in ["tom", "rick", "leo", "max"]:
    convert(f"npc_{n}.png", "Npc", f"{n}.png", 512)

for i in ["coin", "heart", "people", "star", "crate", "lock"]:
    convert(f"icon_{i}.png", "UI", f"icon_{i}.png", 96)
convert("btn_back.png", "UI", "btn_back.png", 160)

convert("jar.png", "UI", "jar.png", (760, 1020), square=False)
convert("bg_glass.png", "Backgrounds", "glass.jpg" if False else "glass.png", (1080, 1920), square=False, trim_alpha=False)
convert("bg_city.png", "Backgrounds", "city.png", (1080, 1920), square=False, trim_alpha=False)
convert("date_park.png", "Backgrounds", "date_park.png", (1080, 806), square=False, trim_alpha=False)
convert("date_cafe.png", "Backgrounds", "date_cafe.png", (1080, 806), square=False, trim_alpha=False)


def rounded(name, size, radius, fill, outline=None, width=0, shade=None):
    """9-slice friendly rounded rectangle with an optional darker bottom shade."""
    scale = 4
    big = (size[0] * scale, size[1] * scale)
    img = Image.new("RGBA", big, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if shade:
        d.rounded_rectangle([0, 0, big[0] - 1, big[1] - 1], radius * scale, fill=shade)
        d.rounded_rectangle([0, 0, big[0] - 1, big[1] - 1 - 6 * scale], radius * scale, fill=fill,
                            outline=outline, width=width * scale)
    else:
        d.rounded_rectangle([0, 0, big[0] - 1, big[1] - 1], radius * scale, fill=fill, outline=outline,
                            width=width * scale)
    img = img.resize(size, Image.LANCZOS)
    img.save(out("UI", name))


rounded("panel.png", (96, 96), 24, (255, 248, 230, 255), (214, 170, 120, 255), 4)
rounded("panel_dark.png", (96, 96), 24, (96, 62, 42, 235), (68, 42, 28, 255), 3)
rounded("card.png", (96, 96), 18, (255, 255, 255, 255), (230, 205, 170, 255), 3)
rounded("btn_green.png", (96, 96), 26, (110, 205, 80, 255), (60, 140, 40, 255), 3, shade=(60, 140, 40, 255))
rounded("btn_blue.png", (96, 96), 26, (86, 170, 240, 255), (40, 110, 190, 255), 3, shade=(40, 110, 190, 255))
rounded("btn_orange.png", (96, 96), 26, (250, 170, 60, 255), (200, 110, 30, 255), 3, shade=(200, 110, 30, 255))
rounded("btn_pink.png", (96, 96), 26, (245, 120, 160, 255), (190, 70, 110, 255), 3, shade=(190, 70, 110, 255))
rounded("btn_gray.png", (96, 96), 26, (190, 190, 190, 255), (140, 140, 140, 255), 3, shade=(140, 140, 140, 255))
rounded("bar_bg.png", (64, 32), 16, (225, 210, 190, 255), (190, 160, 130, 255), 2)
rounded("bar_fill.png", (64, 32), 16, (255, 120, 150, 255))
rounded("bar_fill_green.png", (64, 32), 16, (120, 210, 90, 255))
rounded("slot_ring.png", (96, 96), 48, (255, 255, 255, 0), (255, 255, 255, 200), 6)

Image.new("RGBA", (8, 8), (255, 255, 255, 255)).save(out("UI", "white.png"))
print("done")
