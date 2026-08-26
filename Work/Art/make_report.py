#!/usr/bin/env python3
"""Builds Work/Report.html — the self-contained work report with embedded screenshots."""
import base64
import io
import os
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SHOTS = os.path.join(ROOT, "Work", "ScreenShots")
CONCEPTS = os.path.join(ROOT, "Work", "Concepts")
OUT = os.path.join(ROOT, "Work", "Report.html")


def data_uri(path, max_width=None):
    img = Image.open(path).convert("RGB")
    if max_width and img.width > max_width:
        img = img.resize((max_width, int(img.height * max_width / img.width)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=82, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


SHOT_LIST = [
    ("01_board.png", "Старт раунда", "Поле 5×5, таймер 60, подсказка в пилюле."),
    ("02_drag_incomplete.png", "Линия не готова", "3 + −2: плитки увеличены, белая обводка и линия, статус SUM: +1."),
    ("03_drag_ready.png", "READY", "Третья плитка довела сумму до нуля — всё зелёное."),
    ("04_removal_flash.png", "Вспышка", "После отпускания: плитки растут, «+60», счётчик догоняет."),
    ("05_falling.png", "Падение", "Выжившие плитки падают, новые влетают сверху с фейдом."),
    ("06_refilled.png", "Поле заполнено", "Снова 5×5, счёт 60, таймер идёт."),
    ("07_game_over.png", "Game Over", "Итог, NEW BEST!, кнопка PLAY AGAIN поверх затемнения."),
    ("08_restarted.png", "После PLAY AGAIN", "Новое поле, счёт 0, таймер 60, лучший счёт сохранён."),
]

MOCKUPS = [
    ("mockup_gameplay.png", "Мокап: READY"),
    ("mockup_gameplay_incomplete.png", "Мокап: сумма ≠ 0"),
    ("mockup_gameover.png", "Мокап: Game Over"),
]


def gallery(items, folder, max_width):
    parts = []
    for entry in items:
        name, title = entry[0], entry[1]
        caption = entry[2] if len(entry) > 2 else ""
        src = data_uri(os.path.join(folder, name), max_width)
        parts.append(
            f'<figure class="shot"><img src="{src}" alt="{title}" loading="lazy">'
            f'<figcaption><b>{title}</b>{(" — " + caption) if caption else ""}</figcaption></figure>'
        )
    return "\n".join(parts)


TEMPLATE = r"""<title>Zero Line Prototype Report</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Source+Sans+3:ital,wght@0,400;0,600;1,400&family=JetBrains+Mono:wght@400;600&display=swap">
<style>
:root {
  --ground: #F3F4FA;
  --paper: #FFFFFF;
  --ink: #1B1F3A;
  --ink-2: #4A5077;
  --muted: #7B819F;
  --line: #D9DCEC;
  --coral: #F0603F;
  --sky: #3A8CE6;
  --gold: #E0A526;
  --green: #22A35C;
  --chip: #E9ECF7;
  --code-bg: #ECEEF8;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --ground: #14172B;
    --paper: #1D2140;
    --ink: #EEF0FA;
    --ink-2: #C5C9E3;
    --muted: #8D93B8;
    --line: #2F3560;
    --coral: #FF7A59;
    --sky: #5FAAFF;
    --gold: #FFC94D;
    --green: #46E08A;
    --chip: #262B52;
    --code-bg: #12152A;
  }
}
:root[data-theme="dark"] {
  --ground: #14172B;
  --paper: #1D2140;
  --ink: #EEF0FA;
  --ink-2: #C5C9E3;
  --muted: #8D93B8;
  --line: #2F3560;
  --coral: #FF7A59;
  --sky: #5FAAFF;
  --gold: #FFC94D;
  --green: #46E08A;
  --chip: #262B52;
  --code-bg: #12152A;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--ground);
  color: var(--ink);
  font-family: "Source Sans 3", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 17px;
  line-height: 1.55;
}
h1, h2, h3 { font-family: "Nunito", "Segoe UI", Roboto, Helvetica, Arial, sans-serif; text-wrap: balance; margin: 0; }
h1 { font-size: clamp(2.2rem, 5vw, 3.4rem); font-weight: 900; letter-spacing: -0.02em; line-height: 1.05; }
h2 { font-size: 1.6rem; font-weight: 800; margin-bottom: 0.6rem; }
h3 { font-size: 1.1rem; font-weight: 800; }
p { margin: 0 0 1rem; }
code, pre { font-family: "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace; font-size: 0.86em; }
code { background: var(--code-bg); padding: 0.1em 0.35em; border-radius: 4px; }
pre { background: var(--code-bg); padding: 0.9rem 1.1rem; border-radius: 10px; overflow-x: auto; line-height: 1.5; }
pre code { background: none; padding: 0; }
a { color: var(--sky); }
.wrap { max-width: 72ch; margin: 0 auto; padding: 3rem 1.25rem 5rem; }
.wide { max-width: 1100px; margin: 0 auto; padding: 0 1.25rem; }
.eyebrow { font-family: "Nunito", sans-serif; font-weight: 800; font-size: 0.78rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); }
header { display: grid; gap: 0.9rem; margin-bottom: 2.5rem; }
header .lede { font-size: 1.2rem; color: var(--ink-2); max-width: 60ch; }
.tiles { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.4rem; }
.tile { font-family: "Nunito", sans-serif; font-weight: 900; font-size: 1.5rem; width: 3rem; height: 3rem; border-radius: 0.75rem; display: grid; place-items: center; color: #fff; box-shadow: inset 0 -4px 0 rgba(0,0,0,0.18); }
.tile.pos { background: var(--coral); }
.tile.neg { background: var(--sky); }
.tile.zero { background: var(--gold); }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.75rem; margin: 0 0 2.5rem; }
.stat { background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 0.9rem 1rem; }
.stat b { display: block; font-family: "Nunito", sans-serif; font-size: 1.9rem; font-weight: 900; font-variant-numeric: tabular-nums; line-height: 1.1; }
.stat span { color: var(--muted); font-size: 0.9rem; }
section { margin-bottom: 3rem; }
ol.steps { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.9rem; counter-reset: step; }
ol.steps li { display: grid; grid-template-columns: 2.4rem 1fr; gap: 0.8rem; counter-increment: step; }
ol.steps li::before { content: counter(step); font-family: "Nunito", sans-serif; font-weight: 900; font-size: 1.1rem; color: #fff; background: var(--ink-2); width: 2.1rem; height: 2.1rem; border-radius: 0.6rem; display: grid; place-items: center; }
ol.steps li b { display: block; font-family: "Nunito", sans-serif; font-weight: 800; }
ol.steps li p { margin: 0.2rem 0 0; color: var(--ink-2); }
table { width: 100%; border-collapse: collapse; font-size: 0.95rem; }
th, td { text-align: left; padding: 0.55rem 0.6rem; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-family: "Nunito", sans-serif; font-size: 0.78rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
.table-wrap { overflow-x: auto; background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 0.3rem 0.6rem; }
.ok { display: inline-block; font-family: "Nunito", sans-serif; font-weight: 800; font-size: 0.78rem; letter-spacing: 0.06em; color: var(--green); background: var(--chip); border-radius: 999px; padding: 0.1rem 0.6rem; white-space: nowrap; }
.warn { display: inline-block; font-family: "Nunito", sans-serif; font-weight: 800; font-size: 0.78rem; letter-spacing: 0.06em; color: var(--gold); background: var(--chip); border-radius: 999px; padding: 0.1rem 0.6rem; white-space: nowrap; }
.ledger { display: grid; gap: 0.9rem; }
.issue { background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 1rem 1.1rem; display: grid; gap: 0.35rem; }
.issue h3 { color: var(--coral); }
.issue p { margin: 0; color: var(--ink-2); }
.issue p b { color: var(--ink); }
.gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem; margin: 1rem 0 0; }
.shot { margin: 0; background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 0.6rem; }
.shot img { width: 100%; height: auto; border-radius: 8px; display: block; }
.shot figcaption { font-size: 0.88rem; color: var(--ink-2); margin-top: 0.5rem; line-height: 1.4; }
.shot figcaption b { color: var(--ink); }
ul { padding-left: 1.2rem; }
li { margin-bottom: 0.3rem; }
footer { color: var(--muted); font-size: 0.9rem; border-top: 1px solid var(--line); padding-top: 1rem; }
</style>

<div class="wrap">
<header>
  <div class="eyebrow">Прототип · движок o2 · 26 августа 2026</div>
  <h1>Zero Line</h1>
  <p class="lede">Головоломка на время: провести пальцем линию по соседним числам так, чтобы сумма стала нулём. Поле 5×5, раунд 60 секунд, только core loop — без дополнительных механик.</p>
  <div class="tiles" aria-hidden="true">
    <div class="tile pos">3</div><div class="tile neg">-2</div><div class="tile neg">-1</div><div class="tile zero">0</div><div class="tile pos">5</div>
  </div>
</header>

<div class="stats">
  <div class="stat"><b>26</b><span>тестов, все зелёные</span></div>
  <div class="stat"><b>7</b><span>JS-модулей логики и вьюх</span></div>
  <div class="stat"><b>3</b><span>C++ файла: мост, бутстрап, хост</span></div>
  <div class="stat"><b>11</b><span>процедурных спрайтов</span></div>
  <div class="stat"><b>8</b><span>скриншотов из UI-тестов</span></div>
</div>

<section>
  <h2>Что получилось</h2>
  <p>Игра собрана по правилам репозитория: bootstrap-сцена <code>Assets/Bootstrap.scn</code> с камерой и актором <code>Game</code>, вся логика на JavaScript через <code>ScriptableComponent</code>, тонкий C++-мост <code>Bridge</code> для ввода, виджетов и хранилища. Модель поля (<code>ZL.Board</code>) не знает о сцене и целиком проверяется headless; отображение только зеркалит её, поэтому ввод никогда не ждёт анимацию.</p>
  <ul>
    <li>Драг по 4-соседям, запрет повтора и диагоналей, откат назад по линии; путь между кадрами сэмплируется — быстрый свайп не перепрыгивает плитки.</li>
    <li>Во время драга видно выражение <code>3 + -2 + -1 = 0</code>, линию, обводку и статус <b>READY</b> / <b>SUM: +3</b>.</li>
    <li>Очки: сумма модулей × 10, +100 за каждый ноль; всплывающий «+N» и догоняющий счётчик.</li>
    <li>Генерация по заданным весам с балансом знаков и гарантией хотя бы одного хода после каждого спавна.</li>
    <li>Таймер 60 с, блокировка ввода, экран Game Over с лучшим счётом (файл на десктопе, <code>localStorage</code> в web-сборке) и PLAY AGAIN.</li>
  </ul>
</section>

<section>
  <h2>Этапы работы</h2>
  <ol class="steps">
    <li><div><b>Разведка</b><p>Шаблон на <code>main</code> чистый; прошлые прототипы в ветках <code>games/*</code>. Взят паттерн <code>sahur</code>: глобальный JS-объект <code>Bridge</code> из C++ + игра на JS. Папка <code>build/</code> была настроена под другую ветку — переконфигурирована.</p></div></li>
    <li><div><b>GDD и архитектура</b><p><code>Work/GDD.md</code> — правила, раскладка 540×960, генерация и анимации; <code>Work/Architecture.md</code> — слои, файлы, поток данных, тесты.</p></div></li>
    <li><div><b>Арт</b><p>Gemini <code>imagegen</code> вернул HTTP 429 (кредиты исчерпаны). Спрайты сгенерированы процедурно на PIL (<code>Work/Art/make_sprites.py</code>), мокапы экранов собраны в тех же координатах, что рантайм (<code>compose_mockup.py</code>) — раскладка проверена до запуска движка. Шрифт M PLUS Rounded 1c (OFL) из ветки <code>wordfall</code>.</p></div></li>
    <li><div><b>C++</b><p><code>GameJsBridge</code> (курсор, экран, <code>CreateLabel/Button/Tile</code>, <code>SaveText/LoadText</code>, <code>RunScript</code>), <code>ZeroLineBootstrap</code> (сцена кодом + сохранение), <code>ZeroLineHost</code> — компонент в сцене, регистрирующий мост, чтобы игра работала и из редактора. Примеры шаблона удалены.</p></div></li>
    <li><div><b>JavaScript</b><p><code>ZL_Board</code> (модель), <code>ZL_BoardView</code> (плитки, линия, анимации), <code>ZL_Hud</code>, <code>ZL_Popup</code>, <code>ZL_Game</code> (раунд, указатель, сейв), корень <code>ZeroLine.js</code>.</p></div></li>
    <li><div><b>Тесты</b><p>Headless: модель через <code>o2Scripts.Eval</code>, полный флоу игры на сцене, регенерация <code>Bootstrap.scn</code>. Рендер: <code>AppTestDriver</code> водит курсор по плиткам и снимает скриншоты каждой стадии.</p></div></li>
    <li><div><b>Доводка по скриншотам</b><p>Три визуальных дефекта и один флейк найдены и исправлены (см. ниже). Финальный <code>ctest --parallel 4</code> — зелёный, <code>Bin/Mac/Game</code> стартует через собранную сцену без ошибок в логе.</p></div></li>
  </ol>
</section>

<section>
  <h2>Проверка сценариев из ТЗ</h2>
  <div class="table-wrap"><table>
    <thead><tr><th>Сценарий</th><th>Тест</th><th></th></tr></thead>
    <tbody>
      <tr><td>1 + −1 → удаление</td><td><code>ZeroLineBoard.OnePlusMinusOneRemoves</code></td><td><span class="ok">OK</span></td></tr>
      <tr><td>3 + −2 + −1 → удаление</td><td><code>ZeroLineBoard.ThreeMinusTwoMinusOneRemoves</code>, UI <code>DragThroughAZeroSumLineRemovesTiles</code></td><td><span class="ok">OK</span></td></tr>
      <tr><td>5 + −3 → не удаляется</td><td><code>ZeroLineBoard.FiveMinusThreeStays</code>, <code>ZeroLineGame.ReleaseWithNonZeroSumKeepsTheBoard</code>, UI <code>DragWithNonZeroSumLeavesTheBoard</code></td><td><span class="ok">OK</span></td></tr>
      <tr><td>Тайл нельзя выбрать дважды</td><td><code>ZeroLineBoard.TileCannotBeSelectedTwice</code></td><td><span class="ok">OK</span></td></tr>
      <tr><td>Нельзя перейти по диагонали</td><td><code>ZeroLineBoard.DiagonalMoveIgnored</code>, <code>ZeroLineGame.FastSwipePicksUpSkippedTiles</code></td><td><span class="ok">OK</span></td></tr>
      <tr><td>Падение сверху и новые тайлы, поле снова 5×5</td><td><code>ZeroLineBoard.CollapseDropsColumnAndSpawnsOnTop</code>, <code>EveryBoardHasAMoveAndStaysFullThroughPlay</code></td><td><span class="ok">OK</span></td></tr>
      <tr><td>Очки = сумма модулей × 10 (+100 за 0)</td><td><code>ZeroLineBoard.ScoreIsSumOfAbsTimesTenPlusZeroBonus</code></td><td><span class="ok">OK</span></td></tr>
      <tr><td>Распределение чисел</td><td><code>ZeroLineBoard.GeneratorFollowsTheWeightedDistribution</code>, <code>SignsStayBalanced</code></td><td><span class="ok">OK</span></td></tr>
      <tr><td>Таймер заканчивается, ввод блокируется, линия отменяется</td><td><code>ZeroLineGame.TimerEndsTheRoundAndBlocksInput</code>, <code>TimeoutCancelsTheCurrentLine</code></td><td><span class="ok">OK</span></td></tr>
      <tr><td>PLAY AGAIN полностью сбрасывает игру</td><td><code>ZeroLineGame.PlayAgainResetsTheRound</code>, UI <code>TimeUpShowsGameOverAndPlayAgainRestarts</code></td><td><span class="ok">OK</span></td></tr>
      <tr><td>Лучший результат сохраняется между запусками</td><td><code>ZeroLineGame.BestScoreIsSavedAndLoaded</code></td><td><span class="ok">OK</span></td></tr>
      <tr><td>Показ суммы / READY во время драга</td><td><code>ZeroLineGame.DragBuildsTheLineAndCommitsOnRelease</code> + скриншоты 02/03</td><td><span class="ok">OK</span></td></tr>
      <tr><td>Мышь и палец одинаково</td><td>мост берёт любой нажатый курсор; на реальном тач-устройстве не проверялось</td><td><span class="warn">не проверено</span></td></tr>
    </tbody>
  </table></div>
</section>

<section>
  <h2>Сложности и решения</h2>
  <div class="ledger">
    <div class="issue"><h3>Генерация арта недоступна</h3><p><b>Проблема.</b> Все вызовы <code>imagegen</code> падали с HTTP 429 — у ключа Gemini кончились кредиты.</p><p><b>Решение.</b> Спрайты сделаны процедурно на PIL: для числовой головоломки это даже точнее (одинаковые скруглённые плитки, чёткое свечение). Мокапы экранов собираются из тех же спрайтов и служат концептами.</p></div>
    <div class="issue"><h3>Цифры пропали на отрицательных плитках</h3><p><b>Проблема.</b> <code>Widget::AddLayer</code> при depth=0 подставляет порядковый номер слоя: подложки <code>neg</code>/<code>zero</code> (2, 3) рисовались поверх текста (1).</p><p><b>Решение.</b> Явные глубины слоёв: подложки 1, текст 5.</p></div>
    <div class="issue"><h3>Выделение не увеличивало плитку</h3><p><b>Проблема.</b> <code>SetScale2D</code> на виджете ничего не даёт — <code>WidgetLayout</code> считает рект из якорей и не учитывает scale трансформа.</p><p><b>Решение.</b> Масштаб через размер ректа и высоту шрифта; пульс счётчика — через <code>Label::SetHeight</code>.</p></div>
    <div class="issue"><h3>Новые плитки висели над HUD</h3><p><b>Проблема.</b> Спавн ждал вспышку, стоя над полем и перекрывая пилюлю суммы.</p><p><b>Решение.</b> Старт на одну клетку выше верхнего ряда, прозрачность привязана к позиции — выше кромки поля плитка невидима.</p></div>
    <div class="issue"><h3>Флейк UI-теста под нагрузкой</h3><p><b>Проблема.</b> При <code>ctest --parallel 4</code> <code>Game.Update</code> клампит dt до 0.1 с, а <code>AppTestDriver::Wait</code> считает реальное время — анимация не успевала за <code>Wait(0.6)</code>.</p><p><b>Решение.</b> Ожидание по условию <code>WaitUntil("!view.IsAnimating()")</code> вместо фиксированного времени.</p></div>
    <div class="issue"><h3>Старый ninja после удаления файлов шаблона</h3><p><b>Проблема.</b> Инкрементальная сборка держала правила для удалённых <code>FoxModelTests.cpp</code> и др. и падала.</p><p><b>Решение.</b> Явный <code>cmake --preset mac</code> перед сборкой.</p></div>
  </div>
</section>
</div>

<div class="wide">
<section>
  <h2>Скриншоты из UI-тестов</h2>
  <p>Окно 450×800, камера подгоняет логический экран 540×960. Снимки делает <code>GameUITests/ZeroLineUI</code>.</p>
  <div class="gallery">
<!--SHOTS-->
  </div>
</section>
<section>
  <h2>Мокапы</h2>
  <p>Собраны <code>Work/Art/compose_mockup.py</code> из финальных спрайтов до первого запуска движка.</p>
  <div class="gallery">
<!--MOCKUPS-->
  </div>
</section>
</div>

<div class="wrap">
<section>
  <h2>Что не проверено</h2>
  <ul>
    <li><b>Web-сборка.</b> Ветка <code>localStorage</code> в мосте написана под <code>EM_JS</code>, но emsdk на машине нет — не компилировалась.</li>
    <li><b>Тач.</b> Мост берёт первый нажатый курсор (мышь или палец), проверено только мышью через <code>AppTestDriver</code>.</li>
    <li><b>Редактор.</b> Сцена грузится и запускает игру в headless-тесте; ручной запуск из редактора не делался.</li>
  </ul>
</section>

<section>
  <h2>Как запустить</h2>
<pre><code>cmake --preset mac
cmake --build --preset mac --target Game GameTests GameUITests -j 8
Bin/Mac/Game                                     # игра
ctest --test-dir build --output-on-failure -C Debug -R '^Game'   # тесты
python3 Work/Art/make_sprites.py                 # перегенерировать спрайты</code></pre>
</section>

<footer>Файлы: <code>Work/GDD.md</code>, <code>Work/Architecture.md</code>, <code>Work/worklog.md</code>, <code>Work/ScreenShots/</code>, <code>Work/Concepts/</code>. Изменения не закоммичены — ветка <code>main</code>, рабочее дерево.</footer>
</div>
"""


if __name__ == "__main__":
    html = TEMPLATE.replace("<!--SHOTS-->", gallery(SHOT_LIST, SHOTS, 450))
    html = html.replace("<!--MOCKUPS-->", gallery(MOCKUPS, CONCEPTS, 540))
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(html)
    print("wrote", os.path.relpath(OUT, ROOT), len(html) // 1024, "KB")
