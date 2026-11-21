# LevelLab — the level tool of Word Fall

Generates and balances the campaign (`Assets/WordFall/campaign.json`) against a difficulty curve, with bots that
play the levels on the game's own rules. One page: the curve, the levels, a level editor that draws the board with
the game's sprites, the bots' statistics, a replay of a bot's attempt, and a button that starts the real game with
the bot playing.

    node Tools/WordFall/LevelLab/server.mjs --open        # http://localhost:8737/

No dependencies beyond Node 22+. The server listens on localhost only: it writes project files and starts the game.

## What is what

| Path | Role |
|---|---|
| `server.mjs`, `web/` | the page and its API (state, evaluate, tune, generate with live progress, replay, play in the game, dictionary) |
| `lab/core.mjs` | loads the game's rule scripts (`Assets/Scripts/WordFall/Core`) into Node — the lab plays the very code the game runs |
| `lab/sim.mjs` | one attempt of a level by the bot; statistics of many attempts |
| `lab/pool.mjs`, `lab/worker.mjs` | worker threads: many bots play at once (≈10–15 thousand attempts per second on a desktop) |
| `lab/difficulty.mjs` | the difficulty of a level: attempts per player profile, the parameters around them, the index |
| `lab/curve.mjs` | the difficulty curve: the target attempts of every level |
| `lab/tune.mjs` | fits moves and the target score of a level to a target difficulty |
| `lab/generate.mjs` | designs the structure of a level for its place in the campaign, then tunes it |
| `lab/shapes.mjs`, `lab/shape_cache.mjs` | the catalog of board shapes and how much each makes a level harder, by the bots |
| `lab/layouts.mjs` | symmetric layouts of blockers and bonuses; `relayout` lays out a level's own anew |
| `lab/cli.mjs` | the same without the page: `curve`, `evaluate`, `generate`, `scale` |
| `dictionary/` | the rated word tables (`<lang>.tsv`) and `build_dictionary.mjs`, which builds the game dictionaries from them |
| `data/` | the lab's own files: `curve.json`, `settings.json` (written when changed), `levels.json` (targets and statistics per level), `shapes.json` (measured shape hardness), `backups/` (the campaign before each session's first write, not committed); the hand-made campaign of 130 levels the lab replaced is in git history |
| `test/` | `node --test Tools/WordFall/LevelLab/test/lab.test.mjs` |

The bot itself is a game script, `Assets/Scripts/WordFall/Core/WordFallBot.js`; `WordFallBotRunner.js` drives it
inside the game.

## Difficulty

**The difficulty of a level is the average number of attempts an average player needs to pass it**, 1 / win rate.
The bots measure it; next to that one number the lab keeps what describes the level better than it does:

- attempts of a weak and of a strong player, and their ratio — how hard the level sorts players by skill;
- moves left on a win (slack) and their histogram;
- near misses — losses that two more moves would have turned into wins — and wins with the +5 moves the game sells;
- Wooga's FUUU factor: tries until the win per almost-win on the way (over 10 — the level frustrates);
- what was missing at a loss: score, words, each kind of task;
- score against the target, length of the words played, bonuses and boosters per attempt;
- the same level for the average player in the other languages.

They fold into one number, the **index**: the geometric mean of the three profiles' attempts by the weights of the
settings, lowered when wins leave moves to spare and raised when losses end far from the goal. Its 1–10 grade is
written into the level's `difficulty` field.

A bot is not a person: `settings.calibration` (`logit(p people) = offset + slope·logit(p bot)`) is the place to fit
the bots against real pass rates once the game has them — the way King maps its playtest bots to players.

## The bot

Every move the bot recalls words of its vocabulary — familiar and simple ones come to mind more often, each letter
past three makes a word harder to reach — checks that the board's letters spell them, and plays the best of the few
it found. The words of the level are always in sight; a part of the recalls is aimed at the goal (a word of the
wanted length, with the task's letter, with the letter of a tile that has to go — under an envelope, next to ice or
a crate). Tiles: the game never tells that neighbouring tiles multiply the score, so only a skilled player clusters
them; obstacles and bonuses are in the tutorial, so the average one aims at them too. Boosters come when it is tight.

