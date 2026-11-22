include("Scripts/WordFall/WordFallGameService.js");

// Удалённый баланс: значения из Live-ops ложатся поверх конфига сцены только в допустимых
// диапазонах, без модуля o2libs игра идёт на умолчаниях, A/B-группа читается из того же модуля
(function()
{
    var realLibs = typeof o2libs !== "undefined" ? o2libs : undefined;

    function WithRemote(configs, groups, body)
    {
        var listeners = [];
        o2libs = { RemoteConfig: {
            Get: function(key) { return configs ? configs[key] : undefined; },
            GetGroup: function(experiment) { return (groups || {})[experiment] || ""; },
            OnChanged: function(fn) { listeners.push(fn); }
        } };
        try { body(listeners); }
        finally { o2libs = realLibs; }
    }

    function Board() { return WordFallConfigs.NormalizeBoard(null); }

    test("NoModuleMeansDefaults", function()
    {
        var saved = realLibs;
        o2libs = undefined;
        try
        {
            var board = WordFallRemote.ApplyBoard(Board());
            expectEq(board.bombWordLength, 5);
            expectEq(WordFallRemote.FallSpeed(9.5), 9.5);
            expectEq(WordFallRemote.Group(), "");
            expectEq(WordFallGame.remote.source, "defaults");
        }
        finally { o2libs = saved; }
    });

    test("NoConfigMeansDefaults", function()
    {
        WithRemote({}, {}, function()
        {
            expectEq(WordFallRemote.ApplyBoard(Board()).bombWordLength, 5);
            expectEq(WordFallGame.remote.source, "defaults");
        });
    });

    test("RemoteValuesGoOverTheScene", function()
    {
        WithRemote({ wordfall_balance: { bombWordLength: 4, maxConsonantRun: 3, fallSpeedCells: 14, unknown: 1 } }, { bomb_length: "easy" }, function()
        {
            var source = Board();
            var board = WordFallRemote.ApplyBoard(source);
            expectEq(board.bombWordLength, 4);
            expectEq(board.maxConsonantRun, 3);
            expectEq(board.rocketWordLength, 6, "не заданное удалённо остаётся из сцены");
            expectEq(board.unknown, undefined, "чужие поля в конфиг поля не попадают");
            expectEq(source.bombWordLength, 5, "исходный конфиг не меняется");
            expectEq(board.letters.length, source.letters.length);
            expectEq(WordFallRemote.FallSpeed(9.5), 14);
            expectEq(WordFallGame.remote, { source: "remote", applied: { bombWordLength: 4, maxConsonantRun: 3 }, group: "easy" });
        });
    });

    test("OutOfRangeValuesAreDropped", function()
    {
        WithRemote({ wordfall_balance: { bombWordLength: 1, rocketWordLength: "6", fireworksWordLength: 7.5, maxConsonantRun: 99, fallSpeedCells: 1000 } }, {}, function()
        {
            var board = WordFallRemote.ApplyBoard(Board());
            expectEq([board.bombWordLength, board.rocketWordLength, board.fireworksWordLength, board.maxConsonantRun], [5, 6, 7, 4]);
            expectEq(WordFallRemote.FallSpeed(9.5), 9.5);
            expectEq(WordFallGame.remote.applied, {});
        });
    });

    test("BrokenBonusOrderIsNotApplied", function()
    {
        // бомба длиннее ракеты: каждое значение в своём диапазоне, вместе — бессмыслица
        WithRemote({ wordfall_balance: { bombWordLength: 7, maxConsonantRun: 3 } }, {}, function()
        {
            var board = WordFallRemote.ApplyBoard(Board());
            expectEq([board.bombWordLength, board.maxConsonantRun], [5, 4]);
            expectEq(WordFallGame.remote.applied, {});
        });
    });

    test("LevelStartsWithTheRemoteBombLength", function()
    {
        WithRemote({ wordfall_balance: { bombWordLength: 4 } }, { bomb_length: "easy" }, function()
        {
            var service = new WordFallGameService();
            service.campaignPath = "";
            service.randomSeed = 7;
            service.progressPath = "wordfall_test_remote_progress.json";
            service.editedLevelsPath = "wordfall_test_remote_levels.json";
            service.StartLevel(0);
            expectEq(service._BoardConfig().bombWordLength, 4);
            expectEq(WordFallGame.remote.group, "easy");
        });
    });

    test("CampaignLevelsComeFromTheRemoteConfigById", function()
    {
        var progressPath = "wordfall_test_remote_levels_progress.json";
        var levelsPath = "wordfall_test_remote_levels_edits.json";
        o2.FileSystem.FileDelete(progressPath);
        o2.FileSystem.FileDelete(levelsPath);
        var levels = { L002: { id: "L002", words: { ru: ["КОТ"], en: ["CAT"] }, moves: 33, targetScore: 777, tasks: [] }, L003: [1, 2], L004: "broken" };
        WithRemote({ wordfall_levels: { version: 1, levels: levels } }, {}, function()
        {
            var service = new WordFallGameService();
            service.randomSeed = 7;
            service.progressPath = progressPath;
            service.editedLevelsPath = levelsPath;
            service.StartLevel(1);
            expectEq(service.GetMovesLeft(), 33, "уровень из удалённого конфига вместо собранного");
            expectEq(service.GetTargetScore(), 777);
            expectEq(service.GetLevelConfig(1).id, "L002");
            expectEq(service.GetLevelConfig(1).moves, 33, "редактор уровней видит тот же уровень");

            var builtIn = WordFallConfigs.NormalizeLevel(JSON.parse(new o2.AssetRefDataAsset("WordFall/campaign.json").Get().GetJson())[0]);
            service.StartLevel(0);
            expectEq(service.GetMovesLeft(), builtIn.moves, "уровня нет в конфиге — играется собранный");
            expectEq(WordFallRemote.Level("L003"), null, "не уровень — не применяется");
            expectEq(WordFallRemote.Level("L004"), null);
        });
        o2.FileSystem.FileDelete(progressPath);
        o2.FileSystem.FileDelete(levelsPath);
    });

    test("SubscribesToChanges", function()
    {
        WithRemote({}, {}, function(listeners)
        {
            var calls = 0;
            WordFallRemote.OnChanged(function() { calls++; });
            expectEq(listeners.length, 1);
            listeners[0]();
            expectEq(calls, 1);
        });
    });
})();
