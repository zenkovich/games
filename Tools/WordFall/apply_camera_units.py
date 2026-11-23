#!/usr/bin/env python3
"""Puts WordFall into the units of the UI kit's device of the "Wordfall UI" pipeline (iPhone 16): one world unit is one
pixel of its screen, and the ui camera of WordFall.scn fits that screen (FittedSize 1179x2556).

The game screen (GameScreen.proto) and the level editor (LevelEditorScreen.proto) were laid out in an 868x1813 frame:
their root actors get the scale that fits that frame into the camera's width, so on the device they look as before.
Particles take their size, speed and gravity in world units, not from their parents' scale: every emitter of the game
screen and of the prototypes it instantiates (FxRocket, FxFlyingLetter) is scaled by the same factor, the velocity
stretch per unit of speed by its inverse. build_fx_variants.py writes its emitters at the game screen's scale.

Rerunning is a no-op: the factor applied is the target scale over the scale the game screen already has.
"""
import json
import os
import sys

import safe_area

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ASSETS = os.path.join(ROOT, "Assets")
SCENE = os.path.join(ASSETS, "WordFall.scn")
PROTOS = os.path.join(ASSETS, "WordFall", "Prototypes")
GAME = os.path.join(PROTOS, "GameScreen.proto")
EDITOR = os.path.join(PROTOS, "LevelEditorScreen.proto")
LINKED = [os.path.join(PROTOS, "FxRocket.proto"), os.path.join(PROTOS, "FxFlyingLetter.proto")]
PIPELINE = os.path.join(ASSETS, "Pipelines", "Wordfall UI.pipeline")
CAMERA = "ui camera"
DEVICE = (1179.0, 2556.0)  # iPhone 16, when the kit's cached output is not there

# Emitter fields in world units with their class defaults (an unlinked emitter without the field has the default)
WORLD_FIELDS = {"mInitialSize": 1.0, "mInitialSizeRange": 0.3, "mInitialSpeed": 10.0, "mInitialSpeedRangle": 5.0}


ESCAPED = {}  # files whose text escapes non-ASCII: written back the same way


def read_json(path):
    with open(path, encoding="utf-8") as f:
        raw = f.read()
    ESCAPED[path] = "\\u0" in raw
    return json.loads(raw)


def write_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=ESCAPED.get(path, False))
        f.write("\n")


def body(node):
    return node.get("Value") or node.get("Data")


def device():
    try:
        pipeline = read_json(PIPELINE)
        kit_node = next(n for n in pipeline["nodes"] if n["type"] == "uiKit")
        kit = read_json(os.path.join(ROOT, "Work", "Pipelines", "cache", pipeline["id"], "previews", kit_node["id"] + ".txt"))
        return float(kit["device"]["w"]), float(kit["device"]["h"])
    except (OSError, KeyError, StopIteration, ValueError):
        return DEVICE


def child(node, name):
    return next((c for c in body(node).get("Children") or [] if body(c).get("mName") == name), None)


def frame_of(screen_widget):
    t = body(screen_widget)["Transform"]
    return t["offsetMax"]["x"] - t["offsetMin"]["x"], t["offsetMax"]["y"] - t["offsetMin"]["y"]


def root_scale(proto):
    return body(proto["mActor"]).get("Transform", {}).get("scale", {}).get("x", 1.0)


def set_root_scale(proto, scale):
    t = body(proto["mActor"]).setdefault("Transform", {})
    t["scale"] = {"x": scale, "y": scale, "z": 1.0}


def scale_emitters(node, factor):
    count = 0
    if isinstance(node, dict):
        if node.get("Type") == "o2::ParticlesEmitterComponent":
            d = node["Data"]
            for key, default in WORLD_FIELDS.items():
                if key in d:
                    d[key] = d[key]*factor
                elif "PrototypeLink" not in d:
                    d[key] = default*factor
            if "mSize" in d:
                d["mSize"] = {k: v*factor if k in ("x", "y") else v for k, v in d["mSize"].items()}
            for effect in d.get("mEffects") or []:
                v = effect.get("Value", {})
                if effect["Type"] == "o2::ParticlesGravityEffect" and "mGravity" in v:
                    v["mGravity"] = {k: g*factor for k, g in v["mGravity"].items()}
                elif effect["Type"] == "o2::ParticlesVelocityStretchEffect" and "mStretch" in v:
                    v["mStretch"] = v["mStretch"]/factor
            count += 1
        for value in node.values():
            count += scale_emitters(value, factor)
    elif isinstance(node, list):
        for value in node:
            count += scale_emitters(value, factor)
    return count


def main():
    screen = device()

    scene = read_json(SCENE)
    camera = next(a for a in scene["Actors"] if a["Type"] == "o2::CameraActor" and body(a).get("mName") == CAMERA)
    body(camera)["mFixedOrFittedSize"] = {"x": screen[0], "y": screen[1]}
    write_json(SCENE, scene)

    game = read_json(GAME)
    safe_area.unwrap_game_screen(game)  # the frame is Screen's, which sits in the safe area
    frame = frame_of(child(game["mActor"], "Screen"))
    target = min(screen[0]/frame[0], screen[1]/frame[1])
    factor = target/root_scale(game)
    emitters = 0
    if abs(factor - 1.0) > 1e-6:
        emitters += scale_emitters(game, factor)
        linked = [read_json(p) for p in LINKED]
        for path, proto in zip(LINKED, linked):
            emitters += scale_emitters(proto, factor)
            write_json(path, proto)
        set_root_scale(game, target)
    safe_area.wrap_game_screen(game, "WordFall/Prototypes/GameScreen.proto", frame)
    write_json(GAME, game)

    editor = read_json(EDITOR)
    set_root_scale(editor, target)
    safe_area.unwrap_game_screen(editor)
    safe_area.wrap_game_screen(editor, "WordFall/Prototypes/LevelEditorScreen.proto",
                               safe_area.GAME_SCREENS["WordFall/Prototypes/LevelEditorScreen.proto"])
    write_json(EDITOR, editor)

    print("camera %gx%g, game frame %gx%g scaled by %.6f, %d emitters rescaled by %.6f" %
          (screen[0], screen[1], frame[0], frame[1], target, emitters, factor))


if __name__ == "__main__":
    sys.exit(main())