A profile is five numbers 0..1: `erudition` (which words it knows, by the word's familiarity), `effort` (how many
candidate words it finds before playing), `skill` (tiles and weighing the goals), `boosters`, `spread` (difference
between people of one profile — every attempt is a new person). Three profiles ship: weak, average, strong; "mind"
0..1 runs through them. The average one plays words of 4.1 letters on average (a third of them 3-letter, 2% of 7+)
and scores about 40 points a move on an open board in Russian.

The simulator and the game run the same scripts, so an attempt replays exactly: the page's "this attempt in the
game" starts the game on the same seeds, and "without a window" plays attempts in the real game invisibly for a
cross-check.

## The curve

The default follows what match-3 games publish: an unfailable onboarding (12 levels at 1.00–1.05 attempts), a
slowly rising base (to 1.7 at level 100) with a saw of five-level waves, a hard level every tenth level from 25
(1.9 → 3.2), a super hard one from 49 (3.0 → 5.0), a breather right after every peak (1.05). Every parameter and
every level's target is editable on the page; points dragged by hand are kept as overrides.

Sources: Royal Match levels 1–100 teardown (normal ≈1.2 attempts, hard 1.6, super hard up to 2.5; hard at x5/x9,
an easy level every tenth) — gamigion.com/royal-match-level-design-insights; Playrix on difficulty as losses per
attempt and on avoiding 92–95% levels — gameworldobserver.com/?p=2934; Wooga's blocking levels, relief levels and
the FUUU factor — pocketgamer.biz (GDC 2014); King on easing a level right after a hard one and pruning "crazy
hard" levels — mobilegamer.biz, pocketgamer.biz; Candy Crush episode pass rates 0.62…0.04 (DataCamp dataset);
Tactile, "very hard = 8+ attempts", ±1 move ≈ 2 pp of completion — arxiv.org/abs/2107.03305; playtest bots mapped
to players — Gudmundsson et al. 2018 (King), arxiv.org/abs/2107.12061 (Rovio); word prevalence as the share of
people who know a word — Brysbaert et al. 2016/2019.

## Tuning and generation

*Tuning.* An "open" run plays the level with the limits lifted and records, for every attempt, the move on which
the words and tasks were done and the score after each move. Any pair (moves, target score) is then judged on those
records without playing again. The goals take half of the difficulty in log terms (three quarters on a peak —
a score target alone shuts weak players out), the score target the rest. The bot is told the limits picked so far
and the run is repeated on the same seeds until it picks the limits it was played with — at that point the share
of wins is exactly what real attempts on those seeds give. The final statistics use fresh seeds.

*Generation.* For its number in the campaign and its tier (onboarding, normal, breather, hard, super hard) a level
gets a board shape from the catalog, one to three kinds of blockers out of those already introduced (`unlocks` in
`generate.mjs`; the level that introduces a kind shows it alone) laid out by patterns, bonuses, tasks, and one to
three words: marked in the dictionary as fit for a level, known to everyone, not used in the campaign yet, in every
language. Then it is tuned; when the goals are out of reach or the target is missed the design is softened or
replaced, up to seven times. 100 levels take about a minute.

*Shapes.* 34 boards after the fields of match-3 games: cut corners, pillow, crown, keyhole, honeycomb, two floors,
two and three towers, octagon, heart, butterfly, hourglass, ring, frame, arch, comb, four squares, cross, mushroom,
wave, vase, bridge, pyramid, funnel, wings, T, diamond, star, zigzag, stairs, islands. Letters fall through the gaps
of a board (a game rule since this tool, see below), so any shape is playable. A shape is a lever of difficulty of
its own, and the bots measure it (`measureShapes`, cached in `data/shapes.json`): the score per move and the share of
5+ letter words an average player keeps on it against the full board. The number of cells barely matters (the
board refills); gaps that cut clusters do — islands take 28 % of the points, the comb and the three towers about
20 %, a diamond or a star a quarter of the long words. The generator takes a near-full board for the first levels,
then harder shapes the further and the higher the peak, never the shape of the two levels before (match-3 levels
should differ in shape from one to the next), mirrors an asymmetric one at random.

*Layouts.* Blockers are laid out by patterns, mirror-symmetric about the middle column: whole rows from the middle
out or from the edges in, 2×2 blocks, a block in the middle, a pair of columns, a ring of eight cells, a
checkerboard band, an X, a V, the frame of the shape, the bottom to dig through, the top where things fall from,
the corners. Each kind has its patterns and its zone (crates low, snow and envelopes on top, chains in the middle —
a chain starves the cells under it); blockers of one level share the board by zones. Bonuses come in mirrored pairs
of one kind, a row of three or one in the middle, and go where they help: in the middle of a ring, next to the
thickest blockers, stones always with bonuses to break them. The page's «Разложить» lays out a level's own blockers
and bonuses anew in the same way.

