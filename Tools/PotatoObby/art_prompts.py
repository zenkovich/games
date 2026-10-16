"""Regenerates the Potato Obby sprites with Gemini (o2/Tools/ImageGen) and resizes them to the sizes
the game expects. Needs a Gemini key with credits (o2/Tools/ImageGen/api_key.txt or GEMINI_API_KEY).
Run from the repo root: python3 Tools/PotatoObby/art_prompts.py [name ...]"""
import os, subprocess, sys
from PIL import Image

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
TOOLS = os.path.join(ROOT, "o2", "Tools", "ImageGen")
RAW = os.path.join(ROOT, "Work", "Art")
OUT = os.path.join(ROOT, "Assets", "PotatoObby", "Sprites")
STYLE = ("clean vector cartoon game sprite, bold dark outlines, flat shading, vibrant saturated colors, "
         "no text, centered, isolated subject")

SPRITES = {
    "potato": ("cute round brown potato character with big white eyes, small smile, tiny arms and legs, facing right", (40, 44), True),
    "block": ("square block of brown soil with a strip of green grass on top, seamless tile, square", (40, 40), True),
    "spike": ("silver metal dinner fork standing upright with tines pointing up, like a spike trap", (40, 40), True),
    "mover": ("wooden plank platform with two small metal wheels, side view, square", (40, 40), True),
    "bounce": ("small red trampoline with black elastic band and dark metal base, side view", (40, 40), True),
    "conveyor": ("grey rubber conveyor belt segment with a yellow arrow pointing right, side view, square", (40, 40), True),
    "gravity": ("glowing purple magic circle with two white arrows pointing up and down", (40, 40), True),
    "checkpoint": ("grey metal pole with a small green triangular flag", (40, 40), True),
    "exit": ("burlap sack full of brown potatoes, top open, potatoes peeking out", (40, 48), True),
    "btn_left": ("semi transparent white rounded square touch button with a white left arrow", (96, 96), True),
    "btn_right": ("semi transparent white rounded square touch button with a white right arrow", (96, 96), True),
    "btn_jump": ("semi transparent white rounded square touch button with a white up triangle", (96, 96), True),
    "background": ("bright farm field landscape for a 2D platformer background: blue sky, fluffy clouds, "
                   "rolling green hills, a wooden fence and a barn far away, no characters, no foreground objects",
                   (1280, 900), False),
}

def generate(name):
    prompt, size, transparent = SPRITES[name]
    os.makedirs(RAW, exist_ok=True)
    raw = os.path.join(RAW, name + ".png")
    script = "generate_transparent.py" if transparent else "generate_image.py"
    args = [sys.executable, os.path.join(TOOLS, script), prompt + ", " + STYLE, "--out", raw]
    if not transparent:
        args += ["--aspect", "4:3"]
    subprocess.run(args, check=True)
    image = Image.open(raw).convert("RGBA")
    image = image.resize(size, Image.LANCZOS)
    image.save(os.path.join(OUT, name + ".png"))
    print("->", name, size)

if __name__ == "__main__":
    names = sys.argv[1:] or list(SPRITES)
    for name in names:
        generate(name)
