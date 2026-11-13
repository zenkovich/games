"""Bakes the look of Unity's 2D lights and post-processing (URP Global Volume) into two screen-space overlays.

The Unity world frame U and the unlit o2 frame O (same camera, no UI) are blurred to keep only the low-frequency
light, then per pixel U ~ k*O + E: a black overlay of alpha 1-k darkens (normal blend) and an additive overlay adds E.
Out: Assets/DragonCrashers/Sprites/Game/Baked/Light{Darken,Add}_<scene>.png
python3 bake_lighting.py <unity frames...> -- <o2 frames...> <scene name>
"""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

from port_common import ASSETS, DC, folder_metas, meta

SIZE = (960, 540)
BLUR = 24


def load(paths):
    acc = None
    for p in paths:
        img = Image.open(p).convert("RGB").resize(SIZE, Image.LANCZOS).filter(ImageFilter.GaussianBlur(BLUR))
        a = np.asarray(img, dtype=np.float32)/255.0
        acc = a if acc is None else acc + a
    return acc/len(paths)


def save(img, name):
    rel = f"{DC}/Sprites/Game/Baked/{name}.png"
    path = os.path.join(ASSETS, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)
    folder_metas(rel)
    meta(rel, "o2::ImageAsset::Meta")
    return rel


def main():
    args = sys.argv[1:]
    sep = args.index("--")
    unity, o2, scene = args[:sep], args[sep + 1:-1], args[-1]
    u, o = load(unity), load(o2)
    eps = 1e-3
    ratio = u/np.maximum(o, eps)
    k = np.clip(ratio.min(axis=2), 0.0, 1.0)
    e = np.clip(u - k[..., None]*o, 0.0, 1.0)
    darken = np.zeros((SIZE[1], SIZE[0], 4), dtype=np.uint8)
    darken[..., 3] = np.round((1.0 - k)*255).astype(np.uint8)
    add = np.zeros((SIZE[1], SIZE[0], 4), dtype=np.uint8)
    add[..., :3] = np.round(e*255).astype(np.uint8)
    add[..., 3] = 255
    a = save(Image.fromarray(darken, "RGBA"), "LightDarken_" + scene)
    b = save(Image.fromarray(add, "RGBA"), "LightAdd_" + scene)
    # quality of the fit on the blurred frames
    fit = k[..., None]*o + e
    print("darken", a, "add", b, "mean |U - fit| = %.4f, mean |U - O| = %.4f" % (np.abs(u - fit).mean(), np.abs(u - o).mean()))


if __name__ == "__main__":
    main()
