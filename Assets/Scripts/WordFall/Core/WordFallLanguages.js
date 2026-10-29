include("Scripts/WordFall/Core/WordFallConfigs.js");
include("Scripts/WordFall/Core/WordDictionary.js");

globalThis.WordFallGame = globalThis.WordFallGame || {};

// Языки игры из data-ассета WordFall/languages.json: у каждого свой алфавит, номиналы и мешок
// букв, гласные и словарь. Текущий язык задаёт, какие буквы падают на поле и какие слова уровня
// берутся из конфига; уровни хранят слова и буквы по кодам языков
WordFallLanguages = class WordFallLanguages
{
    static get ConfigPath() { return "WordFall/languages.json"; }

    // Язык уровней старого формата, где слова — просто список, а буква задачи — строка
    static get BaseLanguage() { return "ru"; }

    static List()
    {
        return WordFallLanguages._Config().languages.map(function(language) { return { code: language.code, name: language.name }; });
    }

    static Get(code)
    {
        var languages = WordFallLanguages._Config().languages;
        for (var i = 0; i < languages.length; i++)
        {
            if (languages[i].code == code)
                return languages[i];
        }
        return null;
    }

    static Default() { return WordFallLanguages._Config().default; }

    static Current()
    {
        var code = WordFallGame.language;
        return code && WordFallLanguages.Get(code) ? code : WordFallLanguages.Default();
    }

    // Делает язык текущим; неизвестный код — язык по умолчанию. Возвращает установленный код
    static SetCurrent(code)
    {
        WordFallGame.language = code && WordFallLanguages.Get(code) ? code : WordFallLanguages.Default();
        return WordFallGame.language;
    }

    // Следующий язык по списку — переключатель в читах
    static Next(code)
    {
        var list = WordFallLanguages.List();
        for (var i = 0; i < list.length; i++)
        {
            if (list[i].code == code)
                return list[(i + 1) % list.length].code;
        }
        return list.length > 0 ? list[0].code : WordFallLanguages.BaseLanguage;
    }

    static Alphabet(code)
    {
        var language = WordFallLanguages.Get(code || WordFallLanguages.Current());
        if (!language)
            return "";
        return language.alphabet || language.letters.map(function(def) { return def.letter; }).join("");
    }

    // Конфиг поля с буквами, номиналами и гласными языка; исходный не меняется
    static ApplyBoard(boardConfig, code)
    {
        var result = {};
        for (var key in boardConfig)
            result[key] = boardConfig[key];

        var language = WordFallLanguages.Get(code || WordFallLanguages.Current());
        if (!language)
            return result;

        result.letters = language.letters.map(function(def) { return { letter: def.letter, value: def.value, bagCount: def.bagCount }; });
        result.vowels = language.vowels;
        if (language.maxConsonantRun > 0)
            result.maxConsonantRun = language.maxConsonantRun;
        return result;
    }

    // Словарь языка; разбор десятков тысяч слов — один раз на язык, общий для всех сервисов
    static Dictionary(code)
    {
        code = code || WordFallLanguages.Current();
        var cache = WordFallGame.dictionaries || (WordFallGame.dictionaries = {});
        if (!cache[code])
        {
            var language = WordFallLanguages.Get(code);
            cache[code] = language ? WordDictionary.LoadAsset(language.dictionary) : new WordDictionary([]);
            if (cache[code].IsEmpty())
                print("WordFall: dictionary of language " + code + " is empty");
        }
        return cache[code];
    }

    static _Config()
    {
        if (WordFallGame.languagesConfig)
            return WordFallGame.languagesConfig;

        var config = null;
        var asset = new o2.AssetRefDataAsset(WordFallLanguages.ConfigPath);
        if (asset.IsValid())
        {
            try
            {
                config = WordFallLanguages._Normalize(JSON.parse(asset.Get().GetJson()));
            }
            catch (e)
            {
                print("WordFall: broken languages config " + WordFallLanguages.ConfigPath + ": " + e);
            }
        }
        if (!config)
        {
            print("WordFall: languages config " + WordFallLanguages.ConfigPath + " is missing, only Russian is available");
            config = WordFallLanguages._Normalize({});
        }
        WordFallGame.languagesConfig = config;
        return config;
    }

    static _Normalize(raw)
    {
        var languages = (Array.isArray(raw.languages) ? raw.languages : []).filter(function(language) {
            return language && language.code && Array.isArray(language.letters) && language.letters.length > 0;
        }).map(function(language) {
            return {
                code: language.code,
                name: language.name || language.code,
                alphabet: language.alphabet || "",
                vowels: language.vowels || "",
                maxConsonantRun: language.maxConsonantRun || 0,
                dictionary: language.dictionary || "WordFall/Dictionaries/" + language.code + ".json",
                letters: language.letters.map(function(def) {
                    return { letter: String(def.letter).toUpperCase(), value: def.value !== undefined ? def.value : 1, bagCount: def.bagCount !== undefined ? def.bagCount : 1 };
                })
            };
        });

        if (languages.length == 0)
        {
            var board = WordFallConfigs.DefaultBoardConfig();
            languages.push({ code: "ru", name: "Русский", alphabet: "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЫЬЭЮЯ", vowels: board.vowels, maxConsonantRun: 0,
                             dictionary: "WordFall/Dictionaries/ru.json", letters: board.letters });
        }

        var codes = languages.map(function(language) { return language.code; });
        return { default: codes.indexOf(raw.default) >= 0 ? raw.default : codes[0], languages: languages };
    }
};
