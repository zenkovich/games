include("Scripts/WordFall/Core/WordFallConfigs.js");
include("Scripts/WordFall/Core/WordFallRandom.js");

// Процедурная цепочка уровней: конфиг детерминированно строится по индексу —
// цель, ходы, лёд и задания растут по рампе сложности. Первое задание — всегда
// точечное слово (оно же сидится на поле)
WordFallLevels = class WordFallLevels
{
    static Generate(index, dictionary, boardConfig)
    {
        var rng = new WordFallRandom((977 + index*7919) >>> 0);
        var config = WordFallConfigs.DefaultLevelConfig();

        var tier = Math.floor(index/10);
        config.moves = 12 + Math.min(4, Math.floor(index/25));
        config.targetScore = 250 + tier*50 + rng.NextInt(30);
        config.boosterCharges = [3, 3, 30, 3, 3];

        var iceCount = Math.min(3 + Math.floor(index/12), 10);
        var usedCells = [];
        var guard = 0;
        while (config.iceCells.length < iceCount && guard++ < 300)
        {
            var cell = { c: rng.NextInt(boardConfig.columns), r: rng.NextInt(boardConfig.rows) };
            if (WordFallCells.Contains(usedCells, cell))
                continue;
            usedCells.push(cell);
            config.iceCells.push(cell);
        }

        // камни появляются с пятого уровня, медленно нарастая
        var stoneCount = index >= 4 ? Math.min(1 + Math.floor((index - 4)/10), 4) : 0;
        while (config.stoneCells.length < stoneCount && guard++ < 600)
        {
            var cell = { c: rng.NextInt(boardConfig.columns), r: rng.NextInt(boardConfig.rows) };
            if (WordFallCells.Contains(usedCells, cell))
                continue;
            usedCells.push(cell);
            config.stoneCells.push(cell);
        }

        config.tasks.push(WordFallConfigs.MakeWord(WordFallLevels._PickTaskWord(3 + rng.NextInt(3), rng, dictionary, boardConfig)));

        var pool = ["length", "anyWords", "wordScore", "powerup", "clearIce", "word2"];
        for (var i = pool.length - 1; i > 0; i--)
        {
            var j = rng.NextInt(i + 1);
            var tmp = pool[i];
            pool[i] = pool[j];
            pool[j] = tmp;
        }

        var extraCount = 2 + rng.NextInt(Math.min(3, 1 + Math.floor(index/15)));
        for (var i = 0; i < extraCount && i < pool.length; i++)
        {
            var kind = pool[i];
            if (kind == "length")
                config.tasks.push(WordFallConfigs.MakeLength(4 + rng.NextInt(2), 1 + rng.NextInt(2)));
            else if (kind == "anyWords")
                config.tasks.push(WordFallConfigs.MakeAnyWords(4 + rng.NextInt(4)));
            else if (kind == "wordScore")
                config.tasks.push(WordFallConfigs.MakeWordScore(18 + tier*2 + rng.NextInt(8)));
            else if (kind == "powerup")
            {
                var kinds = index < 10 ? ["bomb"] : index < 25 ? ["bomb", "rocket"] : ["bomb", "rocket", "fireworks"];
                config.tasks.push(WordFallConfigs.MakePowerup(kinds[rng.NextInt(kinds.length)], 1));
            }
            else if (kind == "clearIce")
                config.tasks.push(WordFallConfigs.MakeClearIce());
            else
                config.tasks.push(WordFallConfigs.MakeWord(WordFallLevels._PickTaskWord(4 + rng.NextInt(2), rng, dictionary, boardConfig)));
        }

        // «разбить весь лёд» при 8-10 льдинах невыполнимо за лимит ходов
        var hasClearIce = config.tasks.some(function(task) { return task.taskType == "ClearIce"; });
        if (hasClearIce && config.iceCells.length > 6)
            config.iceCells.length = 6;

        return config;
    }

    // Слово-задание из частых букв (низкие номиналы) — обычно обиходная лексика
    static _PickTaskWord(length, rng, dictionary, boardConfig)
    {
        var bucket = dictionary.GetWordsOfLength(length);
        if (bucket.length == 0)
            return "";

        var letterValue = function(letter) {
            for (var i = 0; i < boardConfig.letters.length; i++)
            {
                if (boardConfig.letters[i].letter == letter)
                    return boardConfig.letters[i].value;
            }
            return 5;
        };

        for (var attempt = 0; attempt < 30; attempt++)
        {
            var word = bucket[rng.NextInt(bucket.length)];
            var rare = false;
            for (var i = 0; i < word.length; i++)
            {
                if (letterValue(word[i]) > 3)
                    rare = true;
            }
            if (!rare)
                return word;
        }
        return bucket[rng.NextInt(bucket.length)];
    }
};
