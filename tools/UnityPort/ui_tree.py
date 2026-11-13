"""Prints a captured UI Toolkit tree: python3 ui_tree.py <capture stem|file> [element name] [max depth]"""
import glob
import json
import os
import sys

from port_common import CAPTURE


def find(e, name):
    if e["n"] == name:
        return e
    for c in e.get("ch", []):
        r = find(c, name)
        if r:
            return r
    return None


def show(e, depth, maxd, all_=False):
    vis = e["s"].get("display") != "None" and not e.get("hidden")
    if not vis and not all_:
        return
    s = e["s"]
    info = []
    bg = s.get("backgroundImage")
    if bg:
        info.append("bg=" + (bg.get("sprite") or bg.get("tex") or bg.get("rt") or "?"))
    if s.get("backgroundColor", [0, 0, 0, 0])[3] > 0:
        info.append("bgc=%s" % [round(x, 2) for x in s["backgroundColor"]])
    if "text" in e:
        info.append("text=%r sz=%s %s" % (e["text"][:40], s.get("fontSize"), s.get("unityTextAlign")))
    if s.get("opacity", 1) < 1:
        info.append("op=%s" % s["opacity"])
    if "c" in e:
        info.append("cls=" + ",".join(e["c"][:4]))
    print("  " * depth + "%s<%s>%s %s %s" % (e["n"], e["t"], "" if vis else "(none)", [round(v) for v in e["wb"]], " ".join(info)))
    if depth < maxd:
        for c in e.get("ch", []):
            show(c, depth + 1, maxd, all_)


if __name__ == "__main__":
    stem = sys.argv[1]
    f = stem if os.path.exists(stem) else glob.glob(os.path.join(CAPTURE, "*_" + stem + ".ui.json"))[0]
    docs = json.load(open(f))
    name = sys.argv[2] if len(sys.argv) > 2 else None
    maxd = int(sys.argv[3]) if len(sys.argv) > 3 else 99
    for doc in docs:
        root = find(doc["root"], name) if name else doc["root"]
        if root:
            show(root, 0, maxd, "--all" in sys.argv)
