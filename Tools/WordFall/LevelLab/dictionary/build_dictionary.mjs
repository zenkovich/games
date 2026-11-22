#!/usr/bin/env node
// Builds the game dictionaries (Assets/WordFall/Dictionaries/<lang>.json) from the rated word tables next to
// this script: <lang>.tsv with lines "WORD<TAB>difficulty<TAB>familiarity<TAB>kind" (kind: "." ordinary,
// "w" ordinary and fit to be a level's word, "n" proper name, "p" rude). Words are never dropped here: the table
// is the dictionary.
//
//   node build_dictionary.mjs            build every language
//   node build_dictionary.mjs ru         build one
//   node build_dictionary.mjs --check    only verify that the assets match the tables
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTable, assetOf } from './table.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.resolve(here, '../../../../Assets/WordFall');

export function readTable(language)
{
    return parseTable(language, fs.readFileSync(path.join(here, language + '.tsv'), 'utf8'));
}

export function buildAsset(language)
{
    return assetOf(language, readTable(language), fs.readFileSync(path.join(assets, 'languages.json'), 'utf8'));
}

function main()
{
    const args = process.argv.slice(2);
    const check = args.includes('--check');
    const wanted = args.filter((arg) => !arg.startsWith('--'));
    const all = fs.readdirSync(here).filter((name) => name.endsWith('.tsv')).map((name) => name.slice(0, -4));
    let stale = 0;
    for (const language of wanted.length > 0 ? wanted : all)
    {
        const asset = buildAsset(language);
        const file = path.join(assets, 'Dictionaries', language + '.json');
        const text = JSON.stringify(asset);
        const count = asset.kinds.length;
        if (check)
        {
            const same = fs.existsSync(file) && fs.readFileSync(file, 'utf8') == text;
            stale += same ? 0 : 1;
            console.log(language + ': ' + count + ' words, asset ' + (same ? 'is up to date' : 'DIFFERS from the table'));
            continue;
        }
        fs.writeFileSync(file, text);
        console.log(language + ': ' + count + ' words -> ' + path.relative(process.cwd(), file));
    }
    process.exit(stale > 0 ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) == fileURLToPath(import.meta.url))
    main();
