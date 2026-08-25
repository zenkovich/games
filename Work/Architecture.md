# Color Town — архитектура прототипа

## Слои

```
Assets/Bootstrap.scn ── актор "Game"
   ├─ ScriptableComponent (Scripts/GameModel.js)   ← правила игры, состояние (JS)
   └─ ColorTownGame (C++)                           ← сборка мира, навигация, HUD, тосты, сейв
        └─ World (создаётся в OnStart)
             ├─ Camera (CameraActor, fitted 1080×1920)
             ├─ Screens/ City | Glass | Workshop | Character | Date   (по одному root-актору)
             ├─ HudRoot/UI/Hud + Toast
             └─ Windows/ Warehouse | Build                            (оверлеи с затемнением)
```

- **Логика (JS, `Assets/Scripts/GameModel.js`)** — единственное место с правилами: склад и Overflow
  Conversion, добыча с множителями уровня/Affinity, заказы и таймеры крафта, продажа с множителем
  населения, стройка (слоты, стоимость, таймеры, красота), Affinity (подарки со штрафом за
  повторы, свидания, сюжетные реплики, баффы), XP/уровень города, JSON-сейв. Публичный API —
  методы, возвращающие числа/строки/массивы строк, чтобы C++-обёртке хватало простых конвертеров.
  Состояние хранится в приватном `_s` (не сериализуется в сцену) — при правке констант JS сцена
  не «переопределяет» их.
- **Отображение (C++)** — `Screens/*` строят виджеты движка (`Button`, `Label`, `Image`, `Widget`),
  читают модель через `Core/GameModel` (`Call<T>(method, args...)`) и по тапу вызывают её методы,
  после чего `ColorTownGame::RefreshAll()`.
- **Core-геймплей (C++)** — `Core/GlassField` (физическая чаша: статичный `RigidBody` +
  `SplineCollider`-петля, спавн шариков сверху, поиск группы одного цвета по соседству, лопание)
  и `Core/ResourceBall` (`RigidBody` + `CircleCollider` + `ImageComponent` + слушатель курсора).
  Экран стакана пересоздаёт поле при каждом показе с цветами и лимитом из модели.

## Почему правила на JS, а экраны на C++

Скриптовые биндинги движка покрывают акторы/виджеты/лейблы, но не сцену, ввод, ассеты и создание
виджетов. Поэтому JS отдан «чистой» логике (тестируется headless через `o2Scripts`), а всё, что
требует движка — C++. Расширять биндинги без согласования владельца не стал.

## Поток данных

1. Тап по шарику → `ResourceBall::OnCursorReleased` → `GlassField::PopGroup` →
   `onGroupPopped(type, count)` → `GlassScreen` → `model.Harvest(building, type, count)` →
   склад (+ overflow → монеты/XP) → `RefreshAll()`.
2. Мастерская: `StartCraft(good)` списывает сырьё, таймер тикает в `GameModel.Update(dt)` (его вызывает
   `ScriptableComponent` каждый кадр), готовый товар кладётся на склад и пушит уведомление, которое
   `ColorTownGame::OnUpdate` показывает тостом.
3. Стройка: `Build(slot, id)` → `constructions[]` → по таймеру `slots[slot] = id` → население/красота
   считаются из слотов при каждом запросе.
4. Свидание: `Date(npc, spot, gift)` списывает премиум-товар, даёт очки и возвращает реплики →
   `DateScreen`.

## Headless и рендер

Все построители UI пропускают картинки/шрифты без `Render` (лейблы = null, кнопки без слоёв), поэтому
`GameTests` прогоняют полный флоу экранов без окна, а `GameUITests` кликают по реальным кнопкам через
`AppTestDriver` и снимают скриншоты.

## Тесты

- `GameTests/GameModelTest` — правила JS-модели (13 кейсов).
- `GameTests/GlassFieldTest` — спавн, группы, лопание, падение под физикой.
- `GameTests/ColorTownFlow` — навигация экранов, окна, подарки/свидания headless.
- `GameTests/BootstrapScene` — сборка/сохранение/загрузка Bootstrap.scn (так же сгенерирован
  файл в `Assets/`).
- `GameUITests/ColorTownUI` — рендер: город → стакан (тап по шарику) → мастерская → склад →
  персонажи → свидание, скриншоты в `Work/ScreenShots/`.
