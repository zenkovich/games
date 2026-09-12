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
            var levels = data && data.levels ? data.levels : {};
            for (var key in levels)
            {
                var index = parseInt(key);
                if (index >= 0 && index < this._count && levels[key] && typeof levels[key] == "object")
                    this._edited[index] = levels[key];
            }
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
};
