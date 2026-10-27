include("Scripts/WordFall/WordFallFileIO.js");

globalThis.WordFallGame = globalThis.WordFallGame || {};

// Экран редактора уровней. Уровни — с постоянным id и именем: список с бегунком для быстрых
// переходов, новый / копия / удаление / перестановка. Поле правится инструментами: левый клик
// ставит, правый убирает, колесо над ящиком (на поле или над инструментом) меняет прочность.
// Слова уровня — отдельный блок (вручную и от агента подбора), задачи — списком, все видны.
// Каждая правка сразу уходит в сервис и файл; «назад / вперёд» откатывают и повторяют правки.
// «Играть» запускает уровень на игровом экране; «Файл» уносит кампанию или уровень в файл,
// забирает их обратно и переносит поле из уровня игры «три в ряд»

WordFallLevelEditorView = class WordFallLevelEditorView extends o2.Component
{
    get _svc() { return WordFallGame.service; }

    static get Letters() { return "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЫЬЭЮЯ"; }
    static get NameKeys() { return "0123456789_-"; }

    static get ToolNames()
    {
        return { cell: "Клетка: ЛКМ — добавить, ПКМ — убрать", ice: "Лёд", stone: "Камень",
                 crate: "Ящик", chain: "Цепь", snow: "Снежок", parcel: "Конверт",
                 bomb: "Бомба", rocket: "Ракета", fireworks: "Салют", letter: "Буква (тап по клетке — выбор)",
                 erase: "Стереть содержимое" };
    }

    static get TaskTypeNames()
    {
        return { Length: "ДЛИНА", Powerup: "БОНУС", ClearIce: "ВЕСЬ ЛЁД", AnyWords: "СЛОВА",
                 WordScore: "ОЧКИ СЛОВА", Letter: "БУКВА", Deliver: "КОНВЕРТЫ", Melt: "СНЕЖКИ", Crates: "ЯЩИКИ" };
    }

    static get PowerupNames() { return { bomb: "БОМБА", rocket: "РАКЕТА", fireworks: "САЛЮТ" }; }

    constructor()
    {
        super();
        this.levelRows = 12;   // строк в списке уровней
        this.wordRows = 8;     // строк в списке слов

        this._draft = null;
        this._index = 0;
        this._tool = "ice";
        this._tiles = null;
        this._tools = {};
        this._history = new WordFallEditHistory(100);
        this._pendingCell = null;   // клетка, для которой открыта палитра букв
        this._paletteMode = "cell"; // cell — буква клетки, letter — буква задачи, word — слово уровня, name — имя уровня
        this._paletteTask = -1;
        this._paletteWord = -1;
        this._typeTarget = -1;      // задача, чей тип выбирается; -1 — новая задача
        this._listFirst = 0;
        this._wordsFirst = 0;
        this._taskRows = [];
        this._fileAction = "";
        this._syncingScroll = false;
    }

    OnStart()
    {
        globalThis.WordFallViews = globalThis.WordFallViews || {};
        WordFallViews.levelEditor = this;

        var self = this;
        var root = this._actor;
        this._columns = this._svc.GetColumns();
        this._rows = this._svc.GetRows();

        var board = root.GetChild("Board");
        this._tiles = [];
        for (var c = 0; c < this._columns; c++)
        {
            this._tiles[c] = [];
            for (var r = 0; r < this._rows; r++)
            {
                var view = this._TileView(board.GetChild("Tile_" + c + "_" + r));
                view.cellBack = board.GetChild("CellBack_" + c + "_" + r);
                this._tiles[c][r] = view;
                (function(cc, rr) {
                    view.btn.onClick = function() { self.OnCell(cc, rr); };
                    view.btn.onRightClick = function() { self.OnCellRight(cc, rr); };
                    view.btn.onScrolled = function(delta) { self.OnCellWheel(cc, rr, delta); };
                })(c, r);
            }
        }

        var tools = root.GetChild("Tools");
        WordFallLevelDraft.Tools.forEach(function(name) {
            var view = self._TileView(tools.GetChild("Tool_" + name));
            self._tools[name] = view;
            view.btn.onClick = function() { self.SelectTool(name); };
            self._PaintTool(name, view);
            if (name == "crate")
                view.btn.onScrolled = function(delta) { self.OnToolWheel(name, delta); };
        });

        this._levelPick = root.GetChild("LevelPick/Btn");
        this._statusLabel = root.GetChild("StatusLabel");
        this._toolLabel = root.GetChild("ToolLabel");
        this._undo = root.GetChild("UndoBtn");
        this._redo = root.GetChild("RedoBtn");
        this._values = {};
        this._charges = [];

        var bind = function(name, action) {
            var button = root.GetChild(name + "/Btn");
            if (button)
                button.onClick = action;
            return button;
        };
        this._bind = bind;
        bind("CloseBtn", function() { self.Close(); });
        bind("PrevBtn", function() { self.Open(self._index - 1); });
        bind("NextBtn", function() { self.Open(self._index + 1); });
        bind("LevelPick", function() { self.OpenLevels(); });
        bind("PlayBtn", function() { self.Play(); });
        bind("ResetBtn", function() { self.Reset(); });
        bind("FilesBtn", function() { self.OpenFiles(); });
        bind("TasksBtn", function() { self.OpenTasks(); });
        bind("WordsBtn", function() { self.OpenWords(); });
        bind("UndoBtn", function() { self.Undo(); });
        bind("RedoBtn", function() { self.Redo(); });
        bind("NewBtn", function() { self.NewLevel(); });
        bind("CopyBtn", function() { self.DuplicateLevel(); });
        bind("DeleteBtn", function() { self.DeleteLevel(); });
        bind("UpBtn", function() { self.MoveLevel(-1); });
        bind("DownBtn", function() { self.MoveLevel(1); });
        bind("RenameBtn", function() { self.OpenPalette("name", -1); });
        this._autoTarget = bind("AutoTargetBtn", function() { self._Edit(function(d) { d.SetAutoTarget(!d.autoTarget); }); });

        var targetStep = function(d, v) {
            // ручная цель: снимает «авто» и продолжает от того, что считал агент
            if (d.autoTarget)
            {
                var auto = self._svc.PreviewTargetScore(d.ToConfig());
                d.SetAutoTarget(false);
                d.SetTargetScore(auto + (v - d.targetScore));
                return;
            }
            d.SetTargetScore(v);
        };
        var steppers = {
            Moves: { get: function(d) { return d.moves; }, set: function(d, v) { d.SetMoves(v); }, step: 1 },
            Target: { get: function(d) { return d.targetScore; }, set: targetStep, step: 10,
                      show: function(d) { return d.autoTarget ? "" + self._svc.PreviewTargetScore(d.ToConfig()) : "" + d.targetScore; } },
            Difficulty: { get: function(d) { return d.difficulty; }, set: function(d, v) { d.SetDifficulty(v); }, step: 1 },
            Vowels: { get: function(d) { return d.extraVowels; }, set: function(d, v) { d.SetExtraVowels(v); }, step: 1 },
            Rare: { get: function(d) { return d.extraRare; }, set: function(d, v) { d.SetExtraRare(v); }, step: 1 }
        };
        this._BindSteppers(root, steppers, "");
        for (var i = 0; i < 5; i++)
        {
            (function(index) {
                self._charges.push(root.GetChild("Charge" + index + "/Btn"));
                bind("Charge" + index, function() { self._Edit(function(d) { d.CycleBoosterCharge(index); }); });
            })(i);
        }

        this._BindGoals(root);
        this._BindLevels(root, bind);
        this._BindTasks(root, bind);
        this._BindTypePicker(root, bind);
        this._BindWords(root, bind);
        this._BindPalette(root, bind);
        this._BindFiles(root, bind);

        this.SelectTool(this._tool);
        this.Open(this._svc.GetLevelIndex());
    }

    // Степперы «- значение +»: container — где лежат подписи значений, prefix — путь к кнопкам от корня экрана
    _BindSteppers(container, steppers, prefix)
    {
        var self = this;
        for (var key in steppers)
        {
            (function(key, stepper) {
                self._values[key] = { label: container.GetChild(key + "Value"), get: stepper.get, show: stepper.show };
                self._bind(prefix + key + "Minus", function() { self._Edit(function(d) { stepper.set(d, stepper.get(d) - stepper.step); }); });
                self._bind(prefix + key + "Plus", function() { self._Edit(function(d) { stepper.set(d, stepper.get(d) + stepper.step); }); });
            })(key, steppers[key]);
        }
    }

    // Блоки целей на основном экране: превью слов (вручную и от агента) и строки задач
    _BindGoals(root)
    {
        this._wordsTitle = root.GetChild("WordsTitle");
        this._wordsMore = root.GetChild("WordsMore");
        this._wordTiles = [];
        for (var r = 0; r < 4; r++)
        {
            var row = [];
            for (var i = 0; i < 8; i++)
            {
                var tile = root.GetChild("EW" + r + "_" + i);
                row.push({ widget: tile, agent: tile.GetLayer("found"), letter: tile.GetLayer("letter").drawable });
            }
            this._wordTiles.push(row);
        }
        this._tasksTitle = root.GetChild("TasksTitle");
        this._taskLines = [];
        for (var i = 0; i < 5; i++)
            this._taskLines.push(root.GetChild("TaskLine" + i));
    }

    _BindLevels(root, bind)
    {
        var self = this;
        this._levels = root.GetChild("Levels");
        this._levelsStatus = this._levels.GetChild("LevelsStatus");
        this._levelRows = [];
        for (var i = 0; i < this.levelRows; i++)
        {
            (function(row) {
                var button = self._levels.GetChild("LevelRow" + row + "/Btn");
                if (!button)
                    return;
                self._levelRows.push(button);
                button.onClick = function() { self.PickLevel(self._listFirst + row); };
                button.onScrolled = function(delta) { self.ScrollLevels(delta > 0 ? -1 : 1); };
            })(i);
        }
        this._levelsScroll = this._levels.GetChild("LevelsScroll");
        this._levelsScroll.onChange = function(value) {
            if (self._syncingScroll)
                return;
            self._listFirst = Math.round(value);
            self._SyncLevels();
        };
        bind("Levels/LevelsDoneBtn", function() { self.CloseLevels(); });
        this._levels.GetChild("Dim").onClick = function() { self.CloseLevels(); };
    }

    _BindTasks(root, bind)
    {
        var self = this;
        this._tasks = root.GetChild("Tasks");
        this._tasksStatus = this._tasks.GetChild("TasksStatus");
        this._addTask = this._tasks.GetChild("AddTaskBtn");
        this._taskRows = [];
        for (var i = 0; i < WordFallLevelDraft.TaskLimit; i++)
        {
            (function(index) {
                var part = function(name) { return self._tasks.GetChild("Task" + index + name); };
                var row = { type: part("Type"), value: part("Value"), aMinus: part("AMinus"), a: part("A"), aPlus: part("APlus"),
                            bMinus: part("BMinus"), b: part("B"), bPlus: part("BPlus"), remove: part("Delete"), icons: {} };
                WordFallConfigs.TaskTypes.forEach(function(type) { row.icons[type] = part("Icon" + type); });
                self._taskRows.push(row);
                var task = function(action) { return function() { self._Edit(function(d) { action(d, index); }); }; };
                row.type.GetChild("Btn").onClick = function() { self.OpenTypePicker(index); };
                row.value.GetChild("Btn").onClick = function() { self.OnTaskValue(index); };
                row.aMinus.GetChild("Btn").onClick = task(function(d, i) { self._StepTaskA(d, i, -1); });
                row.aPlus.GetChild("Btn").onClick = task(function(d, i) { self._StepTaskA(d, i, 1); });
                row.bMinus.GetChild("Btn").onClick = task(function(d, i) { d.SetTaskCount(i, d.tasks[i].count - 1); });
                row.bPlus.GetChild("Btn").onClick = task(function(d, i) { d.SetTaskCount(i, d.tasks[i].count + 1); });
                row.remove.GetChild("Btn").onClick = task(function(d, i) { d.RemoveTask(i); });
            })(i);
        }
        bind("Tasks/AddTaskBtn", function() { self.OpenTypePicker(-1); });
        bind("Tasks/TasksDoneBtn", function() { self.CloseTasks(); });
        this._tasks.GetChild("Dim").onClick = function() { self.CloseTasks(); };
    }

    _BindTypePicker(root, bind)
    {
        var self = this;
        this._typePicker = root.GetChild("TypePicker");
        WordFallConfigs.TaskTypes.forEach(function(type) {
            bind("TypePicker/Type" + type, function() { self.PickTaskType(type); });
        });
        bind("TypePicker/TypeCancelBtn", function() { self.CloseTypePicker(); });
        this._typePicker.GetChild("Dim").onClick = function() { self.CloseTypePicker(); };
    }

    _BindWords(root, bind)
    {
        var self = this;
        this._words = root.GetChild("Words");
        this._wordsCount = this._words.GetChild("WordsCount");
        this._agentPreview = this._words.GetChild("AgentPreview");
        this._wordRowsView = [];
        for (var i = 0; i < this.wordRows; i++)
        {
            (function(row) {
                var button = self._words.GetChild("WordRow" + row + "/Btn");
                var remove = self._words.GetChild("WordRow" + row + "Delete");
                self._wordRowsView.push({ button: button, holder: self._words.GetChild("WordRow" + row), remove: remove });
                button.onClick = function() { self.OpenPalette("word", -1, self._wordsFirst + row); };
                button.onScrolled = function(delta) { self.ScrollWords(delta > 0 ? -1 : 1); };
                remove.GetChild("Btn").onClick = function() {
                    var at = self._wordsFirst + row;
                    self._Edit(function(d) { d.RemoveWord(at); });
                };
            })(i);
        }
        bind("Words/WordsUpBtn", function() { self.ScrollWords(-1); });
        bind("Words/WordsDownBtn", function() { self.ScrollWords(1); });
        bind("Words/AddWordBtn", function() { self.OpenPalette("word", -1, -1); });
        bind("Words/AgentPickBtn", function() { self.BakeAgentWords(); });
        bind("Words/WordsDoneBtn", function() { self.CloseWords(); });
        this._words.GetChild("Dim").onClick = function() { self.CloseWords(); };

        // длина 0 — «по сложности»: из неё «+» ведёт сразу к 2, а «-» от 2 — обратно к 0
        var lengthStep = function(current, value) { return value <= 0 ? 0 : value < 2 ? (current == 0 ? 2 : 0) : value; };
        var lengthShow = function(get) { return function(d) { return get(d) > 0 ? "" + get(d) : "авто"; }; };
        this._BindSteppers(this._words, {
            AgentCount: { get: function(d) { return d.wordsAuto; }, set: function(d, v) { d.SetWordsAuto(v); }, step: 1 },
            AgentMin: { get: function(d) { return d.wordMinLength; }, set: function(d, v) { d.SetWordMinLength(lengthStep(d.wordMinLength, v)); }, step: 1,
                        show: lengthShow(function(d) { return d.wordMinLength; }) },
            AgentMax: { get: function(d) { return d.wordMaxLength; }, set: function(d, v) { d.SetWordMaxLength(lengthStep(d.wordMaxLength, v)); }, step: 1,
                        show: lengthShow(function(d) { return d.wordMaxLength; }) }
        }, "Words/");
    }

    _BindPalette(root, bind)
    {
        var self = this;
        this._palette = root.GetChild("Palette");
        this._paletteTitle = this._palette.GetChild("Title");
        this._paletteRandom = this._palette.GetChild("RandomBtn");
        this._paletteCancel = this._palette.GetChild("CancelBtn");
        var letters = WordFallLevelEditorView.Letters;
        for (var i = 0; i < letters.length; i++)
        {
            (function(letter, index) {
                var button = self._palette.GetChild("Letter" + index);
                if (!button)
                    return;
                self._Paint(self._TileView(button), { hole: false, letter: letter, overlay: "", crate: 0, item: "" });
                button.onClick = function() { self.PickLetter(letter); };
            })(letters[i], i);
        }
        this._keys = [];
        var keys = WordFallLevelEditorView.NameKeys;
        for (var i = 0; i < keys.length; i++)
        {
            (function(key, index) {
                var button = self._palette.GetChild("Key" + index);
                if (!button)
                    return;
                self._keys.push(button);
                self._Paint(self._TileView(button), { hole: false, letter: "", overlay: "", crate: 0, item: "" }, key);
                button.onClick = function() { self.PickLetter(key == "_" ? " " : key); };
            })(keys[i], i);
        }
        bind("Palette/RandomBtn", function() { self.PickLetter(""); });
        bind("Palette/CancelBtn", function() { self.ClosePalette(); });
        this._palette.GetChild("Dim").onClick = function() { self.ClosePalette(); };
    }

    _BindFiles(root, bind)
    {
        var self = this;
        this._files = root.GetChild("Files");
        this._filesStatus = this._files.GetChild("FilesStatus");
        this._files.GetChild("Note").SetText(WordFallFileIO.SaveHint());
        this._files.GetChild("Note2").SetText(WordFallFileIO.LoadHint());

        bind("Files/SaveCampaignBtn", function() { self.SaveCampaignFile(); });
        bind("Files/SaveLevelBtn", function() { self.SaveLevelFile(); });
        bind("Files/LoadBtn", function() { self.LoadFile(); });
        bind("Files/ImportMatch3Btn", function() { self.ImportMatch3(); });
        bind("Files/ExportBtn", function() { self.Export(); });
        bind("Files/FilesDoneBtn", function() { self.CloseFiles(); });
        this._files.GetChild("Dim").onClick = function() { self.CloseFiles(); };
    }

    // Повторное открытие: уровень игры мог смениться, черновик перечитывается
    OnEnabled()
    {
        if (this._draft)
        {
            this.CloseFiles();
            this.Open(this._svc.GetLevelIndex());
        }
    }

    // Выбор файла в браузере асинхронный: прочитанное забирается здесь
    Update(dt)
    {
        var result = WordFallFileIO.TakeResult();
        if (!result)
            return;

        if (!result.ok)
        {
            this._SetFilesStatus(result.message);
            return;
        }

        var before = this._svc.GetEditorState();
        var imported = this._svc.ImportJson(result.text, this._index);
        if (imported.ok)
            this._Remember(before, this._index);
        this.Open(Math.min(this._index, this._svc.GetLevelCount() - 1));
        this._SetFilesStatus(imported.message);
    }

    GetLevelIndex() { return this._index; }
    GetTool() { return this._tool; }
    GetCrateGrade() { return this._draft ? this._draft.crateGrade : 1; }
    IsPaletteOpen() { return this._palette && this._palette.IsEnabled(); }
    IsTasksOpen() { return this._tasks && this._tasks.IsEnabled(); }
    IsFilesOpen() { return this._files && this._files.IsEnabled(); }
    IsLevelsOpen() { return this._levels && this._levels.IsEnabled(); }
    IsWordsOpen() { return this._words && this._words.IsEnabled(); }
    IsTypePickerOpen() { return this._typePicker && this._typePicker.IsEnabled(); }
    CanUndo() { return this._history.CanUndo(); }
    CanRedo() { return this._history.CanRedo(); }
    GetListFirst() { return this._listFirst; }

    _AnyOverlay()
    {
        return this.IsPaletteOpen() || this.IsTasksOpen() || this.IsFilesOpen() || this.IsLevelsOpen() || this.IsWordsOpen() || this.IsTypePickerOpen();
    }

    Open(index)
    {
        var svc = this._svc;
        var grade = this._draft ? this._draft.crateGrade : 1;
        this._index = Math.min(Math.max(index, 0), svc.GetLevelCount() - 1);
        this._draft = new WordFallLevelDraft(svc.GetLevelConfig(this._index), this._columns, this._rows);
        this._draft.SetCrateGrade(grade);
        this.ClosePalette();
        this.CloseTasks();
        this.CloseTypePicker();
        this.CloseWords();
        this.CloseLevels();
        this._SyncAll();
        this._SetStatus(svc.IsLevelNew(this._index) ? "Новый уровень" : svc.IsLevelEdited(this._index) ? "Уровень с правками редактора" : "Уровень кампании без правок");
    }

    SelectTool(name)
    {
        this._tool = name;
        for (var tool in this._tools)
            this._tools[tool].sel.SetEnabled(tool == name);
        this._SyncToolLabel();
    }

    _SyncToolLabel()
    {
        var name = WordFallLevelEditorView.ToolNames[this._tool] || this._tool;
        if (this._tool == "crate")
            name += " — прочность " + this._draft.crateGrade + " (колесо мыши)";
        else if (this._tool != "cell")
            name += " · ЛКМ — поставить, ПКМ — убрать";
        this._toolLabel.SetText("Инструмент: " + name);
        var crate = this._tools["crate"];
        if (crate && this._draft)
            this._PaintTool("crate", crate);
    }

    // --- клетки поля: левый клик — инструмент, правый — убрать, колесо — прочность ящика ---

    OnCell(c, r)
    {
        if (this._AnyOverlay())
            return;

        var cell = { c: c, r: r };
        if (this._tool == "letter")
        {
            this._pendingCell = cell;
            this.OpenPalette("cell", -1);
            return;
        }
        var tool = this._tool;
        this._Edit(function(d) { d.Apply(tool, cell); });
    }

    OnCellRight(c, r)
    {
        if (this._AnyOverlay())
            return;
        var tool = this._tool;
        this._Edit(function(d) { d.Remove(tool, { c: c, r: r }); });
    }

    OnCellWheel(c, r, delta)
    {
        if (this._AnyOverlay() || delta == 0)
            return;
        var cell = { c: c, r: r };
        var step = delta > 0 ? 1 : -1;
        if (this._draft.GetCell(cell).crate > 0)
            this._Edit(function(d) { d.StepCellCrate(cell, step); });
        else if (this._tool == "crate")
            this.OnToolWheel("crate", delta);
    }

    // Колесо над инструментом ящика: прочность, с которой ставятся новые ящики
    OnToolWheel(name, delta)
    {
        if (name != "crate" || delta == 0)
            return;
        this._draft.StepCrateGrade(delta > 0 ? 1 : -1);
        this.SelectTool("crate");
    }

    // --- правки: снимок до правки уходит в историю ---

    _Edit(change)
    {
        var before = this._svc.GetEditorState();
        change(this._draft);
        this._svc.SetLevelConfig(this._index, this._draft.ToConfig());
        if (this._Remember(before, this._index))
            this._SetStatus("Сохранено");
        this._SyncAll();
    }

    // Правка структуры кампании: change возвращает номер уровня, который открыть
    _Structure(change, message)
    {
        var before = this._svc.GetEditorState();
        var from = this._index;
        var index = change();
        this._Remember(before, from);
        this.Open(index);
        this._SetStatus(message);
    }

    _Remember(before, index)
    {
        if (before === this._svc.GetEditorState())
            return false;
        this._history.Push({ state: before, index: index });
        return true;
    }

    Undo()
    {
        if (this._AnyOverlay())
            return;
        var snapshot = this._history.Undo({ state: this._svc.GetEditorState(), index: this._index });
        if (!snapshot)
            return;
        this._svc.SetEditorState(snapshot.state);
        this.Open(snapshot.index);
        this._SetStatus("Шаг назад: осталось " + this._history.UndoCount());
    }

    Redo()
    {
        if (this._AnyOverlay())
            return;
        var snapshot = this._history.Redo({ state: this._svc.GetEditorState(), index: this._index });
        if (!snapshot)
            return;
        this._svc.SetEditorState(snapshot.state);
        this.Open(snapshot.index);
        this._SetStatus("Шаг вперёд: осталось " + this._history.RedoCount());
    }

    // --- структура кампании ---

    NewLevel()
    {
        var svc = this._svc;
        var self = this;
        this._Structure(function() { return svc.CreateLevel(self._index + 1); }, "Создан уровень");
        this._SetStatus("Создан уровень " + svc.GetLevelId(this._index));
    }

    DuplicateLevel()
    {
        var svc = this._svc;
        var self = this;
        var source = svc.GetLevelId(this._index);
        this._Structure(function() { return svc.DuplicateLevel(self._index); }, "");
        this._SetStatus("Копия " + source + " → " + svc.GetLevelId(this._index));
    }

    DeleteLevel()
    {
        var svc = this._svc;
        var self = this;
        var id = svc.GetLevelId(this._index);
        if (svc.GetLevelCount() <= 1)
        {
            this._SetStatus("Последний уровень не удаляется");
            return;
        }
        this._Structure(function() { return svc.RemoveLevel(self._index); }, "Удалён уровень " + id + " (шаг назад вернёт)");
    }

    MoveLevel(direction)
    {
        var svc = this._svc;
        var self = this;
        var id = svc.GetLevelId(this._index);
        this._Structure(function() { return svc.MoveLevel(self._index, self._index + direction); }, "");
        this._SetStatus(id + " теперь " + (this._index + 1) + "-й");
    }

    // --- список уровней с бегунком ---

    OpenLevels()
    {
        this._CloseOverlays();
        var visible = this._levelRows.length;
        this._listFirst = Math.min(Math.max(this._index - Math.floor(visible/2), 0), Math.max(0, this._svc.GetLevelCount() - visible));
        this._levels.SetEnabled(true);
        this._SyncLevels();
    }

    CloseLevels()
    {
        if (this._levels)
            this._levels.SetEnabled(false);
    }

    ScrollLevels(rows)
    {
        this._listFirst += rows;
        this._SyncLevels();
    }

    // Бегунок в позицию первой видимой строки (для тестов и колеса)
    ScrollLevelsTo(first)
    {
        this._listFirst = first;
        this._SyncLevels();
    }

    PickLevel(index)
    {
        this.CloseLevels();
        this.Open(index);
    }

    // Подпись строки списка: номер, id, имя и слова уровня
    LevelCaption(index)
    {
        var svc = this._svc;
        var level = svc.GetLevelConfig(index);
        var words = level.words.slice(0, 2).join(", ") + (level.words.length > 2 ? "…" : "") + (level.wordsAuto > 0 ? " +" + level.wordsAuto + " агент" : "");
        var marks = (svc.IsLevelNew(index) ? " • новый" : svc.IsLevelEdited(index) ? " • правки" : "");
        return (index == this._index ? "> " : "") + (index + 1) + ". " + level.id + (level.name ? " " + level.name : "")
             + (words ? " · " + words : "") + " · ходы " + level.moves + marks;
    }

    _SyncLevels()
    {
        var count = this._svc.GetLevelCount();
        var visible = this._levelRows.length;
        this._listFirst = Math.min(Math.max(this._listFirst, 0), Math.max(0, count - visible));
        for (var i = 0; i < visible; i++)
        {
            var index = this._listFirst + i;
            var holder = this._levels.GetChild("LevelRow" + i);
            holder.SetEnabled(index < count);
            if (index < count)
                this._levelRows[i].SetCaption(this.LevelCaption(index));
        }

        this._syncingScroll = true;
        this._levelsScroll.SetValueRange(0, Math.max(0, count - visible));
        this._levelsScroll.SetScrollHandleSize(visible);
        this._levelsScroll.SetValueForcible(this._listFirst);
        this._syncingScroll = false;
        this._levelsStatus.SetText("Уровни " + (this._listFirst + 1) + "–" + Math.min(count, this._listFirst + visible) + " из " + count
                                   + " · колесо или бегунок — прокрутка");
    }

    // --- палитра: буква клетки, буква задачи, слово уровня, имя уровня ---

    OpenPalette(mode, taskIndex, wordIndex)
    {
        this._paletteMode = mode;
        this._paletteTask = taskIndex;
        this._paletteWord = wordIndex !== undefined ? wordIndex : -1;
        if (mode == "word" && this._paletteWord >= this._draft.words.length)
            return;
        var words = mode == "word" || mode == "name";
        this._paletteRandom.SetEnabled(mode != "letter");
        this._paletteRandom.GetChild("Btn").SetCaption(words ? "СТЕРЕТЬ" : "СЛУЧАЙНАЯ");
        this._paletteCancel.GetChild("Btn").SetCaption(words ? "ГОТОВО" : "ОТМЕНА");
        for (var i = 0; i < this._keys.length; i++)
            this._keys[i].SetEnabled(mode == "name");
        this._SyncPaletteTitle();
        this._palette.SetEnabled(true);
    }

    _SyncPaletteTitle()
    {
        var text = "БУКВА В КЛЕТКЕ";
        if (this._paletteMode == "word")
            text = "СЛОВО: " + (this._paletteWord >= 0 && this._draft.words[this._paletteWord] ? this._draft.words[this._paletteWord] : "…");
        else if (this._paletteMode == "letter")
            text = "БУКВА ЗАДАЧИ";
        else if (this._paletteMode == "name")
            text = "ИМЯ: " + (this._draft.name || "…");
        this._paletteTitle.SetText(text);
    }

    // Выбор в палитре: буква или пустая (случайная буква клетки / стирание последней буквы)
    PickLetter(letter)
    {
        var draft = this._draft;
        var self = this;
        if (this._paletteMode == "word")
        {
            this._Edit(function(d) {
                if (self._paletteWord < 0)
                {
                    if (letter)
                        self._paletteWord = d.words.push(letter) - 1;
                    return;
                }
                var word = d.words[self._paletteWord] || "";
                d.SetWord(self._paletteWord, letter ? word + letter : word.substring(0, word.length - 1));
            });
            this._SyncPaletteTitle();
            return;
        }

        if (this._paletteMode == "name")
        {
            this._Edit(function(d) {
                var name = d.name || "";
                d.name = letter ? (name + letter).substring(0, 24) : name.substring(0, name.length - 1);
            });
            this._SyncPaletteTitle();
            return;
        }

        if (this._paletteMode == "letter")
        {
            var task = this._paletteTask;
            this.ClosePalette();
            this._Edit(function(d) { d.SetTaskLetter(task, letter); });
            return;
        }

        var cell = this._pendingCell;
        this.ClosePalette();
        if (!cell)
            return;

        this._Edit(function(d) {
            if (letter)
                d.SetLetter(cell, letter);
            else
                d.ClearLetter(cell);
        });
    }

    ClosePalette()
    {
        var wasWords = this._palette && this._palette.IsEnabled() && (this._paletteMode == "word" || this._paletteMode == "name");
        this._pendingCell = null;
        this._paletteTask = -1;
        if (this._palette)
            this._palette.SetEnabled(false);
        // пустые слова не доживают до уровня; имя без пробелов по краям
        if (wasWords && this._draft)
        {
            var draft = this._draft;
            var dirty = draft.words.some(function(word) { return !word; }) || draft.name != (draft.name || "").trim();
            if (dirty)
            {
                draft.CleanWords();
                draft.SetName(draft.name);
                this._svc.SetLevelConfig(this._index, draft.ToConfig());
            }
            this._SyncAll();
        }
    }

    // --- слова уровня и агент подбора ---

    OpenWords()
    {
        this._CloseOverlays();
        this._wordsFirst = 0;
        this._words.SetEnabled(true);
        this._SyncWordsOverlay();
    }

    CloseWords()
    {
        if (this._words)
            this._words.SetEnabled(false);
    }

    ScrollWords(rows)
    {
        this._wordsFirst = Math.min(Math.max(this._wordsFirst + rows, 0), Math.max(0, this._draft.words.length - this._wordRowsView.length));
        this._SyncWordsOverlay();
    }

    // Слова агента становятся словами уровня: агент больше не подбирает, слова видны и правятся
    BakeAgentWords()
    {
        var svc = this._svc;
        var picked = svc.PickLevelWords(this._draft.ToConfig(), this._draft.wordsAuto);
        if (picked.length == 0)
        {
            this._SetStatus("Агенту нечего подбирать: задайте число слов");
            return;
        }
        this._Edit(function(d) {
            picked.forEach(function(word) { d.AddWord(word); });
            d.SetWordsAuto(0);
        });
        this._SetStatus("Слова агента зафиксированы: " + picked.join(", "));
    }

    _SyncWordsOverlay()
    {
        if (!this._words || !this._words.IsEnabled())
            return;
        var draft = this._draft;
        var words = draft.words;
        for (var i = 0; i < this._wordRowsView.length; i++)
        {
            var at = this._wordsFirst + i;
            var row = this._wordRowsView[i];
            row.holder.SetEnabled(at < words.length);
            row.remove.SetEnabled(at < words.length);
            if (at < words.length)
                row.button.SetCaption((at + 1) + ". " + (words[at] || "…"));
        }
        this._wordsCount.SetText("Вручную: " + words.length + (words.length > this._wordRowsView.length ? " (колесо — прокрутка)" : ""));
        for (var key in this._values)
        {
            if (key.indexOf("Agent") == 0)
                this._values[key].label.SetText(this._values[key].show ? this._values[key].show(draft) : "" + this._values[key].get(draft));
        }

        var config = draft.ToConfig();
        var range = WordFallWordAgent.LengthRange(config);
        var preview = this._svc.PreviewLevelWords(config).slice(draft.words.length);
        this._agentPreview.SetText(draft.wordsAuto > 0
            ? "Агент (сложность " + draft.difficulty + ", длина " + range.min + "–" + range.max + ") на этом словаре: " + preview.join(", ")
              + ".\nЦель по очкам с этими словами: " + this._svc.PreviewTargetScore(config)
            : "Агент выключен: задайте число слов. Слова подберутся на старте уровня по словарю языка — уровень локализуется заменой словаря.");
    }

    // --- задачи уровня ---

    OpenTasks()
    {
        this._CloseOverlays();
        this._tasks.SetEnabled(true);
        this._SyncTasks();
    }

    CloseTasks()
    {
        if (this._tasks)
            this._tasks.SetEnabled(false);
    }

    // Выбор типа: для задачи index или для новой задачи (-1)
    OpenTypePicker(index)
    {
        if (index < 0 && this._draft.tasks.length >= WordFallLevelDraft.TaskLimit)
        {
            this._tasksStatus.SetText("Задач не больше " + WordFallLevelDraft.TaskLimit);
            return;
        }
        this._typeTarget = index;
        this._typePicker.SetEnabled(true);
    }

    CloseTypePicker()
    {
        if (this._typePicker)
            this._typePicker.SetEnabled(false);
    }

    PickTaskType(type)
    {
        var target = this._typeTarget;
        this.CloseTypePicker();
        this._Edit(function(d) {
            if (target < 0)
            {
                var fields = { taskType: type, count: type == "Letter" ? 3 : type == "Length" ? 2 : 1, letter: type == "Letter" ? "О" : "" };
                if (type == "Powerup")
                    fields.powerupKind = "bomb";
                d.AddTask(fields);
            }
            else
                d.SetTaskType(target, type);
        });
    }

    // Кнопка значения в строке задачи: буква — через палитру, вид бонуса — по кругу
    OnTaskValue(index)
    {
        var task = this._draft.tasks[index];
        if (!task)
            return;

        if (task.taskType == "Letter")
            this.OpenPalette("letter", index);
        else if (task.taskType == "Powerup")
            this._Edit(function(d) { d.CycleTaskPowerupKind(index); });
    }

    // Первый степпер строки: длина слова или порог очков
    _StepTaskA(draft, index, direction)
    {
        var task = draft.tasks[index];
        if (task.taskType == "Length")
            draft.SetTaskLength(index, task.length + direction);
        else if (task.taskType == "WordScore")
            draft.SetTaskScore(index, task.scoreThreshold + direction*2);
    }

    _SyncTasks()
    {
        var tasks = this._draft.tasks;
        var names = WordFallLevelEditorView.TaskTypeNames;
        for (var i = 0; i < this._taskRows.length; i++)
        {
            var row = this._taskRows[i];
            var task = i < tasks.length ? tasks[i] : null;
            for (var key in row)
            {
                if (key != "icons")
                    row[key].SetEnabled(!!task);
            }
            for (var type in row.icons)
                row.icons[type].SetEnabled(!!task && task.taskType == type);
            if (!task)
                continue;

            var type = task.taskType;
            row.type.GetChild("Btn").SetCaption(names[type] || type);

            var value = type == "Letter" ? (task.letter || "?")
                      : type == "Powerup" ? (WordFallLevelEditorView.PowerupNames[task.powerupKind] || task.powerupKind) : "";
            row.value.SetEnabled(value.length > 0);
            row.value.GetChild("Btn").SetCaption(value);

            var showA = type == "Length" || type == "WordScore";
            row.aMinus.SetEnabled(showA);
            row.a.SetEnabled(showA);
            row.aPlus.SetEnabled(showA);
            row.a.SetText(type == "Length" ? task.length + " б." : task.scoreThreshold + "+");

            var showB = ["Length", "Powerup", "AnyWords", "Letter", "Deliver", "Melt"].indexOf(type) >= 0;
            row.bMinus.SetEnabled(showB);
            row.b.SetEnabled(showB);
            row.bPlus.SetEnabled(showB);
            row.b.SetText("×" + task.count);
        }
        this._addTask.SetEnabled(tasks.length < WordFallLevelDraft.TaskLimit);
        this._tasksStatus.SetText(this._TasksProblem() || "Задач: " + tasks.length + " из " + WordFallLevelDraft.TaskLimit);
    }

    // Первая цель, которую игрок не сможет закрыть как есть
    _TasksProblem()
    {
        var draft = this._draft;
        var dictionary = this._svc.GetDictionary();
        for (var i = 0; i < draft.words.length; i++)
        {
            if (draft.words[i] && !dictionary.Contains(draft.words[i]))
                return "Слова «" + draft.words[i] + "» нет в словаре";
        }
        for (var i = 0; i < draft.tasks.length; i++)
        {
            if (draft.tasks[i].taskType == "Letter" && !draft.tasks[i].letter)
                return "Задача " + (i + 1) + ": буква не выбрана";
        }
        return "";
    }

    Play()
    {
        this._svc.StartLevel(this._index);
        var fx = WordFallViews.fx;
        if (fx)
            fx.Finish();
        if (WordFallGame.screens)
            WordFallGame.screens.ShowGame();
    }

    Close()
    {
        if (WordFallGame.screens)
            WordFallGame.screens.ShowGame();
    }

    Reset()
    {
        var svc = this._svc;
        var self = this;
        this._Structure(function() { svc.ResetLevelConfig(self._index); return self._index; }, "Правки сняты, уровень исходный");
    }

    // --- файлы: кампания и уровень уходят игроку и возвращаются обратно; поле из «три в ряд» ---

    OpenFiles()
    {
        this._CloseOverlays();
        this._files.SetEnabled(true);
        this._SetFilesStatus("Уровень " + this._svc.GetLevelId(this._index) + " (" + (this._index + 1) + " из " + this._svc.GetLevelCount()
                             + "), с правками: " + this._svc.GetEditedLevelCount());
    }

    CloseFiles()
    {
        if (this._files)
            this._files.SetEnabled(false);
    }

    _CloseOverlays()
    {
        this.ClosePalette();
        this.CloseTasks();
        this.CloseTypePicker();
        this.CloseWords();
        this.CloseLevels();
        this.CloseFiles();
    }

    CampaignFileName() { return "wordfall_campaign.json"; }
    LevelFileName() { return "wordfall_level_" + this._svc.GetLevelId(this._index) + ".json"; }

    SaveCampaignFile()
    {
        this._SetFilesStatus(WordFallFileIO.SaveText(this.CampaignFileName(), this._svc.GetCampaignJson()).message);
    }

    SaveLevelFile()
    {
        this._SetFilesStatus(WordFallFileIO.SaveText(this.LevelFileName(), this._svc.GetLevelJson(this._index)).message);
    }

    // Ответ прилетает в Update: в браузере файл выбирается диалогом устройства
    LoadFile()
    {
        this._SetFilesStatus(WordFallFileIO.PickText([this.CampaignFileName(), this.LevelFileName()]).message);
    }

    // Уровень Gardenscapes / Homescapes (XML): форма поля и препятствия ложатся на текущий уровень
    ImportMatch3()
    {
        this._SetFilesStatus(WordFallFileIO.PickText([this._svc.match3ImportPath], ".xml,text/xml,application/xml").message);
    }

    Export()
    {
        var path = this._svc.campaignExportPath;
        this._SetFilesStatus(this._svc.ExportCampaign() ? "Кампания записана в " + path : "Не удалось записать " + path);
    }

    _SetStatus(text) { this._statusLabel.SetText(text); }

    _SetFilesStatus(text)
    {
        this._filesStatus.SetText(text);
        this._SetStatus(text);
    }

    _SyncAll()
    {
        var draft = this._draft;
        var svc = this._svc;
        this._levelPick.SetCaption((this._index + 1) + "/" + svc.GetLevelCount() + " · " + draft.id + (draft.name ? " · " + draft.name : ""));
        for (var key in this._values)
        {
            var value = this._values[key];
            value.label.SetText(value.show ? value.show(draft) : "" + value.get(draft));
        }
        this._autoTarget.SetCaption(draft.autoTarget ? "АВТО: ДА" : "АВТО");
        for (var i = 0; i < this._charges.length; i++)
            this._charges[i].SetCaption("" + (draft.boosterCharges[i] || 0));
        this._undo.SetTransparency(this._history.CanUndo() ? 1 : 0.45);
        this._redo.SetTransparency(this._history.CanRedo() ? 1 : 0.45);
        this._SyncGoals();
        this._SyncTasks();
        this._SyncWordsOverlay();
        this._SyncToolLabel();

        for (var c = 0; c < this._columns; c++)
        {
            for (var r = 0; r < this._rows; r++)
            {
                var cell = draft.GetCell({ c: c, r: r });
                var view = this._tiles[c][r];
                view.cellBack.SetEnabled(!cell.hole);
                if (cell.hole)
                    this._PaintHole(view);
                else
                    this._Paint(view, cell);
            }
        }
    }

    // Превью слов: заданные вручную — светлыми плашками, подобранные агентом — тёмными;
    // не влезающие в четыре ряда — «ещё N»; задачи — строками
    _SyncGoals()
    {
        var draft = this._draft;
        var words = this._svc.PreviewLevelWords(draft.ToConfig());
        var manual = draft.words.length;
        var rows = this._wordTiles.length;
        var shown = words.length > rows ? rows - 1 : words.length;
        for (var r = 0; r < rows; r++)
        {
            var word = r < shown ? words[r] : "";
            for (var i = 0; i < this._wordTiles[r].length; i++)
            {
                var view = this._wordTiles[r][i];
                view.widget.SetEnabled(i < word.length);
                if (i < word.length)
                {
                    view.letter.text = word[i];
                    view.agent.SetEnabled(r >= manual);
                }
            }
        }
        this._wordsMore.SetEnabled(words.length > rows);
        this._wordsMore.SetText("ещё " + (words.length - shown) + " " + WordFallConfigs.WordsNoun(words.length - shown));
        this._wordsTitle.SetText("СЛОВА: " + manual + (draft.wordsAuto > 0 ? " + " + (words.length - manual) + " агент" : ""));

        var tasks = draft.tasks;
        this._tasksTitle.SetText("ЗАДАЧИ: " + tasks.length);
        for (var i = 0; i < this._taskLines.length; i++)
            this._taskLines[i].SetText(i < tasks.length ? (i + 1) + ". " + WordFallConfigs.TaskCaption(tasks[i]) : (i == 0 ? "нет задач" : ""));
        var problem = this._TasksProblem();
        if (problem)
            this._SetStatus(problem);
    }

    // Для тестов: что видно в превью слов
    GetShownWords()
    {
        var result = [];
        for (var r = 0; r < this._wordTiles.length; r++)
        {
            var word = "";
            for (var i = 0; i < this._wordTiles[r].length && this._wordTiles[r][i].widget.IsEnabled(); i++)
                word += this._wordTiles[r][i].letter.text;
            if (word)
                result.push(word);
        }
        return { words: result, more: this._wordsMore.IsEnabled() ? this._wordsMore.GetText() : "" };
    }

    _TileView(btn)
    {
        var layer = function(name) { return btn.GetLayer(name); };
        var glow = layer("bonusGlow");
        return {
            btn: btn, back: layer("back"), sel: layer("sel"), ice: layer("ice"), stone: layer("stone"),
            crate: layer("crate"), crateHit: layer("crateHit"), chain: layer("chain"), snow: layer("snow"),
            parcel: layer("parcel"), bomb: layer("bomb"), rocket: layer("rocket"), fireworks: layer("fireworks"),
            bonusPlate: layer("bonusPlate"), bonusGlow: glow, bonusGlowDraw: glow ? glow.drawable : null,
            letter: layer("letter").drawable, points: layer("points").drawable
        };
    }

    // Плитка по клетке черновика; caption — подпись вместо буквы (для инструментов)
    _Paint(view, cell, caption)
    {
        var isBonus = cell.item == "bomb" || cell.item == "rocket" || cell.item == "fireworks";
        var hasLetter = cell.letter.length > 0 || caption !== undefined;
        var value = cell.letter ? this._svc.GetLetterValue(cell.letter) : 0;

        view.back.transparency = 1;
        // у ящика вместо буквы — его прочность
        view.letter.text = caption !== undefined ? caption : cell.crate > 0 ? "" + cell.crate : cell.letter;
        view.letter.height = caption !== undefined && caption.length > 2 ? 15 : 44;
        view.letter.color = cell.overlay == "ice" ? new Color4(44, 106, 158, 255)
                          : cell.overlay == "stone" ? new Color4(245, 245, 248, 255)
                          : cell.crate > 0 ? new Color4(255, 246, 225, 255)
                          : new Color4(52, 26, 12, 255);
        view.points.text = hasLetter && value > 0 ? "" + value : "";

        view.back.SetEnabled(!isBonus && cell.crate == 0 && cell.item != "snow");
        view.crate.SetEnabled(cell.crate > 1);
        view.crateHit.SetEnabled(cell.crate == 1);
        view.chain.SetEnabled(cell.overlay == "chain");
        view.snow.SetEnabled(cell.item == "snow");
        view.parcel.SetEnabled(cell.item == "parcel");
        view.ice.SetEnabled(cell.overlay == "ice");
        view.stone.SetEnabled(cell.overlay == "stone");
        view.bomb.SetEnabled(cell.item == "bomb");
        view.rocket.SetEnabled(cell.item == "rocket");
        view.fireworks.SetEnabled(cell.item == "fireworks");
        view.bonusPlate.SetEnabled(isBonus);
        if (view.bonusGlow)
        {
            view.bonusGlow.SetEnabled(isBonus);
            if (isBonus)
                view.bonusGlowDraw.SetTransparency(0.6);
        }
    }

    // Дыра: бледный контур плитки, чтобы клетку можно было вернуть тапом
    _PaintHole(view)
    {
        this._Paint(view, { hole: true, letter: "", overlay: "", crate: 0, item: "" });
        view.back.transparency = 0.15;
    }

    // Плитки инструментов: клетка — «±», ящик — с прочностью кисти, накладки — на букве
    _PaintTool(name, view)
    {
        var cell = { hole: false, letter: "", overlay: "", crate: 0, item: "" };
        var caption;
        if (name == "cell")
            caption = "+/-";
        else if (name == "erase")
            caption = "СТЕРЕТЬ";
        else if (name == "letter")
            cell.letter = "А";
        else if (name == "crate")
        {
            cell.crate = this._draft ? this._draft.crateGrade : 1;
            caption = "" + cell.crate;
        }
        else if (WordFallLevelDraft.Overlays.indexOf(name) >= 0)
        {
            cell.overlay = name;
            cell.letter = "А";
        }
        else
            cell.item = name;
        this._Paint(view, cell, caption);
    }
};
