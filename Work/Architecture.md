# Word Fall — архитектура (после рефакторинга)

Данные и отображение разделены: ядро игры — чистые C++ классы без знания о сцене;
поверх — сцена из виджетов с якорями, прототипы, JS-вьюхи на `ScriptableComponent`,
партикловые эффекты и анимации средствами движка.

## Слои

```
┌────────────────────────── JS (Assets/Scripts/WordFall/) ──────────────────────────┐
│ WordFallBoardView   WordFallWordPanelView   WordFallHudView    WordFallFxView    │
│ WordFallTasksView   WordFallBoostersView    WordFallPopupView                     │
│   тонкие вьюхи: клики, синк по ревизии, анимации перелёта/падения;                │
│   FxView — секвенсор хореографии начисления очков и эффектов пауэрапов            │
└──────────────────────────────┬────────────────────────────────────────────────────┘
                               │ actor.GetComponent("WordFallGameService") + SCRIPTABLE API
┌──────────────────────────────▼───────────────── C++ (Sources/Game/WordFall/) ─────┐
│ WordFallGameService (Component, нода GameService в сцене)                          │
│   конфиги кампании/поля — @SERIALIZABLE @EDITOR_PROPERTY, редактируются в редакторе│
│   фасад для JS: состояние, действия, ревизия, результат хода (ScriptValue)         │
│        │                                                                           │
│   Core/: WordBoard (поле/мешок/очки/гравитация/пауэрапы)                           │
│          WordLevel (задачи/ходы/заряды/win-lose)                                   │
│          WordDictionary (словарь, джокер-матчинг)                                  │
│          PlayerProgress (текущий уровень/рекорды, сохранение в JSON)               │
│          WordFallConfigs (LetterDef/TaskConfig/LevelConfig/BoardConfig)            │
└────────────────────────────────────────────────────────────────────────────────────┘
```

## C++ файлы

- `Core/WordFallConfigs.{h,cpp}` — сериализуемые конфиги: буквы мешка (номинал,
  количество), задачи (`Word`/`Length`/`Powerup`/`ClearIce`/`AnyWords`/`WordScore`),
  уровни (цель, ходы, лёд, заряды, задачи), конфиг поля (размеры, гласные,
  длины слов пауэрапов).
- `Core/WordFallLevels.{h,cpp}` — процедурная цепочка уровней: конфиг детерминированно
  строится по индексу (рампа цели/ходов/льда, набор задач из пула, слова заданий из
  частых букв; с задачей clearIce льда не больше 6, подсказок 30).
- `Core/WordDictionary.{h,cpp}` — ~23 500 русских существительных (встроены),
  `Contains(pattern)` с '?', индекс по длине. Кириллица внутри ядра — `WString`.
- `Core/WordBoard.{h,cpp}` — сетка `WordTile`, мешок с анти-клином (у каждой буквы
  гласная в 8-соседстве), свободный выбор с отсечением хвоста, очки
  base×длина×кластер(8-соседство), пауэрапы (бомба 3×3 / ракета крестом / палочка
  по букве), лёд, гравитация+спавн, сид слова задания разбросом по случайным
  клеткам, детерминированный LCG. Примитивы страховки выполнимости
  (CanAssembleWord/AnyWordExists/PlantMissingLetters/FindBestWord с быстрым
  отсевом по счётчикам букв). Возвращает `WordMoveResult` — всё для анимаций вью.
- `Core/WordLevel.{h,cpp}` — правила уровня: задачи с прогрессом (включая
  anyWords/wordScore), ходы, заряды бустеров, «очки — обязательное финальное
  условие» (`Won` при задачах И цели), страховка выполнимости после каждого
  изменения поля (несобираемые задания чинятся подсевом недостающих букв).
- `Core/PlayerProgress.{h,cpp}` — прогресс кампании, лучшие счета, Save/Load в JSON
  (путь — поле сервиса; на mobile путь может быть read-only — тогда прогресс не
  сохраняется, лог-предупреждение).
- `WordFallGameService.{h,cpp}` — сервисная нода: владеет ядром, редактируемые
  конфиги, SCRIPTABLE-фасад (~30 методов), ревизия состояния (`GetRevision`) для
  pull-синка вьюх, `GetLastMove`. Прямой доступ к ядру для C++ тестов.
- `WordFallVfx.{h,cpp}` — компонент эффектов: пул burst-эмиттеров
  (`ParticlesEmitterComponent` + `SingleSpriteParticleSource` c vfx_spark.png):
  `PlayBurn/PlayExplosion/PlayWin` — SCRIPTABLE, зовутся из JS.
- Полёт по сплайну — движковый `o2::FlightTrajectoryComponent` (перенесён в o2
  вместе с вьювером-SplineTool и тестами; см. o2 Docs, components.md).
