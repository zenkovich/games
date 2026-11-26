include("Scripts/WordFall/WordFallGameService.js");

// Прогресс в сохранении игрока o2libs.Saves: переживает перезапуск, старый файл переезжает в него, чит сбрасывает его,
// копия сервиса (правка на портале) перечитывается. Раннер тестов держит сохранение в памяти, без сервиса
(function()
{
    var levelsPath = "wordfall_test_saves_levels.json";
    var legacyPath = WordFallProgressStore.LegacyPath;

    function Clean()
    {
        o2libs.Saves.Remove("wordfall");
        o2.FileSystem.FileDelete(legacyPath);
        o2.FileSystem.FileDelete(levelsPath);
    }

    function MakeService()
    {
        var service = new WordFallGameService();
        service.randomSeed = 42;
        service.campaignPath = "";
        service.editedLevelsPath = levelsPath;
        service.GetProgress(); // сервис стартует и читает прогресс
        return service;
    }

    function Win(service)
    {
        service.DebugCompleteTasks();
        service.DebugAddScore(service.GetTargetScore()*2);
        var result = service.WinLevel();
        service.ClaimReward(result.reward);
        return result;
    }

    test("ProgressLivesInThePlayersSave", function()
    {
        expect(typeof o2libs !== "undefined" && !!o2libs.Saves, "o2libs.Saves в сборке тестов");
        Clean();

        var service = MakeService();
        expectEq(o2libs.Saves.Get("wordfall").coins, service.startCoins, "новый игрок записан сразу");
        expect(service.GetSaveStatus().player.length > 0, "id игрока для портала");
        expectEq(service.GetSaveStatus().file, "");
        Win(service);
        var coins = service.GetCoins();
        expectEq(service.GetLevelIndex(), 1);

        var saved = o2libs.Saves.Get("wordfall");
        expect(saved && typeof saved == "object", "секция прогресса в сохранении");
        expectEq(saved.currentLevel, 1);
        expectEq(saved.coins, coins);
        expectEq(saved.stars[0], 3);
        expect(o2.FileSystem.ReadFile(legacyPath) === undefined, "без файла рядом с игрой");

        var again = MakeService();
        expectEq(again.GetLevelIndex(), 1, "перезапуск продолжает с того же уровня");
        expectEq(again.GetCoins(), coins);
        expectEq(again.GetStars(), 3);
        Clean();
    });

    test("ProgressFileOfOlderBuildsMovesIntoTheSave", function()
    {
        Clean();
        o2.FileSystem.WriteFile(legacyPath, JSON.stringify({ currentLevel: 4, coins: 4321, seenTutorials: ["basics"], stars: [3, 2, 1, 3] }));

        var service = MakeService();
        expectEq(service.GetLevelIndex(), 4);
        expectEq(service.GetCoins(), 4321);
        expect(service.IsTutorialSeen("basics"));
        expectEq(o2libs.Saves.Get("wordfall").coins, 4321);
        expect(o2.FileSystem.ReadFile(legacyPath) === undefined, "файл переехал и удалён");

        var again = MakeService();
        expectEq(again.GetLevelIndex(), 4, "второй запуск читает уже сохранение");
        Clean();
    });

    test("ResetCheatStartsANewPlayerKeepingLanguageAndSound", function()
    {
        Clean();
        var service = MakeService();
        Win(service);
        Win(service);
        service.MarkTutorialSeen("basics");
        service.SetSetting("music", false);
        var language = service.GetLanguage();
        expectEq(service.GetLevelIndex(), 2);

        service.ResetProgress();
        expectEq(service.GetLevelIndex(), 0);
        expectEq(service.GetCoins(), service.startCoins);
        expectEq(service.GetStars(), 0);
        expectEq(service.GetLives(), service.maxLives);
        expect(!service.IsTutorialSeen("basics"), "обучение заново");
        expectEq(service.GetSetting("music"), false, "настройки звука остаются");
        expectEq(service.GetLanguage(), language);
        expectEq(service.GetBoosterCharges(0), service.startBoosters[0]);

        var saved = o2libs.Saves.Get("wordfall");
        expectEq(saved.currentLevel, 0);
        expectEq(saved.coins, service.startCoins);
        expectEq(saved.seenTutorials.length, 0);

        expectEq(MakeService().GetLevelIndex(), 0, "сброс пережил перезапуск");
        Clean();
    });

    test("SaveReplacedByTheServiceIsReadAgain", function()
    {
        Clean();
        var service = MakeService();
        WordFallGame.service = service;

        var edited = service.GetProgress().ToData();
        edited.currentLevel = 6;
        edited.coins = 9999;
        o2libs.Saves.Set("wordfall", edited);
        service._OnProgressReplaced();

        expectEq(service.GetCoins(), 9999);
        expectEq(service.GetLevelIndex(), 6, "без главного экрана уровень сразу тот, что в сохранении");
        Win(service);
        expectEq(o2libs.Saves.Get("wordfall").currentLevel, 7, "игра продолжает правленое сохранение");
        WordFallGame.service = null;
        Clean();
    });

    test("ProgressPathKeepsAFileInsteadOfTheSave", function()
    {
        Clean();
        var path = "wordfall_test_saves_progress.json";
        o2.FileSystem.FileDelete(path);
        var service = new WordFallGameService();
        service.randomSeed = 42;
        service.campaignPath = "";
        service.editedLevelsPath = levelsPath;
        service.progressPath = path;
        Win(service);

        expectEq(service.GetSaveStatus().file, path);
        expect(o2libs.Saves.Get("wordfall") === undefined, "сохранение игрока не тронуто");
        expectEq(JSON.parse(o2.FileSystem.ReadFile(path)).currentLevel, 1);
        o2.FileSystem.FileDelete(path);
        Clean();
    });
})();
