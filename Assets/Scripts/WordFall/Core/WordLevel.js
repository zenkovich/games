include("Scripts/WordFall/Core/WordBoard.js");

// Состояние уровня: задачи, ходы, счёт, заряды бустеров, победа/поражение.
// Очки — обязательное финальное условие: победа при закрытых задачах И score >= target
WordLevel = class WordLevel
{
    // Индексы бустеров
    static get Hammer() { return 0; }
    static get Shuffle() { return 1; }
    static get Hint() { return 2; }
    static get Joker() { return 3; }
    static get Doubler() { return 4; }

    constructor()
    {
        this.board = new WordBoard();
        this.config = WordFallConfigs.DefaultLevelConfig();
        this.tasks = [];           // [{config, progress, done}]
        this.state = "playing";    // playing | won | lost
        this.score = 0;
        this.movesLeft = 0;
        this._charges = [0, 0, 0, 0, 0];
        this._moveIndex = 0;
        this._usedWords = [];
        this._parcelsSpawned = 0;  // выпущено конвертов, включая стартовые
    }

    // Стартует уровень: поле, сид слова из заданий, задачи
    Start(config, boardConfig, dictionary, seed)
    {
        this.config = config;
        this.score = 0;
        this.movesLeft = config.moves;
        this._moveIndex = 0;
        this._parcelsSpawned = 0;
        this._usedWords = [];
        this.state = "playing";

        this._charges = config.boosterCharges.slice();
        while (this._charges.length < 5)
            this._charges.push(0);

        this.tasks = config.tasks.map(function(task) { return { config: task, progress: 0, done: false }; });

        // смещение мешка: гласные делают поле сговорчивее, редкие согласные — жёстче
        var levelBoard = JSON.parse(JSON.stringify(boardConfig));
        if (config.extraVowels > 0 || config.extraRare > 0)
        {
            var vowelIndices = [];
            var rareIndices = [];
            for (var i = 0; i < levelBoard.letters.length; i++)
            {
                var def = levelBoard.letters[i];
                if (levelBoard.vowels.indexOf(def.letter) >= 0)
                    vowelIndices.push(i);
                else if (def.value >= 5)
                    rareIndices.push(i);
            }
            for (var i = 0; i < config.extraVowels && vowelIndices.length > 0; i++)
                levelBoard.letters[vowelIndices[i % vowelIndices.length]].bagCount++;
            for (var i = 0; i < config.extraRare && rareIndices.length > 0; i++)
                levelBoard.letters[rareIndices[i % rareIndices.length]].bagCount++;
        }
        this.board.Init(levelBoard, seed);

        // одно из слов заданий обязано оказаться на поле — игроку проще начать
        var seededWord = "";
        for (var i = 0; i < this.tasks.length; i++)
        {
            var task = this.tasks[i].config;
            if (task.taskType == "Word" && task.word)
            {
                seededWord = task.word;
                break;
            }
        }

        this.board.Fill(config, seededWord);
        this._parcelsSpawned = this.board.CountParcels();
        this._RefreshIceTasks();
        this._RefreshObstacleTasks();
        this._EnsureTasksAchievable(dictionary);
    }

    GetBoard() { return this.board; }
    GetState() { return this.state; }
    GetScore() { return this.score; }
    GetTargetScore() { return this.config.targetScore; }
    GetMovesLeft() { return this.movesLeft; }
    GetTasks() { return this.tasks; }
    GetBoosterCharges(booster) { return this._charges[booster] || 0; }

    // Слово уже принималось на этом уровне
    IsWordUsed(word) { return this._usedWords.indexOf(word) >= 0; }

    // Принятие текущего слова: задачи, счёт, ходы, состояние
    AcceptWord(dictionary)
    {
        var result = new WordMoveResult();
        if (this.state != "playing")
        {
            result.reason = "blocked";
            return result;
        }

        var pattern = this.board.GetCurrentWord();
        if (this.IsWordUsed(pattern))
        {
            result.reason = "duplicate";
            result.word = pattern;
            return result;
        }

        this._QueueSpawns();
        this.board.SetRocketPriorities(this.MakeRocketPriorities());
        result = this.board.AcceptWord(dictionary);
        if (!result.ok)
        {
            this.board.SetSpawnQueue(0, 0);
            return result;
        }

        this.score += result.gain;
        this._moveIndex++;
        this._usedWords.push(pattern);

        if (result.powerupEarned)
            this._OnPowerupEarned(result.powerupEarned);

        this._UpdateTasksAfterWord(pattern, result.wordScore);
        this._UpdateTasksAfterMove(result);
        this._RefreshIceTasks();
        this._RefreshObstacleTasks();

        this.movesLeft--;

        this._CheckWin();
        if (this.state == "playing" && this.movesLeft <= 0)
            this.state = "lost";

        result.repaired = this._EnsureTasksAchievable(dictionary);
        return result;
    }

    // Бустеры: расходуют заряд, ход не тратят
    UseHammer(cell, dictionary)
    {
        if (this.state != "playing" || !this._TakeCharge(WordLevel.Hammer))
            return new WordMoveResult();

        var result = this.board.RemoveTile(cell);
        this._UpdateTasksAfterMove(result);
        this._RefreshObstacleTasks();

        // молоток мог снести последний лёд — задача закрывается и без хода
        this._RefreshIceTasks();
        this._CheckWin();
        result.repaired = this._EnsureTasksAchievable(dictionary);
        return result;
    }

    UseShuffle(dictionary)
    {
        if (this.state != "playing" || !this._TakeCharge(WordLevel.Shuffle))
            return false;

        var ok = this.board.ShuffleLetters();
        this._EnsureTasksAchievable(dictionary);
        return ok;
    }

    // Подсказка ведёт к целям уровня и не предлагает ни использованных, ни громоздких слов
    UseHint(dictionary)
    {
        if (this.state != "playing" || this._charges[WordLevel.Hint] <= 0)
            return false;

        var taskWord = "", letterWanted = "";
        var lengthWanted = 0, powerupLength = 0, scoreWanted = 0;
        for (var i = 0; i < this.tasks.length; i++)
        {
            var task = this.tasks[i];
            if (task.done)
                continue;

            switch (task.config.taskType)
            {
                case "Word": if (!taskWord) taskWord = task.config.word; break;
                case "Length": lengthWanted = task.config.length; break;
                case "Letter": letterWanted = task.config.letter; break;
                case "WordScore": scoreWanted = task.config.scoreThreshold; break;
                case "Powerup": powerupLength = WordFallConfigs.PowerupLength(task.config.powerupKind); break;
            }
        }

        var self = this;
        var found = this.board.FindBestWordBy(dictionary, function(candidate, value) {
            if (self.IsWordUsed(candidate))
                return 0;
            if (taskWord && candidate == taskWord)
                return 100000;

            var weight = value;
            var length = candidate.length;
            if (lengthWanted > 0 && length == lengthWanted)
                weight *= 2.2;
            if (powerupLength > 0 && length == powerupLength)
                weight *= 1.8;
            if (scoreWanted > 0 && value >= scoreWanted)
                weight *= 2.0;
            if (letterWanted)
            {
                var hits = 0;
                for (var i = 0; i < length; i++)
                    hits += candidate[i] == letterWanted ? 1 : 0;
                weight *= 1 + 0.5*hits;
            }
            // 4–6 букв — комфортный размер
            if (length <= 3)
                weight *= 0.8;
            else if (length == 7)
                weight *= 0.5;
            else if (length >= 8)
                weight *= 0.3;
            return weight;
        });
        if (!found)
            return false;

        this.board.ClearSelection();
        for (var i = 0; i < found.cells.length; i++)
            this.board.ToggleSelect(found.cells[i]);

        this._charges[WordLevel.Hint]--;
        return true;
    }

    UseJoker(cell)
    {
        if (this.state != "playing" || this._charges[WordLevel.Joker] <= 0 || !this.board.MakeJoker(cell))
            return false;

        this._charges[WordLevel.Joker]--;
        return true;
    }

    UseDoubler(cell)
    {
        if (this.state != "playing" || this._charges[WordLevel.Doubler] <= 0 || !this.board.MakeDoubled(cell))
            return false;

        this._charges[WordLevel.Doubler]--;
        return true;
    }

    // Чего хочет уровень: цели ракет и буквы, которые надо беречь
    MakeRocketPriorities()
    {
        var priorities = WordBoard.EmptyRocketPriorities();
        for (var i = 0; i < this.tasks.length; i++)
        {
            var task = this.tasks[i];
            if (task.done)
                continue;

            switch (task.config.taskType)
            {
                case "ClearIce": priorities.ice = true; break;
                case "Crates": priorities.crates = true; break;
                case "Melt": priorities.snow = true; break;
                case "Letter": priorities.keepLetter = task.config.letter; break;
                case "Word":
                    // буквы засеянного слова-задания стоят на поле, пока задание не закрыто
                    priorities.keepCells = priorities.keepCells.concat(WordFallCells.Copy(this.board.GetSeededCells()));
                    break;
            }
        }
        return priorities;
    }

    DebugSetTargetScore(target) { this.config.targetScore = target; }
    DebugSetMovesLeft(moves) { this.movesLeft = moves; }

    DebugAddMoves(moves)
    {
        this.movesLeft = Math.max(0, this.movesLeft + moves);
        if (this.state == "lost" && this.movesLeft > 0)
            this.state = "playing";
    }

    DebugAddCharges(charges)
    {
        for (var i = 0; i < this._charges.length; i++)
            this._charges[i] = Math.max(0, this._charges[i] + charges);
    }

    DebugLose()
    {
        if (this.state == "playing")
        {
            this.movesLeft = 0;
            this.state = "lost";
        }
    }

    DebugCompleteTasks()
    {
        for (var i = 0; i < this.tasks.length; i++)
        {
            this.tasks[i].progress = this.tasks[i].config.count;
            this.tasks[i].done = true;
        }
        this._CheckWin();
    }

    DebugAddScore(score)
    {
        this.score += score;
        this._CheckWin();
    }

    _AreTasksDone()
    {
        return this.tasks.every(function(task) { return task.done; });
    }

    _BumpTask(task)
    {
        task.progress++;
        if (task.progress >= task.config.count)
            task.done = true;
    }

    _UpdateTasksAfterWord(pattern, wordScore)
    {
        for (var i = 0; i < this.tasks.length; i++)
        {
            var task = this.tasks[i];
            if (task.done)
                continue;

            var config = task.config;
            if (config.taskType == "Word" && WordDictionary.MatchPattern(pattern, config.word))
                this._BumpTask(task);
            else if (config.taskType == "Length" && pattern.length == config.length)
                this._BumpTask(task);
            else if (config.taskType == "AnyWords")
                this._BumpTask(task);
            else if (config.taskType == "WordScore" && wordScore >= config.scoreThreshold)
                this._BumpTask(task);
            else if (config.taskType == "Letter" && config.letter)
            {
                for (var li = 0; li < pattern.length && !task.done; li++)
                {
                    if (pattern[li] == config.letter)
                        this._BumpTask(task);
                }
            }
        }
    }

    // Прогресс задач по результату хода: конверты и снежки
    _UpdateTasksAfterMove(result)
    {
        for (var i = 0; i < this.tasks.length; i++)
        {
            var task = this.tasks[i];
            if (task.done)
                continue;

            var hits = task.config.taskType == "Deliver" ? result.delivered.length
                : task.config.taskType == "Melt" ? result.snowMelted.length : 0;
            for (var h = 0; h < hits && !task.done; h++)
                this._BumpTask(task);
        }
    }

    // Очередь спавна на ход: конверты по лимиту на поле, снежки по норме уровня
    _QueueSpawns()
    {
        var parcels = 0;
        if (this.config.parcelTotal > 0)
        {
            var remaining = this.config.parcelTotal - this._parcelsSpawned;
            var room = Math.max(1, this.config.parcelOnScreen) - this.board.CountParcels();
            parcels = Math.min(Math.max(Math.min(remaining, room), 0), this.board.GetColumns());
        }

        var snow = 0;
        if (this.config.snowPerMove > 0 && this.board.CountSnow() < 8)
            snow = Math.min(this.config.snowPerMove, 8 - this.board.CountSnow());

        this._parcelsSpawned += parcels;
        this.board.SetSpawnQueue(parcels, snow);
    }

    _RefreshObstacleTasks()
    {
        if (this.board.CountCrates() > 0)
            return;

        for (var i = 0; i < this.tasks.length; i++)
        {
            if (this.tasks[i].config.taskType == "Crates")
                this.tasks[i].done = true;
        }
    }

    _RefreshIceTasks()
    {
        if (this.board.CountIce() > 0)
            return;

        for (var i = 0; i < this.tasks.length; i++)
        {
            if (this.tasks[i].config.taskType == "ClearIce")
                this.tasks[i].done = true;
        }
    }

    // Страховка выполнимости: каждое незакрытое задание достижимо, иначе подсеваются
    // недостающие буквы. Возвращает подсеянные клетки
    _EnsureTasksAchievable(dictionary)
    {
        var repaired = [];
        if (this.state != "playing")
            return repaired;

        var board = this.board;
        if (!board.AnyWordExists(dictionary, 0))
            board.PlantMissingLetters(board.RandomDictWord(dictionary, 4), repaired);

        // полный перебор словаря дорогой — лучшее слово считаем не более одного раза
        var best = undefined;

        for (var i = 0; i < this.tasks.length; i++)
        {
            var task = this.tasks[i];
            if (task.done)
                continue;

            var config = task.config;
            var type = config.taskType;
            if (type == "Word" && !board.CanAssembleWord(config.word))
                board.PlantMissingLetters(config.word, repaired);
            else if (type == "Length" && !board.AnyWordExists(dictionary, config.length))
                board.PlantMissingLetters(board.RandomDictWord(dictionary, config.length), repaired);
            else if (type == "Letter" && config.letter && !board.CanAssembleWord(config.letter))
                board.PlantMissingLetters(config.letter, repaired);
            else if (type == "Powerup")
            {
                var length = WordFallConfigs.PowerupLength(config.powerupKind);
                var achievable = board.AnyWordExists(dictionary, length) ||
                    (config.powerupKind == "fireworks" && board.AnyWordExists(dictionary, 8));
                if (!achievable)
                    board.PlantMissingLetters(board.RandomDictWord(dictionary, length), repaired);
            }
            else if (type == "WordScore")
            {
                if (best === undefined)
                    best = board.FindBestWord(dictionary, 0);
                if (!best || Math.ceil(best.value) < config.scoreThreshold)
                    board.PlantMissingLetters(board.ExpensiveDictWord(dictionary), repaired);
            }
        }
        return repaired;
    }

    _OnPowerupEarned(kind)
    {
        for (var i = 0; i < this.tasks.length; i++)
        {
            var task = this.tasks[i];
            if (!task.done && task.config.taskType == "Powerup" && (task.config.powerupKind == kind || !task.config.powerupKind))
                this._BumpTask(task);
        }
    }

    // Очки — обязательное финальное условие: победа только с закрытыми задачами
    _CheckWin()
    {
        if (this.state == "playing" && this.score >= this.config.targetScore && this._AreTasksDone())
            this.state = "won";
    }

    _TakeCharge(booster)
    {
        if (this._charges[booster] <= 0)
            return false;

        this._charges[booster]--;
        return true;
    }
};
