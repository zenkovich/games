# Space Evolver: Galaxy Core — архитектура прототипа

## Общая схема

```
GameApplication (C++)
 ├─ окно 540×960, RegisterGameJsApi()          — мост C++ → JS
 └─ space_evolver::BuildBootstrapScene()       — сцена кодом + Save в Assets/Bootstrap.scn
      ├─ CameraActor (fitted 540×960, тёмная заливка)
      ├─ слои: Background → Game → FX → UI
      └─ Actor "Game" + ScriptableComponent(Scripts/SpaceEvolver.js)

SpaceEvolver.js (корневой JS-компонент)
 ├─ Bridge.RunScript(...) грузит модули: SE_Core, SE_Configs, SE_Meta, SE_Fx, SE_Tutorial,
 │                                       SE_Run, SE_Hangar
 ├─ SE.game = new SE.Game(rootActor)  — конечный автомат экранов
 └─ Update(dt) → SE.game.Update(dt)

SE.Game (state machine)
 ├─ "hangar"  → SE.Hangar  (мета: прокачка, флот, экипировка+merge, START RUN)
 ├─ "run"     → SE.Run     (полёт: корабль, оружие, враги, ворота, орбы, босс, HUD)
 └─ "result"  → оверлей победы/поражения → назад в ангар
```

## C++ мост (`Sources/Game/SpaceEvolver/GameJsBridge.*`)

JS-биндинги движка не покрывают Input/Scene/Assets/UIManager, поэтому мост кладёт в глобал
объект `Bridge` с функциями:

| Функция | Что делает |
|---|---|
| `GetCursorPos()` → {x,y} | позиция курсора (мир = экран, центр (0,0), y вверх) |
| `IsCursorDown()`, `IsCursorPressed()` | состояние тача/кнопки |
| `GetScreenSize()` → {x,y} | размер окна |
| `LoadConfig(name)` → string | содержимое `Assets/Configs/<name>` |
| `LoadPersistent()` / `SavePersistent(str)` | профиль в `space_evolver_save.json` (рабочая папка) |
| `GetTimeSec()` → number | epoch-секунды (offline income) |
| `CreateButton(caption, height)` / `CreateLabel(text, height)` | виджеты, собранные из `WidgetLayer` + `Text` на `debugFont.ttf` (null в headless) |
| `Log(str)` | лог движка |
| `RunScript(name)` | выполнить `Assets/Scripts/<name>` (загрузка модулей игры) |

Всё остальное JS делает через штатные биндинги: `new o2.Actor(0)` (обязательно InScene — актор,
созданный `NotInScene`, после `AddChild` остаётся вне сцены и не рисуется), `AddComponent(new
o2.ImageComponent())`, `img.LoadFromImage(path)`, `actor.GetTransform().SetPosition2D(...)`,
`widget.GetLayout().SetOffsetMin(...)`, `actor.SetDrawingDepth(d)` (глубина — свойство актора,
не компонента), `SetLayer(name)`, `btn.onClick = fn`.

В движок добавлены два атрибута `@SCRIPTABLE`: `Widget::SetTransparency/GetTransparency`
(затухание всплывающих цифр урона) и `Button::SetCaption/GetCaption` (цены в ангаре).

## Headless-режим

`SE.headless = o2.Integration.IsHeadless()`. Вся логика (сущности, коллизии, xp, волны,
мета) отделена от представления: view-объекты (спрайты, виджеты, попапы) создаются только
при `!SE.headless`. Это позволяет в GameTests гонять полную симуляцию забега без рендера.

## Модель забега (SE_Run)

Сущности — плоские JS-объекты в массивах: `bullets, enemyBullets, rockets, enemies, gates,
orbs, popups`. У каждого `{x, y, vx, vy, hp, ..., actor?}`; позиция пишется в actor.transform
только при наличии view. Коллизии — окружности (dist² < (r1+r2)²).

- **Player**: следует за курсором с офсетом +120px по Y (lerp), автострельба по таблице
  `weapon_evolution.json`; урон = base × shipMult × equipMult × gateBuffs × evoMult.
- **Cannon evo 1–4**: single/double/fan/laser. Laser — DPS-луч (спрайт растягивается до верха).
- **Rockets evo 1–2**: самонаведение на ближайшего врага; уровень 2 — залп 3 шт + сплэш.
- **XP**: орбы с магнитом; `orbsToLevel = base × growth^level`; чётный уровень качает пушку,
  нечётный — ракеты.
- **Gates**: статические (бафф) и мишени (HP, синусоида, дроп орбов с импульсом).
- **Waves**: по `levels_and_waves.json`; после волн — босс (движение по X, веерные залпы).
  После победы забег может продолжаться заново с HP×loopHpScale.
- **Elite HP плашка**: враг с `hp ≥ eliteHpFactor × player DPS` получает HP-текст.
- **Damage popups**: всплывающие цифры (Label), затухают и поднимаются.

## Эффекты и обучение

- **SE_Fx.js** — пул короткоживущих эффектов: `Flash`, `Burst`, `FloatingText`. Каждый элемент
  сам гаснет по таймеру (позиция, масштаб, альфа); в headless вью не создаются, но записи
  остаются, поэтому «эффект сыгран» проверяется тестами без рендера.
- **SE_Tutorial.js** — четыре шага первого забега. Шаг описан тройкой `Provide` / `NeedsProvide` /
  `IsComplete`: он выдаёт нужный объект, выдаёт его заново, если игрок промахнулся, и ждёт
  реального действия. Пока обучение идёт, `UpdateWaves` и авто-спавн ворот в `UpdateGates`
  придержаны. Завершение пишется в профиль (`tutorialDone`).

## Мета (SE_Meta + SE_Hangar)

Профиль: `{coins, upgrades{}, multipliers{}, ships{unlocked, blueprints}, selectedShip,
equipment{inventory[], equipped{}}, lastSeenTs}`. Сохранение — JSON строкой через Bridge.

- Стоимость апгрейда: `ceil(baseCost × costMult^level)`.
- Merge: 3 одинаковых (slot+rarity) → 1 следующей редкости.
- Бонусы экипировки: `bonusPct` редкости на стат слота; Epic/Legendary — перки (крит/отражение).
- Offline income: `min(elapsed, 8h) × level` монет при входе в ангар.

## Тесты

- **GameTests** (headless): конфиги парсятся; формулы меты (стоимость, покупка, merge, offline);
  полная симуляция забега без рендера (спавн волн, убийства, xp-эволюция, босс, победа/поражение).
  Через `o2Scripts.Eval` + реальный Bridge (конфиги читаются с диска).
- **GameUITests** (рендер): скриншоты ангара и забега, drag корабля курсором с проверкой офсета,
  клик START RUN, чит-хуки `SE.game.Cheat*` для форсирования босса/победы/поражения.
