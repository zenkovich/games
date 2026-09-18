# Worklog — Sahur's Brain Farm

## 2026-08-23

- Изучил проект и движок o2. Ключевые находки:
  - В o2 уже есть 3D: перспективная `CameraActor` (`SetPerspective`), `Mesh3DComponent`
    (`Mesh3DAsset`: .obj/.mesh3d), `MeshPrimitiveComponent`, `SkinnedMeshComponent`
    (`SkinnedModelAsset`: .glb — минимальный GLB-парсер с анимациями, GPU-скиннинг),
    `LightComponent`, forward/deferred пайплайны, shadow map (`ShadowMapPass` в deferred).
  - Эталон 3D-сцены: `o2/Tests/Sources/Support/Scene/Scene3DTestHelpers.cpp` —
    Z-up, слои "3D"/"2D", перспективная камера + отдельная UI-камера.
  - Шаблон: `Sources/Game/GameApplication.cpp` грузит `Main.scn`; новые C++ компоненты
    регистрируются в `GameLib.cpp`. Тесты: GameTests (headless) / GameUITests (окно,
    AppTestDriver). В Assets лежит Fox.glb + FoxModelTests как пример GLB.
  - BuiltAssets содержит стейл от предыдущей игры (SpaceEvolver) — чистить перед сборкой.
- Завёл Work/: GDD.md, worklog.md, Art/, Concepts/, ScreenShots/, Models/.
- Разведка JS-скриптинга: 3D-компоненты не имеют @SCRIPTABLE, но ActorTransform (3D) и
  Actor полностью скриптовые. Паттерн предыдущей игры (ветка games/space_evolver):
  C++ bootstrap строит сцену + C++ `Bridge` в JS-глобале, логика в JS-модулях —
  переиспользую его, расширив 3D-хелперами (PlayAnim, SpawnZombie, WorldToScreen).
- Ассеты: найдены свободные модели на poly.pizza (Quaternius CC0 + CC-BY, Poly by
  Google CC-BY) — фермер (игрок), анимированный зомби, мозг, прилавок, грядка, забор,
  сосна, бита. См. Work/Models/CREDITS.md.
- Проблема: движковый GLB-парсер читает только первый примитив и первый скин, а новые
  персонажи Quaternius — 4-5 мешей × до 6 примитивов с материалами-цветами без текстур.
  Решение: офлайн-конвертер Work/Models/glbtool.py:
  - `repack` — слияние всех скиннед-примитивов в один + объединение скинов + запекание
    цветов материалов в палитро-полоску 256x16 (1 ряд ячеек, v=0.5 — иммунно к V-flip);
  - `toobj` — статика GLB → OBJ (Z-up бейк, трансформы нод, палитра или извлечение
    текстур, сглаженные нормали при отсутствии).
  Проверка софтверным рендером (render_preview.py): фермер целиком, Run-поза, зомби,
  вся статика — корректны. Масштабы статики запечены в OBJ (мир в метрах).
- Ассеты разложены в Assets/Models/. Мозг перекрашен в розовый (авторский материал
  Google Poly оказался бирюзовым).
- Написан Work/Architecture.md.

### Реализация

- C++: `Sources/Game/BrainFarm/BrainFarmBootstrap.{h,cpp}` — вся сцена кодом (слои
  3D/2D, перспективная камера + DeferredPipeline с тенями, солнце, локация, плантации,
  прилавок, зоны покупки, игрок, шаблоны зомби/мозга, «Flights» контейнер);
  `GameJsBridge.{h,cpp}` — глобальный `Bridge` для JS (ввод, экран, FindActor,
  PlayAnim, SpawnZombie/SpawnBrain, WorldPos*/WorldToScreen* float-геттеры, виджеты).
  Bridge регистрируется и в EditorMain (как в предыдущей игре).
- JS: Assets/Scripts — BrainFarm.js (корень) + BF_Core/Player/Plantations/Counter/
  Zombies/Hud/Game. Шаблон удалён (PyramidSpawner/Rotator/Physics3DDemo, Main.scn).
- HUD-арт: imagegen недоступен (нет ключа Gemini на машине) — джойстик, плашка и
  монета нарисованы программно (суперсэмплинг, python) в Assets/UI/.
