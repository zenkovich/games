globalThis.WordFallGame = globalThis.WordFallGame || {};

// Экран редактора уровней: поле с заданными буквами и препятствиями, инструменты по клеткам,
// параметры и задачи уровня, выбор уровня. Каждая правка сразу уходит в сервис (WordFallGame.service)
// и сохраняется; «Играть» запускает уровень на игровом экране

WordFallLevelEditorView = class WordFallLevelEditorView extends o2.Component
{
    get _svc() { return WordFallGame.service; }

    static get Letters() { return "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЫЬЭЮЯ"; }

    static get ToolNames()
    {
        return { addCell: "Добавить клетку", removeCell: "Удалить клетку", ice: "Лёд", stone: "Камень",
                 crate: "Ящик (повторный тап — прочность)", chain: "Цепь", snow: "Снежок", parcel: "Конверт",
                 bomb: "Бомба", rocket: "Ракета", fireworks: "Салют", letter: "Буква (тап по клетке — выбор)",
                 erase: "Стереть содержимое" };
    }

    static get TaskTypeNames()
    {
        return { Word: "СЛОВО", Length: "ДЛИНА", Powerup: "БОНУС", ClearIce: "ВЕСЬ ЛЁД", AnyWords: "СЛОВА",
                 WordScore: "ОЧКИ СЛОВА", Letter: "БУКВА", Deliver: "КОНВЕРТЫ", Melt: "СНЕЖКИ", Crates: "ЯЩИКИ" };
    }

    static get PowerupNames() { return { bomb: "БОМБА", rocket: "РАКЕТА", fireworks: "САЛЮТ" }; }

    constructor()
    {
        super();
        this._draft = null;
        this._index = 0;
        this._tool = "ice";
        this._tiles = null;
        this._tools = {};
        this._pendingCell = null;   // клетка, для которой открыта палитра букв
        this._paletteMode = "cell"; // cell — буква клетки, word — слово задачи, letter — буква задачи
        this._paletteTask = -1;
        this._taskRows = [];
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
                (function(cc, rr) { view.btn.onClick = function() { self.OnCell(cc, rr); }; })(c, r);
            }
        }

        var tools = root.GetChild("Tools");
        WordFallLevelDraft.Tools.forEach(function(name) {
            var view = self._TileView(tools.GetChild("Tool_" + name));
            self._tools[name] = view;
            view.btn.onClick = function() { self.SelectTool(name); };
            self._PaintTool(name, view);
        });

        this._levelLabel = root.GetChild("LevelLabel");
        this._tasksLabel = root.GetChild("TasksLabel");
        this._statusLabel = root.GetChild("StatusLabel");
        this._toolLabel = root.GetChild("ToolLabel");
        this._values = {};
        this._charges = [];

        var bind = function(name, action) {
            var button = root.GetChild(name + "/Btn");
            if (button)
                button.onClick = action;
        };
        bind("CloseBtn", function() { self.Close(); });
        bind("PrevBtn", function() { self.Open(self._index - 1); });
        bind("NextBtn", function() { self.Open(self._index + 1); });
        bind("PlayBtn", function() { self.Play(); });
        bind("ResetBtn", function() { self.Reset(); });
        bind("ExportBtn", function() { self.Export(); });
        bind("TasksBtn", function() { self.OpenTasks(); });

        var steppers = {
            Moves: { get: function(d) { return d.moves; }, set: function(d, v) { d.SetMoves(v); }, step: 1 },
            Target: { get: function(d) { return d.targetScore; }, set: function(d, v) { d.SetTargetScore(v); }, step: 10 },
            Vowels: { get: function(d) { return d.extraVowels; }, set: function(d, v) { d.SetExtraVowels(v); }, step: 1 },
            Rare: { get: function(d) { return d.extraRare; }, set: function(d, v) { d.SetExtraRare(v); }, step: 1 }
        };
        for (var key in steppers)
        {
            (function(key, stepper) {
                self._values[key] = { label: root.GetChild(key + "Value"), get: stepper.get };
                bind(key + "Minus", function() { stepper.set(self._draft, stepper.get(self._draft) - stepper.step); self._Commit(); });
                bind(key + "Plus", function() { stepper.set(self._draft, stepper.get(self._draft) + stepper.step); self._Commit(); });
            })(key, steppers[key]);
        }
        for (var i = 0; i < 5; i++)
        {
            (function(index) {
                self._charges.push(root.GetChild("Charge" + index + "/Btn"));
                bind("Charge" + index, function() { self._draft.CycleBoosterCharge(index); self._Commit(); });
            })(i);
        }

        this._BindTasks(root, bind);
        this._BindPalette(root, bind);

        this.SelectTool(this._tool);
        this.Open(this._svc.GetLevelIndex());
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
                            bMinus: part("BMinus"), b: part("B"), bPlus: part("BPlus"), remove: part("Delete") };
                if (!row.type)
                    return;
                self._taskRows.push(row);
                var task = function(action) { return function() { action(self._draft, index); self._Commit(); }; };
                row.type.GetChild("Btn").onClick = task(function(d, i) { d.CycleTaskType(i); });
                row.value.GetChild("Btn").onClick = function() { self.OnTaskValue(index); };
                row.aMinus.GetChild("Btn").onClick = task(function(d, i) { self._StepTaskA(d, i, -1); });
                row.aPlus.GetChild("Btn").onClick = task(function(d, i) { self._StepTaskA(d, i, 1); });
                row.bMinus.GetChild("Btn").onClick = task(function(d, i) { d.SetTaskCount(i, d.tasks[i].count - 1); });
                row.bPlus.GetChild("Btn").onClick = task(function(d, i) { d.SetTaskCount(i, d.tasks[i].count + 1); });
                row.remove.GetChild("Btn").onClick = task(function(d, i) { d.RemoveTask(i); });
            })(i);
        }
        bind("Tasks/AddTaskBtn", function() { self._draft.AddTask(); self._Commit(); });
        bind("Tasks/TasksDoneBtn", function() { self.CloseTasks(); });
        var dim = this._tasks.GetChild("Dim");
        if (dim)
            dim.onClick = function() { self.CloseTasks(); };
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
                var view = self._TileView(button);
                self._Paint(view, { hole: false, letter: letter, overlay: "", crate: 0, item: "" });
                button.onClick = function() { self.PickLetter(letter); };
            })(letters[i], i);
        }
        bind("Palette/RandomBtn", function() { self.PickLetter(""); });
        bind("Palette/CancelBtn", function() { self.ClosePalette(); });
        var dim = this._palette.GetChild("Dim");
        if (dim)
            dim.onClick = function() { self.ClosePalette(); };
    }

    // Повторное открытие: уровень игры мог смениться, черновик перечитывается
    OnEnabled()
    {
        if (this._draft)
            this.Open(this._svc.GetLevelIndex());
    }

    GetLevelIndex() { return this._index; }
    GetTool() { return this._tool; }
    IsPaletteOpen() { return this._palette && this._palette.IsEnabled(); }
    IsTasksOpen() { return this._tasks && this._tasks.IsEnabled(); }

    Open(index)
    {
        var svc = this._svc;
        this._index = Math.min(Math.max(index, 0), svc.GetLevelCount() - 1);
        this._draft = new WordFallLevelDraft(svc.GetLevelConfig(this._index), this._columns, this._rows);
        this.ClosePalette();
        this.CloseTasks();
        this._SyncAll();
        this._SetStatus(svc.IsLevelEdited(this._index) ? "Уровень с правками редактора" : "Уровень кампании без правок");
    }

    SelectTool(name)
    {
        this._tool = name;
        for (var tool in this._tools)
            this._tools[tool].sel.SetEnabled(tool == name);
        this._toolLabel.SetText("Инструмент: " + (WordFallLevelEditorView.ToolNames[name] || name));
    }

    OnCell(c, r)
    {
        if (this.IsPaletteOpen() || this.IsTasksOpen())
            return;

        var cell = { c: c, r: r };
        var result = this._draft.Apply(this._tool, cell);
        if (result == "palette")
        {
            this._pendingCell = cell;
            this.OpenPalette("cell", -1);
            return;
        }
        if (result == "changed")
            this._Commit();
    }

    // --- палитра букв: клетка поля, слово задачи или буква задачи ---

    OpenPalette(mode, taskIndex)
    {
        this._paletteMode = mode;
        this._paletteTask = taskIndex;
        this._paletteRandom.SetEnabled(mode != "letter");
        this._paletteRandom.GetChild("Btn").SetCaption(mode == "word" ? "СТЕРЕТЬ" : "СЛУЧАЙНАЯ");
        this._paletteCancel.GetChild("Btn").SetCaption(mode == "word" ? "ГОТОВО" : "ОТМЕНА");
        this._SyncPaletteTitle();
        this._palette.SetEnabled(true);
    }

    _SyncPaletteTitle()
    {
        var task = this._draft.tasks[this._paletteTask];
        this._paletteTitle.SetText(this._paletteMode == "word" ? "СЛОВО: " + (task && task.word ? task.word : "…")
                                 : this._paletteMode == "letter" ? "БУКВА ЗАДАЧИ" : "БУКВА В КЛЕТКЕ");
    }

    // Выбор в палитре: буква или пустая (случайная буква клетки / стирание буквы слова)
    PickLetter(letter)
    {
        var draft = this._draft;
        if (this._paletteMode == "word")
        {
            var word = draft.tasks[this._paletteTask] ? draft.tasks[this._paletteTask].word : "";
            draft.SetTaskWord(this._paletteTask, letter ? word + letter : word.substring(0, word.length - 1));
            this._Commit();
            this._SyncPaletteTitle();
            return;
        }

        if (this._paletteMode == "letter")
        {
            draft.SetTaskLetter(this._paletteTask, letter);
            this.ClosePalette();
            this._Commit();
            return;
        }

        var cell = this._pendingCell;
        this.ClosePalette();
        if (!cell)
            return;

        if (letter)
            draft.SetLetter(cell, letter);
        else
            draft.ClearLetter(cell);
        this._Commit();
    }

    ClosePalette()
    {
        this._pendingCell = null;
        this._paletteTask = -1;
        if (this._palette)
            this._palette.SetEnabled(false);
    }

    // --- задачи уровня ---

    OpenTasks()
    {
        this.ClosePalette();
        this._tasks.SetEnabled(true);
        this._SyncTasks();
    }

    CloseTasks()
    {
        if (this._tasks)
            this._tasks.SetEnabled(false);
    }

    // Кнопка значения в строке задачи: слово и буква — через палитру, вид бонуса — по кругу
    OnTaskValue(index)
    {
        var task = this._draft.tasks[index];
        if (!task)
            return;

        if (task.taskType == "Word")
            this.OpenPalette("word", index);
        else if (task.taskType == "Letter")
            this.OpenPalette("letter", index);
        else if (task.taskType == "Powerup")
        {
            this._draft.CycleTaskPowerupKind(index);
            this._Commit();
        }
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
                row[key].SetEnabled(!!task);
            if (!task)
                continue;

            var type = task.taskType;
            row.type.GetChild("Btn").SetCaption(names[type] || type);

            var value = type == "Word" ? (task.word || "…") : type == "Letter" ? (task.letter || "?")
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

    // Первая задача, которую игрок не сможет закрыть как есть
    _TasksProblem()
    {
        var tasks = this._draft.tasks;
        var dictionary = this._svc.GetDictionary();
        for (var i = 0; i < tasks.length; i++)
        {
            var task = tasks[i];
            if (task.taskType == "Word" && !task.word)
                return "Задача " + (i + 1) + ": слово не задано";
            if (task.taskType == "Word" && !dictionary.Contains(task.word))
                return "Задача " + (i + 1) + ": слова «" + task.word + "» нет в словаре";
            if (task.taskType == "Letter" && !task.letter)
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
        this._svc.ResetLevelConfig(this._index);
        this.Open(this._index);
        this._SetStatus("Правки сняты, уровень исходный");
    }

    Export()
    {
        var path = this._svc.campaignExportPath;
        this._SetStatus(this._svc.ExportCampaign() ? "Кампания записана в " + path : "Не удалось записать " + path);
    }

    _Commit()
    {
        this._svc.SetLevelConfig(this._index, this._draft.ToConfig());
        this._SyncAll();
        this._SetStatus("Сохранено");
    }

    _SetStatus(text) { this._statusLabel.SetText(text); }

    _SyncAll()
    {
        var draft = this._draft;
        this._levelLabel.SetText("УРОВЕНЬ " + (this._index + 1) + " / " + this._svc.GetLevelCount());
        for (var key in this._values)
            this._values[key].label.SetText("" + this._values[key].get(draft));
        for (var i = 0; i < this._charges.length; i++)
            this._charges[i].SetCaption("" + (draft.boosterCharges[i] || 0));
        this._tasksLabel.SetText("Задачи: " + (draft.tasks.length > 0 ? draft.tasks.map(WordFallConfigs.TaskCaption).join(" · ") : "нет"));
        this._SyncTasks();

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
        view.letter.text = caption !== undefined ? caption : cell.letter;
        view.letter.height = caption !== undefined && caption.length > 1 ? 15 : 44;
        view.letter.color = cell.overlay == "ice" ? new Color4(44, 106, 158, 255)
                          : cell.overlay == "stone" ? new Color4(245, 245, 248, 255)
                          : new Color4(74, 48, 34, 255);
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

    // Плитки инструментов: добавить клетку — плитка с «+», удалить — контур дыры с «×»
    _PaintTool(name, view)
    {
        var cell = { hole: false, letter: "", overlay: "", crate: 0, item: "" };
        var caption;
        if (name == "addCell")
            caption = "+";
        else if (name == "removeCell")
            caption = "×";
        else if (name == "erase")
            caption = "СТЕРЕТЬ";
        else if (name == "letter")
            cell.letter = "А";
        else if (name == "crate")
            cell.crate = 2;
        else if (WordFallLevelDraft.Overlays.indexOf(name) >= 0)
        {
            cell.overlay = name;
            cell.letter = "А";
        }
        else
            cell.item = name;
        this._Paint(view, cell, caption);
        if (name == "removeCell")
            view.back.transparency = 0.3;
    }
};
