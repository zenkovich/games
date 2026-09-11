include("Scripts/WordFall/Core/WordFallCore.js");

// Ядро Word Fall: словарь, поле, очки, гравитация, бонусы, уровень с задачами, прогресс
(function()
{
    var dictionary = WordDictionary.LoadDefault();
    var boardConfig = WordFallConfigs.DefaultBoardConfig();

    function Cell(c, r) { return { c: c, r: r }; }

    function LevelConfig(fields)
    {
        var config = WordFallConfigs.DefaultLevelConfig();
        for (var key in fields)
            config[key] = fields[key];
        return config;
    }

    function SandboxConfig()
    {
        return LevelConfig({ targetScore: 300, moves: 12, iceCells: [Cell(1, 6), Cell(5, 2), Cell(4, 7), Cell(0, 1)] });
    }

    function StartLevel(config)
    {
        var level = new WordLevel();
        level.Start(config || SandboxConfig(), boardConfig, dictionary, 42);
        return level;
    }

    // Поле редкой согласной: тестовые слова не пересекаются со случайными
    function FillBoardWithStubs(board)
    {
        for (var c = 0; c < boardConfig.columns; c++)
            for (var r = 0; r < boardConfig.rows; r++)
                board.DebugSetTile(Cell(c, r), "Щ");
    }

    function Plant(board, word, row, startColumn)
    {
        for (var i = 0; i < word.length; i++)
            board.DebugSetTile(Cell((startColumn || 0) + i, row || 0), word[i]);
    }

    function SelectRow(board, count, row, startColumn)
    {
        for (var i = 0; i < count; i++)
            board.ToggleSelect(Cell((startColumn || 0) + i, row || 0));
    }

    test("DictionaryContainsWordsAndJokers", function()
    {
        expect(dictionary.GetWordsCount() > 1000);
        expect(dictionary.Contains("КОТ"));
        expect(dictionary.Contains("СЛОН"));
        expect(!dictionary.Contains("ЙЦУ"));
        expect(!dictionary.Contains("К"));

        expect(dictionary.Contains("К?Т"));
        expect(dictionary.Contains("?ЛОН"));
        expect(!dictionary.Contains("Щ?Щ"));
    });

    test("BagMatchesConfiguredProportions", function()
    {
        var total = 0, vowels = 0;
        boardConfig.letters.forEach(function(def) {
            total += def.bagCount;
            if (boardConfig.vowels.indexOf(def.letter) >= 0)
                vowels += def.bagCount;
        });
        expectEq(total, 100);
        expectEq(vowels, 41, "гласные: О9 А8 Е8 И7 У3 Я2 Ы2 Э1 Ю1");
    });

    test("StartFillsGridAndIce", function()
    {
        var board = StartLevel().GetBoard();
        for (var c = 0; c < boardConfig.columns; c++)
        {
            for (var r = 0; r < boardConfig.rows; r++)
            {
                expect(board.GetTile(Cell(c, r)).letter.length > 0);
                expect(board.GetTile(Cell(c, r)).value >= 0);
            }
        }
        expectEq(board.CountIce(), 4);
    });

    test("SameSeedGivesSameBoard", function()
    {
        var a = StartLevel().GetBoard();
        var b = StartLevel().GetBoard();
        for (var c = 0; c < boardConfig.columns; c++)
            for (var r = 0; r < boardConfig.rows; r++)
                expectEq(a.GetTile(Cell(c, r)).letter, b.GetTile(Cell(c, r)).letter);
    });

    test("SelectionTogglesAndCutsTail", function()
    {
        var board = StartLevel().GetBoard();
        FillBoardWithStubs(board);
        SelectRow(board, 3);
        expectEq(board.GetSelection().length, 3);

        // повторный клик по второй букве снимает её и хвост
        board.ToggleSelect(Cell(1, 0));
        expectEq(board.GetSelection(), [Cell(0, 0)]);
    });

    test("IcedTileCanNotBeSelected", function()
    {
        var board = StartLevel().GetBoard();
        FillBoardWithStubs(board);
        board.GetTile(Cell(2, 2)).ice = 1;
        expectEq(board.ToggleSelect(Cell(2, 2)), "iced");
        expectEq(board.GetSelection().length, 0);
    });

    test("AdjacentClusterMultipliesScore", function()
    {
        var board = StartLevel().GetBoard();
        FillBoardWithStubs(board);
        Plant(board, "КОТ");
        SelectRow(board, 3);

        // К(2)+О(1)+Т(1) = 4, кластер 3 → 12
        var score = board.ComputeSelectionScore();
        expectEq(score.score, 12);
        expectEq(score.base, 4);
        expectEq(score.cluster, 3);
    });

    test("ScatteredLettersGetNoClusterBonus", function()
    {
        var board = StartLevel().GetBoard();
        FillBoardWithStubs(board);
        board.DebugSetTile(Cell(0, 0), "К");
        board.DebugSetTile(Cell(3, 3), "О");
        board.DebugSetTile(Cell(6, 7), "Т");
        board.ToggleSelect(Cell(0, 0));
        board.ToggleSelect(Cell(3, 3));
        board.ToggleSelect(Cell(6, 7));

        var score = board.ComputeSelectionScore();
        expectEq(score.score, 4);
        expectEq(score.cluster, 1);
    });

    test("DiagonalCountsAsAdjacency", function()
    {
        var board = StartLevel().GetBoard();
        FillBoardWithStubs(board);
        board.DebugSetTile(Cell(0, 0), "К");
        board.DebugSetTile(Cell(1, 1), "О");
        board.DebugSetTile(Cell(2, 2), "Т");
        board.ToggleSelect(Cell(0, 0));
        board.ToggleSelect(Cell(1, 1));
        board.ToggleSelect(Cell(2, 2));
        expectEq(board.ComputeSelectionScore().cluster, 3);
    });

    test("LengthMultiplier", function()
    {
        expectEq(WordBoard.LengthMultiplier(3), 1);
        expectEq(WordBoard.LengthMultiplier(5), 1.5);
    });

    test("AcceptWordBurnsFallsAndSpawns", function()
    {
        var level = StartLevel();
        var board = level.GetBoard();
        FillBoardWithStubs(board);
        Plant(board, "КОТ");
        SelectRow(board, 3);

        var result = level.AcceptWord(dictionary);
        expect(result.ok);
        expectEq(result.gain, 12);
        expectEq(level.GetScore(), 12);
        expectEq(level.GetMovesLeft(), 11);
        expectEq(board.GetSelection().length, 0);

        expect(result.moved.some(function(m) { return m.c == 0 && m.fromR == 1 && m.toR == 0; }), "колонка 0 съехала на ряд");
        expectEq(result.spawned.length, 3);

        for (var c = 0; c < boardConfig.columns; c++)
            for (var r = 0; r < boardConfig.rows; r++)
                expect(board.GetTile(Cell(c, r)).letter.length > 0);
    });

    test("InvalidWordIsRejected", function()
    {
        var level = StartLevel();
        FillBoardWithStubs(level.GetBoard());
        SelectRow(level.GetBoard(), 2);

        var result = level.AcceptWord(dictionary);
        expect(!result.ok);
        expectEq(result.reason, "invalid");
        expectEq(level.GetMovesLeft(), 12);
    });

    test("AcceptedWordBreaksAdjacentIceSelectionDoesNot", function()
    {
        var level = StartLevel();
        var board = level.GetBoard();
        FillBoardWithStubs(board);
        Plant(board, "КОТ");
        board.GetTile(Cell(1, 1)).ice = 1; // диагональный сосед сгорающего ряда
        board.GetTile(Cell(5, 5)).ice = 1; // далеко — должен остаться

        SelectRow(board, 3);
        expectEq(board.GetTile(Cell(1, 1)).ice, 1, "сам выбор лёд не трогает");

        var result = level.AcceptWord(dictionary);
        expect(result.ok);
        expect(WordFallCells.Contains(result.iceBroken, Cell(1, 1)));
        expectEq(board.GetTile(Cell(1, 1)).ice, 0);
        expectEq(board.GetTile(Cell(5, 5)).ice, 1);
    });

    test("StoneSurvivesSelectionAndAcceptedWord", function()
    {
        var level = StartLevel();
        var board = level.GetBoard();
        FillBoardWithStubs(board);
        Plant(board, "КОТ");
        board.DebugSetStone(Cell(1, 1));

        expectEq(board.ToggleSelect(Cell(1, 1)), "blocked");

        // камень ломают только бонусы; после обвала каменная плитка падает на ряд ниже
        SelectRow(board, 3);
        expect(level.AcceptWord(dictionary).ok);
        expectEq(board.GetTile(Cell(1, 0)).stone, 1);
    });

    test("WinRequiresTasksAndScore", function()
    {
        var level = StartLevel(LevelConfig({ targetScore: 10, moves: 10, tasks: [WordFallConfigs.MakeWord("КОТ")] }));
        var board = level.GetBoard();

        // очков хватает, но задание не закрыто — победы нет
        Plant(board, "ДОМ");
        SelectRow(board, 3);
        level.AcceptWord(dictionary);
        expect(level.GetScore() >= 10);
        expectEq(level.GetState(), "playing");

        Plant(board, "КОТ");
        SelectRow(board, 3);
        level.AcceptWord(dictionary);
        expectEq(level.GetState(), "won");
    });

    test("RunningOutOfMovesLoses", function()
    {
        var level = StartLevel();
        FillBoardWithStubs(level.GetBoard());
        level.DebugSetMovesLeft(1);
        Plant(level.GetBoard(), "КОТ");
        SelectRow(level.GetBoard(), 3);

        level.AcceptWord(dictionary);
        expectEq(level.GetState(), "lost");
    });

    test("HammerDestroysTileWithoutMoveCost", function()
    {
        var level = StartLevel();
        var board = level.GetBoard();
        FillBoardWithStubs(board);
        board.GetTile(Cell(3, 0)).ice = 1;

        var result = level.UseHammer(Cell(3, 0), dictionary);
        expect(result.ok);
        expectEq(level.GetBoosterCharges(WordLevel.Hammer), 2);
        expectEq(level.GetMovesLeft(), 12);
        expectEq(board.GetTile(Cell(3, 0)).ice, 0);
        expectEq(result.spawned.length, 1);
    });

    test("ShufflePreservesLettersAndSkipsIce", function()
    {
        var level = StartLevel();
        var board = level.GetBoard();
        FillBoardWithStubs(board);
        board.DebugSetTile(Cell(4, 4), "Ю");
        board.GetTile(Cell(4, 4)).ice = 1;

        expect(level.UseShuffle(dictionary));
        expectEq(board.GetTile(Cell(4, 4)).letter, "Ю");
        expectEq(level.GetBoosterCharges(WordLevel.Shuffle), 2);
    });

    test("HintFindsMostExpensiveWord", function()
    {
        var level = StartLevel();
        var board = level.GetBoard();
        FillBoardWithStubs(board);
        Plant(board, "КОТ", 0);
        Plant(board, "ФАКТ", 2);

        expect(level.UseHint(dictionary));
        expect(board.GetSelection().length >= 3);
        expectEq(level.GetBoosterCharges(WordLevel.Hint), 2);
        expect(level.AcceptWord(dictionary).ok, "подсказанное слово принимается");
    });

    test("JokerActsAsAnyLetter", function()
    {
        var level = StartLevel();
        var board = level.GetBoard();
        FillBoardWithStubs(board);
        Plant(board, "КЩТ");
        expect(level.UseJoker(Cell(1, 0)));
        SelectRow(board, 3);

        expectEq(board.GetCurrentWord(), "К?Т");
        expectEq(level.GetBoosterCharges(WordLevel.Joker), 2);

        // джокер даёт 0 очков: К(2)+Т(1) = 3, кластер 3 → 9
        expectEq(board.ComputeSelectionScore().score, 9);
        expect(level.AcceptWord(dictionary).ok);
    });

    test("DoublerDoublesLetterValue", function()
    {
        var level = StartLevel();
        var board = level.GetBoard();
        FillBoardWithStubs(board);
        Plant(board, "КОТ");
        expect(level.UseDoubler(Cell(0, 0)));
        SelectRow(board, 3);

        // К(2×2)+О(1)+Т(1) = 6, кластер 3 → 18
        expectEq(board.ComputeSelectionScore().score, 18);
    });

    test("FiveLetterWordEarnsBombOnLastCell", function()
    {
        var level = StartLevel();
        var board = level.GetBoard();
        FillBoardWithStubs(board);
        Plant(board, "ЧАШКА");
        SelectRow(board, 5);

        var result = level.AcceptWord(dictionary);
        expect(result.ok);
        expectEq(result.powerupEarned, "bomb");
        expectEq(board.GetTile(Cell(4, 0)).powerup, "bomb");
    });

    test("LongerWordsEarnRocketAndFireworks", function()
    {
        var level = StartLevel();
        var board = level.GetBoard();
        FillBoardWithStubs(board);
        Plant(board, "РАКЕТА");
        SelectRow(board, 6);

        expectEq(level.AcceptWord(dictionary).powerupEarned, "rocket");

        // бонус занимает слот вместо буквы и не выбирается
        var bonusTile = board.GetTile(Cell(5, 0));
        expectEq(bonusTile.powerup, "rocket");
        expectEq(bonusTile.letter, "");
        expectEq(board.ToggleSelect(Cell(5, 0)), "blocked");
    });

    test("BombActivatedByNeighborLetterDestroysArea", function()
    {
        var level = StartLevel();
        var board = level.GetBoard();
        FillBoardWithStubs(board);
        Plant(board, "КОТ", 1, 0);
        board.DebugSetPowerup(Cell(1, 0), "bomb"); // сосед буквы «О» снизу
        SelectRow(board, 3, 1, 0);

        var result = level.AcceptWord(dictionary);
        expect(result.ok);
        assert(result.powerupsUsed.length == 1, "один бонус сработал");
        expectEq(result.powerupsUsed[0].kind, "bomb");

        // бомба-плитка сгорела вместе с областью, очки взорванных букв в счёт
        expect(WordFallCells.Contains(result.destroyed, Cell(1, 0)));
        expect(result.extraScore > 0);
        expectEq(board.GetTile(Cell(1, 0)).powerup, "");
    });

    test("BombBreaksStoneButKeepsTile", function()
    {
        var level = StartLevel();
        var board = level.GetBoard();
        FillBoardWithStubs(board);
        Plant(board, "КОТ", 1, 0);
        board.DebugSetPowerup(Cell(1, 0), "bomb");
        board.DebugSetStone(Cell(0, 0)); // в зоне 3×3 бомбы
        SelectRow(board, 3, 1, 0);

        var result = level.AcceptWord(dictionary);
        expect(result.ok);
        expectEq(board.GetTile(Cell(0, 0)).stone, 0);
        expect(board.GetTile(Cell(0, 0)).letter.length > 0);
        expect(WordFallCells.Contains(result.activated, Cell(0, 0)));
    });

    test("RocketFliesToRandomLetter", function()
    {
        var level = StartLevel();
        var board = level.GetBoard();
        FillBoardWithStubs(board);
        Plant(board, "КОТ", 1, 0);
        board.DebugSetPowerup(Cell(1, 0), "rocket");
        SelectRow(board, 3, 1, 0);

        var result = level.AcceptWord(dictionary);
        expect(result.ok);
        assert(result.powerupsUsed.length == 1);
        expectEq(result.powerupsUsed[0].kind, "rocket");

        // одна цель: буква удалена (или разбита броня), бонус-плитка сгорела
        assert(result.powerupsUsed[0].targets.length == 1);
        var target = result.powerupsUsed[0].targets[0];
        expect(WordFallCells.Contains(result.destroyed, target) || WordFallCells.Contains(result.activated, target));
        expect(WordFallCells.Contains(result.destroyed, Cell(1, 0)));
    });

    test("FireworksLaunchesTenRockets", function()
    {
        var level = StartLevel();
        var board = level.GetBoard();
        FillBoardWithStubs(board);
        Plant(board, "КОТ", 1, 0);
        board.DebugSetPowerup(Cell(1, 0), "fireworks");
        SelectRow(board, 3, 1, 0);

        var result = level.AcceptWord(dictionary);
        expect(result.ok);
        assert(result.powerupsUsed.length == 1);
        expectEq(result.powerupsUsed[0].kind, "fireworks");

        var targets = result.powerupsUsed[0].targets;
        expectEq(targets.length, 10);
        for (var i = 0; i < targets.length; i++)
        {
            for (var j = i + 1; j < targets.length; j++)
                expect(!WordFallCells.Equal(targets[i], targets[j]), "две ракеты в одну плитку");
            expect(WordFallCells.Contains(result.destroyed, targets[i]) || WordFallCells.Contains(result.activated, targets[i]));
        }
    });

    test("BonusTileFallsWithGravity", function()
    {
        var level = StartLevel();
        var board = level.GetBoard();
        FillBoardWithStubs(board);
        board.DebugSetPowerup(Cell(3, 1), "bomb");

        // молоток сносит плитку под бонусом — бонус падает вниз, а не исчезает
        level.UseHammer(Cell(3, 0), dictionary);
        expectEq(board.GetTile(Cell(3, 0)).powerup, "bomb");
        expectEq(board.GetTile(Cell(3, 0)).letter, "");
    });

    test("WordTaskSeedsWordAndTracksProgress", function()
    {
        var level = StartLevel(LevelConfig({ targetScore: 100, moves: 10, tasks: [WordFallConfigs.MakeWord("КОТ")] }));
        var board = level.GetBoard();

        var seeded = board.GetSeededCells();
        assert(seeded.length == 3, "слово задания выложено на поле");
        expectEq(seeded.map(function(cell) { return board.GetTile(cell).letter; }).join(""), "КОТ");

        Plant(board, "КОТ");
        SelectRow(board, 3);
        level.AcceptWord(dictionary);
        expect(level.GetTasks()[0].done);
    });

    test("LengthTaskCountsWordsOfExactLength", function()
    {
        var level = StartLevel(LevelConfig({ targetScore: 100000, moves: 10, tasks: [WordFallConfigs.MakeLength(4, 2)] }));
        var board = level.GetBoard();

        Plant(board, "АТОМ");
        SelectRow(board, 4);
        level.AcceptWord(dictionary);
        expectEq(level.GetTasks()[0].progress, 1);
        expect(!level.GetTasks()[0].done);

        Plant(board, "ЛУНА");
        SelectRow(board, 4);
        level.AcceptWord(dictionary);
        expect(level.GetTasks()[0].done);
    });

    test("PowerupTaskCountsEarnedPowerups", function()
    {
        var level = StartLevel(LevelConfig({ targetScore: 100000, moves: 10, tasks: [WordFallConfigs.MakePowerup("bomb", 1)] }));
        Plant(level.GetBoard(), "ЧАШКА");
        SelectRow(level.GetBoard(), 5);
        level.AcceptWord(dictionary);
        expect(level.GetTasks()[0].done);
    });

    test("ClearIceTaskCompletedByHammerWins", function()
    {
        var level = StartLevel(LevelConfig({ targetScore: 0, moves: 5, iceCells: [Cell(3, 3)], tasks: [WordFallConfigs.MakeClearIce()] }));
        expect(!level.GetTasks()[0].done);
        expectEq(level.GetState(), "playing");

        level.UseHammer(Cell(3, 3), dictionary);
        expect(level.GetTasks()[0].done);
        expectEq(level.GetState(), "won");
    });

    test("SeededWordCellsNeverGetIce", function()
    {
        var ice = [];
        for (var c = 0; c < boardConfig.columns; c++)
            for (var r = 0; r < boardConfig.rows; r++)
                ice.push(Cell(c, r));

        var level = StartLevel(LevelConfig({ targetScore: 100, moves: 5, iceCells: ice, tasks: [WordFallConfigs.MakeWord("РАКЕТА")] }));
        var board = level.GetBoard();

        expectEq(board.GetSeededCells().length, 6);
        board.GetSeededCells().forEach(function(cell) { expectEq(board.GetTile(cell).ice, 0); });
        expectEq(board.CountIce(), 50);
    });

    test("GeneratedCampaignIsValidAndDeterministic", function()
    {
        for (var index = 0; index < 100; index++)
        {
            var config = WordFallLevels.Generate(index, dictionary, boardConfig);
            expect(config.targetScore > 0);
            expect(config.moves >= 12 && config.moves <= 16);
            expect(config.tasks.length >= 3 && config.tasks.length <= 5);
            expectEq(config.boosterCharges[2], 30, "подсказок много — помощь в тупиках");

            // первое задание — точечное слово, слова заданий в словаре
            expectEq(config.tasks[0].taskType, "Word");
            config.tasks.forEach(function(task) {
                if (task.taskType == "Word")
                    expect(dictionary.Contains(task.word), task.word);
            });

            // «разбить весь лёд» ограничивает количество льда
            if (config.tasks.some(function(t) { return t.taskType == "ClearIce"; }))
                expect(config.iceCells.length <= 6);
        }

        expectEq(WordFallLevels.Generate(7, dictionary, boardConfig), WordFallLevels.Generate(7, dictionary, boardConfig),
                 "генерация детерминирована по индексу");
    });

    test("AnyWordsTaskCountsEveryWord", function()
    {
        var level = StartLevel(LevelConfig({ targetScore: 100000, moves: 10, tasks: [WordFallConfigs.MakeAnyWords(2)] }));
        var board = level.GetBoard();

        Plant(board, "КОТ");
        SelectRow(board, 3);
        level.AcceptWord(dictionary);
        expectEq(level.GetTasks()[0].progress, 1);

        Plant(board, "ДОМ");
        SelectRow(board, 3);
        level.AcceptWord(dictionary);
        expect(level.GetTasks()[0].done);
    });

    test("WordScoreTaskRequiresExpensiveWord", function()
    {
        var level = StartLevel(LevelConfig({ targetScore: 100000, moves: 10, tasks: [WordFallConfigs.MakeWordScore(20)] }));
        var board = level.GetBoard();

        // КОТ подряд = 12 < 20 — задача не двигается
        Plant(board, "КОТ");
        SelectRow(board, 3);
        level.AcceptWord(dictionary);
        expect(!level.GetTasks()[0].done);

        // ЧАШКА подряд: 14 × 1.5 × 5 = 105 >= 20
        Plant(board, "ЧАШКА");
        SelectRow(board, 5);
        level.AcceptWord(dictionary);
        expect(level.GetTasks()[0].done);
    });

    test("EnsureTasksAchievablePlantsMissingLetters", function()
    {
        var level = StartLevel(LevelConfig({ targetScore: 100000, moves: 10, tasks: [WordFallConfigs.MakeWord("ФЛОТ")] }));
        var board = level.GetBoard();

        // поле из одних Щ — слово задания несобираемо; перемешивание чинит поле
        FillBoardWithStubs(board);
        expect(!board.CanAssembleWord("ФЛОТ"));

        level.UseShuffle(dictionary);
        expect(board.CanAssembleWord("ФЛОТ"));
    });

    test("SeededWordIsScatteredButAssemblable", function()
    {
        var level = StartLevel(LevelConfig({ targetScore: 100, moves: 10, tasks: [WordFallConfigs.MakeWord("РАКЕТА")] }));
        var board = level.GetBoard();

        var seeded = board.GetSeededCells();
        assert(seeded.length == 6);
        expectEq(seeded.map(function(cell) { return board.GetTile(cell).letter; }).join(""), "РАКЕТА");
        expect(board.CanAssembleWord("РАКЕТА"));
    });

    test("SeededWordNeverLandsInAHole", function()
    {
        var holes = [];
        for (var c = 0; c < boardConfig.columns; c++)
            holes.push(Cell(c, 7), Cell(c, 6), Cell(c, 0));

        var level = StartLevel(LevelConfig({ targetScore: 100, moves: 10, holeCells: holes, tasks: [WordFallConfigs.MakeWord("РАКЕТА")] }));
        var board = level.GetBoard();

        expectEq(board.GetSeededCells().length, 6);
        board.GetSeededCells().forEach(function(cell) { expect(board.IsPlayable(cell), "буква слова в дыре"); });
        holes.forEach(function(cell) { expect(board.IsHole(cell), "дыра заполнилась"); });
    });

    test("PlayerProgressSavesAndLoads", function()
    {
        var path = "test_wordfall_progress.json";

        var progress = new PlayerProgress();
        progress.CompleteLevel(0, 123, 3);
        expectEq(progress.currentLevel, 1);
        expectEq(progress.GetBestScore(0), 123);
        expect(progress.Save(path));

        var loaded = new PlayerProgress();
        expect(loaded.Load(path));
        expectEq(loaded.currentLevel, 1);
        expectEq(loaded.GetBestScore(0), 123);

        // финал кампании возвращает на первый уровень
        loaded.CompleteLevel(2, 50, 3);
        expectEq(loaded.currentLevel, 0);

        o2.FileSystem.FileDelete(path);
    });
})();
