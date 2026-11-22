// Loads the game's own rule scripts (Assets/Scripts/WordFall/Core) into this realm: the lab plays the very code the
// game runs, so a simulated attempt cannot drift from the real one. Where the files come from and how a script is run
// is the host's business: Node reads the checkout (node_host.mjs), a page on the o2 portal gets them through the
// portal's plugin bridge (web_host.mjs).

// Project files the lab knows, relative to the project's root
export const paths = {
    assets: 'Assets',
    campaign: 'Assets/WordFall/campaign.json',
    languages: 'Assets/WordFall/languages.json',
    dictionaries: 'Assets/WordFall/Dictionaries',
    scripts: 'Assets/Scripts/WordFall/Core',
    lab: 'Tools/WordFall/LevelLab',
    data: 'Tools/WordFall/LevelLab/data',
    tables: 'Tools/WordFall/LevelLab/dictionary'
};

export const coreScripts = [
    'WordFallRandom.js', 'WordDictionary.js', 'WordFallConfigs.js', 'WordFallLanguages.js', 'WordFallRemote.js',
    'WordBoard.js', 'WordFallWordAgent.js', 'WordLevel.js', 'WordFallLevels.js', 'WordFallBot.js'
];

// host: { kind, readText(rel) -> string | undefined, exists?(rel), runScript(code, rel), parallelism(), makeWorker(),
//         readFile?(file), writeFile?(file, text) }
let host = null;
if (typeof process !== 'undefined' && process.versions && process.versions.node)
    host = (await import('./node_host.mjs')).host;

export function setHost(next) { host = next; }
export function getHost()
{
    if (!host)
        throw new Error('LevelLab: no host to read the game files from');
    return host;
}

let loaded = false;

export function loadCore()
{
    if (loaded)
        return globalThis;
    const lab = getHost();
    loaded = true;

    const exists = (rel) => (lab.exists ? lab.exists(rel) : lab.readText(rel) !== undefined);
    globalThis.include = function() {};
    globalThis.print = function(text) { if (globalThis.__labVerbose) console.log(text); };
    globalThis.o2 = {
        Profile: function(name, body) { return body(); },
        Component: class {},
        FileSystem: {
            ReadFile: function(file) { return lab.readFile ? lab.readFile(file) : undefined; },
            WriteFile: function(file, text) { return lab.writeFile ? lab.writeFile(file, text) : false; }
        },
        AssetRefDataAsset: class {
            constructor(asset) { this._rel = paths.assets + '/' + asset; }
            IsValid() { return exists(this._rel); }
            Get() { const rel = this._rel; return { GetJson: function() { return lab.readText(rel); } }; }
        }
    };

    for (const name of coreScripts)
    {
        const rel = paths.scripts + '/' + name;
        const code = lab.readText(rel);
        if (code === undefined)
            throw new Error('LevelLab: no ' + rel);
        lab.runScript(code, rel);
    }
    return globalThis;
}

// The rules were loaded from files that have changed since (a dictionary saved): the next call reads them again
export function reloadDictionaries()
{
    if (globalThis.WordFallGame)
        globalThis.WordFallGame.dictionaries = {};
}

// Board config of a language, as the game service builds it (the scene keeps the default board)
export function boardConfig(language)
{
    loadCore();
    return WordFallLanguages.ApplyBoard(WordFallConfigs.NormalizeBoard(null), language);
}

export function dictionary(language)
{
    loadCore();
    return WordFallLanguages.Dictionary(language);
}

export function languages()
{
    loadCore();
    return WordFallLanguages.List().map(function(language) { return language.code; });
}

// Stable 32-bit hash for seeds: the same level, attempt and salt always replay the same game
export function seedOf()
{
    var hash = 2166136261;
    var key = Array.prototype.join.call(arguments, '|');
    for (var i = 0; i < key.length; i++)
    {
        hash ^= key.charCodeAt(i);
        hash = Math.imul(hash, 16777619) >>> 0;
    }
    return (hash || 1) >>> 0;
}
