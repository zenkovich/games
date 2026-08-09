// Word Fall — модель игры и вью-контроллер.
// Классы объявлены присваиванием в глобал: ScriptableComponent ищет класс
// по имени файла как own property globalThis.

WordFallConfig = {
    cols: 7,
    rows: 8,

    letterValues: {
        "О": 1, "А": 1, "Е": 1, "И": 1, "Н": 1, "Т": 1,
        "С": 2, "Р": 2, "В": 2, "Л": 2, "К": 2,
        "М": 3, "Д": 3, "П": 3, "У": 3,
        "Я": 4, "Ы": 4, "Ь": 4, "Г": 4, "З": 4, "Б": 4,
        "Ч": 5, "Й": 5, "Х": 5, "Ж": 5, "Ш": 5, "Ю": 5, "Ц": 5, "Щ": 5, "Э": 5, "Ф": 5
    },

    bag: {
        "О": 9, "А": 8, "Е": 8, "И": 7, "Н": 6, "Т": 6,
        "С": 5, "Р": 5, "В": 4, "Л": 4, "К": 4,
        "М": 3, "Д": 3, "П": 3, "У": 3,
        "Я": 2, "Ы": 2, "Ь": 2, "Г": 2, "З": 2, "Б": 2,
        "Ч": 1, "Й": 1, "Х": 1, "Ж": 1, "Ш": 1, "Ю": 1, "Ц": 1, "Щ": 1, "Э": 1, "Ф": 1
    },

    vowels: "АЕИОУЫЭЮЯ",
    maxConsonantRun: 4,

    level: {
        target: 300,
        moves: 12,
        ice: [[1, 6], [5, 2], [4, 7], [0, 1]],
        charges: [3, 3, 3, 3, 3]
    }
};

