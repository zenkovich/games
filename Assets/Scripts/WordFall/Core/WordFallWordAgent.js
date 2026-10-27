include("Scripts/WordFall/Core/WordFallConfigs.js");
include("Scripts/WordFall/Core/WordFallRandom.js");
include("Scripts/WordFall/Core/WordDictionary.js");

// Агент подбора слов уровня: по сложности, числу слов и их длине выбирает слова из словаря
// текущего языка и считает цель по очкам. В уровне хранятся только эти параметры — слова
// подбираются на старте, поэтому уровень переносится на другой язык заменой словаря.
// Подбор детерминирован: один и тот же уровень с тем же словарём получает те же слова
WordFallWordAgent = class WordFallWordAgent
{
    // Очков за ход по сложности: откалибровано по кампании (~15 на первых уровнях, ~40 на поздних)
    static PointsPerMove(difficulty)
    {
        return 14 + 3*(WordFallWordAgent._Difficulty(difficulty) - 1);
    }

    // Диапазон длин слов: заданный уровнем или по сложности
    static LengthRange(config)
    {
        var d = WordFallWordAgent._Difficulty(config.difficulty);
        var byDifficulty = [[3, 4], [3, 4], [3, 5], [4, 5], [4, 6], [4, 6], [5, 6], [5, 7], [5, 7], [6, 8]][d - 1];
        var min = config.wordMinLength > 0 ? config.wordMinLength : byDifficulty[0];
        var max = config.wordMaxLength > 0 ? config.wordMaxLength : byDifficulty[1];
        min = Math.min(Math.max(min, 2), 8);
        max = Math.min(Math.max(max, min), 8);
        return { min: min, max: max };
    }

    // Сложность слова 0..1: редкость букв в мешке, редкие буквы, повторы и длина
    static WordDifficulty(word, boardConfig, values)
    {
        values = values || WordFallWordAgent._LetterValues(boardConfig);
        var sum = 0, rare = 0, seen = {}, repeats = 0;
        for (var i = 0; i < word.length; i++)
        {
            var value = values[word[i]] || 5;
            sum += value;
            rare += value >= 4 ? 1 : 0;
            repeats += seen[word[i]] ? 1 : 0;
            seen[word[i]] = true;
        }
        var avg = (sum/word.length - 1)/3;
        var length = (word.length - 3)/5;
        var k = 0.5*Math.min(1, avg) + 0.25*Math.min(1, rare/2) + 0.15*Math.min(1, Math.max(0, length)) + 0.1*Math.min(1, repeats/2);
        return Math.min(1, Math.max(0, k));
    }

    // Слова уровня: заданные вручную и подобранные агентом (wordsAuto штук)
    static ResolveWords(config, dictionary, boardConfig)
    {
        var words = config.words.slice();
        if (config.wordsAuto > 0)
            words = words.concat(WordFallWordAgent.PickWords(config, dictionary, boardConfig, words));
        return words;
    }

    // Подбор count слов (по умолчанию wordsAuto): длины распределены по диапазону от коротких
    // к длинным, сложность каждого слова близка к сложности уровня; exclude — уже занятые слова
    static PickWords(config, dictionary, boardConfig, exclude, count)
    {
        count = count !== undefined ? count : config.wordsAuto;
        var picked = [];
        if (count <= 0 || !dictionary || dictionary.IsEmpty())
            return picked;

        var range = WordFallWordAgent.LengthRange(config);
        var rng = new WordFallRandom(WordFallWordAgent.SeedFor(config));
        var target = (WordFallWordAgent._Difficulty(config.difficulty) - 1)/(WordFallConfigs.MaxDifficulty - 1);
        var values = WordFallWordAgent._LetterValues(boardConfig);
        var taken = {};
        (exclude || []).forEach(function(word) { taken[word] = true; });

        for (var i = 0; i < count; i++)
        {
            var length = count == 1 ? Math.round((range.min + range.max)/2)
                       : range.min + Math.round(i*(range.max - range.min)/(count - 1));
            var word = WordFallWordAgent._PickOne(dictionary, boardConfig, values, length, target, rng, taken);
            for (var spread = 1; !word && spread <= 4; spread++)
                word = WordFallWordAgent._PickOne(dictionary, boardConfig, values, length + (spread % 2 ? spread : -spread), target, rng, taken);
            if (!word)
                continue;
            taken[word] = true;
            picked.push(word);
        }
        return picked;
    }

    // Цель по очкам: каждое слово — по своей оценке, остальные ходы — по очкам за ход сложности
    static TargetScore(config, words, boardConfig)
    {
        var self = WordFallWordAgent;
        var wordsScore = 0;
        for (var i = 0; i < words.length; i++)
            wordsScore += self.EstimateWordScore(words[i], boardConfig);
        var freeMoves = Math.max(0, config.moves - words.length);
        var target = wordsScore + freeMoves*self.PointsPerMove(config.difficulty);
        return Math.max(10, Math.round(target/10)*10);
    }

    // Очки слова при полуплотной выкладке: база × длина × кластер 1.5
    static EstimateWordScore(word, boardConfig)
    {
        var values = WordFallWordAgent._LetterValues(boardConfig);
        var base = 0;
        for (var i = 0; i < word.length; i++)
            base += values[word[i]] || 1;
        var lengthMultiplier = word.length > 3 ? 1 + 0.25*(word.length - 3) : 1;
        return Math.ceil(base*lengthMultiplier*1.5);
    }

    // Сид подбора: от идентификатора уровня, иначе от его параметров
    static SeedFor(config)
    {
        var key = (config.id || "") + "|" + config.difficulty + "|" + config.wordsAuto + "|" + config.wordMinLength + "|" + config.wordMaxLength;
        var hash = 2166136261;
        for (var i = 0; i < key.length; i++)
        {
            hash ^= key.charCodeAt(i);
            hash = Math.imul(hash, 16777619) >>> 0;
        }
        return (hash || 1) >>> 0;
    }

    // Подходящее слово длины length: из мешка набираемое, сложность ближе к цели; из лучших
    // кандидатов — случайное по сиду, чтобы соседние уровни не получали одни и те же слова
    static _PickOne(dictionary, boardConfig, values, length, target, rng, taken)
    {
        if (length < 2 || length > 8)
            return "";

        var ranked = WordFallWordAgent._Ranked(dictionary, boardConfig, values, length, target);
        var pool = [];
        for (var i = 0; i < ranked.length && pool.length < 40; i++)
        {
            if (!taken[ranked[i]])
                pool.push(ranked[i]);
        }
        return pool.length > 0 ? pool[rng.NextInt(pool.length)] : "";
    }

    // Слова длины length по близости сложности к цели; ранжирование запоминается — редактор
    // пересчитывает подбор на каждую правку
    static _Ranked(dictionary, boardConfig, values, length, target)
    {
        if (!dictionary._agentKey)
            dictionary._agentKey = "d" + (WordFallWordAgent._dictionaries = (WordFallWordAgent._dictionaries || 0) + 1);
        var key = dictionary._agentKey + "|" + JSON.stringify(values) + "|" + length + "|" + target.toFixed(4);
        var cache = WordFallWordAgent._cache || (WordFallWordAgent._cache = {});
        if (cache[key])
            return cache[key];

        var bucket = dictionary.GetWordsOfLength(length);
        var scored = [];
        for (var i = 0; i < bucket.length; i++)
        {
            var word = bucket[i];
            if (WordFallWordAgent._Spellable(word, values))
                scored.push({ word: word, distance: Math.abs(WordFallWordAgent.WordDifficulty(word, boardConfig, values) - target) });
        }
        scored.sort(function(a, b) { return a.distance - b.distance || (a.word < b.word ? -1 : 1); });
        var ranked = scored.slice(0, 400).map(function(item) { return item.word; });
        cache[key] = ranked;
        return ranked;
    }

    // Все буквы слова есть в мешке поля
    static _Spellable(word, values)
    {
        for (var i = 0; i < word.length; i++)
        {
            if (values[word[i]] === undefined)
                return false;
        }
        return true;
    }

    static _LetterValues(boardConfig)
    {
        var values = {};
        var letters = (boardConfig || WordFallConfigs.DefaultBoardConfig()).letters;
        for (var i = 0; i < letters.length; i++)
        {
            if (letters[i].bagCount > 0)
                values[letters[i].letter] = letters[i].value;
        }
        return values;
    }

    static _Difficulty(difficulty)
    {
        return Math.min(Math.max(Math.round(difficulty || 1), 1), WordFallConfigs.MaxDifficulty);
    }
};
