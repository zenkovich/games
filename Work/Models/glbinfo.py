#!/usr/bin/env python3
"""Inspect a GLB: meshes/primitives, skins, animations, materials, textures."""
import json, struct, sys

def load(path):
    with open(path, "rb") as f:
        data = f.read()
    magic, ver, length = struct.unpack_from("<III", data, 0)
    assert magic == 0x46546C67, "not a GLB"
    offset, gltf, binchunk = 12, None, None
    while offset < length:
        clen, ctype = struct.unpack_from("<II", data, offset)
        chunk = data[offset + 8: offset + 8 + clen]
        if ctype == 0x4E4F534A:
            gltf = json.loads(chunk)
        elif ctype == 0x004E4942:
            binchunk = chunk
        offset += 8 + clen
    return gltf, binchunk

def describe(path):
    g, _ = load(path)
    print(f"== {path}")
    for i, m in enumerate(g.get("meshes", [])):
        prims = m.get("primitives", [])
        print(f"mesh[{i}] '{m.get('name','')}' primitives={len(prims)}")
        for j, p in enumerate(prims):
            attrs = ",".join(sorted(p.get("attributes", {}).keys()))
            print(f"  prim[{j}] attrs=[{attrs}] material={p.get('material')} mode={p.get('mode', 4)}")
    for i, s in enumerate(g.get("skins", [])):
        print(f"skin[{i}] joints={len(s.get('joints', []))}")
    for i, a in enumerate(g.get("animations", [])):
        paths = {}
        for ch in a.get("channels", []):
            paths[ch["target"]["path"]] = paths.get(ch["target"]["path"], 0) + 1
        # duration from samplers input accessor max
        dur = 0.0
        for smp in a.get("samplers", []):
            acc = g["accessors"][smp["input"]]
            dur = max(dur, (acc.get("max") or [0])[0])
        print(f"anim[{i}] '{a.get('name','')}' channels={len(a.get('channels', []))} paths={paths} dur={dur:.2f}")
    for i, mat in enumerate(g.get("materials", [])):
        pbr = mat.get("pbrMetallicRoughness", {})
        tex = "tex" if "baseColorTexture" in pbr else f"color={pbr.get('baseColorFactor')}"
        print(f"material[{i}] '{mat.get('name','')}' {tex}")
    for i, img in enumerate(g.get("images", [])):
        print(f"image[{i}] mime={img.get('mimeType')} name={img.get('name','')}")
    print(f"nodes={len(g.get('nodes', []))} scenes={len(g.get('scenes', []))}")

if __name__ == "__main__":
    for p in sys.argv[1:]:
        describe(p)