- GameInfo.json: title «Sahur's Brain Farm», slug brainfarm, 🧠.

### Отладочная сага (все баги найдены скриншотными UI-тестами)

1. Мозги не рендерились нигде, хотя логика работала. Диагностика: свежий актор с тем
   же мешом виден, «шаблонный» — нет; печать вершин показала геометрию, схлопнутую в
   точку. Причина: `ActorTransform.SetScale` принимает Vec3F — JS `new Vec2(s,s)`
   маршалится нулями → масштаб (0,0). Фикс: BF.setScale через SetScaleX/Y/Z.
2. Vec3F/Vec2F, **возвращаемые** в JS (GetWorldPosition, GetScale), приходят с
   undefined-полями. Фикс: float-геттеры в Bridge (WorldPosX/Y/Z, WorldToScreenX/Y).
3. Зомби рендерился 8.5-метровым: у Quaternius-моделей арматура со scale 100/107, у
   зомби бинд-поза крупнее фермерской. Посчитал реальные скиннед-габариты (7.08 м) —
   визуальный чайлд отмасштабирован 0.25.
4. Текстуры с настоящими UV: движок сэмплит glTF-текстуры по glTF-конвенции
   (оригинал зомби был прав — A/B-тест двумя зомби), а PNG сосны для OBJ-пути
   пришлось перевернуть по вертикали (листва/кора стали корректными).
5. `MeshPrimitiveComponent` Cylinder: ось вдоль Y — «диски» зон покупки стояли
   гигантскими колоннами; уложены поворотом X+90.
6. «Мозги на заборе» оказались грядкой в экстремальной перспективе у нижнего края
   кадра — ложная тревога, подтверждено печатью мировых позиций стока прилавка.

### Тесты (все зелёные)

- GameTests/BrainFarmAssets — загрузка всех OBJ (габариты) и GLB (кости, клипы).
- GameTests/BrainFarmLogic — headless: рост и лимит стопки (8), полный цикл
  сбор→прилавок→продажа→деньги, зона покупки списывает ровно цену и открывает грядку.
- GameUITests/BrainFarmScene — сцена строится и рендерится, драг джойстика двигает
  игрока и включает Run.
- GameUITests/BrainFarmGameplay — скриншотный тур полного цикла + принудительная
  продажа ловит летящую монету в HUD.
- GameUITests/BrainFarmJsBridge — регрессия маршалинга (скейл, мировые позиции, яв).
- Приложение Game запускается (12 c, лог чист), Bootstrap.scn сохраняется для редактора.

## 2026-08-23 (вечер) — профилировка памяти/FPS и масштаб сцены

Жалоба: память растёт со временем, FPS падает до 20. Цели: плоская память, 60 FPS.

### Инструменты

- `GameUITests/BrainFarmPerf` — soak-тест: 16×300 кадров непрерывной игры (телепорты
  грядки↔прилавок, все плантации открыты), замеры кадра/RSS/JS-кучи/акторов/dc/примитивов,
  ассерты на плоскую память и кадр ≤16.6 мс.
- `GameUITests/BrainFarmPerfIsolation` — фазовая изоляция: голая сцена / статичные мозги /
  скейл каждый кадр / скиннед / однопоточный рендер.
- `RenderFrameOverflowMemoryTest` (o2RenderTests) — движковая регрессия на утечку при
  переполнении кадровых буферов.
- Телеметрия в GameApplication: `perf: FPS/RSS/dc/tris` в лог каждые 5 с.
- macOS `leaks`/`heap -s` на живом процессе — нашли ретейн command buffer'ов.

### Найденные и исправленные утечки/тормоза

1. **Metal, retire кадровых буферов (Mac + iOS, MRR)**: при переполнении кадрового
   буфера свежий `MTLBuffer` получал +1 от `new*` и +1 от retired-массива, а
   освобождался один; последний свежий буфер кадра вообще терялся. Сцена гнала
   ~220К вершин/кадр → 2-3 переполнения/кадр → **~8.4 МБ/кадр** (4.4 ГБ за 7 секунд,
   до OOM-kill). Фикс: `RetireOverflowBuffer` — ретир только overflow-буферов с
   передачей владения; ретир хвостовых буферов кадра в PlatformBegin*.
