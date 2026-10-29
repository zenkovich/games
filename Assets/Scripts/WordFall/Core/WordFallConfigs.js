include("Scripts/WordFall/Core/WordFallLanguages.js");

// Конфиги поля, уровней и задач. Уровни читаются в формате campaign.json
// (C++-сериализация: клетки {x, y}, поля со значением по умолчанию опущены),
// внутри клетки — {c, r}. Слова уровня — отдельный список words, не задачи:
// старые задачи "Word" при чтении переезжают в него.
// Слова, буквы клеток и буква задачи "Letter" в файле хранятся по языкам: {"ru": ..., "en": ...}.
// Нормализованный конфиг несёт их для своего языка language, а других языков — в other*,
// чтобы правка уровня на одном языке не стирала остальные
WordFallConfigs = class WordFallConfigs
{
    // Типы задач уровня (слова — отдельный блок уровня)
    static get TaskTypes()
    {
        return ["Length", "Powerup", "ClearIce", "AnyWords", "WordScore", "Letter", "Deliver", "Melt", "Crates"];
    }

    static get MaxDifficulty() { return 10; }

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

    // language — язык, к которому относится строковая fields.letter (по умолчанию текущий)
    static MakeTask(fields, language)
    {
        var task = { taskType: "Word", word: "", length: 4, powerupKind: "", count: 1, scoreThreshold: 18, letter: "" };
        for (var key in fields)
        {
            if (fields[key] !== undefined && fields[key] !== null)
                task[key] = fields[key];
        }
        var toLetter = function(letter) { return letter ? String(letter).charAt(0).toUpperCase() : ""; };
        var letters = WordFallConfigs._AllLanguages(fields.letter, fields.otherLetters, language || WordFallLanguages.Current(), toLetter);
        task.letter = WordFallConfigs._Split(letters, toLetter(""), function(other) { task.otherLetters = other; });
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
            id: "",             // постоянный идентификатор уровня, не зависит от места в кампании
            name: "",
            difficulty: 3,      // 1..10: агент подбирает по ней слова и цель по очкам
            words: [],          // слова, которые надо найти (заданные вручную)
            wordsAuto: 0,       // сколько ещё слов подбирает агент по словарю языка
            wordMinLength: 0,   // длины слов агента; 0 — по сложности
            wordMaxLength: 0,
            autoTarget: false,  // цель по очкам считает агент
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
            letterCells: [],
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
        var toLetterCells = function(list) {
            return (Array.isArray(list) ? list : []).map(function(cell) {
                var letterCell = toCell(cell);
                letterCell.letter = String(cell.letter || "").toUpperCase();
                return letterCell;
            }).filter(function(cell) { return cell.letter.length > 0; });
        };
        var toWords = function(list) {
            return (Array.isArray(list) ? list : []).map(function(word) { return String(word).toUpperCase(); }).filter(function(word) { return word.length > 0; });
        };

        var own = raw.language || WordFallLanguages.Current();
        for (var key in config)
        {
            var value = raw[key];
            if (value === undefined || value === null || key == "words" || key == "letterCells")
                continue;

            if (key.endsWith("Cells"))
                config[key] = value.map(toCell);
            else if (key == "tasks")
                config.tasks = value.map(function(task) { return WordFallConfigs.MakeTask(task, own); });
            else if (Array.isArray(value))
                config[key] = value.slice();
            else
                config[key] = value;
        }

        config.language = WordFallLanguages.Current();
        config.words = WordFallConfigs._Split(WordFallConfigs._AllLanguages(raw.words, raw.otherWords, own, toWords), [],
                                              function(other) { config.otherWords = other; });
        config.letterCells = WordFallConfigs._Split(WordFallConfigs._AllLanguages(raw.letterCells, raw.otherLetterCells, own, toLetterCells), [],
                                                    function(other) { config.otherLetterCells = other; });

        var legacyWords = config.tasks.filter(function(task) { return task.taskType == "Word"; });
        config.tasks = config.tasks.filter(function(task) { return task.taskType != "Word"; });
        legacyWords.forEach(function(task) {
            var word = (task.word || "").toUpperCase();
            if (word && config.words.indexOf(word) < 0)
                config.words.push(word);
        });
        config.difficulty = Math.min(Math.max(Math.round(config.difficulty), 1), WordFallConfigs.MaxDifficulty);
        return config;
    }

    // Уровень играбелен на текущем языке: в конфиге есть слова этого языка
    static IsLevelValid(config)
    {
        return WordFallConfigs.NormalizeLevel(config).words.length > 0;
    }

    // Уровень из файла старого формата: слова списком и буквы строкой — это базовый язык
    static UpgradeFileLevel(raw)
    {
        if (!raw || typeof raw != "object")
            return raw;

        var level = JSON.parse(JSON.stringify(raw));
        var base = WordFallLanguages.BaseLanguage;
        if (!level.language)
        {
            if (Array.isArray(level.words))
                level.words = WordFallConfigs._Single(base, level.words);
            if (Array.isArray(level.letterCells))
                level.letterCells = WordFallConfigs._Single(base, level.letterCells);
            if (Array.isArray(level.tasks))
            {
                level.tasks.forEach(function(task) {
                    if (task && typeof task.letter == "string")
                        task.letter = WordFallConfigs._Single(base, task.letter);
                });
            }
        }
        return level;
    }

    static _Single(code, value)
    {
        var map = {};
        map[code] = value;
        return map;
    }

    static _IsMap(value)
    {
        return value !== null && typeof value == "object" && !Array.isArray(value);
    }

    // Значения всех языков {код: значение}: из файла (value — карта) или из нормализованного
    // конфига (others — другие языки, value — значение языка own)
    static _AllLanguages(value, others, own, convert)
    {
        var map = {};
        if (WordFallConfigs._IsMap(others))
        {
            for (var code in others)
                map[code] = convert(others[code]);
        }
        if (WordFallConfigs._IsMap(value))
        {
            for (var code in value)
                map[code] = convert(value[code]);
        }
        else if (value !== undefined && value !== null)
            map[own] = convert(value);
        return map;
    }

    // Значение текущего языка (empty, если его нет); непустые значения остальных — в setOthers
    static _Split(map, empty, setOthers)
    {
        var current = WordFallLanguages.Current();
        var others = {};
        for (var code in map)
        {
            if (code != current && map[code].length > 0)
                others[code] = map[code];
        }
        setOthers(others);
        return map[current] !== undefined ? map[current] : empty;
    }

    // Значения всех языков нормализованного поля: другие языки и значение текущего
    static _WithCurrent(others, value)
    {
        var map = {};
        for (var code in others || {})
            map[code] = others[code];
        map[WordFallLanguages.Current()] = value;
        return map;
    }

    // Конфиг уровня в формате campaign.json: только отличия от умолчаний, клетки {x, y}
    static CompactLevel(config)
    {
        var defaults = WordFallConfigs.DefaultLevelConfig();
        var level = WordFallConfigs.NormalizeLevel(config);
        var compact = {};
        for (var key in defaults)
        {
            var value = level[key];
            if (key == "words")
            {
                var words = WordFallConfigs._CompactMap(WordFallConfigs._WithCurrent(level.otherWords, level.words), function(list) { return list.slice(); });
                if (words)
                    compact.words = words;
                continue;
            }
            if (key == "letterCells")
            {
                var letterCells = WordFallConfigs._CompactMap(WordFallConfigs._WithCurrent(level.otherLetterCells, level.letterCells), function(list) {
                    return list.map(function(cell) { return { x: cell.c, y: cell.r, letter: cell.letter }; });
                });
                if (letterCells)
                    compact.letterCells = letterCells;
                continue;
            }
            if (JSON.stringify(value) === JSON.stringify(defaults[key]))
                continue;

            if (key.endsWith("Cells"))
                compact[key] = value.map(function(cell) { return { x: cell.c, y: cell.r }; });
            else if (key == "tasks")
                compact[key] = value.map(WordFallConfigs.CompactTask);
            else
                compact[key] = Array.isArray(value) ? value.slice() : value;
        }
        return compact;
    }

    static CompactTask(task)
    {
        var defaults = WordFallConfigs.MakeTask({});
        var normalized = WordFallConfigs.MakeTask(task);
        var compact = {};
        for (var key in defaults)
        {
            if (key == "letter" || key == "otherLetters")
                continue;
            if (normalized[key] !== undefined && JSON.stringify(normalized[key]) !== JSON.stringify(defaults[key]))
                compact[key] = normalized[key];
        }
        var letters = WordFallConfigs._CompactMap(WordFallConfigs._WithCurrent(normalized.otherLetters, normalized.letter), function(letter) { return letter; });
        if (letters)
            compact.letter = letters;
        return compact;
    }

    // Карта по языкам без пустых значений, в порядке кодов; null — пусто во всех языках
    static _CompactMap(map, convert)
    {
        var result = {};
        var any = false;
        Object.keys(map || {}).sort().forEach(function(code) {
            if (map[code] && map[code].length > 0)
            {
                result[code] = convert(map[code]);
                any = true;
            }
        });
        return any ? result : null;
    }

    // Подпись задания по его конфигу
    static TaskCaption(task)
    {
        switch (task.taskType)
        {
            case "Length": return "Слова из " + task.length + " букв ×" + task.count;
            case "Powerup": return ({ bomb: "Бомба", rocket: "Ракета", fireworks: "Салют" }[task.powerupKind] || "Бонус") + " ×" + task.count;
            case "ClearIce": return "Весь лёд";
            case "AnyWords": return "Слов: " + task.count;
            case "WordScore": return "Слово на " + task.scoreThreshold + "+ очков";
            case "Letter": return "Буква " + task.letter + " ×" + task.count;
            case "Deliver": return "Конверты ×" + task.count;
            case "Melt": return "Снежки ×" + task.count;
            case "Crates": return "Все ящики";
        }
        return task.taskType;
    }

    // Кампания по умолчанию (3 уровня прототипа)
    static DefaultCampaign()
    {
        var cells = function(list) { return list.map(function(p) { return { c: p[0], r: p[1] }; }); };

        var level1 = WordFallConfigs.DefaultLevelConfig();
        level1.id = "L001";
        level1.targetScore = 250;
        level1.moves = 12;
        level1.iceCells = cells([[1, 6], [5, 2], [4, 7], [0, 1]]);
        level1.words = ["КОТ"];
        level1.tasks = [WordFallConfigs.MakeLength(4, 2), WordFallConfigs.MakeClearIce()];

        var level2 = WordFallConfigs.DefaultLevelConfig();
        level2.id = "L002";
        level2.targetScore = 350;
        level2.moves = 12;
        level2.iceCells = cells([[0, 5], [2, 6], [4, 6], [6, 5], [3, 3], [5, 2]]);
        level2.words = ["ЧАШКА"];
        level2.tasks = [WordFallConfigs.MakeLength(4, 2), WordFallConfigs.MakePowerup("bomb", 1)];

        var level3 = WordFallConfigs.DefaultLevelConfig();
        level3.id = "L003";
        level3.targetScore = 500;
        level3.moves = 14;
        level3.iceCells = cells([[0, 6], [1, 5], [2, 7], [3, 4], [4, 7], [5, 5], [6, 6], [3, 2]]);
        level3.words = ["РАКЕТА"];
        level3.tasks = [WordFallConfigs.MakeLength(5, 1), WordFallConfigs.MakePowerup("rocket", 1), WordFallConfigs.MakeClearIce()];

        return [level1, level2, level3];
    }

    // Идентификатор уровня по номеру в кампании: L001, L002...
    static LevelId(index)
    {
        var number = "" + (index + 1);
        while (number.length < 3)
            number = "0" + number;
        return "L" + number;
    }

    // Название уровня для списков: имя, иначе идентификатор
    static LevelTitle(config)
    {
        return config.name ? config.name : config.id;
    }

    // «слово / слова / слов» для числа n
    static WordsNoun(n)
    {
        var tens = n % 100, ones = n % 10;
        if (tens >= 11 && tens <= 14)
            return "слов";
        return ones == 1 ? "слово" : ones >= 2 && ones <= 4 ? "слова" : "слов";
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