WordDict = [
    "БАК", "БАЛ", "БАР", "БОБ", "БОЙ", "БОК", "БОР", "БЫК", "ВАЛ", "ВЕК", "ВЕС", "ВИД",
    "ВОЗ", "ВОЛ", "ГАЗ", "ГОД", "ГОЛ", "ГУЛ", "ДАР", "ДЕД", "ДНО", "ДОМ", "ДУБ", "ДУХ",
    "ДЫМ", "ЕДА", "ЖАР", "ЖУК", "ЗАЛ", "ЗУБ", "ИВА", "ИМЯ", "КИТ", "КОЛ", "КОМ", "КОН",
    "КОТ", "КУБ", "КУМ", "ЛАК", "ЛЕВ", "ЛЕС", "ЛОБ", "ЛОМ", "ЛУГ", "ЛУК", "ЛУЧ", "ЛЮК",
    "МАГ", "МАК", "МЕЛ", "МЕХ", "МИГ", "МИР", "МОЛ", "МОХ", "МЫС", "НОЖ", "НОС", "ОСА",
    "ПАР", "ПИР", "ПОЛ", "ПОТ", "ПУХ", "РАК", "РИС", "РОВ", "РОГ", "РОД", "РОЙ", "РОМ",
    "РОТ", "РЯД", "САД", "СЕВ", "СОК", "СОМ", "СОН", "СОР", "СУД", "СУК", "СУП", "СЫН",
    "СЫР", "ТАЗ", "ТИР", "ТОК", "ТОМ", "ТОН", "ТУЗ", "УХО", "ХОД", "ХОР", "ЦЕХ", "ЧАЙ",
    "ЧАС", "ШАР", "ШУМ", "ЩИТ", "ЭРА", "ЯМА",

    "АТОМ", "БАНК", "БАНТ", "БАРС", "БЕДА", "БИНТ", "БЛИН", "БОРТ", "БРАТ", "БРУС",
    "ВАЗА", "ВАТА", "ВЕНА", "ВЕРА", "ВИНО", "ВИНТ", "ВОДА", "ВОЛК", "ВРАГ", "ВРАЧ",
    "ГЕРБ", "ГИМН", "ГОРА", "ГРАД", "ГРИБ", "ГРОМ", "ДАМА", "ДАТА", "ДВОР", "ДЕЛО",
    "ДЕНЬ", "ДОЗА", "ДОЛГ", "ДРУГ", "ДЫРА", "ЖАБА", "ЖИЛА", "ЗАРЯ", "ЗВУК", "ЗИМА",
    "ЗМЕЯ", "ЗНАК", "ЗОНА", "ИГЛА", "ИГРА", "ИКРА", "КАША", "КИНО", "КЛАД", "КЛЕЙ",
    "КЛУБ", "КОЖА", "КОЗА", "КОНЬ", "КОРА", "КРАБ", "КРАЙ", "КРАН", "КРОТ", "КРУГ",
    "КУСТ", "ЛАВА", "ЛАПА", "ЛЕТО", "ЛИПА", "ЛИСА", "ЛИСТ", "ЛИФТ", "ЛОЖА", "ЛУНА",
    "МАМА", "МАРТ", "МЕТР", "МОДА", "МОРЕ", "МОСТ", "МУКА", "НЕБО", "НИТЬ", "НОРА",
    "НОТА", "НОЧЬ", "ОБЕД", "ОКНО", "ОПЫТ", "ОРЕХ", "ОТЕЦ", "ПАПА", "ПАРА", "ПАРК",
    "ПЕНА", "ПЕЧЬ", "ПИЛА", "ПЛАН", "ПЛОТ", "ПОЛЕ", "ПОРТ", "ПРИЗ", "ПРУД", "ПУТЬ",
    "РАМА", "РАНА", "РЕКА", "РЕПА", "РИСК", "РОЗА", "РОСА", "РОСТ", "РОТА", "РУДА",
    "РУКА", "РЫБА", "САЛО", "СВЕТ", "СЕЛО", "СЕНО", "СЕТЬ", "СИЛА", "СЛЕД", "СЛОН",
    "СЛОТ", "СНЕГ", "СОДА", "СОРТ", "СОУС", "СПОР", "СТАЯ", "СТОЛ", "СТУЛ", "ТАНК",
    "ТЕЛО", "ТЕМА", "ТЕНЬ", "ТЕСТ", "ТИГР", "ТИНА", "ТОРС", "ТОРТ", "ТРОН", "ТРОС",
    "ТУЧА", "УГОЛ", "УЗЕЛ", "УРОК", "УТКА", "УТРО", "УХОД", "ФАКТ", "ФАРА", "ФЛАГ",
    "ФЛОТ", "ХЛЕБ", "ХОЛМ", "ХРАМ", "ЦВЕТ", "ЦЕНА", "ЦИРК", "ЧАША", "ЧУДО", "ШКАФ",
    "ШТАБ", "ЩЕКА", "ЭТАЖ", "ЮБКА", "ЮМОР", "ЯДРО", "ЯЗЫК", "ЯХТА",

    "АДРЕС", "АРБУЗ", "АРЕНА", "АРМИЯ", "БАЛЕТ", "БАНАН", "БАШНЯ", "БЕРЕГ", "БИЛЕТ",
    "БУКВА", "ВАГОН", "ВЕСНА", "ВЕТЕР", "ВЕТКА", "ВИЛКА", "ВИШНЯ", "ВОЛНА", "ВОРОН",
    "ВЫБОР", "ГОРОД", "ГРУША", "ДИВАН", "ДОСКА", "ДРАМА", "ЖАЖДА", "ЗАВОД", "ЗАКАТ",
    "ЗАКОН", "ЗАМОК", "ЗАПАХ", "ЗЕМЛЯ", "ЗЕРНО", "КАНАЛ", "КАРТА", "КАССА", "КНИГА",
    "КОРКА", "КРЫША", "КУХНЯ", "ЛАМПА", "ЛЕНТА", "ЛИМОН", "ЛОДКА", "ЛОЖКА", "МАРКА",
    "МАСКА", "МАСЛО", "МЕТЛА", "МЕТРО", "МЕЧТА", "МОТОР", "МУЗЕЙ", "МЫШКА", "НАРОД",
    "НИТКА", "НОМЕР", "ОБРАЗ", "ОГОНЬ", "ОЗЕРО", "ОКЕАН", "ОПЕРА", "ОРДЕН", "ОСЕНЬ",
    "ОТВЕТ", "ОТДЫХ", "ПАКЕТ", "ПАЛЕЦ", "ПАРТА", "ПЕСНЯ", "ПЕЧКА", "ПЛАТА", "ПЛИТА",
    "ПОВАР", "ПОЕЗД", "ПОЛКА", "ПОЧТА", "ПРАВО", "ПТИЦА", "РАДИО", "РАМКА", "РУЧКА",
    "РЫНОК", "САХАР", "СВЕЧА", "СЕВЕР", "СИРОП", "СКАЛА", "СЛАВА", "СЛОВО", "СМЕНА",
    "СОВЕТ", "СОСНА", "СТЕНА", "СУМКА", "ТАЙГА", "ТАНЕЦ", "ТЕАТР", "ТОЧКА", "ТРАВА",
    "ТРУБА", "ТУМАН", "УЛИЦА", "УСПЕХ", "ФЕРМА", "ФИЛЬМ", "ФОКУС", "ФОРМА", "ХОЛОД",
    "ЦЕНТР", "ЧАШКА", "ЧИСЛО", "ШАПКА", "ШКОЛА", "ЭКРАН", "ЯГОДА", "ЯКОРЬ",

    "ВОКЗАЛ", "ГАЗЕТА", "ГИТАРА", "ДОРОГА", "ЖУРНАЛ", "МАШИНА", "МЕДАЛЬ", "МОЛОКО",
    "ОГОРОД", "ПОБЕДА", "ПОГОДА", "РАБОТА", "РАКЕТА", "РЕМОНТ", "СЕКРЕТ", "СОБАКА",
    "ФОНТАН", "ЯБЛОКО",

    "КАРТИНА", "КОМАНДА", "КОРАБЛЬ", "КОРЗИНА", "ПАЛАТКА", "ПОДАРОК", "ПОРТРЕТ",
    "РИСУНОК", "РУБАШКА", "СВОБОДА", "СТОЛИЦА", "ТЕЛЕФОН", "ЧЕЛОВЕК"
];

