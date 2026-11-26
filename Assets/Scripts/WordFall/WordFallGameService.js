include("Scripts/WordFall/Core/WordFallCore.js");
include("Scripts/WordFall/WordFallProgressStore.js");

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
        this.progressPath = "";                      // файл прогресса (тесты, инструменты); пусто - сохранение игрока o2libs.Saves
        this.progressSection = "wordfall";           // секция прогресса в сохранении игрока
        this.editedLevelsPath = "wordfall_levels.json"; // правки редактора уровней поверх кампании
        this.campaignExportPath = "../../Assets/WordFall/campaign.json"; // куда редактор экспортирует кампанию
        this.match3ImportPath = "match3_level.xml";   // уровень «три в ряд» для импорта в нативной сборке
        this.fallSpeedCells = 9.5;                   // скорость падения, клеток/с
        this.fallCascadeDelay = 0.05;                // пауза стартов плиток колонки
        this.hintWordsPerFrame = 1500;               // слов словаря за кадр в поиске подсказки наперёд
        this.startCoins = 1000;                      // монеты нового игрока
        this.coinsPerScore = 1;                      // монет награды за очко уровня
        this.maxLives = 5;                           // полный запас жизней
        this.lifeRegenSeconds = 1800;                // жизнь восстанавливается за это время
        this.continueMoves = 5;                      // ходов за продолжение уровня
        this.continuePrice = 900;                    // цена продолжения в монетах
        this.startBoosters = [3, 3, 3, 3];           // бустеры нового игрока: молоток, перемешать (решафл), подсказка, джокер
        this.startBonuses = [1, 1, 1];               // бонусы на старт уровня у нового игрока: бомба, ракета, салют
        this.reshuffleStayShare = WordLevel.ReshuffleStayShare; // решафл: доля плиток, что остаются на месте
        this.reshuffleReach = WordLevel.ReshuffleReach;  // решафл: плитка меняется местами с соседом не дальше, клеток
        this.boosterPack = 3;                        // бустеров или бонусов в одной покупке
        this.boosterPrices = [600, 500, 300, 700];   // цены покупки бустеров за монеты, по индексам WordLevel
        this.bonusPrices = [500, 700, 900];          // цены покупки бонусов на старт: бомба, ракета, салют
        this.livesRefillPrice = 900;                 // полный запас жизней за монеты
        this.shopPacks = [                           // банк: пачки монет и их цены в магазине платформы
            { coins: 1000, price: "$0.99" }, { coins: 3000, price: "$2.99" }, { coins: 6500, price: "$4.99" },
            { coins: 14000, price: "$9.99" }, { coins: 30000, price: "$19.99" }, { coins: 80000, price: "$49.99" }
        ];

        this._started = false;
        this._custom = null;
        this._dictionary = null;
        this._campaign = [];
        this._store = null;
        this._level = new WordLevel();
        this._progress = new PlayerProgress();
        this._progressStore = null;
        this._levelIndex = 0;
        this._revision = 0;
        this._lastMove = new WordMoveResult();
        this._motion = new WordBoardMotion();
        this._hintSearch = null;
        this._hintRevision = -1;
        this._selectionRevisions = 0; // сколько раз ревизию двинул только выбор букв: подсказке он не важен

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
        this._PrepareHint();
    }

    // --- уровень и прогресс ---

    // Уровень без слов текущего языка не играется: стартует ближайший следующий валидный. levelCharges — уровень
    // играется со своими зарядами бустеров (проба из редактора уровней), а не с запасом игрока
    StartLevel(index, levelCharges)
    {
        this._EnsureStarted();
        if (!this._custom)
            this._levelIndex = this._ValidLevelFrom(Math.min(Math.max(index, 0), this.GetLevelCount() - 1));
        this._level.Start(this._custom || this._store.GetLevel(this._levelIndex), this._BoardConfig(), this._dictionary, this.randomSeed);
        // бустеры кампании — запас игрока на всю игру; уровень из LevelLab и проба из редактора — со своими зарядами
        if (!this._custom && !levelCharges)
            this._level.UseCharges(this._progress.boosters);
        this._LogRemote();
        this._lastMove = new WordMoveResult();
        this._revision++;
    }

    RestartLevel()
    {
        this.StartLevel(this._levelIndex);
    }

    // Уровень не из кампании (прогон бота из LevelLab): играется вместо текущего, пока игра не закрыта; прогресс
    // игрока, жизни и обучение при этом не трогаются. language — язык прогона, в настройки игрока не пишется
    PlayCustomLevel(config, language)
    {
        this._EnsureStarted();
        if (language && WordFallLanguages.Get(language))
        {
            WordFallLanguages.SetCurrent(language);
            this._Dictionary();
        }
        this._custom = WordFallConfigs.NormalizeLevel(WordFallConfigs.UpgradeFileLevel(config));
        this.StartLevel(this._levelIndex);
    }

    IsCustomLevel() { return this._custom != null; }

    // Победа подтверждена вьюхой: двигает прогресс, сохраняет, стартует следующий
    AdvanceToNextLevel()
    {
        this._EnsureStarted();
        if (this._custom)
        {
            this.StartLevel(this._levelIndex);
            return;
        }
        this._progress.CompleteLevel(this._levelIndex, this._level.GetScore(), this.GetLevelCount());
        this._SaveProgress();

        this.StartLevel(this._progress.currentLevel);
    }

    GetLevelIndex() { return this._levelIndex; }

    // --- язык: алфавит и номиналы букв, словарь, слова уровней ---

    GetLanguage() { this._EnsureStarted(); return WordFallLanguages.Current(); }
    GetLanguages() { return WordFallLanguages.List(); }
    GetAlphabet() { this._EnsureStarted(); return WordFallLanguages.Alphabet(); }

    // Меняет язык игрока: сохраняет его в прогрессе и перезапускает текущий уровень на новом алфавите
    SetLanguage(code)
    {
        this._EnsureStarted();
        var language = WordFallLanguages.SetCurrent(code);
        this._progress.language = language;
        this._SaveProgress();
        this._Dictionary();
        print("WordFall: language " + language + ", valid levels " + this.GetValidLevelCount() + "/" + this.GetLevelCount());
        this.StartLevel(this._levelIndex);
        return language;
    }

    IsLevelValid(index) { this._EnsureStarted(); return WordFallConfigs.IsLevelValid(this._store.GetLevel(index)); }

    GetValidLevelCount()
    {
        this._EnsureStarted();
        var count = 0;
        for (var i = 0; i < this.GetLevelCount(); i++)
            count += this.IsLevelValid(i) ? 1 : 0;
        return count;
    }

    GetLevelCount()
    {
        this._EnsureStarted();
        return this._store.GetCount();
    }

    // --- редактор уровней: правки поверх кампании, сохраняются в editedLevelsPath ---

    GetLevelConfig(index) { this._EnsureStarted(); return this._store.GetLevel(index); }
    IsLevelEdited(index) { this._EnsureStarted(); return this._store.IsEdited(index); }
    IsLevelNew(index) { this._EnsureStarted(); return this._store.IsNew(index); }
    IsCampaignStructureEdited() { this._EnsureStarted(); return this._store.IsStructureEdited(); }
    GetEditedLevelCount() { this._EnsureStarted(); return this._store.EditedCount(); }
    GetLevelId(index) { this._EnsureStarted(); return this._store.GetId(index); }
    GetLevelTitle(index) { this._EnsureStarted(); return this._store.GetTitle(index); }
    FindLevel(id) { this._EnsureStarted(); return this._store.IndexOf(id); }

    SetLevelConfig(index, config)
    {
        this._EnsureStarted();
        this._store.SetLevel(index, config);
        this._SaveStore();
    }

    ResetLevelConfig(index)
    {
        this._EnsureStarted();
        this._store.ResetLevel(index);
        this._SaveStore();
    }

    RenameLevel(index, name)
    {
        this._EnsureStarted();
        this._store.Rename(index, name);
        this._SaveStore();
    }

    // Структура кампании: новый, копия, удаление, перестановка. Возвращают номер уровня, с которым работать дальше
    CreateLevel(index)
    {
        this._EnsureStarted();
        var at = this._store.CreateLevel(index);
        this._SaveStore();
        return at;
    }

    DuplicateLevel(index)
    {
        this._EnsureStarted();
        var at = this._store.DuplicateLevel(index);
        this._SaveStore();
        return at;
    }

    RemoveLevel(index)
    {
        this._EnsureStarted();
        if (!this._store.RemoveLevel(index))
            return index;
        this._SaveStore();
        return Math.min(index, this.GetLevelCount() - 1);
    }

    MoveLevel(index, to)
    {
        this._EnsureStarted();
        var at = this._store.MoveLevel(index, to);
        this._SaveStore();
        return at;
    }

    // Снимок правок и порядка кампании для отмены/повтора в редакторе
    GetEditorState() { this._EnsureStarted(); return this._store.GetState(); }

    SetEditorState(state)
    {
        this._EnsureStarted();
        this._store.SetState(state);
        this._SaveStore();
    }

    // Агент: слова и цель уровня в том виде, в каком их получит игрок на этом словаре
    PreviewLevelWords(config)
    {
        this._EnsureStarted();
        return WordFallWordAgent.ResolveWords(WordFallConfigs.NormalizeLevel(config), this._dictionary, this._BoardConfig());
    }

    PreviewTargetScore(config)
    {
        this._EnsureStarted();
        var level = WordFallConfigs.NormalizeLevel(config);
        return WordFallWordAgent.TargetScore(level, WordFallWordAgent.ResolveWords(level, this._dictionary, this._BoardConfig()), this._BoardConfig());
    }

    // count новых слов от агента в дополнение к words уровня
    PickLevelWords(config, count)
    {
        this._EnsureStarted();
        var level = WordFallConfigs.NormalizeLevel(config);
        return WordFallWordAgent.PickWords(level, this._dictionary, this._BoardConfig(), level.words, count);
    }

    // Записывает кампанию с правками в campaignExportPath (исходники ассетов)
    ExportCampaign()
    {
        this._EnsureStarted();
        return o2.FileSystem.WriteFile(this.campaignExportPath, this._store.ExportJson());
    }

    // Кампания с правками и отдельный уровень — текст в формате campaign.json
    GetCampaignJson() { this._EnsureStarted(); return this._store.ExportJson(); }
    GetLevelJson(index) { this._EnsureStarted(); return this._store.ExportLevelJson(index); }

    // Кампания, правки или один уровень из текста файла; уровень index — куда ложится
    // одиночный уровень. Загруженное сохраняется и текущий уровень перезапускается
    ImportJson(text, index)
    {
        this._EnsureStarted();
        var at = Math.min(Math.max(index, 0), this.GetLevelCount() - 1);
        var result;
        if (WordFallMatch3Import.LooksLikeMatch3(text))
        {
            var board = this._BoardConfig();
            var imported = WordFallMatch3Import.Import(text, this._store.GetLevel(at), board.columns, board.rows);
            if (imported.ok)
                this._store.SetLevel(at, imported.config);
            result = { ok: imported.ok, count: imported.ok ? 1 : 0, message: imported.message };
        }
        else
            result = this._store.ImportJson(text, at);
        if (!result.ok)
            return result;

        this._SaveStore();
        this.StartLevel(this._levelIndex);
        return result;
    }

    // Номинал буквы и размер поля - из конфига поля текущего уровня: _BoardConfig собирает конфиг заново (алфавит
    // языка, remote) при каждом вызове, а вьюхи спрашивают это в циклах по клеткам и буквам
    GetLetterValue(letter)
    {
        this._EnsureStarted();
        var letters = this._level.GetBoard().GetConfig().letters;
        for (var i = 0; i < letters.length; i++)
        {
            if (letters[i].letter == letter)
                return letters[i].value;
        }
        return 0;
    }

    // --- состояние для вьюх ---

    GetColumns() { this._EnsureStarted(); return this._level.GetBoard().GetColumns(); }
    GetRows() { this._EnsureStarted(); return this._level.GetBoard().GetRows(); }

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
            tint: tile.tint,
            empty: !WordBoard.IsTileOccupied(tile) && !WordBoard.IsTileStatic(tile)
        };
    }

    // Выбор: [{c, r}]
    GetSelection()
    {
        this._EnsureStarted();
        return WordFallCells.Copy(this._level.GetBoard().GetSelection());
    }

    // Задачи: [{type, word, length, kind, count, score, letter, progress, done, remaining}];
    // remaining — сколько льда / ящиков ещё на поле
    GetTasks()
    {
        this._EnsureStarted();
        var board = this._level.GetBoard();
        return this._level.GetTasks().map(function(task) {
            var config = task.config;
            return {
                remaining: config.taskType == "ClearIce" ? board.CountIce() : config.taskType == "Crates" ? board.CountCrates() : 0,
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

    // Слова уровня: [{word, found}]
    GetWords()
    {
        this._EnsureStarted();
        return this._level.GetWords().map(function(word) {
            var out = { word: word.word, found: word.found };
            if (word.states)
                out.states = word.states;
            if (word.values)
                out.values = word.values;
            return out;
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
        this._motion.Configure(config.columns, config.rows, WordFallRemote.FallSpeed(this.fallSpeedCells), this.fallCascadeDelay, 0.6);
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
        this._selectionRevisions++;
        return result;
    }

    ClearSelection()
    {
        this._EnsureStarted();
        this._level.GetBoard().ClearSelection();
        this._revision++;
        this._selectionRevisions++;
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
            this._BoosterSpent(true);
        }
        return this._MoveToScript(result);
    }

    UseHint()
    {
        this._EnsureStarted();
        var search = this._HintSearch();
        search.Step(Infinity);
        return this._BoosterSpent(this._level.UseHint(this._dictionary, search.Result()));
    }
    UseJoker(column, row) { this._EnsureStarted(); return this._BoosterSpent(this._level.UseJoker({ c: column, r: row })); }

    // Решафл: перелёты плиток [{fromC, fromR, toC, toR}] для анимации или null
    UseReshuffle()
    {
        this._EnsureStarted();
        var flights = this._level.UseReshuffle(this._dictionary, this.reshuffleStayShare, this.reshuffleReach);
        if (!this._BoosterSpent(flights != null))
            return null;
        return flights.map(function(flight) { return { fromC: flight.from.c, fromR: flight.from.r, toC: flight.to.c, toR: flight.to.r }; });
    }

    // --- отладка, читы и тесты ---

    DebugSetTile(column, row, letter) { this._Debug(function(level) { level.GetBoard().DebugSetTile({ c: column, r: row }, letter); }); }
    DebugSetStone(column, row) { this._Debug(function(level) { level.GetBoard().DebugSetStone({ c: column, r: row }); }); }
    DebugSetPowerup(column, row, kind) { this._Debug(function(level) { level.GetBoard().DebugSetPowerup({ c: column, r: row }, kind); }); }
    DebugSetTargetScore(target) { this._Debug(function(level) { level.DebugSetTargetScore(target); }); }
    DebugCompleteTasks() { this._Debug(function(level) { level.DebugCompleteTasks(); }); }
    DebugAddMoves(moves) { this._Debug(function(level) { level.DebugAddMoves(moves); }); }
    DebugAddScore(score) { this._Debug(function(level) { level.DebugAddScore(score); }); }
    DebugAddCharges(charges) { this._Debug(function(level) { level.DebugAddCharges(charges); }); this._SaveProgress(); }
    DebugLoseLevel() { this._Debug(function(level) { level.DebugLose(); }); }

    // Экран макета: поле строками сверху вниз («.» — пустая клетка), номиналы, цвета плашек c/p/o/y — кремовая,
    // персиковая, оранжевая, жёлтая (удвоенная); слова с состояниями букв n/f/a — обычная, найдена,
    // в наборе; прочие задачи, ходы и счёт
    DebugApplyMock(mock)
    {
        this._Debug(function(level) {
            var board = level.GetBoard();
            var rows = mock.rows || [];
            var tints = { c: 0, p: 1, o: 3, y: 0 };
            for (var r = 0; r < rows.length; r++)
            {
                for (var c = 0; c < rows[r].length; c++)
                {
                    var letter = rows[r].charAt(c);
                    var tile = new WordTile(letter == "." ? "" : letter);
                    tile.value = parseInt((mock.values || [])[r] ? mock.values[r].charAt(c) : "1") || 1;
                    var style = (mock.styles || [])[r] ? mock.styles[r].charAt(c) : "c";
                    tile.tint = tints[style] || 0;
                    tile.doubled = style == "y";
                    if (tile.doubled)
                        tile.value = Math.max(1, Math.round(tile.value/2));
                    board.grid[c][rows.length - 1 - r] = tile;
                }
            }
            if (mock.moves !== undefined) level.movesLeft = mock.moves;
            if (mock.score !== undefined) level.score = mock.score;
            if (mock.target !== undefined) level.config.targetScore = mock.target;
            if (mock.words)
            {
                level.words = mock.words.map(function(word) {
                    return { word: word.word, found: word.states.indexOf("n") < 0 && word.states.indexOf("a") < 0, states: word.states, values: word.values };
                });
            }
            if (mock.tasks)
            {
                level.tasks = mock.tasks.map(function(task) {
                    return { config: WordFallConfigs.MakeTask(task), progress: task.progress || 0, done: !!task.done };
                });
            }
        });
    }

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

    // --- мета: монеты, жизни, звёзды, награда за победу, продолжение за ходы ---

    GetCoins() { this._EnsureStarted(); return this._progress.coins; }
    GetStars() { this._EnsureStarted(); return this._progress.TotalStars(); }

    GetLives()
    {
        this._EnsureStarted();
        var lives = this._progress.lives, at = this._progress.livesAt;
        this._progress.RegenLives(this.maxLives, this.lifeRegenSeconds, Date.now());
        if (lives != this._progress.lives || at != this._progress.livesAt)
            this._SaveProgress();
        return this._progress.lives;
    }

    // Звёзды за запас очков сверх цели: 1 — цель, 2 — +25 %, 3 — +60 %
    StarsFor(score, target)
    {
        if (score < target)
            return 0;
        return score >= target*1.6 ? 3 : score >= target*1.25 ? 2 : 1;
    }

    // Победа: звёзды и прогресс сохраняются, стартует следующий уровень. Награда ещё не выдана —
    // её забирают из окна победы (ClaimReward), обычную или удвоенную
    WinLevel()
    {
        this._EnsureStarted();
        var score = this._level.GetScore(), target = this._level.GetTargetScore();
        var result = { level: this._levelIndex + 1, score: score, target: target, stars: this.StarsFor(score, target),
                       reward: Math.max(1, Math.round(score*this.coinsPerScore)) };
        if (!this._custom)
            this._progress.SetStars(this._levelIndex, result.stars);
        this.AdvanceToNextLevel();
        return result;
    }

    ClaimReward(coins)
    {
        this._EnsureStarted();
        this._progress.coins += Math.max(0, Math.round(coins));
        this._SaveProgress();
        this._revision++;
        return this._progress.coins;
    }

    CanContinueWithCoins() { this._EnsureStarted(); return this._progress.coins >= this.continuePrice; }

    // Ходы кончились: продолжить за монеты; false — уровень не проигран или монет не хватает
    ContinueWithCoins()
    {
        this._EnsureStarted();
        if (this._level.GetState() != "lost" || !this.CanContinueWithCoins())
            return false;
        this._progress.coins -= this.continuePrice;
        this._SaveProgress();
        this._level.AddMoves(this.continueMoves);
        this._revision++;
        return true;
    }

    // Продолжить за просмотр рекламы
    ContinueForAd()
    {
        this._EnsureStarted();
        if (this._level.GetState() != "lost")
            return false;
        this._level.AddMoves(this.continueMoves);
        this._revision++;
        return true;
    }

    // Отказ от продолжения: жизнь сгорает, уровень начнётся заново
    GiveUpLevel()
    {
        this._EnsureStarted();
        if (this._custom)
        {
            this.RestartLevel();
            return;
        }
        this.GetLives();
        if (this._progress.lives >= this.maxLives)
            this._progress.livesAt = Date.now();
        this._progress.lives = Math.max(0, this._progress.lives - 1);
        this._SaveProgress();
        this.RestartLevel();
    }

    // --- магазин и окна меты: монеты, бустеры, бонусы на старт уровня, жизни, настройки ---
    // Платежей в игре нет: покупка пачки монет засчитывается сразу, как и просмотр ролика

    static get BonusKinds() { return ["bomb", "rocket", "fireworks"]; }

    GetShopPacks() { return this.shopPacks.map(function(pack) { return { coins: pack.coins, price: pack.price }; }); }

    BuyCoins(index)
    {
        this._EnsureStarted();
        var pack = this.shopPacks[index];
        if (!pack)
            return false;
        this._progress.coins += Math.max(0, Math.round(pack.coins));
        this._SaveProgress();
        this._revision++;
        return true;
    }

    // Запас бустеров игрока (в уровне кампании это и есть заряды уровня) и их покупка пачкой boosterPack
    GetBoosterStock(booster) { this._EnsureStarted(); return this._progress.boosters[booster] || 0; }
    GetBoosterPrice(booster) { return this.boosterPrices[booster] || 0; }
    BuyBooster(booster)
    {
        this._EnsureStarted();
        var pack = this.boosterPack;
        return booster >= 0 && booster < WordLevel.BoosterCount &&
            this._Spend(this.GetBoosterPrice(booster), function(progress) { progress.boosters[booster] += pack; });
    }

    // Бонусы на старт уровня (индексы BonusKinds): запас и покупка
    GetBonusCount(bonus) { this._EnsureStarted(); return this._progress.bonuses[bonus] || 0; }
    GetBonusPrice(bonus) { return this.bonusPrices[bonus] || 0; }
    BuyBonus(bonus)
    {
        this._EnsureStarted();
        var pack = this.boosterPack;
        return bonus >= 0 && bonus < 3 &&
            this._Spend(this.GetBonusPrice(bonus), function(progress) { progress.bonuses[bonus] += pack; });
    }

    // Уровень кампании из окна старта: начинается заново, выбранные бонусы (индексы BonusKinds) встают на поле
    // и списываются из запаса. Возвращает их клетки
    StartLevelWithBonuses(bonuses)
    {
        this._EnsureStarted();
        this.StartLevel(this._levelIndex);
        var placed = [];
        if (this._custom)
            return placed;

        var board = this._level.GetBoard();
        for (var i = 0; i < (bonuses || []).length; i++)
        {
            var bonus = bonuses[i];
            if (this.GetBonusCount(bonus) <= 0)
                continue;
            var cell = board.PlaceBonus(WordFallGameService.BonusKinds[bonus]);
            if (!cell)
                continue;
            this._progress.bonuses[bonus]--;
            placed.push(cell);
        }
        if (placed.length > 0)
        {
            this._SaveProgress();
            this._revision++;
        }
        return placed;
    }

    GetMaxLives() { return this.maxLives; }

    // Секунд до следующей жизни; 0 — запас полон
    GetNextLifeSeconds()
    {
        var lives = this.GetLives();
        if (lives >= this.maxLives || this._progress.livesAt <= 0)
            return 0;
        return Math.max(0, Math.ceil((this._progress.livesAt + this.lifeRegenSeconds*1000 - Date.now())/1000));
    }

    CanRefillLives() { return this.GetLives() < this.maxLives && this._progress.coins >= this.livesRefillPrice; }

    RefillLivesWithCoins()
    {
        this._EnsureStarted();
        if (!this.CanRefillLives())
            return false;
        this._progress.coins -= this.livesRefillPrice;
        this._progress.lives = this.maxLives;
        this._progress.livesAt = 0;
        this._SaveProgress();
        this._revision++;
        return true;
    }

    // Жизнь за ролик
    AddLifeForAd()
    {
        if (this.GetLives() >= this.maxLives)
            return false;
        this._progress.lives++;
        if (this._progress.lives >= this.maxLives)
            this._progress.livesAt = 0;
        this._SaveProgress();
        this._revision++;
        return true;
    }

    // Настройки игрока: sound, music; не заданная — включена
    GetSetting(name)
    {
        this._EnsureStarted();
        var value = this._progress.settings[name];
        return value === undefined ? true : !!value;
    }

    SetSetting(name, value)
    {
        this._EnsureStarted();
        this._progress.settings[name] = !!value;
        this._SaveProgress();
        this._revision++;
    }

    IsTutorialSeen(key) { this._EnsureStarted(); return this._custom != null || this._progress.IsTutorialSeen(key); }

    // Запомнить показанный туториал (сохраняет прогресс)
    MarkTutorialSeen(key)
    {
        this._EnsureStarted();
        this._progress.MarkTutorialSeen(key);
        this._SaveProgress();
    }

    // Чит: прогресс с нуля, как у нового игрока (язык и настройки звука остаются); сохранение сразу уходит в сервис
    ResetProgress()
    {
        this._EnsureStarted();
        var progress = new PlayerProgress();
        progress.language = this._progress.language;
        progress.settings = this._progress.settings;
        this._NewPlayerDefaults(progress);
        this._progress = progress;
        this._SaveProgress();
        this._progressStore.Sync();
        this.StartLevel(0);
    }

    // Отправить сохранение игрока в сервис сейчас; callback(ok)
    SyncProgress(callback)
    {
        this._EnsureStarted();
        this._progressStore.Sync(callback);
    }

    // id игрока (по нему сохранение находится на вкладке Saves портала) и состояние синхронизации
    GetSaveStatus() { this._EnsureStarted(); return this._progressStore.Status(); }

    ResetTutorials()
    {
        this._EnsureStarted();
        this._progress.seenTutorials = [];
        this._SaveProgress();
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

    // Баланс уровня берётся на его старте: пришедший посреди уровня конфиг действует со следующего
    _LogRemote()
    {
        var state = JSON.stringify(WordFallGame.remote || {});
        if (state !== this._remoteLogged)
            print("WordFall: balance " + state);
        this._remoteLogged = state;
    }

    _BoardConfig()
    {
        return WordFallRemote.ApplyBoard(WordFallLanguages.ApplyBoard(WordFallConfigs.NormalizeBoard(this.boardConfig)));
    }

    _Dictionary()
    {
        this._dictionary = WordFallLanguages.Dictionary();
        return this._dictionary;
    }

    // index, если уровень валиден на текущем языке, иначе следующий валидный по кругу
    _ValidLevelFrom(index)
    {
        var count = this.GetLevelCount();
        for (var step = 0; step < count; step++)
        {
            var at = (index + step) % count;
            if (this.IsLevelValid(at))
                return at;
        }
        print("WordFall: no level has words of language " + WordFallLanguages.Current());
        return index;
    }

    _EnsureStarted()
    {
        if (this._started)
            return;

        this._started = true;
        if (!Array.isArray(this.levels))
            this.levels = [];

        var self = this;
        o2.Profile("WordFall: progress", function() {
            self._progressStore = new WordFallProgressStore(self.progressPath, self.progressSection);
            var restored = self._progressStore.Load(self._progress);
            self._NewPlayerDefaults(self._progress);
            var status = self._progressStore.Status();
            print("WordFall: " + (restored ? "progress restored" : "a new player") + ", level " + (self._progress.currentLevel + 1) +
                  ", coins " + self._progress.coins + (status.file ? ", file " + status.file : ", player " + status.player +
                  (status.cloud ? ", synced with the service" : ", on this device only")));
            WordFallLanguages.SetCurrent(self._progress.language);
            if (!restored && self._progressStore.IsPlayerSave())
                self._SaveProgress(); // новый игрок виден на портале с первого запуска
            self._progressStore.OnReplaced(function() { if (WordFallGame.service === self) self._OnProgressReplaced(); });
        });
        o2.Profile("WordFall: dictionary", function() { self._Dictionary(); });

        // ручная кампания в редакторе > data-ассет кампании > процедурная генерация
        this._campaign = [];
        if (this.levels.length == 0 && this.campaignPath)
        {
            o2.Profile("WordFall: campaign", function() {
                var asset = new o2.AssetRefDataAsset(self.campaignPath);
                if (asset.IsValid())
                {
                    var data = JSON.parse(asset.Get().GetJson());
                    if (Array.isArray(data))
                        self._campaign = data.map(function(level) { return WordFallConfigs.NormalizeLevel(WordFallConfigs.UpgradeFileLevel(level)); });
                }
            });
            if (this._campaign.length == 0)
                print("WordFall: campaign asset " + this.campaignPath + " is missing or empty, using the procedural campaign");
        }

        var count = this.levels.length > 0 ? this.levels.length : this._campaign.length > 0 ? this._campaign.length : this.campaignLength;
        var listed = this.levels.length > 0 ? this.levels : this._campaign;
        var ids = [];
        for (var i = 0; i < listed.length; i++)
            ids.push(listed[i] && listed[i].id ? listed[i].id : WordFallConfigs.LevelId(i));
        o2.Profile("WordFall: level store", function() {
            self._store = new WordFallLevelStore(function(index) {
                return self.levels.length > 0 ? WordFallConfigs.UpgradeFileLevel(self.levels[index])
                    : self._campaign.length > 0 ? WordFallRemote.Level(ids[index]) || self._campaign[index]
                    : WordFallLevels.Generate(index, self._dictionary, self._BoardConfig());
            }, count, ids);
            self._store.Load(self.editedLevelsPath);
        });

        o2.Profile("WordFall: start level", function() { self.StartLevel(self._progress.currentLevel); });
    }

    _SaveProgress()
    {
        if (this._custom)
            return;
        if (!this._progressStore.Save(this._progress))
            print("WordFall: failed to save progress to " + (this.progressPath || "the player's save"));
    }

    // Новому игроку - стартовые монеты, бустеры и бонусы
    _NewPlayerDefaults(progress)
    {
        if (progress.coins < 0)
            progress.coins = this.startCoins;
        progress.EnsureBoosters(this.startBoosters);
        progress.EnsureBonuses(this.startBonuses);
    }

    // Сохранение заменила копия сервиса (правка на портале): прогресс перечитывается. Начатый уровень доигрывается,
    // новый текущий уровень берётся с главного экрана
    _OnProgressReplaced()
    {
        var progress = new PlayerProgress();
        this._progressStore.Load(progress);
        this._NewPlayerDefaults(progress);
        this._progress = progress;
        print("WordFall: progress replaced by the service's copy, level " + (progress.currentLevel + 1) + ", coins " + progress.coins);
        if (progress.language != WordFallLanguages.Current())
        {
            WordFallLanguages.SetCurrent(progress.language);
            this._Dictionary();
        }
        if (!this._custom)
        {
            var screens = WordFallGame.screens;
            if (!screens || !screens.IsMetaFlow() || screens.IsMainShown())
                this.StartLevel(progress.currentLevel);
            else
                this._level.UseCharges(progress.boosters);
        }
        this._revision++;
    }

    _SaveStore()
    {
        if (!this._store.Save(this.editedLevelsPath))
            print("WordFall: failed to save edited levels to " + this.editedLevelsPath);
    }

    // Перебор словаря для подсказки занимает десятки миллисекунд — он идёт наперёд, частями по кадрам, и нажатие
    // берёт готовое слово. Поиск привязан к ревизии: любое изменение уровня начинает его заново, а шагает он со
    // следующего кадра — кадр хода и так самый тяжёлый
    _PrepareHint()
    {
        if (!this._started || this._level.GetState() != "playing" || this._level.GetBoosterCharges(WordLevel.Hint) <= 0)
            return;

        var fresh = this._hintRevision != this._HintKey();
        var search = this._HintSearch();
        if (!fresh && !search.IsDone())
            search.Step(this.hintWordsPerFrame);
    }

    // Состояние, от которого зависит слово подсказки: всё, кроме выбора букв. Выбор - каждая буква, которую игрок
    // или сама подсказка щёлкает в лоток, - перезапускал перебор словаря, и нажатие подсказки после хода доделывало
    // его целиком в одном кадре (десятки мс в вебе)
    _HintKey() { return this._revision - this._selectionRevisions; }

    _HintSearch()
    {
        if (!this._hintSearch || this._hintRevision != this._HintKey())
        {
            this._hintSearch = this._level.BeginHintSearch(this._dictionary);
            this._hintRevision = this._HintKey();
        }
        return this._hintSearch;
    }

    _Mutation(ok)
    {
        if (ok)
            this._revision++;
        return ok;
    }

    // Покупка за монеты: price списывается, grant(progress) кладёт купленное
    _Spend(price, grant)
    {
        if (!(price > 0) || this._progress.coins < price)
            return false;
        this._progress.coins -= price;
        grant(this._progress);
        this._SaveProgress();
        this._revision++;
        return true;
    }

    // Бустер потрачен: в кампании это заряд из запаса игрока — он сохраняется сразу
    _BoosterSpent(ok)
    {
        if (ok)
            this._SaveProgress();
        return this._Mutation(ok);
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
            wordFound: result.wordFound || "",
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
