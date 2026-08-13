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

New tests go in the matching tier; shared helpers live in `o2/Tests/Sources/Support/`
(`SceneCleanGuard`, `TickFrame`/`TickFrames` in `Scene/SceneTestHelpers.h`).

## Image generation tools (MCP `imagegen`)

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

## Deploy to games.zenkovich.space

This repo is a submodule of the site repo one level up, which owns the publish pipeline.
From here:

    python3 ../tools/games_pipeline.py deploy --repo gamesTemplate2 --platforms web,android

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
