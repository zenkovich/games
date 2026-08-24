#!/usr/bin/env python3
"""Offline converters for downloaded GLB models so the o2 engine can eat them.

repack: multi-primitive / multi-skin animated GLB (Quaternius characters) ->
        single mesh+primitive+skin GLB with material colors baked into a
        one-row palette texture (o2's GLB parser reads the first primitive
        and the first skin only, and has no material support).
toobj:  static GLB -> Wavefront OBJ per texture group (o2's Mesh3DAsset path),
        color materials baked into the same one-row palette texture.
        Positions are rebased from glTF Y-up to the o2 scene's Z-up.

Only repacks what the source asset already contains - no geometry is invented.
"""
import json, math, struct, sys, zlib

FLOAT, UBYTE, USHORT, UINT = 5126, 5121, 5123, 5125
CTYPE = {FLOAT: ("f", 4), UBYTE: ("B", 1), USHORT: ("H", 2), UINT: ("I", 4)}
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def load_glb(path):
    data = open(path, "rb").read()
    magic, _, length = struct.unpack_from("<III", data, 0)
    assert magic == 0x46546C67, "not a GLB"
    offset, gltf, blob = 12, None, b""
    while offset < length:
        clen, ctype = struct.unpack_from("<II", data, offset)
        chunk = data[offset + 8: offset + 8 + clen]
        if ctype == 0x4E4F534A:
            gltf = json.loads(chunk)
        elif ctype == 0x004E4942:
            blob = chunk
        offset += 8 + clen
    return gltf, blob


def save_glb(path, gltf, blob):
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    blob += b"\0" * (-len(blob) % 4)
    total = 12 + 8 + len(js) + 8 + len(blob)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
        f.write(struct.pack("<II", len(blob), 0x004E4942) + blob)


def read_accessor(gltf, blob, index):
    acc = gltf["accessors"][index]
    n = NCOMP[acc["type"]]
    fmt, csize = CTYPE[acc["componentType"]]
    count = acc["count"]
    out = []
    if "bufferView" not in acc:
        return [(0,) * n] * count if n > 1 else [0] * count
    bv = gltf["bufferViews"][acc["bufferView"]]
    base = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    stride = bv.get("byteStride") or n * csize
    for i in range(count):
        vals = struct.unpack_from("<" + fmt * n, blob, base + i * stride)
        out.append(vals if n > 1 else vals[0])
    return out


def lin_to_srgb(c):
    c = max(0.0, min(1.0, c))
    s = 12.92 * c if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055
    return round(s * 255)


def write_png(path, width, height, rgba_rows):
    raw = b"".join(b"\0" + bytes(row) for row in rgba_rows)

    def chunk(tag, payload):
        c = struct.pack(">I", len(payload)) + tag + payload
        return c + struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF)

    hdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", hdr)
    png += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    open(path, "wb").write(png)


PALETTE_CELLS = 16
PALETTE_CELL_PX = 16


def build_palette(colors):
    """One-row palette strip: u picks the cell, v=0.5 is immune to V-flip."""
    assert len(colors) <= PALETTE_CELLS, "palette overflow"
    width = PALETTE_CELLS * PALETTE_CELL_PX
    row = []
    for cell in range(PALETTE_CELLS):
        rgba = colors[cell] if cell < len(colors) else (1, 1, 1, 1)
        px = (lin_to_srgb(rgba[0]), lin_to_srgb(rgba[1]), lin_to_srgb(rgba[2]), 255)
        row.extend(px * PALETTE_CELL_PX)
    rows = [row] * PALETTE_CELL_PX
    return width, PALETTE_CELL_PX, rows


def palette_uv(cell):
    return ((cell + 0.5) / PALETTE_CELLS, 0.5)


def material_color(gltf, mat_index):
    if mat_index is None:
        return (1, 1, 1, 1)
    mat = gltf["materials"][mat_index]
    return tuple(mat.get("pbrMetallicRoughness", {}).get("baseColorFactor", [1, 1, 1, 1]))


def material_texture(gltf, mat_index):
    if mat_index is None:
        return None
    pbr = gltf["materials"][mat_index].get("pbrMetallicRoughness", {})
    if "baseColorTexture" not in pbr:
        return None
    tex = gltf["textures"][pbr["baseColorTexture"]["index"]]
    return tex.get("source")


