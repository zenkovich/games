# Sahur art pipeline

The runtime contains a sculpted, animated Sahur plus authored third-party market,
oak, fern, rock, barrel and brain meshes. Credits: `Work/Models/CREDITS.md`.

Rebuild with Blender 4.5, Python 3, NumPy and Pillow:

```sh
blender --background --threads 6 --python Tools/Art/sculpt_farm.py -- character environment
python3 Tools/Art/compact_obj.py
python3 Tools/Art/paint_playable.py
python3 Tools/Art/check_meshes.py
```

`build_sahur.py` is the original base-model/export library. Do not run it to rebuild
final art: that would replace the sculpted assets with the old prototype.
`sculpt_farm.py` imports source GLBs, remeshes the wooden body and brain, closes
boundaries, bakes diffuse color and ambient occlusion with padded UV islands, and
exports the final character and environment. The island spans 22×26 m, with
long fenced garden beds and paths. The eastern garden ends stay open toward the
market. The market canopy is removed with a capped mesh cut; its counter and low
front sign remain, leaving stock visible from the game camera. Soil noise uses object coordinates to avoid
stretching on long meshes. Runtime brains use a closed 600-triangle mesh. The character has ten joints and
`CharacterArmature|Idle` / `CharacterArmature|Run` clips.

GLB uses Y-up metres; OBJ uses Z-up and 100 units per metre. `compact_obj.py`
shares vertex attributes; it does not simplify topology. `paint_playable.py`
paints terrain and UI, makes the gold brain variant, resizes and palette-encodes
textures. It must run after baking, rather than repeatedly quantizing source art.
`check_meshes.py` rejects open edges on the character and solid environment meshes.

Build and serve:

```sh
python3 Tools/build_sahur_web.py
python3 Platforms/WebAssembly/serve.py 8090 Bin/WebAssembly
```

The build script checks geometry and produces `Sahur-playable.zip`, failing above
5,000,000 bytes. Ship the complete HTML/JS/WASM/data package with compression;
EditorData, Blender sources, screenshots and gameplay video are excluded.