2. **Metal, autorelease-пулы**: поток рендера не имел autorelease-пула — каждый
   `MTLCommandBuffer` + 4 контекста жили вечно (+2743 объекта за 45 с, ~0.15 МБ/с
   дрейфа). Фикс: кадровые `NSAutoreleasePool` в PlatformBegin/End и
   PlatformBeginThreaded/EndThreaded (Mac + iOS).
3. **Кадровые буферы 65535 вершин** — реликт 16-битных индексов (VertexIndex — uint):
   3D-кадр в 150-250К вершин переполнял их 2-3 раза за кадр. Увеличены ×4 на Mac.
4. **Перестроение мешей на переключении raw-albedo**: каждый Mesh3D/MeshPrimitive/
   SkinnedMesh(CPU) перестраивался ДВАЖДЫ за кадр (shadow→gbuffer toggle) даже
   статичный. Фикс: raw-albedo влияет только на запечённый ламберт → пропуск
   перестроения при `!mShaded` (у нас все меши нешейдед).
5. **Мозг 3070 треугольников** — тяжёл для 26 экземпляров: децимация кластеризацией
   (Work/Models/decimate_obj.py) до 614 треугольников, визуально неотличимо в игре.

### Результат

- Изоляция: 12 статичных мозгов было 6.3 мс/кадр и +1.26 ГБ/150 кадров → 1.1 мс, память плоская.
- Реальный Game: **FPS 58-60, RSS 200 МБ без роста** (90-180 с прогоны). Было: рост до
  OOM и деградация кадра 5→46 мс.

### Масштаб сцены для редактора

Мир переведён из метров в конвенцию движка **100 юнитов = 1 м** (`kUnitsPerMeter`,
`BF.M`): персонажи ~180 юнитов, земля 2600×3200 — как в движковых демо-сценах, редактор
навигируется нормально. Статические OBJ перезапечены ×100, GLB-персонажи масштабируются
на Visual-акторе (фермер ×100, зомби ×25), камера near/far 10..10000, все координаты
в bootstrap/JS/тестах переведены. Bootstrap.scn пересохранён. Все 7 сьют зелёные.

## 2026-09-18 — Sahur playable art refresh

- Сохранены локальные изменения ZeroLine в stash `codex: preserve zeroline editor work before sahur 2026-09-18`.
- Sahur обновлён из origin/main и upstream/main. o2 → b9c1aabbd.
- Созданы персонаж по референсу, клипы Idle/Run, общий атлас, новая ферма.
- Настроены камера, свет, HUD; сохранена игровая сцена и просмотрены скриншоты.
- Удалены неиспользуемые модели и GeminiShowcase из ресурсов игры.
- Убрана упаковка EditorData в Game.data; добавлены воспроизводимая сборка и gzip.
- Проверки: 12 тестов в 6 игровых suites, включая soak на 4800 кадров — PASS.
- Native soak: финальный кадр ~4.8 мс; RSS после прогрева 184 → 193 МБ; JS 636 → 639 КБ.
- Chrome: ~59 FPS, без JS/WebGL-ошибок; мышь, эмулированный touch, сбор/продажа/покупка — PASS.
- WASM: только игровой контент, около 2.6 МиБ gzip. Реальное мобильное устройство не измерялось.

## Stacking iteration and mesh repair — 2026-09-18

- Replaced the primitive-only look with a Blender-sculpted Sahur and authored market,
  oak, fern, barrel, rock and brain assets. Added baked diffuse/AO, painted grass,
  worn paths, flagstones, garden borders, lanterns and a coordinated widget UI.
- Reworked the economy into four purchases: second garden $40, capacity/speed $80,
  gold garden $140 and VIP market $220. Inventory tracks value and gold status;
  pending flights reserve slots and cannot be sold before landing. Orders grow from
  one to three items, with VIP bonuses after the finale.
- User reported holes in the models. Confirmed 352 boundary edges on Sahur; closed
  the surfaces, recalculated normals and padded baked UVs. Remeshed the brain and
  removed a problematic bevel on the imported stand. Six exported meshes now pass
  `Tools/Art/check_meshes.py` with zero open edges. Market orientation also fixed.
