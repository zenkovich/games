# o2-Template — Claude project memory

Shared rules for any Claude session in this repo. Auto-loaded. Commit changes here; private/host
notes stay in `~/.claude/...`, not in this file.

## Editor Actions refactor (ongoing in the o2 editor)

Every mutation of scene/assets/state in the o2 editor must flow through an `Editor::IAction`
(undo/redo), with the mutation owned by the action (runtime path == Redo path) and covered by tests.
The editor is mid-migration — old direct mutations and IAction code coexist. Migrate features one at
a time, only when the owner asks; don't refactor the rest speculatively.

## Build & test after every change

1. Build the affected target: `cmake --build --preset mac --target <Target> -j 8` (`windows` /
   `linux` on those hosts). Fix compile errors before reporting.
2. Run `ctest --test-dir build --output-on-failure -C Debug --parallel 4`. Pick the target you
   touched: `o2UtilTests` (value types), `o2SystemTests` (scene/assets, headless), `o2RenderTests`
   (render / UI widgets), `o2EditorTests` (editor, headless), `o2EditorUITests` (non-headless — for
   tests that build real property/viewer widgets, which headless can't), `GameTests` (headless game
   tests) / `GameUITests` (rendered: real window, cursor injection and screenshots via
   AppTestDriver).
3. Report done only on a green build + green run — never "should compile, tests unaffected".

For a reported bug, work test-first: write a failing test that reproduces it, fix until it passes,
then run the rest of the suite. Add a test for any new code path, or flag the gap.

Headless tests must not load scenes with visual assets (images/fonts) — there is no Render in
headless mode and `TextureRef` crashes. Scenes with visuals are covered by the rendered
`GameUITests`; headless suites test logic and visual-free scenes only.

### Batch test mode (default)

CTest registers one entry per gtest *suite*; the suite runs whole in one process
(`--gtest_filter=Suite.*`), so Application/render init is paid per suite, not per test case.
Entries are named `<Target>/<Suite>`: `ctest -R '^GameTests/'` runs one binary, `ctest -R '/Rotator$'`
one suite. Implemented in `o2/CMake/O2TestSuites.cmake` + `O2TestSuitesDiscovery.cmake` (discovery
at ctest startup); call sites use `o2_gtest_discover_tests(...)`. Configure with
`-DO2_TESTS_BATCH=OFF` for the classic one-process-per-test-case registration (names `Suite.Case`)
when hunting cross-test pollution. Consequence: tests of one suite share a process — clean up global
state (scene, subscriptions to `o2Scene`/global signals) via guards/destructors.

`GameTests` also runs the game's JS tests: every `Sources/GameTests/Scripts/*.test.js` is a suite, each
`test("Name", fn)` in it a case (`expect`, `expectEq`, `expectNear`, `assert`); they `include` the game
scripts from the built assets.

New tests go in the matching tier; shared helpers live in `o2/Tests/Sources/Support/`
(`SceneCleanGuard`, `TickFrame`/`TickFrames` in `Scene/SceneTestHelpers.h`).

## Pipeline editor - three implementations

The AI pipeline editor (`.pipeline` assets, the Pipeline window) lives in the o2 editor
(`o2/Editor/Sources/o2Editor/Pipeline/`, `o2/Editor/Sources/o2Editor/Windows/PipelineWindow/`; docs
`o2/Docs/{en,ru}/Editor/Pipeline/`) and exists twice more: the AssetsLine web editor + server
(`../AssetsLine/`: `shared/`, `backend/src/`, `frontend/src/nodeEditor/`) and the Unity plugin
(`../AssetsLineUnity/Packages/com.assetsline.pipelines/`). All three share one file format and sync
pipelines with each other. A change to pipeline behaviour, a node type, a config key, the format, the
executor/caching rules or the node UI must be made in all three together, with their tests and docs -
otherwise synced pipelines diverge.

## Image generation tools (MCP `imagegen`)

**Never draw or generate game art programmatically (PIL/ImageMagick/SVG etc.) — always produce
it through the Gemini generation utility below.** Scripts are allowed only for mechanical
processing of generated art: crop, resize, alpha cleanup, 9-slice assembly.

For generating game sprites/assets use the MCP server `imagegen` (registered in `.mcp.json`,
implemented in `o2/Tools/ImageGen/`, model Gemini Nano Banana 2). Tools:

