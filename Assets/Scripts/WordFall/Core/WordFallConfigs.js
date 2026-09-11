// Конфиги поля, уровней и задач. Уровни читаются в формате campaign.json
// (C++-сериализация: клетки {x, y}, поля со значением по умолчанию опущены),
// внутри клетки — {c, r}
WordFallConfigs = class WordFallConfigs
{
    // Типы задач уровня
    static get TaskTypes()
    {
        return ["Word", "Length", "Powerup", "ClearIce", "AnyWords", "WordScore", "Letter", "Deliver", "Melt", "Crates"];
    }

    // Мешок и номиналы русского прототипа (100 плиток, без Ъ/Ё)
    static DefaultRussianLetters()
    {
        var table = [
            ["О", 1, 9], ["А", 1, 8], ["Е", 1, 8], ["И", 1, 7], ["Н", 1, 6], ["Т", 1, 6],
            ["С", 2, 5], ["Р", 2, 5], ["В", 2, 4], ["Л", 2, 4], ["К", 2, 4],
            ["М", 3, 3], ["Д", 3, 3], ["П", 3, 3], ["У", 3, 3],
            ["Я", 4, 2], ["Ы", 4, 2], ["Ь", 4, 2], ["Г", 4, 2], ["З", 4, 2], ["Б", 4, 2],
            ["Ч", 5, 1], ["Й", 5, 1], ["Х", 5, 1], ["Ж", 5, 1], ["Ш", 5, 1],
            ["Ю", 5, 1], ["Ц", 5, 1], ["Щ", 5, 1], ["Э", 5, 1], ["Ф", 5, 1]
        ];
        return table.map(function(e) { return { letter: e[0], value: e[1], bagCount: e[2] }; });
    }

    static DefaultBoardConfig()
    {
        return {
            columns: 7,
            rows: 8,
            vowels: "АЕИОУЫЭЮЯ",
            maxConsonantRun: 4,
            bombWordLength: 5,
            rocketWordLength: 6,
            fireworksWordLength: 7,
            letters: WordFallConfigs.DefaultRussianLetters()
        };
    }

    // Полный конфиг поля из частичного (поля, заданные в редакторе, перекрывают умолчания)
    static NormalizeBoard(raw)
    {
        var config = WordFallConfigs.DefaultBoardConfig();
        if (!raw)
            return config;

        for (var key in config)
        {
            if (raw[key] !== undefined && raw[key] !== null)
                config[key] = raw[key];
        }
        config.letters = config.letters.map(function(def) {
            return { letter: def.letter, value: def.value !== undefined ? def.value : 1, bagCount: def.bagCount !== undefined ? def.bagCount : 1 };
        });
        return config;
    }

    static MakeTask(fields)
    {
        var task = { taskType: "Word", word: "", length: 4, powerupKind: "", count: 1, scoreThreshold: 18, letter: "" };
        for (var key in fields)
        {
            if (fields[key] !== undefined && fields[key] !== null)
                task[key] = fields[key];
        }
        return task;
    }

    static MakeWord(word) { return WordFallConfigs.MakeTask({ taskType: "Word", word: word }); }
    static MakeLength(length, count) { return WordFallConfigs.MakeTask({ taskType: "Length", length: length, count: count }); }
    static MakePowerup(kind, count) { return WordFallConfigs.MakeTask({ taskType: "Powerup", powerupKind: kind, count: count }); }
    static MakeClearIce() { return WordFallConfigs.MakeTask({ taskType: "ClearIce" }); }
    static MakeAnyWords(count) { return WordFallConfigs.MakeTask({ taskType: "AnyWords", count: count }); }
    static MakeWordScore(threshold) { return WordFallConfigs.MakeTask({ taskType: "WordScore", scoreThreshold: threshold }); }
    static MakeLetter(letter, count) { return WordFallConfigs.MakeTask({ taskType: "Letter", letter: letter, count: count }); }
    static MakeDeliver(count) { return WordFallConfigs.MakeTask({ taskType: "Deliver", count: count }); }
    static MakeMelt(count) { return WordFallConfigs.MakeTask({ taskType: "Melt", count: count }); }
    static MakeCrates() { return WordFallConfigs.MakeTask({ taskType: "Crates" }); }

    static DefaultLevelConfig()
    {
        return {
            targetScore: 250,
            moves: 12,
            iceCells: [],
            stoneCells: [],
            holeCells: [],
            crateCells: [],
            crateGrades: [],
            chainCells: [],
            snowCells: [],
            snowPerMove: 0,
            parcelCells: [],
            parcelTotal: 0,
            parcelOnScreen: 1,
            powerupCells: [],
            powerupKinds: [],
            extraVowels: 0,
            extraRare: 0,
            boosterCharges: [3, 3, 3, 3, 3],
            tasks: []
        };
    }

    // Конфиг уровня из campaign.json или из редактора
    static NormalizeLevel(raw)
    {
        var config = WordFallConfigs.DefaultLevelConfig();
        if (!raw)
            return config;

        var toCell = function(cell) {
            return cell.c !== undefined ? { c: cell.c, r: cell.r } : { c: cell.x || 0, r: cell.y || 0 };
        };

        for (var key in config)
        {
            var value = raw[key];
            if (value === undefined || value === null)
                continue;

            if (key.endsWith("Cells"))
                config[key] = value.map(toCell);
            else if (key == "tasks")
                config.tasks = value.map(function(task) { return WordFallConfigs.MakeTask(task); });
            else if (Array.isArray(value))
                config[key] = value.slice();
            else
                config[key] = value;
        }
        return config;
    }

    // Кампания по умолчанию (3 уровня прототипа)
    static DefaultCampaign()
    {
        var cells = function(list) { return list.map(function(p) { return { c: p[0], r: p[1] }; }); };

        var level1 = WordFallConfigs.DefaultLevelConfig();
        level1.targetScore = 250;
        level1.moves = 12;
        level1.iceCells = cells([[1, 6], [5, 2], [4, 7], [0, 1]]);
        level1.tasks = [WordFallConfigs.MakeWord("КОТ"), WordFallConfigs.MakeLength(4, 2), WordFallConfigs.MakeClearIce()];

        var level2 = WordFallConfigs.DefaultLevelConfig();
        level2.targetScore = 350;
        level2.moves = 12;
        level2.iceCells = cells([[0, 5], [2, 6], [4, 6], [6, 5], [3, 3], [5, 2]]);
        level2.tasks = [WordFallConfigs.MakeWord("ЧАШКА"), WordFallConfigs.MakeLength(4, 2), WordFallConfigs.MakePowerup("bomb", 1)];

        var level3 = WordFallConfigs.DefaultLevelConfig();
        level3.targetScore = 500;
        level3.moves = 14;
        level3.iceCells = cells([[0, 6], [1, 5], [2, 7], [3, 4], [4, 7], [5, 5], [6, 6], [3, 2]]);
        level3.tasks = [WordFallConfigs.MakeWord("РАКЕТА"), WordFallConfigs.MakeLength(5, 1),
                        WordFallConfigs.MakePowerup("rocket", 1), WordFallConfigs.MakeClearIce()];

        return [level1, level2, level3];
    }

    // Длина слова, которое приносит бонус вида kind
    static PowerupLength(kind)
    {
        return kind == "rocket" ? 6 : kind == "fireworks" ? 7 : 5;
    }
};

// Помощники для списков клеток {c, r}
WordFallCells = class WordFallCells
{
    static Equal(a, b) { return a.c == b.c && a.r == b.r; }

    static IndexOf(list, cell)
    {
        for (var i = 0; i < list.length; i++)
        {
            if (list[i].c == cell.c && list[i].r == cell.r)
                return i;
        }
        return -1;
    }

    static Contains(list, cell) { return WordFallCells.IndexOf(list, cell) >= 0; }

    static Copy(list) { return list.map(function(cell) { return { c: cell.c, r: cell.r }; }); }
};
