"""Builds Work/Report.html: the prototype report with embedded screenshots, concepts and sprites."""
import base64
import io
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(ROOT, "Work")
ASSETS = os.path.join(ROOT, "Assets")


def data_uri(path, width, fmt="JPEG", quality=88):
    img = Image.open(path)
    if img.width > width:
        img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
    buf = io.BytesIO()
    if fmt == "JPEG":
        img.convert("RGB").save(buf, "JPEG", quality=quality, optimize=True)
        mime = "image/jpeg"
    else:
        img.convert("RGBA").save(buf, "PNG", optimize=True)
        mime = "image/png"
    return f"data:{mime};base64," + base64.b64encode(buf.getvalue()).decode()


SHOTS = [
    ("01_city", "Город: 4 здания-стакана, слоты стройки, замки уровней, нижняя панель"),
    ("02_glass_full", "Стакан Фермы: физическая банка сама наполняется шариками"),
    ("03_glass_popped", "Тап по группе — +9 пшеницы, счётчик склада обновился"),
    ("04_workshop", "Пекарня: заказы с входами, ценой и остатком на складе"),
    ("05_workshop_crafted", "Хлеб готов через 5 с, кнопка «Sell» активна"),
    ("06_warehouse", "Склад: ягоды упёрлись в лимит (overflow ушёл в монеты)"),
    ("07_build", "Меню стройки: стоимость, эффект и блокеры по каждому зданию"),
    ("08_city_cottage", "Коттедж достроен: население 50"),
    ("09_character", "Экран персонажа: вкладки NPC, сердца, шкала Affinity, баффы"),
    ("10_character_gift", "Выбор подарка из товаров на складе (+очки)"),
    ("11_date", "Свидание с Лео в парке: CG-фон и сюжетные реплики"),
]

shots_html = "\n".join(
    f'<figure class="shot"><img src="{data_uri(os.path.join(WORK, "ScreenShots", n + ".png"), 420)}" alt="{c}"><figcaption>{c}</figcaption></figure>'
    for n, c in SHOTS
)

concepts_html = "".join(
    f'<figure class="shot"><img src="{data_uri(os.path.join(WORK, "Concepts", n + ".png"), 420)}" alt="{c}"><figcaption>{c}</figcaption></figure>'
    for n, c in [("concept_glass", "Концепт экрана стакана — задал стиль всем спрайтам"),
                 ("concept_city", "Концепт города — референс для зданий и карты")]
)


def strip(folder, names, size):
    return "".join(
        f'<img src="{data_uri(os.path.join(ASSETS, folder, n + ".png"), size, "PNG")}" alt="{n}" title="{n}">'
        for n in names
    )


balls = strip("Balls", ["wheat", "berry", "cotton", "iron", "gold", "coal", "apple", "honey", "flower", "wood", "resin", "mushroom"], 72)
buildings = strip("Buildings", ["farm", "mine", "orchard", "sawmill", "bakery", "forge", "weaver", "jeweler", "cottage", "townhouse", "manor", "fountain", "park", "cafe", "lot"], 110)
goods = strip("Goods", ["bread", "pie", "cake", "nails", "tools", "cloth", "dress", "ring", "necklace"], 72)
npcs = strip("Npc", ["tom", "rick", "leo", "max"], 140)

