#!/usr/bin/env python3
"""Turns the AI UI layouts saved from the "Wordfall UI" pipeline into the game's screens.

The pipeline's layout nodes save WordFall/UI/<Screen>.proto with <Screen>_Resources (sprites, fonts, font styles). The
kit's graphics, the fonts and the font styles move into one UI kit folder, WordFall/UIKit, shared by every screen (the
first copy keeps its uid, later copies are dropped and their uids rewritten in the prototypes); the screen's own graphics
(its backdrop, the season pass) stay in its _Resources; what no prototype draws any more is deleted, kit graphics
included (the kit folder holds what the screens use; a screen that uses more brings it with its export). Then each
prototype gets what the game needs: drawing depths above the game screen, its view script, a pressed state on its
buttons, the main screen's counters, its place in the ui camera, and its interface in the safe area (safe_area.py).

The screens live in the frame of the scene's ui camera, which is the screen of the UI kit's device (iPhone 16, 1179x2556,
see apply_camera_units.py) and fits it into the window or the device. A layout made for 1179x2112 goes into that frame like
a canvas scaler's Expand: the root is the frame in the layout's units (scaled only when the design does not fit it), the
room the design leaves goes to its anchors. The backdrop keeps its proportions and covers what the camera can show beyond
the frame (as far as the game screen's BG reaches); the windows' dimmers reach as far.

Rerun after saving the layouts again; it is idempotent.
"""
import copy
import hashlib
import json
import os
import shutil
import sys

import safe_area

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ASSETS = os.path.join(ROOT, "Assets")
UI = "WordFall/UI"
KIT = "WordFall/UIKit"
PIPELINE = os.path.join(ASSETS, "Pipelines", "Wordfall UI.pipeline")

SCREENS = {
    "MainScreen": {"script": "WordFallMainScreenView.js", "depth": 200, "remove": [],
                   "buttons": ["add_currency_button", "settings_button", "play_button", "map_button", "trophy_button",
                               "team_button", "journal_button"]},
    "VictoryWindow": {"script": "WordFallVictoryView.js", "depth": 400, "remove": ["backdrop"],
                      "buttons": ["continue_button", "double_reward_button", "close_button"]},
    "ContinueWindow": {"script": "WordFallContinueView.js", "depth": 400, "remove": ["backdrop"],
                       "buttons": ["buy_moves_button", "watch_ad_button", "close_button"]},
}

DESIGN = (1179.0, 2112.0)  # the layouts' screen


def camera_size():
    scene = read_json(os.path.join(ASSETS, "WordFall.scn"))
    camera = next(a for a in scene["Actors"] if a["Type"] == "o2::CameraActor" and body(a).get("mName") == "ui camera")
    size = body(camera)["mFixedOrFittedSize"]
    return size["x"], size["y"]


def game_reach():
    """What the camera can show around its frame: as far as the game screen's BG covers, in world units."""
    game = read_json(os.path.join(ASSETS, "WordFall", "Prototypes", "GameScreen.proto"))
    root = body(game["mActor"])
    scale = root.get("Transform", {}).get("scale", {}).get("x", 1.0)
    bg = next(c for c in root["Children"] if body(c)["mName"] == "BG")
    size = body(bg)["Transform"]["size"]
    return size["x"]*scale, size["y"]*scale

# The backdrop that covers the frame and what lies under it (moves and scales with the picture)
COVER = {"MainScreen": ("backdrop", ["bird_letter"])}

# Flat layers that dim everything the camera shows
DIMMERS = {"VictoryWindow": ["home_screen/modal_dimmer"], "ContinueWindow": ["background_dimmer"]}

# Rows whose items keep their share of the width on a screen wider than the design (bottom tabs)
SPREAD = {"MainScreen": ["bottom_navigation/tabs"]}

# The victory layout dims its own dark backdrop; in the game the bright main screen is under it
DIM = {"VictoryWindow": ("home_screen/modal_dimmer", 0.6)}

# The main screen's layout leaves its counters empty: the victory layout's labels go in
MAIN_COUNTERS = [("coin_balance", "top_hud/coin_counter"), ("lives_value", "top_hud/lives_counter"),
                 ("stars_value", "top_hud/stars_counter")]


def uid_hex(key):
    return hashlib.md5(("wordfall-ui:" + key).encode()).hexdigest()


def uid_int(key):
    return int(hashlib.md5(("wordfall-ui:" + key).encode()).hexdigest()[:16], 16) & 0x7FFFFFFFFFFFFFFF or 1


def read_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def write_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)
        f.write("\n")


def meta_id(path):
    return read_json(path + ".meta")["Value"]["mId"]


