#!/usr/bin/env python3
"""Попиксельное сравнение скриншота игры с концептом.

pixel_diff.py <concept.png> <shot.png> <out.png> [--box x0 y0 x1 y1] [--thr 60]
Оба изображения приводятся к размеру концепта; разница считается по L1 в RGB после
лёгкого размытия (терпим субпиксельные сдвиги). Выход: лист «концепт | скриншот |
подсветка» — на скриншоте красным залиты пиксели с разницей выше порога, синим —
умеренной. В консоль: доля совпадающих пикселей в области сравнения.
"""
import sys
from PIL import Image, ImageFilter, ImageChops
import numpy as np

args = sys.argv[1:]
concept_path, shot_path, out_path = args[:3]
box = None; thr = 60
if '--box' in args:
    i = args.index('--box'); box = tuple(int(v) for v in args[i + 1:i + 5])
if '--thr' in args:
    thr = int(args[args.index('--thr') + 1])

concept = Image.open(concept_path).convert('RGB')
shot = Image.open(shot_path).convert('RGB').resize(concept.size, Image.LANCZOS)
if box:
    concept = concept.crop(box); shot = shot.crop(box)
c = np.asarray(concept.filter(ImageFilter.GaussianBlur(1.5))).astype(int)
s = np.asarray(shot.filter(ImageFilter.GaussianBlur(1.5))).astype(int)
diff = np.abs(c - s).sum(axis=2)
strong = diff > thr * 3
mild = (diff > thr * 1.5) & ~strong
overlay = np.asarray(shot).copy()
overlay[strong] = (overlay[strong] * 0.25 + np.array([255, 40, 40]) * 0.75).astype(np.uint8)
overlay[mild] = (overlay[mild] * 0.5 + np.array([60, 120, 255]) * 0.5).astype(np.uint8)
w, h = concept.size
sheet = Image.new('RGB', (w * 3 + 20, h), (0, 0, 0))
sheet.paste(concept, (0, 0)); sheet.paste(shot, (w + 10, 0)); sheet.paste(Image.fromarray(overlay), (2 * w + 20, 0))
sheet.save(out_path)
match = 1.0 - strong.mean()
print(f'match {match*100:.1f}%  strong {strong.mean()*100:.1f}%  mild {mild.mean()*100:.1f}%  -> {out_path}')
