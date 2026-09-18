# Sahur's Brain Farm

A small 3D playable on [o2](https://github.com/zenkovich/o2): drag to move Sahur,
collect and stack brains, sell them to zombies and progress to a VIP market.
The 22×26 m farm has three long beds with 240 planting spots, a rotated following
camera and a relocated market. Four upgrades add a second garden, a 60-item stack,
golden brains and larger orders. Ordinary brains sell for $2; golden brains for $4.

The original wooden character has a bat, Idle/Run animations, 10 bones and one
1024×1024 baked atlas. The Blender pipeline repairs open surfaces and validates
exported topology. Authored trees, ferns, rocks and barrels use combined meshes. The web version stays in portrait orientation and accepts mouse or touch.
The beds face an open counter with visible stock.
A camera-relative joystick stays anchored at the press position until release; a lightweight color grade
runs inside the existing lighting pass.

## Build and run

```sh
git submodule update --init --recursive
cmake --preset mac
cmake --build --preset mac --target Game GameTests GameUITests -j 8
Bin/Mac/Game
```

Native editor (launch from its output directory so relative asset paths resolve):

```sh
cmake --build --preset mac --target Editor -j 8
(cd Bin/Mac && ./Editor)
```

WebAssembly Release (requires emsdk at `~/emsdk`):

```sh
python3 Tools/build_sahur_web.py
python3 Platforms/WebAssembly/serve.py 8090 Bin/WebAssembly
```

Open http://localhost:8090/Game.html. The script builds native asset tools,
WebAssembly resources, the game and gzip files. Only game and framework assets
are packaged; web editor assets are excluded. Serve `.wasm`, `.js` and `.data`
with gzip/Brotli on deployment. `Sahur-playable.zip` contains the complete playable
and credits; the build fails above the 5,000,000-byte package budget.

## Checks

```sh
ctest --test-dir build --output-on-failure -C Debug --parallel 1 \
  -R '^GameTests/|^GameUITests/(BrainFarmScene|BrainFarmGameplay|BrainFarmJsBridge|BrainFarmPerf|BrainFarmPerfIsolation)$'
python3 Tools/Tests/test_assets_builder.py -v
```

The AssetsBuilder regression checks replace folder metadata while preserving child
asset IDs, then verify both the rebuild and the next incremental build.

These cover model parsing/budgets, movement, harvest/sell/unlock, screenshots
ordered progression, gold/VIP payouts, the final button and a 4800-frame performance run. The portrait test also saves the current
`Assets/Bootstrap.scn` through the engine for the editor.

## Source

- `Sources/Game/BrainFarm/` — scene construction and JS bridge.
- `Assets/Scripts/BF_*.js` — gameplay and HUD.
- `Tools/Art/sculpt_farm.py` — Blender sculpting, remeshing and baking.
  See [art notes](Tools/Art/README.md) for the complete export and validation pipeline.
- `Tools/Browser/verify_sahur.cjs` — full mouse-driven progression, touch check,
  screenshots and video; requires Node and Playwright with Chrome available.
- `Work/ScreenShots/` and `Work/report.html` — local visual verification.
- `Work/Models/CREDITS.md` — third-party model attribution;
  `Assets/Fonts/OFL.txt` — rounded font licence.

The template's native and web editor targets remain available through the
`mac` and `wasm-editor` presets.
