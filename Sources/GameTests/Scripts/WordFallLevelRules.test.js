include("Scripts/WordFall/Core/WordFallCore.js");

// Правила уровня: слово один раз за уровень, подсказка по целям, ракеты по целям,
// падающие ящики, память туториалов
(function()
{
    var dictionary = WordDictionary.LoadDefault();
    var boardConfig = WordFallConfigs.DefaultBoardConfig();

    function Cell(c, r) { return { c: c, r: r }; }

    function Setup(fields)
    {
        var config = WordFallConfigs.DefaultLevelConfig();
        config.targetScore = 100000;
        config.moves = 20;
        config.boosterCharges = [3, 3, 30, 3, 3];
        for (var key in fields)
            config[key] = fields[key];

        var level = new WordLevel();
        level.Start(config, boardConfig, dictionary, 5);
        return level;
    }

    function FillBoardWithStubs(board)
    {
        for (var c = 0; c < boardConfig.columns; c++)
            for (var r = 0; r < boardConfig.rows; r++)
                if (board.IsPlayable(Cell(c, r)) && WordBoard.IsTileUsable(board.GetTile(Cell(c, r))))
                    board.DebugSetTile(Cell(c, r), "Щ");
    }

    function Plant(board, word, row, startColumn)
    {
        for (var i = 0; i < word.length; i++)
            board.DebugSetTile(Cell(startColumn + i, row), word[i]);
    }

    function AcceptRow(level, word, row, startColumn)
    {
        var board = level.GetBoard();
        Plant(board, word, row, startColumn);
        board.ClearSelection();
        for (var i = 0; i < word.length; i++)
            board.ToggleSelect(Cell(startColumn + i, row));
        return level.AcceptWord(dictionary);
    }

    test("SameWordIsAcceptedOnlyOncePerLevel", function()
    {
        var level = Setup({});
        FillBoardWithStubs(level.GetBoard());

        assert(AcceptRow(level, "КОТ", 0, 0).ok);
        var moves = level.GetMovesLeft();
        var again = AcceptRow(level, "КОТ", 1, 0);
        expect(!again.ok);
        expectEq(again.reason, "duplicate");
        expectEq(level.GetMovesLeft(), moves, "отказ не тратит ход");
        expect(level.IsWordUsed("КОТ"));
        expect(AcceptRow(level, "ТОК", 2, 0).ok, "другое слово из тех же букв — можно");

        // новый уровень — история чистая
        level = Setup({});
        FillBoardWithStubs(level.GetBoard());
        expect(AcceptRow(level, "КОТ", 0, 0).ok);
    });

    test("HintPrefersTaskWordOverExpensiveWord", function()
    {
        var level = Setup({ tasks: [WordFallConfigs.MakeWord("ТАПКА")] });
        var board = level.GetBoard();
        FillBoardWithStubs(board);
        Plant(board, "ТАПКА", 0, 0);
        Plant(board, "ФАКТ", 3, 0); // дороже, но не по заданию

        assert(level.UseHint(dictionary));
        expectEq(board.GetCurrentWord(), "ТАПКА");
    });

    test("HintPrefersLengthTaskAndSkipsUsedWords", function()
    {
        var level = Setup({ tasks: [WordFallConfigs.MakeLength(4, 1)] });
        var board = level.GetBoard();
        FillBoardWithStubs(board);
        Plant(board, "КОТ", 0, 0);
        Plant(board, "ОКНО", 2, 0);

        assert(level.UseHint(dictionary));
        expectEq(board.GetCurrentWord().length, 4, "задание на 4 буквы — подсказка ведёт к нему");

        // использованное слово подсказка больше не предлагает
        board.ClearSelection();
        assert(AcceptRow(level, "ОКНО", 2, 0).ok);
        FillBoardWithStubs(board);
        Plant(board, "ОКНО", 2, 0);
        Plant(board, "КОТ", 0, 0);
        assert(level.UseHint(dictionary));
        expect(board.GetCurrentWord() != "ОКНО");
    });

    test("HintAvoidsOverlongWords", function()
    {
        var level = Setup({});
        var board = level.GetBoard();
        FillBoardWithStubs(board);
        Plant(board, "КОРАБЛЬ", 0, 0);
        Plant(board, "ЛУНА", 3, 0);

        assert(level.UseHint(dictionary));
        expect(board.GetCurrentWord().length <= 6, "подсказка не тянет самые длинные слова");
    });

    test("RocketsAimAtLevelGoalsAndNeverRepeatATarget", function()
    {
        var level = Setup({ iceCells: [Cell(5, 6), Cell(6, 6)], tasks: [WordFallConfigs.MakeClearIce()] });
        var board = level.GetBoard();
        FillBoardWithStubs(board);

        board.DebugSetPowerup(Cell(3, 3), "rocket");
        var result = AcceptRow(level, "КОТ", 2, 2); // буква под бонусом активирует ракету
        assert(result.ok);
        assert(result.powerupsUsed.length == 1 && result.powerupsUsed[0].targets.length == 1);
        var target = result.powerupsUsed[0].targets[0];
        expect(WordFallCells.Equal(target, Cell(5, 6)) || WordFallCells.Equal(target, Cell(6, 6)), "цель уровня — лёд, ракета летит в него");

        // залп фейерверка: десять целей, все разные
        FillBoardWithStubs(board);
        board.DebugSetPowerup(Cell(3, 5), "fireworks");
        var salvo = AcceptRow(level, "ТОК", 4, 2);
        assert(salvo.ok);
        assert(salvo.powerupsUsed.length == 1);
        var targets = salvo.powerupsUsed[0].targets;
        expect(targets.length >= 8);
        for (var i = 0; i < targets.length; i++)
            for (var j = i + 1; j < targets.length; j++)
                expect(!WordFallCells.Equal(targets[i], targets[j]), "две ракеты в одну плитку");
    });

    test("RocketsKeepTaskWordLettersAndTaskLetter", function()
    {
        var level = Setup({ tasks: [WordFallConfigs.MakeWord("ЛУНА"), WordFallConfigs.MakeLetter("О", 3)] });
        var board = level.GetBoard();
        FillBoardWithStubs(board);
        // засеянное слово задания и буквы задания — не цели; остальное поле — дешёвые заглушки
        var seeded = WordFallCells.Copy(board.GetSeededCells());
        assert(seeded.length == 4);
        board.DebugSetTile(Cell(6, 7), "О");

        board.DebugSetPowerup(Cell(3, 3), "rocket");
        var result = AcceptRow(level, "КОТ", 2, 2);
        assert(result.ok);
        assert(result.powerupsUsed.length == 1);
        var target = result.powerupsUsed[0].targets[0];
        expect(!WordFallCells.Contains(seeded, target), "ракета выбила букву слова-задания");
        expect(!WordFallCells.Equal(target, Cell(6, 7)), "ракета выбила букву задания");
    });

    test("CratesFallWithGravity", function()
    {
        var level = Setup({ crateCells: [Cell(2, 3)], crateGrades: [2] });
        var board = level.GetBoard();
        FillBoardWithStubs(board);
        board.DebugSetTile(Cell(2, 4), "Ж");

        board.RemoveTile(Cell(2, 1));
        expectEq(board.GetTile(Cell(2, 2)).crate, 2, "ящик опустился на клетку");
        expectEq(board.GetTile(Cell(2, 3)).letter, "Ж", "буква над ящиком упала следом");
        expect(board.GetTile(Cell(2, 7)).letter.length > 0, "колонка дозаполнилась сверху");
    });

    test("ProgressRemembersSeenTutorials", function()
    {
        var path = "wordfall_test_tutorials.json";
        var progress = new PlayerProgress();
        expect(!progress.IsTutorialSeen("basics"));
        progress.MarkTutorialSeen("basics");
        progress.MarkTutorialSeen("basics");
        expect(progress.IsTutorialSeen("basics"));
        expectEq(progress.seenTutorials.length, 1);
        assert(progress.Save(path));

        var loaded = new PlayerProgress();
        assert(loaded.Load(path));
        expect(loaded.IsTutorialSeen("basics"));
        expect(!loaded.IsTutorialSeen("crate"));
        o2.FileSystem.FileDelete(path);
    });

    test("LongWordEarnsFireworksAndItFiresASalvo", function()
    {
        var level = Setup({});
        var board = level.GetBoard();
        FillBoardWithStubs(board);

        // слово из 7 букв кладёт фейерверк в клетку последней буквы
        var earned = AcceptRow(level, "КАРТИНА", 0, 0);
        assert(earned.ok, "слово 7 букв принято");
        expectEq(earned.powerupEarned, "fireworks");
        expectEq(board.GetTile(Cell(6, 0)).powerup, "fireworks");
        expect(WordBoard.IsTileOccupied(board.GetTile(Cell(6, 0))), "бонус на месте после обвала");

        // слово рядом активирует его: залп по многим клеткам
        FillBoardWithStubs(board);
        var salvo = AcceptRow(level, "КОТ", 1, 4);
        assert(salvo.ok);
        assert(salvo.powerupsUsed.length == 1);
        expectEq(salvo.powerupsUsed[0].kind, "fireworks");
        expect(salvo.powerupsUsed[0].targets.length >= 8, "залп фейерверка бьёт по многим клеткам");
    });

    test("EarnedBonusNeverLandsInAHole", function()
    {
        var level = Setup({ holeCells: [Cell(6, 0), Cell(5, 0)] });
        var board = level.GetBoard();
        FillBoardWithStubs(board);

        var result = AcceptRow(level, "КАРТИНА", 0, 0);
        assert(result.ok);
        expectEq(result.powerupEarned, "fireworks");

        var bonusCell = null;
        for (var c = 0; c < boardConfig.columns; c++)
            for (var r = 0; r < boardConfig.rows; r++)
                if (board.GetTile(Cell(c, r)).powerup)
                    bonusCell = Cell(c, r);

        assert(bonusCell, "бонус пропал");
        expect(board.IsPlayable(bonusCell));
        expectEq(board.GetTile(bonusCell).powerup, "fireworks");
    });

    test("BombBreaksCratesCompletely", function()
    {
        var level = Setup({ crateCells: [Cell(3, 3), Cell(4, 3)], crateGrades: [2, 1], tasks: [WordFallConfigs.MakeCrates()] });
        var board = level.GetBoard();
        FillBoardWithStubs(board);

        board.DebugSetPowerup(Cell(3, 2), "bomb");
        var result = AcceptRow(level, "КОТ", 1, 2);
        assert(result.ok);
        expect(WordFallCells.Contains(result.crateBroken, Cell(3, 3)), "бомба ломает ящик прочности 2 сразу");
        expect(WordFallCells.Contains(result.crateBroken, Cell(4, 3)));
        expectEq(board.CountCrates(), 0);
        expect(level.GetTasks()[0].done);
    });
})();
