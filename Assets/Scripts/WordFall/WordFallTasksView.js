globalThis.WordFallGame = globalThis.WordFallGame || {};

// Вьюха целей уровня: сверху — панель слов (ряд плашек на слово; найденное — оранжевое,
// набираемый префикс — в синей рамке; не влезающие слова сводятся в последний ряд «ещё N»),
// под ней — полоса прочих задач: плашка + счётчик, закрытая — с галочкой, за ними гнездо со
// звездой и галочка, которая загорается, когда закрыто всё. Синк по ревизии сервиса.
// Координаты раскладки — локальные, от левого верхнего угла панели / полосы, y вниз

WordFallTasksView = class WordFallTasksView extends o2.Component
{
    get _svc() { return WordFallGame.service; }

    constructor()
    {
        super();
        this.wordTile = 70;        // плашка буквы слова
        this.wordTileAspect = 1;   // её высота к ширине
        this.wordPitchX = 74.5;
        this.wordPitchY = 68.5;
        this.wordOriginX = 4;
        this.wordOriginY = 4;
        this.wordsWidth = 518;     // ширина ряда слов внутри панели
        this.itemIcon = 77;        // плашка задачи в полосе
        this.itemCount = 86;       // место под счётчик
        this.itemGap = 20;         // промежутки полосы
        this.itemFirst = 20;       // отступ первой плашки
        this.slotSize = [80, 80];  // гнездо со звездой и галочка «всё закрыто» — за задачами
        this.checkSize = [80, 80];
        this.stripWidth = 744;
        this.stripHeight = 135;
        this.countRaise = 0;       // подъём счётчика: o2 центрирует высоту заглавной, вёрстка — строку

        this._lastRevision = -1;
        this._words = [];
        this._items = [];
    }

    // Картинка-иконка задачи (буквенные задачи рисуются плашкой с символом)
    static IconFor(task)
    {
        switch (task.type)
        {
            case "powerup": return "WordFall/Sprites/powerup_" + (task.kind == "rocket" ? "rocket" : task.kind == "fireworks" ? "fireworks" : "bomb") + ".png";
            case "clearIce": return "WordFall/Sprites/ui_ice.png";
            case "crates": return "WordFall/Sprites/ui_crate.png";
            case "deliver": return "WordFall/Sprites/ui_envelope.png";
            case "melt": return "WordFall/Sprites/ui_snowball.png";
            case "anyWords": return "WordFall/SpritesNew/layer_rainbow_star.png";
        }
        return "";
    }

    // Символ на плашке задачи и счётчик рядом
    static SymbolFor(task)
    {
        switch (task.type)
        {
            case "letter": return task.letter || "?";
            case "length": return "" + task.length;
            case "wordScore": return task.score + "+";
        }
        return "";
    }

    static CountFor(task)
    {
        if (task.type == "clearIce" || task.type == "crates")
            return "×" + (task.remaining || 0);
        if (task.type == "wordScore")
            return task.done ? "1/1" : "0/1";
        return task.progress + "/" + task.count;
    }

    OnStart()
    {
        globalThis.WordFallViews = globalThis.WordFallViews || {};
        WordFallViews.tasks = this;

        var words = this._actor.GetChild("Words");
        this._more = words.GetChild("More");
        this._words = [];
        for (var r = 0; r < 4; r++)
        {
            var row = [];
            for (var i = 0; i < 8; i++)
            {
                var tile = words.GetChild("W" + r + "_" + i);
                row.push({
                    widget: tile,
                    back: tile.GetLayer("back"),
                    found: tile.GetLayer("found"),
                    active: tile.GetLayer("active"),
                    letter: tile.GetLayer("letter").drawable,
                    points: tile.GetLayer("points").drawable
                });
            }
            this._words.push(row);
        }

        var others = this._actor.GetChild("Others");
        this._check = others.GetChild("AllDone");
        this._slot = others.GetChild("Slot");
        this._items = [];
        for (var i = 0; i < 5; i++)
        {
            var item = others.GetChild("Item" + i);
            var icon = item.GetChild("Icon");
            this._items.push({
                widget: item,
                icon: icon,
                tile: icon.GetLayer("back"),
                image: icon.GetLayer("image"),
                symbol: icon.GetLayer("letter").drawable,
                count: item.GetChild("Count"),
                done: item.GetChild("Done"),
                imagePath: ""
            });
        }
    }

    // Какие слова видны: все, если влезают; иначе сначала ненайденные, а последний ряд — «ещё N»
    static VisibleWords(words, rows)
    {
        if (words.length <= rows)
            return { shown: words.slice(), hidden: 0 };

        var ordered = words.filter(function(w) { return !w.found; }).concat(words.filter(function(w) { return w.found; }));
        return { shown: ordered.slice(0, rows - 1), hidden: words.length - (rows - 1) };
    }

    _SetRect(widget, x, y, w, h)
    {
        var layout = widget.GetLayout();
        layout.SetAnchorMin(new Vec2(0, 1));
        layout.SetAnchorMax(new Vec2(0, 1));
        layout.SetOffsetMin(new Vec2(x, -(y + h)));
        layout.SetOffsetMax(new Vec2(x + w, -y));
    }

    _SyncWords(words, current)
    {
        var rows = this._words.length;
        var visible = WordFallTasksView.VisibleWords(words, rows);
        for (var r = 0; r < rows; r++)
        {
            var word = r < visible.shown.length ? visible.shown[r] : null;
            var tiles = this._words[r];
            var length = word ? word.word.length : 0;
            var pitch = length > 1 ? Math.min(this.wordPitchX, (this.wordsWidth - this.wordTile)/(length - 1)) : this.wordPitchX;
            var size = Math.min(this.wordTile, pitch);
            var active = word && !word.found && current.length > 0 && current.length <= length &&
                         WordDictionary.MatchPattern(current, word.word.substring(0, current.length));
            var states = word ? WordFallTasksView.LetterStates(word, active ? current.length : 0) : "";
            for (var i = 0; i < tiles.length; i++)
            {
                var view = tiles[i];
                var on = i < length;
                view.widget.SetEnabled(on);
                if (!on)
                    continue;

                var letter = word.word[i];
                this._SetRect(view.widget, this.wordOriginX + i*pitch, this.wordOriginY + r*this.wordPitchY, size, size*this.wordTileAspect);
                view.letter.text = letter;
                view.points.text = word.values ? word.values.charAt(i) : "" + this._svc.GetLetterValue(letter);
                var state = states.charAt(i);
                view.found.SetEnabled(state == "f");
                view.active.SetEnabled(state == "a");
                view.back.SetEnabled(state == "n");
            }
        }

        this._more.SetEnabled(visible.hidden > 0);
        if (visible.hidden > 0)
        {
            this._more.SetText("ещё " + visible.hidden + " " + WordFallConfigs.WordsNoun(visible.hidden));
            this._SetRect(this._more, this.wordOriginX, this.wordOriginY + (rows - 1)*this.wordPitchY, this.wordsWidth, this.wordTile*this.wordTileAspect);
        }
    }

    // Состояния букв слова: n — обычная, f — найдена, a — в наборе (префикс из typed букв);
    // у слова мока (макет экрана) они заданы явно
    static LetterStates(word, typed)
    {
        if (word.states)
            return word.states;
        var states = "";
        for (var i = 0; i < word.word.length; i++)
            states += word.found ? "f" : i < typed ? "a" : "n";
        return states;
    }

    // Полоса как в вёрстке: плашка, счётчик, ..., гнездо со звездой, галочка — подряд с равными
    // промежутками; задачи, которые не влезают, ужимаются целиком: плашка, счётчик и его текст
    _SyncTasks(tasks, allDone)
    {
        var count = Math.min(tasks.length, this._items.length);
        var room = this.stripWidth - 2*this.itemFirst - this.slotSize[0] - this.checkSize[0] - 2*this.itemGap;
        var natural = this.itemIcon + this.itemCount + 2*this.itemGap;
        var k = count > 0 ? Math.min(1, room/(count*natural)) : 1;
        var icon = this.itemIcon*k, countWidth = this.itemCount*k, gap = this.itemGap*k;
        var pitch = natural*k;
        var top = (this.stripHeight - icon)*0.5;
        for (var i = 0; i < this._items.length; i++)
        {
            var item = this._items[i];
            var task = i < count ? tasks[i] : null;
            item.widget.SetEnabled(!!task);
            if (!task)
                continue;

            var x = this.itemFirst + i*pitch;
            this._SetRect(item.widget, x, 0, pitch, this.stripHeight);
            this._SetRect(item.icon, 0, top, icon, icon);
            var path = WordFallTasksView.IconFor(task);
            item.tile.SetEnabled(!path);
            item.image.SetEnabled(!!path);
            if (path && item.imagePath != path)
            {
                var drawable = item.image.drawable;
                var rect = drawable.rect;
                drawable.imageName = path;
                drawable.rect = rect;
                item.imagePath = path;
            }
            item.symbol.text = path ? "" : WordFallTasksView.SymbolFor(task);
            if (item.symbolHeight === undefined)
                item.symbolHeight = item.symbol.height;
            item.symbol.height = Math.round(item.symbolHeight*k*(item.symbol.text.length > 2 ? 0.55 : 1));

            item.count.SetEnabled(!task.done);
            item.count.SetText(WordFallTasksView.CountFor(task));
            var countText = item.count.GetLayer("text").drawable;
            if (item.countHeight === undefined)
                item.countHeight = countText.height;
            countText.height = Math.round(item.countHeight*k);
            this._SetRect(item.count, icon + gap, -this.countRaise, countWidth, this.stripHeight);
            item.done.SetEnabled(task.done);
            var doneW = this.checkSize[0]*0.8*k, doneH = this.checkSize[1]*0.8*k;
            this._SetRect(item.done, icon + gap, (this.stripHeight - doneH)*0.5, doneW, doneH);
        }

        var x = this.itemFirst + count*pitch;
        this._SetRect(this._slot, x, (this.stripHeight - this.slotSize[1])*0.5, this.slotSize[0], this.slotSize[1]);
        x += this.slotSize[0] + this.itemGap;
        this._SetRect(this._check, x, (this.stripHeight - this.checkSize[1])*0.5, this.checkSize[0], this.checkSize[1]);
        this._check.SetEnabled(true);
        this._check.SetTransparency(allDone ? 1 : 0.35);
    }

    Sync()
    {
        var svc = this._svc;
        var words = svc.GetWords();
        var tasks = svc.GetTasks();
        var allDone = words.every(function(w) { return w.found; }) && tasks.every(function(t) { return t.done; });
        this._SyncWords(words, svc.GetCurrentWord());
        this._SyncTasks(tasks, allDone);
    }

    // Для тестов: что видно в панели слов — [{word, found, active}] и подпись «ещё N»
    GetShownWords()
    {
        var result = [];
        for (var r = 0; r < this._words.length; r++)
        {
            var tiles = this._words[r];
            if (!tiles[0].widget.IsEnabled())
                continue;
            var word = "";
            for (var i = 0; i < tiles.length && tiles[i].widget.IsEnabled(); i++)
                word += tiles[i].letter.text;
            result.push({ word: word, found: tiles[0].found.IsEnabled() });
        }
        return { words: result, more: this._more.IsEnabled() ? this._more.GetText() : "" };
    }

    Update(dt)
    {
        if (!this._svc)
            return;

        var revision = this._svc.GetRevision();
        if (revision != this._lastRevision)
        {
            this._lastRevision = revision;
            this.Sync();
        }
    }
};