- `WordFallUiFactory.{h,cpp}` — фабрика UI: виджеты с якорями `WidgetLayout`,
  кнопки со стейтом вдавливания (мультитрек `AnimationClip`: сдвиг offsets + тёмный
  оверлей), билдеры прототипов (плитка/слот слова/бустер).
- `WordFallBootstrap.{h,cpp}` — точка входа: строит экран, вешает вьюхи, инжектит
  зависимости (`serviceActor`, `vfxActor`) в JS-инстансы через
  `ScriptableComponent::GetInstance().SetProperty`.

## Сцена (bootstrap-сцена `Assets/WordFall.scn`)

Сцена хранит два актора: `Bootstrap` и `GameService` (сервисная нода с конфигами —
видна и редактируется в редакторе). Регенерируется headless-тестом
`WordFallBridge.BootstrapSceneRegenerates`. Редактор открывает эту же сцену — игра
работает при старте из редактора; `GameApplication` грузит её же.

Экран геймплея — **прототип** `Assets/WordFall/Prototypes/GameScreen.proto`
(корень WordFall: BG, Screen со всеми секциями и вьюхами, Vfx). Bootstrap на старте
инстанцирует его на сцену и инжектит `serviceActor`/`vfxActor` в инстансы вьюх;
если ассета ещё нет (свежий чекаут) — собирает экран кодом и сохраняет прототип
(desktop). Весь интерфейс, параметры вьюх (геометрия сетки букв, строки задач,
скорости анимаций) и конфиги сервиса редактируются в редакторе: интерфейс — в
прототипе, конфиги — в сцене.

Игра портретная: логический экран 768×1376 (совпадает с концептом
`ArtSrc/concept.png`), fitted-камера. На десктопе окно может быть ужато системой —
картинка масштабируется камерой, ввод конвертируется через слой листенеров
(тесты кликают в оконных координатах: мировые × min(окно/камера)).

Иерархия прототипа. Якоря адаптивные: полосы (Hud/Tasks/WordBar/Boosters)
растянуты по ширине к краям экрана, боксы внутри привязаны к своим краям
(уровень — влево, ходы — вправо, кнопки слова — вправо, лоток тянется), поле —
фиксированная сетка по центру, Fx/Popup растянуты на весь экран:

```
WordFall
├─ BG                       фон 768×1376 (слой BG)
├─ Screen (Widget 768×1376) якорная база
│  ├─ Hud        (0.5,1)    LevelBox+LevelLabel, ScorePanel(выемка)+BarFill+ScoreLabel,
│  │                        MovesBox+MovesLabel, подписи   → WordFallHudView.js
│  ├─ Tasks      (0.5,1)    панель с тёмной шапкой, Task0..4 в 2 колонки
│  │                                                       → WordFallTasksView.js
│  ├─ WordBar    (0.5,1)    лоток Tray слева, Slot0..7 (прототип WordSlot),
│  │                        GainLabel, AcceptBtn(✓), ClearBtn(✗)
│  │                                                       → WordFallWordPanelView.js
│  ├─ Flyer0..3             летящие буквы (прототип WordSlot, экранные координаты)
│  ├─ Board      (0.5,0.5)  центр (0,-170): подложка + Tile_c_r ×56 (клетка 88,
│  │                        плитка 84), глубина по рядам   → WordFallBoardView.js
│  ├─ Boosters   (0.5,0)    Booster0..4 (прототип Booster: Btn+Badge+Charge),
│  │                        ModeLabel                      → WordFallBoostersView.js
│  ├─ Fx                    пулы хореографии: FxScore0..7+FxGlow0..7, FxTotal,
│  │                        FxFlash0..9, FxStar0..9, FxBeamH/V → WordFallFxView.js
│  └─ Popup                 Content (Dim/Panel/Title/ScoreLine/RestartBtn),
│                           выключаемый отдельно           → WordFallPopupView.js
├─ Vfx + WordFallVfx        пул партикл-эмиттеров (Burn×10, Explosion, Win)
└─ GameService + WordFallGameService
```

## Библиотека прототипов

`Assets/WordFall/Prototypes/` — экран собран из прототипов, каждый редактируется
отдельно, все инстансы связаны прототип-линками (правка прототипа обновляет
инстансы):

