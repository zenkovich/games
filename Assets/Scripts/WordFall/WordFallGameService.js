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
        this.editedLevelsPath = "wordfall_levels.json"; // правки редактора уровней поверх кампании
        this.campaignExportPath = "../../Assets/WordFall/campaign.json"; // куда редактор экспортирует кампанию
        this.match3ImportPath = "match3_level.xml";   // уровень «три в ряд» для импорта в нативной сборке
        this.fallSpeedCells = 9.5;                   // скорость падения, клеток/с
        this.fallCascadeDelay = 0.05;                // пауза стартов плиток колонки

        this._started = false;
        this._dictionary = null;
        this._campaign = [];
        this._store = null;
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

    // Уровень без слов текущего языка не играется: стартует ближайший следующий валидный
    StartLevel(index)
    {
        this._EnsureStarted();
        this._levelIndex = this._ValidLevelFrom(Math.min(Math.max(index, 0), this.GetLevelCount() - 1));
        this._level.Start(this._store.GetLevel(this._levelIndex), this._BoardConfig(), this._dictionary, this.randomSeed);
        this._LogRemote();
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
        if (!this._progress.Save(this.progressPath))
            print("WordFall: failed to save progress to " + this.progressPath);
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

    GetLetterValue(letter)
    {
        var letters = this._BoardConfig().letters;
        for (var i = 0; i < letters.length; i++)
        {
            if (letters[i].letter == letter)
                return letters[i].value;
        }
        return 0;
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

    // Экран макета (концепта): поле строками сверху вниз, номиналы, цвета плашек c/p/o/y — кремовая,
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
                    var tile = new WordTile(rows[r].charAt(c));
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
        this._progress.Load(this.progressPath);
        WordFallLanguages.SetCurrent(this._progress.language);
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
                    this._campaign = data.map(function(level) { return WordFallConfigs.NormalizeLevel(WordFallConfigs.UpgradeFileLevel(level)); });
            }
            if (this._campaign.length == 0)
                print("WordFall: campaign asset " + this.campaignPath + " is missing or empty, using the procedural campaign");
        }

        var self = this;
        var count = this.levels.length > 0 ? this.levels.length : this._campaign.length > 0 ? this._campaign.length : this.campaignLength;
        var listed = this.levels.length > 0 ? this.levels : this._campaign;
        var ids = [];
        for (var i = 0; i < listed.length; i++)
            ids.push(listed[i] && listed[i].id ? listed[i].id : WordFallConfigs.LevelId(i));
        this._store = new WordFallLevelStore(function(index) {
            return self.levels.length > 0 ? WordFallConfigs.UpgradeFileLevel(self.levels[index])
                : self._campaign.length > 0 ? self._campaign[index]
                : WordFallLevels.Generate(index, self._dictionary, self._BoardConfig());
        }, count, ids);
        this._store.Load(this.editedLevelsPath);

        this.StartLevel(this._progress.currentLevel);
    }

    _SaveStore()
    {
        if (!this._store.Save(this.editedLevelsPath))
            print("WordFall: failed to save edited levels to " + this.editedLevelsPath);
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
