#!/usr/bin/env python3
"""Tiny software renderer to eyeball converted models: orthographic view,
flat-shaded triangles, palette/vertex-UV colors. Usage:
  render_preview.py glb <model.glb> <out.png> [anim_index] [time]
  render_preview.py obj <model.obj> <texture.png> <out.png>
"""
import math, struct, sys, zlib
from glbtool import (load_glb, read_accessor, NCOMP, write_png, material_color,
                     compute_smooth_normals)


def read_png_rgba(path):
    data = open(path, "rb").read()
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    pos, w, h, idat = 8, 0, 0, b""
    bitdepth = colortype = 0
    while pos < len(data):
        ln = struct.unpack(">I", data[pos:pos + 4])[0]
        tag = data[pos + 4:pos + 8]
        payload = data[pos + 8:pos + 8 + ln]
        if tag == b"IHDR":
            w, h, bitdepth, colortype = struct.unpack(">IIBB", payload[:10])
        elif tag == b"IDAT":
            idat += payload
        pos += 12 + ln
    raw = zlib.decompress(idat)
    ch = {0: 1, 2: 3, 4: 2, 6: 4}[colortype]
    stride = w * ch
    img = bytearray(w * h * 4)
    prev = bytearray(stride)
    at = 0
    for y in range(h):
        filt = raw[at]; at += 1
        line = bytearray(raw[at:at + stride]); at += stride
        for x in range(stride):
            a = line[x - ch] if x >= ch else 0
            b = prev[x]
            c = prev[x - ch] if x >= ch else 0
            if filt == 1: line[x] = (line[x] + a) & 255
            elif filt == 2: line[x] = (line[x] + b) & 255
            elif filt == 3: line[x] = (line[x] + (a + b) // 2) & 255
            elif filt == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pred = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                line[x] = (line[x] + pred) & 255
        prev = line
        for x in range(w):
            px = line[x * ch:(x + 1) * ch]
            if ch == 1: rgba = (px[0], px[0], px[0], 255)
            elif ch == 2: rgba = (px[0], px[0], px[0], px[1])
            elif ch == 3: rgba = (px[0], px[1], px[2], 255)
            else: rgba = tuple(px)
            img[(y * w + x) * 4:(y * w + x + 1) * 4] = bytes(rgba)
    return w, h, img


def sample(texw, texh, tex, u, v):
    x = min(texw - 1, max(0, int(u * texw)))
    y = min(texh - 1, max(0, int(v * texh)))
    px = tex[(y * texw + x) * 4:(y * texw + x) * 4 + 3]
    return tuple(px)


def mat_mul(a, b):
    return [[sum(a[r][k] * b[k][c] for k in range(4)) for c in range(4)] for r in range(4)]


def trs_matrix(t, q, s):
    x, y, z, w = q
    rot = [
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ]
    m = [[rot[r][c] * s[c] for c in range(3)] + [t[r]] for r in range(3)]
    return m + [[0, 0, 0, 1]]


def render_tris(tris, out_png, size=420):
    # tris: list of (p0,p1,p2,color) in model space; orthographic front view X right, Y up
    xs = [p[i][0] for p in tris for i in range(3)]
    ys = [p[i][1] for p in tris for i in range(3)]
    zs = [p[i][2] for p in tris for i in range(3)]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    span = max(max(xs) - min(xs), max(ys) - min(ys)) * 0.55 or 1
    scale = size * 0.45 / span

    img = [[(24, 24, 32) for _ in range(size)] for _ in range(size)]
    order = sorted(range(len(tris)), key=lambda i: min(tris[i][j][2] for j in range(3)))
    light = (0.4, 0.5, 0.77)
    for ti in order:
        p0, p1, p2, color = tris[ti]
        pts = [((p[0] - cx) * scale + size / 2, size / 2 - (p[1] - cy) * scale) for p in (p0, p1, p2)]
        ux = [p1[i] - p0[i] for i in range(3)]
        vx = [p2[i] - p0[i] for i in range(3)]
        n = [ux[1] * vx[2] - ux[2] * vx[1], ux[2] * vx[0] - ux[0] * vx[2], ux[0] * vx[1] - ux[1] * vx[0]]
        ln = math.sqrt(sum(c * c for c in n)) or 1
        lam = 0.45 + 0.55 * max(0, sum(n[i] / ln * light[i] for i in range(3)))
        col = tuple(min(255, int(c * lam)) for c in color)
        minx = max(0, int(min(p[0] for p in pts)))
        maxx = min(size - 1, int(max(p[0] for p in pts)) + 1)
        miny = max(0, int(min(p[1] for p in pts)))
        maxy = min(size - 1, int(max(p[1] for p in pts)) + 1)
        (x0, y0), (x1, y1), (x2, y2) = pts
        den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
        if abs(den) < 1e-9:
            continue
        for py in range(miny, maxy + 1):
            for px in range(minx, maxx + 1):
                w0 = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) / den
                w1 = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) / den
                w2 = 1 - w0 - w1
                if w0 >= -0.001 and w1 >= -0.001 and w2 >= -0.001:
                    img[py][px] = col
    rows = [[c for px in row for c in (*px, 255)] for row in img]
    write_png(out_png, size, size, rows)
    print(f"rendered {out_png}")


