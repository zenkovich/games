include("Scripts/WordFall/Core/WordFallCore.js");

// Модель движения плиток при обвале: без наложений, каскад снизу вверх, спавны
// скрыты до входа в поле, повторный обвал без телепортов, мгновенное завершение
(function()
{
    var kColumns = 7;
    var kRows = 8;

    function Cell(c, r) { return { c: c, r: r }; }
    function Move(c, fromR, toR) { return { c: c, fromR: fromR, toR: toR }; }

    function MakeMotion()
    {
        var motion = new WordBoardMotion();
        motion.Configure(kColumns, kRows, 9.5, 0.05, 0.6);
        return motion;
    }

    function TileY(motion, c, r) { return r + motion.GetOffset(Cell(c, r)); }

    // В каждой колонке позиции по возрастанию с зазором не меньше клетки
    function ExpectNoOverlaps(motion)
    {
        for (var c = 0; c < kColumns; c++)
            for (var r = 1; r < kRows; r++)
                if (TileY(motion, c, r) - TileY(motion, c, r - 1) < 1 - 0.001)
                    return expect(false, "наложение: колонка " + c + ", ряд " + r);
        return true;
    }

    function SimulateAndCheck(motion, duration)
    {
        var step = 1/60;
        for (var t = 0; t < duration; t += step)
        {
            motion.Update(step);
            if (!ExpectNoOverlaps(motion))
                return;
        }
    }

    test("RowWordCollapseArrivesWithoutOverlaps", function()
    {
        // слово в ряду 2: колонки 1..3 теряют по плитке, сверху по спавну
        var moved = [], spawned = [];
        for (var c = 1; c <= 3; c++)
        {
            for (var r = 2; r < kRows - 1; r++)
                moved.push(Move(c, r + 1, r));
            spawned.push(Cell(c, kRows - 1));
        }

        var motion = MakeMotion();
        motion.StartCollapse(moved, spawned);
        expect(motion.IsAnimating());

        SimulateAndCheck(motion, 3);
        expect(!motion.IsAnimating());
        for (var c = 0; c < kColumns; c++)
            for (var r = 0; r < kRows; r++)
                expectEq(motion.GetOffset(Cell(c, r)), 0);
    });

    test("LowerTileStartsBeforeUpper", function()
    {
        var motion = MakeMotion();
        motion.StartCollapse([Move(2, 3, 2), Move(2, 4, 3), Move(2, 5, 4)], []);

        // один маленький шаг: нижняя уже сдвинулась, верхняя ещё ждёт каскад
        motion.Update(0.03);
        expect(motion.GetOffset(Cell(2, 2)) < 1);
        expectEq(motion.GetOffset(Cell(2, 4)), 1);
    });

    test("SpawnsHiddenAboveFieldThenAppear", function()
    {
        // колонка потеряла четыре нижних плитки — четыре спавна
        var moved = [], spawned = [];
        for (var r = 0; r < 4; r++)
            spawned.push(Cell(0, kRows - 4 + r));
        for (var r = 0; r < kRows - 4; r++)
            moved.push(Move(0, r + 4, r));

        var motion = MakeMotion();
        motion.StartCollapse(moved, spawned);
        spawned.forEach(function(cell) { expect(motion.IsHidden(cell), "спавн на старте скрыт"); });

        SimulateAndCheck(motion, 3.5);
        spawned.forEach(function(cell) {
            expect(!motion.IsHidden(cell));
            expectEq(motion.GetOffset(cell), 0);
        });
    });

    test("VerticalWordMakesLongFallsWithoutOverlaps", function()
    {
        // вертикальное слово: колонка 4 теряет ряды 2..5 — верхние падают на 4 клетки
        var motion = MakeMotion();
        motion.StartCollapse([Move(4, 6, 2), Move(4, 7, 3)], [Cell(4, 4), Cell(4, 5), Cell(4, 6), Cell(4, 7)]);
        SimulateAndCheck(motion, 3.5);
        expect(!motion.IsAnimating());
    });

    test("BombAreaCollapsesSeveralColumns", function()
    {
        // 3×3 вокруг (3, 3): колонки 2..4 теряют по три плитки
        var moved = [], spawned = [];
        for (var c = 2; c <= 4; c++)
        {
            for (var r = 2; r < kRows - 3; r++)
                moved.push(Move(c, r + 3, r));
            for (var i = 0; i < 3; i++)
                spawned.push(Cell(c, kRows - 3 + i));
        }

        var motion = MakeMotion();
        motion.StartCollapse(moved, spawned);
        SimulateAndCheck(motion, 3.5);
        expect(!motion.IsAnimating());
    });

    test("RestartDuringAnimationContinuesFromCurrentOffsets", function()
    {
        var motion = MakeMotion();
        motion.StartCollapse([Move(1, 5, 4), Move(1, 6, 5), Move(1, 7, 6)], [Cell(1, 7)]);
        motion.Update(0.02);

        var midOffset = motion.GetOffset(Cell(1, 4));
        expect(midOffset > 0);

        // молоток во время падения: колонка съезжает ещё на клетку, летевшая плитка продолжает путь
        motion.StartCollapse([Move(1, 4, 3), Move(1, 5, 4), Move(1, 6, 5), Move(1, 7, 6)], [Cell(1, 7)]);
        expectNear(motion.GetOffset(Cell(1, 3)), midOffset + 1, 0.001, "остаток пути + новая клетка");
        SimulateAndCheck(motion, 2.5);
        expect(!motion.IsAnimating());
    });

    test("FinishSnapsEverythingInPlace", function()
    {
        var motion = MakeMotion();
        motion.StartCollapse([Move(0, 7, 0)], [Cell(0, 7)]);
        motion.Update(0.05);

        motion.Finish();
        expect(!motion.IsAnimating());
        expectEq(motion.GetOffset(Cell(0, 0)), 0);
        expect(!motion.IsHidden(Cell(0, 7)));
    });
})();
