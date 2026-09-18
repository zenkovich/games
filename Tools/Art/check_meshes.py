#!/usr/bin/env python3
"""Reject open boundaries in the exported character and solid farm assets."""
import collections
import json
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parents[2]


def glb(path):
    raw = path.read_bytes()
    length = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20 + length])
    binary = raw[28 + length:]
    primitive = doc['meshes'][0]['primitives'][0]

    def read(index):
        accessor = doc['accessors'][index]
        view = doc['bufferViews'][accessor['bufferView']]
        width = {'SCALAR': 1, 'VEC3': 3}[accessor['type']]
        kind = {5126: 'f', 5123: 'H', 5125: 'I'}[accessor['componentType']]
        offset = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
        stride = view.get('byteStride', struct.calcsize('<' + kind * width))
        return [struct.unpack_from('<' + kind * width, binary, offset + i * stride)
                for i in range(accessor['count'])]

    positions = read(primitive['attributes']['POSITION'])
    indices = [i[0] for i in read(primitive['indices'])]
    return positions, [indices[i:i + 3] for i in range(0, len(indices), 3)]


def obj(path):
    positions, faces = [], []
    for line in path.read_text().splitlines():
        values = line.split()
        if values and values[0] == 'v':
            positions.append(tuple(float(v) / 100 for v in values[1:4]))
        elif values and values[0] == 'f':
            faces.append([int(v.split('/')[0]) - 1 for v in values[1:]])
    return positions, faces


def check(path):
    positions, faces = glb(path) if path.suffix == '.glb' else obj(path)
    keys = [tuple(round(v, 5) for v in p) for p in positions]
    edges = collections.Counter()
    for face in faces:
        points = [keys[i] for i in face]
        if len(set(points)) < 3:
            continue
        for a, b in zip(points, points[1:] + points[:1]):
            if a != b:
                edges[tuple(sorted((a, b)))] += 1
    open_edges = sum(count == 1 for count in edges.values())
    print(f'{path.name}: {len(faces)} faces, {open_edges} open edges')
    assert open_edges == 0, f'{path.name} has holes'


if __name__ == '__main__':
    for name in ['Sahur.glb', 'Brain.obj', 'SahurStand.obj', 'GardenBed.obj', 'FarmGround.obj', 'FarmDecor.obj']:
        check(ROOT / 'Assets/Models' / name)
