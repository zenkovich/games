globalThis.WordFallGame = globalThis.WordFallGame || {};

// Вьюха целей уровня: сверху — панель слов (ряд плашек на слово; найденное — оранжевое,
// набираемый префикс — в синей рамке; не влезающие слова сводятся в последний ряд «ещё N»),
// под ней — плашки прочих задач сеткой в два столбца: чекбокс (закрытая — с галочкой), иконка
// или плашка с символом, подпись с прогрессом; последняя плашка — цель по очкам. Синк по ревизии сервиса.
// Координаты раскладки — локальные, от левого верхнего угла панели / блока плашек, y вниз

WordFallTasksView = class WordFallTasksView extends o2.Component
{
    get _svc() { return WordFallGame.service; }

    constructor()
    {
        super();
        this.wordTile = 81;          // плашка буквы слова
        this.wordTileAspect = 0.95;  // её высота к ширине
        this.wordPitchX = 83;
        this.wordPitchY = 77;
        this.wordOriginX = 5;
        this.wordOriginY = 5;
        this.wordsWidth = 576;       // ширина ряда слов внутри панели
        this.objectivesSize = [832, 184]; // блок плашек
        this.plaqueSize = [410, 88];
        this.plaqueGap = [12, 8];
        // прямоугольники внутри плашки высоты plaqueSize[1]: [x, y, w, h], y вниз
        this.plaqueCheckbox = [14, 14, 56, 57];
        this.plaqueCheck = [12, 10, 62, 55];
        this.plaqueIcon = [97, 8, 70, 70];
        this.plaqueTile = [99, 8, 66, 66];
        this.plaqueLabel = [179, 9, 223, 69];

        this._lastRevision = -1;
        this._words = [];
        this._items = [];
    }

    // Картинка задачи; буквенные задачи рисуются плашкой с символом (пустая строка)
    static IconFor(task)
    {
        switch (task.type)
        {
            case "powerup": return "WordFall/Sprites/powerup_" + (task.kind == "rocket" ? "rocket" : task.kind == "fireworks" ? "fireworks" : "bomb") + ".png";
            case "clearIce": return "WordFall/Sprites/ui_ice.png";
            case "crates": return "WordFall/Sprites/ui_crate.png";
            case "deliver": return "WordFall/Sprites/ui_envelope.png";
            case "melt": return "WordFall/Sprites/ui_snowball.png";
            case "anyWords": return "Generated/UI/Screen_Resources/Sprites/icon_search_small.png";
            case "score": return "Generated/UI/Screen_Resources/Sprites/icon_rainbow_star.png";
        }
        return "";
    }

    // Символ на плашке задачи
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

    // Подпись плашки: что сделать и сколько уже сделано
    static CaptionFor(task)
    {
        var count = task.progress + "/" + task.count;
        switch (task.type)
        {
            case "letter": return "Собрать " + count;
            case "length": return "Слова из " + task.length + " букв: " + count;
            case "anyWords": return "Найти слова: " + count;
            case "wordScore": return "Слово на " + task.score + "+ очков";
            case "powerup": return ({ bomb: "Бомба", rocket: "Ракета", fireworks: "Салют" }[task.kind] || "Бонус") + ": " + count;
            case "clearIce": return task.done ? "Весь лёд" : "Лёд: ещё " + (task.remaining || 0);
            case "crates": return task.done ? "Все ящики" : "Ящики: ещё " + (task.remaining || 0);
            case "deliver": return "Конверты: " + count;
            case "melt": return "Снежки: " + count;
            case "score": return "Набрать " + task.score + " очков";
        }
        return task.type;
    }

    // Плашки уровня: задачи и последней — обязательная цель по очкам
    static Objectives(tasks, score, target)
    {
        var list = tasks.slice();
        list.push({ type: "score", score: target, progress: Math.min(score, target), count: target, done: score >= target });
        return list;
    }

    // Сетка плашек: два столбца, строки по центру блока; нечётная последняя — по центру ряда;
    // плашки, которые не влезают по высоте, ужимаются целиком (k — их масштаб)
    static GridLayout(count, size, plaque, gap)
    {
        var rows = Math.ceil(count/2);
        var h = rows > 0 ? Math.min(plaque[1], (size[1] - (rows - 1)*gap[1])/rows) : plaque[1];
        var top = (size[1] - (rows*h + Math.max(0, rows - 1)*gap[1]))*0.5;
        var cells = [];
        for (var i = 0; i < count; i++)
        {
            var row = Math.floor(i/2), col = i % 2;
            var alone = count % 2 == 1 && i == count - 1;
            cells.push({ x: alone ? (size[0] - plaque[0])*0.5 : col*(plaque[0] + gap[0]), y: top + row*(h + gap[1]),
                         w: plaque[0], h: h, k: h/plaque[1] });
        }
        return cells;
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

        var objectives = this._actor.GetChild("Objectives");
        this._items = [];
        for (var i = 0; objectives.GetChild("Item" + i); i++)
        {
            var item = objectives.GetChild("Item" + i);
            var icon = item.GetChild("Icon");
            var caption = item.GetChild("Label");
            this._items.push({
                widget: item,
                base: item.GetChild("Base"),
                checkbox: item.GetChild("Checkbox"),
                check: item.GetChild("Check"),
                icon: icon,
                tile: icon.GetLayer("back"),
                image: icon.GetLayer("image"),
                symbol: icon.GetLayer("letter").drawable,
                points: icon.GetLayer("points").drawable,
                label: caption,
                labelText: caption.GetLayer("text").drawable,
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

    _PlaceIn(widget, box, cell)
    {
        var k = cell.k;
        this._SetRect(widget, box[0]*k, box[1]*k, box[2]*k, box[3]*k);
    }

    _SyncObjectives(objectives)
    {
        var count = Math.min(objectives.length, this._items.length);
        var cells = WordFallTasksView.GridLayout(count, this.objectivesSize, this.plaqueSize, this.plaqueGap);
        for (var i = 0; i < this._items.length; i++)
        {
            var item = this._items[i];
            var task = i < count ? objectives[i] : null;
            item.widget.SetEnabled(!!task);
            if (!task)
                continue;

            var cell = cells[i];
            this._SetRect(item.widget, cell.x, cell.y, cell.w, cell.h);
            this._SetRect(item.base, 0, 0, cell.w, cell.h);
            this._PlaceIn(item.checkbox, this.plaqueCheckbox, cell);
            this._PlaceIn(item.check, this.plaqueCheck, cell);
            item.check.SetEnabled(!!task.done);

            var path = WordFallTasksView.IconFor(task);
            this._PlaceIn(item.icon, path ? this.plaqueIcon : this.plaqueTile, cell);
            item.tile.SetEnabled(!path);
            item.image.SetEnabled(!!path);
            if (path && item.imagePath != path)
            {
                // загрузка картинки сбрасывает размер спрайта к её собственному — прямоугольник слоя возвращаем
                var drawable = item.image.drawable;
                var rect = drawable.rect;
                drawable.imageName = path;
                drawable.rect = rect;
                item.imagePath = path;
            }
            if (item.symbolHeight === undefined)
            {
                item.symbolHeight = item.symbol.height;
                item.labelHeight = item.labelText.height;
            }
            var symbol = path ? "" : WordFallTasksView.SymbolFor(task);
            item.symbol.text = symbol;
            item.symbol.height = Math.round(item.symbolHeight*cell.k*(symbol.length > 2 ? 0.5 : symbol.length > 1 ? 0.75 : 1));
            var value = task.type == "letter" && task.letter ? this._svc.GetLetterValue(task.letter) : 0;
            item.points.text = value > 0 ? "" + value : "";

            var label = this.plaqueLabel;
            var left = label[0]*cell.k;
            this._SetRect(item.label, left, label[1]*cell.k, cell.w - left - (this.plaqueSize[0] - label[0] - label[2]), label[3]*cell.k);
            item.labelText.height = Math.round(item.labelHeight*cell.k);
            item.label.SetText(WordFallTasksView.CaptionFor(task));
        }
    }

    Sync()
    {
        var svc = this._svc;
        this._SyncWords(svc.GetWords(), svc.GetCurrentWord());
        this._SyncObjectives(WordFallTasksView.Objectives(svc.GetTasks(), svc.GetScore(), svc.GetTargetScore()));
    }

    // Для тестов: что видно в панели слов — [{word, found}] и подпись «ещё N»
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

    // Для тестов: видимые плашки — [{text, symbol, image, done}]
    GetShownObjectives()
    {
        var result = [];
        for (var i = 0; i < this._items.length; i++)
        {
            var item = this._items[i];
            if (!item.widget.IsEnabled())
                continue;
            result.push({ text: item.label.GetText(), symbol: item.tile.IsEnabled() ? item.symbol.text : "",
                          image: item.image.IsEnabled() ? item.imagePath : "", done: item.check.IsEnabled() });
        }
        return result;
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
