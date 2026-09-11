include("Scripts/WordFall/Core/WordFallCore.js");

// Кампания из Assets/WordFall/campaign.json: грузится как data-ассет, каждый уровень
// стартует и играбелен, кривая сложности растёт от обучения к основной линии
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
        expectEq(campaign.length, 130);
        campaign.forEach(function(level, i) {
            var name = "уровень " + (i + 1);
            expect(level.moves >= 9 && level.moves <= 18, name);
            expect(level.tasks.length >= 2 && level.tasks.length <= 5, name);
            expectEq(level.tasks[0].taskType, "Word", name + ": первое задание — слово, оно же сидится");
            expect(dictionary.Contains(level.tasks[0].word), name + ": " + level.tasks[0].word);
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
            expectEq(level.GetState(), "playing", name);
            level.GetTasks().forEach(function(task) { expect(!task.done, name + ": задание закрыто на старте"); });
        });
    });

    test("DifficultyCurveRisesFromOnboardingToMainLine", function()
    {
        var campaign = LoadCampaign();
        var averagePerMove = function(from, to) {
            var sum = 0;
            for (var i = from; i < to; i++)
                sum += campaign[i].targetScore/campaign[i].moves;
            return sum/(to - from);
        };
        var onboarding = averagePerMove(0, 31);
        var early = averagePerMove(31, 60);
        var lateGame = averagePerMove(100, 130);
        expect(onboarding < early);
        expect(early <= lateGame*1.05);
        expect(campaign[0].targetScore < campaign[129].targetScore);

        // в обучении механики появляются по очереди, а не все сразу
        var firstWith = function(predicate) {
            for (var i = 0; i < campaign.length; i++)
                if (predicate(campaign[i]))
                    return i;
            return -1;
        };
        var crates = firstWith(function(l) { return l.crateCells.length > 0; });
        var snow = firstWith(function(l) { return l.snowCells.length > 0; });
        var parcels = firstWith(function(l) { return l.parcelTotal > 0; });
        var chains = firstWith(function(l) { return l.chainCells.length > 0; });
        expect(crates >= 0);
        expect(snow > crates);
        expect(parcels > snow);
        expect(chains >= 0);
        expect(parcels < 31, "конверты вводятся ещё в обучении");
    });
})();
