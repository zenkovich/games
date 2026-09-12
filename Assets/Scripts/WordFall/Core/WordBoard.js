include("Scripts/WordFall/Core/WordFallConfigs.js");
include("Scripts/WordFall/Core/WordFallRandom.js");
include("Scripts/WordFall/Core/WordDictionary.js");

// Плитка поля
WordTile = class WordTile
{
    constructor(letter)
    {
        this.letter = letter || "";   // буква (одна)
        this.value = 0;               // номинал
        this.ice = 0;                 // слоёв льда: буква видна, выбор запрещён
        this.stone = 0;               // камень: ломается только бонусами
        this.doubled = false;
        this.joker = false;
        this.powerup = "";            // "" | bomb | rocket | fireworks — бонус занимает слот вместо буквы
        this.hole = false;            // клетки нет: ничего не рисуется и не падает
        this.crate = 0;               // прочность ящика (0 — нет)
        this.chained = false;         // буква на цепи: не падает и держит колонку
        this.snow = false;            // снежок: падает, тает от слова рядом
        this.parcel = false;          // конверт: падает, доставляется на дне колонки
    }
};

// Результат хода — всё, что нужно вьюхам для анимаций
WordMoveResult = class WordMoveResult
{
    constructor()
    {
        this.ok = false;
        this.reason = "";          // invalid | blocked | duplicate
        this.word = "";            // паттерн слова (с '?')
        this.baseScore = 0;
        this.lengthMultiplier = 1;
        this.clusterSize = 1;
        this.wordScore = 0;        // очки слова с множителями
        this.extraScore = 0;       // очки от бонусов
        this.gain = 0;             // всего за ход
        this.powerupEarned = "";
        this.burned = [];          // сгоревшие клетки (слово + взрывы)
        this.destroyed = [];       // уничтоженные бонусами сверх слова
        this.powerupsUsed = [];    // [{kind, c, r, targets: [{c, r}]}]
        this.activated = [];       // клетки, задетые бонусами и оставшиеся на поле
        this.iceBroken = [];
        this.moved = [];           // [{c, fromR, toR}]
        this.spawned = [];
        this.repaired = [];        // подсев страховки выполнимости
        this.crateHit = [];
        this.crateBroken = [];
        this.snowMelted = [];
        this.delivered = [];
    }
};

