include("Scripts/WordFall/Core/WordFallConfigs.js");

// Черновик уровня для редактора: клетка несёт либо букву (случайную или заданную) с
// накладкой лёд/камень/цепь, либо один предмет — ящик, снежок, конверт, бонус, либо дыру.
// Инструмент по клетке (левый клик) ставит своё или снимает то же самое, правый клик (Remove)
// убирает: инструмент «клетка» — саму клетку, остальные — свой элемент, а если его нет —
// верхний элемент клетки. Ящик ставится с прочностью «кисти» crateGrade.
// Слова уровня — отдельный список, плюс параметры агента подбора; ToConfig собирает конфиг уровня
WordFallLevelDraft = class WordFallLevelDraft
{
    static get Tools() { return ["cell", "ice", "stone", "crate", "chain", "snow", "parcel", "bomb", "rocket", "fireworks", "letter", "erase"]; }
    static get Overlays() { return ["ice", "stone", "chain"]; }
    static get Items() { return ["snow", "parcel", "bomb", "rocket", "fireworks"]; }
    static get ChargeSteps() { return [0, 1, 3, 5, 10, 30]; }
    static get TaskLimit() { return 5; }
    static get WordLimit() { return 30; }
    static get MaxCrateGrade() { return 3; }
    static get PowerupKinds() { return ["bomb", "rocket", "fireworks"]; }

    constructor(config, columns, rows)
    {
        this.columns = columns;
        this.rows = rows;
        this.crateGrade = 1;
        this.Load(config);
    }

    static EmptyCell() { return { hole: false, letter: "", overlay: "", crate: 0, item: "" }; }

    Load(config)
    {
        var level = WordFallConfigs.NormalizeLevel(config);
        this.id = level.id;
        this.name = level.name;
        this.difficulty = level.difficulty;
        this.language = level.language;
        this.otherWords = JSON.parse(JSON.stringify(level.otherWords));
        this.otherLetterCells = JSON.parse(JSON.stringify(level.otherLetterCells));
        this.words = level.words.slice();
        this.wordsAuto = level.wordsAuto;
        this.wordMinLength = level.wordMinLength;
        this.wordMaxLength = level.wordMaxLength;
        this.autoTarget = level.autoTarget;
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
        if (tool == "cell")
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
                target.crate = target.crate < WordFallLevelDraft.MaxCrateGrade ? target.crate + 1 : 0;
            else
                WordFallLevelDraft._Clear(target).crate = this.crateGrade;
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

    // Правый клик: инструмент «клетка» убирает клетку, остальные — свой элемент, а если его
    // в клетке нет — верхний элемент (предмет, ящик, накладку, заданную букву). "changed" или ""
    Remove(tool, cell)
    {
        if (!this.IsValidCell(cell))
            return "";

        var target = this.cells[cell.c][cell.r];
        if (target.hole)
            return "";
        if (tool == "cell")
        {
            WordFallLevelDraft._Clear(target).hole = true;
            return "changed";
        }

        if (WordFallLevelDraft.Overlays.indexOf(tool) >= 0 && target.overlay == tool)
            target.overlay = "";
        else if (tool == "crate" && target.crate > 0)
            target.crate = 0;
        else if (WordFallLevelDraft.Items.indexOf(tool) >= 0 && target.item == tool)
            target.item = "";
        else if (tool == "letter" && target.letter)
            target.letter = "";
        else if (target.item)
            target.item = "";
        else if (target.crate > 0)
            target.crate = 0;
        else if (target.overlay)
            target.overlay = "";
        else if (target.letter)
            target.letter = "";
        else
            return "";
        return "changed";
    }

    // Прочность «кисти» ящика: с ней ставятся новые ящики
    SetCrateGrade(grade) { this.crateGrade = Math.min(Math.max(Math.round(grade), 1), WordFallLevelDraft.MaxCrateGrade); }
    StepCrateGrade(delta) { this.SetCrateGrade(this.crateGrade + delta); }

    // Колесо над ящиком на поле: прочность ящика в клетке, "changed" или ""
    StepCellCrate(cell, delta)
    {
        if (!this.IsValidCell(cell))
            return "";
        var target = this.cells[cell.c][cell.r];
        if (target.crate <= 0)
            return "";
        var grade = Math.min(Math.max(target.crate + delta, 1), WordFallLevelDraft.MaxCrateGrade);
        if (grade == target.crate)
            return "";
        target.crate = grade;
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
    SetDifficulty(value) { this.difficulty = Math.min(Math.max(Math.round(value), 1), WordFallConfigs.MaxDifficulty); }
    SetName(name) { this.name = (name || "").trim(); }
    SetAutoTarget(on) { this.autoTarget = !!on; }

    // --- слова уровня ---

    // Добавляет слово в конец списка: индекс или -1 (пусто, повтор, лимит)
    AddWord(word)
    {
        word = (word || "").toUpperCase().trim();
        if (!word || this.words.indexOf(word) >= 0 || this.words.length >= WordFallLevelDraft.WordLimit)
            return -1;
        this.words.push(word);
        return this.words.length - 1;
    }

    SetWord(index, word)
    {
        if (index < 0 || index >= this.words.length)
            return;
        this.words[index] = (word || "").toUpperCase().trim();
    }

    RemoveWord(index)
    {
        if (index >= 0 && index < this.words.length)
            this.words.splice(index, 1);
    }

    // Слова без пустых — то, что уходит в уровень
    CleanWords() { this.words = this.words.filter(function(word) { return word.length > 0; }); }

    SetWordsAuto(count) { this.wordsAuto = Math.min(Math.max(Math.floor(count), 0), WordFallLevelDraft.WordLimit); }

    // Длины слов агента: 0 — по сложности; минимум не больше максимума
    SetWordMinLength(length)
    {
        this.wordMinLength = length <= 0 ? 0 : Math.min(Math.max(Math.floor(length), 2), 8);
        if (this.wordMinLength > 0 && this.wordMaxLength > 0 && this.wordMaxLength < this.wordMinLength)
            this.wordMaxLength = this.wordMinLength;
    }

    SetWordMaxLength(length)
    {
        this.wordMaxLength = length <= 0 ? 0 : Math.min(Math.max(Math.floor(length), 2), 8);
        if (this.wordMinLength > 0 && this.wordMaxLength > 0 && this.wordMinLength > this.wordMaxLength)
            this.wordMinLength = this.wordMaxLength;
    }
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

    GetTasks() { var language = this.language; return this.tasks.map(function(task) { return WordFallConfigs.MakeTask(task, language); }); }

    // Добавляет задачу (по умолчанию «собрать 3 слова»), возвращает её индекс или -1 при лимите
    AddTask(fields)
    {
        if (this.tasks.length >= WordFallLevelDraft.TaskLimit)
            return -1;
        var task = WordFallConfigs.MakeTask(fields || { taskType: "AnyWords", count: 3 }, this.language);
        if (WordFallConfigs.TaskTypes.indexOf(task.taskType) < 0)
            return -1;
        this.tasks.push(task);
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
        config.id = this.id;
        config.name = this.name;
        config.difficulty = this.difficulty;
        config.language = this.language;
        config.otherWords = JSON.parse(JSON.stringify(this.otherWords));
        config.otherLetterCells = JSON.parse(JSON.stringify(this.otherLetterCells));
        config.words = this.words.filter(function(word) { return word.length > 0; });
        config.wordsAuto = this.wordsAuto;
        config.wordMinLength = this.wordMinLength;
        config.wordMaxLength = this.wordMaxLength;
        config.autoTarget = this.autoTarget;
        config.moves = this.moves;
        config.targetScore = this.targetScore;
        config.extraVowels = this.extraVowels;
        config.extraRare = this.extraRare;
        config.boosterCharges = this.boosterCharges.slice();
        var language = this.language;
        config.tasks = this.tasks.map(function(task) { return WordFallConfigs.MakeTask(task, language); });
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