- First expanded build exceeded the limit at 6.43 MB. Shared OBJ attributes and
  resized/indexed PNGs reduced the full archive below 5 MB without dropping models.
- A native soak exposed repeated mesh rebuilds when baked vertex lighting switched
  between render passes. Disabled that redundant option for the deferred scene.
  Mature crops remain static; stationary player/stack transforms are not rewritten.
  Brain LOD reduced to 1600 triangles; the exported mesh remains closed.
- Browser run reached all upgrades with ordinary joystick input: 44 sales and $580
  revenue. A zero-duration synthetic click missed the final Button; a realistic
  150 ms press works, and the verification script now uses it. Final rerun, video,
  build size and performance evidence are recorded in the generated report.

Final verification: Mac and WASM green; 14/14 native tests, 4800-frame soak at
10–12.5 ms/frame, RSS 312→326 MB after warm-up. Browser acceptance passed with no
errors, mouse/touch/desktop layouts, 44 earned sales and all four purchases.
Full ZIP: 4,564,212 bytes including credits. Chrome heartbeat: 59–60 FPS.
Report and full gameplay video are available alongside the local playable.

## Большая ферма, новая камера и управление — 2026-09-18

- Поле увеличено до 22×26 м. Три грядки по 4×20 посадок; лавка, очередь,
  дороги и площадки улучшений перенесены под новую планировку.
- Камера: FOV 35°, наклон 45°, yaw 35°, плавное следование. Джойстик работает
  в экранных направлениях, имеет аналоговую скорость, сглаживание, новую графику
  и плавающее основание. Ценники вне видимой области скрыты, цель показывает
  отдельный указатель у края экрана.
- Сбор локальный вдоль рядов. Мозги стоят $2/$4, вместимость 30/60, прилавок 36,
  улучшения стоят 40/70/110/180. В браузере полная прогрессия проходит четырьмя
  доставками без выдачи денег и телепортов.
- Цветокоррекция встроена в DeferredLightingPass через игровой FarmLightingPass:
  насыщенность, контраст и тёплый баланс, GLSL и Metal. Дополнительного прохода нет.
- Обновлены земля, длинные ограды и дорожки. Brain LOD снижен до 600 треугольников;
  все шесть проверяемых solid-мешей по-прежнему без открытых рёбер.
- Первый нагрузочный прогон с 240 посадками выявил ~23 мс в Debug. Профилирование
  указало на повторный обход вершин при вычислении shadow bounds. FarmMeshComponent
  кэширует границы и консервативно отсекает меши за frustum текущего render pass.
  Добавлены проверки инвалидирования кэша и пересечения near/side planes.
- Отчёт переписан под новую механику: сравнение планировки, видео прохождения,
  цветокоррекция до/после, UI и фактические результаты сборок.

Финальная проверка: 17/17 тестов в 7 наборах — PASS. Native Debug: 4800 кадров,
14,2–17,8 мс, финальный замер 15,6 мс; RSS после прогрева 388 → 391 МБ.
WASM ZIP 4,603,232 байт. Chrome 59–60 FPS, полный цикл за
63.27 с, 180 продаж / $480, mouse/touch/desktop и
возврат после финала — PASS. Ошибок браузера нет.

## Фиксация джойстика, поворот грядок, открытый прилавок

- Воспроизведено смещение центра джойстика на 166 UI-юнитов при длинном жесте.
  Написан регрессионный тест, до исправления он падал. Основание теперь остаётся
  в точке нажатия, ручка ограничена радиусом; новый тап задаёт новый центр.
- Все три грядки повёрнуты на 90°, открытые торцы обращены к прилавку.
  Мировые координаты сбора берутся из акторов посадок, поэтому совпадают с мешами.
  Перенастроены дорожки, точки улучшений, старт и зона разгрузки.
- Прилавок развёрнут к грядкам. Крыша и высокие элементы срезаны в исходном
  арт-пайплайне, срезы закрыты; табличка перенесена на переднюю панель.
  Товар поднят до поверхности стойки. Все solid-меши остаются без открытых рёбер.

