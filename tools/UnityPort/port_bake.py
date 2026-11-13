"""Baked sprites the o2 widgets need where UI Toolkit drew rounded corners or render textures."""
import os

from PIL import Image, ImageDraw

from port_common import ASSETS, DC, meta, uid, folder_metas

BAKED_REL = f"{DC}/Sprites/UI/Baked"
UI_ATLAS = f"{DC}/Sprites/UI.atlas"


def _save(img, name, border=None):
    rel = f"{BAKED_REL}/{name}.png"
    path = os.path.join(ASSETS, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)
    folder_metas(rel)
    extra = {"atlasId": uid(UI_ATLAS)}
    if border:
        extra["sliceBorder"] = {"left": border, "bottom": border, "right": border, "top": border}
        extra["defaultMode"] = "Sliced"
    meta(rel, "o2::ImageAsset::Meta", extra)
    return rel


def bake_round_rect(radius):
    size = radius * 2 + 4
    ss = 4
    img = Image.new("L", (size * ss, size * ss), 0)
    ImageDraw.Draw(img).rounded_rectangle([0, 0, size * ss - 1, size * ss - 1], radius=radius * ss, fill=255)
    alpha = img.resize((size, size), Image.LANCZOS)
    rgba = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    rgba.putalpha(alpha)
    return _save(rgba, f"RoundRect_r{radius}", radius)


def baked_sprite(name):
    if name == "LevelMeterThumbnail":
        src = Image.open(os.path.join(ASSETS, DC, "Sprites", "UI", "Knight_meter_v2.png")).convert("RGBA")
        w, h = 202, 197
        img = src.resize((w, h), Image.LANCZOS)
        ss = 4
        mask = Image.new("L", (w * ss, h * ss), 0)
        d = min(w, h) * ss
        ox, oy = (w * ss - d) // 2, (h * ss - d) // 2
        ImageDraw.Draw(mask).ellipse([ox, oy, ox + d - 1, oy + d - 1], fill=255)
        mask = mask.resize((w, h), Image.LANCZOS)
        a = Image.composite(img.getchannel("A"), Image.new("L", (w, h), 0), mask)
        img.putalpha(a)
        return _save(img, name)
    raise KeyError(name)


def bake_ring(size, width):
    """White ring for the RadialProgress control: track and progress fill (Fill360CW)."""
    ss = 4
    img = Image.new("L", (size * ss, size * ss), 0)
    d = ImageDraw.Draw(img)
    d.ellipse([0, 0, size * ss - 1, size * ss - 1], fill=255)
    w = width * ss
    d.ellipse([w, w, size * ss - 1 - w, size * ss - 1 - w], fill=0)
    alpha = img.resize((size, size), Image.LANCZOS)
    rgba = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    rgba.putalpha(alpha)
    rel = f"{BAKED_REL}/Ring_{size}_{width}.png"
    path = os.path.join(ASSETS, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    rgba.save(path)
    folder_metas(rel)
    meta(rel, "o2::ImageAsset::Meta", {"atlasId": uid(UI_ATLAS)})
    return rel


def bake_rotated180(asset, border, mode="r"):
    """A copy of a sprite turned by 180 degrees (mode r) or mirrored (h, v), slice borders swapped accordingly
    (o2 layers ignore a mirrored widget scale)."""
    src = os.path.join(ASSETS, asset)
    suffix = {"r": "_rot180", "h": "_flipH", "v": "_flipV"}[mode]
    name = os.path.splitext(os.path.basename(asset))[0] + suffix
    img = Image.open(src).convert("RGBA")
    img = img.rotate(180) if mode == "r" else img.transpose(Image.FLIP_LEFT_RIGHT if mode == "h" else Image.FLIP_TOP_BOTTOM)
    rel = f"{BAKED_REL}/{name}.png"
    path = os.path.join(ASSETS, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)
    folder_metas(rel)
    extra = {"atlasId": uid(UI_ATLAS)}
    nb = None
    if border and any(border):
        l, b, r, t = border
        nb = {"r": [r, t, l, b], "h": [r, b, l, t], "v": [l, t, r, b]}[mode]
        extra["sliceBorder"] = {"left": int(nb[0]), "bottom": int(nb[1]), "right": int(nb[2]), "top": int(nb[3])}
        extra["defaultMode"] = "Sliced"
    meta(rel, "o2::ImageAsset::Meta", extra)
    return rel, nb


def bake_crop(asset, box, name):
    """A region of a sprite as its own image (box: left, top, right, bottom in pixels)."""
    img = Image.open(os.path.join(ASSETS, asset)).convert("RGBA").crop(box)
    rel = f"{DC}/Sprites/Game/Baked/{name}.png"
    path = os.path.join(ASSETS, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)
    folder_metas(rel)
    meta(rel, "o2::ImageAsset::Meta")
    return rel


def bake_luminance_alpha(asset):
    """An additive (black-backed) particle texture as a white sprite with alpha = brightness, for normal blending."""
    import numpy as np
    src = Image.open(os.path.join(ASSETS, asset)).convert("RGBA")
    a = np.asarray(src).astype(np.float32)
    lum = a[..., :3].max(axis=2)*(a[..., 3]/255.0)
    out = np.zeros_like(a)
    out[..., :3] = 255
    out[..., 3] = lum
    rel = asset[:-4] + "_A.png"
    Image.fromarray(out.astype(np.uint8), "RGBA").save(os.path.join(ASSETS, rel))
    meta(rel, "o2::ImageAsset::Meta")
    return rel
