include("Scripts/WordFall/Core/WordFallCore.js");

// Кампания из Assets/WordFall/campaign.json — её строит LevelLab (Tools/WordFall/LevelLab) по кривой сложности:
// грузится как data-ассет, каждый уровень стартует и играбелен, слова уровней — знакомые существительные,
// механики вводятся по очереди
(function()
{
    var dictionary = WordDictionary.LoadDefault();
    var boardConfig = WordFallConfigs.DefaultBoardConfig();

    function LoadCampaign()
    {
        var asset = new o2.AssetRefDataAsset("WordFall/campaign.json");
        assert(asset.IsValid(), "нет ассета WordFall/campaign.json");
        return JSON.parse(asset.Get().GetJson()).map(function(level) { return WordFallConfigs.NormalizeLevel(level); });
    }

    function UsableTiles(board)
    {
        var count = 0;
        for (var c = 0; c < board.GetColumns(); c++)
            for (var r = 0; r < board.GetRows(); r++)
                count += WordBoard.IsTileUsable(board.GetTile({ c: c, r: r })) ? 1 : 0;
        return count;
    }

    test("LoadsAllLevelsWithSaneLimits", function()
    {
        var campaign = LoadCampaign();
        expectEq(campaign.length, 100);
        var used = {};
        campaign.forEach(function(level, i) {
            var name = "уровень " + (i + 1);
            expect(level.moves >= 8 && level.moves <= 20, name + ": ходов " + level.moves);
            expect(level.tasks.length >= 1 && level.tasks.length <= 4, name);
            expect(level.words.length >= 1 && level.words.length <= 3, name);
            expect(!level.autoTarget && level.wordsAuto == 0, name + ": слова и цель подобраны заранее");
            expect(level.difficulty >= 1 && level.difficulty <= 10, name);
            expectEq(level.id, WordFallConfigs.LevelId(i), name + ": постоянный id");
            level.words.forEach(function(word) {
                var index = dictionary.IndexOf(word);
                expect(index >= 0 && dictionary.IsLevelWord(index) && dictionary.GetFamiliarity(index) >= 7,
                       name + ": слово уровня — знакомое всем существительное, а здесь " + word);
                expect(!used[word], name + ": слово " + word + " уже было в кампании");
                used[word] = true;
            });
        });
    });

    test("EveryLevelStartsPlayable", function()
    {
        LoadCampaign().forEach(function(config, i) {
            var name = "уровень " + (i + 1);
            var level = new WordLevel();
            level.Start(config, boardConfig, dictionary, 11 + i);
            var board = level.GetBoard();
            expect(UsableTiles(board) >= 24, name + " слишком забит препятствиями");
            expect(board.AnyWordExists(dictionary, 0), name);
            expect(board.CanAssembleWord(level.NextWord()), name + ": первое слово собирается с поля");
            expectEq(level.GetState(), "playing", name);
            level.GetTasks().forEach(function(task) { expect(!task.done, name + ": задание закрыто на старте"); });
        });
    });

    test("MechanicsComeOneByOneAfterAGentleStart", function()
    {
        var campaign = LoadCampaign();
        var firstWith = function(predicate) {
            for (var i = 0; i < campaign.length; i++)
                if (predicate(campaign[i]))
                    return i;
            return -1;
        };
        var crates = firstWith(function(l) { return l.crateCells.length > 0; });
        var ice = firstWith(function(l) { return l.iceCells.length > 0; });
        var snow = firstWith(function(l) { return l.snowCells.length > 0; });
        var parcels = firstWith(function(l) { return l.parcelTotal > 0; });
        var chains = firstWith(function(l) { return l.chainCells.length > 0; });
        var stones = firstWith(function(l) { return l.stoneCells.length > 0; });
        expect(crates >= 2, "первые уровни — без препятствий");
        expect(crates < ice && ice < snow && snow < parcels && parcels < chains && chains < stones,
               "ящики, лёд, снежки, конверты, цепи, камни — по очереди: " + [crates, ice, snow, parcels, chains, stones].join(", "));

        for (var i = 0; i < 10; i++)
        {
            expectEq(campaign[i].tasks.length, 1, "обучение, уровень " + (i + 1) + ": одно задание");
            expectEq(campaign[i].words.length, 1, "обучение, уровень " + (i + 1) + ": одно слово");
            expect(campaign[i].words[0].length <= 4, "обучение, уровень " + (i + 1) + ": короткое слово");
        }

        var average = function(from, to, pick) {
            var sum = 0;
            for (var i = from; i < to; i++)
                sum += pick(campaign[i]);
            return sum/(to - from);
        };
        var perMove = function(l) { return l.targetScore/l.moves; };
        expect(average(0, 12, perMove) < average(70, 100, perMove), "к концу кампании за ход нужно больше очков");
        expect(average(0, 20, function(l) { return l.tasks.length; }) < average(60, 100, function(l) { return l.tasks.length; }), "заданий становится больше");
    });
})();
