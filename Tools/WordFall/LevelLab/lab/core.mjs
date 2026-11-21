// Loads the game's own rule scripts (Assets/Scripts/WordFall/Core) into this Node realm: the lab plays the
// very code the game runs, so a simulated attempt cannot drift from the real one.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(here, '../../../..');
export const assetsRoot = path.join(projectRoot, 'Assets');
export const labRoot = path.resolve(here, '..');
export const dataRoot = path.join(labRoot, 'data');
export const campaignPath = path.join(assetsRoot, 'WordFall/campaign.json');

const coreScripts = [
    'WordFallRandom.js', 'WordDictionary.js', 'WordFallConfigs.js', 'WordFallLanguages.js', 'WordFallRemote.js',
    'WordBoard.js', 'WordFallWordAgent.js', 'WordLevel.js', 'WordFallLevels.js', 'WordFallBot.js'
];

let loaded = false;

export function loadCore()
{
    if (loaded)
        return globalThis;
    loaded = true;

    globalThis.include = function() {};
    globalThis.print = function(text) { if (globalThis.__labVerbose) console.log(text); };
    globalThis.o2 = {
        Profile: function(name, body) { return body(); },
        Component: class {},
        FileSystem: {
            ReadFile: function(file) { try { return fs.readFileSync(file, 'utf8'); } catch (e) { return undefined; } },
            WriteFile: function(file, text) { try { fs.writeFileSync(file, text); return true; } catch (e) { return false; } }
        },
        AssetRefDataAsset: class {
            constructor(asset) { this._file = path.join(assetsRoot, asset); }
            IsValid() { return fs.existsSync(this._file); }
            Get() { var file = this._file; return { GetJson: function() { return fs.readFileSync(file, 'utf8'); } }; }
        }
    };

    for (const name of coreScripts)
    {
        const file = path.join(assetsRoot, 'Scripts/WordFall/Core', name);
        vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
    }
    return globalThis;
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

export function readCampaign()
{
    return JSON.parse(fs.readFileSync(campaignPath, 'utf8'));
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
