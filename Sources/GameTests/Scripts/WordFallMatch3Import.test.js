include("Scripts/WordFall/WordFallGameService.js");

// Импорт поля из уровней «три в ряд»: форма поля и препятствия Gardenscapes/Homescapes ложатся
// на уровень Word Fall, большее поле обрезается окном 7×8, слова и задачи остаются
(function()
{
    // Gardenscapes: ряды сверху вниз, <Cell /> — дыра
    function GardenscapesLevel(rows)
    {
        var xml = '<?xml version="1.0"?>\n<root>\n\t<Level format_version="20230303">\n\t\t<ChipSet><chip number="0" probability="100" /></ChipSet>\n';
        rows.forEach(function(row) {
            xml += "\t\t<Line>\n";
            for (var i = 0; i < row.length; i++)
            {
                var ch = row[i];
                var attrs = ch == " " ? "" : ' exists="true"' + ({
                    B: ' box="BOX_EMPTY" box_level="2"', b: ' box="BOX_WITH_CHIP" box_level="5"', L: ' locks="1"',
                    S: ' stone="STONE_EMPTY"', G: ' ground="GROUND_EMPTY" ground_level="1"' }[ch] || "");
                xml += ch == "C" ? '\t\t\t<Cell exists="true">\n\t\t\t\t<ChipModel type="Cargo" level="1" />\n\t\t\t</Cell>\n'
                                 : "\t\t\t<Cell" + attrs + " />\n";
            }
            xml += "\t\t</Line>\n";
        });
        return xml + "\t</Level>\n</root>\n";
    }

    // Homescapes: <Line> — колонка, y растёт вверх, препятствия — вложенные Model
    function HomescapesLevel(columns, moves)
    {
        var xml = '<?xml version="1.0"?>\n<root>\n\t<Level format_version="20181213" movesLimitLocal="' + moves + '" LevelLocalSeed="0">\n';
        columns.forEach(function(column, x) {
            xml += "\t\t<Line>\n";
            for (var y = 0; y < column.length; y++)
            {
                var ch = column[y];
                if (ch == " ")
                    continue;
                var model = { B: '<Model modelId="BOX" level="3" />', L: '<Model modelId="LOCK" level="1" />',
                              I: '<Model modelId="ICE" level="2" />', S: '<Model modelId="STATUE" level="1" />',
                              R: '<Model modelId="LINE" exploidType="5" line_orient="0" />', M: '<Model modelId="BOMB" exploidType="2" />',
                              N: '<Model modelId="BORN" isLooped="1" />' }[ch];
                xml += '\t\t\t<Cell x="' + (100 + x) + '" y="' + (100 + y) + '"' + (model ? ">" + model + "</Cell>\n" : " />\n");
            }
            xml += "\t\t</Line>\n";
        });
        return xml + "\t</Level>\n</root>\n";
    }

    function Has(list, c, r) { return WordFallCells.Contains(list, { c: c, r: r }); }

    test("GardenscapesFieldShapeAndObstacles", function()
    {
        var xml = GardenscapesLevel([
            "  ...  ",
            " .BBL. ",
            ".......",
            ".SGGG.C",
            ".......",
            ".......",
            ".......",
            ".b....."
        ]);
        expect(WordFallMatch3Import.LooksLikeMatch3(xml));
        var parsed = WordFallMatch3Import.Parse(xml);
        expect(parsed.ok);
        expectEq(parsed.format, "Gardenscapes");
        expectEq([parsed.width, parsed.height], [7, 8]);

        var base = WordFallConfigs.NormalizeLevel({ words: ["КОТ"], moves: 9, tasks: [{ taskType: "Crates" }] });
        var result = WordFallMatch3Import.ToLevel(parsed, base, 7, 8);
        var level = result.config;
        expectEq(result.dropped, 0);
        expect(Has(level.holeCells, 0, 7) && Has(level.holeCells, 1, 7) && Has(level.holeCells, 6, 7), "дыры верхнего ряда");
        expect(Has(level.holeCells, 0, 6) && !Has(level.holeCells, 1, 6));
        expectEq(level.holeCells.length, 6);
        expect(Has(level.crateCells, 2, 6) && Has(level.crateCells, 3, 6), "ящики второго ряда");
        expectEq(level.crateGrades[level.crateCells.findIndex(function(c) { return c.c == 1 && c.r == 0; })], 3, "прочность ограничена 3");
        expect(Has(level.chainCells, 4, 6), "замок — цепь");
        expect(Has(level.stoneCells, 1, 4), "камень");
        expect(Has(level.iceCells, 2, 4) && Has(level.iceCells, 4, 4), "земля — лёд");
        expectEq(level.words, ["КОТ"], "слова уровня остаются");
        expectEq(level.moves, 9, "ходов в файле нет — остаются свои");
        expectEq(level.tasks.length, 1);
    });

    test("HomescapesColumnsGrowUpAndMovesComeAlong", function()
    {
        // колонка снизу вверх: y = 100 — нижний ряд
        var columns = [
            "IIIIII  ",
            "..B...N ",
            "..L.R..N",
            "..S..M.N",
            "........",
            "........",
            "..I....."
        ];
        var result = WordFallMatch3Import.Import(HomescapesLevel(columns, 21), null, 7, 8);
        expect(result.ok, result.message);
        var level = result.config;
        expectEq(level.moves, 21);
        expect(Has(level.holeCells, 0, 7) && Has(level.holeCells, 0, 6), "верх первой колонки пустой");
        expect(Has(level.iceCells, 0, 0) && Has(level.iceCells, 6, 2), "лёд снизу");
        expect(Has(level.crateCells, 1, 2) && Has(level.chainCells, 2, 2) && Has(level.stoneCells, 3, 2));
        expectEq(level.crateGrades, [3]);
        expectEq(level.powerupKinds.sort(), ["bomb", "rocket"]);
        expect(result.message.indexOf("Homescapes") >= 0 && result.message.indexOf("ходов 21") >= 0, result.message);
    });

    test("LargeFieldIsCroppedToTheDensestWindow", function()
    {
        var rows = [];
        for (var r = 0; r < 9; r++)
            rows.push(r == 0 ? "         " : "  .......");
        var result = WordFallMatch3Import.ToLevel(WordFallMatch3Import.Parse(GardenscapesLevel(rows)), null, 7, 8);
        expectEq(result.dropped, 0, "окно накрыло все клетки");
        expectEq(result.config.holeCells.length, 0);

        var wide = [];
        for (var r = 0; r < 9; r++)
            wide.push("...........");
        var cropped = WordFallMatch3Import.ToLevel(WordFallMatch3Import.Parse(GardenscapesLevel(wide)), null, 7, 8);
        expectEq(cropped.dropped, 99 - 56);
        expect(cropped.message.indexOf("за краем осталось 43") >= 0, cropped.message);
    });

    test("SmallFieldIsCentred", function()
    {
        var result = WordFallMatch3Import.ToLevel(WordFallMatch3Import.Parse(GardenscapesLevel(["...", "...", "..."])), null, 7, 8);
        expectEq(56 - result.config.holeCells.length, 9);
        expect(!Has(result.config.holeCells, 2, 4) && !Has(result.config.holeCells, 4, 3) && Has(result.config.holeCells, 1, 4) && Has(result.config.holeCells, 3, 2), "поле по центру");
    });

    test("NotAMatch3FileIsRejected", function()
    {
        expect(!WordFallMatch3Import.LooksLikeMatch3("{\"moves\": 3}"));
        expectEq(WordFallMatch3Import.Import("<root><Level></Level></root>", null, 7, 8).ok, false);
        expectEq(WordFallMatch3Import.Import("<root><Level><Line></Line></Level></root>", null, 7, 8).ok, false, "поле без клеток");
    });

    test("ServiceImportsAMatch3FileIntoTheCurrentLevel", function()
    {
        var service = new WordFallGameService();
        service.randomSeed = 42;
        service.campaignPath = "";
        service.campaignLength = 3;
        service.progressPath = "wordfall_test_m3_progress.json";
        service.editedLevelsPath = "wordfall_test_m3_levels.json";
        o2.FileSystem.FileDelete(service.progressPath);
        o2.FileSystem.FileDelete(service.editedLevelsPath);

        var words = service.GetLevelConfig(1).words;
        var result = service.ImportJson(GardenscapesLevel([".B.", "...", "L.."]), 1);
        expect(result.ok, result.message);
        expect(service.IsLevelEdited(1));
        var level = service.GetLevelConfig(1);
        expectEq(level.holeCells.length, 56 - 9);
        expectEq(level.crateCells.length, 1);
        expectEq(level.words, words, "слова уровня не тронуты");
        o2.FileSystem.FileDelete(service.progressPath);
        o2.FileSystem.FileDelete(service.editedLevelsPath);
    });
})();
