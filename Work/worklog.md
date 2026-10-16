# Worklog — Potato Troll Obby

## 2026-10-14

- Новая игра в отдельном рабочем дереве `gamesTemplate3` (ветка `games/potato_obby/main` от `main`),
  чтобы не трогать незакоммиченный WordFall в `gamesTemplate`.
- Подмодуль `o2` на коммите `main` (86840d9), вложенные подмодули инициализированы рекурсивно
  (первая конфигурация упала: tracy/boost не были выкачаны).
- Решение по архитектуре: в этой версии движка JS не видит клавиатуру (`Input` без `@SCRIPTABLE`),
  не создаёт акторы и не читает файлы — ядро игры (ввод, физика, загрузка уровней, HUD) на C++
  (`Sources/Game/Obby*.cpp`), уровни и настройки — JSON-ассет `Assets/PotatoObby/levels.json`
  (ASCII-карты), редактируемый без пересборки.
- Генерация арта через Gemini недоступна: оба ключа (из `api_key.txt` и присланный) отвечают
  402 «prepayment credits are depleted». Сделаны временные спрайты скриптом
  `Tools/PotatoObby/make_placeholder_art.py`; промпты и перегенерация с теми же именами/размерами —
  `Tools/PotatoObby/art_prompts.py`. Концепт-арт (`Work/Concepts/`) по той же причине не создан.
- Написаны `ObbyLevel` (модель), `ObbyWorld` (симуляция), `ObbyGameComponent` (сцена/вид/HUD/меню),
  `ObbySceneFactory`; 30 уровней в `Tools/PotatoObby/build_levels.py` → `levels.json`.
- Грабли движка этой версии: CodeTool ломается на `enum class X : char`; `DEFAULT_VALUE` для
  `String` нужно писать как `String("...")` прямо в инициализаторе поля; `Scene::FindActorByType`
  — заглушка (всегда `nullptr`); камера из `mmake<CameraActor>()` не регистрируется в сцене
  (виртуальный `OnAddToScene` из конструктора базового класса) — лечится прогоном через
  `DataDocument`; дочерние акторы с `NotInScene` через `AddChild` в сцену не попадают — создавать
  в режиме по умолчанию; кадры `AppTestDriver::PumpFrames` почти не двигают игровое время —
  в UI-тестах ждать `Wait(sec)`.
- Исправления по тестам: автопилот прыгал на 2 клетки раньше края; спавн теперь ставит героя
  ногами на землю; после смерти/телепорта заморозка 0.5 с.
- Камера расширена до 1280×900: уровень 1280×720 в центре, HUD-полосы сверху и снизу, чтобы
  тач-кнопки и подсказка не перекрывали нижний ряд уровня; `GameInfo.json` windowSize 1280×900.
- Итог: `GameTests` 5/5 сьютов, `GameUITests` 4/4 (в т.ч. `ObbyGameUI` 10 тестов), скриншоты в
  `Work/ScreenShots/`, игра запускается из `Bin/Mac/Game`.