HTML = f"""<title>Color Town Prototype</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600&family=Nunito+Sans:ital,wght@0,400;0,600;0,700;1,400&family=JetBrains+Mono:wght@400&display=swap">
<style>
:root {{
  --bg: #f4f9ef; --surface: #ffffff; --surface-2: #e9f2e2; --ink: #24301f; --muted: #5f6d58;
  --line: #d6e2cd; --accent: #ff7a48; --accent-ink: #ffffff; --gold: #eeb62a; --sky: #4aa0dc; --shadow: 0 10px 30px rgba(36,48,31,.10);
}}
@media (prefers-color-scheme: dark) {{
  :root:not([data-theme="light"]) {{
    --bg: #161e14; --surface: #1f2a1c; --surface-2: #26341f; --ink: #eef4e8; --muted: #a8b59f;
    --line: #35452f; --accent: #ff8a5c; --accent-ink: #1a120c; --gold: #f2c14e; --sky: #6fb6ea; --shadow: 0 10px 30px rgba(0,0,0,.35);
  }}
}}
:root[data-theme="dark"] {{
  --bg: #161e14; --surface: #1f2a1c; --surface-2: #26341f; --ink: #eef4e8; --muted: #a8b59f;
  --line: #35452f; --accent: #ff8a5c; --accent-ink: #1a120c; --gold: #f2c14e; --sky: #6fb6ea; --shadow: 0 10px 30px rgba(0,0,0,.35);
}}
body {{ background: var(--bg); color: var(--ink); font-family: "Nunito Sans", "Segoe UI", system-ui, sans-serif; line-height: 1.55; margin: 0; }}
.page {{ max-width: 980px; margin: 0 auto; padding: 48px 24px 80px; }}
h1, h2, h3 {{ font-family: Fredoka, "Nunito Sans", system-ui, sans-serif; font-weight: 600; text-wrap: balance; margin: 0; }}
h1 {{ font-size: clamp(2.4rem, 6vw, 3.6rem); line-height: 1.05; letter-spacing: -0.01em; }}
h2 {{ font-size: 1.7rem; margin-top: 64px; margin-bottom: 18px; }}
h3 {{ font-size: 1.15rem; margin: 22px 0 8px; }}
p {{ max-width: 68ch; margin: 0 0 12px; }}
a {{ color: var(--sky); }}
.eyebrow {{ font-size: .78rem; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); font-weight: 700; }}
.hero {{ display: grid; grid-template-columns: 1.2fr .8fr; gap: 32px; align-items: end; }}
.hero .sub {{ font-size: 1.15rem; color: var(--muted); max-width: 52ch; margin-top: 14px; }}
.tiles {{ display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }}
.tile {{ background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 14px 16px; }}
.tile b {{ display: block; font-family: Fredoka, sans-serif; font-size: 1.9rem; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--accent); line-height: 1.1; }}
.tile span {{ font-size: .85rem; color: var(--muted); }}
.gallery {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 18px; }}
.shot {{ margin: 0; background: var(--surface); border: 1px solid var(--line); border-radius: 22px; padding: 10px; box-shadow: var(--shadow); }}
.shot img {{ width: 100%; height: auto; border-radius: 14px; display: block; }}
.shot figcaption {{ font-size: .85rem; color: var(--muted); padding: 10px 4px 2px; }}
.strip {{ display: flex; flex-wrap: wrap; gap: 8px; align-items: center; background: var(--surface-2); border-radius: 18px; padding: 12px 14px; margin: 8px 0 18px; }}
.strip img {{ height: 64px; width: auto; }}
.strip.big img {{ height: 96px; }}
.strip.portraits img {{ height: 120px; }}
.timeline {{ list-style: none; padding: 0; margin: 0; counter-reset: step; display: grid; gap: 10px; }}
.timeline li {{ display: grid; grid-template-columns: 44px 1fr; gap: 14px; align-items: start; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 12px 14px; }}
.timeline li::before {{ counter-increment: step; content: counter(step); font-family: Fredoka, sans-serif; font-weight: 600; font-size: 1.2rem; color: var(--accent-ink); background: var(--accent); border-radius: 12px; width: 40px; height: 40px; display: grid; place-items: center; }}
.timeline li b {{ display: block; }}
.timeline li span {{ color: var(--muted); font-size: .95rem; }}
.arch {{ display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }}
.box {{ background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 14px 16px; }}
.box h3 {{ margin-top: 0; }}
.box ul {{ margin: 6px 0 0; padding-left: 18px; color: var(--muted); font-size: .95rem; }}
.box.js {{ border-top: 5px solid var(--gold); }}
.box.cpp {{ border-top: 5px solid var(--sky); }}
.box.core {{ border-top: 5px solid var(--accent); }}
.box.test {{ border-top: 5px solid var(--muted); }}
code {{ font-family: "JetBrains Mono", ui-monospace, monospace; font-size: .86em; background: var(--surface-2); padding: 1px 6px; border-radius: 6px; }}
table {{ border-collapse: collapse; width: 100%; font-size: .95rem; }}
th, td {{ text-align: left; vertical-align: top; padding: 10px 12px; border-bottom: 1px solid var(--line); }}
th {{ font-size: .78rem; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }}
.wrap {{ overflow-x: auto; }}
.next {{ columns: 2; column-gap: 28px; padding-left: 20px; }}
.next li {{ break-inside: avoid; margin-bottom: 8px; }}
@media (max-width: 720px) {{ .hero, .arch {{ grid-template-columns: 1fr; }} .next {{ columns: 1; }} }}
@media (prefers-reduced-motion: no-preference) {{ .shot {{ transition: transform .2s ease; }} .shot:hover {{ transform: translateY(-3px); }} }}
</style>

<div class="page">
<header class="hero">
  <div>
    <div class="eyebrow">Прототип на движке o2 · 24 августа 2026</div>
    <h1>Color Town</h1>
    <p class="sub">Zero-stress градостроитель: физический «стакан» для добычи, активные заказы, население как множитель цен и романтическая мета с четырьмя жителями. Полный цикл собран, протестирован и снят на скриншоты.</p>
  </div>
  <div class="tiles">
    <div class="tile"><b>7</b><span>экранов и окон</span></div>
    <div class="tile"><b>52</b><span>сгенерированных арта</span></div>
    <div class="tile"><b>32</b><span>headless-теста</span></div>
    <div class="tile"><b>6</b><span>рендер-тестов с кликами</span></div>
  </div>
</header>

<h2>Что в прототипе</h2>
<p>Игрок заходит в здание Tier 1 и лопает группы одноцветных шариков в банке (Box2D-физика, банка наполняется сама, лимита ходов нет). Сырьё копится на складе с лимитом; всё лишнее мгновенно конвертируется в монеты и XP города. В Пекарне и других мастерских заказы запускаются тапом и завершаются по короткому таймеру, товары продаются с множителем населения (×1.0 → ×2.5 по порогам 100/500/1500). Монеты идут в дома (население), декор (красота — условие для дорогих домов, парк и кафе — локации свиданий) и новые мастерские. Товары дарятся NPC: растёт Affinity, открываются свидания с CG и репликами, апгрейд здания NPC и баффы к добыче/цене.</p>

<h2>Скриншоты</h2>
<div class="gallery">{shots_html}</div>

<h2>Арт</h2>
<p>Стиль задали два концепта (Gemini Nano Banana 2), дальше каждый спрайт генерировался по референсу концепта с прозрачностью, ресайзился скриптом в <code>Assets/</code>. Панели, кнопки и бары нарисованы PIL под 9-slice.</p>
<div class="gallery">{concepts_html}</div>
<h3>Шарики ресурсов (4 стакана × 3 цвета)</h3>
<div class="strip">{balls}</div>
<h3>Здания, жильё и декор</h3>
<div class="strip big">{buildings}</div>
<h3>Товары мастерских</h3>
<div class="strip">{goods}</div>
<h3>Жители: Том, Рик, Лео, Макс</h3>
<div class="strip portraits">{npcs}</div>

<h2>Архитектура</h2>
<div class="arch">
  <div class="box js"><h3>Правила — JavaScript</h3><code>Assets/Scripts/GameModel.js</code>
    <ul><li>склад, overflow → монеты/XP</li><li>добыча с множителями уровня и Affinity</li><li>заказы и таймеры крафта, продажа × население</li><li>слоты, стройка, красота, уровень города</li><li>подарки со штрафом за повторы, свидания, сюжет, баффы</li><li>JSON-сейв</li></ul></div>
  <div class="box cpp"><h3>Экраны — C++</h3><code>Sources/Game/Screens/*, UI/UIKit</code>
    <ul><li>виджеты движка: Button, Label, Image, Widget</li><li>City, Glass, Workshop, Character, Date + окна Warehouse, Build</li><li>HUD, тосты, отложенный Refresh</li><li>headless-safe: без Render строится структура без картинок</li></ul></div>
  <div class="box core"><h3>Стакан — C++</h3><code>Sources/Game/Core/GlassField, ResourceBall</code>
    <ul><li>статичный RigidBody + SplineCollider-петля</li><li>шарики: RigidBody + CircleCollider + ImageComponent</li><li>спавн сверху, группа по соседству, лопание, колбэк</li></ul></div>
  <div class="box test"><h3>Точка входа</h3><code>Assets/Bootstrap.scn → ColorTownGame</code>
    <ul><li>сцена сгенерирована кодом (<code>o2Scene.Save</code>)</li><li>ScriptableComponent с моделью + bootstrap-компонент</li><li>та же сцена запускается из редактора</li></ul></div>
</div>

<h2>Этапы работы</h2>
<ol class="timeline">
  <li><div><b>Разведка</b><span>Механика стакана и физика из PetStory, ограничения JS-биндингов o2, тестовая инфраструктура (batch ctest, AppTestDriver).</span></div></li>
  <li><div><b>GDD</b><span>Таблицы ресурсов, рецептов, домов, декора, порогов населения, Affinity и экранов — <code>Work/GDD.md</code>.</span></div></li>
  <li><div><b>Концепты и спрайты</b><span>2 концепта, 12 шариков, 15 зданий, 4 NPC, 9 товаров, иконки, банка, фоны, 2 CG. Каждый результат проверен глазами, неудачные перегенерированы.</span></div></li>
  <li><div><b>Модель на JS + тесты</b><span>13 headless-кейсов через C++-фасад <code>GameModel::Call&lt;T&gt;</code>.</span></div></li>
  <li><div><b>Физический стакан</b><span>GlassField/ResourceBall, 6 тестов, включая падение шарика под Box2D в headless.</span></div></li>
  <li><div><b>Экраны и окна</b><span>UIKit-строители, 7 экранов, навигация, флоу-тесты без рендера (7 кейсов) и bootstrap-сцена.</span></div></li>
  <li><div><b>Рендер-тесты и полировка</b><span>6 сценариев с кликами по реальным кнопкам и шарикам, скриншоты, правки вёрстки и альфы спрайтов по ним.</span></div></li>
</ol>

<h2>Сложности и решения</h2>
<div class="wrap"><table>
<tr><th>Проблема</th><th>Решение</th></tr>
<tr><td>JS-биндинги движка не дают создавать виджеты, читать сцену и ввод</td><td>Правила игры — на JS (тестируются headless), отображение и физика — C++; фасад <code>GameModel</code> с вариадическим <code>Call&lt;T&gt;</code>.</td></tr>
<tr><td>QuickJS не кладёт top-level <code>class</code>/<code>const</code> в глобальный объект и падает на повторном запуске скрипта</td><td><code>var CT = …</code>, <code>var GameModel = class …</code> — ScriptableComponent находит класс, повторный запуск безопасен.</td></tr>
<tr><td><code>GetType()</code> у компонента конфликтует с рефлексией o2</td><td>Переименован в <code>GetResourceType()</code>.</td></tr>
<tr><td>Headless <code>TickFrame</code> не шагает Box2D</td><td>Тестовый <code>TickPhysicsFrame</code>: FixedUpdate сцены + Pre/Update/PostUpdate физики, как в <code>Integration::UpdateFrameFixed</code>.</td></tr>
<tr><td>Сохранённая сцена была пустой</td><td>Актор попадает в корень только после <code>UpdateAddedEntities()</code>; вызываем его до <code>Save</code>, не запуская OnStart — сцена остаётся минимальной.</td></tr>
<tr><td>Повторный тап по той же кнопке в тесте не срабатывал</td><td>Движок считает второй тап в интервале двойного клика dbl-click; между такими тапами — пауза. Заодно <code>RefreshAll</code> стал отложенным, чтобы обработчик клика не пересобирал свою кнопку.</td></tr>
<tr><td>Белые углы у светлых спрайтов после alpha-recovery (хлопок, пекарня)</td><td>Flood-fill белого от границы; особняк, торт и инструменты перегенерированы с другими промптами.</td></tr>
<tr><td>Переносы текста в карточках заказов и стройки</td><td>Компактные форматы («Wheat 10/3», «Price 12 · Stock 0»), меньший кегль, проверка по скриншотам.</td></tr>
</table></div>

<h2>Что дальше</h2>
<ul class="next">
  <li>Звук и частицы на лопание, анимация «прыжка» шариков, микро-игра критического крафта (Phase 2).</li>
  <li>Больше сюжетных сцен и второй уровень CG для каждого NPC, диалоги с выбором.</li>
  <li>Балансировка экономики по реальным сессиям (цены, таймеры, лимиты склада).</li>
  <li>Персистентность прогресса уже есть (<code>ColorTownSave.json</code>); добавить облачный сейв и аналитику.</li>
  <li>Локализация: шрифт с кириллицей подключён, тексты пока на английском в одном месте — JS-конфиге.</li>
  <li>Вырезать демо-код шаблона (Physics3DDemo, PyramidSpawner, Main.scn), если он больше не нужен.</li>
</ul>

<p class="eyebrow" style="margin-top:56px">Файлы: Work/GDD.md · Work/Architecture.md · Work/worklog.md · Work/ScreenShots · Work/Art · Work/Concepts</p>
</div>
"""

out = os.path.join(WORK, "Report.html")
with open(out, "w") as f:
    f.write(HTML)
print(out, os.path.getsize(out) // 1024, "KB")