## Dictionaries

`dictionary/<lang>.tsv` is the dictionary: `WORD  difficulty  familiarity  kind`.

- **familiarity 1–9** — the share of adults who know the word (9 everybody, 5 about two thirds, 1 practically
  nobody); **difficulty 1–9** — how hard it is to come up with the word and spell it, given that you know it
  (length first, then concreteness and spelling traps). Both were rated word by word by Claude Sonnet against one
  rubric; Russian familiarity agrees with the frequency dictionary of Lyashevskaya and Sharov (99% of the 9s are in
  it, 7% of the 1s).
- **kind**: `.` ordinary, `w` ordinary and fit to be a level's word (a concrete noun everybody knows — the
  generator and the game's word agent take level words only from these), `n` proper name, `p` rude. Names and rude
  words are accepted from the player but never asked for and never hinted.

Nothing was removed from the original dictionaries. Russian grew from 23,509 nouns to 36,936 words: lemmas of every
part of speech from the frequency dictionary, names of people, places, brands and characters, colloquial and
modern words, mild and medium swear words (the obscene roots and slurs were left out). English grew from 20,000 to
32,362 words out of a film-subtitle frequency list and the same kinds of lists.

After editing a table (or a word on the page): `node dictionary/build_dictionary.mjs`, then rebuild the game's
assets.

## The page

- The top bar: the language the bots play, a progress pill of a running job (click — its log), the state of the
  game's assets with «Собрать», «Генерация», «Боты» (profiles, tuning, index, calibration), «Словарь».
- The curve (collapsible): the plan line, peaks as diamonds, the bots' estimates with their 95 % intervals (red ring —
  out of tolerance), the selected level as a band; drag a point of the plan to set a level's target by hand, double
  click to give it back to the curve; «Параметры» opens the curve's settings beside it.
- The level list: tier stripe, words, moves, shape, blockers, the bots' attempts against the target; filters «Пики»,
  «Вне цели», «Без оценки»; new, copy, move, delete below. ↑/↓ walk the list.
- The editor: tools in one row (1–0, F, L, E), symmetric painting (M), left button puts, right takes away, a stroke
  paints, the wheel sets a crate's strength; «Форма» opens the shape gallery with the measured hardness, «Разложить»
  re-lays the blockers; moves and score, words per language, tasks, boosters, the bag; every change is saved to
  campaign.json and can be undone (⌘Z).
- The inspector: attempts with the target and the interval on a scale, wins, the index, the skill gap; «Оценить»,
  «Подогнать», «Только очки», «Новый вариант»; the bot (profile or "mind", watch an attempt, a win or a loss, play in
  the game or without a window); players' table, why they lose, moves left on a win, word lengths, how the level was
  made, the tuning steps.

## The game side

- Letters fall through the gaps of the board: a column is cut only by a chain (`WordBoard._CollapseOnce`), cells
  under a gap are refilled from above. Before, a gap inside a column starved the cells under it, so shapes could only
  be trimmed at the top and bottom. Test `WordFallCore.TilesFallThroughGapsInsideTheBoard`; in the real game an
  attempt on a ring-shaped level repeats the simulated one point for point.
- `WordDictionary` reads the ratings; `WordFallWordAgent` and the hint use them.
- `languages.json: scoreScale` — score targets are tuned for the default language; a language whose letters are
  worth less scales them (`node lab/cli.mjs scale en` finds the value: 0.77).
- `WordFallGameService.PlayCustomLevel` plays a level that is not in the campaign and leaves the player's progress,
  lives and tutorials alone; `WordFallBootstrap` starts it with the bot when a fresh request file
  (`wordfall_bot.json`, written by the lab) lies next to the game.
- `O2_GAME_SPEED` (1…16) runs the game faster; `O2_BACKGROUND_WINDOW` with `O2_INVISIBLE_WINDOW` keeps its window
  off the screen.

The game reads built assets: after the campaign, a dictionary or a script changed, press "rebuild assets" on the
page (or build the `BuildAssets` target) before starting the game from an IDE. A bot run from the page does not
need it for the level — the level travels in the request — but does for scripts and dictionaries.
