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

    test("CoinsBuyBoostersBonusesAndLives", function()
    {
        var service = MakeService();
        expectEq(service.GetShopPacks().length, 6);
        expect(service.BuyCoins(0), "пачка банка засчитывается сразу");
        expectEq(service.GetCoins(), 1000 + service.shopPacks[0].coins);

        var coins = service.GetCoins();
        var hammers = service.GetBoosterStock(WordLevel.Hammer);
        expect(service.BuyBooster(WordLevel.Hammer));
        expectEq(service.GetBoosterStock(WordLevel.Hammer), hammers + service.boosterPack);
        expectEq(service.GetBoosterCharges(WordLevel.Hammer), hammers + service.boosterPack, "купленное — сразу в уровне");
        expectEq(service.GetCoins(), coins - service.GetBoosterPrice(WordLevel.Hammer));

        expectEq(service.GetBonusCount(1), 1, "бонусы на старт у нового игрока");
        expect(service.BuyBonus(1));
        expectEq(service.GetBonusCount(1), 1 + service.boosterPack);

        service.GetProgress().coins = 10;
        expect(!service.BuyBooster(WordLevel.Hint), "монет не хватает");
        expect(!service.BuyBonus(0));
        expectEq(service.GetCoins(), 10);

        // жизни: таймер следующей, полный запас за монеты, жизнь за ролик
        service.GiveUpLevel();
        expectEq(service.GetLives(), 4);
        var next = service.GetNextLifeSeconds();
        expect(next > 0 && next <= service.lifeRegenSeconds, "до следующей жизни " + next + " с");
        expect(!service.CanRefillLives());
        expect(!service.RefillLivesWithCoins());
        service.GetProgress().coins = 5000;
        expect(service.RefillLivesWithCoins());
        expectEq([service.GetLives(), service.GetNextLifeSeconds(), service.GetCoins()], [5, 0, 5000 - service.livesRefillPrice]);
        expect(!service.AddLifeForAd(), "запас полон");
        service.GiveUpLevel();
        expect(service.AddLifeForAd());
        expectEq(service.GetLives(), 5);

        // всё лежит в сохранении
        var again = new WordFallGameService();
        again.progressPath = progressPath;
        again.editedLevelsPath = levelsPath;
        expectEq(again.GetBonusCount(1), 1 + service.boosterPack);
        expectEq(again.GetBoosterStock(WordLevel.Hammer), hammers + service.boosterPack);
        expectEq(again.GetCoins(), service.GetCoins());
        o2.FileSystem.FileDelete(progressPath);
    });

    test("ChosenBonusesStandOnTheBoardAtTheStart", function()
    {
        var service = MakeService();
        service.GetProgress().bonuses = [2, 1, 0];
        var placed = service.StartLevelWithBonuses([0, 1, 2]);
        expectEq(placed.length, 2, "салюта в запасе нет");
        expectEq(service.GetProgress().bonuses, [1, 0, 0]);
        var kinds = placed.map(function(cell) { return service.GetTile(cell.c, cell.r).powerup; });
        expectEq(kinds, ["bomb", "rocket"]);
        var seeded = service.GetSeededCells();
        placed.forEach(function(cell) { expect(!WordFallCells.Contains(seeded, cell), "бонус встал на букву слова уровня"); });
        expectEq(service.GetGameState(), "playing");

        // без выбора — чистое поле
        var none = service.StartLevelWithBonuses([]);
        expectEq(none.length, 0);
        o2.FileSystem.FileDelete(progressPath);
    });

    test("SettingsAreKeptInTheProgress", function()
    {
        var service = MakeService();
        expect(service.GetSetting("sound"), "по умолчанию включено");
        service.SetSetting("sound", false);
        expect(!service.GetSetting("sound"));
        expect(service.GetSetting("music"));

        var again = new WordFallGameService();
        again.progressPath = progressPath;
        again.editedLevelsPath = levelsPath;
        expect(!again.GetSetting("sound"));
        o2.FileSystem.FileDelete(progressPath);
    });
})();
