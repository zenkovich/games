include("Scripts/WordFall/Core/WordFallConfigs.js");

// Хранилище уровней кампании: у каждого уровня постоянный id и имя, правки и новые уровни
// хранятся по id, порядок кампании — отдельным списком. Поэтому уровни можно добавлять,
// копировать, удалять и переставлять — правки едут вместе с уровнем, а не с его номером.
// Файл правок: {"version": 2, "order": [id...] (если порядок менялся), "levels": {id: уровень}};
// старый файл {"levels": {"<номер>": уровень}} читается по номерам исходной кампании
WordFallLevelStore = class WordFallLevelStore
{
    // source(index) — исходный уровень кампании; ids — их идентификаторы (по умолчанию L001...)
    constructor(source, count, ids)
    {
        this._source = source;
        this._sourceIds = [];
        this._sourceIndex = {};
        for (var i = 0; i < count; i++)
        {
            var id = ids && ids[i] ? ids[i] : WordFallConfigs.LevelId(i);
            this._sourceIds.push(id);
            this._sourceIndex[id] = i;
        }
        this._order = this._sourceIds.slice();
        this._edited = {};
    }

    GetCount() { return this._order.length; }
    GetId(index) { return this._order[index] || ""; }
    IndexOf(id) { return this._order.indexOf(id); }
    GetOrder() { return this._order.slice(); }

    // Нормализованная копия уровня: правка или исходный; id всегда свой
    GetLevel(index)
    {
        var id = this._order[index];
        if (id === undefined)
            return WordFallConfigs.DefaultLevelConfig();

        var raw = this._edited[id] !== undefined ? this._edited[id] : this._RawSource(id);
        var level = WordFallConfigs.NormalizeLevel(raw);
        level.id = id;
        return level;
    }

    GetName(index) { return this.GetLevel(index).name; }
    GetTitle(index) { return WordFallConfigs.LevelTitle(this.GetLevel(index)); }

    SetLevel(index, config)
    {
        var id = this._order[index];
        if (id === undefined)
            return;

        var compact = WordFallConfigs.CompactLevel(config);
        compact.id = id;
        this._edited[id] = compact;
    }

    Rename(index, name)
    {
        var level = this.GetLevel(index);
        level.name = (name || "").trim();
        this.SetLevel(index, level);
    }

    // Исходный уровень вместо правки; у нового уровня исходного нет — он становится пустым
    ResetLevel(index)
    {
        var id = this._order[index];
        if (id === undefined)
            return;

        if (this.IsNew(index))
            this._edited[id] = { id: id };
        else
            delete this._edited[id];
    }

    IsNew(index) { return this._sourceIndex[this._order[index]] === undefined; }

    IsEdited(index)
    {
        var id = this._order[index];
        if (id === undefined || this._edited[id] === undefined)
            return false;
        if (this.IsNew(index))
            return true;
        return JSON.stringify(this._Compact(this._edited[id], id)) !== JSON.stringify(this._Compact(this._RawSource(id), id));
    }

    // Порядок или состав кампании отличается от исходного
    IsStructureEdited() { return JSON.stringify(this._order) !== JSON.stringify(this._sourceIds); }

    EditedCount()
    {
        var count = 0;
        for (var i = 0; i < this._order.length; i++)
            count += this.IsEdited(i) ? 1 : 0;
        return count;
    }

    // Новый уровень на месте index (по умолчанию в конце); возвращает его номер
    CreateLevel(index, config)
    {
        var at = index === undefined || index < 0 || index > this._order.length ? this._order.length : index;
        var id = this._FreeId();
        var level = WordFallConfigs.NormalizeLevel(config || WordFallConfigs.DefaultLevelConfig());
        level.id = id;
        this._order.splice(at, 0, id);
        this.SetLevel(at, level);
        return at;
    }

    // Копия уровня сразу за ним, с новым id и пометкой в имени
    DuplicateLevel(index)
    {
        if (this._order[index] === undefined)
            return -1;

        var level = this.GetLevel(index);
        level.name = (level.name || level.id) + " копия";
        return this.CreateLevel(index + 1, level);
    }

    // Убирает уровень из кампании; последний уровень не удаляется
    RemoveLevel(index)
    {
        var id = this._order[index];
        if (id === undefined || this._order.length <= 1)
            return false;

        this._order.splice(index, 1);
        if (this._sourceIndex[id] === undefined)
            delete this._edited[id];
        return true;
    }

    // Переставляет уровень на место to; возвращает его новый номер
    MoveLevel(index, to)
    {
        var id = this._order[index];
        if (id === undefined)
            return index;

        var target = Math.min(Math.max(to, 0), this._order.length - 1);
        this._order.splice(index, 1);
        this._order.splice(target, 0, id);
        return target;
    }

    // Снимок правок и порядка — для отмены и повтора в редакторе
    GetState() { return JSON.stringify({ order: this._order, levels: this._edited }); }

    SetState(text)
    {
        var state = JSON.parse(text);
        this._order = state.order.slice();
        this._edited = state.levels;
    }

    Load(path)
    {
        this._order = this._sourceIds.slice();
        this._edited = {};
        var text = o2.FileSystem.ReadFile(path);
        if (text === undefined)
            return false;

        try
        {
            this._ReadEdits(JSON.parse(text));
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
        var data = { version: 2, levels: {} };
        if (this.IsStructureEdited())
            data.order = this._order.slice();
        for (var i = 0; i < this._order.length; i++)
        {
            if (this.IsEdited(i))
                data.levels[this._order[i]] = this._edited[this._order[i]];
        }

        if (!data.order && Object.keys(data.levels).length == 0)
        {
            o2.FileSystem.FileDelete(path);
            return true;
        }
        return o2.FileSystem.WriteFile(path, JSON.stringify(data, null, 4));
    }

    // Вся кампания с правками — текст в формате campaign.json, у каждого уровня id
    ExportJson()
    {
        var levels = [];
        for (var i = 0; i < this._order.length; i++)
            levels.push(this._Compact(this.GetLevel(i), this._order[i]));
        return JSON.stringify(levels, null, 2);
    }

    ExportLevelJson(index)
    {
        return JSON.stringify(this._Compact(this.GetLevel(index), this._order[index]), null, 2);
    }

    // Кампания целиком: порядок и состав из файла. Уровень без id получает id уровня с тем же
    // номером; правкой становится только отличие от исходного. Возвращает число правок
    ImportCampaign(levels)
    {
        this._order = [];
        this._edited = {};
        var used = {};
        for (var i = 0; i < levels.length; i++)
        {
            var level = levels[i] || {};
            var id = level.id && !used[level.id] ? level.id : (this._sourceIds[i] && !used[this._sourceIds[i]] ? this._sourceIds[i] : "");
            if (!id)
                id = this._FreeId();
            used[id] = true;
            this._order.push(id);
            this.SetLevel(this._order.length - 1, level);
            if (!this.IsEdited(this._order.length - 1))
                delete this._edited[id];
        }
        if (this._order.length == 0)
            this._order = this._sourceIds.slice();
        return this.EditedCount();
    }

    // Правки из файла поверх кампании, прежние снимаются
    ImportEdits(data)
    {
        this._order = this._sourceIds.slice();
        this._edited = {};
        this._ReadEdits(data);
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

            var edits = this.ImportCampaign(data);
            return { ok: true, count: data.length, message: "Загружена кампания: уровней " + data.length + ", с правками " + edits };
        }

        if (data && typeof data == "object" && data.levels)
        {
            var count = this.ImportEdits(data);
            return { ok: true, count: count, message: "Загружены правки редактора: уровней " + count };
        }

        if (WordFallLevelStore.LooksLikeLevel(data))
        {
            var level = WordFallConfigs.NormalizeLevel(data);
            var keepName = level.name || this.GetName(levelIndex);
            level.name = keepName;
            this.SetLevel(levelIndex, level);
            return { ok: true, count: 1, message: "Уровень " + this.GetId(levelIndex) + " загружен из файла" };
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

    _ReadEdits(data)
    {
        var levels = data && data.levels && typeof data.levels == "object" ? data.levels : {};
        if (data && Array.isArray(data.order) && data.order.length > 0)
            this._order = data.order.filter(function(id, i, list) { return typeof id == "string" && id && list.indexOf(id) == i; });

        for (var key in levels)
        {
            var level = levels[key];
            if (!level || typeof level != "object")
                continue;

            // старый формат: ключ — номер уровня исходной кампании
            var id = data.version >= 2 ? key : (/^[0-9]+$/.test(key) ? this._sourceIds[parseInt(key)] : key);
            if (!id || (this._sourceIndex[id] === undefined && this._order.indexOf(id) < 0))
                continue;

            var compact = JSON.parse(JSON.stringify(level));
            compact.id = id;
            this._edited[id] = compact;
        }
    }

    _RawSource(id)
    {
        var index = this._sourceIndex[id];
        return index === undefined ? { id: id } : this._source(index);
    }

    _Compact(raw, id)
    {
        var level = WordFallConfigs.NormalizeLevel(raw);
        level.id = id;
        var compact = WordFallConfigs.CompactLevel(level);
        // id первым полем: файл кампании читается глазами
        var ordered = { id: id };
        for (var key in compact)
        {
            if (key != "id")
                ordered[key] = compact[key];
        }
        return ordered;
    }

    // Следующий свободный L### после самого большого номера кампании
    _FreeId()
    {
        var max = 0;
        var all = this._order.concat(this._sourceIds).concat(Object.keys(this._edited));
        for (var i = 0; i < all.length; i++)
        {
            var match = /^L([0-9]+)$/.exec(all[i] || "");
            if (match)
                max = Math.max(max, parseInt(match[1]));
        }
        return WordFallConfigs.LevelId(max);
    }
};
