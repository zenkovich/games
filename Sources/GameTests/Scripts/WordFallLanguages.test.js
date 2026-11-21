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
    // Слова словарей оценены: сложность и узнаваемость 1..9, вид слова, пометка «годится в слова уровня»
    test("DictionariesRateTheirWords", function()
    {
        var ru = WordFallLanguages.Dictionary("ru"), en = WordFallLanguages.Dictionary("en");
        expect(ru.HasRatings() && en.HasRatings() && ru.HasLevelWords() && en.HasLevelWords());
        expect(ru.GetWordsCount() >= 36000 && en.GetWordsCount() >= 32000, "слов: ru " + ru.GetWordsCount() + ", en " + en.GetWordsCount());

        var of = function(dictionary, word) {
            var index = dictionary.IndexOf(word);
            assert(index >= 0, "нет слова " + word);
            return { d: dictionary.GetDifficulty(index), f: dictionary.GetFamiliarity(index), kind: dictionary.GetKind(index), level: dictionary.IsLevelWord(index) };
        };
        expect(of(ru, "ДОМ").f == 9 && of(ru, "ДОМ").level && of(en, "HOUSE").f == 9 && of(en, "HOUSE").level, "ДОМ и HOUSE знают все");
        expect(of(ru, "ВЫЯ").f <= 3 && !of(ru, "ВЫЯ").level, "редкое слово остаётся в словаре, но в слова уровня не идёт");
        expect(of(ru, "ДОМ").d < of(ru, "ПАРАШЮТ").d, "длинное слово с подвохом сложнее");
        expectEq([of(ru, "МОСКВА").kind, of(ru, "ИВАН").kind, of(en, "LONDON").kind], [WordDictionary.KindName, WordDictionary.KindName, WordDictionary.KindName]);
        expectEq([of(ru, "ЖОПА").kind, of(en, "SHIT").kind], [WordDictionary.KindRude, WordDictionary.KindRude]);
        expect(!of(ru, "МОСКВА").level && !of(ru, "ЖОПА").level, "имена и грубые слова принимаются от игрока, но не загадываются");
        expect(ru.Contains("ИДТИ") && ru.Contains("БЕЛЫЙ") && ru.Contains("ДЕНЬГИ") && ru.Contains("БЫСТРО"), "в словаре не только существительные");
        expect(en.Contains("SELFIE") && en.Contains("MICHAEL"));

        var plain = new WordDictionary(["КОТ", "ПАЛУБА"]);
        expect(!plain.HasRatings() && !plain.HasLevelWords());
        expectEq([plain.GetDifficulty(0), plain.GetDifficulty(1), plain.GetFamiliarity(0)], [2, 5, 6], "без оценок: сложность по длине, узнаваемость средняя");
        expect(plain.IsLevelWord(0), "без разметки в слова уровня годится любое обычное слово");

        var rated = new WordDictionary(["КОТ", "РИМ", "ХАМ"], { difficulty: "234", familiarity: "987", kinds: "wnp" });
        expectEq([rated.GetDifficulty(1), rated.GetFamiliarity(2)], [3, 7]);
        expectEq([rated.IsLevelWord(0), rated.IsLevelWord(1), rated.IsCommon(0), rated.IsCommon(1), rated.IsCommon(2)], [true, false, true, false, false]);
    });

    // Цели уровней по очкам заданы для языка по умолчанию; у языка с другими номиналами букв свой масштаб
    test("ScoreTargetsFollowTheLanguageScale", function()
    {
        expectEq(WordFallLanguages.Get("ru").scoreScale, 1);
        var scale = WordFallLanguages.Get("en").scoreScale;
        expect(scale > 0.5 && scale < 1, "английские буквы дешевле: масштаб " + scale);

        var file = { id: "S001", words: { en: ["CAT"], ru: ["КОТ"] }, targetScore: 500, moves: 10, tasks: [{ taskType: "WordScore", scoreThreshold: 40 }] };
        OnLanguage("en", function() {
            var level = new WordLevel();
            level.Start(file, WordFallLanguages.ApplyBoard(WordFallConfigs.DefaultBoardConfig(), "en"), WordFallLanguages.Dictionary("en"), 3);
            expectEq(level.GetTargetScore(), Math.round(500*scale/10)*10);
            expectEq(level.GetTasks()[0].config.scoreThreshold, Math.round(40*scale));
        });
        OnLanguage("ru", function() {
            var level = new WordLevel();
            level.Start(file, WordFallLanguages.ApplyBoard(WordFallConfigs.DefaultBoardConfig(), "ru"), WordFallLanguages.Dictionary("ru"), 3);
            expectEq([level.GetTargetScore(), level.GetTasks()[0].config.scoreThreshold], [500, 40]);
        });
    });
})();
