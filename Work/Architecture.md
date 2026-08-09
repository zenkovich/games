# Word Fall — архитектура

## Слои

1. **C++ bootstrap** (`Sources/Game/WordFall/WordFallBootstrap.{h,cpp}`) — компонент по образцу
   DragonDefenseBootstrap: в `OnStart()` строит всю сцену кодом (слои, камера, фон, поле 7×8 из
   кнопок-плиток, HUD, панель слова, бустеры, попап), затем вешает `ScriptableComponent` с
   `Scripts/WordFallGame.js` на актор `Game`. Сохранённая сцена (`Assets/WordFall.scn`) содержит
   только актор Bootstrap — при загрузке из игры или редактора компонент строит всё сам
   (runtime path == editor path).
2. **JS модель** — `WordModel` (в WordFallGame.js, глобальный класс): чистая логика без движка —
   сетка, мешок, выбор, словарь, очки, гравитация, спавн, бустеры, состояние уровня.
   Тестируется headless через `o2Scripts`.
3. **JS вью-контроллер** — `WordFallGame extends o2.Component`: находит виджеты по путям,
   вешает `onClick`, мутирует тексты/цвета/слои, анимирует падение через `Update(dt)`.

Причина разбиения: из JS не доступны `o2Input`/`o2Scene`/`o2Assets`/создание шрифтов;
единственное JS-событие — `Button.onClick`. Поэтому весь визуал создаёт C++, JS только
мутирует готовые виджеты (SetText, color, enabled слоёв, layout-офсеты).

## Иерархия сцены

```
WordFall (root, контейнер)
├─ BG                  спрайт фона (слой BG)
├─ Board
│  └─ Tile_<c>_<r>     Button ×56: слои back(спрайт плитки), sel(рамка выбора),
│                      ice(наледь), letter(Text), points(Text)
├─ Hud
│  ├─ ScorePanel/ScoreLabel     «Очки: 0 / 300»
│  └─ MovesPanel/MovesLabel     «Ходы: 12»
├─ WordPanel
│  ├─ Panel, WordLabel          текущее слово (цвет = валидность)
│  ├─ GainLabel                 всплывающее «+N»
│  ├─ AcceptBtn («ПРИНЯТЬ»), ClearBtn («СБРОС»)
├─ Boosters
│  ├─ Booster0..4 (Button, иконки), Charge0..4 (Label «×3»), ModeLabel
├─ Popup (выключен)
│  ├─ Dim, Panel, Title, ScoreLine, RestartBtn («ЕЩЁ РАЗ»)
└─ Game                ScriptableComponent → Scripts/WordFallGame.js
```

Слои сцены: `BG`, `UI`. Порядок отрисовки — явные `SetDrawingDepth` у виджетов.

## Координаты

Окно 1280×800, центр (0,0), y вверх. Ячейка 68 px, плитка 64.
Центр плитки (c,r): `x = (c-3)*68`, `y = -20 + (r-3.5)*68` (r=0 — нижний ряд).
Поле: x ∈ [-204..204], y ∈ [-258..218]. HUD y=360, панель слова y=295, бустеры y=-350.

## Модель (WordModel)

- `grid[c][r] = { letter, value, ice, doubled, joker }`, 7×8.
- **Мешок**: 100 плиток с фиксированными частотами (GDD §6), тянется без возврата, перезаполняется.
  Анти-клин: если 4 плитки ниже точки спавна — согласные и вытянута согласная, берётся
  первая гласная из мешка.
- **Выбор**: массив `selected[{c,r}]`, свободный по всему полю; повторный клик снимает букву
  и весь хвост после неё.
- **Очки**: `ceil(base × lenMult × clusterK)`, base = сумма номиналов (удвоитель ×2, джокер 0),
  lenMult = 1+0.25(L−3) при L>3, clusterK = размер максимальной связной компоненты выбранных
  плиток по 8-соседству (K≥2), иначе 1.
- **AcceptWord()**: валидация → очки → сжигание → урон льду в 8-соседстве → гравитация
  (список перемещений) → спавн из мешка (список спавнов с высотой падения) → −1 ход →
  проверка win/lose. Возвращает объект результата для анимации вью.
- **Бустеры** (заряды в модели): Hammer(c,r) — снос плитки без хода + гравитация/спавн;
  Shuffle() — перестановка букв по не-ледяным клеткам; Hint() — самое дорогое слово словаря,
  собираемое из букв поля (жадно по номиналам, без кластерного члена); Joker(c,r) — буква→«?»,
  номинал 0, матчится с любой буквой; Doubler(c,r) — номинал ×2.
- Словарь: `WordDict` — массив русских существительных (3–8 букв) в том же файле; матчинг
  с джокерами посимвольно.
- RNG: свой LCG с сидом (`WORDFALL_SEED` из глобала, если задан — для тестов).

## Вью-контроллер (WordFallGame)

- `OnStart`: `WordFall_instance = this` (доступ из тестов), поиск виджетов, `onClick` на
  56 плиток/кнопки/бустеры, `NewGame`, полный `SyncAll()`.
- `Update(dt)`: анимация падения (экспоненциальное затухание визуального офсета к 0 через
  `GetLayout().SetOffsetMin/Max`), таймер «+N», сброс подсветки подсказки.
- Режим прицела бустера (молоток/джокер/удвоитель): клик по бустеру → `ModeLabel` текст,
  следующий клик по плитке применяет.
- Debug API для тестов: `DebugSetTile(c, r, letter)`, `DebugState()`.

## Тесты

- **GameTests/WordFallModelTests.cpp** — headless: `o2Scripts.Run(WordFallGame.js)` +
  `Eval` над `WordModel`: мешок и пропорции, выбор/отмена, валидация с джокером, кластерный
  множитель, подсчёт очков, гравитация и спавн, лёд, все 5 бустеров, победа/поражение.
- **GameUITests/WordFallUITests.cpp** — реальное окно: сцена через
  `WordFallBootstrap::CreateBootstrapActor()`, фиксированный сид + `DebugSetTile`,
  клики `AppTestDriver::Click` по координатам плиток, проверка модели через `Eval`,
  скриншоты в `Work/ScreenShots/`.

## Ассеты

`Assets/WordFall/Sprites/` — подготовленные PNG (трим альфы + ресайз из `Work/Art/`):
tile.png 128², tile_selected.png 128², ice.png 128², booster_*.png 128², button_orange.png
(sliced), panel_cream.png (sliced), popup_panel.png, background.png 1280×800, star.png,
white.png. Шрифт — общий `Assets/debugFont.ttf` (кириллица покрыта).
`Assets/Scripts/WordFallGame.js` — скрипт игры. Ассеты собираются таргетом BuildAssets.
