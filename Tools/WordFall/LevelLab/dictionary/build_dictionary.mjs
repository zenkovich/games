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

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.resolve(here, '../../../../Assets/WordFall');

export function readTable(language)
{
    const rows = [];
    const seen = new Set();
    const text = fs.readFileSync(path.join(here, language + '.tsv'), 'utf8');
    for (const line of text.split('\n'))
    {
        if (!line.trim())
            continue;
        const [word, difficulty, familiarity, kind] = line.split('\t');
        const d = Number(difficulty), f = Number(familiarity);
        if (!word || !(d >= 1 && d <= 9) || !(f >= 1 && f <= 9) || !['.', 'w', 'n', 'p'].includes(kind))
            throw new Error(language + '.tsv: bad line "' + line + '"');
        if (seen.has(word))
            throw new Error(language + '.tsv: duplicate word ' + word);
        seen.add(word);
        rows.push({ word, difficulty: d, familiarity: f, kind });
    }
    rows.sort((a, b) => a.word.length - b.word.length || (a.word < b.word ? -1 : a.word > b.word ? 1 : 0));
    return rows;
}

export function buildAsset(language)
{
    const rows = readTable(language);
    const languages = JSON.parse(fs.readFileSync(path.join(assets, 'languages.json'), 'utf8')).languages;
    const config = languages.find((item) => item.code == language);
    const alphabet = new Set(config ? config.alphabet : '');
    for (const row of rows)
    {
        for (const letter of row.word)
        {
            if (!alphabet.has(letter))
                throw new Error(language + ': "' + row.word + '" has a letter outside the alphabet of languages.json');
        }
    }
    return {
        language,
        words: rows.map((row) => row.word).join(' '),
        difficulty: rows.map((row) => row.difficulty).join(''),
        familiarity: rows.map((row) => row.familiarity).join(''),
        kinds: rows.map((row) => row.kind).join('')
    };
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