def write_meta(path, type_name, uid, extra=None):
    if os.path.exists(path + ".meta"):
        return
    value = {"mId": uid}
    value.update(extra or {})
    write_json(path + ".meta", {"Type": type_name, "Value": value})


def ensure_folder(rel):
    full = os.path.join(ASSETS, rel)
    os.makedirs(full, exist_ok=True)
    write_meta(full, "o2::DefaultAssetMeta<o2::FolderAsset>", uid_hex("folder:" + rel))


def kit_json():
    pipeline = read_json(PIPELINE)
    kit_node = next(n for n in pipeline["nodes"] if n["type"] == "uiKit")
    path = os.path.join(ROOT, "Work", "Pipelines", "cache", pipeline["id"], "previews", kit_node["id"] + ".txt")
    return read_json(path)


def gather_kit(kit):
    """Moves the kit's files out of every screen's _Resources; returns (uid map, path map, notes)."""
    names = {e["name"] for e in kit["elements"]} | {"white"}
    uid_map, path_map, notes = {}, {}, []
    for sub in ("Sprites", "Fonts", "FontStyles"):
        ensure_folder(KIT + "/" + sub)
    for screen in SCREENS:
        res = UI + "/" + screen + "_Resources"
        for sub in ("Sprites", "Fonts", "FontStyles"):
            folder = os.path.join(ASSETS, res, sub)
            if not os.path.isdir(folder):
                continue
            for name in sorted(os.listdir(folder)):
                if name.endswith(".meta"):
                    continue
                if sub == "Sprites" and os.path.splitext(name)[0] not in names:
                    continue
                src_rel, dst_rel = res + "/" + sub + "/" + name, KIT + "/" + sub + "/" + name
                src, dst = os.path.join(ASSETS, src_rel), os.path.join(ASSETS, dst_rel)
                if os.path.exists(dst):
                    with open(src, "rb") as a, open(dst, "rb") as b:
                        if a.read() != b.read():
                            notes.append("%s differs from the kit's %s: kept in the screen" % (src_rel, dst_rel))
                            continue
                    if os.path.exists(src + ".meta"):
                        uid_map[meta_id(src)] = meta_id(dst)
                        os.remove(src + ".meta")
                    os.remove(src)
                else:
                    shutil.move(src, dst)
                    if os.path.exists(src + ".meta"):
                        shutil.move(src + ".meta", dst + ".meta")
                path_map[src_rel] = dst_rel
            if not [n for n in os.listdir(folder) if not n.endswith(".meta")]:
                shutil.rmtree(folder)
                if os.path.exists(folder + ".meta"):
                    os.remove(folder + ".meta")

    return uid_map, path_map, notes


def relink(node, uid_map, path_map):
    if isinstance(node, dict):
        if "path" in node and "id" in node and node["path"] in path_map:
            node["path"] = path_map[node["path"]]
            node["id"] = uid_map.get(node["id"], node["id"])
        if node.get("mFontAssetId") in uid_map:
            node["mFontAssetId"] = uid_map[node["mFontAssetId"]]
        for v in node.values():
            relink(v, uid_map, path_map)
    elif isinstance(node, list):
        for v in node:
            relink(v, uid_map, path_map)


def body(actor):
    return actor.get("Value") or actor.get("Data")


def walk(actor, path=""):
    v = body(actor)
    yield actor, path
    for child in v.get("Children") or []:
        yield from walk(child, (path + "/" if path else "") + body(child)["mName"])


def find(root, path):
    for actor, p in walk(root):
        if p == path:
            return actor
    return None


def pressed_state(screen, path):
    key = screen + ":" + path
    return {"Type": "o2::WidgetState", "Value": {"name": "pressed", "mAnimation": {"instance": {
        "Type": "o2::AnimationAsset", "Value": {"animation": {"Type": "o2::AnimationClip", "Value": {"mTracks": [
            {"Type": "o2::AnimationTrack<float>", "Value": {"path": "layer/pressed/transparency", "curve": {
                "Type": "o2::Curve", "Value": {"mKeys": [
                    {"uid": uid_int(key + ":k0"), "rightSupportPosition": 0.024, "supportsType": "Broken"},
                    {"uid": uid_int(key + ":k1"), "value": 0.3, "position": 0.06, "leftSupportPosition": -0.06,
                     "supportsType": "Broken"}]}}}}],
            "mDuration": 0.06}}}},
        "meta": {"Type": "o2::DefaultAssetMeta<o2::AnimationAsset>", "Value": {"mId": uid_hex(key + ":anim")}}}}}


