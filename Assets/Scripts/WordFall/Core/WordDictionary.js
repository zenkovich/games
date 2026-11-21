// Словарь допустимых слов. Матчинг с джокером: '?' совпадает с любой буквой.
// У каждого слова две оценки 1..9 — сложность (как трудно додуматься до слова и собрать его) и узнаваемость
// (какая доля взрослых знает слово) — и вид: обычное, имя собственное или грубое; часть обычных слов помечена
// как годные в слова уровня (знакомое всем существительное, которое легко представить)
WordDictionary = class WordDictionary
{
    static get KindCommon() { return 0; }
    static get KindName() { return 1; }
    static get KindRude() { return 2; }

    // ratings — {difficulty, familiarity, kinds}: строки по символу на слово в порядке words
    constructor(words, ratings)
    {
        this.Load(words || [], ratings);
    }

    static LoadDefault()
    {
        return WordDictionary.LoadAsset("WordFall/Dictionaries/ru.json");
    }

    // Словарь из data-ассета {"language", "words", "difficulty", "familiarity", "kinds"}: слова одной строкой
    // через пробел, оценки — строками цифр 1..9, виды — "." обычное, "w" обычное и годится в слова уровня,
    // "n" имя, "p" грубое
    static LoadAsset(path)
    {
        var asset = new o2.AssetRefDataAsset(path);
        if (!asset.IsValid())
        {
            print("WordFall: no dictionary asset " + path);
            return new WordDictionary([]);
        }

        var json = asset.Get().GetJson();
        var data = null;
        var words = o2.Profile("WordDictionary: parse words", function() {
            data = JSON.parse(json);
            return (data.words || "").split(" ").filter(function(w) { return w.length > 0; });
        });
        return o2.Profile("WordDictionary: build index", function() { return new WordDictionary(words, data); });
    }

    Load(words, ratings)
    {
        this._words = [];
        this._byLength = {};
        this._set = new Map(); // слово -> индекс первого вхождения

        var total = 0;
        for (var i = 0; i < words.length; i++)
            total += words[i].length;

        // коды букв всех слов одним буфером: десятки тысяч мелких массивов нагружали бы сборщик мусора
        this._codes = new Uint8Array(total);
        this._offsets = new Int32Array(words.length + 1);
        this._masks = { lo: new Int32Array(words.length), hi: new Int32Array(words.length) };
        var indicesByLength = {};
        var offset = 0;
        for (var i = 0; i < words.length; i++)
        {
            var word = words[i];
            this._offsets[i] = offset;
            for (var li = 0; li < word.length; li++)
            {
                var code = WordDictionary.LetterCode(word[li]);
                this._codes[offset++] = code;
                if (code < 32)
                    this._masks.lo[i] |= 1 << code;
                else
                    this._masks.hi[i] |= 1 << (code - 32);
            }

            this._words.push(word);
            (this._byLength[word.length] = this._byLength[word.length] || []).push(word);
            (indicesByLength[word.length] = indicesByLength[word.length] || []).push(i);
            if (!this._set.has(word))
                this._set.set(word, i);
        }
        this._offsets[words.length] = offset;

        this._indicesByLength = {};
        for (var length in indicesByLength)
            this._indicesByLength[length] = Int32Array.from(indicesByLength[length]);
        this._allIndices = new Int32Array(words.length);
        for (var i = 0; i < words.length; i++)
            this._allIndices[i] = i;

        this._LoadRatings(ratings);
    }

    // Без оценок в ассете: сложность по длине слова, узнаваемость средняя
    _LoadRatings(ratings)
    {
        var count = this._words.length;
        var aligned = function(text) { return typeof text == "string" && text.length == count; };
        var difficulty = ratings && aligned(ratings.difficulty) ? ratings.difficulty : null;
        var familiarity = ratings && aligned(ratings.familiarity) ? ratings.familiarity : null;
        var kinds = ratings && aligned(ratings.kinds) ? ratings.kinds : null;

        this._rated = difficulty != null && familiarity != null;
        this._difficulty = new Uint8Array(count);
        this._familiarity = new Uint8Array(count);
        this._kinds = new Uint8Array(count);
        this._levelWords = new Uint8Array(count);
        this._levelWordsCount = 0;
        for (var i = 0; i < count; i++)
        {
            var byLength = Math.min(Math.max(this._words[i].length - 1, 1), 9);
            this._difficulty[i] = difficulty ? Math.min(Math.max(difficulty.charCodeAt(i) - 48, 1), 9) : byLength;
            this._familiarity[i] = familiarity ? Math.min(Math.max(familiarity.charCodeAt(i) - 48, 1), 9) : 6;
            var kind = kinds ? kinds[i] : ".";
            this._kinds[i] = kind == "n" ? WordDictionary.KindName : kind == "p" ? WordDictionary.KindRude : WordDictionary.KindCommon;
            if (kind == "w")
            {
                this._levelWords[i] = 1;
                this._levelWordsCount++;
            }
        }
    }

    HasRatings() { return this._rated; }
    GetDifficulty(index) { return this._difficulty[index]; }
    GetFamiliarity(index) { return this._familiarity[index]; }
    GetKind(index) { return this._kinds[index]; }

    // Имена и грубые слова только принимаются от игрока: ни в слова уровня, ни в подсказку они не идут
    IsCommon(index) { return this._kinds[index] == WordDictionary.KindCommon; }

    // Годится в слова уровня; в словаре без такой разметки — любое обычное слово
    IsLevelWord(index) { return this._levelWordsCount > 0 ? this._levelWords[index] == 1 : this._kinds[index] == WordDictionary.KindCommon; }
    HasLevelWords() { return this._levelWordsCount > 0; }

    IsEmpty() { return this._words.length == 0; }
    GetWordsCount() { return this._words.length; }
    GetAllWords() { return this._words; }
    GetWordsOfLength(length) { return this._byLength[length] || []; }

    // Коды букв слова index лежат в GetCodes() с GetOffsets()[index] по GetOffsets()[index + 1]
    GetCodes() { return this._codes; }
    GetOffsets() { return this._offsets; }

    // Индексы слов (опц. точной длины) для перебора по кодам
    GetIndices(length) { return length > 0 ? (this._indicesByLength[length] || new Int32Array(0)) : this._allIndices; }

    // Какие буквы есть в слове index: бит кода в lo[index] (коды 0..31) или hi[index] (32..63)
    GetLetterMasks() { return this._masks; }

    // Индекс слова в словаре, -1 — нет такого
    IndexOf(word)
    {
        var index = this._set.get(word);
        return index === undefined ? -1 : index;
    }

    // Число различимых кодов букв
    static get LetterCodesCount() { return 64; }

    // Код буквы: кириллица А..Я — 0..31, Ё — 32, латиница A..Z — 33..58, прочие по порядку появления
    static LetterCode(letter)
    {
        var code = letter.charCodeAt(0);
        if (code >= 0x410 && code <= 0x42F)
            return code - 0x410;
        if (code == 0x401)
            return 32;
        if (code >= 0x41 && code <= 0x5A)
            return 33 + code - 0x41;

        var other = WordDictionary._otherCodes || (WordDictionary._otherCodes = {});
        if (other[letter] === undefined)
            other[letter] = Math.min(59 + Object.keys(other).length, WordDictionary.LetterCodesCount - 1);
        return other[letter];
    }

    static LetterCodes(word)
    {
        var codes = new Uint8Array(word.length);
        for (var i = 0; i < word.length; i++)
            codes[i] = WordDictionary.LetterCode(word[i]);
        return codes;
    }

    // Есть ли слово; pattern может содержать '?'
    Contains(pattern)
    {
        if (pattern.length < 2)
            return false;

        if (pattern.indexOf("?") < 0)
            return this._set.has(pattern);

        var bucket = this.GetWordsOfLength(pattern.length);
        for (var i = 0; i < bucket.length; i++)
        {
            if (WordDictionary.MatchPattern(pattern, bucket[i]))
                return true;
        }
        return false;
    }

    static MatchPattern(pattern, word)
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
};
