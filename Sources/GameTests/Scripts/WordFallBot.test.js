include("Scripts/WordFall/Core/WordFallCore.js");
include("Scripts/WordFall/WordFallBotRunner.js");

// Бот-игрок: проходит уровень по правилам игры, повторяет попытку по сидам, знает слова по своей эрудиции,
// идёт к целям уровня; сильный игрок набирает больше слабого
(function()
{
    var dictionary = WordDictionary.LoadDefault();
    var boardConfig = WordFallConfigs.DefaultBoardConfig();
    var profiles = WordFallBot.Profiles();

    function Play(config, profile, seed)
    {
        var level = new WordLevel();
        level.Start(WordFallConfigs.NormalizeLevel(config), boardConfig, dictionary, seed);
        var bot = new WordFallBot(profile, seed + 1000);
        bot.Begin(level, dictionary);
        var words = [], refused = 0;
        for (var guard = 0; guard < 200 && level.GetState() == "playing"; guard++)
        {
            var action = bot.NextAction();
            if (action.type == "stuck" || action.type == "none")
                break;
            var result = WordFallBot.Apply(level, dictionary, action);
            if (action.type != "word" && action.type != "accept")
                continue;
            if (result.ok)
            {
                words.push(result.word);
                bot.OnMove(result);
            }
            else
                refused++;
        }
        return { level: level, words: words, refused: refused };
    }

    var noBoosters = [0, 0, 0, 0, 0];
    var plain = { id: "B001", words: ["КОТ"], moves: 10, targetScore: 150, boosterCharges: noBoosters, tasks: [{ taskType: "AnyWords", count: 3 }] };

    test("BotPlaysALevelToItsEndByTheRules", function()
    {
        var game = Play(plain, profiles.average, 11);
        expect(game.level.GetState() != "playing", "уровень доигран: " + game.level.GetState());
        expectEq(game.refused, 0, "бот предлагает только слова словаря, которые собираются из букв поля");
        expect(game.words.length >= 3, "слов сыграно " + game.words.length);
        expectEq(new Set(game.words).size, game.words.length, "слова не повторяются");
        expect(game.words.indexOf("КОТ") >= 0, "слово уровня найдено: " + game.words.join(" "));
        game.words.forEach(function(word) { expect(dictionary.Contains(word), word); });
    });

    test("SameSeedsReplayTheSameAttempt", function()
    {
        var first = Play(plain, profiles.average, 5);
        var again = Play(plain, profiles.average, 5);
        expectEq(again.words, first.words, "те же сиды — та же попытка");
        expectEq(again.level.GetScore(), first.level.GetScore());
        expect(JSON.stringify(Play(plain, profiles.average, 6).words) != JSON.stringify(first.words), "другой сид — другая игра");
    });

    test("EruditionDecidesWhichWordsThePlayerKnows", function()
    {
        var rare = [], common = [];
        for (var i = 0; i < dictionary.GetWordsCount(); i += 7)
        {
            var familiarity = dictionary.GetFamiliarity(i);
            if (familiarity <= 3)
                rare.push(i);
            else if (familiarity >= 9)
                common.push(i);
        }
        assert(rare.length > 200 && common.length > 100, "в выборке есть и редкие, и общеизвестные слова");

        var known = function(erudition, list) {
            var level = new WordLevel();
            level.Start(WordFallConfigs.NormalizeLevel(plain), boardConfig, dictionary, 3);
            var bot = new WordFallBot({ erudition: erudition, effort: 0.5, skill: 0.5, boosters: 0, spread: 0 }, 17);
            bot.Begin(level, dictionary);
            var count = 0;
            for (var i = 0; i < list.length; i++)
                count += bot.Knows(list[i]) ? 1 : 0;
            return count/list.length;
        };
        var weakRare = known(0.2, rare), averageRare = known(0.5, rare), strongRare = known(0.9, rare);
        expect(weakRare < averageRare && averageRare < strongRare, "редкие слова: " + [weakRare, averageRare, strongRare].map(function(s) { return s.toFixed(2); }).join(" < "));
        expect(strongRare > weakRare*4, "эрудит знает редких слов в разы больше");
        expectNear(averageRare, 0.13, 0.07, "средний игрок знает редкие слова по их узнаваемости");
        expect(known(0.2, common) > 0.9 && known(0.5, common) > 0.98, "общеизвестные слова знают все");
    });

    test("StrongerPlayersScoreMore", function()
    {
        var open = { id: "B002", words: ["ЛЕС"], moves: 10, targetScore: 100000, boosterCharges: noBoosters, tasks: [] };
        var total = function(profile) {
            var sum = 0, letters = 0, words = 0;
            for (var seed = 1; seed <= 10; seed++)
            {
                var game = Play(open, profile, seed);
                sum += game.level.GetScore();
                game.words.forEach(function(word) { letters += word.length; words++; });
            }
            return { score: sum, length: letters/words };
        };
        var weak = total(profiles.weak), strong = total(profiles.strong);
        expect(strong.score > weak.score*1.2, "очки: слабый " + weak.score + ", сильный " + strong.score);
        expect(strong.length > weak.length, "слова сильного длиннее: " + weak.length.toFixed(2) + " и " + strong.length.toFixed(2));
        expect(weak.length > 3.2 && strong.length < 5.5, "длина слов — как у человека, а не у перебора словаря");
    });

    test("BotGoesForTheGoalsOfTheLevel", function()
    {
        var crates = { id: "B003", words: ["ДОМ"], moves: 14, targetScore: 10, boosterCharges: noBoosters, tasks: [{ taskType: "Crates" }],
                       crateCells: [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 2 }, { x: 2, y: 5 }, { x: 4, y: 6 }], crateGrades: [1, 1, 1, 1, 1] };
        var letter = { id: "B004", words: ["ДОМ"], moves: 12, targetScore: 10, boosterCharges: noBoosters, tasks: [{ taskType: "Letter", letter: "О", count: 6 }] };
        var wins = function(config) {
            var count = 0;
            for (var seed = 1; seed <= 8; seed++)
                count += Play(config, profiles.average, seed).level.GetState() == "won" ? 1 : 0;
            return count;
        };
        expect(wins(crates) >= 6, "ящики разбиты словами по соседству: побед " + wins(crates) + " из 8");
        expect(wins(letter) >= 6, "слова с буквой задания: побед " + wins(letter) + " из 8");
    });

    test("HintComesWhenThePlayerIsOutOfWords", function()
    {
        var level = new WordLevel();
        level.Start(WordFallConfigs.NormalizeLevel({ id: "B005", words: ["ЛУНА"], moves: 6, targetScore: 10, boosterCharges: [0, 0, 2, 0, 0], tasks: [] }),
                    boardConfig, dictionary, 9);
        // игрок, который не знает ни слова, но охотно жмёт бустеры
        var bot = new WordFallBot({ erudition: 0, effort: 0, skill: 0, boosters: 1, spread: 0 }, 5);
        bot.Begin(level, dictionary);
        bot._knowLimit.fill(0);
        bot._Recall = function() { return []; };
        bot._RecallHard = function() { return []; };

        var action = bot.NextAction();
        expectEq(action.type, "hint");
        WordFallBot.Apply(level, dictionary, action);
        expectEq(bot.NextAction().type, "accept", "за подсказкой — принять набранное ею слово");
        expectEq(level.GetBoard().GetCurrentWord(), "ЛУНА", "подсказка ведёт к слову уровня");
    });

    test("ProfileOfMindRunsFromWeakToStrong", function()
    {
        expectEq(WordFallBot.ProfileOf(0), profiles.weak);
        expectEq(WordFallBot.ProfileOf(0.5), profiles.average);
        expectEq(WordFallBot.ProfileOf(1), profiles.strong);
        var between = WordFallBot.ProfileOf(0.75);
        expect(between.erudition > profiles.average.erudition && between.erudition < profiles.strong.erudition);
        expectEq(WordFallBot.NormalizeProfile({ erudition: 7, skill: -1 }).erudition, 1, "значения профиля — в пределах 0..1");
    });

    test("RunnerTakesOnlyAFreshRequest", function()
    {
        var path = "wordfall_test_bot_request.json";
        o2.FileSystem.FileDelete(path);
        expectEq(WordFallBotRunner.ReadRequest(path), null, "нет файла — обычный запуск игры");

        o2.FileSystem.WriteFile(path, JSON.stringify({ expires: Date.now() + 60000, level: plain, seed: 3 }));
        var request = WordFallBotRunner.ReadRequest(path);
        assert(request, "свежий запрос принят");
        expectEq(request.level.id, "B001");

        o2.FileSystem.WriteFile(path, JSON.stringify({ expires: Date.now() - 1000, level: plain }));
        expectEq(WordFallBotRunner.ReadRequest(path), null, "устаревший запрос не перехватывает запуск игры");
        o2.FileSystem.WriteFile(path, "{ broken");
        expectEq(WordFallBotRunner.ReadRequest(path), null);
        o2.FileSystem.FileDelete(path);
    });
})();
