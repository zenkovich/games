#!/usr/bin/env python3
"""Build and gzip the standalone playable using the native asset builder and emsdk."""
import gzip
from pathlib import Path
import subprocess
import sys
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PRESET, PLATFORM = ('mac', 'Mac') if sys.platform == 'darwin' else ('linux', 'Linux')


def run(*args):
    subprocess.run(args, cwd=ROOT, check=True)


run(sys.executable, 'Tools/Art/check_meshes.py')
run('cmake', '--preset', PRESET)
run('cmake', '--build', '--preset', PRESET, '--target', 'AssetsBuilder', '-j', '8')
run(str(ROOT / 'Bin' / PLATFORM / 'AssetsBuilder'), '-platform', 'WebAssembly',
    '-source', str(ROOT / 'Assets') + '/',
    '-target', str(ROOT / 'BuiltAssets/WebAssembly/Data') + '/',
    '-target-tree', str(ROOT / 'BuiltAssets/WebAssembly/Data.json'),
    '-compressor-config', str(ROOT / 'o2/CompressToolsConfig.json'))
run('cmake', '--preset', 'wasm')
run('cmake', '--build', '--preset', 'wasm', '-j', '8')
total = 0
for name in ['Game.html', 'Game.js', 'Game.wasm', 'Game.data']:
    path = ROOT / 'Bin/WebAssembly' / name
    packed = gzip.compress(path.read_bytes(), compresslevel=9, mtime=0)
    path.with_suffix(path.suffix + '.gz').write_bytes(packed)
    total += len(packed)
    print(f'{name}: {path.stat().st_size:,} bytes; gzip {len(packed):,}')
print(f'Total transfer: {total / 1024 / 1024:.2f} MiB with gzip')
print('Run: python3 Platforms/WebAssembly/serve.py 8090 Bin/WebAssembly')

shutil.copyfile(ROOT / 'Platforms/WebAssembly/Credits.txt', ROOT / 'Bin/WebAssembly/Credits.txt')
archive = ROOT / 'Bin/WebAssembly/Sahur-playable.zip'
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
    for name in ['Game.html', 'Game.js', 'Game.wasm', 'Game.data']:
        bundle.write(archive.parent / name, name)
    bundle.write(archive.parent / 'Credits.txt', 'Credits.txt')
size = archive.stat().st_size
print(f'Playable ZIP: {size:,} bytes / 5,000,000 byte budget')
if size > 5_000_000:
    raise SystemExit('Playable exceeds the 5 MB package budget')
