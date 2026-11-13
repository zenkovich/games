"""Scene composition of the Unity scenes (runtime dumps) -> world sprite plan for the o2 scene builder.

Unity world units map to the 1920x1080 design pixels through the scene camera (orthographic size).
Sorting layer + order become draw depths. Out: Work/Unity/scene_plan.json
"""
import glob
import json
import math
import os

from PIL import Image

from port_common import ASSETS, CAPTURE, DC, REPO, load_json

SPRITES = load_json(os.path.join(ASSETS, DC, "Sprites", "sprites.json"))
BY_NAME = {}
for key, info in SPRITES.items():
    if key.startswith("sprite:"):
        BY_NAME.setdefault(key.split("/", 1)[1], info)


def sprite_info(sprite, tex):
    info = SPRITES.get("sprite:%s/%s" % (tex, sprite)) or BY_NAME.get(sprite)
    return info


def capture(stem):
    return load_json(glob.glob(os.path.join(CAPTURE, "*_" + stem + ".scene.json"))[0])[0]


def camera_of(dump, name="CameraLandscape"):
    cam = next(c for c in dump["cameras"] if c["name"] == name)
    ppu = 1080.0 / (2.0 * cam["size"])
    return cam["pos"][0], cam["pos"][1], ppu


def decompose(wm):
    a, b, c, d = wm[0], wm[1], wm[2], wm[3]
    sx = math.hypot(a, c)
    sy = math.hypot(b, d)
    det = a * d - b * c
    angle = math.degrees(math.atan2(c, a))
    if det < 0:
        sy = -sy
    return angle, sx, sy


def sprites_of(dump, roots, exclude=(), cam=None):
    cx, cy, ppu = cam
    res = []
    order = [0]

    def walk(e, path):
        if not e.get("a"):
            return
        for c in e.get("c", []):
            if c["t"] != "SpriteRenderer" or not c.get("en") or not c.get("sprite"):
                continue
            if any(x in path for x in exclude):
                continue
            info = sprite_info(c["sprite"], c["tex"])
            if not info:
                print("  ! no sprite", c["sprite"], path)
                continue
            asset = info["asset"]
            iw, ih = Image.open(os.path.join(ASSETS, asset)).size
            sprite_ppu = info.get("ppu", 100)
            wm = e["wm"]
            angle, sx, sy = decompose(wm)
            if c["flip"][0]:
                sx = -sx
            if c["flip"][1]:
                sy = -sy
            mode = c["drawMode"]
            if mode == "Simple":
                w, h = iw / sprite_ppu, ih / sprite_ppu
            else:
                w, h = c["size"]
            px, py = info.get("pivot", [iw / 2, ih / 2])
            order[0] += 1
            border = info.get("border") or [0, 0, 0, 0]
            if mode == "Tiled" and (border[0] > 0 or border[2] > 0):
                # tiled with nine-slice caps: the caps stay at the ends, only the middle tiles
                res.extend(split_tiled(e, c, info, asset, iw, ih, w, h, wm, angle, sx, sy, cam, order[0]))
                continue
            res.append({
                "name": e["n"], "path": path, "asset": asset,
                "pos": [round((wm[4] - cx) * ppu, 2), round((wm[5] - cy) * ppu, 2)],
                "size": [round(w * ppu, 2), round(h * ppu, 2)],
                "pivot": [round(px / iw, 4), round(py / ih, 4)],
                "angle": round(angle, 3), "scale": [round(sx, 4), round(sy, 4)],
                "color": [round(v, 4) for v in c["color"]],
                "mode": mode, "tileScale": round(ppu / sprite_ppu, 4) if mode == "Tiled" else None,
                "depth": c["layerValue"] * 10000 + c["order"] * 10 + (wm[6] if len(wm) > 6 else 0) * -0.01 + order[0] * 0.0001,
                "material": c.get("mat"),
            })
        for ch in e.get("ch", []):
            walk(ch, path + "/" + ch["n"])

    for r in dump["roots"]:
        if r["n"] in roots:
            walk(r, r["n"])
    return res