- `Tile.proto` — плашка буквы поля (слои back/sel/ice/letter/points/пауэрапы);
- `WordSlot.proto` — плашка буквы в лотке ввода (и флаеры перелёта);
- `Booster.proto` — кнопка бустера (Btn + Badge + Charge);
- `IconButton.proto` — кнопка-иконка (принять/сброс; спрайт меняется на инстансе);
- `PillButton.proto` — пилюля с капшеном (кнопка попапа);
- `TaskRow.proto` — строка задания (Text);
- `FxFlash/FxStar/FxGlow/FxBeam.proto` — виджеты эффектов хореографии очков;
- `FxFlyingLetter.proto` — летящая в прогресс-бар плашка: o2::FlightTrajectoryComponent +
  AnimationComponent (стейт «flight» из ассета `FxFlyingLetterFlight.anim`:
  позиция траектории, скейл, крен, растворение плашки в звезду (слои
  back/letter/points ↘, слой star ↗, гаснет после влёта), саб-треки искрового
  следа Sparks и пучка Burst на прилёте); JS ставит флаер на место слота
  (`SetPoints`+`SetPosition(0)`) в кадр принятия и заводит `RewindAndPlay("flight")`
  по стаггеру; цель — кончик заливки бара (HudView.BarTipWorldX);
- `GameScreen.proto` — весь экран: секции с вьюхами и инстансы частей (диффы).

Билдеры фабрики — генератор первоначального содержимого: `InstantiatePart`
инстанцирует ассет, а при его отсутствии (свежий чекаут) собирает билдером и
сохраняет (desktop). У кнопок стейт вдавливания живёт на внутренней кнопке в
full-stretch лэйауте — инстансы позиционируются любыми якорями; глубина
отрисовки внутренней кнопки задаётся явно (наследуемая глубина в повторно
включаемом поддереве сортируется непредсказуемо — кнопка попапа пряталась под
панель). Старое ограничение движка («повторный клон Widget-актора из ActorAsset
даёт пустые инстансы») починено в o2: клон перепривязывает слой сцены по имени.
Покрыто тестами `GameUITests/WordFallProto`.

## Поток данных

- **Вниз (команды)**: вьюха → SCRIPTABLE-метод сервиса (`ToggleSelect`, `AcceptWord`,
  `UseHammer`...). Результат хода (`WordMoveResult` → ScriptValue) сразу возвращается
  инициатору для запуска анимаций (падение, VFX, «+N»).
- **Вверх (состояние)**: сервис инкрементит ревизию при каждой мутации; каждая вьюха
  в `Update` сравнивает `GetRevision()` и синкает свой участок. Попап полностью
  ревизионный: видит `won/lost` — показывается, `playing` — прячется.
- **Между вьюхами**: реестр `WordFallViews` (board/wordPanel/boosters/popup/...) —
  прямые вызовы: board → wordPanel.OnLetterPicked (перелёт буквы), board ↔ boosters
  (режим прицела).

## Тесты

- `GameTests/WordFallCoreTests.cpp` — 32 headless-теста ядра напрямую (без сцены):
  словарь, мешок, выбор, очки/кластеры, гравитация, лёд, бустеры, пауэрапы, задачи,
  сид, кампания, сейв/лоад прогресса.
- `GameTests/WordFallBridgeTests.cpp` — мост JS↔C++ (GetComponent + SCRIPTABLE +
  ScriptValue-результаты) и регенерация bootstrap-сцены.
- `GameUITests/WordFallUITests.cpp` — 10 тестов с реальным окном: сборка сцены,
  клики по плиткам/кнопкам/бустерам, слоты и перелёт, победа+переход уровня с
  сохранением прогресса, бомба-пауэрап, вдавливание кнопки, загрузка сцены из
  ассета (путь реального приложения). Скриншоты в `Work/ScreenShots/`.

## Ассеты

`Assets/WordFall/Sprites/` — арт из авторской нарезки `ArtSrc/composer-layers/`
(источник — концепт `ArtSrc/concept.png` 768×1376): слои механически чистятся от
шума нарезки, кропятся и приводятся к рендер-размерам скриптом
`Work/Art/process_concept.py` (панель поля собирается в 9-slice 128×128 со
слайсом 48). Недостающее (кнопка x2, выделенная плитка, бейдж) догенерировано
Gemini-утилитой по референсам слоёв. Шрифты — M PLUS Rounded 1c (OFL, кириллица):
`game_font.ttf` (ExtraBold, текст) и `game_font_heavy.ttf` (Black — заголовки,
цифры, буквы плиток), сабсет латиница+кириллица ~58KB каждый; стиль выбирается
параметром `heavy` фабрики. `vfx_spark.png` — частица (размер частицы в движке —
множитель спрайта). `Assets/Scripts/WordFall/*.js` — вьюхи (классы присваиванием
в глобал — ScriptableComponent ищет own property по имени файла). Публичные поля
вьюх (скорости анимаций, геометрия лотка) — сериализуются и редактируются в
редакторе, как и все конфиги сервиса.
