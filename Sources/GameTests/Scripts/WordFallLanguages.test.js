include("Scripts/WordFall/WordFallGameService.js");

// Языки: алфавит, номиналы и мешок из WordFall/languages.json, словарь языка, слова уровней по языкам
(function()
{
    var progressPath = "wordfall_test_languages_progress.json";
    var levelsPath = "wordfall_test_languages_levels.json";

    // Тело на языке code; язык глобальный — после теста всегда возвращается базовый
    function OnLanguage(code, body)
    {
        WordFallLanguages.SetCurrent(code);
        try { body(); }
        finally { WordFallLanguages.SetCurrent(WordFallLanguages.BaseLanguage); }
    }

    function MakeService(fields)
    {
        var service = new WordFallGameService();
        service.randomSeed = 42;
        service.progressPath = progressPath;
        service.editedLevelsPath = levelsPath;
        for (var key in fields)
            service[key] = fields[key];
        return service;
    }

    function ValueOf(board, letter)
    {
        for (var i = 0; i < board.letters.length; i++)
        {
            if (board.letters[i].letter == letter)
                return board.letters[i].value;
        }
        return -1;
    }

    test("ConfigHasRussianAndEnglishScrabbleLetters", function()
    {
        expectEq(WordFallLanguages.List().map(function(l) { return l.code; }), ["ru", "en"]);
        expectEq(WordFallLanguages.Default(), "ru");

        var en = WordFallLanguages.ApplyBoard(WordFallConfigs.DefaultBoardConfig(), "en");
        expectEq(en.letters.length, 26);
        expectEq(en.vowels, "AEIOU");
        expectEq([ValueOf(en, "E"), ValueOf(en, "D"), ValueOf(en, "B"), ValueOf(en, "F"), ValueOf(en, "K"), ValueOf(en, "J"), ValueOf(en, "Q"), ValueOf(en, "Z")],
                 [1, 2, 3, 4, 5, 8, 10, 10], "номиналы английского скрабла");
        expectEq(en.letters.reduce(function(sum, def) { return sum + def.bagCount; }, 0), 98, "мешок скрабла без двух пустышек");
        expectEq(en.columns, 7, "геометрия поля от языка не зависит");

        var ru = WordFallLanguages.ApplyBoard(WordFallConfigs.DefaultBoardConfig(), "ru");
        expectEq(ru.letters, WordFallConfigs.DefaultRussianLetters(), "русский мешок прежний");
        expectEq(WordFallLanguages.SetCurrent("xx"), "ru", "неизвестный язык — язык по умолчанию");
    });

    test("EachLanguageHasItsDictionary", function()
    {
        var en = WordFallLanguages.Dictionary("en");
        var ru = WordFallLanguages.Dictionary("ru");
        expect(en.GetWordsCount() >= 15000, "английских слов " + en.GetWordsCount());
        expect(en.Contains("CAT") && en.Contains("HOUSE") && en.Contains("C?T"));
        expect(!en.Contains("КОТ") && ru.Contains("КОТ") && !ru.Contains("CAT"));
        expect(!en.Contains("ABC"), "сокращений в словаре нет");
        expectEq(WordDictionary.LetterCode("A"), 33);
        expectEq(WordDictionary.LetterCode("Z"), 58);
    });

    test("CampaignHasWordsOfEveryLanguage", function()
    {
        var asset = new o2.AssetRefDataAsset("WordFall/campaign.json");
        assert(asset.IsValid(), "нет ассета WordFall/campaign.json");
        var raw = JSON.parse(asset.Get().GetJson());
        WordFallLanguages.List().forEach(function(language) {
            OnLanguage(language.code, function() {
                var dictionary = WordFallLanguages.Dictionary(language.code);
                var alphabet = WordFallLanguages.Alphabet(language.code);
                raw.forEach(function(file) {
                    var level = WordFallConfigs.NormalizeLevel(file);
                    var name = language.code + " " + level.id;
                    expect(WordFallConfigs.IsLevelValid(level), name + ": нет слов");
                    level.words.forEach(function(word) { expect(dictionary.Contains(word), name + ": " + word + " не в словаре"); });
                    level.tasks.forEach(function(task) {
                        if (task.taskType == "Letter")
                            expect(task.letter.length == 1 && alphabet.indexOf(task.letter) >= 0, name + ": буква задачи " + task.letter);
                    });
                });
            });
        });
    });

    test("EditingOneLanguageKeepsTheOthers", function()
    {
        var file = { id: "L010", words: { ru: ["КОТ"], en: ["CAT"] }, tasks: [{ taskType: "Letter", count: 2, letter: { ru: "О", en: "A" } }] };
        OnLanguage("en", function() {
            var level = WordFallConfigs.NormalizeLevel(file);
            expectEq(level.words, ["CAT"]);
            expectEq(level.tasks[0].letter, "A");

            var draft = new WordFallLevelDraft(level, 7, 8);
            draft.SetWord(0, "dog");
            draft.SetTaskLetter(0, "g");
            var compact = WordFallConfigs.CompactLevel(draft.ToConfig());
            expectEq(compact.words, { en: ["DOG"], ru: ["КОТ"] }, "правка английских слов не трогает русские");
            expectEq(compact.tasks[0].letter, { en: "G", ru: "О" });
        });

        var ru = WordFallConfigs.NormalizeLevel({ id: "L010", words: { en: ["DOG"], ru: ["КОТ"] } });
        expectEq(ru.words, ["КОТ"]);
        expectEq(WordFallConfigs.UpgradeFileLevel({ words: ["ДОМ"], tasks: [{ taskType: "Letter", letter: "Т" }] }),
                 { words: { ru: ["ДОМ"] }, tasks: [{ taskType: "Letter", letter: { ru: "Т" } }] }, "старый файл — русский");
    });

    test("LevelWithoutWordsOfTheLanguageIsInvalidAndSkipped", function()
    {
        o2.FileSystem.FileDelete(progressPath);
        o2.FileSystem.FileDelete(levelsPath);
        var levels = [
            { id: "L001", words: { ru: ["ДОМ"], en: ["HOME"] }, moves: 9 },
            { id: "L002", words: { ru: ["КОТ"] }, moves: 8 },
            { id: "L003", words: { ru: ["ЛЕС"], en: ["TREE"] }, moves: 7 }
        ];
        var service = MakeService({ campaignPath: "", levels: levels });
        try
        {
            service.StartLevel(1);
            expectEq(service.GetLevelIndex(), 1);
            expectEq(service.GetLanguage(), "ru");

            service.SetLanguage("en");
            expect(!service.IsLevelValid(1), "у L002 нет английских слов");
            expectEq(service.GetLevelIndex(), 2, "невалидный уровень пропущен");
            expectEq(service.GetValidLevelCount(), 2);
            expectEq(service.GetLevel().words.map(function(w) { return w.word; }), ["TREE"]);

            service.DebugSetTile(0, 0, "Q");
            expectEq(service.GetTile(0, 0).value, 10, "номинал английской буквы");
            var board = service.GetLevel().GetBoard();
            var alphabet = WordFallLanguages.Alphabet("en");
            for (var c = 0; c < 7; c++)
                for (var r = 0; r < 8; r++)
                {
                    var letter = board.GetTile({ c: c, r: r }).letter;
                    expect(letter == "" || alphabet.indexOf(letter) >= 0, "на поле буква " + letter);
                }

            service.StartLevel(1);
            expectEq(service.GetLevelIndex(), 2, "старт невалидного — следующий валидный");

            var restored = MakeService({ campaignPath: "", levels: levels });
            restored.StartLevel(0);
            expectEq(restored.GetLanguage(), "en", "язык хранится в прогрессе игрока");
            restored.SetLanguage("ru");
            expectEq(restored.GetLevel().words.map(function(w) { return w.word; }), ["ДОМ"]);
        }
        finally
        {
            WordFallLanguages.SetCurrent(WordFallLanguages.BaseLanguage);
            o2.FileSystem.FileDelete(progressPath);
            o2.FileSystem.FileDelete(levelsPath);
        }
    });
})();
