// A rated word table (<lang>.tsv: "WORD<TAB>difficulty<TAB>familiarity<TAB>kind") and the game asset built from it,
// as text in and text out: build_dictionary.mjs runs it over the checkout, the lab's API over whatever its io reads.

export function parseTable(language, text)
{
    const rows = [];
    const seen = new Set();
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

// languagesText: Assets/WordFall/languages.json, whose alphabets every word must keep to
export function assetOf(language, rows, languagesText)
{
    const languages = JSON.parse(languagesText).languages;
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