def add_pressed(screen, actor, path):
    v = body(actor)
    if any(s["Value"]["name"] == "pressed" for s in v.get("States") or []):
        return
    back = next((l for l in v.get("Layers") or [] if l["Value"]["mDrawable"]["Type"] == "o2::Sprite"), None)
    if not back:
        return
    layer = copy.deepcopy(back)
    layer["Value"]["name"] = "pressed"
    layer["Value"]["mUID"] = uid_int(screen + ":" + path + ":pressed")
    layer["Value"]["mTransparency"] = 0.0
    layer["Value"]["mDepth"] = 2.0
    layer["Value"]["mDrawable"]["Value"]["mColor"] = {"r": 24, "g": 14, "b": 4, "a": 255}
    v["Layers"].append(layer)
    v.setdefault("States", []).append(pressed_state(screen, path))


def spread(root, path, width=1179.0):
    row = find(root, path)
    for child in body(row).get("Children") or [] if row else []:
        t = body(child).setdefault("Transform", {})
        a_min, a_max = t.get("anchorMin", {"x": 0.0, "y": 0.0}), t.get("anchorMax", {"x": 0.0, "y": 0.0})
        if a_min.get("x", 0.0) != 0.0 or a_max.get("x", 0.0) != 0.0:
            continue
        o_min, o_max = t.get("offsetMin", {"x": 0.0, "y": 0.0}), t.get("offsetMax", {"x": 0.0, "y": 0.0})
        cx, w = (o_min.get("x", 0.0) + o_max.get("x", 0.0))/2, o_max.get("x", 0.0) - o_min.get("x", 0.0)
        t["anchorMin"] = {"x": cx/width, "y": a_min.get("y", 0.0)}
        t["anchorMax"] = {"x": cx/width, "y": a_max.get("y", 0.0)}
        t["offsetMin"] = {"x": -w/2, "y": o_min.get("y", 0.0)}
        t["offsetMax"] = {"x": w/2, "y": o_max.get("y", 0.0)}


def vec(x, y, z=None):
    v = {"x": x, "y": y}
    if z is not None:
        v["z"] = z
    return v


def place_in_camera(screen, proto, camera, reach):
    """The root is the camera's frame in the layout's units, scaled to it; the backdrop covers what the camera shows."""
    fit = min(camera[0]/DESIGN[0], camera[1]/DESIGN[1])
    root = proto["mActor"]
    rv = body(root)
    rv["Components"] = [c for c in rv.get("Components") or [] if c["Type"] != "ScreenFitComponent"]
    half = (camera[0]/fit/2, camera[1]/fit/2)
    t = rv.setdefault("Transform", {})
    t.update({"anchorMin": vec(0.5, 0.5), "anchorMax": vec(0.5, 0.5), "offsetMin": vec(-half[0], -half[1]),
              "offsetMax": vec(half[0], half[1]), "pivot": vec(0.5, 0.5, 0.0), "scale": vec(fit, fit, 1.0)})

    if screen in COVER:
        name, riders = COVER[screen]
        cover = find(root, name)
        cv = body(cover)
        k = max(1.0, 2*half[0]/DESIGN[0], reach[1]/fit/DESIGN[1])
        cv["Transform"] = {"anchorMin": vec(0.5, 0.5), "anchorMax": vec(0.5, 0.5),
                           "offsetMin": vec(-DESIGN[0]/2, -DESIGN[1]/2), "offsetMax": vec(DESIGN[0]/2, DESIGN[1]/2),
                           "pivot": vec(0.5, 0.5, 0.0), "scale": vec(k, k, 1.0)}
        # what the layout put on the picture stays on it: the cover rect is the design's, so its offsets hold
        for rider in riders:
            actor = next((c for c in rv["Children"] if body(c)["mName"] == rider), None)
            if actor:
                rv["Children"].remove(actor)
                cv.setdefault("Children", []).append(actor)

    for path in DIMMERS.get(screen, []):
        dim = find(root, path)
        margin = (max(0.0, reach[0]/fit/2 - half[0]) + 10, max(0.0, reach[1]/fit/2 - half[1]) + 10)
        body(dim)["Transform"] = {"anchorMax": vec(1.0, 1.0), "offsetMin": vec(-margin[0], -margin[1]),
                                  "offsetMax": vec(margin[0], margin[1])}


def script_ref(name):
    rel = "Scripts/WordFall/" + name
    return {"id": meta_id(os.path.join(ASSETS, rel)), "path": rel}


