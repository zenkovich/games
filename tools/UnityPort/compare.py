"""Side-by-side comparison of o2 screenshots with the Unity captures + a similarity score.
python3 compare.py <o2 dir> <out dir> [names...]"""
import glob
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

from port_common import CAPTURE


def unity_capture(name):
    fs = glob.glob(os.path.join(os.environ.get("DC_CAPTURE", CAPTURE), "*_" + name + ".png"))
    return fs[0] if fs else None


def score(a, b):
    a = np.asarray(a.convert("RGB").resize((480, 270)), dtype=np.float32)
    b = np.asarray(b.convert("RGB").resize((480, 270)), dtype=np.float32)
    return 1.0 - np.abs(a - b).mean() / 255.0


def main():
    src, out = sys.argv[1], sys.argv[2]
    names = sys.argv[3:] or [os.path.splitext(os.path.basename(f))[0] for f in sorted(glob.glob(os.path.join(src, "*.png")))]
    os.makedirs(out, exist_ok=True)
    res = []
    for n in names:
        o2f = os.path.join(src, n + ".png")
        uf = unity_capture(n)
        if not uf or not os.path.exists(o2f):
            continue
        a, b = Image.open(uf).convert("RGB"), Image.open(o2f).convert("RGB").resize((1920, 1080))
        s = score(a, b)
        res.append((n, s))
        side = Image.new("RGB", (1920, 540 + 30), (0, 0, 0))
        side.paste(a.resize((960, 540)), (0, 30))
        side.paste(b.resize((960, 540)), (960, 30))
        d = ImageDraw.Draw(side)
        d.text((10, 8), "Unity: " + n, fill=(255, 255, 255))
        d.text((970, 8), "o2 port  similarity %.3f" % s, fill=(255, 255, 255))
        side.save(os.path.join(out, n + "_cmp.jpg"), quality=85)
    for n, s in res:
        print("%-24s %.3f" % (n, s))


if __name__ == "__main__":
    main()