// Модель поля: сетка, мешок, выбор, очки, гравитация, бонусы.
// Не знает о задачах, ходах и состоянии уровня — это WordLevel
WordBoard = class WordBoard
{
    constructor()
    {
        this.config = WordFallConfigs.DefaultBoardConfig();
        this.grid = [];            // [column][row], row 0 — низ
        this.selection = [];
        this.seededCells = [];
        this._presetCells = [];
        this._reservedCells = [];
        this._bag = [];
        this._random = new WordFallRandom(1);
        this._pendingParcels = 0;
        this._pendingSnow = 0;
        this._rocketPriorities = WordBoard.EmptyRocketPriorities();
    }

    static EmptyRocketPriorities()
    {
        return { ice: false, crates: false, snow: false, keepLetter: "", keepCells: [] };
    }

    Init(config, seed)
    {
        this.config = config;
        this._random = new WordFallRandom(seed);
    }

    // Новое поле: заполнение из мешка, сид слова, препятствия и предметы уровня
    Fill(level, seededWord)
    {
        this.selection = [];
        this.seededCells = [];
        this._pendingParcels = 0;
        this._pendingSnow = 0;
        this._RefillBag();

        this.grid = [];
        for (var c = 0; c < this.config.columns; c++)
        {
            var column = [];
            for (var r = 0; r < this.config.rows; r++)
                column.push(new WordTile());
            this.grid.push(column);
        }

        var self = this;
        level.holeCells.forEach(function(cell) {
            if (self.IsValidCell(cell))
                self.grid[cell.c][cell.r].hole = true;
        });

        for (var c = 0; c < this.config.columns; c++)
        {
            for (var r = 0; r < this.config.rows; r++)
            {
                if (!this.grid[c][r].hole)
                    this.grid[c][r] = this._MakeTile(this._DrawLetter(this._NeedVowelAt(c, r)));
            }
        }

        // буквы, заданные уровнем, стоят на своих клетках; сид слова обходит их и клетки,
        // отведённые под препятствия, — иначе препятствие уступило бы слову и пропало
        this._presetCells = [];
        (level.letterCells || []).forEach(function(cell) {
            if (self.IsPlayable(cell) && cell.letter)
            {
                self.grid[cell.c][cell.r] = self._MakeTile(cell.letter);
                self._presetCells.push({ c: cell.c, r: cell.r });
            }
        });
        this._reservedCells = this._presetCells.slice();
        [level.iceCells, level.stoneCells, level.crateCells, level.chainCells, level.snowCells, level.parcelCells, level.powerupCells]
            .forEach(function(list) { list.forEach(function(cell) { self._reservedCells.push({ c: cell.c, r: cell.r }); }); });

        if (seededWord)
            this._SeedWord(seededWord);

        var freeCell = function(cell) {
            return self.IsPlayable(cell) && !WordFallCells.Contains(self.seededCells, cell) &&
                WordBoard.IsTileUsable(self.grid[cell.c][cell.r]);
        };
        var replace = function(cell) {
            var tile = new WordTile();
            self.grid[cell.c][cell.r] = tile;
            return tile;
        };

        level.iceCells.forEach(function(cell) { if (freeCell(cell)) self.grid[cell.c][cell.r].ice = 1; });
        level.stoneCells.forEach(function(cell) { if (freeCell(cell)) self.grid[cell.c][cell.r].stone = 1; });

        level.crateCells.forEach(function(cell, i) {
            if (!freeCell(cell))
                return;
            var grade = i < level.crateGrades.length ? level.crateGrades[i] : 1;
            replace(cell).crate = Math.min(Math.max(grade, 1), 3);
        });

        level.chainCells.forEach(function(cell) { if (freeCell(cell)) self.grid[cell.c][cell.r].chained = true; });
        level.snowCells.forEach(function(cell) { if (freeCell(cell)) replace(cell).snow = true; });
        level.parcelCells.forEach(function(cell) { if (freeCell(cell)) replace(cell).parcel = true; });

        for (var i = 0; i < level.powerupCells.length && i < level.powerupKinds.length; i++)
        {
            var cell = level.powerupCells[i];
            if (freeCell(cell))
                replace(cell).powerup = level.powerupKinds[i];
        }
    }

    GetConfig() { return this.config; }
    GetColumns() { return this.config.columns; }
    GetRows() { return this.config.rows; }
    GetSelection() { return this.selection; }
    GetSeededCells() { return this.seededCells; }

    IsValidCell(cell)
    {
        return cell.c >= 0 && cell.c < this.config.columns && cell.r >= 0 && cell.r < this.config.rows;
    }

    IsHole(cell) { return this.IsValidCell(cell) && this.grid[cell.c][cell.r].hole; }
    IsPlayable(cell) { return this.IsValidCell(cell) && !this.grid[cell.c][cell.r].hole; }

    GetTile(cell) { return this.grid[cell.c][cell.r]; }

    // Что упадёт сверху при следующем заполнении: конверты и снежки уровня
    SetSpawnQueue(parcels, snow)
    {
        this._pendingParcels = parcels;
        this._pendingSnow = snow;
    }

    // Приоритеты целей ракет по задачам: цели-препятствия бьются первыми, буквы задания берегутся
    SetRocketPriorities(priorities) { this._rocketPriorities = priorities; }

    CountCrates() { return this._Count(function(t) { return t.crate > 0; }); }
    CountSnow() { return this._Count(function(t) { return t.snow; }); }
    CountParcels() { return this._Count(function(t) { return t.parcel; }); }
    CountIce() { return this._Count(function(t) { return t.ice > 0; }); }

    _Count(predicate)
    {
        var count = 0;
        for (var c = 0; c < this.grid.length; c++)
        {
            for (var r = 0; r < this.grid[c].length; r++)
                count += predicate(this.grid[c][r]) ? 1 : 0;
        }
        return count;
    }

    // Плитка пригодна для сбора слов: есть буква, нет льда, камня и бонуса
    static IsTileUsable(tile)
    {
        return tile.ice == 0 && tile.stone == 0 && !tile.powerup && tile.letter.length > 0 &&
            !tile.hole && tile.crate == 0 && !tile.snow && !tile.parcel;
    }

    // Плитка занимает клетку и падает (буква, бонус, снежок, конверт, ящик)
    static IsTileOccupied(tile)
    {
        return (tile.letter.length > 0 || tile.powerup.length > 0 || tile.snow || tile.parcel || tile.crate > 0) &&
            !WordBoard.IsTileStatic(tile);
    }

    // Клетка не двигается и держит колонку над собой (дыра, цепь)
    static IsTileStatic(tile)
    {
        return tile.hole || tile.chained;
    }

    static LengthMultiplier(length)
    {
        return length > 3 ? 1 + 0.25*(length - 3) : 1;
    }

    // Свободный выбор: клик добавляет букву, повторный — снимает её и хвост
    ToggleSelect(cell)
    {
        var tile = this.grid[cell.c][cell.r];
        if (tile.ice > 0)
            return "iced";

        if (tile.stone > 0 || tile.powerup)
            return "blocked";

        var index = WordFallCells.IndexOf(this.selection, cell);
        if (index >= 0)
        {
            this.selection.length = index;
            return "removed";
        }

        this.selection.push({ c: cell.c, r: cell.r });
        return "added";
    }

    ClearSelection()
    {
        this.selection = [];
    }

    // Текущий паттерн слова ('?' для джокеров)
    GetCurrentWord()
    {
        var word = "";
        for (var i = 0; i < this.selection.length; i++)
        {
            var tile = this.grid[this.selection[i].c][this.selection[i].r];
            word += tile.joker ? "?" : tile.letter;
        }
        return word;
    }

    // Очки выбора: база × множитель длины × размер кластера (8-соседство)
    ComputeSelectionScore()
    {
        var base = 0;
        var cells = this.selection;
        for (var i = 0; i < cells.length; i++)
            base += this._TileValue(this.grid[cells[i].c][cells[i].r]);

        var cluster = 1;
        var visited = new Array(cells.length).fill(false);
        for (var i = 0; i < cells.length; i++)
        {
            if (visited[i])
                continue;

            var queue = [i];
            visited[i] = true;
            var size = 0;
            while (queue.length > 0)
            {
                var current = queue.pop();
                size++;
                for (var j = 0; j < cells.length; j++)
                {
                    if (visited[j])
                        continue;

                    if (Math.abs(cells[j].c - cells[current].c) <= 1 && Math.abs(cells[j].r - cells[current].r) <= 1)
                    {
                        visited[j] = true;
                        queue.push(j);
                    }
                }
            }
            cluster = Math.max(cluster, size);
        }

        var lengthMult = WordBoard.LengthMultiplier(cells.length);
        var clusterMult = cluster >= 2 ? cluster : 1;
        return {
            score: Math.ceil(Math.fround(Math.fround(base*lengthMult)*clusterMult)),
            base: base,
            lengthMult: lengthMult,
            cluster: cluster
        };
    }

    // Принятие слова: валидация, бонусы, лёд, гравитация, спавн, заработок бонуса
    AcceptWord(dictionary)
    {
        var result = new WordMoveResult();
        result.word = this.GetCurrentWord();

        if (!dictionary.Contains(result.word))
        {
            result.reason = "invalid";
            return result;
        }

        var cells = WordFallCells.Copy(this.selection);
        var score = this.ComputeSelectionScore();
        result.wordScore = score.score;
        result.baseScore = score.base;
        result.lengthMultiplier = score.lengthMult;
        result.clusterSize = score.cluster;

        var powerups = this._ActivatePowerups(cells);
        result.extraScore = powerups.extraScore;
        result.gain = result.wordScore + result.extraScore;
        result.activated = powerups.activated;
        result.destroyed = powerups.destroyed;
        result.powerupsUsed = powerups.used;

        var destroyed = cells.concat(powerups.destroyed);
        result.iceBroken = powerups.iceBroken;
        result.crateHit = powerups.crateHit;
        result.crateBroken = powerups.crateBroken;
        result.snowMelted = powerups.snowMelted;
        this._DamageAround(cells, destroyed, result);
        result.burned = destroyed;

        this._CollapseAndSpawn(destroyed.concat(result.crateBroken, result.snowMelted), result);

        // длинное слово — бонус-плитка в клетке последней буквы
        result.powerupEarned = this._PowerupForLength(cells.length);
        if (result.powerupEarned)
        {
            var last = cells[cells.length - 1];
            var bonusTile = new WordTile();
            bonusTile.powerup = result.powerupEarned;
            this.grid[last.c][last.r] = bonusTile;
        }

        this.selection = [];
        result.ok = true;
        return result;
    }

    // Молоток: снимает слой препятствия или плитку целиком
    RemoveTile(cell)
    {
        var result = new WordMoveResult();
        if (!this.IsValidCell(cell))
            return result;

        this.selection = [];
        var tile = this.grid[cell.c][cell.r];
        if (tile.hole || tile.parcel)
            return result;

        if (tile.crate > 1)
        {
            tile.crate--;
            result.crateHit.push({ c: cell.c, r: cell.r });
            result.ok = true;
            return result;
        }

        if (tile.crate == 1)
            result.crateBroken.push({ c: cell.c, r: cell.r });
        else if (tile.snow)
            result.snowMelted.push({ c: cell.c, r: cell.r });
        else
            result.burned.push({ c: cell.c, r: cell.r });

        tile.crate = 0;
        tile.snow = false;
        tile.chained = false;
        this._CollapseAndSpawn([{ c: cell.c, r: cell.r }], result);
        result.ok = true;
        return result;
    }

    // Перемешивание плиток, пригодных для слов
    ShuffleLetters()
    {
        var cells = [];
        for (var c = 0; c < this.config.columns; c++)
        {
            for (var r = 0; r < this.config.rows; r++)
            {
                if (WordBoard.IsTileUsable(this.grid[c][r]))
                    cells.push({ c: c, r: r });
            }
        }

        var self = this;
        var tiles = cells.map(function(cell) { return self.grid[cell.c][cell.r]; });
        for (var i = tiles.length - 1; i > 0; i--)
        {
            var j = this._random.NextInt(i + 1);
            var tmp = tiles[i];
            tiles[i] = tiles[j];
            tiles[j] = tmp;
        }

        for (var i = 0; i < cells.length; i++)
            this.grid[cells[i].c][cells[i].r] = tiles[i];

        this.selection = [];
        return true;
    }

    MakeJoker(cell)
    {
        var tile = this.grid[cell.c][cell.r];
        if (!WordBoard.IsTileUsable(tile) || tile.joker)
            return false;

        tile.joker = true;
        tile.value = 0;
        return true;
    }

    MakeDoubled(cell)
    {
        var tile = this.grid[cell.c][cell.r];
        if (!WordBoard.IsTileUsable(tile) || tile.joker || tile.doubled)
            return false;

        tile.doubled = true;
        return true;
    }

    // Самое дорогое слово из букв поля; заполняет выбор при успехе
    SelectBestWord(dictionary)
    {
        var best = this.FindBestWord(dictionary, 0);
        if (!best)
            return false;

        this.selection = best.cells;
        return true;
    }

    // Счётчики пригодных букв поля по кодам; джокеры считаются отдельно
    _CountBoardLetters()
    {
        var counts = new Int32Array(WordDictionary.LetterCodesCount);
        var jokers = 0;
        for (var c = 0; c < this.config.columns; c++)
        {
            for (var r = 0; r < this.config.rows; r++)
            {
                var tile = this.grid[c][r];
                if (!WordBoard.IsTileUsable(tile))
                    continue;

                if (tile.joker)
                    jokers++;
                else
                    counts[WordDictionary.LetterCode(tile.letter)]++;
            }
        }
        return { counts: counts, jokers: jokers };
    }

    // Не хватает ли на поле больше limit букв слова codes[start..end); scratch — обнулённый буфер, остаётся обнулённым
    static _LacksLetters(codes, start, end, counts, scratch, limit)
    {
        var deficit = 0;
        var i = start;
        for (; i < end; i++)
        {
            var code = codes[i];
            if (scratch[code] >= counts[code] && ++deficit > limit)
                break;
            scratch[code]++;
        }
        for (var j = start; j < i; j++)
            scratch[codes[j]] = 0;
        return deficit > limit;
    }

    // Самое дорогое собираемое слово (опц. точной длины): {word, cells, value} без кластера
    FindBestWord(dictionary, requiredLength)
    {
        var found = this.FindBestWordBy(dictionary, function(word, value) {
            if (requiredLength > 0 && word.length != requiredLength)
                return 0;
            return value;
        });
        if (!found)
            return null;

        var sum = 0;
        for (var i = 0; i < found.cells.length; i++)
        {
            var tile = this.grid[found.cells[i].c][found.cells[i].r];
            sum += tile.joker ? 0 : this._TileValue(tile);
        }
        found.value = Math.fround(sum*WordBoard.LengthMultiplier(found.word.length));
        return found;
    }

    // Лучшее собираемое слово по оценщику scorer(word, value) -> вес (<= 0 — не подходит).
    // Жадный подбор: каждая буква берёт самую дорогую свободную плитку с этой буквой,
    // недостача добирается джокерами в порядке поля
    FindBestWordBy(dictionary, scorer)
    {
        var pool = [];
        for (var c = 0; c < this.config.columns; c++)
        {
            for (var r = 0; r < this.config.rows; r++)
            {
                var tile = this.grid[c][r];
                if (WordBoard.IsTileUsable(tile))
                    pool.push({ cell: { c: c, r: r }, code: WordDictionary.LetterCode(tile.letter), value: this._TileValue(tile), joker: tile.joker });
            }
        }
        pool.sort(function(a, b) { return b.value - a.value; });

        var codesCount = WordDictionary.LetterCodesCount;
        var byLetter = [];
        for (var i = 0; i < codesCount; i++)
            byLetter.push([]);
        var jokers = [];
        for (var p = 0; p < pool.length; p++)
        {
            if (pool[p].joker)
                jokers.push(p);
            else
                byLetter[pool[p].code].push(p);
        }

        var counts = new Int32Array(codesCount);
        for (var i = 0; i < codesCount; i++)
            counts[i] = byLetter[i].length;

        var cursor = new Int32Array(codesCount);
        var words = dictionary.GetAllWords();
        var codes = dictionary.GetCodes();
        var offsets = dictionary.GetOffsets();
        var bestIndex = -1;
        var bestValue = -1;

        for (var w = 0; w < words.length; w++)
        {
            var start = offsets[w], end = offsets[w + 1];
            if (WordBoard._LacksLetters(codes, start, end, counts, cursor, jokers.length))
                continue;

            var sum = 0;
            for (var i = start; i < end; i++)
            {
                var code = codes[i];
                if (cursor[code] < counts[code])
                    sum += pool[byLetter[code][cursor[code]]].value;
                cursor[code]++;
            }
            for (var i = start; i < end; i++)
                cursor[codes[i]] = 0;

            var value = scorer(words[w], Math.fround(sum*WordBoard.LengthMultiplier(end - start)));
            if (value > 0 && value > bestValue)
            {
                bestValue = value;
                bestIndex = w;
            }
        }

        if (bestIndex < 0)
            return null;

        var cells = [];
        var nextJoker = 0;
        for (var i = offsets[bestIndex]; i < offsets[bestIndex + 1]; i++)
        {
            var code = codes[i];
            var index = cursor[code] < counts[code] ? byLetter[code][cursor[code]] : jokers[nextJoker++];
            cursor[code]++;
            cells.push({ c: pool[index].cell.c, r: pool[index].cell.r });
        }
        return { word: words[bestIndex], cells: cells };
    }

    // Собираемо ли слово из букв поля (джокеры добирают дефицит)
    CanAssembleWord(word)
    {
        var letters = this._CountBoardLetters();
        var scratch = new Int32Array(WordDictionary.LetterCodesCount);
        var codes = WordDictionary.LetterCodes(word);
        return !WordBoard._LacksLetters(codes, 0, codes.length, letters.counts, scratch, letters.jokers);
    }

    // Существует ли собираемое слово словаря (опц. точной длины)
    AnyWordExists(dictionary, requiredLength)
    {
        var letters = this._CountBoardLetters();
        var scratch = new Int32Array(WordDictionary.LetterCodesCount);
        var codes = dictionary.GetCodes();
        var offsets = dictionary.GetOffsets();
        var indices = dictionary.GetIndices(requiredLength);
        for (var i = 0; i < indices.length; i++)
        {
            var w = indices[i];
            if (!WordBoard._LacksLetters(codes, offsets[w], offsets[w + 1], letters.counts, scratch, letters.jokers))
                return true;
        }
        return false;
    }

    RandomDictWord(dictionary, length)
    {
        var bucket = dictionary.GetWordsOfLength(length);
        return bucket.length == 0 ? "" : bucket[this._random.NextInt(bucket.length)];
    }

    // Дорогое слово для ремонта задачи на очки слова: максимум базы по выборке
    ExpensiveDictWord(dictionary)
    {
        var bucket = dictionary.GetWordsOfLength(7).length > 0 ? dictionary.GetWordsOfLength(7) : dictionary.GetWordsOfLength(6);
        if (bucket.length == 0)
            return "";

        var best = "";
        var bestBase = -1;
        for (var i = 0; i < 40; i++)
        {
            var word = bucket[this._random.NextInt(bucket.length)];
            var base = 0;
            for (var li = 0; li < word.length; li++)
                base += this._LetterValue(word[li]);
            if (base > bestBase)
            {
                bestBase = base;
                best = word;
            }
        }
        return best;
    }

    // Подсев недостающих для слова букв вместо случайных пригодных плиток
    PlantMissingLetters(word, repaired)
    {
        if (!word)
            return;

        var counts = {};
        for (var c = 0; c < this.config.columns; c++)
        {
            for (var r = 0; r < this.config.rows; r++)
            {
                var tile = this.grid[c][r];
                if (WordBoard.IsTileUsable(tile) && !tile.joker)
                    counts[tile.letter] = (counts[tile.letter] || 0) + 1;
            }
        }

        var need = {};
        for (var i = 0; i < word.length; i++)
            need[word[i]] = (need[word[i]] || 0) + 1;

        var letters = Object.keys(need).sort();
        for (var li = 0; li < letters.length; li++)
        {
            var letter = letters[li];
            var lack = need[letter] - (counts[letter] || 0);
            for (var k = 0; k < lack; k++)
            {
                var cell = null;
                for (var attempt = 0; attempt < 60 && !cell; attempt++)
                {
                    var candidate = { c: this._random.NextInt(this.config.columns), r: this._random.NextInt(this.config.rows) };
                    if (!WordBoard.IsTileUsable(this.grid[candidate.c][candidate.r]) || WordFallCells.Contains(repaired, candidate))
                        continue;
                    cell = candidate;
                }
                if (!cell)
                    return;

                this.grid[cell.c][cell.r] = this._MakeTile(letter);
                repaired.push(cell);
            }
        }
    }

    DebugSetTile(cell, letter)
    {
        var chained = this.grid[cell.c][cell.r].chained;
        this.grid[cell.c][cell.r] = this._MakeTile(letter);
        this.grid[cell.c][cell.r].chained = chained;
    }

    DebugSetPowerup(cell, kind)
    {
        var tile = new WordTile();
        tile.powerup = kind;
        this.grid[cell.c][cell.r] = tile;
    }

    DebugSetStone(cell)
    {
        this.grid[cell.c][cell.r].stone = 1;
    }

    _IsVowel(letter)
    {
        return letter.length > 0 && this.config.vowels.indexOf(letter[0]) >= 0;
    }

    _RefillBag()
    {
        this._bag = [];
        for (var i = 0; i < this.config.letters.length; i++)
        {
            var def = this.config.letters[i];
            for (var k = 0; k < def.bagCount; k++)
                this._bag.push(def.letter);
        }
    }

    _DrawLetter(forceVowel)
    {
        if (this._bag.length == 0)
            this._RefillBag();

        var index = this._random.NextInt(this._bag.length);
        if (forceVowel && !this._IsVowel(this._bag[index]))
        {
            var vowelIndexes = [];
            for (var i = 0; i < this._bag.length; i++)
            {
                if (this._IsVowel(this._bag[i]))
                    vowelIndexes.push(i);
            }
            if (vowelIndexes.length > 0)
                index = vowelIndexes[this._random.NextInt(vowelIndexes.length)];
        }

        var letter = this._bag[index];
        this._bag.splice(index, 1);
        return letter;
    }

    // Анти-клин: среди заполненных соседей клетки две и более букв и ни одной гласной — нужна гласная
    _NeedVowelAt(column, row)
    {
        var filled = 0;
        var vowels = 0;
        for (var dc = -1; dc <= 1; dc++)
        {
            for (var dr = -1; dr <= 1; dr++)
            {
                if (dc == 0 && dr == 0)
                    continue;

                var cell = { c: column + dc, r: row + dr };
                if (!this.IsValidCell(cell) || !this.grid[cell.c] || !this.grid[cell.c][cell.r])
                    continue;

                var tile = this.grid[cell.c][cell.r];
                if (tile.letter.length == 0)
                    continue;

                filled++;
                if (this._IsVowel(tile.letter) || tile.joker)
                    vowels++;
            }
        }
        return filled >= 2 && vowels == 0;
    }

    _MakeTile(letter)
    {
        var tile = new WordTile(letter);
        tile.value = this._LetterValue(letter);
        return tile;
    }

    _LetterValue(letter)
    {
        for (var i = 0; i < this.config.letters.length; i++)
        {
            if (this.config.letters[i].letter == letter)
                return this.config.letters[i].value;
        }
        return 1;
    }

    _TileValue(tile)
    {
        return tile.joker ? 0 : tile.value*(tile.doubled ? 2 : 1);
    }

    _PowerupForLength(length)
    {
        if (length >= this.config.fireworksWordLength)
            return "fireworks";
        if (length >= this.config.rocketWordLength)
            return "rocket";
        if (length >= this.config.bombWordLength)
            return "bomb";
        return "";
    }

    // Ценность клетки как цели ракеты по приоритетам уровня
    _RocketTargetScore(cell)
    {
        var tile = this.grid[cell.c][cell.r];
        var p = this._rocketPriorities;
        if (tile.crate > 0)
            return p.crates ? 100 + tile.crate : 30;
        if (tile.snow)
            return p.snow ? 90 : 25;
        if (tile.ice > 0)
            return p.ice ? 80 : 35;
        if (tile.stone > 0)
            return 60;
        if (tile.powerup)
            return 5;

        var score = 10 + this._TileValue(tile)*3;
        if (WordFallCells.Contains(p.keepCells, cell))
            score -= 200;
        if (p.keepLetter && tile.letter == p.keepLetter)
            score -= 40;
        return score;
    }

    // Слово бьёт по соседям: лёд теряет слой, ящик — прочность, снежок тает
    _DamageAround(cells, skipCells, result)
    {
        var hit = [];
        for (var i = 0; i < cells.length; i++)
        {
            var cell = cells[i];
            for (var dc = -1; dc <= 1; dc++)
            {
                for (var dr = -1; dr <= 1; dr++)
                {
                    var target = { c: cell.c + dc, r: cell.r + dr };
                    if (!this.IsPlayable(target) || (dc == 0 && dr == 0) || WordFallCells.Contains(skipCells, target) ||
                        WordFallCells.Contains(hit, target))
                    {
                        continue;
                    }

                    var tile = this.grid[target.c][target.r];
                    if (tile.ice > 0)
                    {
                        tile.ice--;
                        if (tile.ice == 0)
                            result.iceBroken.push(target);
                    }
                    else if (tile.crate > 0)
                    {
                        tile.crate--;
                        if (tile.crate == 0)
                            result.crateBroken.push(target);
                        else
                            result.crateHit.push(target);
                    }
                    else if (tile.snow)
                    {
                        tile.snow = false;
                        result.snowMelted.push(target);
                    }
                    else
                        continue;

                    hit.push(target); // одно слово бьёт каждую клетку один раз
                }
            }
        }
    }

    _ActivatePowerups(cells)
    {
        var result = { extraScore: 0, destroyed: [], activated: [], iceBroken: [], crateHit: [], crateBroken: [],
                       snowMelted: [], used: [], targeted: [] };
        var destroyedKeys = WordFallCells.Copy(cells);

        // бонусы активируются буквой слова по соседству (8 клеток)
        var bonusCells = [];
        for (var i = 0; i < cells.length; i++)
        {
            for (var dc = -1; dc <= 1; dc++)
            {
                for (var dr = -1; dr <= 1; dr++)
                {
                    var target = { c: cells[i].c + dc, r: cells[i].r + dr };
                    if (!this.IsValidCell(target) || WordFallCells.Contains(bonusCells, target))
                        continue;

                    if (this.grid[target.c][target.r].powerup)
                        bonusCells.push(target);
                }
            }
        }

        for (var b = 0; b < bonusCells.length; b++)
        {
            var cell = bonusCells[b];
            var kind = this.grid[cell.c][cell.r].powerup;
            var use = { kind: kind, c: cell.c, r: cell.r, targets: [] };

            // бонус-плитка сгорает вместе с активацией
            if (!WordFallCells.Contains(destroyedKeys, cell))
            {
                destroyedKeys.push(cell);
                result.destroyed.push(cell);
            }

            if (kind == "bomb")
            {
                // 3×3: буквы взрываются, камни разбиваются (плитка остаётся)
                for (var dc = -1; dc <= 1; dc++)
                {
                    for (var dr = -1; dr <= 1; dr++)
                    {
                        var target = { c: cell.c + dc, r: cell.r + dr };
                        if (!this.IsValidCell(target) || WordFallCells.Contains(destroyedKeys, target))
                            continue;

                        var tile = this.grid[target.c][target.r];
                        if (this._HitObstacle(target, result))
                            continue;

                        if (!tile.letter && !tile.powerup)
                            continue;

                        result.extraScore += this._TileValue(tile);

                        if (tile.stone > 0)
                        {
                            tile.stone = 0;
                            if (!WordFallCells.Contains(result.activated, target))
                                result.activated.push(target);
                            continue;
                        }

                        if (tile.ice > 0)
                        {
                            tile.ice = 0;
                            result.iceBroken.push(target);
                        }

                        destroyedKeys.push(target);
                        result.destroyed.push(target);
                    }
                }
            }
            else if (kind == "rocket")
                this._FireRocket(cell, destroyedKeys, result, use);
            else if (kind == "fireworks")
            {
                // залп из десяти ракет
                for (var i = 0; i < 10; i++)
                    this._FireRocket(cell, destroyedKeys, result, use);
            }

            result.used.push(use);
        }

        return result;
    }

    // Ракета летит в самую выгодную по задачам клетку; среди равных — в случайную
    _FireRocket(from, destroyedKeys, result, use)
    {
        var candidates = [];
        for (var c = 0; c < this.config.columns; c++)
        {
            for (var r = 0; r < this.config.rows; r++)
            {
                var cell = { c: c, r: r };
                var tile = this.grid[c][r];
                var obstacle = tile.crate > 0 || tile.snow;
                if ((!tile.letter && !obstacle) || WordFallCells.Contains(destroyedKeys, cell) ||
                    WordFallCells.Contains(result.activated, cell) || WordFallCells.Contains(result.targeted, cell))
                {
                    continue;
                }
                candidates.push(cell);
            }
        }

        if (candidates.length == 0)
            return;

        var best = -1e9;
        var top = [];
        for (var i = 0; i < candidates.length; i++)
        {
            var score = this._RocketTargetScore(candidates[i]);
            if (score > best + 0.5)
            {
                best = score;
                top = [];
            }
            if (score >= best - 0.5)
                top.push(candidates[i]);
        }

        var target = top[this._random.NextInt(top.length)];
        var tile = this.grid[target.c][target.r];

        use.targets.push({ c: target.c, r: target.r });
        result.targeted.push(target);
        if (this._HitObstacle(target, result))
        {
            result.activated.push(target);
            return;
        }

        result.extraScore += this._TileValue(tile);

        if (tile.stone > 0)
        {
            tile.stone = 0;
            result.activated.push(target);
            return;
        }

        if (tile.ice > 0)
        {
            tile.ice = 0;
            result.iceBroken.push(target);
            result.activated.push(target);
            return;
        }

        destroyedKeys.push(target);
        result.destroyed.push(target);
    }

    // Удар бонуса по клетке-препятствию: true, если клетка поглотила удар.
    // Бонус ломает ящик целиком — доламывать его вторым ходом не читается
    _HitObstacle(cell, result)
    {
        var tile = this.grid[cell.c][cell.r];
        if (tile.hole || tile.parcel)
            return true;

        if (tile.crate > 0)
        {
            tile.crate = 0;
            result.crateBroken.push(cell);
            return true;
        }

        if (tile.snow)
        {
            tile.snow = false;
            result.snowMelted.push(cell);
            return true;
        }

        return false;
    }

    // Обвал колонок и спавн; доставленный конверт освобождает дно — обвал повторяется, ходы склеиваются
    _CollapseAndSpawn(removed, result)
    {
        for (var i = 0; i < removed.length; i++)
        {
            var cell = removed[i];
            if (!this.grid[cell.c][cell.r].hole)
                this.grid[cell.c][cell.r] = new WordTile();
        }

        for (var pass = 0; pass < 4; pass++)
        {
            var step = this._CollapseOnce();

            for (var m = 0; m < step.moved.length; m++)
            {
                var move = step.moved[m];
                var chained = false;
                for (var p = 0; p < result.moved.length; p++)
                {
                    var prev = result.moved[p];
                    if (prev.c == move.c && prev.toR == move.fromR)
                    {
                        prev.toR = move.toR;
                        chained = true;
                        break;
                    }
                }
                if (!chained)
                {
                    var spawnIndex = WordFallCells.IndexOf(result.spawned, { c: move.c, r: move.fromR });
                    if (spawnIndex >= 0)
                        result.spawned[spawnIndex] = { c: move.c, r: move.toR };
                    else
                        result.moved.push(move);
                }
            }
            for (var s = 0; s < step.spawned.length; s++)
                result.spawned.push(step.spawned[s]);

            var delivered = this._DeliverParcels();
            if (delivered.length == 0)
                break;

            for (var d = 0; d < delivered.length; d++)
                result.delivered.push(delivered[d]);
        }
    }

    // Колонки обваливаются по сегментам между статичными клетками; спавн — только в открытые сверху сегменты
    _CollapseOnce()
    {
        var moved = [];
        var spawned = [];
        var rows = this.config.rows;

        for (var c = 0; c < this.config.columns; c++)
        {
            var r = 0;
            while (r < rows)
            {
                if (WordBoard.IsTileStatic(this.grid[c][r]))
                {
                    r++;
                    continue;
                }

                var bottom = r;
                var top = r;
                while (top + 1 < rows && !WordBoard.IsTileStatic(this.grid[c][top + 1]))
                    top++;

                var stack = [];
                var fromRows = [];
                for (var i = bottom; i <= top; i++)
                {
                    if (WordBoard.IsTileOccupied(this.grid[c][i]))
                    {
                        stack.push(this.grid[c][i]);
                        fromRows.push(i);
                    }
                }

                var fed = true;
                for (var i = top + 1; i < rows; i++)
                {
                    if (!this.grid[c][i].hole)
                    {
                        fed = false;
                        break;
                    }
                }

                for (var i = bottom; i <= top; i++)
                {
                    var index = i - bottom;
                    if (index < stack.length)
                    {
                        this.grid[c][i] = stack[index];
                        if (fromRows[index] != i)
                            moved.push({ c: c, fromR: fromRows[index], toR: i });
                    }
                    else if (fed)
                    {
                        this.grid[c][i] = this._MakeTile(this._DrawLetter(this._NeedVowelAt(c, i)));
                        spawned.push({ c: c, r: i });
                    }
                    else
                        this.grid[c][i] = new WordTile();
                }

                r = top + 1;
            }
        }

        // конверты и снежки уровня входят сверху вместо обычной буквы: по одному
        // на колонку, в самую верхнюю новую плитку колонки
        var topSpawnByColumn = [];
        for (var c = 0; c < this.config.columns; c++)
            topSpawnByColumn.push(-1);
        for (var i = 0; i < spawned.length; i++)
            topSpawnByColumn[spawned[i].c] = Math.max(topSpawnByColumn[spawned[i].c], spawned[i].r);

        var columns = [];
        for (var c = 0; c < this.config.columns; c++)
        {
            if (topSpawnByColumn[c] >= 0)
                columns.push(c);
        }

        while ((this._pendingParcels > 0 || this._pendingSnow > 0) && columns.length > 0)
        {
            var column = columns[this._random.NextInt(columns.length)];
            columns.splice(columns.indexOf(column), 1);
            var tile = new WordTile();
            if (this._pendingParcels > 0)
            {
                tile.parcel = true;
                this._pendingParcels--;
            }
            else
            {
                tile.snow = true;
                this._pendingSnow--;
            }
            this.grid[column][topSpawnByColumn[column]] = tile;
        }

        return { moved: moved, spawned: spawned };
    }

    // Конверт на самой нижней играбельной клетке колонки доставлен
    _DeliverParcels()
    {
        var delivered = [];
        for (var c = 0; c < this.config.columns; c++)
        {
            for (var r = 0; r < this.config.rows; r++)
            {
                var tile = this.grid[c][r];
                if (tile.hole)
                    continue;

                if (tile.parcel)
                {
                    this.grid[c][r] = new WordTile();
                    delivered.push({ c: c, r: r });
                }
                break;
            }
        }
        return delivered;
    }

    // Раскладывает буквы слова по случайным играбельным клеткам: слово собираемо,
    // но не бросается в глаза, как выложенное в линию
    // Клетки слова: сперва среди свободных от препятствий, а когда таких нет — среди любых
    _SeedWord(word)
    {
        for (var i = 0; i < word.length; i++)
        {
            var cell = null;
            for (var attempt = 0; attempt < 120 && !cell; attempt++)
            {
                var candidate = { c: this._random.NextInt(this.config.columns), r: this._random.NextInt(this.config.rows) };
                if (WordFallCells.Contains(this.seededCells, candidate) || !this.IsPlayable(candidate))
                    continue;
                if (attempt < 60 && WordFallCells.Contains(this._reservedCells, candidate))
                    continue;
                if (attempt >= 60 && WordFallCells.Contains(this._presetCells, candidate))
                    continue;
                cell = candidate;
            }
            if (!cell)
                return;

            this.grid[cell.c][cell.r] = this._MakeTile(word[i]);
            this.seededCells.push(cell);
        }
    }
};
