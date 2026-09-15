include("Scripts/WordFall/WordFallGameService.js");

// Редактор уровней: черновик клеток и параметров, заданные буквы на поле, правки поверх
// кампании с сохранением в файл и экспортом в формат campaign.json
(function()
{
    var dictionary = WordDictionary.LoadDefault();
    var boardConfig = WordFallConfigs.DefaultBoardConfig();
    var levelsPath = "wordfall_test_editor_levels.json";

    function SortCells(list)
    {
        return list.slice().sort(function(a, b) { return a.c != b.c ? a.c - b.c : a.r - b.r; });
    }

    test("DraftToolsKeepOneKindPerCell", function()
    {
        var draft = new WordFallLevelDraft(WordFallConfigs.DefaultLevelConfig(), 7, 8);
        var cell = { c: 2, r: 3 };

        expectEq(draft.Apply("ice", cell), "changed");
        expectEq(draft.GetCell(cell).overlay, "ice");
        draft.Apply("ice", cell);
        expectEq(draft.GetCell(cell).overlay, "", "тот же инструмент снимает");

        draft.SetLetter(cell, "К");
        draft.Apply("stone", cell);
        expectEq(draft.GetCell(cell).letter, "К", "накладка не трогает букву");
        draft.Apply("crate", cell);
        expectEq(draft.GetCell(cell), { hole: false, letter: "", overlay: "", crate: 1, item: "" }, "ящик занимает клетку целиком");
        draft.Apply("crate", cell);
        draft.Apply("crate", cell);
        expectEq(draft.GetCell(cell).crate, 3);
        draft.Apply("crate", cell);
        expectEq(draft.GetCell(cell).crate, 0, "после третьей прочности ящик снимается");

        draft.Apply("bomb", cell);
        expectEq(draft.GetCell(cell).item, "bomb");
        draft.Apply("rocket", cell);
        expectEq(draft.GetCell(cell).item, "rocket", "другой бонус заменяет");
        draft.Apply("rocket", cell);
        expectEq(draft.GetCell(cell).item, "");

        draft.Apply("snow", cell);
        expectEq(draft.Apply("removeCell", cell), "changed");
        expectEq(draft.GetCell(cell), { hole: true, letter: "", overlay: "", crate: 0, item: "" });
        expectEq(draft.CountPlayable(), 55);
        expectEq(draft.Apply("removeCell", cell), "", "дыра уже есть — менять нечего");
        expectEq(draft.Apply("addCell", cell), "changed");
        expectEq(draft.GetCell(cell), { hole: false, letter: "", overlay: "", crate: 0, item: "" }, "клетка вернулась пустой");
        expectEq(draft.Apply("addCell", cell), "", "клетка уже есть — менять нечего");
        draft.Apply("removeCell", cell);
        draft.Apply("ice", cell);
        expectEq(draft.GetCell(cell), { hole: false, letter: "", overlay: "ice", crate: 0, item: "" }, "инструмент содержимого тоже возвращает клетку");

        expectEq(draft.Apply("letter", cell), "palette", "букву выбирает палитра");
        draft.Apply("chain", cell);
        draft.Apply("erase", cell);
        expectEq(draft.GetCell(cell), { hole: false, letter: "", overlay: "", crate: 0, item: "" });
        expectEq(draft.Apply("ice", { c: 9, r: 9 }), "", "вне поля ничего не меняется");
    });

    test("DraftLetterDropsItemsAndKeepsOverlay", function()
    {
        var draft = new WordFallLevelDraft(WordFallConfigs.DefaultLevelConfig(), 7, 8);
        var cell = { c: 0, r: 0 };
        draft.Apply("parcel", cell);
        draft.SetLetter(cell, "Ж");
        expectEq(draft.GetCell(cell), { hole: false, letter: "Ж", overlay: "", crate: 0, item: "" });

        draft.Apply("ice", cell);
        draft.SetLetter(cell, "Щ");
        expectEq(draft.GetCell(cell).overlay, "ice");
        expectEq(draft.GetCell(cell).letter, "Щ");
        draft.ClearLetter(cell);
        expectEq(draft.GetCell(cell).letter, "");
        expectEq(draft.GetCell(cell).overlay, "ice", "случайная буква под льдом");
    });

    test("DraftParamsClampAndChargesCycle", function()
    {
        var draft = new WordFallLevelDraft(WordFallConfigs.DefaultLevelConfig(), 7, 8);
        draft.SetMoves(0);
        expectEq(draft.moves, 1);
        draft.SetTargetScore(3);
        expectEq(draft.targetScore, 10);
        draft.SetExtraVowels(-2);
        expectEq(draft.extraVowels, 0);
        draft.SetExtraRare(99);
        expectEq(draft.extraRare, 30);

        draft.SetBoosterCharge(2, 3);
        draft.CycleBoosterCharge(2);
        expectEq(draft.boosterCharges[2], 5);
        draft.SetBoosterCharge(2, 30);
        draft.CycleBoosterCharge(2);
        expectEq(draft.boosterCharges[2], 0, "после последней ступени — ноль");
    });

    test("DraftEditsTasks", function()
    {
        var draft = new WordFallLevelDraft(WordFallConfigs.DefaultLevelConfig(), 7, 8);
        expectEq(draft.AddTask(), 0);
        expectEq(draft.tasks[0], WordFallConfigs.MakeTask({ taskType: "AnyWords", count: 3 }), "новая задача — собрать 3 слова");

        draft.CycleTaskType(0);
        expectEq(draft.tasks[0].taskType, "WordScore");
        draft.SetTaskScore(0, 1);
        expectEq(draft.tasks[0].scoreThreshold, 2);

        draft.SetTaskType(0, "Powerup");
        expectEq(draft.tasks[0].powerupKind, "bomb", "бонусу нужен вид");
        draft.CycleTaskPowerupKind(0);
        draft.CycleTaskPowerupKind(0);
        draft.CycleTaskPowerupKind(0);
        expectEq(draft.tasks[0].powerupKind, "bomb", "виды по кругу");
        draft.SetTaskType(0, "Unknown");
        expectEq(draft.tasks[0].taskType, "Powerup", "неизвестный тип не ставится");

        draft.SetTaskType(0, "Word");
        draft.SetTaskWord(0, "кот");
        expectEq(draft.tasks[0].word, "КОТ");
        draft.SetTaskType(0, "Letter");
        draft.SetTaskLetter(0, "ж");
        expectEq(draft.tasks[0].letter, "Ж");
        draft.SetTaskCount(0, 99);
        expectEq(draft.tasks[0].count, 20);
        draft.SetTaskLength(0, 1);
        expectEq(draft.tasks[0].length, 2);

        draft.AddTask({ taskType: "Word", word: "ДОМ" });
        expectEq(draft.ToConfig().tasks.length, 2);
        expectEq(draft.ToConfig().tasks[1].word, "ДОМ");
        draft.RemoveTask(0);
        expectEq(draft.tasks.length, 1);
        expectEq(draft.tasks[0].word, "ДОМ");

        while (draft.AddTask() >= 0) {}
        expectEq(draft.tasks.length, WordFallLevelDraft.TaskLimit, "лимит задач");
        draft.RemoveTask(9);
        expectEq(draft.tasks.length, WordFallLevelDraft.TaskLimit, "вне списка ничего не удаляется");
    });

    test("DraftRoundTripsTheLevelConfig", function()
    {
        var config = WordFallConfigs.DefaultLevelConfig();
        config.moves = 7;
        config.targetScore = 330;
        config.extraVowels = 2;
        config.boosterCharges = [1, 0, 30, 3, 5];
        config.holeCells = [{ c: 0, r: 0 }, { c: 6, r: 7 }];
        config.iceCells = [{ c: 1, r: 1 }];
        config.stoneCells = [{ c: 2, r: 2 }];
        config.chainCells = [{ c: 3, r: 3 }];
        config.crateCells = [{ c: 4, r: 4 }, { c: 4, r: 5 }];
        config.crateGrades = [3, 1];
        config.snowCells = [{ c: 5, r: 5 }];
        config.parcelCells = [{ c: 5, r: 6 }];
        config.powerupCells = [{ c: 6, r: 5 }, { c: 6, r: 6 }]; // параллельные списки: в порядке обхода черновика
        config.powerupKinds = ["fireworks", "bomb"];
        config.letterCells = [{ c: 1, r: 1, letter: "Ю" }, { c: 3, r: 0, letter: "Д" }];
        config.tasks = [WordFallConfigs.MakeWord("ДОМ"), WordFallConfigs.MakeLetter("Т", 3)];

        var draft = new WordFallLevelDraft(config, 7, 8);
        var restored = draft.ToConfig();
        for (var key in config)
        {
            if (key.endsWith("Cells"))
                expectEq(SortCells(restored[key]), SortCells(config[key]), key);
            else
                expectEq(restored[key], config[key], key);
        }
        expectEq(draft.GetCell({ c: 1, r: 1 }), { hole: false, letter: "Ю", overlay: "ice", crate: 0, item: "" }, "буква под льдом");
    });

    test("NormalizeAndCompactKeepLetterCells", function()
    {
        var level = WordFallConfigs.NormalizeLevel({ letterCells: [{ x: 2, y: 5, letter: "Ф" }, { c: 1, r: 0, letter: "А" }, { x: 0, y: 0 }] });
        expectEq(level.letterCells, [{ c: 2, r: 5, letter: "Ф" }, { c: 1, r: 0, letter: "А" }], "оба формата клеток, без буквы — нет");

        var compact = WordFallConfigs.CompactLevel(level);
        expectEq(Object.keys(compact), ["letterCells"], "только отличия от умолчаний");
        expectEq(compact.letterCells[0], { x: 2, y: 5, letter: "Ф" });
        expectEq(WordFallConfigs.NormalizeLevel(compact), level);

        var withTasks = WordFallConfigs.NormalizeLevel({ tasks: [{ word: "КОТ" }, { taskType: "Length", length: 4, count: 2 }] });
        var compactTasks = WordFallConfigs.CompactLevel(withTasks).tasks;
        expectEq(compactTasks, [{ word: "КОТ" }, { taskType: "Length", count: 2 }], "поля заданий по умолчанию опущены");
        expectEq(WordFallConfigs.NormalizeLevel({ tasks: compactTasks }).tasks, withTasks.tasks);
    });

    test("BoardFillPlacesPresetLettersAndSeedsAround", function()
    {
        var config = WordFallConfigs.DefaultLevelConfig();
        config.letterCells = [{ c: 0, r: 0, letter: "Щ" }, { c: 3, r: 4, letter: "Ф" }, { c: 6, r: 7, letter: "Ж" }];
        config.iceCells = [{ c: 3, r: 4 }];
        config.holeCells = [{ c: 6, r: 7 }];
        config.tasks = [WordFallConfigs.MakeWord("КОТ")];

        for (var seed = 1; seed <= 5; seed++)
        {
            var level = new WordLevel();
            level.Start(config, boardConfig, dictionary, seed);
            var board = level.GetBoard();
            expectEq(board.GetTile({ c: 0, r: 0 }).letter, "Щ", "сид " + seed);
            expectEq(board.GetTile({ c: 0, r: 0 }).value, 5);
            expectEq(board.GetTile({ c: 3, r: 4 }).letter, "Ф", "буква под льдом");
            expectEq(board.GetTile({ c: 3, r: 4 }).ice, 1);
            expect(board.IsHole({ c: 6, r: 7 }), "дыра важнее буквы");
            var seeded = board.GetSeededCells();
            expectEq(seeded.length, 3, "слово задания посеяно");
            expect(!WordFallCells.Contains(seeded, { c: 0, r: 0 }) && !WordFallCells.Contains(seeded, { c: 3, r: 4 }), "сид обходит заданные буквы");
        }
    });

    test("StoreKeepsEditsOverTheSourceAndPersistsThem", function()
    {
        o2.FileSystem.FileDelete(levelsPath);
        var source = function(index) { return { moves: 10 + index, tasks: [{ word: "ДОМ" }] }; };
        var store = new WordFallLevelStore(source, 5);
        expectEq(store.GetCount(), 5);
        expectEq(store.GetLevel(2).moves, 12);

        var edited = store.GetLevel(2);
        edited.moves = 3;
        edited.letterCells = [{ c: 1, r: 1, letter: "Я" }];
        store.SetLevel(2, edited);
        expect(store.IsEdited(2));
        expectEq(store.GetLevel(2).moves, 3);
        expectEq(store.GetLevel(1).moves, 11, "соседний уровень не тронут");
        expect(store.Save(levelsPath));

        var reloaded = new WordFallLevelStore(source, 5);
        expect(reloaded.Load(levelsPath));
        expect(reloaded.IsEdited(2));
        expectEq(reloaded.GetLevel(2).letterCells, [{ c: 1, r: 1, letter: "Я" }]);

        var exported = JSON.parse(reloaded.ExportJson());
        expectEq(exported.length, 5);
        expectEq(exported[2].moves, 3);
        expectEq(exported[2].letterCells, [{ x: 1, y: 1, letter: "Я" }]);
        expectEq(exported[1], { moves: 11, tasks: [{ word: "ДОМ" }] }, "формат campaign.json");

        reloaded.ResetLevel(2);
        expect(!reloaded.IsEdited(2));
        expectEq(reloaded.GetLevel(2).moves, 12);
        expect(reloaded.Save(levelsPath));
        expect(!o2.FileSystem.IsFileExist(levelsPath), "без правок файла нет");
    });

    test("StoreImportsCampaignEditsAndSingleLevelsFromText", function()
    {
        var source = function(index) { return { moves: 10 + index, tasks: [{ word: "ДОМ" }] }; };
        var store = new WordFallLevelStore(source, 3);

        var level = JSON.parse(store.ExportLevelJson(1));
        expectEq(level, { moves: 11, tasks: [{ word: "ДОМ" }] }, "уровень в формате campaign.json");

        expectEq(store.ImportJson("not json", 0).ok, false);
        expectEq(store.ImportJson("[]", 0).ok, false, "пустая кампания");
        expectEq(store.ImportJson(JSON.stringify({ foo: 1 }), 0).ok, false, "не уровень");

        var one = store.ImportJson(JSON.stringify({ moves: 4, letterCells: [{ x: 1, y: 2, letter: "Ю" }] }), 2);
        expect(one.ok);
        expectEq(one.count, 1);
        expectEq(store.GetLevel(2).moves, 4, "одиночный уровень ложится по индексу");
        expectEq(store.GetLevel(2).letterCells, [{ c: 1, r: 2, letter: "Ю" }]);

        var tasks = [{ word: "ДОМ" }];
        var campaign = [{ moves: 10, tasks: tasks }, { moves: 99, tasks: tasks }, { moves: 12, tasks: tasks }, { moves: 1 }];
        var whole = store.ImportJson(JSON.stringify(campaign), 0);
        expect(whole.ok);
        expectEq(whole.count, 3, "лишние уровни файла отброшены");
        expect(!store.IsEdited(0) && store.IsEdited(1) && !store.IsEdited(2), "правкой становится только отличие от исходного");
        expectEq(store.GetLevel(1).moves, 99);

        var edits = store.ImportJson(JSON.stringify({ levels: { "0": { moves: 7 }, "9": { moves: 1 } } }), 0);
        expect(edits.ok);
        expectEq(edits.count, 1, "правка вне кампании отброшена");
        expectEq(store.GetLevel(0).moves, 7);
        expect(!store.IsEdited(1), "прежние правки сняты");
    });

    test("ServiceStartsEditedLevelsAndRemembersThem", function()
    {
        o2.FileSystem.FileDelete(levelsPath);
        var service = new WordFallGameService();
        service.randomSeed = 42;
        service.campaignPath = "";
        service.progressPath = "wordfall_test_editor_progress.json";
        service.editedLevelsPath = levelsPath;
        o2.FileSystem.FileDelete(service.progressPath);

        var config = service.GetLevelConfig(1);
        config.moves = 4;
        config.letterCells = [{ c: 2, r: 2, letter: "Ъ" }];
        config.holeCells = [{ c: 0, r: 0 }];
        service.SetLevelConfig(1, config);
        expect(service.IsLevelEdited(1));
        expect(!service.IsLevelEdited(0));

        service.StartLevel(1);
        expectEq(service.GetMovesLeft(), 4);
        expectEq(service.GetTile(2, 2).letter, "Ъ");
        expect(service.GetTile(0, 0).hole);

        var restored = new WordFallGameService();
        restored.randomSeed = 42;
        restored.campaignPath = "";
        restored.progressPath = service.progressPath;
        restored.editedLevelsPath = levelsPath;
        expectEq(restored.GetLevelConfig(1).moves, 4, "правка пережила перезапуск");
        expectEq(restored.GetLevelCount(), 100, "длина кампании прежняя");

        restored.ResetLevelConfig(1);
        expect(!restored.IsLevelEdited(1));
        o2.FileSystem.FileDelete(service.progressPath);
        o2.FileSystem.FileDelete(levelsPath);
    });
})();
