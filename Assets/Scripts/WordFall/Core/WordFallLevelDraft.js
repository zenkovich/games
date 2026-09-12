include("Scripts/WordFall/Core/WordFallConfigs.js");

// Черновик уровня для редактора: клетка несёт либо букву (случайную или заданную) с
// накладкой лёд/камень/цепь, либо один предмет — ящик, снежок, конверт, бонус, либо дыру.
// Инструмент по клетке ставит своё или снимает то же самое; удаление и добавление клетки —
// отдельные инструменты; ToConfig собирает конфиг уровня
WordFallLevelDraft = class WordFallLevelDraft
{
    static get Tools() { return ["addCell", "removeCell", "ice", "stone", "crate", "chain", "snow", "parcel", "bomb", "rocket", "fireworks", "letter", "erase"]; }
    static get Overlays() { return ["ice", "stone", "chain"]; }
    static get Items() { return ["snow", "parcel", "bomb", "rocket", "fireworks"]; }
    static get ChargeSteps() { return [0, 1, 3, 5, 10, 30]; }
    static get TaskLimit() { return 5; }
    static get PowerupKinds() { return ["bomb", "rocket", "fireworks"]; }

    constructor(config, columns, rows)
    {
        this.columns = columns;
        this.rows = rows;
        this.Load(config);
    }

    static EmptyCell() { return { hole: false, letter: "", overlay: "", crate: 0, item: "" }; }

    Load(config)
    {
        var level = WordFallConfigs.NormalizeLevel(config);
        this.moves = level.moves;
        this.targetScore = level.targetScore;
        this.extraVowels = level.extraVowels;
        this.extraRare = level.extraRare;
        this.boosterCharges = level.boosterCharges.slice();
        this.tasks = level.tasks;
        this.snowPerMove = level.snowPerMove;
        this.parcelTotal = level.parcelTotal;
        this.parcelOnScreen = level.parcelOnScreen;

        this.cells = [];
        for (var c = 0; c < this.columns; c++)
        {
            var column = [];
            for (var r = 0; r < this.rows; r++)
                column.push(WordFallLevelDraft.EmptyCell());
            this.cells.push(column);
        }

        // тот же порядок, что у заполнения поля: первый занявший клетку выигрывает
        var self = this;
        var each = function(list, fn) { list.forEach(function(cell, i) { if (self.IsValidCell(cell)) fn(self.cells[cell.c][cell.r], i); }); };
        each(level.holeCells, function(cell) { cell.hole = true; });
        each(level.letterCells, function(cell, i) { if (!cell.hole) cell.letter = level.letterCells[i].letter; });
        each(level.iceCells, function(cell) { if (WordFallLevelDraft._IsFree(cell)) cell.overlay = "ice"; });
        each(level.stoneCells, function(cell) { if (WordFallLevelDraft._IsFree(cell)) cell.overlay = "stone"; });
        each(level.crateCells, function(cell, i) {
            if (WordFallLevelDraft._IsFree(cell))
                WordFallLevelDraft._Clear(cell).crate = Math.min(Math.max(i < level.crateGrades.length ? level.crateGrades[i] : 1, 1), 3);
        });
        each(level.chainCells, function(cell) { if (WordFallLevelDraft._IsFree(cell)) cell.overlay = "chain"; });
        each(level.snowCells, function(cell) { if (WordFallLevelDraft._IsFree(cell)) WordFallLevelDraft._Clear(cell).item = "snow"; });
        each(level.parcelCells, function(cell) { if (WordFallLevelDraft._IsFree(cell)) WordFallLevelDraft._Clear(cell).item = "parcel"; });
        each(level.powerupCells, function(cell, i) {
            if (i < level.powerupKinds.length && WordFallLevelDraft._IsFree(cell))
                WordFallLevelDraft._Clear(cell).item = level.powerupKinds[i];
        });
    }

    // Клетка с буквой без накладок и предметов — на неё ещё можно что-то поставить
    static _IsFree(cell) { return !cell.hole && !cell.overlay && cell.crate == 0 && !cell.item; }

    static _Clear(cell)
    {
        cell.hole = false;
        cell.letter = "";
        cell.overlay = "";
        cell.crate = 0;
        cell.item = "";
        return cell;
    }

    IsValidCell(cell) { return cell.c >= 0 && cell.c < this.columns && cell.r >= 0 && cell.r < this.rows; }

    GetCell(cell)
    {
        var source = this.cells[cell.c][cell.r];
        return { hole: source.hole, letter: source.letter, overlay: source.overlay, crate: source.crate, item: source.item };
    }

    // Применяет инструмент к клетке: "changed", "" если менять нечего; инструмент буквы выбор
    // не делает — возвращает "palette"
    Apply(tool, cell)
    {
        if (!this.IsValidCell(cell))
            return "";
        if (tool == "letter")
            return "palette";

        var target = this.cells[cell.c][cell.r];
        if (tool == "removeCell")
        {
            if (target.hole)
                return "";
            WordFallLevelDraft._Clear(target).hole = true;
        }
        else if (tool == "addCell")
        {
            if (!target.hole)
                return "";
            WordFallLevelDraft._Clear(target);
        }
        else if (tool == "erase")
            WordFallLevelDraft._Clear(target);
        else if (WordFallLevelDraft.Overlays.indexOf(tool) >= 0)
        {
            if (target.overlay == tool)
                target.overlay = "";
            else
            {
                // накладка живёт на букве: дыра, ящик и предметы уступают, буква остаётся
                var letter = target.letter;
                WordFallLevelDraft._Clear(target);
                target.letter = letter;
                target.overlay = tool;
            }
        }
        else if (tool == "crate")
        {
            if (target.crate > 0)
                target.crate = target.crate < 3 ? target.crate + 1 : 0;
            else
                WordFallLevelDraft._Clear(target).crate = 1;
        }
        else if (WordFallLevelDraft.Items.indexOf(tool) >= 0)
        {
            if (target.item == tool)
                target.item = "";
            else
                WordFallLevelDraft._Clear(target).item = tool;
        }
        return "changed";
    }

    // Заданная буква: дыра, ящик и предметы уступают, накладка остаётся
    SetLetter(cell, letter)
    {
        if (!this.IsValidCell(cell))
            return;

        var target = this.cells[cell.c][cell.r];
        target.hole = false;
        target.crate = 0;
        target.item = "";
        target.letter = letter || "";
    }

    ClearLetter(cell) { this.SetLetter(cell, ""); }

    SetMoves(moves) { this.moves = Math.max(1, Math.floor(moves)); }
    SetTargetScore(score) { this.targetScore = Math.max(10, Math.floor(score)); }
    SetExtraVowels(count) { this.extraVowels = Math.min(Math.max(Math.floor(count), 0), 30); }
    SetExtraRare(count) { this.extraRare = Math.min(Math.max(Math.floor(count), 0), 30); }

    SetBoosterCharge(index, value)
    {
        while (this.boosterCharges.length <= index)
            this.boosterCharges.push(0);
        this.boosterCharges[index] = Math.max(0, Math.floor(value));
    }

    // Следующая ступень зарядов бустера, после последней — ноль
    CycleBoosterCharge(index)
    {
        var current = this.boosterCharges[index] || 0;
        var steps = WordFallLevelDraft.ChargeSteps;
        var next = 0;
        for (var i = 0; i < steps.length; i++)
        {
            if (steps[i] > current)
            {
                next = steps[i];
                break;
            }
        }
        this.SetBoosterCharge(index, next);
    }

    // --- задачи уровня ---

    GetTasks() { return this.tasks.map(function(task) { return WordFallConfigs.MakeTask(task); }); }

    // Добавляет задачу (по умолчанию «собрать 3 слова»), возвращает её индекс или -1 при лимите
    AddTask(fields)
    {
        if (this.tasks.length >= WordFallLevelDraft.TaskLimit)
            return -1;
        this.tasks.push(WordFallConfigs.MakeTask(fields || { taskType: "AnyWords", count: 3 }));
        return this.tasks.length - 1;
    }

    RemoveTask(index)
    {
        if (this._Task(index))
            this.tasks.splice(index, 1);
    }

    // Смена типа хранит общие поля; бонусу нужен вид
    SetTaskType(index, type)
    {
        var task = this._Task(index);
        if (!task || WordFallConfigs.TaskTypes.indexOf(type) < 0)
            return;
        task.taskType = type;
        if (type == "Powerup" && WordFallLevelDraft.PowerupKinds.indexOf(task.powerupKind) < 0)
            task.powerupKind = "bomb";
    }

    CycleTaskType(index)
    {
        var task = this._Task(index);
        if (!task)
            return;
        var types = WordFallConfigs.TaskTypes;
        this.SetTaskType(index, types[(types.indexOf(task.taskType) + 1) % types.length]);
    }

    SetTaskWord(index, word) { var task = this._Task(index); if (task) task.word = (word || "").toUpperCase(); }
    SetTaskLetter(index, letter) { var task = this._Task(index); if (task) task.letter = letter ? letter.charAt(0).toUpperCase() : ""; }
    SetTaskCount(index, count) { var task = this._Task(index); if (task) task.count = Math.min(Math.max(Math.floor(count), 1), 20); }
    SetTaskLength(index, length) { var task = this._Task(index); if (task) task.length = Math.min(Math.max(Math.floor(length), 2), 8); }
    SetTaskScore(index, score) { var task = this._Task(index); if (task) task.scoreThreshold = Math.min(Math.max(Math.floor(score), 2), 200); }

    SetTaskPowerupKind(index, kind)
    {
        var task = this._Task(index);
        if (task && WordFallLevelDraft.PowerupKinds.indexOf(kind) >= 0)
            task.powerupKind = kind;
    }

    CycleTaskPowerupKind(index)
    {
        var task = this._Task(index);
        if (!task)
            return;
        var kinds = WordFallLevelDraft.PowerupKinds;
        this.SetTaskPowerupKind(index, kinds[(kinds.indexOf(task.powerupKind) + 1) % kinds.length]);
    }

    _Task(index) { return index >= 0 && index < this.tasks.length ? this.tasks[index] : null; }

    CountPlayable()
    {
        var count = 0;
        for (var c = 0; c < this.columns; c++)
            for (var r = 0; r < this.rows; r++)
                count += this.cells[c][r].hole ? 0 : 1;
        return count;
    }

    ToConfig()
    {
        var config = WordFallConfigs.DefaultLevelConfig();
        config.moves = this.moves;
        config.targetScore = this.targetScore;
        config.extraVowels = this.extraVowels;
        config.extraRare = this.extraRare;
        config.boosterCharges = this.boosterCharges.slice();
        config.tasks = this.tasks.map(function(task) { return WordFallConfigs.MakeTask(task); });
        config.snowPerMove = this.snowPerMove;
        config.parcelTotal = this.parcelTotal;
        config.parcelOnScreen = this.parcelOnScreen;

        for (var c = 0; c < this.columns; c++)
        {
            for (var r = 0; r < this.rows; r++)
            {
                var cell = this.cells[c][r];
                var at = { c: c, r: r };
                if (cell.hole)
                    config.holeCells.push(at);
                if (cell.letter)
                    config.letterCells.push({ c: c, r: r, letter: cell.letter });
                if (cell.overlay == "ice")
                    config.iceCells.push(at);
                if (cell.overlay == "stone")
                    config.stoneCells.push(at);
                if (cell.overlay == "chain")
                    config.chainCells.push(at);
                if (cell.crate > 0)
                {
                    config.crateCells.push(at);
                    config.crateGrades.push(cell.crate);
                }
                if (cell.item == "snow")
                    config.snowCells.push(at);
                if (cell.item == "parcel")
                    config.parcelCells.push(at);
                if (cell.item == "bomb" || cell.item == "rocket" || cell.item == "fireworks")
                {
                    config.powerupCells.push(at);
                    config.powerupKinds.push(cell.item);
                }
            }
        }
        return config;
    }
};
