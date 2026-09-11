include("Scripts/WordFall/Core/WordFallCore.js");

globalThis.WordFallGame = globalThis.WordFallGame || {};

// Сервис игры: владеет ядром (поле, уровень, прогресс, словарь) и отдаёт его
// вьюхам. Живёт на акторе GameService сцены WordFall — настройки кампании и поля
// видны и редактируются в редакторе. Вьюхи находят его как WordFallGame.service
WordFallGameService = class WordFallGameService extends o2.Component
{
    constructor()
    {
        super();
        this.boardConfig = WordFallConfigs.DefaultBoardConfig(); // поле и мешок букв
        this.campaignLength = 100;                   // длина процедурной кампании
        this.campaignPath = "WordFall/campaign.json"; // кампания из data-ассета; пусто или нет файла — процедурная
        this.levels = [];                            // ручная кампания; пусто — campaignPath
        this.randomSeed = 0;                         // сид (0 — случайный)
        this.progressPath = "wordfall_progress.json"; // файл сохранения прогресса
        this.fallSpeedCells = 9.5;                   // скорость падения, клеток/с
        this.fallCascadeDelay = 0.05;                // пауза стартов плиток колонки

        this._started = false;
        this._dictionary = null;
        this._campaign = [];
        this._level = new WordLevel();
        this._progress = new PlayerProgress();
        this._levelIndex = 0;
        this._revision = 0;
        this._lastMove = new WordMoveResult();
        this._motion = new WordBoardMotion();

        WordFallGame.service = this;
    }

    OnStart()
    {
        WordFallGame.service = this;
        this._EnsureStarted();
    }

    Update(dt)
    {
        this._motion.Update(dt);
    }

    // --- уровень и прогресс ---

    StartLevel(index)
    {
        this._EnsureStarted();
        this._levelIndex = Math.min(Math.max(index, 0), this.GetLevelCount() - 1);

        var config = this.levels.length > 0 ? WordFallConfigs.NormalizeLevel(this.levels[this._levelIndex])
            : this._campaign.length > 0 ? this._campaign[this._levelIndex]
            : WordFallLevels.Generate(this._levelIndex, this._dictionary, this._BoardConfig());

        this._level.Start(JSON.parse(JSON.stringify(config)), this._BoardConfig(), this._dictionary, this.randomSeed);
        this._lastMove = new WordMoveResult();
        this._revision++;
    }

    RestartLevel()
    {
        this.StartLevel(this._levelIndex);
    }

    // Победа подтверждена вьюхой: двигает прогресс, сохраняет, стартует следующий
    AdvanceToNextLevel()
    {
        this._EnsureStarted();
        this._progress.CompleteLevel(this._levelIndex, this._level.GetScore(), this.GetLevelCount());
        if (!this._progress.Save(this.progressPath))
            print("WordFall: failed to save progress to " + this.progressPath);

        this.StartLevel(this._progress.currentLevel);
    }

    GetLevelIndex() { return this._levelIndex; }

    GetLevelCount()
    {
        this._EnsureStarted();
        return this.levels.length > 0 ? this.levels.length : this._campaign.length > 0 ? this._campaign.length : this.campaignLength;
    }

    // --- состояние для вьюх ---

    GetColumns() { return this._BoardConfig().columns; }
    GetRows() { return this._BoardConfig().rows; }

    // Плитка: {letter, value, ice, stone, doubled, joker, powerup, hole, crate, chained, snow, parcel, empty}
    GetTile(column, row)
    {
        this._EnsureStarted();
        var tile = this._level.GetBoard().GetTile({ c: column, r: row });
        return {
            letter: tile.letter,
            value: tile.value*(tile.doubled ? 2 : 1),
            ice: tile.ice,
            stone: tile.stone,
            doubled: tile.doubled,
            joker: tile.joker,
            powerup: tile.powerup,
            hole: tile.hole,
            crate: tile.crate,
            chained: tile.chained,
            snow: tile.snow,
            parcel: tile.parcel,
            empty: !WordBoard.IsTileOccupied(tile) && !WordBoard.IsTileStatic(tile)
        };
    }

    // Выбор: [{c, r}]
    GetSelection()
    {
        this._EnsureStarted();
        return WordFallCells.Copy(this._level.GetBoard().GetSelection());
    }

    // Задачи: [{type, word, length, kind, count, score, letter, progress, done}]
    GetTasks()
    {
        this._EnsureStarted();
        return this._level.GetTasks().map(function(task) {
            var config = task.config;
            return {
                type: config.taskType.charAt(0).toLowerCase() + config.taskType.slice(1),
                word: config.word,
                length: config.length,
                kind: config.powerupKind,
                count: config.count,
                score: config.scoreThreshold,
                letter: config.letter,
                progress: task.progress,
                done: task.done
            };
        });
    }

    GetScore() { this._EnsureStarted(); return this._level.GetScore(); }
    GetTargetScore() { this._EnsureStarted(); return this._level.GetTargetScore(); }
    GetMovesLeft() { this._EnsureStarted(); return this._level.GetMovesLeft(); }
    GetGameState() { this._EnsureStarted(); return this._level.GetState(); }
    GetBoosterCharges(booster) { this._EnsureStarted(); return this._level.GetBoosterCharges(booster); }
    GetCurrentWord() { this._EnsureStarted(); return this._level.GetBoard().GetCurrentWord(); }
    IsCurrentWordValid() { this._EnsureStarted(); return this._dictionary.Contains(this._level.GetBoard().GetCurrentWord()); }

    // Ревизия состояния: растёт при каждой мутации — вьюхи синкаются по ней
    GetRevision() { return this._revision; }

    // --- модель движения плиток при обвале: вьюха только читает её состояние ---

    StartCollapseAnimation()
    {
        this._EnsureStarted();
        var config = this._BoardConfig();
        this._motion.Configure(config.columns, config.rows, this.fallSpeedCells, this.fallCascadeDelay, 0.6);
        this._motion.StartCollapse(this._lastMove.moved, this._lastMove.spawned);
    }

    IsCollapseAnimating() { return this._motion.IsAnimating(); }
    GetTileFallOffset(column, row) { return this._motion.GetOffset({ c: column, r: row }); }
    IsTileFallHidden(column, row) { return this._motion.IsHidden({ c: column, r: row }); }
    FinishCollapseAnimation() { this._motion.Finish(); }

    // Результат последнего принятого слова или молотка — для анимаций
    GetLastMove()
    {
        this._EnsureStarted();
        return this._MoveToScript(this._lastMove);
    }

    // --- действия игрока ---

    // Клик по плитке: added | removed | iced | blocked
    ToggleSelect(column, row)
    {
        this._EnsureStarted();
        if (this._level.GetState() != "playing")
            return "blocked";

        var result = this._level.GetBoard().ToggleSelect({ c: column, r: row });
        this._revision++;
        return result;
    }

    ClearSelection()
    {
        this._EnsureStarted();
        this._level.GetBoard().ClearSelection();
        this._revision++;
    }

    AcceptWord()
    {
        this._EnsureStarted();
        this._lastMove = this._level.AcceptWord(this._dictionary);
        if (this._lastMove.ok)
            this._revision++;
        return this._MoveToScript(this._lastMove);
    }

    UseHammer(column, row)
    {
        this._EnsureStarted();
        var result = this._level.UseHammer({ c: column, r: row }, this._dictionary);
        if (result.ok)
        {
            this._lastMove = result;
            this._revision++;
        }
        return this._MoveToScript(result);
    }

    UseShuffle() { this._EnsureStarted(); return this._Mutation(this._level.UseShuffle(this._dictionary)); }
    UseHint() { this._EnsureStarted(); return this._Mutation(this._level.UseHint(this._dictionary)); }
    UseJoker(column, row) { this._EnsureStarted(); return this._Mutation(this._level.UseJoker({ c: column, r: row })); }
    UseDoubler(column, row) { this._EnsureStarted(); return this._Mutation(this._level.UseDoubler({ c: column, r: row })); }

    // --- отладка, читы и тесты ---

    DebugSetTile(column, row, letter) { this._Debug(function(level) { level.GetBoard().DebugSetTile({ c: column, r: row }, letter); }); }
    DebugSetStone(column, row) { this._Debug(function(level) { level.GetBoard().DebugSetStone({ c: column, r: row }); }); }
    DebugSetPowerup(column, row, kind) { this._Debug(function(level) { level.GetBoard().DebugSetPowerup({ c: column, r: row }, kind); }); }
    DebugSetTargetScore(target) { this._Debug(function(level) { level.DebugSetTargetScore(target); }); }
    DebugCompleteTasks() { this._Debug(function(level) { level.DebugCompleteTasks(); }); }
    DebugAddMoves(moves) { this._Debug(function(level) { level.DebugAddMoves(moves); }); }
    DebugAddScore(score) { this._Debug(function(level) { level.DebugAddScore(score); }); }
    DebugAddCharges(charges) { this._Debug(function(level) { level.DebugAddCharges(charges); }); }
    DebugLoseLevel() { this._Debug(function(level) { level.DebugLose(); }); }

    // Случайный бонус на свободную клетку
    DebugSpawnRandomPowerup()
    {
        this._EnsureStarted();
        var board = this._level.GetBoard();
        var cells = [];
        for (var c = 0; c < board.GetColumns(); c++)
        {
            for (var r = 0; r < board.GetRows(); r++)
            {
                var cell = { c: c, r: r };
                if (WordBoard.IsTileUsable(board.GetTile(cell)) && !WordFallCells.Contains(board.GetSeededCells(), cell))
                    cells.push(cell);
            }
        }
        if (cells.length == 0)
            return;

        var kinds = ["bomb", "rocket", "fireworks"];
        board.DebugSetPowerup(cells[Math.floor(Math.random()*cells.length)], kinds[Math.floor(Math.random()*kinds.length)]);
        this._revision++;
    }

    IsTutorialSeen(key) { this._EnsureStarted(); return this._progress.IsTutorialSeen(key); }

    // Запомнить показанный туториал (сохраняет прогресс)
    MarkTutorialSeen(key)
    {
        this._EnsureStarted();
        this._progress.MarkTutorialSeen(key);
        this._progress.Save(this.progressPath);
    }

    ResetTutorials()
    {
        this._EnsureStarted();
        this._progress.seenTutorials = [];
        this._progress.Save(this.progressPath);
        this._revision++;
    }

    // Клетки засеянного слова-задания (для туториала и подсказок)
    GetSeededCells()
    {
        this._EnsureStarted();
        return WordFallCells.Copy(this._level.GetBoard().GetSeededCells());
    }

    IsWordUsed(word) { this._EnsureStarted(); return this._level.IsWordUsed(word); }
    GetBestScore() { this._EnsureStarted(); return this._progress.GetBestScore(this._levelIndex); }

    // Прямой доступ к ядру для тестов
    GetLevel() { this._EnsureStarted(); return this._level; }
    GetDictionary() { return this._Dictionary(); }
    GetProgress() { this._EnsureStarted(); return this._progress; }

    _BoardConfig()
    {
        return WordFallConfigs.NormalizeBoard(this.boardConfig);
    }

    // Словарь общий для всех сервисов: разбор 23 тысяч слов — не на каждый рестарт сцены
    _Dictionary()
    {
        if (!WordFallGame.dictionary || WordFallGame.dictionarySource !== WordFallDictionaryData)
        {
            WordFallGame.dictionarySource = WordFallDictionaryData;
            WordFallGame.dictionary = WordDictionary.LoadDefault();
        }
        this._dictionary = WordFallGame.dictionary;
        return this._dictionary;
    }

    _EnsureStarted()
    {
        if (this._started)
            return;

        this._started = true;
        if (!Array.isArray(this.levels))
            this.levels = [];
        this._Dictionary();

        // ручная кампания в редакторе > data-ассет кампании > процедурная генерация
        this._campaign = [];
        if (this.levels.length == 0 && this.campaignPath)
        {
            var asset = new o2.AssetRefDataAsset(this.campaignPath);
            if (asset.IsValid())
            {
                var data = JSON.parse(asset.Get().GetJson());
                if (Array.isArray(data))
                    this._campaign = data.map(function(level) { return WordFallConfigs.NormalizeLevel(level); });
            }
            if (this._campaign.length == 0)
                print("WordFall: campaign asset " + this.campaignPath + " is missing or empty, using the procedural campaign");
        }

        this._progress.Load(this.progressPath);
        this.StartLevel(this._progress.currentLevel);
    }

    _Mutation(ok)
    {
        if (ok)
            this._revision++;
        return ok;
    }

    _Debug(action)
    {
        this._EnsureStarted();
        action(this._level);
        this._revision++;
    }

    _MoveToScript(result)
    {
        return {
            ok: result.ok,
            reason: result.reason,
            word: result.word,
            wordScore: result.wordScore,
            extraScore: result.extraScore,
            gain: result.gain,
            powerupEarned: result.powerupEarned,
            burned: WordFallCells.Copy(result.burned),
            activated: WordFallCells.Copy(result.activated),
            iceBroken: WordFallCells.Copy(result.iceBroken),
            spawned: WordFallCells.Copy(result.spawned),
            repaired: WordFallCells.Copy(result.repaired),
            destroyed: WordFallCells.Copy(result.destroyed),
            crateHit: WordFallCells.Copy(result.crateHit),
            crateBroken: WordFallCells.Copy(result.crateBroken),
            snowMelted: WordFallCells.Copy(result.snowMelted),
            delivered: WordFallCells.Copy(result.delivered),
            powerupsUsed: result.powerupsUsed.map(function(use) {
                return { kind: use.kind, c: use.c, r: use.r, targets: WordFallCells.Copy(use.targets) };
            }),
            state: this._level.GetState(),
            moved: result.moved.map(function(move) { return { c: move.c, fromR: move.fromR, toR: move.toR }; })
        };
    }
};
