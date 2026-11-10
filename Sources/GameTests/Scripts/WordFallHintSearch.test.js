include("Scripts/WordFall/Core/WordFallCore.js");

// Поиск слова подсказки и самого дорогого слова: быстрый перебор находит то же, что прямой
// (эталон — прежний алгоритм, где каждое собираемое слово проходит через оценщик)
(function()
{
    var dictionary = WordDictionary.LoadDefault();
    var boardConfig = WordFallConfigs.DefaultBoardConfig();

    function Cell(c, r) { return { c: c, r: r }; }

    function ReferenceFindBestWordBy(board, scorer)
    {
        var pool = [];
        for (var c = 0; c < board.config.columns; c++)
        {
            for (var r = 0; r < board.config.rows; r++)
            {
                var tile = board.grid[c][r];
                if (WordBoard.IsTileUsable(tile))
                    pool.push({ cell: Cell(c, r), code: WordDictionary.LetterCode(tile.letter), value: board._TileValue(tile), joker: tile.joker });
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
        var words = dictionary.GetAllWords(), codes = dictionary.GetCodes(), offsets = dictionary.GetOffsets();
        var bestIndex = -1, bestValue = -1;
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

        var cells = [], nextJoker = 0;
        for (var i = offsets[bestIndex]; i < offsets[bestIndex + 1]; i++)
        {
            var code = codes[i];
            var index = cursor[code] < counts[code] ? byLetter[code][cursor[code]] : jokers[nextJoker++];
            cursor[code]++;
            cells.push(pool[index].cell);
        }
        return { word: words[bestIndex], cells: cells };
    }

    // Прежний оценщик подсказки
    function ReferenceHint(level)
    {
        var taskWord = level.NextWord(), letterWanted = "", lengthWanted = 0, powerupLength = 0, scoreWanted = 0;
        var wanted = level.words.filter(function(word) { return !word.found; }).map(function(word) { return word.word; });
        level.tasks.forEach(function(task) {
            if (task.done)
                return;
            switch (task.config.taskType)
            {
                case "Length": lengthWanted = task.config.length; break;
                case "Letter": letterWanted = task.config.letter; break;
                case "WordScore": scoreWanted = task.config.scoreThreshold; break;
                case "Powerup": powerupLength = WordFallConfigs.PowerupLength(task.config.powerupKind); break;
            }
        });

        return ReferenceFindBestWordBy(level.GetBoard(), function(candidate, value) {
            if (level.IsWordUsed(candidate))
                return 0;
            if (taskWord && candidate == taskWord)
                return 100000;
            if (wanted.indexOf(candidate) >= 0)
                return 50000;

            var weight = value, length = candidate.length;
            if (lengthWanted > 0 && length == lengthWanted)
                weight *= 2.2;
            if (powerupLength > 0 && length == powerupLength)
                weight *= 1.8;
            if (scoreWanted > 0 && value >= scoreWanted)
                weight *= 2.0;
            if (letterWanted)
            {
                var hits = 0;
                for (var i = 0; i < length; i++)
                    hits += candidate[i] == letterWanted ? 1 : 0;
                weight *= 1 + 0.5*hits;
            }
            if (length <= 3)
                weight *= 0.8;
            else if (length == 7)
                weight *= 0.5;
            else if (length >= 8)
                weight *= 0.3;
            return weight;
        });
    }

    function Describe(found)
    {
        return found ? found.word + " " + found.cells.map(function(cell) { return cell.c + ":" + cell.r; }).join(",") : "null";
    }

    function Variants()
    {
        return [
            {},
            { tasks: [WordFallConfigs.MakeLength(5, 2)] },
            { tasks: [WordFallConfigs.MakeLetter("О", 3)] },
            { tasks: [WordFallConfigs.MakeWordScore(25)] },
            { tasks: [WordFallConfigs.MakePowerup("rocket", 1)] },
            { words: ["КОТ", "ЛУНА"], wordsAuto: 0 },
            { tasks: [WordFallConfigs.MakeLength(4, 1), WordFallConfigs.MakeLetter("А", 2), WordFallConfigs.MakeWordScore(15)] }
        ];
    }

    function StartLevel(seed)
    {
        var variants = Variants();
        var config = WordFallConfigs.DefaultLevelConfig();
        config.targetScore = 100000;
        config.moves = 20;
        var fields = variants[seed % variants.length];
        for (var key in fields)
            config[key] = fields[key];

        var level = new WordLevel();
        level.Start(config, boardConfig, dictionary, seed);

        // джокеры добирают недостающие буквы, использованные слова подсказка пропускает
        var board = level.GetBoard();
        for (var j = 0; j < seed % 3; j++)
            board.MakeJoker(Cell((seed + 3*j) % boardConfig.columns, (seed*5 + j) % boardConfig.rows));
        if (seed % 4 == 0)
        {
            var first = ReferenceHint(level);
            if (first)
                level._usedWords.push(first.word);
        }
        return level;
    }

    test("HintFindsWhatTheDirectSearchFinds", function()
    {
        for (var seed = 1; seed <= 14; seed++)
        {
            var level = StartLevel(seed);
            expectEq(Describe(level.FindHint(dictionary)), Describe(ReferenceHint(level)), "сид " + seed);
        }
    });

    test("BestWordMatchesTheDirectSearch", function()
    {
        var lengths = [0, 4, 8];
        for (var seed = 1; seed <= 6; seed++)
        {
            var board = StartLevel(seed).GetBoard();
            for (var i = 0; i < lengths.length; i++)
            {
                var length = lengths[i];
                var expected = ReferenceFindBestWordBy(board, function(word, value) {
                    return length > 0 && word.length != length ? 0 : value;
                });
                expectEq(Describe(board.FindBestWord(dictionary, length)), Describe(expected), "сид " + seed + ", длина " + length);
            }
        }
    });

    test("SteppedSearchFindsTheSameWord", function()
    {
        for (var seed = 1; seed <= 7; seed++)
        {
            var level = StartLevel(seed);
            var search = level.BeginHintSearch(dictionary);
            var steps = 0;
            while (!search.Step(700))
                steps++;
            expect(steps > 10, "словарь проходится частями: " + steps);
            expectEq(Describe(search.Result()), Describe(level.FindHint(dictionary)), "сид " + seed);
        }
    });

    // Задание на очки слова выполнимо, пока на поле собирается слово не дешевле порога
    test("WordWorthMatchesTheBestWord", function()
    {
        for (var seed = 1; seed <= 6; seed++)
        {
            var board = StartLevel(seed).GetBoard();
            var best = board.FindBestWord(dictionary, 0);
            var top = best ? Math.ceil(best.value) : 0;
            var thresholds = [1, Math.max(1, top - 3), top, top + 1, top + 20];
            for (var i = 0; i < thresholds.length; i++)
                expectEq(board.AnyWordWorth(dictionary, thresholds[i]), top >= thresholds[i], "сид " + seed + ", порог " + thresholds[i]);
        }
    });

    // Граница оценщика отсекает слова, которые не обгонят лучшее: оценщик видит малую долю собираемых слов
    test("BoundSkipsHopelessWords", function()
    {
        var board = StartLevel(7).GetBoard();
        var all = 0, bounded = 0;
        var full = board.FindBestWordBy(dictionary, function(word, value) { all++; return value; });
        var bound = new Float64Array(WordSearch.maxBoundLength + 1).fill(1);
        var fast = board.FindBestWordBy(dictionary, function(word, value) { bounded++; return value; }, { bound: bound });

        expectEq(Describe(fast), Describe(full));
        expect(all > 1000, "на поле собирается много слов: " + all);
        expect(bounded*10 < all, "оценщик видит " + bounded + " из " + all);
    });
})();