def node_world_matrices(gltf):
    def local(nd):
        if "matrix" in nd:
            m = nd["matrix"]  # column-major
            return [[m[c * 4 + r] for c in range(4)] for r in range(4)]
        t = nd.get("translation", [0, 0, 0])
        q = nd.get("rotation", [0, 0, 0, 1])
        s = nd.get("scale", [1, 1, 1])
        x, y, z, w = q
        rot = [
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
        ]
        m = [[rot[r][c] * s[c] for c in range(3)] + [t[r]] for r in range(3)]
        return m + [[0, 0, 0, 1]]

    def mul(a, b):
        return [[sum(a[r][k] * b[k][c] for k in range(4)) for c in range(4)] for r in range(4)]

    worlds = {}

    def walk(idx, parent):
        m = mul(parent, local(gltf["nodes"][idx]))
        worlds[idx] = m
        for ch in gltf["nodes"][idx].get("children", []):
            walk(ch, m)

    ident = [[1 if r == c else 0 for c in range(4)] for r in range(4)]
    for root in gltf["scenes"][gltf.get("scene", 0)]["nodes"]:
        walk(root, ident)
    return worlds


def transform_point(m, p):
    return tuple(m[r][0] * p[0] + m[r][1] * p[1] + m[r][2] * p[2] + m[r][3] for r in range(3))


def transform_dir(m, d):
    v = tuple(m[r][0] * d[0] + m[r][1] * d[1] + m[r][2] * d[2] for r in range(3))
    ln = math.sqrt(sum(c * c for c in v)) or 1.0
    return tuple(c / ln for c in v)


def compute_smooth_normals(positions, indices):
    normals = [[0.0, 0.0, 0.0] for _ in positions]
    for i in range(0, len(indices), 3):
        a, b, c = indices[i], indices[i + 1], indices[i + 2]
        pa, pb, pc = positions[a], positions[b], positions[c]
        u = [pb[j] - pa[j] for j in range(3)]
        v = [pc[j] - pa[j] for j in range(3)]
        n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
        for idx in (a, b, c):
            for j in range(3):
                normals[idx][j] += n[j]
    out = []
    for n in normals:
        ln = math.sqrt(sum(c * c for c in n)) or 1.0
        out.append(tuple(c / ln for c in n))
    return out


def gather_skinned(gltf, blob):
    """All skinned primitives with joints remapped to the union skin."""
    union_joints, union_ibm = [], []
    joint_maps = []  # per skin: local joint index -> union index
    for skin in gltf.get("skins", []):
        ibm = read_accessor(gltf, blob, skin["inverseBindMatrices"])
        jmap = []
        for local_idx, node in enumerate(skin["joints"]):
            if node in union_joints:
                jmap.append(union_joints.index(node))
            else:
                union_joints.append(node)
                union_ibm.append(ibm[local_idx])
                jmap.append(len(union_joints) - 1)
        joint_maps.append(jmap)

    prims = []
    for node in gltf["nodes"]:
        if "mesh" not in node or "skin" not in node:
            continue
        jmap = joint_maps[node["skin"]]
        for prim in gltf["meshes"][node["mesh"]]["primitives"]:
            attrs = prim["attributes"]
            entry = {
                "pos": read_accessor(gltf, blob, attrs["POSITION"]),
                "nrm": read_accessor(gltf, blob, attrs["NORMAL"]) if "NORMAL" in attrs else None,
                "joints": [tuple(jmap[j] for j in four)
                           for four in read_accessor(gltf, blob, attrs["JOINTS_0"])],
                "weights": read_accessor(gltf, blob, attrs["WEIGHTS_0"]),
                "indices": read_accessor(gltf, blob, prim["indices"]),
                "material": prim.get("material"),
            }
            prims.append(entry)
    return prims, union_joints, union_ibm


