include("Scripts/WordFall/Core/WordFallDictionaryData.js");

// Словарь допустимых слов. Матчинг с джокером: '?' совпадает с любой буквой
WordDictionary = class WordDictionary
{
    constructor(words)
    {
        this.Load(words || []);
    }

    static LoadDefault()
    {
        return new WordDictionary(WordFallDictionaryData.split(" ").filter(function(w) { return w.length > 0; }));
    }

    Load(words)
    {
        this._words = [];
        this._byLength = {};
        this._set = new Set();

        var total = 0;
        for (var i = 0; i < words.length; i++)
            total += words[i].length;

        // коды букв всех слов одним буфером: десятки тысяч мелких массивов нагружали бы сборщик мусора
        this._codes = new Uint8Array(total);
        this._offsets = new Int32Array(words.length + 1);
        var indicesByLength = {};
        var offset = 0;
        for (var i = 0; i < words.length; i++)
        {
            var word = words[i];
            this._offsets[i] = offset;
            for (var li = 0; li < word.length; li++)
                this._codes[offset++] = WordDictionary.LetterCode(word[li]);

            this._words.push(word);
            (this._byLength[word.length] = this._byLength[word.length] || []).push(word);
            (indicesByLength[word.length] = indicesByLength[word.length] || []).push(i);
            this._set.add(word);
        }
        this._offsets[words.length] = offset;

        this._indicesByLength = {};
        for (var length in indicesByLength)
            this._indicesByLength[length] = Int32Array.from(indicesByLength[length]);
        this._allIndices = new Int32Array(words.length);
        for (var i = 0; i < words.length; i++)
            this._allIndices[i] = i;
    }

    IsEmpty() { return this._words.length == 0; }
    GetWordsCount() { return this._words.length; }
    GetAllWords() { return this._words; }
    GetWordsOfLength(length) { return this._byLength[length] || []; }

    // Коды букв слова index лежат в GetCodes() с GetOffsets()[index] по GetOffsets()[index + 1]
    GetCodes() { return this._codes; }
    GetOffsets() { return this._offsets; }

    // Индексы слов (опц. точной длины) для перебора по кодам
    GetIndices(length) { return length > 0 ? (this._indicesByLength[length] || new Int32Array(0)) : this._allIndices; }

    // Число различимых кодов букв
    static get LetterCodesCount() { return 64; }

    // Код буквы: кириллица А..Я — 0..31, Ё — 32, прочие по порядку появления
    static LetterCode(letter)
    {
        var code = letter.charCodeAt(0);
        if (code >= 0x410 && code <= 0x42F)
            return code - 0x410;
        if (code == 0x401)
            return 32;

        var other = WordDictionary._otherCodes || (WordDictionary._otherCodes = {});
        if (other[letter] === undefined)
            other[letter] = Math.min(33 + Object.keys(other).length, WordDictionary.LetterCodesCount - 1);
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
