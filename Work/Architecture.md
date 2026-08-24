# Архитектура — Sahur's Brain Farm

## Слои и координаты

- Мир 3D, Z-up, **100 юнитов = 1 м** (конвенция движка: демо-сцены, физика, 3D-навигация
  редактора; `kUnitsPerMeter` в bootstrap, `BF.M` в JS). Персонажи ~180 юнитов.
  Статические OBJ запечены в юнитах; GLB-персонажи (нативные метры) масштабируются
  на Visual-акторе: фермер ×100, зомби ×25.
- Слой "3D": перспективная `CameraActor` (fov 45°, DeferredPipeline с ShadowMapPass),
  солнце `LightComponent` (directional), земля `MeshPrimitiveComponent` Plane, статика
  `Mesh3DComponent` (.obj), персонажи `SkinnedMeshComponent` (.glb).
- Слой "2D": UI-камера `SetFittedSize(540x960)` — HUD (деньги, джойстик, ценники зон).
- Модели glTF Y-up: у каждого персонажа дочерний актор "Visual" с поворотом X+90°
  (и подгонкой яв-разворота); статика запечена в Z-up при конвертации в OBJ.

## Разделение C++ / JS

**C++ (`Sources/Game/BrainFarm/`)**
- `BrainFarmBootstrap` — сборка всей сцены кодом (API движка), сохранение
  `Assets/Bootstrap.scn` для редактора. Игровой актор "Game" несёт
  `ScriptableComponent` → `Scripts/BrainFarm.js`.
- `GameJsBridge` — глобальный JS-объект `Bridge`:
  ввод (курсоры, мультитач), экран, `RunScript` (модули), `Log`,
  `PlayAnim(actor, clip, looped, speed)` — переключение клипа SkinnedMeshComponent,
  `SpawnZombie()` / `SpawnBrain()` — клоны шаблонов из бутстрапа,
  `WorldToScreen(worldPos)` — проекция 3D-точки в координаты UI-слоя,
  `CreateLabel/CreateButton` — стилизованные виджеты (ui_style в проекте нет).

**JS (`Assets/Scripts/`)** — вся игровая логика:
- `BrainFarm.js` — корневой компонент: загрузка модулей, создание игры, Update.
- `BF_Core.js` — неймспейс BF, константы, хелперы (акторы, спрайты, лейблы, math).
- `BF_Game.js` — состояние: деньги, конфиг, объекты, апдейт-луп.
- `BF_Player.js` — джойстик (плавающий, левая половина экрана), движение/поворот,
  анимации Idle/Run, стопка мозгов за спиной (визуальные слоты + плавное следование).
- `BF_Plantations.js` — грядки: рост мозгов (скейл 0→1), сбор в стопку по радиусу,
  залоченные грядки и зоны покупки (списание денег по кругу прогресса).
- `BF_Zombies.js` — спавн, очередь к прилавку, покупка (мозг с прилавка → зомби),
  уход и деспавн. Анимации Walk/Idle.
- `BF_Counter.js` — прилавок: перенос мозгов из стопки игрока (по радиусу),
  выкладка на прилавок, продажа зомби, полёт денег в HUD.
- `BF_Hud.js` — счётчик денег, ценники buy-зон (через Bridge.WorldToScreen).

## Иерархия сцены (bootstrap)

```
camera3d (3D)               — перспектива, следование за игроком (JS)
sun (3D)                    — направленный свет + тени
Location (3D)               — Ground, Fences, Pines, Stand(+Bat)
Plantations (3D)            — Plantation0..2: Dirt + 4 actor'а-мозга (споты)
BuyZones (3D)               — плоские диски-зоны покупки грядок 1..2
Player (3D)                 — Visual(SkinnedMesh Farmer) + Stack (слоты мозгов)
Zombies (3D)                — контейнер; ZombieTemplate (выключен) для клонов
ui camera (2D)
HUD (2D)                    — деньги, джойстик (создаётся из JS)
Game                        — ScriptableComponent(BrainFarm.js)
```

## Полёты предметов

Мозги (грядка→стопка, стопка→прилавок, прилавок→зомби) летят по квадратичной дуге
~0.35 c, твин в JS. Деньги — 2D-иконка из точки продажи (WorldToScreen) в плашку HUD.

## Тесты

- `GameTests` (headless): математика движения, рост/сбор, очередь зомби, экономика,
  зоны покупки — через `o2Scripts.Eval` к состоянию `BF.game`. Bootstrap в headless
  не назначает текстуры (TextureRef недоступен) — guard `Integration::IsHeadless()`.
- `GameUITests`: рендер сцены, скриншоты, драг джойстика через AppTestDriver,
  полный цикл: собрать мозги → продать зомби → купить грядку.