def glb_preview(path, out_png, anim_index=-1, time_sec=0.0):
    gltf, blob = load_glb(path)
    prim = gltf["meshes"][0]["primitives"][0]
    pos = read_accessor(gltf, blob, prim["attributes"]["POSITION"])
    uv = read_accessor(gltf, blob, prim["attributes"]["TEXCOORD_0"]) \
        if "TEXCOORD_0" in prim["attributes"] else None
    idx = read_accessor(gltf, blob, prim["indices"])

    texw = texh = 0
    tex = None
    if gltf.get("images"):
        img = gltf["images"][0]
        bv = gltf["bufferViews"][img["bufferView"]]
        png = blob[bv.get("byteOffset", 0):bv.get("byteOffset", 0) + bv["byteLength"]]
        open("/tmp/_preview_tex.png", "wb").write(png)
        texw, texh, tex = read_png_rgba("/tmp/_preview_tex.png")

    if gltf.get("skins") and anim_index >= -1:
        joints_attr = read_accessor(gltf, blob, prim["attributes"]["JOINTS_0"])
        weights = read_accessor(gltf, blob, prim["attributes"]["WEIGHTS_0"])
        skin = gltf["skins"][0]
        ibm = read_accessor(gltf, blob, skin["inverseBindMatrices"])
        nodes = gltf["nodes"]

        locals_ = []
        for nd in nodes:
            locals_.append({
                "t": list(nd.get("translation", [0, 0, 0])),
                "q": list(nd.get("rotation", [0, 0, 0, 1])),
                "s": list(nd.get("scale", [1, 1, 1])),
            })
        if anim_index >= 0:
            anim = gltf["animations"][anim_index]
            for chan in anim["channels"]:
                smp = anim["samplers"][chan["sampler"]]
                times = read_accessor(gltf, blob, smp["input"])
                vals = read_accessor(gltf, blob, smp["output"])
                t = min(max(time_sec, times[0]), times[-1])
                k = max(0, min(len(times) - 2, next((i for i in range(len(times) - 1)
                                                     if times[i + 1] >= t), len(times) - 2)))
                f = 0 if times[k + 1] == times[k] else (t - times[k]) / (times[k + 1] - times[k])
                a, b = vals[k], vals[k + 1]
                mix = tuple(a[i] + (b[i] - a[i]) * f for i in range(len(a)))
                path_ = chan["target"]["path"]
                node = chan["target"]["node"]
                if path_ == "translation": locals_[node]["t"] = list(mix)
                elif path_ == "scale": locals_[node]["s"] = list(mix)
                elif path_ == "rotation":
                    ln = math.sqrt(sum(c * c for c in mix)) or 1
                    locals_[node]["q"] = [c / ln for c in mix]

        world = {}
        def walk(i, parent):
            m = mat_mul(parent, trs_matrix(locals_[i]["t"], locals_[i]["q"], locals_[i]["s"]))
            world[i] = m
            for ch in nodes[i].get("children", []):
                walk(ch, m)
        ident = [[1 if r == c else 0 for c in range(4)] for r in range(4)]
        for root in gltf["scenes"][gltf.get("scene", 0)]["nodes"]:
            walk(root, ident)

        palette = []
        for j, node_idx in enumerate(skin["joints"]):
            m = ibm[j]
            ibm_m = [[m[c * 4 + r] for c in range(4)] for r in range(4)]  # column major
            palette.append(mat_mul(world[node_idx], ibm_m))

        skinned = []
        for vi, p in enumerate(pos):
            acc = [0.0, 0.0, 0.0]
            for k in range(4):
                w = weights[vi][k]
                if w <= 0:
                    continue
                m = palette[int(joints_attr[vi][k])]
                for r in range(3):
                    acc[r] += w * (m[r][0] * p[0] + m[r][1] * p[1] + m[r][2] * p[2] + m[r][3])
            skinned.append(tuple(acc))
        pos = skinned

    tris = []
    for i in range(0, len(idx), 3):
        a, b, c = idx[i], idx[i + 1], idx[i + 2]
        if tex is not None and uv is not None:
            u, v = uv[a]
            color = sample(texw, texh, tex, u, v)
        else:
            color = (200, 200, 200)
        tris.append((pos[a], pos[b], pos[c], color))
    render_tris(tris, out_png)


def obj_preview(path, tex_path, out_png):
    vs, vts, tris_idx = [], [], []
    for line in open(path):
        parts = line.split()
        if not parts:
            continue
        if parts[0] == "v": vs.append(tuple(float(x) for x in parts[1:4]))
        elif parts[0] == "vt": vts.append(tuple(float(x) for x in parts[1:3]))
        elif parts[0] == "f":
            face = [tuple(int(t) - 1 for t in p.split("/")[:2]) for p in parts[1:4]]
            tris_idx.append(face)
    texw, texh, tex = read_png_rgba(tex_path)
    tris = []
    for face in tris_idx:
        (a, at), (b, bt), (c, ct) = face
        u, v = vts[at]
        color = sample(texw, texh, tex, u, v)
        # obj is Z-up after conversion: show X right, Z up -> map (x, z, -y)
        pa, pb, pc = (vs[i] for i in (a, b, c))
        remap = lambda p: (p[0], p[2], -p[1])
        tris.append((remap(pa), remap(pb), remap(pc), color))
    render_tris(tris, out_png)


if __name__ == "__main__":
    if sys.argv[1] == "glb":
        anim = int(sys.argv[4]) if len(sys.argv) > 4 else -1
        t = float(sys.argv[5]) if len(sys.argv) > 5 else 0.0
        glb_preview(sys.argv[2], sys.argv[3], anim, t)
    else:
        obj_preview(sys.argv[2], sys.argv[3], sys.argv[4])