def repack(src, dst, palette_png):
    gltf, blob = load_glb(src)
    prims, joints, ibm = gather_skinned(gltf, blob)
    assert prims, "no skinned primitives"

    colors, cell_of_mat = [], {}
    positions, normals, uvs, joints4, weights4, indices = [], [], [], [], [], []
    for p in prims:
        mat = p["material"]
        if mat not in cell_of_mat:
            cell_of_mat[mat] = len(colors)
            colors.append(material_color(gltf, mat))
        uv = palette_uv(cell_of_mat[mat])
        base = len(positions)
        positions.extend(p["pos"])
        nrm = p["nrm"] or compute_smooth_normals(p["pos"], p["indices"])
        normals.extend(nrm)
        uvs.extend([uv] * len(p["pos"]))
        joints4.extend(p["joints"])
        weights4.extend(p["weights"])
        indices.extend(base + i for i in p["indices"])

    width, height, rows = build_palette(colors)
    write_png(palette_png, width, height, rows)
    png_bytes = open(palette_png, "rb").read()

    # new packed buffer: keep animation/IBM accessors by copying them through
    out_blob = bytearray()
    views, accessors = [], []

    def push(data, target=None):
        offset = len(out_blob)
        out_blob.extend(data)
        out_blob.extend(b"\0" * (-len(out_blob) % 4))
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(data),
                      **({"target": target} if target else {})})
        return len(views) - 1

    def add_accessor(view, ctype, atype, count, minmax=None):
        acc = {"bufferView": view, "componentType": ctype, "type": atype, "count": count}
        if minmax:
            acc["min"], acc["max"] = minmax
        accessors.append(acc)
        return len(accessors) - 1

    def pack_vec(data, n):
        return struct.pack("<" + "f" * n * len(data), *[c for v in data for c in v])

    pos_min = [min(p[i] for p in positions) for i in range(3)]
    pos_max = [max(p[i] for p in positions) for i in range(3)]
    a_pos = add_accessor(push(pack_vec(positions, 3), 34962), FLOAT, "VEC3", len(positions),
                         (pos_min, pos_max))
    a_nrm = add_accessor(push(pack_vec(normals, 3), 34962), FLOAT, "VEC3", len(normals))
    a_uv = add_accessor(push(pack_vec(uvs, 2), 34962), FLOAT, "VEC2", len(uvs))
    a_j = add_accessor(push(struct.pack("<" + "H" * 4 * len(joints4),
                                        *[j for four in joints4 for j in four]), 34962),
                       USHORT, "VEC4", len(joints4))
    a_w = add_accessor(push(pack_vec(weights4, 4), 34962), FLOAT, "VEC4", len(weights4))
    a_idx = add_accessor(push(struct.pack("<" + "I" * len(indices), *indices), 34963),
                         UINT, "SCALAR", len(indices))
    a_ibm = add_accessor(push(struct.pack("<" + "f" * 16 * len(ibm),
                                          *[c for m in ibm for c in m])),
                         FLOAT, "MAT4", len(ibm))

    # animations: copy every referenced accessor into the new buffer
    new_animations = []
    for anim in gltf.get("animations", []):
        samplers = []
        for smp in anim["samplers"]:
            def copy_acc(idx):
                acc = gltf["accessors"][idx]
                data = read_accessor(gltf, blob, idx)
                n = NCOMP[acc["type"]]
                packed = pack_vec(data, n) if n > 1 else struct.pack("<" + "f" * len(data), *data)
                mm = (acc.get("min"), acc.get("max")) if acc.get("min") is not None else None
                return add_accessor(push(packed), FLOAT, acc["type"], acc["count"], mm)
            samplers.append({"input": copy_acc(smp["input"]),
                             "output": copy_acc(smp["output"]),
                             "interpolation": smp.get("interpolation", "LINEAR")})
        new_animations.append({"name": anim.get("name", ""), "samplers": samplers,
                               "channels": anim["channels"]})

    png_view = push(png_bytes)

    # nodes: strip mesh/skin refs, attach the merged mesh to the first ex-mesh node
    nodes = json.loads(json.dumps(gltf["nodes"]))
    mesh_node = next(i for i, nd in enumerate(nodes) if "mesh" in nd and "skin" in nd)
    for nd in nodes:
        nd.pop("mesh", None)
        nd.pop("skin", None)
    nodes[mesh_node]["mesh"] = 0
    nodes[mesh_node]["skin"] = 0

    out = {
        "asset": {"version": "2.0", "generator": "glbtool repack"},
        "scene": gltf.get("scene", 0),
        "scenes": gltf["scenes"],
        "nodes": nodes,
        "meshes": [{"name": "merged", "primitives": [{
            "attributes": {"POSITION": a_pos, "NORMAL": a_nrm, "TEXCOORD_0": a_uv,
                           "JOINTS_0": a_j, "WEIGHTS_0": a_w},
            "indices": a_idx, "material": 0, "mode": 4}]}],
        "skins": [{"joints": joints, "inverseBindMatrices": a_ibm}],
        "animations": new_animations,
        "materials": [{"name": "palette", "pbrMetallicRoughness":
                       {"baseColorTexture": {"index": 0}}}],
        "textures": [{"source": 0}],
        "images": [{"bufferView": png_view, "mimeType": "image/png", "name": "palette"}],
        "accessors": accessors,
        "bufferViews": views,
        "buffers": [{"byteLength": len(out_blob)}],
    }
    save_glb(dst, out, bytes(out_blob))
    print(f"repacked {src} -> {dst}: {len(positions)} verts, {len(indices)//3} tris, "
          f"{len(joints)} joints, {len(new_animations)} anims, {len(colors)} colors")