def split_tiled(e, c, info, asset, iw, ih, w, h, wm, angle, sx, sy, cam, order):
    from port_bake import bake_crop
    cx, cy, ppu = cam
    sppu = info.get("ppu", 100)
    l, b, r, t = info["border"]
    name = os.path.splitext(os.path.basename(asset))[0]
    pieces = [("L", bake_crop(asset, (0, 0, int(l), ih), name + "_L"), l / sppu, -w / 2 + l / sppu / 2, "Simple"),
              ("C", bake_crop(asset, (int(l), 0, iw - int(r), ih), name + "_C"), w - (l + r) / sppu, (l - r) / sppu / 2, "Tiled"),
              ("R", bake_crop(asset, (iw - int(r), 0, iw, ih), name + "_R"), r / sppu, w / 2 - r / sppu / 2, "Simple")]
    res = []
    for suffix, rel, pw, lx, mode in pieces:
        res.append({
            "name": e["n"] + "_" + suffix, "path": "", "asset": rel,
            "pos": [round((wm[4] + lx * sx - cx) * ppu, 2), round((wm[5] - cy) * ppu, 2)],
            "size": [round(pw * ppu, 2), round(h * ppu, 2)], "pivot": [0.5, 0.5],
            "angle": round(angle, 3), "scale": [round(sx, 4), round(sy, 4)],
            "color": [round(v, 4) for v in c["color"]], "mode": mode,
            "tileScale": round(ppu / sppu, 4) if mode == "Tiled" else None,
            "depth": c["layerValue"] * 10000 + c["order"] * 10 + order * 0.0001, "material": c.get("mat")})
    return res


def world_pos(dump, path, cam):
    cx, cy, ppu = cam
    parts = path.split("/")
    nodes = dump["roots"]
    e = None
    for p in parts:
        e = next((n for n in nodes if n["n"] == p), None)
        if e is None:
            return None
        nodes = e.get("ch", [])
    wm = e["wm"]
    angle, sx, sy = decompose(wm)
    return {"pos": [round((wm[4] - cx) * ppu, 2), round((wm[5] - cy) * ppu, 2)], "scale": [round(sx * ppu / 100, 4), round(sy * ppu / 100, 4)]}


def unit_info(dump, unit, cam):
    root = next(n for n in dump["roots"] if n["n"] == unit)
    visuals = next(n for n in root["ch"] if n["n"] == "Unit_CharacterVisuals")
    character = next(n for n in visuals["ch"] if n["n"].startswith("PV_Character"))
    res = {"spineRoot": world_pos(dump, unit + "/Unit_CharacterVisuals/" + character["n"], cam), "unit": world_pos(dump, unit, cam)}
    for part in ("Unity_HealthBar", "Unit_DamageDisplayLocation"):
        wp = world_pos(dump, unit + "/" + part, cam)
        if wp:
            res[part] = wp["pos"]
    return res


def main():
    plan = {}

    menu = capture("menu_char_stats")
    cam = camera_of(menu)
    plan["MainMenu"] = {
        "camera": {"pos": cam[:2], "ppu": cam[2]},
        "sprites": sprites_of(menu, ["CharPreviews"], exclude=("PV_Character", "UserStandin"), cam=cam),
        "preview": world_pos(menu, "CharPreviews/Preview", cam),
    }

    game = capture("game_t12.0")
    cam = camera_of(game)
    plan["Game"] = {
        "camera": {"pos": cam[:2], "ppu": cam[2]},
        "sprites": sprites_of(game, ["Layer_Background", "Layer_Foreground", "Unit_Knight_Jarek", "Unit_Witch_Giorgia",
                                     "Unit_Wolfman_Oriz", "Unit_Dragon_Rustum"], exclude=("CharacterVisuals",), cam=cam),
        "units": {u: unit_info(game, u, cam) for u in
                  ("Unit_Knight_Jarek", "Unit_Witch_Giorgia", "Unit_Wolfman_Oriz", "Unit_Dragon_Rustum")},
    }
    out = os.path.join(REPO, "Work", "Unity", "scene_plan.json")
    with open(out, "w") as f:
        json.dump(plan, f, indent=1)
    for k, v in plan.items():
        print(k, "sprites", len(v["sprites"]), {kk: vv for kk, vv in v.items() if kk not in ("sprites",)})


if __name__ == "__main__":
    main()