Проверка этой итерации: 18 тестов в 7 наборах — PASS; 4800 кадров нагрузки — PASS.
WASM ZIP: 4,554,914 байт. Chrome 59–60 FPS, прогрессия за 58.20 с.
Отдельный браузерный тест удержания у края, отпускания и следующего тапа — PASS.
Обновлены видео, скриншоты и отчёт.

## Публикация — 2026-09-18

- Официальный web publish для gamesTemplate2 с полной пересборкой ассетов:
  Sahur v3, https://games.zenkovich.space/sahur/. Добавлен Credits.txt.
- Сервер обновлён через tools/deploy.py --only games:sahur; код завершения 0.
- Публичная проверка Chrome — PASS: 240 посадок, фиксированный джойстик при
  удержании у края, сбор 30 мозгов и продажа за $60. Ошибок браузера нет.
  JS/WASM/data загружаются с ?v=3, Brotli; SHA-256 совпадают с publish.
- Опубликованный ZIP: 4 554 864 байта; HTML+JS+WASM+data с Brotli: 3 905 800 байт.
- Автоматическая очистка Cloudflare cache вернула HTTP 401. Публичный HTML
  отдаётся как DYNAMIC с no-cache; свежая v3 подтверждена браузером.
- Результат: Work/live-deployment-validation.json; скриншоты live_start.png
  и live_market.png. Ссылка запуска в отчёте заменена на публичную.

## Исправление сборки Editor — 2026-09-18

- Воспроизведён SIGSEGV в AssetsBuilder::ProcessModifiedAssets. После изменения
  ID папки Editor UI styles удалялись её дочерние объекты, но в индексах оставались
  слабые ссылки на них. LLDB подтвердил обращение к удалённому объекту.
- В o2/AssetsBuildTool исправлен ProcessRemovedAssets: удаление через AssetsTree
  очищает индексы всех потомков; обход снимка списка не инвалидируется удалениями.
- Добавлены два регрессионных теста Tools/Tests/test_assets_builder.py: замена
  метаданных корневой и вложенной папки, сохранность файлов и следующая сборка.
  До исправления оба падали с SIGSEGV; после — PASS.
- cmake --build --preset mac --target Editor -j 8 — PASS, включая ассеты.
  Повторная инкрементальная сборка — PASS. Bin/Mac/Editor запущен из Bin/Mac:
  окно редактора открывается, Metal работает, заголовок показывает 60 FPS.
  Проверочный процесс закрыт, автоматически изменённые настройки восстановлены.
- README дополнен командами сборки/запуска Editor и регрессионной проверки.

## Профилирование Editor: Scene + Game + выделенная плантация — 2026-09-18

- Точный сценарий с открытыми Scene и Game и выбранной `Plantation0` воспроизводил
  40–47 FPS. Контур выбора повторно отправлял в selection mask все 81 дочерних
  мешей плантации. Для иерархий крупнее 32 drawable-компонентов маска теперь
  строится по общему bounds из 12 треугольников; transform gizmo сохранён.
- Scene остаётся live viewport и явно помечает render target на обновление при
  каждом `Draw`. Оптимизация общего `ScrollView` не кеширует кадры окна Scene.
- После устранения повторной маски оставшаяся нагрузка находилась в
  `Render::UploadBuffers`: Metal расширял каждый обычный `Vertex` до `Vertex3Tex`
  общим циклом с несколькими маленькими `memcpy` на вершину. Добавлен прямой путь
  для стандартной пары layout-ов с тем же дублированием UV и без изменения кадра.
- В итоговом сценарии Scene постоянно перерисовывается, Game открыт, контур и
  gizmo видны: 59–60 FPS, 153 draw calls, 344 978 треугольников. Загрузка процесса
  снизилась примерно с 97% до 60–61% одного CPU; верхние samples в
  `UploadBuffers` — с 392 до 11.
- `Editor` и `o2EditorUITests` собраны. 29 тестов `SceneGizmos`,
  `SceneView3DModeUI`, `SceneStableCameraMode`, `TransformTools3DDrag` и
  `ParticlesEditorPreview` прошли.