// ---------------------------------------------------------------------------
// Чистая логика игры: сетка, мешок, выбор, очки, гравитация, бустеры.
// Не трогает движок — тестируется headless.
// ---------------------------------------------------------------------------
WordModel = class WordModel
{
    constructor(seed)
    {
        this._seed = (seed === undefined || seed === null) ? 12345 : (seed >>> 0);
        if (this._seed == 0)
            this._seed = 1;

        this._cols = WordFallConfig.cols;
        this._rows = WordFallConfig.rows;
        this._grid = null;
        this._bag = [];
        this._selected = [];
        this._score = 0;
        this._movesLeft = 0;
        this._target = 0;
        this._charges = [0, 0, 0, 0, 0];
        this._state = "playing";

        this._dictByLen = {};
        for (var i = 0; i < WordDict.length; i++)
        {
            var w = WordDict[i];
            if (!this._dictByLen[w.length])
                this._dictByLen[w.length] = [];
            this._dictByLen[w.length].push(w);
        }
    }

    // --- RNG (детерминированный, для тестов) ---

    _Rand()
    {
        this._seed = (Math.imul(this._seed, 1664525) + 1013904223) >>> 0;
        return this._seed / 4294967296;
    }

    _RandInt(n) { return Math.floor(this._Rand() * n); }

    // --- мешок ---

    _RefillBag()
    {
        this._bag = [];
        for (var letter in WordFallConfig.bag)
        {
            for (var i = 0; i < WordFallConfig.bag[letter]; i++)
                this._bag.push(letter);
        }
    }

    IsVowel(letter) { return WordFallConfig.vowels.indexOf(letter) >= 0; }

    // Тянет букву из мешка; при forceVowel пытается взять гласную
    _DrawLetter(forceVowel)
    {
        if (this._bag.length == 0)
            this._RefillBag();

        var idx = this._RandInt(this._bag.length);
        if (forceVowel && !this.IsVowel(this._bag[idx]))
        {
            var vowelIdxs = [];
            for (var i = 0; i < this._bag.length; i++)
            {
                if (this.IsVowel(this._bag[i]))
                    vowelIdxs.push(i);
            }
            if (vowelIdxs.length > 0)
                idx = vowelIdxs[this._RandInt(vowelIdxs.length)];
        }

        var letter = this._bag[idx];
        this._bag.splice(idx, 1);
        return letter;
    }

    // Анти-клин: если под точкой спавна подряд maxConsonantRun согласных — спавним гласную
    _NeedVowelAt(column, row)
    {
        var run = 0;
        for (var r = row - 1; r >= 0; r--)
        {
            var tile = this._grid[column][r];
            if (!tile || this.IsVowel(tile.letter))
                break;
            run++;
        }
        return run >= WordFallConfig.maxConsonantRun;
    }

    _MakeTile(letter)
    {
        return { letter: letter, value: WordFallConfig.letterValues[letter], ice: 0, doubled: false, joker: false };
    }

    // --- уровень ---

    NewGame(level)
    {
        level = level || WordFallConfig.level;
        this._target = level.target;
        this._movesLeft = level.moves;
        this._charges = level.charges.slice();
        this._score = 0;
        this._state = "playing";
        this._selected = [];
        this._RefillBag();

        this._grid = [];
        for (var c = 0; c < this._cols; c++)
        {
            this._grid[c] = [];
            for (var r = 0; r < this._rows; r++)
                this._grid[c][r] = this._MakeTile(this._DrawLetter(this._NeedVowelAt(c, r)));
        }

        for (var i = 0; i < level.ice.length; i++)
        {
            var cell = level.ice[i];
            this._grid[cell[0]][cell[1]].ice = 1;
        }
    }

    // --- доступ к состоянию ---

    GetTile(c, r) { return this._grid[c][r]; }
    GetScore() { return this._score; }
    GetTarget() { return this._target; }
    GetMovesLeft() { return this._movesLeft; }
    GetState() { return this._state; }
    GetCharges(i) { return this._charges[i]; }
    GetSelected() { return this._selected; }

    // --- выбор букв (свободный по всему полю) ---

    ToggleSelect(c, r)
    {
        if (this._state != "playing")
            return "blocked";

        var tile = this._grid[c][r];
        if (tile.ice > 0)
            return "ice";

        for (var i = 0; i < this._selected.length; i++)
        {
            if (this._selected[i].c == c && this._selected[i].r == r)
            {
                this._selected.length = i; // снять эту букву и весь хвост после неё
                return "removed";
            }
        }

        this._selected.push({ c: c, r: r });
        return "added";
    }

    ClearSelection() { this._selected = []; }

    CurrentWord()
    {
        var word = "";
        for (var i = 0; i < this._selected.length; i++)
        {
            var tile = this._grid[this._selected[i].c][this._selected[i].r];
            word += tile.joker ? "?" : tile.letter;
        }
        return word;
    }

    // --- словарь (джокер «?» матчится с любой буквой) ---

    _MatchWord(pattern, word)
    {
        if (pattern.length != word.length)
            return false;

        for (var i = 0; i < pattern.length; i++)
        {
            if (pattern[i] != "?" && pattern[i] != word[i])
                return false;
        }
        return true;
    }

    IsWordInDict(pattern)
    {
        if (pattern.length < 2)
            return false;

        var words = this._dictByLen[pattern.length];
        if (!words)
            return false;

        if (pattern.indexOf("?") < 0)
            return words.indexOf(pattern) >= 0;

        for (var i = 0; i < words.length; i++)
        {
            if (this._MatchWord(pattern, words[i]))
                return true;
        }
        return false;
    }

    // --- очки ---

    // Размер максимальной связной компоненты выбранных плиток (8-соседство)
    ClusterSize(cells)
    {
        if (cells.length == 0)
            return 0;

        var visited = [];
        var best = 1;
        for (var i = 0; i < cells.length; i++)
        {
            if (visited.indexOf(i) >= 0)
                continue;

            var queue = [i];
            visited.push(i);
            var size = 0;
            while (queue.length > 0)
            {
                var cur = cells[queue.pop()];
                size++;
                for (var j = 0; j < cells.length; j++)
                {
                    if (visited.indexOf(j) >= 0)
                        continue;

                    var dc = Math.abs(cells[j].c - cur.c);
                    var dr = Math.abs(cells[j].r - cur.r);
                    if (dc <= 1 && dr <= 1)
                    {
                        visited.push(j);
                        queue.push(j);
                    }
                }
            }
            best = Math.max(best, size);
        }
        return best;
    }

    LengthMultiplier(length) { return length > 3 ? 1 + 0.25*(length - 3) : 1; }

    ComputeScore(cells)
    {
        var base = 0;
        for (var i = 0; i < cells.length; i++)
        {
            var tile = this._grid[cells[i].c][cells[i].r];
            if (!tile.joker)
                base += tile.value * (tile.doubled ? 2 : 1);
        }

        var cluster = this.ClusterSize(cells);
        var clusterMult = cluster >= 2 ? cluster : 1;
        var lenMult = this.LengthMultiplier(cells.length);
        return {
            base: base,
            lenMult: lenMult,
            cluster: clusterMult,
            total: Math.ceil(base * lenMult * clusterMult)
        };
    }

    // --- сжигание, лёд, гравитация, спавн ---

    _DamageIceAround(cells)
    {
        var broken = [];
        for (var i = 0; i < cells.length; i++)
        {
            for (var dc = -1; dc <= 1; dc++)
            {
                for (var dr = -1; dr <= 1; dr++)
                {
                    var c = cells[i].c + dc;
                    var r = cells[i].r + dr;
                    if (c < 0 || c >= this._cols || r < 0 || r >= this._rows)
                        continue;

                    var tile = this._grid[c][r];
                    if (tile && tile.ice > 0 && !broken.some(function(b) { return b.c == c && b.r == r; }))
                    {
                        tile.ice--;
                        if (tile.ice == 0)
                            broken.push({ c: c, r: r });
                    }
                }
            }
        }
        return broken;
    }

    // Удаляет плитки cells, роняет столбцы, спавнит новые. Возвращает анимационные списки.
    _CollapseAndSpawn(cells)
    {
        for (var i = 0; i < cells.length; i++)
            this._grid[cells[i].c][cells[i].r] = null;

        var moved = [];
        var spawned = [];
        for (var c = 0; c < this._cols; c++)
        {
            var stack = [];
            for (var r = 0; r < this._rows; r++)
            {
                if (this._grid[c][r])
                    stack.push({ tile: this._grid[c][r], fromR: r });
            }

            for (var r = 0; r < this._rows; r++)
            {
                if (r < stack.length)
                {
                    this._grid[c][r] = stack[r].tile;
                    if (stack[r].fromR != r)
                        moved.push({ c: c, fromR: stack[r].fromR, toR: r });
                }
                else
                {
                    this._grid[c][r] = this._MakeTile(this._DrawLetter(this._NeedVowelAt(c, r)));
                    spawned.push({ c: c, r: r, letter: this._grid[c][r].letter });
                }
            }
        }
        return { moved: moved, spawned: spawned };
    }

    AcceptWord()
    {
        if (this._state != "playing")
            return { ok: false, reason: "blocked" };

        var word = this.CurrentWord();
        if (!this.IsWordInDict(word))
            return { ok: false, reason: "invalid", word: word };

        var cells = this._selected.slice();
        var score = this.ComputeScore(cells);
        this._score += score.total;

        var iceBroken = this._DamageIceAround(cells);
        var collapse = this._CollapseAndSpawn(cells);

        this._movesLeft--;
        this._selected = [];

        if (this._score >= this._target)
            this._state = "win";
        else if (this._movesLeft <= 0)
            this._state = "lose";

        return {
            ok: true, word: word, score: score, burned: cells, iceBroken: iceBroken,
            moved: collapse.moved, spawned: collapse.spawned, state: this._state
        };
    }

    // --- бустеры ---

    // Молоток: сносит любую плитку (и лёд) без траты хода
    UseHammer(c, r)
    {
        if (this._state != "playing" || this._charges[0] <= 0)
            return { ok: false };

        this._charges[0]--;
        this._selected = [];
        var collapse = this._CollapseAndSpawn([{ c: c, r: r }]);
        return { ok: true, moved: collapse.moved, spawned: collapse.spawned };
    }

    // Перемешивание: перетасовка букв по не-ледяным клеткам
    UseShuffle()
    {
        if (this._state != "playing" || this._charges[1] <= 0)
            return { ok: false };

        this._charges[1]--;
        this._selected = [];

        var cells = [];
        for (var c = 0; c < this._cols; c++)
        {
            for (var r = 0; r < this._rows; r++)
            {
                if (this._grid[c][r].ice == 0)
                    cells.push({ c: c, r: r });
            }
        }

        var tiles = cells.map(function(cell) { return this._grid[cell.c][cell.r]; }, this);
        for (var i = tiles.length - 1; i > 0; i--)
        {
            var j = this._RandInt(i + 1);
            var tmp = tiles[i]; tiles[i] = tiles[j]; tiles[j] = tmp;
        }
        for (var i = 0; i < cells.length; i++)
            this._grid[cells[i].c][cells[i].r] = tiles[i];

        return { ok: true };
    }

    // Подсказка: самое дорогое слово словаря, собираемое из букв поля.
    // Оценка — база × множитель длины (кластер не учитывается).
    FindBestWord()
    {
        var pool = [];
        for (var c = 0; c < this._cols; c++)
        {
            for (var r = 0; r < this._rows; r++)
            {
                var tile = this._grid[c][r];
                if (tile.ice == 0)
                    pool.push({ c: c, r: r, tile: tile });
            }
        }

        // дорогие плитки первыми — жадный выбор максимизирует очки
        pool.sort(function(a, b) {
            var av = a.tile.joker ? 0 : a.tile.value * (a.tile.doubled ? 2 : 1);
            var bv = b.tile.joker ? 0 : b.tile.value * (b.tile.doubled ? 2 : 1);
            return bv - av;
        });

        var best = null;
        for (var i = 0; i < WordDict.length; i++)
        {
            var word = WordDict[i];
            var used = [];
            var okWord = true;
            for (var li = 0; li < word.length && okWord; li++)
            {
                var found = -1;
                for (var p = 0; p < pool.length; p++)
                {
                    if (used.indexOf(p) >= 0)
                        continue;
                    if (!pool[p].tile.joker && pool[p].tile.letter == word[li])
                    {
                        found = p;
                        break;
                    }
                }
                if (found < 0)
                {
                    // добираем джокером
                    for (var p = 0; p < pool.length; p++)
                    {
                        if (used.indexOf(p) < 0 && pool[p].tile.joker)
                        {
                            found = p;
                            break;
                        }
                    }
                }
                if (found < 0)
                    okWord = false;
                else
                    used.push(found);
            }

            if (!okWord)
                continue;

            var sum = 0;
            for (var u = 0; u < used.length; u++)
            {
                var tile = pool[used[u]].tile;
                sum += tile.joker ? 0 : tile.value * (tile.doubled ? 2 : 1);
            }
            var value = sum * this.LengthMultiplier(word.length);
            if (!best || value > best.value)
            {
                best = {
                    value: value, word: word,
                    cells: used.map(function(u) { return { c: pool[u].c, r: pool[u].r }; })
                };
            }
        }
        return best;
    }

    UseHint()
    {
        if (this._state != "playing" || this._charges[2] <= 0)
            return { ok: false };

        var best = this.FindBestWord();
        if (!best)
            return { ok: false, reason: "no_word" };

        this._charges[2]--;
        this._selected = best.cells.slice();
        return { ok: true, word: best.word, cells: best.cells };
    }

    // Джокер: буква превращается в «?» (любая буква), номинал 0
    UseJoker(c, r)
    {
        if (this._state != "playing" || this._charges[3] <= 0)
            return { ok: false };

        var tile = this._grid[c][r];
        if (tile.ice > 0 || tile.joker)
            return { ok: false };

        this._charges[3]--;
        tile.joker = true;
        tile.value = 0;
        return { ok: true };
    }

    // Удвоитель: номинал буквы ×2
    UseDoubler(c, r)
    {
        if (this._state != "playing" || this._charges[4] <= 0)
            return { ok: false };

        var tile = this._grid[c][r];
        if (tile.ice > 0 || tile.joker || tile.doubled)
            return { ok: false };

        this._charges[4]--;
        tile.doubled = true;
        return { ok: true };
    }

    // --- отладка/тесты ---

    DebugSetTile(c, r, letter)
    {
        this._grid[c][r] = this._MakeTile(letter);
    }
};

