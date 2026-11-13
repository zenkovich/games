"""Imports the exported Unity content into Assets/DragonCrashers with stable metas.

Sources: Work/Unity/Export (PortExporter output) and the Unity project itself (fonts, audio).
Run: python3 Tools/UnityPort/import_assets.py [fonts|spine|sprites|audio ...]
"""
import os
import shutil
import subprocess
import sys

from port_common import ASSETS, DC, EXPORT, UNITY, folder_metas, load_json, meta, uid, write_if_changed

UI_ATLAS = f"{DC}/Sprites/UI.atlas"
GAME_ATLAS = f"{DC}/Sprites/Game.atlas"
ATLAS_MAX_SIDE = 1024  # bigger images stay standalone textures


def copy(src, rel):
    dst = os.path.join(ASSETS, rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with open(src, "rb") as f:
        write_if_changed(dst, f.read())
    folder_metas(rel)


def import_fonts():
    fonts = {
        "Fonts/AnderHedge/Ander Hedge.ttf": "AnderHedge.ttf",
        "UI/Fonts/ChelaOne-Regular.ttf": "ChelaOne-Regular.ttf",
    }
    for src, name in fonts.items():
        rel = f"{DC}/Fonts/{name}"
        copy(os.path.join(UNITY, "Assets", src), rel)
        meta(rel, "o2::VectorFontAsset::Meta")
    print("fonts:", len(fonts))


def import_spine():
    src_dir = os.path.join(EXPORT, "Spine")
    n = 0
    for f in sorted(os.listdir(src_dir)):
        name, ext = os.path.splitext(f)
        rel = f"{DC}/Characters/{f}"
        if ext == ".spine-json":
            # animation names without the clip prefixes: Anim_Character_Knight_Idle -> Idle
            import json, re
            data = json.load(open(os.path.join(src_dir, f)))
            data["animations"] = {re.sub(r"^(AnimClip_Character_[A-Za-z]+_|Anim_Character_[A-Za-z]+_|AnimClip_)", "", k): v
                                  for k, v in data["animations"].items()}
            dst = os.path.join(ASSETS, rel)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            write_if_changed(dst, json.dumps(data, separators=(",", ":")))
            folder_metas(rel)
            meta(rel, "o2::DefaultAssetMeta<o2::SpineAsset>")
            n += 1
        elif ext == ".spine-atlas":
            copy(os.path.join(src_dir, f), rel)
            meta(rel, "o2::DefaultAssetMeta<o2::SpineAtlasAsset>")
        elif ext == ".png":
            copy(os.path.join(src_dir, f), rel)
            meta(rel, "o2::ImageAsset::Meta")
        elif f.endswith(".info.json"):
            rel = f"{DC}/Characters/{f}"
            copy(os.path.join(src_dir, f), rel)
            meta(rel, "o2::DefaultAssetMeta<o2::DataAsset>")
    print("spine skeletons:", n)


def sprite_group(path):
    if path.startswith("Assets/UI/") or path.startswith("Assets/Localization/"):
        return "UI"
    if "VFX" in path or path.startswith("Assets/FX/"):
        return "VFX"
    return "Game"


def import_sprites(only_files=None):
    """Copies exported sprite pngs; a sprite's meta carries its nine-slice border.
    Returns {unity key -> assets path} written to Sprites/sprites.json for the builders."""
    from PIL import Image

    src_dir = os.path.join(EXPORT, "Sprites")
    manifest = load_json(os.path.join(src_dir, "manifest.json"))
    index = {}
    atlases = set()
    for e in manifest:
        f = e["file"]
        if only_files is not None and f not in only_files:
            continue
        group = sprite_group(e["path"])
        rel = f"{DC}/Sprites/{group}/{f}"
        key = ("sprite:" + e["tex"] + "/" + e["sprite"]) if e["kind"] == "sprite" else ("tex:" + e["tex"])
        if key in index and index[key]["asset"] != rel:
            # several PSD layers may share a name: the duplicates go under key#n (the UI picks by the slice border)
            n = 1
            while f"{key}#{n}" in index:
                n += 1
            key = f"{key}#{n}"
        entry = index.setdefault(key, {"asset": rel})
        if e["kind"] == "sprite":
            entry["border"] = e["border"]
            entry["pivot"] = e["pivot"]
            entry["ppu"] = e["ppu"]
        written.add(rel)

    # one meta per file: the border of the sprite that owns the file
    borders = {}
    for key, entry in index.items():
        b = entry.get("border")
        if b and any(v > 0 for v in b):
            borders[entry["asset"]] = b

    for rel in sorted(written):
        f = os.path.basename(rel)
        src = os.path.join(src_dir, f)
        copy(src, rel)
        w, h = Image.open(src).size
        extra = {}
        tiled = "Tile" in f or "Lava_Lake" in f
        if max(w, h) <= ATLAS_MAX_SIDE and not tiled:
            group = rel.split("/")[2]
            atlas = UI_ATLAS if group == "UI" else GAME_ATLAS
            extra["atlasId"] = uid(atlas)
            atlases.add(atlas)
        b = borders.get(rel)
        if b:
            extra["sliceBorder"] = {"left": int(round(b[0])), "bottom": int(round(b[1])), "right": int(round(b[2])), "top": int(round(b[3]))}
            extra["defaultMode"] = "Sliced"
        meta(rel, "o2::ImageAsset::Meta", extra)

    for atlas in atlases:
        path = os.path.join(ASSETS, atlas)
        if not os.path.exists(path):
            write_if_changed(path, "{}")
        folder_metas(atlas)
        meta(atlas, "o2::AtlasAsset::Meta", {"common": {"maxSize": {"x": 2048, "y": 2048}, "border": 2}})

    for group in ("UI", "Game", "VFX"):
        folder = os.path.join(ASSETS, DC, "Sprites", group)
        for f in os.listdir(folder):
            rel = f"{DC}/Sprites/{group}/{f}"
            if f.endswith(".png") and rel not in written and not f.endswith("_A.png"):
                os.remove(os.path.join(folder, f))
                if os.path.exists(os.path.join(folder, f + ".meta")):
                    os.remove(os.path.join(folder, f + ".meta"))
                print("  removed stale", rel)

    from port_bake import bake_luminance_alpha
    for n in ("Sprite_Glow", "Sprite_HitEffect", "Sprite_Cracks", "Texture_Gradient_Ring", "Sprite_Splatter"):
        bake_luminance_alpha(f"{DC}/Sprites/VFX/{n}.png")

    import json
    rel_index = f"{DC}/Sprites/sprites.json"
    write_if_changed(os.path.join(ASSETS, rel_index), json.dumps(index, indent=1, sort_keys=True))
    meta(rel_index, "o2::DefaultAssetMeta<o2::DataAsset>")
    print("sprites:", len(written), "keys:", len(index))


written = set()


def import_audio():
    src_root = os.path.join(UNITY, "Assets", "Audio")
    n = 0
    for dirpath, _, files in os.walk(src_root):
        for f in files:
            if not f.lower().endswith(".wav"):
                continue
            sub = os.path.relpath(dirpath, src_root)
            name = os.path.splitext(f)[0] + ".mp3"
            rel = f"{DC}/Audio/{sub}/{name}".replace("/./", "/")
            dst = os.path.join(ASSETS, rel)
            if not os.path.exists(dst):
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", os.path.join(dirpath, f),
                                "-c:a", "libmp3lame", "-q:a", "3", dst], check=True)
            folder_metas(rel)
            meta(rel, "o2::DefaultAssetMeta<o2::SoundAsset>")
            n += 1
    print("audio:", n)


if __name__ == "__main__":
    what = sys.argv[1:] or ["fonts", "spine", "sprites", "audio"]
    if "fonts" in what:
        import_fonts()
    if "spine" in what:
        import_spine()
    if "sprites" in what:
        import_sprites()
    if "audio" in what:
        import_audio()
