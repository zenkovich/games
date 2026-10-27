include("Scripts/WordFall/WordFallGameService.js");

// Хранилище уровней: постоянные id и имена, правки по id, порядок кампании отдельно — уровни
// создаются, копируются, удаляются и переставляются, правки едут с уровнем; история правок
(function()
{
    var path = "wordfall_test_storage_levels.json";
    var source = function(index) { return { id: WordFallConfigs.LevelId(index), moves: 10 + index, words: ["ДОМ"] }; };

    test("LevelsHaveStableIdsAndNames", function()
    {
        var store = new WordFallLevelStore(source, 3);
        expectEq(store.GetId(0), "L001");
        expectEq(store.GetLevel(2).id, "L003");
        expectEq(store.GetTitle(1), "L002", "без имени — id");

        store.Rename(1, "  Первый лёд ");
        expectEq(store.GetName(1), "Первый лёд");
        expectEq(store.GetTitle(1), "Первый лёд");
        expect(store.IsEdited(1), "имя — правка уровня");
        expectEq(store.IndexOf("L002"), 1);
    });

    test("EditsFollowTheLevelWhenItMoves", function()
    {
        var store = new WordFallLevelStore(source, 4);
        var level = store.GetLevel(1);
        level.moves = 3;
        store.SetLevel(1, level);

        expectEq(store.MoveLevel(1, 3), 3);
        expectEq(store.GetOrder(), ["L001", "L003", "L004", "L002"]);
        expectEq(store.GetLevel(3).moves, 3, "правка переехала вместе с уровнем");
        expectEq(store.GetLevel(1).moves, 12, "на старом месте — следующий уровень");
        expect(store.IsStructureEdited());

        expectEq(store.MoveLevel(3, -5), 0, "перестановка в пределах кампании");
        expectEq(store.GetId(0), "L002");
    });

    test("CreateDuplicateAndRemoveLevels", function()
    {
        var store = new WordFallLevelStore(source, 3);
        var created = store.CreateLevel(1);
        expectEq(created, 1);
        expectEq(store.GetCount(), 4);
        expectEq(store.GetId(1), "L004", "новый id после самого большого");
        expect(store.IsNew(1) && store.IsEdited(1));
        expectEq(store.GetLevel(1).moves, WordFallConfigs.DefaultLevelConfig().moves, "новый уровень — по умолчанию");

        var level = store.GetLevel(3);
        level.name = "Финал";
        store.SetLevel(3, level);
        var copy = store.DuplicateLevel(3);
        expectEq(copy, 4);
        expectEq(store.GetId(4), "L005");
        expectEq(store.GetName(4), "Финал копия");
        expectEq(store.GetLevel(4).moves, store.GetLevel(3).moves, "копия с тем же содержимым");

        expect(store.RemoveLevel(1));
        expectEq(store.GetOrder(), ["L001", "L002", "L003", "L005"]);
        expectEq(store.IndexOf("L004"), -1);

        var single = new WordFallLevelStore(source, 1);
        expect(!single.RemoveLevel(0), "последний уровень не удаляется");
    });

    test("StructureAndEditsPersistById", function()
    {
        o2.FileSystem.FileDelete(path);
        var store = new WordFallLevelStore(source, 3);
        store.MoveLevel(0, 2);
        store.CreateLevel(0);
        store.Rename(0, "Новый");
        expect(store.Save(path));

        var saved = JSON.parse(o2.FileSystem.ReadFile(path));
        expectEq(saved.version, 2);
        expectEq(saved.order, ["L004", "L002", "L003", "L001"]);
        expectEq(Object.keys(saved.levels), ["L004"]);

        var reloaded = new WordFallLevelStore(source, 3);
        expect(reloaded.Load(path));
        expectEq(reloaded.GetOrder(), ["L004", "L002", "L003", "L001"]);
        expectEq(reloaded.GetName(0), "Новый");
        expectEq(reloaded.GetLevel(3).moves, 10, "исходный уровень на новом месте");

        var exported = JSON.parse(reloaded.ExportJson());
        expectEq(exported.map(function(level) { return level.id; }), ["L004", "L002", "L003", "L001"], "экспорт — в порядке кампании, с id");
        expectEq(exported[0].name, "Новый");

        // кампания из экспорта читается обратно с тем же составом
        var other = new WordFallLevelStore(source, 3);
        other.ImportJson(JSON.stringify(exported), 0);
        expectEq(other.GetOrder(), reloaded.GetOrder());
        expect(!other.IsEdited(1), "неизменённый уровень не стал правкой");
        o2.FileSystem.FileDelete(path);
    });

    test("OldEditsFileByIndexStillLoads", function()
    {
        o2.FileSystem.WriteFile(path, JSON.stringify({ levels: { "1": { moves: 4 }, "7": { moves: 1 } } }));
        var store = new WordFallLevelStore(source, 3);
        expect(store.Load(path));
        expectEq(store.GetLevel(1).moves, 4, "номер старого файла — уровень исходной кампании");
        expectEq(store.EditedCount(), 1, "правка вне кампании отброшена");
        expect(store.Save(path));
        expectEq(Object.keys(JSON.parse(o2.FileSystem.ReadFile(path)).levels), ["L002"], "после сохранения — по id");
        o2.FileSystem.FileDelete(path);
    });

    test("HistoryUndoesAndRedoesEditorStates", function()
    {
        var store = new WordFallLevelStore(source, 3);
        var history = new WordFallEditHistory(3);
        expect(!history.CanUndo() && !history.CanRedo());

        var edit = function(moves) {
            history.Push({ state: store.GetState(), index: 0 });
            var level = store.GetLevel(0);
            level.moves = moves;
            store.SetLevel(0, level);
        };
        edit(5);
        edit(6);
        history.Push({ state: store.GetState(), index: 2 });
        store.RemoveLevel(2);
        expectEq(store.GetCount(), 2);

        var back = history.Undo({ state: store.GetState(), index: 0 });
        store.SetState(back.state);
        expectEq(store.GetCount(), 3, "удаление отменено");
        expectEq(back.index, 2, "снимок помнит уровень правки");
        store.SetState(history.Undo({ state: store.GetState(), index: 0 }).state);
        expectEq(store.GetLevel(0).moves, 5);
        expect(history.CanRedo());

        store.SetState(history.Redo({ state: store.GetState(), index: 0 }).state);
        expectEq(store.GetLevel(0).moves, 6, "повтор");

        edit(7);
        expect(!history.CanRedo(), "новая правка сбрасывает повтор");
        edit(8);
        edit(9);
        expectEq(history.UndoCount(), 3, "глубина истории ограничена");

        history.Push({ state: store.GetState(), index: 0 });
        expectEq(history.UndoCount(), 3, "тот же снимок не дублируется");
    });

    test("ServiceExposesStructureAndEditorState", function()
    {
        o2.FileSystem.FileDelete(path);
        var service = new WordFallGameService();
        service.randomSeed = 42;
        service.campaignPath = "";
        service.campaignLength = 5;
        service.progressPath = "wordfall_test_storage_progress.json";
        service.editedLevelsPath = path;
        o2.FileSystem.FileDelete(service.progressPath);

        expectEq(service.GetLevelId(4), "L005");
        var state = service.GetEditorState();
        var at = service.DuplicateLevel(4);
        expectEq(at, 5);
        expectEq(service.GetLevelCount(), 6);
        expectEq(service.GetLevelId(5), "L006");
        expect(o2.FileSystem.IsFileExist(path), "структура сохранена");

        service.RenameLevel(5, "Копия");
        expectEq(service.GetLevelTitle(5), "Копия");
        expectEq(service.FindLevel("L006"), 5);

        service.SetEditorState(state);
        expectEq(service.GetLevelCount(), 5, "состояние редактора возвращается целиком");
        expect(!o2.FileSystem.IsFileExist(path), "без правок файла нет");
        o2.FileSystem.FileDelete(service.progressPath);
    });
})();
