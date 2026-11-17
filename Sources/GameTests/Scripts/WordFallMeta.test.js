include("Scripts/WordFall/WordFallGameService.js");
include("Scripts/WordFall/WordFallUiTweens.js");

// Мета: монеты, жизни и звёзды в прогрессе, награда за победу, продолжение уровня за монеты или ролик, отказ
(function()
{
    var progressPath = "wordfall_test_meta_progress.json";
    var levelsPath = "wordfall_test_meta_levels.json";

    function MakeService()
    {
        o2.FileSystem.FileDelete(progressPath);
        o2.FileSystem.FileDelete(levelsPath);
        var service = new WordFallGameService();
        service.randomSeed = 42;
        service.progressPath = progressPath;
        service.editedLevelsPath = levelsPath;
        return service;
    }

    test("WinGivesStarsAndAClaimableReward", function()
    {
        var service = MakeService();
        expectEq(service.GetCoins(), 1000, "стартовый запас");
        expectEq(service.GetLives(), 5);
        expectEq(service.GetStars(), 0);

        service.DebugCompleteTasks();
        service.DebugAddScore(service.GetTargetScore()*2);
        expectEq(service.GetGameState(), "won");
        var score = service.GetScore();

        var result = service.WinLevel();
        expectEq(result.level, 1);
        expectEq(result.stars, 3, "очков вдвое больше цели");
        expectEq(result.reward, score);
        expectEq(service.GetLevelIndex(), 1, "следующий уровень уже начат");
        expectEq(service.GetStars(), 3);
        expectEq(service.GetCoins(), 1000, "награду забирают из окна");

        expectEq(service.ClaimReward(result.reward*2), 1000 + score*2);

        // прогресс меты переживает перезапуск
        var restored = new WordFallGameService();
        restored.progressPath = progressPath;
        restored.editedLevelsPath = levelsPath;
        expectEq(restored.GetCoins(), 1000 + score*2);
        expectEq(restored.GetStars(), 3);
        o2.FileSystem.FileDelete(progressPath);
    });

    test("OutOfMovesContinuesForCoinsOrAnAd", function()
    {
        var service = MakeService();
        expect(!service.ContinueWithCoins(), "уровень не проигран");

        service.DebugLoseLevel();
        expectEq(service.GetGameState(), "lost");
        expect(service.ContinueWithCoins());
        expectEq(service.GetCoins(), 100);
        expectEq(service.GetMovesLeft(), 5);
        expectEq(service.GetGameState(), "playing");

        service.DebugLoseLevel();
        expect(!service.CanContinueWithCoins());
        expect(!service.ContinueWithCoins(), "монет не хватает");
        expectEq(service.GetGameState(), "lost");
        expect(service.ContinueForAd());
        expectEq(service.GetMovesLeft(), 5);
        expectEq(service.GetGameState(), "playing");
        o2.FileSystem.FileDelete(progressPath);
    });

    test("GivingUpBurnsALifeThatComesBack", function()
    {
        var service = MakeService();
        service.DebugLoseLevel();
        service.GiveUpLevel();
        expectEq(service.GetLives(), 4);
        expectEq(service.GetGameState(), "playing", "уровень начат заново");

        var progress = new PlayerProgress();
        progress.lives = 2;
        progress.livesAt = 1000;
        progress.RegenLives(5, 60, 1000 + 59*1000);
        expectEq(progress.lives, 2);
        progress.RegenLives(5, 60, 1000 + 125*1000);
        expectEq(progress.lives, 4, "две жизни за две минуты");
        expectEq(progress.livesAt, 1000 + 120*1000, "остаток времени копится к следующей");
        progress.RegenLives(5, 60, 1000 + 3600*1000);
        expectEq(progress.lives, 5);
        expectEq(progress.livesAt, 0, "полный запас не тикает");
        o2.FileSystem.FileDelete(progressPath);
    });

    test("NumbersAreGroupedByThousands", function()
    {
        expectEq(WordFallUi.FormatNumber(13010), "13,010");
        expectEq(WordFallUi.FormatNumber(900), "900");
        expectEq(WordFallUi.FormatNumber(1234567.4), "1,234,567");
        expectEq(WordFallUi.FormatNumber(0), "0");
    });
})();
