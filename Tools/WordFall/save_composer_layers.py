#!/usr/bin/env python3
"""Saves the layers of the composer node of a pipeline into Assets, the way the composer's
"Save layers to Assets" button does (PipelineComposerStage::RenderLayer): a 9-sliced layer is laid
out at its layer size with its slice borders and slice scale, then the result is resized to the
layer's export size; a plain layer is resized from its source. Inputs come from the pipeline's
cache (Work/Pipelines/cache/<pipeline id>/previews), nothing is generated.

--export writes the export sizes below into the composer node first (the composer's per-layer
"export size"), so the node shows what was saved. 9-sliced layers keep the screen scale of the game
(their borders are drawn 1:1 by the engine), the plain ones are saved at 1.5x for sharpness. The
slice borders of the 9-sliced sprites land in their .meta (sliceBorder, defaultMode Sliced).

    python3 Tools/WordFall/save_composer_layers.py [--export] [--pipeline Assets/Pipelines/Test.pipeline]
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "Assets"
CACHE = ROOT / "Work" / "Pipelines" / "cache"

# game pixels per composer canvas pixel: the composer lays the layers over the 768x1376 phone mockup,
# the game screen is 768x1673 for the concept's 471x1026 screen
GAME_PER_CANVAS = 1.95
PLAIN_SHARPNESS = 1.5


def safe_file_name(name):
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in name)
    return safe or "layer"


def box_resize(src, size):
    """PipelineImageOps::Resize, the shrinking branch: alpha-weighted box average"""
    h, w = src.shape[:2]
    out_w, out_h = size
    sx, sy = w / out_w, h / out_h
    out = np.zeros((out_h, out_w, 4), np.uint8)
    rgb = src[:, :, :3].astype(np.float64)
    a = src[:, :, 3].astype(np.float64)
    for y in range(out_h):
        y0 = int(y * sy)
        y1 = max(y0 + 1, int((y + 1) * sy))
        for x in range(out_w):
            x0 = int(x * sx)
            x1 = max(x0 + 1, int((x + 1) * sx))
            pa = a[y0:y1, x0:x1]
            pc = rgb[y0:y1, x0:x1]
            n = pa.size
            acc = pa.sum()
            if acc > 0:
                out[y, x, :3] = np.clip((pc * pa[..., None]).sum(axis=(0, 1)) / acc, 0, 255).astype(np.uint8)
            out[y, x, 3] = np.clip(acc / n if n else 0, 0, 255)
    return out


def bilinear_resize(src, size):
    """Bitmap::Resized: plain bilinear with half-pixel centres, values rounded"""
    h, w = src.shape[:2]
    out_w, out_h = size
    ys = (np.arange(out_h) + 0.5) * (h / out_h) - 0.5
    xs = (np.arange(out_w) + 0.5) * (w / out_w) - 0.5
    y0 = np.clip(np.floor(ys).astype(int), 0, h - 1)
    x0 = np.clip(np.floor(xs).astype(int), 0, w - 1)
    y1 = np.minimum(y0 + 1, h - 1)
    x1 = np.minimum(x0 + 1, w - 1)
    fy = np.clip(ys - y0, 0, 1)[:, None, None]
    fx = np.clip(xs - x0, 0, 1)[None, :, None]
    s = src.astype(np.float64)
    top = s[y0][:, x0] * (1 - fx) + s[y0][:, x1] * fx
    bottom = s[y1][:, x0] * (1 - fx) + s[y1][:, x1] * fx
    return np.clip(top * (1 - fy) + bottom * fy + 0.5, 0, 255).astype(np.uint8)


def resize(src, size):
    size = (max(1, size[0]), max(1, size[1]))
    h, w = src.shape[:2]
    if (w, h) == size:
        return src
    if w >= size[0] * 2 and h >= size[1] * 2:
        return box_resize(src, size)
    return bilinear_resize(src, size)


def nine_slice_resize(src, tw, th, slice_, scale):
    """PipelineImageOps::NineSliceResize"""
    h, w = src.shape[:2]
    tw, th = max(1, tw), max(1, th)

    def fit(a, b, limit):
        x, y = max(0, a), max(0, b)
        if x + y > limit - 1:
            k = (limit - 1) / max(1, x + y)
            x, y = int(x * k), int(y * k)
        return x, y

    l, r = fit(slice_["l"], slice_["r"], w)
    t, b = fit(slice_["t"], slice_["b"], h)
    k = min(max(scale, 0.05), 8.0)
    dl, dr = fit(int(round(l * k)), int(round(r * k)), tw)
    dt, db = fit(int(round(t * k)), int(round(b * k)), th)
    cols = [(0, l, 0, dl), (l, w - l - r, dl, tw - dl - dr), (w - r, r, tw - dr, dr)]
    rows = [(0, t, 0, dt), (t, h - t - b, dt, th - dt - db), (h - b, b, th - db, db)]
    out = np.zeros((th, tw, 4), np.uint8)
    for cx, cw, dx, dw in cols:
        if cw <= 0 or dw <= 0:
            continue
        for ry, rh, dy, dh in rows:
            if rh <= 0 or dh <= 0:
                continue
            piece = resize(src[ry:ry + rh, cx:cx + cw], (dw, dh))
            out[dy:dy + dh, dx:dx + dw] = piece[:min(dh, th - dy), :min(dw, tw - dx)]
    return out, (dl, dt, dr, db)


def composer_node(pipeline):
    for node in pipeline["nodes"]:
        if node["type"] == "composer":
            return node
    raise SystemExit("no composer node in the pipeline")


def layer_sources(pipeline, composer):
    """layer port id -> cached preview of what feeds it"""
    nodes = {n["id"]: n for n in pipeline["nodes"]}
    sources = {}
    previews = CACHE / pipeline["id"] / "previews"
    for edge in pipeline["edges"]:
        if edge["toNodeId"] != composer["id"]:
            continue
        source = nodes[edge["fromNodeId"]]
        multi = len(source.get("outputs", [])) > 1
        name = source["id"] + ("." + edge["fromPortId"] if multi else "") + ".png"
        sources[edge["toPortId"]] = previews / name
    return sources


# letter tiles share one width: they replace each other on the same cells
TILE_WIDTH = 156


def export_size(name, p, source):
    """9-slice: the layer at the game scale; plain: the source's own aspect at the layer's area, 1.5x"""
    if p.get("nine"):
        return [round(p["w"] * GAME_PER_CANVAS), round(p["h"] * GAME_PER_CANVAS)]
    sw, sh = Image.open(source).size
    width = TILE_WIDTH if name.startswith("tile") else round((p["w"] * p["h"] * sw / sh) ** 0.5 * GAME_PER_CANVAS * PLAIN_SHARPNESS)
    return [width, round(width * sh / sw)]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pipeline", default=str(ASSETS / "Pipelines" / "Test.pipeline"))
    parser.add_argument("--export", action="store_true", help="write the export sizes into the composer node first")
    args = parser.parse_args()

    path = Path(args.pipeline)
    pipeline = json.loads(path.read_text(encoding="utf-8"))
    composer = composer_node(pipeline)
    config = composer["config"]
    names = {port["id"]: port["name"] for port in composer["inputs"]}

    sources = layer_sources(pipeline, composer)
    if args.export:
        for port_id, p in config["layers"].items():
            if names.get(port_id) and sources.get(port_id) and sources[port_id].exists():
                p["exportW"], p["exportH"] = export_size(names[port_id], p, sources[port_id])
        path.write_text(json.dumps(pipeline, ensure_ascii=False, indent=4) + "\n", encoding="utf-8")
        print("export sizes written into", path.name)

    folder = ASSETS / config.get("layersFolder", "Generated")
    folder.mkdir(parents=True, exist_ok=True)
    prefix = config.get("layersName", "layer") or "layer"
    slices = {}
    taken = []
    for port_id in config.get("layerOrder", []):
        name = names.get(port_id, "")
        if not name:
            continue  # the unnamed base layer is the concept mockup the layers are laid over, not a sprite
        p = config["layers"][port_id]
        source = sources.get(port_id)
        if not source or not source.exists():
            print("skip", name, "- no cached input")
            continue
        image = np.asarray(Image.open(source).convert("RGBA"))
        w, h = max(1, round(p["w"])), max(1, round(p["h"]))
        size = (round(p["exportW"]), round(p["exportH"])) if p.get("exportW", 0) >= 1 and p.get("exportH", 0) >= 1 else (w, h)
        if p.get("nine"):
            image, borders = nine_slice_resize(image, w, h, p["slice"], p.get("sliceScale", 1.0))
            fx, fy = size[0] / w, size[1] / h
            slices[name] = (round(borders[0] * fx), round(borders[3] * fy), round(borders[2] * fx), round(borders[1] * fy))
        image = resize(image, size)
        if p.get("flipH"):
            image = image[:, ::-1]
        if p.get("flipV"):
            image = image[::-1]

        file = prefix + "_" + safe_file_name(name)
        unique, n = file, 2
        while unique in taken:
            unique, n = file + "_" + str(n), n + 1
        taken.append(unique)
        Image.fromarray(image, "RGBA").save(folder / (unique + ".png"))
        print("saved", unique + ".png", size, "slices l,b,r,t " + str(slices[name]) if name in slices else "")

    # metas: the assets builder creates missing ones; the 9-sliced sprites get their borders
    builder = ROOT / "Bin" / "Mac" / "AssetsBuilder"
    if builder.exists():
        subprocess.run([str(builder), "-platform", "Mac", "-source", str(ASSETS) + "/", "-target", str(ROOT / "BuiltAssets/Mac/Data") + "/",
                        "-target-tree", str(ROOT / "BuiltAssets/Mac/Data.json"), "-compressor-config", str(ROOT / "o2/CompressToolsConfig.json")],
                       check=False, stdout=subprocess.DEVNULL)
    for name, (left, bottom, right, top) in slices.items():
        meta_path = folder / (prefix + "_" + safe_file_name(name) + ".png.meta")
        if not meta_path.exists():
            print("no meta yet for", name, "- run the assets build and this script again")
            continue
        meta = json.loads(meta_path.read_text())
        meta["Value"]["sliceBorder"] = {"left": left, "bottom": bottom, "right": right, "top": top}
        meta["Value"]["defaultMode"] = "Sliced"
        meta_path.write_text(json.dumps(meta, indent=4))
    return 0


if __name__ == "__main__":
    sys.exit(main())