- `generate_image(prompt, out_path, aspect?, size?, ref_paths?)` — text-to-image; pass style
  references via `ref_paths` (upscale tiny references smoothly first — a NEAREST-upscaled or
  pixelated reference makes the model copy the pixelation).
- `edit_image(image_path, prompt, out_path, ref_paths?)` — targeted edit, preserves the rest.
- `generate_transparent_image(prompt, out_path, ...)` — RGBA sprite via white/black double
  render + alpha recovery. Does not work for near-white subjects on white (e.g. light UI icons) —
  for flat icons generate on pure white and key the background out with a border flood-fill instead.
- `extract_region(image_path, rect=[x,y,w,h], out_path, transparent?)` — crop a sprite out of a
  sheet; `transparent` re-renders the subject (resolution may change).

Prompts should be in English. Outputs are PNG; results return a preview. CLI equivalents and
details: `o2/Tools/ImageGen/README.md`. API key: `o2/Tools/ImageGen/api_key.txt` (gitignored)
or `GEMINI_API_KEY`.

## Game UI

Интерфейсы игр строить на виджетах движка (`Widget` и наследники: `Button` с onClick и слоями
caption/icon, `Label`, `Image` и т.д.), а не на спрайтах с ручными хит-ректами и текстом. Спрайты —
для игровых объектов и декора сцены. Внутри одного слоя сцены порядок отрисовки задавать явно
(drawDepth у виджетов, отдельные слои для остального) — равные глубины сортируются непредсказуемо.
Экраны живут в акторе камеры интерфейса; всё, что нажимают, — внутри `SafeArea` (o2::SafeArea: кадр камеры без
выреза/островка, скруглений и полоски «домой» устройства), графика на весь экран (фоны, затемнения) — снаружи.

## Comments

Default: no comment. No multi-line rationale/history/ABI essays above code — that goes in the PR. A
short single-line comment only when "why" is non-obvious (hidden invariant, workaround). Same for
tests: a one-line header at most.

Never write a comment that restates the code. If it mirrors the line (`value = nullptr; // clear it`),
delete it. Even a "why" comment must not narrate what the code does.

## Communication

Write the final summary at the end of work in Russian, concise. Record any persistent guidance the
contributor asks me to remember here in this file, not in host/private memory.

## Version control

Don't run `git commit` / `push` / `add` / `gh pr create` etc. by default — make changes and stop at
"files modified"; the contributor reviews and commits. Git authorization is per-session only, never
carried to future sessions.

Never add self-mentions to commits (no `Co-Authored-By: Claude ...` or similar trailers) — commit
messages describe the change only.

## Deploy to games.zenkovich.space

This repo is a submodule of the site repo one level up, which owns the publish pipeline.
From here:

    python3 ../tools/games_pipeline.py deploy --repo gamesTemplate --platforms web,android

`deploy` = build + copy into `games/<slug>/` + ship to the server. Use `build` or
`publish` to stop earlier, `status` to see what would be built and whether the
toolchains are ready.

- `GameInfo.json` must describe *this* game. Left at the template's defaults it
  publishes as "o2 Template" into `games/template/`.
- `--fresh` after switching branches: ninja compares timestamps, and a game's sources
  are often older than the previous game's objects — it will happily link the wrong game.
- Delete `BuiltAssets/<platform>` when sprites were renamed or removed; asset builds add
  and update but never delete.
- Look at the game before deploying, not just at the build log.
- iOS needs `ios.team_id` in the site repo's `games-config.json`; a publishable Android
  build needs `Platforms/Android/keystore.properties`. Docker must be running to deploy.

Reference: `GAMES.md` in the site repo.

## Web editor and its agent

The editor also runs in the browser (`cmake --preset wasm-editor`, served by the o2editor backend),
and Claude Code can work on a project there — either this local Claude Code driving a locally running
web editor, or the agent built into the page, which is Claude Code running on the server over a
private copy of this repository. Both see the editor through the MCP server `o2` / `o2editor`
(registered in `.mcp.json`): `screenshot`, `scene_tree`, `view_info`, `run_script`, `open_scene`,
`save_scene`, `play_mode`, `rebuild_assets`, `read_log`, `click` / `type_text` / `press_key` (play mode
only), `wait`.

The page has two faces over one session, switched in the bottom bar and shared by
the agent:

- **Editor** — the scene editor, as before: `open_scene` / `save_scene` / `play_mode`
  and the Game window.
