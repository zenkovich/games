include("Scripts/WordFall/WordFallGameService.js");

// Слова уровня — отдельный список, не задачи: несколько слов, прогресс по найденным, победа
// только при всех словах; агент подбирает слова по сложности/числу/длине и считает цель
(function()
{
    var dictionary = WordDictionary.LoadDefault();
    var boardConfig = WordFallConfigs.DefaultBoardConfig();

    function Start(fields, seed)
    {
        var config = WordFallConfigs.DefaultLevelConfig();
        for (var key in fields)
            config[key] = fields[key];
        var level = new WordLevel();
        level.Start(config, boardConfig, dictionary, seed || 7);
        return level;
    }

    function Plant(board, word, row)
    {
        for (var i = 0; i < word.length; i++)
            board.DebugSetTile({ c: i, r: row }, word[i]);
    }

    function Spell(level, word)
    {
        var board = level.GetBoard();
        Plant(board, word, 3);
        board.ClearSelection();
        for (var i = 0; i < word.length; i++)
            board.ToggleSelect({ c: i, r: 3 });
        return level.AcceptWord(dictionary);
    }

    test("SeveralWordsAreFoundInAnyOrder", function()
    {
        var level = Start({ words: ["КОТ", "ДОМ", "ЛУНА"], targetScore: 10, moves: 10 });
        expectEq(level.GetWords().length, 3);
        expectEq(level.GetTasks().length, 0, "слова — не задачи");
        expectEq(level.NextWord(), "КОТ");

        var result = Spell(level, "ДОМ");
        expectEq(result.wordFound, "ДОМ");
        expectEq(level.GetWords().map(function(w) { return w.found; }), [false, true, false]);
        expectEq(level.GetState(), "playing", "не все слова найдены");

        Spell(level, "КОТ");
        expectEq(level.NextWord(), "ЛУНА");
        Spell(level, "ЛУНА");
        expectEq(level.GetState(), "won", "все слова, задач нет, очков хватает");
    });

    test("WordsAndTasksBothGateTheWin", function()
    {
        var level = Start({ words: ["КОТ"], tasks: [WordFallConfigs.MakeAnyWords(2)], targetScore: 10, moves: 10 });
        Spell(level, "КОТ");
        expectEq(level.GetState(), "playing", "задача ещё не закрыта");
        Spell(level, "ДОМ");
        expectEq(level.GetState(), "won");
    });

    test("FirstWordIsSeededAndNextWordStaysAssemblable", function()
    {
        for (var seed = 1; seed <= 6; seed++)
        {
            var level = Start({ words: ["ЧАШКА", "ФЛОТ"] }, seed);
            var board = level.GetBoard();
            expectEq(board.GetSeededCells().length, 5, "сид " + seed + ": первое слово посеяно");
            expect(board.CanAssembleWord("ЧАШКА"), "сид " + seed);
        }
    });

    test("HintLeadsToTheNextWord", function()
    {
        var level = Start({ words: ["ТАПКА", "КОТ"], moves: 10, boosterCharges: [3, 3, 3, 3, 3] });
        expect(level.UseHint(dictionary));
        expectEq(level.GetBoard().GetCurrentWord(), "ТАПКА");
    });

    test("LegacyWordTasksBecomeWords", function()
    {
        var level = Start({ tasks: [WordFallConfigs.MakeWord("кот"), WordFallConfigs.MakeLetter("О", 2)] });
        expectEq(level.GetWords(), [{ word: "КОТ", found: false }]);
        expectEq(level.GetTasks().length, 1);
        expectEq(level.GetTasks()[0].config.taskType, "Letter");
    });

    test("AgentPicksWordsByCountLengthAndDifficulty", function()
    {
        var config = WordFallConfigs.NormalizeLevel({ id: "L050", difficulty: 5, wordsAuto: 4, wordMinLength: 4, wordMaxLength: 7 });
        var words = WordFallWordAgent.PickWords(config, dictionary, boardConfig, []);
        expectEq(words.length, 4);
        expectEq(words.map(function(w) { return w.length; }), [4, 5, 6, 7], "длины от коротких к длинным");
        words.forEach(function(word) { expect(dictionary.Contains(word), word); });
        expectEq(new Set(words).size, 4, "без повторов");
        expectEq(WordFallWordAgent.PickWords(config, dictionary, boardConfig, []), words, "детерминирован по уровню");

        var other = WordFallConfigs.NormalizeLevel({ id: "L051", difficulty: 5, wordsAuto: 4, wordMinLength: 4, wordMaxLength: 7 });
        expect(JSON.stringify(WordFallWordAgent.PickWords(other, dictionary, boardConfig, [])) != JSON.stringify(words), "соседний уровень — другие слова");

        var excluded = WordFallWordAgent.PickWords(config, dictionary, boardConfig, [words[0]]);
        expect(excluded.indexOf(words[0]) < 0, "заданные вручную слова не повторяются");
    });

    test("AgentDifficultyShapesWords", function()
    {
        var average = function(difficulty) {
            var sum = 0, count = 0;
            for (var i = 0; i < 12; i++)
            {
                var config = WordFallConfigs.NormalizeLevel({ id: "D" + i, difficulty: difficulty, wordsAuto: 3 });
                WordFallWordAgent.PickWords(config, dictionary, boardConfig, []).forEach(function(word) {
                    sum += WordFallWordAgent.WordDifficulty(word, boardConfig);
                    count++;
                });
            }
            return sum/count;
        };
        var easy = average(1), hard = average(10);
        expect(hard > easy + 0.25, "сложные уровни — слова сложнее: " + easy.toFixed(2) + " → " + hard.toFixed(2));

        var easyRange = WordFallWordAgent.LengthRange({ difficulty: 1, wordMinLength: 0, wordMaxLength: 0 });
        var hardRange = WordFallWordAgent.LengthRange({ difficulty: 10, wordMinLength: 0, wordMaxLength: 0 });
        expect(easyRange.max < hardRange.min + 1 && easyRange.min < hardRange.min, "длины по сложности растут");
        expectEq(WordFallWordAgent.LengthRange({ difficulty: 1, wordMinLength: 6, wordMaxLength: 4 }), { min: 6, max: 6 }, "заданная длина важнее, min ≤ max");
    });

    test("AgentTargetGrowsWithDifficultyMovesAndWords", function()
    {
        var target = function(fields, words) {
            return WordFallWordAgent.TargetScore(WordFallConfigs.NormalizeLevel(fields), words, boardConfig);
        };
        var base = target({ difficulty: 3, moves: 12 }, ["КОТ"]);
        expect(target({ difficulty: 8, moves: 12 }, ["КОТ"]) > base, "сложнее — выше цель");
        expect(target({ difficulty: 3, moves: 16 }, ["КОТ"]) > base, "больше ходов — выше цель");
        expect(target({ difficulty: 3, moves: 12 }, ["КОТ", "ПАЛУБА"]) > base, "длинное слово добавляет");
        expectEq(base % 10, 0, "цель кратна 10");

        // калибровка по кампании: ~15 очков за ход на старте, ~40 на поздних уровнях
        expectNear(target({ difficulty: 1, moves: 10 }, [])/10, 14, 1);
        expectNear(target({ difficulty: 10, moves: 10 }, [])/10, 41, 1);
    });

    test("AutoWordsAndTargetResolveOnStart", function()
    {
        var level = Start({ id: "L077", words: ["КОТ"], wordsAuto: 2, difficulty: 4, autoTarget: true, moves: 11 });
        var words = level.GetWords().map(function(w) { return w.word; });
        expectEq(words.length, 3);
        expectEq(words[0], "КОТ", "сначала заданные вручную");
        expectEq(level.GetTargetScore(), WordFallWordAgent.TargetScore(level.config, words, boardConfig), "цель от агента");

        var again = Start({ id: "L077", words: ["КОТ"], wordsAuto: 2, difficulty: 4, autoTarget: true, moves: 11 }, 99);
        expectEq(again.GetWords().map(function(w) { return w.word; }), words, "другой сид поля — те же слова");
    });

    test("ServicePreviewsAgentWordsForTheEditor", function()
    {
        var service = new WordFallGameService();
        service.randomSeed = 42;
        service.campaignPath = "";
        service.campaignLength = 3;
        service.progressPath = "wordfall_test_words_progress.json";
        service.editedLevelsPath = "wordfall_test_words_levels.json";
        o2.FileSystem.FileDelete(service.progressPath);
        o2.FileSystem.FileDelete(service.editedLevelsPath);

        var config = service.GetLevelConfig(0);
        config.words = ["ДОМ"];
        config.wordsAuto = 2;
        var preview = service.PreviewLevelWords(config);
        expectEq(preview.length, 3);
        expectEq(preview[0], "ДОМ");
        expectEq(service.PickLevelWords(config, 3).length, 3, "агент дописывает слова");
        expect(service.PreviewTargetScore(config) > 0);

        service.SetLevelConfig(0, config);
        service.StartLevel(0);
        expectEq(service.GetWords().map(function(w) { return w.word; }), preview, "игрок получает то же, что показал редактор");
        expectEq(service.GetWords()[0].found, false);
        o2.FileSystem.FileDelete(service.progressPath);
        o2.FileSystem.FileDelete(service.editedLevelsPath);
    });

    test("TileTintsAreRandomStableAndDoNotShiftLetters", function()
    {
        var config = WordFallConfigs.DefaultLevelConfig();
        var a = new WordLevel(), b = new WordLevel();
        a.Start(config, boardConfig, dictionary, 5);
        b.Start(config, boardConfig, dictionary, 5);
        var counts = [0, 0, 0, 0];
        var same = true;
        for (var c = 0; c < 7; c++)
        {
            for (var r = 0; r < 8; r++)
            {
                var tile = a.GetBoard().GetTile({ c: c, r: r });
                counts[tile.tint]++;
                same = same && tile.tint == b.GetBoard().GetTile({ c: c, r: r }).tint;
            }
        }
        expect(same, "тот же сид — те же цвета");
        expect(counts.filter(function(n) { return n > 0; }).length >= 3, "цвета перемешаны: " + counts.join(","));
        expect(counts[0] + counts[1] > counts[3], "светлых больше, чем оранжевых");

        // буквы поля от цветов не зависят: сид даёт ту же раскладку, что и без них
        var letters = "";
        for (var c = 0; c < 7; c++)
            letters += a.GetBoard().GetTile({ c: c, r: 0 }).letter;
        var board = new WordBoard();
        board.Init(boardConfig, 5);
        board.Fill(WordFallConfigs.NormalizeLevel(config), "");
        var plain = "";
        for (var c = 0; c < 7; c++)
            plain += board.GetTile({ c: c, r: 0 }).letter;
        expectEq(letters, plain);
    });
})();
