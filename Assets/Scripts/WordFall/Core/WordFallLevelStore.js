include("Scripts/WordFall/Core/WordFallConfigs.js");

// Уровни кампании с правками редактора поверх: источник отдаёт исходный уровень по
// индексу, правки лежат в JSON-файле {"levels": {"<index>": <уровень в формате campaign.json>}}
WordFallLevelStore = class WordFallLevelStore
{
    constructor(source, count)
    {
        this._source = source;
        this._count = count;
        this._edited = {};
    }

    GetCount() { return this._count; }

    // Нормализованная копия уровня: правка редактора или исходный
    GetLevel(index)
    {
        var raw = this._edited[index] !== undefined ? this._edited[index] : this._source(index);
        return WordFallConfigs.NormalizeLevel(raw);
    }

    SetLevel(index, config) { this._edited[index] = WordFallConfigs.CompactLevel(config); }
    ResetLevel(index) { delete this._edited[index]; }
    IsEdited(index) { return this._edited[index] !== undefined; }
    EditedCount() { return Object.keys(this._edited).length; }

    Load(path)
    {
        this._edited = {};
        var text = o2.FileSystem.ReadFile(path);
        if (text === undefined)
            return false;

        try
        {
            var data = JSON.parse(text);
            this.ImportEdits(data && data.levels ? data.levels : {});
            return true;
        }
        catch (e)
        {
            print("WordFall: broken levels file " + path + ": " + e);
            return false;
        }
    }

    Save(path)
    {
        if (this.EditedCount() == 0)
        {
            o2.FileSystem.FileDelete(path);
            return true;
        }
        return o2.FileSystem.WriteFile(path, JSON.stringify({ levels: this._edited }, null, 4));
    }

    // Вся кампания с правками — текст в формате campaign.json
    ExportJson()
    {
        var levels = [];
        for (var i = 0; i < this._count; i++)
            levels.push(WordFallConfigs.CompactLevel(this.GetLevel(i)));
        return JSON.stringify(levels, null, 2);
    }

    // Один уровень — текст в формате campaign.json
    ExportLevelJson(index)
    {
        return JSON.stringify(WordFallConfigs.CompactLevel(this.GetLevel(index)), null, 2);
    }

    // Кампания целиком поверх исходной: правкой становится уровень, отличающийся от
    // исходного, прежние правки снимаются. Возвращает число правок
    ImportCampaign(levels)
    {
        this._edited = {};
        var count = Math.min(levels.length, this._count);
        for (var i = 0; i < count; i++)
        {
            var compact = WordFallConfigs.CompactLevel(levels[i]);
            if (JSON.stringify(compact) !== JSON.stringify(WordFallConfigs.CompactLevel(this._source(i))))
                this._edited[i] = compact;
        }
        return this.EditedCount();
    }

    // Правки из файла {"<index>": уровень} поверх кампании, прежние снимаются
    ImportEdits(levels)
    {
        this._edited = {};
        for (var key in levels)
        {
            var index = parseInt(key);
            if (index >= 0 && index < this._count && levels[key] && typeof levels[key] == "object")
                this._edited[index] = levels[key];
        }
        return this.EditedCount();
    }

    // Текст файла: кампания (массив уровней), правки редактора ({levels: ...}) или один
    // уровень — он ложится в позицию levelIndex. Возвращает {ok, count, message}
    ImportJson(text, levelIndex)
    {
        var data;
        try
        {
            data = JSON.parse(text);
        }
        catch (e)
        {
            return { ok: false, count: 0, message: "Файл не читается как JSON" };
        }

        if (Array.isArray(data))
        {
            if (data.length == 0)
                return { ok: false, count: 0, message: "В файле нет уровней" };

            var loaded = Math.min(data.length, this._count);
            var edits = this.ImportCampaign(data);
            return { ok: true, count: loaded, message: "Загружена кампания: уровней " + loaded + ", с правками " + edits };
        }

        if (data && typeof data == "object" && data.levels)
        {
            var count = this.ImportEdits(data.levels);
            return { ok: true, count: count, message: "Загружены правки редактора: уровней " + count };
        }

        if (WordFallLevelStore.LooksLikeLevel(data))
        {
            this.SetLevel(levelIndex, data);
            return { ok: true, count: 1, message: "Уровень " + (levelIndex + 1) + " загружен из файла" };
        }

        return { ok: false, count: 0, message: "Файл не похож на уровни Word Fall" };
    }

    static LooksLikeLevel(data)
    {
        if (!data || typeof data != "object")
            return false;

        var defaults = WordFallConfigs.DefaultLevelConfig();
        for (var key in defaults)
        {
            if (data[key] !== undefined)
                return true;
        }
        return false;
    }
};
