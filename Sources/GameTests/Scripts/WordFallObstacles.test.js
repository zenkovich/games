include("Scripts/WordFall/Core/WordFallCore.js");

// Препятствия и предметы уровня: дыры, ящики, цепи, снежки, конверты,
// предустановленные бонусы, смещение мешка и задачи на них
(function()
{
    var dictionary = WordDictionary.LoadDefault();
    var boardConfig = WordFallConfigs.DefaultBoardConfig();

    function Cell(c, r) { return { c: c, r: r }; }

    function Setup(fields)
    {
        var config = WordFallConfigs.DefaultLevelConfig();
        config.targetScore = 100000; // очки не мешают проверять задачи
        config.moves = 20;
        for (var key in fields)
            config[key] = fields[key];

        var level = new WordLevel();
        level.Start(config, boardConfig, dictionary, 7);
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

    function Has(list, c, r) { return WordFallCells.Contains(list, Cell(c, r)); }

    test("HolesAreNotPlayableAndColumnSpawnsBelowThem", function()
    {
        var level = Setup({ holeCells: [Cell(0, 7), Cell(0, 6), Cell(6, 0)] });
        var board = level.GetBoard();

        expect(board.IsHole(Cell(0, 7)));
        expect(!board.IsPlayable(Cell(0, 6)));
        expectEq(board.GetTile(Cell(0, 7)).letter, "");
        expect(!WordBoard.IsTileUsable(board.GetTile(Cell(0, 6))));
        expect(board.IsPlayable(Cell(0, 5)));
        expect(!board.IsPlayable(Cell(6, 0)));
        expect(WordBoard.IsTileUsable(board.GetTile(Cell(6, 1))));

        // снос в колонке с дырами сверху: спавн приходит в верхнюю играбельную клетку
        var result = board.RemoveTile(Cell(0, 2));
        expect(Has(result.spawned, 0, 5));
        expect(!Has(result.spawned, 0, 7));
        expectEq(board.GetTile(Cell(0, 7)).letter, "");
        expect(board.GetTile(Cell(0, 5)).letter.length > 0);

        // у колонки с дырой внизу плитка не проваливается в дыру
        board.RemoveTile(Cell(6, 1));
        expectEq(board.GetTile(Cell(6, 0)).letter, "");
        expect(board.GetTile(Cell(6, 1)).letter.length > 0);
    });

    test("CratesFallAndBreakByAdjacentWords", function()
    {
        var level = Setup({ crateCells: [Cell(2, 3)], crateGrades: [2], tasks: [WordFallConfigs.MakeCrates()] });
        var board = level.GetBoard();
        FillBoardWithStubs(board);

        expectEq(board.GetTile(Cell(2, 3)).crate, 2);
        expect(!WordBoard.IsTileUsable(board.GetTile(Cell(2, 3))));

        // слово под ящиком: прочность падает, ящик опускается в освободившуюся клетку
        var first = AcceptRow(level, "КОТ", 2, 1);
        assert(first.ok);
        expect(Has(first.crateHit, 2, 3));
        expectEq(first.crateBroken.length, 0);
        expectEq(board.GetTile(Cell(2, 2)).crate, 1, "ящик упал на клетку ниже");
        expectEq(board.CountCrates(), 1);
        expect(!level.GetTasks()[0].done);

        // второе слово рядом: ящик ломается, задача закрыта
        var second = AcceptRow(level, "ТОК", 1, 1);
        assert(second.ok);
        expect(Has(second.crateBroken, 2, 2));
        expectEq(board.CountCrates(), 0);
        expect(level.GetTasks()[0].done);
    });

    test("ChainedTileStaysInPlaceUntilUsedInWord", function()
    {
        var level = Setup({ chainCells: [Cell(1, 4)] });
        var board = level.GetBoard();
        FillBoardWithStubs(board);
        board.DebugSetTile(Cell(1, 4), "О");
        board.DebugSetTile(Cell(1, 3), "Ж");

        expect(board.GetTile(Cell(1, 4)).chained);
        expect(WordBoard.IsTileUsable(board.GetTile(Cell(1, 4))), "цепь не мешает собирать слово");

        // снос под цепью: цепная буква стоит, плитка между ними падает, клетка под цепью пустеет
        var removed = board.RemoveTile(Cell(1, 2));
        expectEq(board.GetTile(Cell(1, 4)).letter, "О");
        expectEq(board.GetTile(Cell(1, 2)).letter, "Ж");
        expectEq(board.GetTile(Cell(1, 3)).letter, "");
        expect(!Has(removed.spawned, 1, 3));

        // цепная буква в слове: цепь снимается вместе с буквой, колонка снова течёт
        board.DebugSetTile(Cell(0, 4), "К");
        board.DebugSetTile(Cell(2, 4), "Т");
        board.ClearSelection();
        board.ToggleSelect(Cell(0, 4));
        board.ToggleSelect(Cell(1, 4));
        board.ToggleSelect(Cell(2, 4));
        var result = level.AcceptWord(dictionary);
        assert(result.ok);
        expect(!board.GetTile(Cell(1, 4)).chained);
        expect(board.GetTile(Cell(1, 3)).letter.length > 0, "пустота под цепью заполнилась");
    });

    test("SnowballsSpawnEachMoveAndMeltNextToWords", function()
    {
        var level = Setup({ snowCells: [Cell(3, 7)], snowPerMove: 1, tasks: [WordFallConfigs.MakeMelt(2)] });
        var board = level.GetBoard();
        FillBoardWithStubs(board);

        expect(board.GetTile(Cell(3, 7)).snow);
        expect(!WordBoard.IsTileUsable(board.GetTile(Cell(3, 7))));
        expectEq(board.CountSnow(), 1);

        var far = AcceptRow(level, "КОТ", 0, 0);
        assert(far.ok);
        expectEq(far.snowMelted.length, 0);
        expectEq(board.CountSnow(), 2, "за ход сверху упал ещё один снежок");
        expectEq(level.GetTasks()[0].progress, 0);

        var near = AcceptRow(level, "ТОК", 6, 2);
        assert(near.ok);
        expect(Has(near.snowMelted, 3, 7));
        expectEq(level.GetTasks()[0].progress, near.snowMelted.length); // новый снежок мог упасть рядом и растаять тоже
    });

    test("ParcelsFallAndDeliverAtTheBottom", function()
    {
        var level = Setup({ parcelCells: [Cell(0, 7)], parcelTotal: 2, parcelOnScreen: 1, tasks: [WordFallConfigs.MakeDeliver(2)] });
        var board = level.GetBoard();
        FillBoardWithStubs(board);

        expect(board.GetTile(Cell(0, 7)).parcel);
        expect(!WordBoard.IsTileUsable(board.GetTile(Cell(0, 7))));
        expectEq(board.CountParcels(), 1);

        // конверт спускается вместе с колонкой; на дне — доставлен, колонка дозаполняется
        for (var i = 0; i < 6; i++)
            board.RemoveTile(Cell(0, 0));
        expect(board.GetTile(Cell(0, 1)).parcel);

        board.ClearSelection();
        var result = AcceptRow(level, "КОТ", 0, 0);
        assert(result.ok);
        expect(Has(result.delivered, 0, 0));
        expect(!board.GetTile(Cell(0, 0)).parcel);
        expect(board.GetTile(Cell(0, 0)).letter.length > 0);
        expectEq(level.GetTasks()[0].progress, 1);
        expectEq(board.CountParcels(), 0);
        expect(!level.GetTasks()[0].done);

        // следующий ход: место освободилось — второй конверт выходит сверху
        var next = AcceptRow(level, "ТОК", 0, 3);
        assert(next.ok);
        expectEq(board.CountParcels(), 1, "второй конверт вышел сверху после доставки первого");
    });

    test("LetterTaskCountsLettersUsedInWords", function()
    {
        var level = Setup({ tasks: [WordFallConfigs.MakeLetter("О", 3)] });
        FillBoardWithStubs(level.GetBoard());

        AcceptRow(level, "КОТ", 0, 0);
        expectEq(level.GetTasks()[0].progress, 1);
        AcceptRow(level, "ОКНО", 1, 0);
        expectEq(level.GetTasks()[0].progress, 3);
        expect(level.GetTasks()[0].done);
    });

    test("PreplacedPowerupsAndBagBias", function()
    {
        var level = Setup({ powerupCells: [Cell(2, 2), Cell(4, 5)], powerupKinds: ["bomb", "rocket"], extraVowels: 12, extraRare: 4 });
        var board = level.GetBoard();

        expectEq(board.GetTile(Cell(2, 2)).powerup, "bomb");
        expectEq(board.GetTile(Cell(4, 5)).powerup, "rocket");

        var total = 0;
        board.GetConfig().letters.forEach(function(def) { total += def.bagCount; });
        expectEq(total, 100 + 12 + 4);
        expectEq(boardConfig.letters.reduce(function(sum, def) { return sum + def.bagCount; }, 0), 100, "мешок поля не меняется");
    });

    test("BombBreaksCratesAndMeltsSnowButSparesParcels", function()
    {
        var level = Setup({ crateCells: [Cell(3, 3)], crateGrades: [1], snowCells: [Cell(2, 3)], parcelCells: [Cell(4, 3)], parcelTotal: 1 });
        var board = level.GetBoard();
        FillBoardWithStubs(board);

        board.DebugSetPowerup(Cell(3, 2), "bomb");
        var result = AcceptRow(level, "КОТ", 1, 2); // буква под бомбой активирует её
        assert(result.ok);
        expectEq(board.GetTile(Cell(3, 3)).crate, 0);
        expect(Has(result.crateBroken, 3, 3));
        expect(Has(result.snowMelted, 2, 3));
        expectEq(board.CountParcels(), 1, "конверт бомбой не уничтожается");
    });

    // Конфиг уровня читается в формате campaign.json: клетки {x, y}, умолчания опущены
    test("LevelConfigReadsCampaignFormat", function()
    {
        var config = WordFallConfigs.NormalizeLevel({
            targetScore: 420, moves: 14,
            holeCells: [{ x: 0, y: 7 }], crateCells: [{ x: 2, y: 3 }], crateGrades: [2], chainCells: [{ x: 1, y: 4 }],
            snowCells: [{ x: 3, y: 7 }], snowPerMove: 1, parcelCells: [{ x: 0, y: 6 }], parcelTotal: 3, parcelOnScreen: 2,
            powerupCells: [{ x: 5, y: 5 }], powerupKinds: ["rocket"], extraVowels: 6,
            tasks: [{ word: "КОТ" }, { taskType: "Letter", letter: "О", count: 4 }, { taskType: "Deliver", count: 3 },
                    { taskType: "Melt", count: 2 }, { taskType: "Crates" }]
        });

        expectEq(config.targetScore, 420);
        expectEq(config.holeCells, [Cell(0, 7)]);
        expectEq(config.chainCells, [Cell(1, 4)]);
        expectEq(config.powerupKinds, ["rocket"]);
        expectEq(config.boosterCharges, [3, 3, 3, 3, 3], "умолчание зарядов");
        expectEq(config.iceCells, []);
        expectEq(config.tasks[0], WordFallConfigs.MakeWord("КОТ"), "тип задачи по умолчанию — слово");
        expectEq(config.tasks[1], WordFallConfigs.MakeLetter("О", 4));
        expectEq(config.tasks[4], WordFallConfigs.MakeCrates());
    });
})();
