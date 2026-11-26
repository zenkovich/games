// Где живёт прогресс игрока. Без пути - в сохранении игрока o2libs.Saves, секция section: папка записи приложения,
// cookies в браузере и копия в Live-ops сервисе, которую видно и можно поправить на вкладке Saves портала. С путём
// (тесты, инструменты) или без модуля Saves - JSON-файл
WordFallProgressStore = class WordFallProgressStore
{
    constructor(path, section)
    {
        this.path = path || "";
        this.section = section || "wordfall";
    }

    static SavesAvailable() { return typeof o2libs !== "undefined" && !!o2libs.Saves; }

    IsPlayerSave() { return !this.path && WordFallProgressStore.SavesAvailable(); }

    // Читает прогресс; false - сохранения нет, это новый игрок
    Load(progress)
    {
        if (!this.IsPlayerSave())
            return progress.Load(this.path || WordFallProgressStore.LegacyPath);

        var data = o2libs.Saves.Get(this.section);
        if (data && typeof data == "object")
        {
            progress.FromData(data);
            return true;
        }

        // прогресс сборок до сохранений игрока лежал файлом рядом с игрой - переезжает один раз
        var legacy = WordFallProgressStore.LegacyPath;
        if (!progress.Load(legacy))
            return false;
        this.Save(progress);
        o2.FileSystem.FileDelete(legacy);
        print("WordFall: progress moved from " + legacy + " into the player's save");
        return true;
    }

    // Пишет сразу, не дожидаясь таймера модуля: закрытая вкладка или выгруженное приложение не теряют ход
    Save(progress)
    {
        if (!this.IsPlayerSave())
            return progress.Save(this.path || WordFallProgressStore.LegacyPath);

        o2libs.Saves.Set(this.section, progress.ToData());
        o2libs.Saves.Save();
        return true;
    }

    // Отправляет сохранение в сервис сейчас; callback(ok)
    Sync(callback)
    {
        if (!this.IsPlayerSave())
        {
            if (callback)
                callback(false);
            return;
        }
        o2libs.Saves.Sync(function(ok) { if (callback) callback(ok); });
    }

    // listener вызывается, когда сохранение заменила копия сервиса: правка на портале
    OnReplaced(listener)
    {
        if (this.IsPlayerSave())
            o2libs.Saves.OnReplaced(listener);
    }

    // Для читов: id игрока, по которому сохранение ищется на портале, и состояние синхронизации
    Status()
    {
        if (!this.IsPlayerSave())
            return { player: "", cloud: false, revision: 0, unsynced: false, file: this.path || WordFallProgressStore.LegacyPath };

        var saves = o2libs.Saves;
        var call = function(name, fallback) { return typeof saves[name] == "function" ? saves[name]() : fallback; };
        return { player: saves.GetPlayerId(), cloud: call("IsCloudEnabled", true), revision: call("GetRevision", -1),
                 unsynced: call("HasUnsyncedChanges", false), file: "" };
    }
};

WordFallProgressStore.LegacyPath = "wordfall_progress.json";