def yup_to_zup(p):
    return (p[0], -p[2], p[1])


def toobj(src, out_base, palette_png):
    """Static GLB -> OBJ files: one per textured material image, plus one for all
    color materials together (palette-baked). Returns list of written files."""
    gltf, blob = load_glb(src)
    worlds = node_world_matrices(gltf)

    groups = {}  # key: ("tex", image_index) or ("palette",) -> geometry
    colors, cell_of_mat = [], {}

    for node_idx, node in enumerate(gltf["nodes"]):
        if "mesh" not in node or "skin" in node:
            continue
        world = worlds.get(node_idx)
        if world is None:
            continue
        for prim in gltf["meshes"][node["mesh"]]["primitives"]:
            attrs = prim["attributes"]
            pos = [yup_to_zup(transform_point(world, p))
                   for p in read_accessor(gltf, blob, attrs["POSITION"])]
            idx = read_accessor(gltf, blob, prim["indices"])
            if "NORMAL" in attrs:
                nrm = [yup_to_zup(transform_dir(world, n))
                       for n in read_accessor(gltf, blob, attrs["NORMAL"])]
            else:
                nrm = compute_smooth_normals(pos, idx)
            det3 = (world[0][0] * (world[1][1] * world[2][2] - world[1][2] * world[2][1])
                    - world[0][1] * (world[1][0] * world[2][2] - world[1][2] * world[2][0])
                    + world[0][2] * (world[1][0] * world[2][1] - world[1][1] * world[2][0]))
            if det3 < 0:
                idx = [idx[i + off] for i in range(0, len(idx), 3) for off in (0, 2, 1)]

            image = material_texture(gltf, prim.get("material"))
            if image is not None:
                key = ("tex", image)
                uv = read_accessor(gltf, blob, attrs["TEXCOORD_0"])
            else:
                key = ("palette",)
                mat = prim.get("material")
                if mat not in cell_of_mat:
                    cell_of_mat[mat] = len(colors)
                    colors.append(material_color(gltf, mat))
                uv = [palette_uv(cell_of_mat[mat])] * len(pos)

            g = groups.setdefault(key, {"pos": [], "nrm": [], "uv": [], "idx": []})
            base = len(g["pos"])
            g["pos"].extend(pos)
            g["nrm"].extend(nrm)
            g["uv"].extend(uv)
            g["idx"].extend(base + i for i in idx)

    written = []
    if colors:
        width, height, rows = build_palette(colors)
        write_png(palette_png, width, height, rows)

    for key, g in groups.items():
        if key[0] == "tex":
            img = gltf["images"][key[1]]
            bv = gltf["bufferViews"][img["bufferView"]]
            png = blob[bv.get("byteOffset", 0): bv.get("byteOffset", 0) + bv["byteLength"]]
            tex_path = f"{out_base}_tex{key[1]}.png"
            open(tex_path, "wb").write(png)
            obj_path = f"{out_base}_tex{key[1]}.obj"
        else:
            tex_path = palette_png
            obj_path = f"{out_base}.obj"
        with open(obj_path, "w") as f:
            f.write(f"# glbtool toobj from {src}, texture: {tex_path}\n")
            for p in g["pos"]:
                f.write(f"v {p[0]:.6f} {p[1]:.6f} {p[2]:.6f}\n")
            for uv in g["uv"]:
                f.write(f"vt {uv[0]:.6f} {uv[1]:.6f}\n")
            for n in g["nrm"]:
                f.write(f"vn {n[0]:.6f} {n[1]:.6f} {n[2]:.6f}\n")
            for i in range(0, len(g["idx"]), 3):
                a, b, c = g["idx"][i] + 1, g["idx"][i + 1] + 1, g["idx"][i + 2] + 1
                f.write(f"f {a}/{a}/{a} {b}/{b}/{b} {c}/{c}/{c}\n")
        print(f"wrote {obj_path}: {len(g['pos'])} verts, {len(g['idx'])//3} tris (texture {tex_path})")
        written.append(obj_path)
    return written


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "repack":
        repack(sys.argv[2], sys.argv[3], sys.argv[4])
    elif cmd == "toobj":
        toobj(sys.argv[2], sys.argv[3], sys.argv[4])
