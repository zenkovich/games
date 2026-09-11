include("Scripts/WordFall/WordFallGameService.js");

// Сервис игры — API, которым пользуются вьюхи: состояние поля и задач, ходы,
// кампания из data-ассета, прогресс в файле
(function()
{
    var progressPath = "wordfall_test_service_progress.json";

    function MakeService(fields)
    {
        o2.FileSystem.FileDelete(progressPath);
        var service = new WordFallGameService();
        service.randomSeed = 42;
        service.progressPath = progressPath;
        for (var key in fields)
            service[key] = fields[key];
        return service;
    }

    test("ServiceGivesViewsTheBoardAndTakesTheirMoves", function()
    {
        var service = MakeService({ campaignPath: "" });
        service.StartLevel(0);

        expectEq(service.GetColumns(), 7);
        expectEq(service.GetRows(), 8);
        expectEq(service.GetGameState(), "playing");
        expectEq(service.GetLevelCount(), 100, "процедурная кампания");
        expect(service.GetTasks().length >= 1);

        service.DebugSetTile(0, 0, "К");
        expectEq(service.GetTile(0, 0).letter, "К");
        expectEq(service.GetTile(0, 0).value, 2);

        service.DebugSetTile(1, 0, "О");
        service.DebugSetTile(2, 0, "Т");
        var revision = service.GetRevision();
        expectEq(service.ToggleSelect(0, 0), "added");
        service.ToggleSelect(1, 0);
        service.ToggleSelect(2, 0);
        expect(service.GetRevision() > revision, "выбор двигает ревизию");
        expectEq(service.GetSelection(), [{ c: 0, r: 0 }, { c: 1, r: 0 }, { c: 2, r: 0 }]);
        expectEq(service.GetCurrentWord(), "КОТ");
        expect(service.IsCurrentWordValid());

        var move = service.AcceptWord();
        expect(move.ok);
        expectEq(move.spawned.length, 3);
        expectEq(move.state, "playing");
        expectEq(service.GetScore(), move.gain);
        expect(service.IsWordUsed("КОТ"));
        expectEq(service.GetLastMove().gain, move.gain);

        o2.FileSystem.FileDelete(progressPath);
    });

    test("MovesFeedTheCollapseModel", function()
    {
        var service = MakeService({ campaignPath: "" });
        service.StartLevel(0);
        for (var c = 0; c < 7; c++)
            for (var r = 0; r < 8; r++)
                service.DebugSetTile(c, r, "Щ");
        service.DebugSetTile(0, 0, "К");
        service.DebugSetTile(1, 0, "О");
        service.DebugSetTile(2, 0, "Т");
        service.ToggleSelect(0, 0);
        service.ToggleSelect(1, 0);
        service.ToggleSelect(2, 0);
        assert(service.AcceptWord().ok);

        service.StartCollapseAnimation();
        expect(service.IsCollapseAnimating());
        expect(service.GetTileFallOffset(0, 0) > 0, "плитка над сгоревшей буквой едет вниз");
        expect(service.IsTileFallHidden(0, 7), "спавн ещё за полем");

        for (var i = 0; i < 180; i++)
            service.Update(1/60);
        expect(!service.IsCollapseAnimating());
        expectEq(service.GetTileFallOffset(0, 0), 0);

        o2.FileSystem.FileDelete(progressPath);
    });

    test("CampaignComesFromTheDataAssetAndProgressPersists", function()
    {
        var service = MakeService({});
        expectEq(service.GetLevelCount(), 130, "кампания из campaign.json");
        expectEq(service.GetLevelIndex(), 0);

        service.DebugCompleteTasks();
        service.DebugAddScore(100000);
        expectEq(service.GetGameState(), "won");
        service.AdvanceToNextLevel();
        expectEq(service.GetLevelIndex(), 1);

        service.MarkTutorialSeen("basics");
        expect(service.IsTutorialSeen("basics"));

        // новый сервис продолжает с сохранённого места
        var restored = new WordFallGameService();
        restored.randomSeed = 42;
        restored.progressPath = progressPath;
        expectEq(restored.GetLevelIndex(), 0, "до старта уровень не выбран");
        restored.GetScore();
        expectEq(restored.GetLevelIndex(), 1);
        expect(restored.IsTutorialSeen("basics"));
        expect(restored.GetBestScore() == 0, "лучший счёт — у пройденного уровня");

        restored.ResetTutorials();
        expect(!restored.IsTutorialSeen("basics"));

        o2.FileSystem.FileDelete(progressPath);
    });

    test("BoostersAndCheatsChangeTheLevel", function()
    {
        var service = MakeService({ campaignPath: "" });
        service.StartLevel(3);

        var hints = service.GetBoosterCharges(WordLevel.Hint);
        expect(service.UseHint());
        expectEq(service.GetBoosterCharges(WordLevel.Hint), hints - 1);
        expect(service.GetSelection().length >= 3, "подсказка выбирает слово");

        var moves = service.GetMovesLeft();
        service.DebugAddMoves(5);
        expectEq(service.GetMovesLeft(), moves + 5);

        service.DebugAddCharges(2);
        expectEq(service.GetBoosterCharges(WordLevel.Hammer), 5);

        service.DebugSpawnRandomPowerup();
        var bonuses = 0;
        for (var c = 0; c < 7; c++)
            for (var r = 0; r < 8; r++)
                bonuses += service.GetTile(c, r).powerup ? 1 : 0;
        expect(bonuses >= 1, "чит кладёт бонус на поле");

        service.DebugLoseLevel();
        expectEq(service.GetGameState(), "lost");
        expectEq(service.ToggleSelect(0, 0), "blocked", "после поражения поле не кликается");

        service.RestartLevel();
        expectEq(service.GetGameState(), "playing");

        o2.FileSystem.FileDelete(progressPath);
    });
})();