// ---------------------------------------------------------------------------
// Вью-контроллер: находит виджеты, вешает onClick, синхронизирует модель с
// отображением и анимирует падение плиток.
// ---------------------------------------------------------------------------
WordFallGame = class WordFallGame extends o2.Component
{
    constructor()
    {
        super();
        this._model = null;
        this._root = null;
        this._tiles = null;
        this._widgets = {};
        this._boosterMode = null;   // null | "hammer" | "joker" | "doubler"
        this._fallAnims = [];       // { c, r, offset }
        this._gainTimer = 0;
        this._wordFlashTimer = 0;

        this._cell = 68;
        this._tileSize = 64;
        this._boardX = 0;
        this._boardY = -20;
    }

    OnStart()
    {
        try
        {
            globalThis.WordFall_instance = this; // доступ из тестов

            var seed = (typeof WORDFALL_SEED !== "undefined") ? WORDFALL_SEED : (Date.now() & 0xffffff);
            this._model = new WordModel(seed);
            this._model.NewGame(WordFallConfig.level);

            this._FindWidgets();
            this._BindClicks();
            this.SyncAll();
        }
        catch (e)
        {
            print("WordFall OnStart failed: " + e + "\n" + e.stack);
            throw e;
        }
    }

    // --- поиск и кэширование виджетов ---

    // Сиблинги актора Game достаются через относительные пути ".." — GetParent()
    // возвращает WeakRef, не пригодный для вызова методов из JS
    _Find(path) { return this._actor.GetChild("../" + path); }

    _FindWidgets()
    {
        this._tiles = [];
        for (var c = 0; c < WordFallConfig.cols; c++)
        {
            this._tiles[c] = [];
            for (var r = 0; r < WordFallConfig.rows; r++)
            {
                var btn = this._Find("Board/Tile_" + c + "_" + r);
                this._tiles[c][r] = {
                    btn: btn,
                    letter: btn.GetLayer("letter").drawable,
                    points: btn.GetLayer("points").drawable,
                    sel: btn.GetLayer("sel"),
                    ice: btn.GetLayer("ice")
                };
            }
        }

        this._widgets.scoreLabel = this._Find("Hud/ScoreLabel");
        this._widgets.movesLabel = this._Find("Hud/MovesLabel");
        this._widgets.wordLabel = this._Find("WordPanel/WordLabel");
        this._widgets.gainLabel = this._Find("WordPanel/GainLabel");
        this._widgets.acceptBtn = this._Find("WordPanel/AcceptBtn");
        this._widgets.clearBtn = this._Find("WordPanel/ClearBtn");
        this._widgets.modeLabel = this._Find("Boosters/ModeLabel");
        this._widgets.popup = this._Find("Popup");
        this._widgets.popupTitle = this._Find("Popup/Title");
        this._widgets.popupScore = this._Find("Popup/ScoreLine");
        this._widgets.restartBtn = this._Find("Popup/RestartBtn");

        this._widgets.boosterBtns = [];
        this._widgets.chargeLabels = [];
        for (var i = 0; i < 5; i++)
        {
            this._widgets.boosterBtns.push(this._Find("Boosters/Booster" + i));
            this._widgets.chargeLabels.push(this._Find("Boosters/Charge" + i));
        }
    }

    _BindClicks()
    {
        var self = this;

        for (var c = 0; c < WordFallConfig.cols; c++)
        {
            for (var r = 0; r < WordFallConfig.rows; r++)
            {
                (function(cc, rr) {
                    self._tiles[cc][rr].btn.onClick = function() { self.OnTileClick(cc, rr); };
                })(c, r);
            }
        }

        this._widgets.acceptBtn.onClick = function() { self.OnAccept(); };
        this._widgets.clearBtn.onClick = function() { self.OnClear(); };
        this._widgets.restartBtn.onClick = function() { self.OnRestart(); };

        var modes = ["hammer", "shuffle", "hint", "joker", "doubler"];
        for (var i = 0; i < 5; i++)
        {
            (function(idx) {
                self._widgets.boosterBtns[idx].onClick = function() { self.OnBooster(idx, modes[idx]); };
            })(i);
        }
    }

    // --- обработчики ---

    OnTileClick(c, r)
    {
        var model = this._model;
        if (model.GetState() != "playing")
            return;

        if (this._boosterMode)
        {
            var mode = this._boosterMode;
            this._boosterMode = null;

            var result = mode == "hammer" ? model.UseHammer(c, r)
                       : mode == "joker" ? model.UseJoker(c, r)
                       : model.UseDoubler(c, r);

            if (result.ok && result.moved)
                this._StartFallAnims(result.moved, result.spawned);

            this.SyncAll();
            return;
        }

        model.ToggleSelect(c, r);
        this.SyncSelection();
        this.SyncWord();
    }

    OnAccept()
    {
        var model = this._model;
        var result = model.AcceptWord();
        if (!result.ok)
        {
            if (result.reason == "invalid")
                this._wordFlashTimer = 0.7;
            this.SyncWord();
            return;
        }

        this._StartFallAnims(result.moved, result.spawned);

        this._widgets.gainLabel.SetText("+" + result.score.total);
        this._gainTimer = 1.6;

        this.SyncAll();

        if (result.state != "playing")
            this._ShowPopup(result.state == "win");
    }

    OnClear()
    {
        this._model.ClearSelection();
        this._boosterMode = null;
        this.SyncAll();
    }

    OnBooster(index, mode)
    {
        var model = this._model;
        if (model.GetState() != "playing")
            return;

        if (this._boosterMode == mode)
        {
            this._boosterMode = null; // повторный клик — отмена прицела
            this.SyncHud();
            return;
        }

        if (model.GetCharges(index) <= 0)
            return;

        if (mode == "shuffle")
        {
            model.UseShuffle();
            this.SyncAll();
        }
        else if (mode == "hint")
        {
            model.UseHint();
            this.SyncAll();
        }
        else
        {
            this._boosterMode = mode;
            this.SyncHud();
        }
    }

    OnRestart()
    {
        this._model.NewGame(WordFallConfig.level);
        this._boosterMode = null;
        this._fallAnims = [];
        this._widgets.popup.SetEnabled(false);
        this.SyncAll();
    }

    // --- синхронизация модель → вью ---

    SyncAll()
    {
        this.SyncBoard();
        this.SyncSelection();
        this.SyncWord();
        this.SyncHud();
    }

    SyncTile(c, r)
    {
        var tile = this._model.GetTile(c, r);
        var view = this._tiles[c][r];

        view.letter.text = tile.joker ? "?" : tile.letter;
        view.letter.color = tile.joker ? new Color4(160, 90, 200, 255) : new Color4(92, 57, 26, 255);

        if (tile.joker)
            view.points.text = "";
        else
            view.points.text = "" + tile.value * (tile.doubled ? 2 : 1);
        view.points.color = tile.doubled ? new Color4(215, 150, 20, 255) : new Color4(125, 82, 40, 255);

        view.ice.SetEnabled(tile.ice > 0);
    }

    SyncBoard()
    {
        for (var c = 0; c < WordFallConfig.cols; c++)
        {
            for (var r = 0; r < WordFallConfig.rows; r++)
                this.SyncTile(c, r);
        }
    }

    SyncSelection()
    {
        var selected = this._model.GetSelected();
        for (var c = 0; c < WordFallConfig.cols; c++)
        {
            for (var r = 0; r < WordFallConfig.rows; r++)
            {
                var isSel = selected.some(function(s) { return s.c == c && s.r == r; });
                this._tiles[c][r].sel.SetEnabled(isSel);
            }
        }
    }

    SyncWord()
    {
        var model = this._model;
        var word = model.CurrentWord();
        var label = this._widgets.wordLabel;
        label.SetText(word);

        if (this._wordFlashTimer > 0)
            label.SetColor(new Color4(200, 60, 40, 255));
        else if (word.length >= 2 && model.IsWordInDict(word))
            label.SetColor(new Color4(60, 150, 60, 255));
        else
            label.SetColor(new Color4(92, 57, 26, 255));
    }

    SyncHud()
    {
        var model = this._model;
        this._widgets.scoreLabel.SetText("Очки: " + model.GetScore() + " / " + model.GetTarget());
        this._widgets.movesLabel.SetText("Ходы: " + model.GetMovesLeft());

        for (var i = 0; i < 5; i++)
            this._widgets.chargeLabels[i].SetText("x" + model.GetCharges(i));

        var modeTexts = {
            hammer: "Молоток: кликните плитку",
            joker: "Джокер: кликните плитку",
            doubler: "Удвоитель: кликните плитку"
        };
        this._widgets.modeLabel.SetText(this._boosterMode ? modeTexts[this._boosterMode] : "");

        if (this._gainTimer <= 0)
            this._widgets.gainLabel.SetText("");
    }

    _ShowPopup(win)
    {
        this._widgets.popupTitle.SetText(win ? "ПОБЕДА!" : "ПОРАЖЕНИЕ");
        this._widgets.popupScore.SetText("Очки: " + this._model.GetScore());
        this._widgets.popup.SetEnabled(true);
    }

    // --- анимация падения ---

    _TilePos(c, r)
    {
        return new Vec2(this._boardX + (c - 3)*this._cell,
                        this._boardY + (r - 3.5)*this._cell);
    }

    _SetTileRect(c, r, extraY)
    {
        var pos = this._TilePos(c, r);
        var half = this._tileSize * 0.5;
        var layout = this._tiles[c][r].btn.GetLayout();
        layout.SetOffsetMin(new Vec2(pos.x - half, pos.y + extraY - half));
        layout.SetOffsetMax(new Vec2(pos.x + half, pos.y + extraY + half));
    }

    _StartFallAnims(moved, spawned)
    {
        // старые анимации сбрасываем в конечное положение
        for (var i = 0; i < this._fallAnims.length; i++)
            this._SetTileRect(this._fallAnims[i].c, this._fallAnims[i].r, 0);
        this._fallAnims = [];

        for (var i = 0; i < moved.length; i++)
        {
            var m = moved[i];
            this._fallAnims.push({ c: m.c, r: m.toR, offset: (m.fromR - m.toR) * this._cell });
        }
        for (var i = 0; i < spawned.length; i++)
        {
            var s = spawned[i];
            this._fallAnims.push({ c: s.c, r: s.r, offset: (WordFallConfig.rows - s.r) * this._cell + 60 });
        }

        for (var i = 0; i < this._fallAnims.length; i++)
        {
            var a = this._fallAnims[i];
            this._SetTileRect(a.c, a.r, a.offset);
        }
    }

    Update(dt)
    {
        if (this._fallAnims.length > 0)
        {
            var speed = 700;
            var alive = [];
            for (var i = 0; i < this._fallAnims.length; i++)
            {
                var a = this._fallAnims[i];
                a.offset -= speed * dt;
                if (a.offset <= 0)
                    this._SetTileRect(a.c, a.r, 0);
                else
                {
                    this._SetTileRect(a.c, a.r, a.offset);
                    alive.push(a);
                }
            }
            this._fallAnims = alive;
        }

        if (this._gainTimer > 0)
        {
            this._gainTimer -= dt;
            if (this._gainTimer <= 0)
                this._widgets.gainLabel.SetText("");
        }

        if (this._wordFlashTimer > 0)
        {
            this._wordFlashTimer -= dt;
            if (this._wordFlashTimer <= 0)
                this.SyncWord();
        }
    }

    // --- отладка/тесты ---

    DebugSetTile(c, r, letter)
    {
        this._model.DebugSetTile(c, r, letter);
        this.SyncTile(c, r);
    }

    DebugGetModel() { return this._model; }
};
