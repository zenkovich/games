"""Shared helpers of the Unity -> o2 port scripts."""
import hashlib
import json
import os

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
UNITY = "/Users/andreizenkovich/work/My project"
EXPORT = os.path.join(REPO, "Work", "Unity", "Export")
CAPTURE = os.path.join(REPO, "Work", "Unity", "Capture")
ASSETS = os.path.join(REPO, "Assets")
DC = "DragonCrashers"


def uid(key):
    """Stable 32-hex asset/actor id for a key, so re-imports keep references."""
    return hashlib.md5(("dc-port:" + key).encode("utf-8")).hexdigest()


def write_if_changed(path, data):
    mode = "wb" if isinstance(data, (bytes, bytearray)) else "w"
    if os.path.exists(path):
        with open(path, "rb") as f:
            old = f.read()
        new = data if isinstance(data, (bytes, bytearray)) else data.encode("utf-8")
        if old == new:
            return False
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, mode) as f:
        f.write(data)
    return True


def meta(asset_rel, type_name, extra=None):
    """Writes <asset>.meta with a stable id; asset_rel is relative to Assets/."""
    value = {"mId": uid(asset_rel)}
    if extra:
        value.update(extra)
    text = json.dumps({"Type": type_name, "Value": value}, indent=4)
    write_if_changed(os.path.join(ASSETS, asset_rel + ".meta"), text)
    return value["mId"]


def folder_metas(asset_rel):
    """Folder metas for every folder of a path below Assets/."""
    parts = asset_rel.split("/")[:-1]
    for i in range(1, len(parts) + 1):
        rel = "/".join(parts[:i])
        meta(rel, "o2::DefaultAssetMeta<o2::FolderAsset>")


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)