def prepare(screen, conf, proto, victory):
    root = proto["mActor"]
    rv = body(root)
    components = rv.setdefault("Components", [])
    if any(c["Data"].get("mId") == uid_int(screen + ":view") for c in components):
        return False

    for actor, _ in walk(root):
        v = body(actor)
        if v.get("mDrawingDepth") is not None:
            v["mDrawingDepth"] = v["mDrawingDepth"] + conf["depth"]
    rv["mDrawingDepth"] = float(conf["depth"])
    rv["mInheritDrawingDepthFromParent"] = False
    rv["mSceneLayer"] = {"Type": "o2::SceneLayer", "Value": {"mName": "UI"}}

    rv["Children"] = [c for c in rv.get("Children") or [] if body(c)["mName"] not in conf["remove"]]

    for actor, path in walk(root):
        if actor.get("Type") == "o2::Button" and path.split("/")[-1] in conf["buttons"]:
            add_pressed(screen, actor, path)

    if victory is not None:
        for label, parent_path in MAIN_COUNTERS:
            src = next((a for a, p in walk(victory["mActor"]) if p.split("/")[-1] == label), None)
            parent = find(root, parent_path)
            if not src or not parent:
                continue
            pv = body(parent)
            if any(body(c)["mName"] == label for c in pv.get("Children") or []):
                continue
            label_actor = copy.deepcopy(src)
            lv = body(label_actor)
            lv["Id"] = uid_int(screen + ":" + parent_path + "/" + label)
            lv["mDrawingDepth"] = pv["mDrawingDepth"] + 0.5
            for layer in lv.get("Layers") or []:
                layer["Value"]["mUID"] = uid_int(screen + ":" + parent_path + "/" + label + ":" + layer["Value"]["name"])
            pv.setdefault("Children", []).append(label_actor)

    components.append({"Type": "o2::ScriptableComponent", "Data": {
        "mId": uid_int(screen + ":view"), "mScript": script_ref(conf["script"]), "mInstance": {}}})
    return True


def drop_unused(screen, proto):
    folder = os.path.join(ASSETS, UI, screen + "_Resources", "Sprites")
    text = json.dumps(proto)
    for name in os.listdir(folder) if os.path.isdir(folder) else []:
        if name.endswith(".png") and (UI + "/" + screen + "_Resources/Sprites/" + name) not in text:
            os.remove(os.path.join(folder, name))
            if os.path.exists(os.path.join(folder, name + ".meta")):
                os.remove(os.path.join(folder, name + ".meta"))
    for empty in (folder, os.path.dirname(folder)):
        if os.path.isdir(empty) and not os.listdir(empty):
            os.rmdir(empty)
            if os.path.exists(empty + ".meta"):
                os.remove(empty + ".meta")


def drop_unused_kit(protos):
    text = "".join(json.dumps(p) for p in protos.values())
    folder = os.path.join(ASSETS, KIT, "Sprites")
    for name in os.listdir(folder):
        if name.endswith(".png") and (KIT + "/Sprites/" + name) not in text:
            os.remove(os.path.join(folder, name))
            if os.path.exists(os.path.join(folder, name + ".meta")):
                os.remove(os.path.join(folder, name + ".meta"))


def main():
    kit = kit_json()
    ensure_folder(KIT)
    uid_map, path_map, notes = gather_kit(kit)

    camera, reach = camera_size(), game_reach()
    protos = {s: read_json(os.path.join(ASSETS, UI, s + ".proto")) for s in SCREENS}
    for screen, proto in protos.items():
        safe_area.unwrap_screen(proto, UI + "/" + screen + ".proto")  # the paths below are the layout's own
    for proto in protos.values():
        relink(proto, uid_map, path_map)
    for screen, conf in SCREENS.items():
        victory = protos["VictoryWindow"] if screen == "MainScreen" else None
        fresh = prepare(screen, conf, protos[screen], victory)
        place_in_camera(screen, protos[screen], camera, reach)
        for path in SPREAD.get(screen, []):
            spread(protos[screen]["mActor"], path)
        if screen in DIM and (dim := find(protos[screen]["mActor"], DIM[screen][0])):
            body(dim)["mTransparency"] = DIM[screen][1]
        safe_area.wrap_screen(protos[screen], UI + "/" + screen + ".proto")
        write_json(os.path.join(ASSETS, UI, screen + ".proto"), protos[screen])
        drop_unused(screen, protos[screen])
        print("%s: %s" % (screen, "prepared" if fresh else "relinked"))
    drop_unused_kit(protos)
    safe_area.fix_clips()
    print("kit: %d files moved or merged, %d uids rewritten" % (len(path_map), len(uid_map)))
    for note in notes:
        print("note: " + note)


if __name__ == "__main__":
    sys.exit(main())