- **Game preview** — the game client itself (`GamePreview.html`, built by the
  `GamePreview` target), running on the same session working copy instead of a
  packed `.data`, so `rebuild_assets` works there too. There is no play mode: the
  game is always running, and `restart` starts it over on the assets as they are
  built now (the Restart button does the same). Both faces stay loaded, so
  switching between them is instant and neither restarts; the one nobody looks at
  is paused (no frames, no sound) and wakes for as long as a tool runs — a client
  that was already up needs `rebuild_assets` + `restart` to see new assets. The
  pane emulates a window size or a device — drawn in its body, either orientation —
  and `view_info` reports which mode is on. The agent panel is resizable in both modes (a splitter when docked)
  and can be closed to give the game the whole pane.

Rules that hold there:

- Only `Assets/` is writable on the server; the rest of the repository is read-only reference and
  nothing compiles — deliver through assets, scripts and the editor. Locally the usual rules apply.
- The editor reads asset content from the built copy: after changing files under `Assets/` call
  `rebuild_assets` once per batch (10-20 s freeze), then check `read_log` for build errors and
  script exceptions before looking at a screenshot.
- Read the scene with `scene_tree` / `view_info`, never by guessing from a picture; open the scene
  you changed with `open_scene` before `play_mode`. The editor chrome ignores synthetic input —
  `click` / `type_text` / `press_key` exist only to play the game (in the Game window, or in the
  preview, where the canvas is the game and its pixels are the device's).
- `run_script` executes JavaScript inside the engine (globals `sceneRoots`, `findActor(path)`,
  `eachActor(fn)`, the `o2` namespace) without a script asset or play mode; it is not a text
  processor and has no Node/require/filesystem.
- Scripts: a `.js` asset defines a class named like the file, assigned to the global without
  let/const (`Name = class Name extends o2.Component { ... }`); lifecycle hooks are exactly
  `OnStart()`, `OnEnabled()`, `OnDisabled()`, `Update(dt)`; log with `print()`; never `Dump()` or
  enumerate the JS global under browserjs. A window script reports to C++ through the injected
  property named exactly `action`. Code shared between scripts lives in plain script assets pulled
  in with `include("Scripts/...js")`; JSON data assets come in via `GetJson()` (see o2 scripting docs).
- Never change an asset uid, an actor Id or a PrototypeLink number, and move a `.meta` together with
  its file — references are by uid and break silently.
- Particles: an emitter needs `"mPlaying": true` (and `"mLoop": "Repeat"` for a loop) to play on its
  own; scripts start one with `RewindAndPlay()` (found with `GetComponent("o2::ParticlesEmitterComponent")`);
  the particle image must be part of the built assets.

## WordFall levels and screens

- A level is a `campaign.json` entry (`WordFallConfigs.NormalizeLevel` reads it, `CompactLevel` writes
  it back): a permanent `id` (L001…) and `name`, cells as `{x, y}`, fixed letters in `letterCells` as
  `{x, y, letter}`; every other cell gets a random letter. The words to find are a separate `words` list,
  not tasks (an old `{"word": ...}` task is read into `words`); `wordsAuto` more words are picked at level
  start by `WordFallWordAgent` from the language's dictionary by `difficulty` (1–10) and
  `wordMinLength/wordMaxLength` (0 — by difficulty), deterministically per level id; `autoTarget` lets the
  agent set the target score. The first word is seeded on the board. Obstacle cells are reserved from it.
- `WordFallLevelStore` keeps edits by level id and the campaign order separately (levels are created,
  copied, deleted and moved without losing edits); the edits file `wordfall_levels.json` next to the
  executable (`WordFallGameService.editedLevelsPath`) is `{"version": 2, "order": [...], "levels": {id: ...}}`,
  the old `{"levels": {"<index>": ...}}` still loads. Tests point `editedLevelsPath` at their own file.
- Bonus effects have variants: `WordFallFxView.bombStyle` / `rocketStyle` / `fireworksStyle` (0 — the original
  effects, 1..5 — alternatives in the board's materials). Their particle emitters are `S_<name>_<i>` pools under
  `Vfx` of `GameScreen.proto`, built by `Tools/WordFall/build_fx_variants.py` from specs (rerun after editing a spec;
  it rebuilds only the `S_` emitters); `WordFallVfx.PlayStyle` / `StartTrail` play them, a rocket's look
  (`WordFallFxView.RocketLook`) sets its body, trail, launch and hit. The default is 2 (rainbow) for all three. A rocket
  of any look but 0 flies without the prototype's clip (its `AnimationComponent` is switched off: a stopped state still
  writes scale and trajectory position every frame) like a propeller — `WordFallFxView._PropellerFlight`: lift with
  growth, a hover turning to the arc, the arc with ease-in-out, shrinking onto the cell, a squash on the hit
  (`WordFallFxView.propeller`); the position always goes through `FlightTrajectoryComponent`, which rewrites the
  widget's offsets every frame. `WordFallVfxShowcase.EveryBonusStylePlaysItsParticles`
  checks every variant and, with `WORDFALL_CLIPS_DIR`, records each at 60 fps of game time
  (`Integration::forcedFrameDeltaTime`).
- Freezes are looked for frame by frame, never in an average: `WordFallFrameProfile.Freezes` (GameUITests, run with
  `WORDFALL_PROFILE=1`, or `=js` for the script methods too) plays the game — hint and accept, bonuses, shuffle, level
  start — and prints every frame over 16.7 ms with its heaviest zones; `WordFallFrameProfile.AllCases` (every booster
  on a cell, a level with each obstacle, the language switch, the level editor), `WordFallTutorialProfile` and
  `WordFallMetaProfile.MetaFreezes` (every meta window first and again, the victory first and again, the continue
  window) do the same. Profile the Release build: `cmake -S . -B build-release -DO2_TESTS=ON`, then
  `cmake --build build-release --target GameUITests` (it writes the same `Bin/Mac/GameUITests`), and run it with
  `O2_BACKGROUND_WINDOW=1 O2_INVISIBLE_WINDOW=1`. `WORDFALL_BUDGET_MS=6` lowers the frame budget: the web build is 2-3x
  slower, so a 6 ms native frame is a freeze there. A dictionary scan (~37k words, tens of ms in QuickJS) never runs
  whole in a click frame: the hint is searched ahead by `WordFallGameService._PrepareHint` (`WordSearch.Step`,
  `hintWordsPerFrame` words per frame, restarted when anything but the selection changes — `_HintKey`), word-score
  checks use `WordBoard.AnyWordWorth` (`WordSearch.AnyWorth`: lengths whose best tiles cannot reach the threshold are
  skipped). Styled glyphs (font styles with shadows and strokes) are rasterized on the CPU when first shown — the
  victory window warms its number glyphs at load (`warmUpGlyphs`); the engine's `Bitmap::Blur`/`Outline` are the cost
  (o2 `BitmapEffects` tests). `GetColumns`/`GetRows`/`GetLetterValue` read the level's board: `_BoardConfig()` rebuilds
  the config on every call. A new `Sources/GameTests/Scripts/*.test.js` reaches ctest only
  after `GameTests` is relinked (or touched).
- The in-game level editor (cheats → «Открыть редактор», prototype `LevelEditorScreen.proto`, view
  `WordFallLevelEditorView.js`, model `Core/WordFallLevelDraft.js`, undo/redo `Core/WordFallEditHistory.js`):
  the level list with a scroll bar, new / copy / delete / move / rename, cells (left click places, right
  click removes, the wheel sets a crate's grade), parameters, the words block with the agent, up to 5
  tasks with a type picker. «Экспорт» writes the whole campaign to `campaignExportPath`
  (`../../Assets/WordFall/campaign.json` from `Bin/<Platform>`); the «Файл» panel (`WordFallFileIO.js`)
  saves the campaign or a level to a file and loads any of them back, and takes the field (shape,
  crates, chains, ice, stones, bonuses) from a Gardenscapes / Homescapes level XML
  (`Core/WordFallMatch3Import.js`; natively from `match3ImportPath` next to the executable).
- Units: the ui camera of `WordFall.scn` is the screen of the "Wordfall UI" pipeline's UI kit device, iPhone 16
  (FittedSize 1179x2556, one world unit = one pixel of it); the camera fits it into the window or the device.
  `Tools/WordFall/apply_camera_units.py` sets it and fits the screens laid out in an 868x1813 frame (the game screen, the
  level editor) into it by their root actors' scale 1179/868; their scripts keep working in their own units (layout rects
  are unscaled). Under a scaled widget o2 layers keep the layout size and pass the scale to their drawables, so letters
  and sliced-sprite corners are magnified with the screen (before that fix the texts of the scaled screen looked small). Particles take size, speed and gravity in world units, not from the parents' scale: the script scales
  every emitter of GameScreen, FxRocket and FxFlyingLetter by the same factor (velocity stretch by its inverse), and
  `build_fx_variants.py` writes its emitters at the game screen's scale. UI tests click in game-screen units
  (`ToWindow` = × `kGameScale` × camera fit, `kCameraSize` 1179x2556, `kScreenSize` 868x1813 is the game frame).
- The game screen (868x1813 in its own units) follows the layout of the "Wordfall main"
  pipeline: `Assets/Generated/UI/Screen.proto` (its imageToUi node) with raster sprites and Roboto fonts in
  `Generated/UI/Screen_Resources`. The sprites are packed into the o2 atlas `Screen_Resources/ScreenUI.atlas`
  (every image meta has its `atlasId`). `Tools/WordFall/apply_screen_layout.py` moves the layout onto
  `GameScreen.proto` (ids and prototype links kept) and the Tile, WordSlot, Booster and FxFlyingLetter
  prototypes, fits the camera and adds `atlasId` to new sprites — rerun it after the pipeline rewrites
  Screen.proto. The game stacks the sections tighter than the layout (`compact` in the script: `WORDS_SCALE`,
  `BUTTONS_SCALE`, `GAPS`): on top the words panel (the level's words, a bit smaller than in the layout) and the
  moves box filling the rest of the row; under them the objectives — plaques in two columns (checkbox with the
  green check, icon or letter tile, caption with progress), the last one is the score goal, more than four shrink
  into three rows (`WordFallTasksView`); then the progress row; then the word tray with ✓/✕, always on screen
  (`WordFallWordPanelView`); the board panel right over the smaller boosters. The board backing follows the level's shape: the
  field is its tiles grown by an even rim (`BOARD_RIM`, corners rounded by `BOARD_INNER_RADIUS` /
  `BOARD_OUTER_RADIUS`, an inner shadow `BOARD_SHADOW*` lit from above), and the
  script renders it from the layout's board panel (its sockets and ridges, the rim of its side) as quarters of a
  cell `WordFall/ScreenUI/board_<tl|tr|bl|br>_<h?v?d?|o>.png`, named by which neighbours of the quarter's corner
  are in the field (side, upper/lower, diagonal). Every cell has `Back_c_r` of four of them,
  `WordFallBoardView.BackKind` picks them, holes aren't drawn. The pieces overlap (`BLEED`) and their transparent
  pixels carry the colour of the painted ones: no seams when sprites are filtered. The background is flat
  (`PAPER`, the reference image's colour). A refused word's message is a plaque over the progress bar, an aimed
  booster's prompt — over the tray field. Tile colours are the model's `tint` (cream, gold, gold, orange), doubled
  tiles are yellow. `WordFallMainScreenUI.ScreenFollowsThePipelineLayout` checks the sections against the rects of
  Screen.proto (sizes and horizontal places), their order and gaps, the even board frame and the flat background with
  `Sources/GameUITests/Data/wordfall_layout_mock.json` (`WordFallGameService.DebugApplyMock`) and saves
  `Work/ScreenShots/40_layout_screen.png`. The previous screen (the HTML layout `Tools/WordFall/CssScreen`,
  `build_svg_sprites.py`, `restyle_main_screen.py`) is history: rerunning `restyle_main_screen.py` overwrites
  the current screen. Of its SVGs (`"scalableMesh"`/`"rasterized"` metas, drawn from the vector rasters atlas,
  `WordFallPerfUI.VectorScreenCost` fails on any tessellation) only the ✓/✕ buttons and the charge badges are
  left. The level editor (768x1673, centred in the camera)
  still uses the composer sprites in `WordFall/SpritesNew`. `LevelEditorScreen.proto` and the Cheats panel of
  `GameScreen.proto` are scaffolded by `Tools/WordFall/build_screens.py`. After that the prototypes are the
  source of truth — rerunning a script discards editor tweaks.
- Meta screens follow the "Wordfall UI" pipeline (three AI UI layout nodes on one UI kit): the main screen, the victory
  window and the continue window are `WordFall/UI/{MainScreen,VictoryWindow,ContinueWindow}.proto`, designed at 1179x2112
  (iPhone 16, 460 dpi). The UI kit lives in one folder, `WordFall/UIKit` (`Sprites` — the kit graphics the screens use, with their nine-slice
  borders, `Fonts`, `FontStyles`); a screen's `_Resources` keeps only its own graphics (backdrop, season pass).
  `Tools/WordFall/save_ui_layouts/save_ui_layouts.sh` saves the layouts again (the node's Save to project run headless in
  o2EditorUITests, own graphics taken from the nodes' cached outputs) and runs `Tools/WordFall/apply_ui_screens.py`, which
  merges the kit into `WordFall/UIKit` (uids rewritten), lifts the drawing depths over the game screen (main 200+, windows
  400+), drops the windows' backdrops, adds pressed states, the main screen's counters and the view scripts, and puts each
  screen into the ui camera's frame. Don't Save to project from the editor without renaming the layouts' roots: all three
  are named "Screen" and would overwrite `Generated/UI/Screen.proto` of the game screen. Screens live inside the ui camera
  (iPhone 16, see Units) — no runtime layout code: the root is the camera's frame 1179x2556 at scale 1, the 1179x2112
  design goes into it like Expand (the extra height goes to the anchors), the backdrop keeps its proportions and covers as
  far as the game screen's BG reaches (20:9 phones) with what the layout put on it as its children, the windows' dimmers
  reach as far. `WordFallBootstrap` starts
  on the main screen (`startOnMain`; the UI test fixture switches it off for the old suites) and, after the end-of-level
  effects, opens the victory window over the main screen (`WinLevel` → reward claimed ×1 or ×2 for an ad) or the continue
  window over the board (+`continueMoves` for `continuePrice` coins or an ad; the cross gives up: a life burns, back to the
  main screen). The board's own popup only works without the main screen. Ads are not wired: watching one is granted at
  once. Coins, lives (regen `lifeRegenSeconds`), stars per level and the boosters are in `PlayerProgress`. The boosters
  (the five buttons under the board) are one stock for the whole game: a new player gets `startBoosters`, a level
  spends them, no level refills them (a level's `boosterCharges` count only for `PlayCustomLevel`). Rockets fly to the
  task obstacles, then under the envelopes, then to any blocker, and only then to a random letter
  (`WordBoard._RocketTargetScore`). Tests: `GameTests/WordFallMeta`,
  `GameUITests/WordFallMetaUI` (shots `Work/ScreenShots/5x_meta_*.png`, `6x_meta_*.png`).
- Meta windows from the UI kit's sprites, built by `Tools/WordFall/build_meta_windows.py` (rerun after editing it; it
  also adds `Screen/Hud/QuitButton` to GameScreen.proto and `lives_button` to MainScreen.proto): `WordFall/UI/`
  LevelStartWindow (PLAY: the level's goals, start bonuses bomb/rocket/fireworks from `PlayerProgress.bonuses`, placed by
  `WordBoard.PlaceBonus` through `StartLevelWithBonuses`), LivesWindow (PLAY with no lives, the lives counter: timer,
  refill for `livesRefillPrice`, +1 for an ad), ShopWindow (the bank: `shopPacks`, granted at once - no payments),
  BoosterShopWindow (an empty booster or start bonus: a pack of `boosterPack` for `boosterPrices`/`bonusPrices`),
  QuitLevelWindow (the level's cross: a life burns), SettingsWindow (sound/music flags in `PlayerProgress.settings`,
  language, the tutorial again). Views extend `WordFallWindow.js`; a window opens and closes with its root's `visible`
  state (the clip is in the prototype), no code tweens. Not enough coins anywhere opens the bank on top. Texts are
  English like the pipeline's windows (LilitaOne has no Cyrillic). The cross sits over the cheats' hidden long-press
  corner (depth 96 > 95).

- Safe area: the screens are children of the ui camera (`WordFallBootstrap` is a component of the camera and instantiates
  them into it), everything people touch is inside an `o2::SafeArea`. `Tools/WordFall/safe_area.py` (idempotent; the
  screen generators call it) puts it there: GameScreen/LevelEditorScreen are `root -> Safe -> Screen`, the root's
  `WordFallSafeFit` scales the root so the fixed design (868x1813, 768x1673) fits the safe area (on a phone with an
  island the game screen is ~7% smaller than the camera's width; the camera's fill is the paper colour around it);
  MainScreen `safe_area` holds top_hud, play_button and bottom_navigation (its wooden bar reaches down under the home
  indicator), VictoryWindow `home_screen/safe_area` everything but the dimmer, ContinueWindow `safe_area/continue_dialog`,
  the meta windows `safe_area/dialog` (their clips animate `child/safe_area/child/dialog/...`). Opened alone, a safe area
  keeps the iPhone 16's insets (177 and 102 units), so the editor shows the screens as that phone does. UI tests find
  the screens with `FindScreen(name)`; `WordFallMetaUI.InterfaceStaysInTheSafeArea` emulates the iPhone 16's safe area
  (`o2Application.SetSafeAreaOverride`) and checks every button of every screen and window (shots 70-79).
- The campaign is generated and balanced by LevelLab (`Tools/WordFall/LevelLab`, README there; `node
  Tools/WordFall/LevelLab/server.mjs --open` is the page, `lab/cli.mjs` the same from the shell). It loads the scripts
  of `Assets/Scripts/WordFall/Core` into Node and plays them: a change of the rules is a change of the simulator. The
  difficulty of a level is the attempts an average player needs (1 / win rate) as bots measure it; a level's target comes
  from the curve (`data/curve.json`, defaults in `lab/curve.mjs`), the tuner sets `moves` and `targetScore`, the
  statistics live in `data/levels.json`. Regenerate or re-evaluate after changing the bot, the scoring or a dictionary -
  the numbers go stale, the levels do not break.
- Letters fall through the gaps (holes) of the board: only a chain cuts a column (`WordBoard._CollapseOnce`), so a level
  may have any shape, gaps inside included. LevelLab's shapes (`lab/shapes.mjs`, hardness measured by the bots) and
  symmetric layouts of blockers and bonuses (`lab/layouts.mjs`) build on that.
- The bot is `Core/WordFallBot.js` (profile: erudition, effort, skill, boosters, spread; `NextAction()` and
  `WordFallBot.Apply`): the same code plays in the lab and in the game. `WordFallBotRunner.js` drives it through the
  views when `WordFallBootstrap` finds a fresh `wordfall_bot.json` next to the executable (the lab writes it): the level
  starts through `WordFallGameService.PlayCustomLevel`, which leaves progress, lives and tutorials alone. `O2_GAME_SPEED`
  speeds the game up, `O2_BACKGROUND_WINDOW` + `O2_INVISIBLE_WINDOW` keep its window off the screen. With the same
  seeds an attempt in the game repeats the simulated one move for move. A request with `human: true` (the page's
  «Играть») opens the level for a person instead of the bot and records their attempts the same way. The request file is
  deleted once read (a restart is the ordinary game again); `pace` speeds the bot's own pauses where the game cannot run
  faster (the web game on the portal).
- LevelLab is also the project's **Levels** tab on the o2 portal: `o2portal.json` (root) lists `Tools/WordFall/LevelLab`,
  whose `plugin.json` says what it may read and write. There the page runs `lab/api.mjs` itself in the browser
  (`web/portal.js`): files through the portal's bridge, bots in Web Workers, the game in a pane next to the page. Keep
  `lab/*.mjs` free of Node-only imports except `node_host.mjs`, `worker.mjs` and `cli.mjs`.
- Levels of builds already out: the remote config `wordfall_levels` (`{levels: {id: level}}`) overrides a campaign level
  by its id (`WordFallRemote.Level`, read at every level start through the level store's source); LevelLab's «В билд»
  publishes the campaign there. Edits in the in-game level editor still win over it.
- Dictionaries are built: `Tools/WordFall/LevelLab/dictionary/<lang>.tsv` (word, difficulty 1-9, familiarity 1-9, kind:
  `.` ordinary, `w` fit to be a level's word, `n` name, `p` rude) -> `node .../dictionary/build_dictionary.mjs` ->
  `Assets/WordFall/Dictionaries/<lang>.json` (parallel strings `difficulty`, `familiarity`, `kinds`). Edit the table,
  never the asset; words are only added. Level words (the generator, `WordFallWordAgent`) come from `w` words; names and
  rude words are accepted from the player but never asked for or hinted. `languages.json: scoreScale` scales score
  targets for a language whose letters are worth less (en 0.77, found by `lab/cli.mjs scale en`).

<!-- o2 agent memory: imports -->
## Agent memory

The lessons the agents keep - this project's and the general ones of the o2 engine (synced with the o2 portal):
@AgentMemory.md
@o2/AgentMemory.md
