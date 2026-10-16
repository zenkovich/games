"""Temporary placeholder sprites for Potato Obby, drawn with Pillow.
Replace with Gemini art via art_prompts.py (same file names and sizes) when generation is available."""
import os, sys
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "Assets", "PotatoObby", "Sprites")
os.makedirs(OUT, exist_ok=True)
T = 40
OUTLINE = (40, 25, 15, 255)

def save(img, name):
    img.save(os.path.join(OUT, name))

def block():
    img = Image.new("RGBA", (T, T), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    d.rectangle([0, 0, T - 1, T - 1], fill=(139, 90, 43, 255), outline=OUTLINE, width=2)
    d.rectangle([2, 2, T - 3, 11], fill=(96, 180, 60, 255))
    d.rectangle([2, 10, T - 3, 12], fill=(60, 130, 40, 255))
    for x, y in [(10, 20), (24, 28), (30, 18), (14, 32)]:
        d.ellipse([x, y, x + 4, y + 3], fill=(110, 70, 30, 255))
    save(img, "block.png")

def spike():
    img = Image.new("RGBA", (T, T), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    d.rounded_rectangle([15, 22, 25, 39], radius=3, fill=(180, 180, 190, 255), outline=(70, 70, 80, 255), width=2)
    for x in [9, 18, 27]:
        d.polygon([(x, 24), (x + 4, 24), (x + 2, 2)], fill=(210, 210, 220, 255), outline=(70, 70, 80, 255))
    d.rectangle([8, 20, 32, 25], fill=(200, 200, 210, 255), outline=(70, 70, 80, 255))
    save(img, "spike.png")

def mover():
    img = Image.new("RGBA", (T, T), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    d.rectangle([0, 6, T - 1, T - 7], fill=(205, 150, 80, 255), outline=OUTLINE, width=2)
    for y in [14, 22, 30]:
        d.line([(3, y), (T - 4, y)], fill=(160, 110, 55, 255), width=1)
    d.ellipse([4, 16, 9, 21], fill=(80, 80, 80, 255)); d.ellipse([30, 16, 35, 21], fill=(80, 80, 80, 255))
    save(img, "mover.png")

def bounce():
    img = Image.new("RGBA", (T, T), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    d.rectangle([2, 26, T - 3, T - 1], fill=(60, 60, 70, 255), outline=OUTLINE, width=2)
    d.rounded_rectangle([0, 12, T - 1, 28], radius=6, fill=(230, 60, 60, 255), outline=OUTLINE, width=2)
    d.rectangle([4, 16, T - 5, 22], fill=(40, 40, 50, 255))
    save(img, "bounce.png")

def conveyor():
    img = Image.new("RGBA", (T, T), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 8, T - 1, T - 1], radius=8, fill=(90, 90, 100, 255), outline=OUTLINE, width=2)
    d.polygon([(10, 16), (24, 16), (24, 11), (34, 20), (24, 29), (24, 24), (10, 24)], fill=(250, 210, 50, 255), outline=OUTLINE)
    save(img, "conveyor.png")

def gravity():
    img = Image.new("RGBA", (T, T), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    d.ellipse([2, 2, T - 3, T - 3], fill=(150, 70, 220, 255), outline=(60, 20, 100, 255), width=2)
    d.polygon([(20, 6), (28, 16), (23, 16), (23, 24), (17, 24), (17, 16), (12, 16)], fill=(240, 220, 255, 255))
    d.polygon([(20, 36), (12, 26), (17, 26), (17, 20), (23, 20), (23, 26), (28, 26)], fill=(240, 220, 255, 200))
    save(img, "gravity.png")

def checkpoint():
    img = Image.new("RGBA", (T, T), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    d.rectangle([8, 2, 12, T - 1], fill=(120, 120, 130, 255), outline=(50, 50, 60, 255))
    d.polygon([(13, 3), (36, 10), (13, 18)], fill=(70, 200, 90, 255), outline=OUTLINE)
    save(img, "checkpoint.png")

def exit_sack():
    img = Image.new("RGBA", (T, 48), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    d.rounded_rectangle([3, 14, T - 4, 47], radius=10, fill=(196, 160, 100, 255), outline=OUTLINE, width=2)
    d.rectangle([12, 10, 28, 18], fill=(170, 130, 80, 255), outline=OUTLINE, width=2)
    for x, y in [(8, 4), (19, 1), (28, 5)]:
        d.ellipse([x, y, x + 10, y + 8], fill=(180, 120, 60, 255), outline=OUTLINE)
    d.line([(10, 26), (30, 26)], fill=(150, 115, 65, 255), width=2)
    d.line([(10, 36), (30, 36)], fill=(150, 115, 65, 255), width=2)
    save(img, "exit.png")

def potato():
    img = Image.new("RGBA", (T, 44), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    d.ellipse([3, 3, 36, 43], fill=(205, 150, 85, 255), outline=OUTLINE, width=2)
    d.ellipse([10, 12, 18, 22], fill=(255, 255, 255, 255), outline=OUTLINE)
    d.ellipse([22, 12, 30, 22], fill=(255, 255, 255, 255), outline=OUTLINE)
    d.ellipse([15, 15, 18, 19], fill=(0, 0, 0, 255)); d.ellipse([26, 15, 29, 19], fill=(0, 0, 0, 255))
    d.arc([13, 22, 27, 32], 10, 170, fill=OUTLINE, width=2)
    for x, y in [(8, 30), (26, 34), (30, 8)]:
        d.ellipse([x, y, x + 3, y + 3], fill=(160, 110, 55, 255))
    save(img, "potato.png")

def button(name, draw_symbol):
    s = 96
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    d.rounded_rectangle([2, 2, s - 3, s - 3], radius=20, fill=(255, 255, 255, 110), outline=(255, 255, 255, 200), width=3)
    draw_symbol(d, s)
    save(img, name)

def background():
    w, h = 1280, 900
    img = Image.new("RGBA", (w, h)); d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / h
        d.line([(0, y), (w, y)], fill=(int(110 + 60 * t), int(190 + 30 * t), int(245 - 20 * t), 255))
    for cx, cy, r in [(200, 120, 50), (260, 110, 65), (330, 125, 45), (820, 90, 40), (870, 80, 55), (930, 95, 40), (1100, 160, 45), (1150, 150, 60)]:
        d.ellipse([cx - r, cy - r * 0.6, cx + r, cy + r * 0.6], fill=(255, 255, 255, 235))
    d.ellipse([-200, 510, 700, 1080], fill=(120, 190, 90, 255))
    d.ellipse([500, 560, 1500, 1130], fill=(100, 175, 80, 255))
    d.rectangle([0, 750, w, h], fill=(90, 150, 65, 255))
    save(img, "background.png")

def solid(name, color, size=8):
    save(Image.new("RGBA", (size, size), color), name)

if __name__ == "__main__":
    block(); spike(); mover(); bounce(); conveyor(); gravity(); checkpoint(); exit_sack(); potato(); background()
    button("btn_left.png", lambda d, s: d.polygon([(30, s / 2), (62, 22), (62, s - 22)], fill=(255, 255, 255, 230)))
    button("btn_right.png", lambda d, s: d.polygon([(66, s / 2), (34, 22), (34, s - 22)], fill=(255, 255, 255, 230)))
    button("btn_jump.png", lambda d, s: d.polygon([(s / 2, 24), (s - 26, 58), (26, 58)], fill=(255, 255, 255, 230)))
    solid("white.png", (255, 255, 255, 255))
    solid("dark.png", (0, 0, 0, 255))
    print("ok", OUT)
