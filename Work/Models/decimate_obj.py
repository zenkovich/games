#!/usr/bin/env python3
"""Vertex-clustering decimation for palette-textured OBJs: snaps vertices to a uniform
grid, merges clusters, drops degenerate faces. Good enough for organic props."""
import math, sys


def decimate(src, dst, cell):
    vs, vts, vns, faces = [], [], [], []
    for line in open(src):
        parts = line.split()
        if not parts:
            continue
        if parts[0] == "v":
            vs.append(tuple(float(x) for x in parts[1:4]))
        elif parts[0] == "vt":
            vts.append(tuple(float(x) for x in parts[1:3]))
        elif parts[0] == "vn":
            vns.append(tuple(float(x) for x in parts[1:4]))
        elif parts[0] == "f":
            faces.append([tuple(int(i) - 1 for i in p.split("/")) for p in parts[1:4]])

    cluster_of = {}
    clusters = []  # [sum_pos, sum_normal, count, uv]
    vertex_cluster = []
    for vi, v in enumerate(vs):
        key = (round(v[0]/cell), round(v[1]/cell), round(v[2]/cell))
        ci = cluster_of.get(key)
        if ci is None:
            ci = len(clusters)
            cluster_of[key] = ci
            clusters.append([[0.0, 0.0, 0.0], [0.0, 0.0, 0.0], 0, None])
        c = clusters[ci]
        for i in range(3):
            c[0][i] += v[i]
        c[2] += 1
        vertex_cluster.append(ci)

    for face in faces:
        for (a, at, an) in face:
            c = clusters[vertex_cluster[a]]
            n = vns[an]
            for i in range(3):
                c[1][i] += n[i]
            if c[3] is None:
                c[3] = vts[at]

    out_faces = []
    seen = set()
    for face in faces:
        ca, cb, cc = (vertex_cluster[f[0]] for f in face)
        if ca == cb or cb == cc or ca == cc:
            continue
        key = tuple(sorted((ca, cb, cc)))
        if key in seen:
            continue
        seen.add(key)
        out_faces.append((ca, cb, cc))

    with open(dst, "w") as f:
        f.write(f"# decimated from {src}, cell {cell}\n")
        for c in clusters:
            n = c[2]
            f.write(f"v {c[0][0]/n:.6f} {c[0][1]/n:.6f} {c[0][2]/n:.6f}\n")
        for c in clusters:
            uv = c[3] or (0.03125, 0.5)
            f.write(f"vt {uv[0]:.6f} {uv[1]:.6f}\n")
        for c in clusters:
            ln = math.sqrt(sum(x*x for x in c[1])) or 1.0
            f.write(f"vn {c[1][0]/ln:.6f} {c[1][1]/ln:.6f} {c[1][2]/ln:.6f}\n")
        for (a, b, cc) in out_faces:
            f.write(f"f {a+1}/{a+1}/{a+1} {b+1}/{b+1}/{b+1} {cc+1}/{cc+1}/{cc+1}\n")

    print(f"{src}: {len(vs)} verts / {len(faces)} tris -> {len(clusters)} verts / {len(out_faces)} tris")


if __name__ == "__main__":
    decimate(sys.argv[1], sys.argv[2], float(sys.argv[3]))
