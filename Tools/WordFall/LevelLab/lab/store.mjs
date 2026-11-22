// Files of the lab: the game's campaign (Assets/WordFall/campaign.json — the levels themselves) and, next to the
// tool, what only the lab needs: the difficulty curve, the settings and per-level notes (target, statistics).
// io: { read(rel) -> text | null, write(rel, text), backup?(rel, label) -> path } over the project's files
// (node_host.mjs: the checkout; the portal's plugin: the project's working copy through the bridge).
import { paths } from './core.mjs';
import { normalizeCurve } from './curve.mjs';
import { normalizeSettings } from './difficulty.mjs';

export const storeFiles = {
    campaign: paths.campaign,
    curve: paths.data + '/curve.json',
    settings: paths.data + '/settings.json',
    meta: paths.data + '/levels.json',
    shapes: paths.data + '/shapes.json'
};

function readJson(io, rel, fallback)
{
    try
    {
        const text = io.read(rel);
        return text == null ? fallback : JSON.parse(text);
    }
    catch (error) { return fallback; }
}

// one level per line: a change of a level is one line of the diff
export function campaignText(campaign)
{
    return '[\n' + campaign.map((level) => JSON.stringify(level)).join(',\n') + '\n]\n';
}

export class Store
{
    constructor(io)
    {
        this.io = io;
        this.campaign = readJson(io, storeFiles.campaign, []);
        this.curve = normalizeCurve(readJson(io, storeFiles.curve, null));
        this.settings = normalizeSettings(readJson(io, storeFiles.settings, null));
        this.meta = (readJson(io, storeFiles.meta, {}) || {}).levels || {};
        this._backedUp = false;
    }

    indexOf(id) { return this.campaign.findIndex((level) => level.id == id); }
    level(id) { return this.campaign[this.indexOf(id)] || null; }

    // The campaign as it was before this session's first change, kept among the backups (where the host keeps any)
    backup(label)
    {
        return this.io.backup ? this.io.backup(storeFiles.campaign, label) : '';
    }

    saveCampaign()
    {
        if (!this._backedUp)
        {
            this.backup('before');
            this._backedUp = true;
        }
        this.io.write(storeFiles.campaign, campaignText(this.campaign));
    }

    saveMeta()
    {
        const ids = new Set(this.campaign.map((level) => level.id));
        for (const id in this.meta)
        {
            if (!ids.has(id))
                delete this.meta[id];
        }
        this.io.write(storeFiles.meta, JSON.stringify({ version: 1, levels: this.meta }, null, 2) + '\n');
    }

    saveCurve(curve)
    {
        this.curve = normalizeCurve(curve);
        this.io.write(storeFiles.curve, JSON.stringify(this.curve, null, 2) + '\n');
    }

    saveSettings(settings)
    {
        this.settings = normalizeSettings(settings);
        this.io.write(storeFiles.settings, JSON.stringify(this.settings, null, 2) + '\n');
    }

    setLevel(index, level, meta)
    {
        this.campaign[index] = level;
        if (meta)
            this.meta[level.id] = meta;
    }

    // Words every other level of the campaign already asks for, by language
    usedWords(exceptIndex)
    {
        const used = {};
        this.campaign.forEach((level, index) => {
            if (index == exceptIndex || !level || !level.words)
                return;
            for (const language in level.words)
            {
                used[language] = used[language] || new Set();
                for (const word of level.words[language])
                    used[language].add(word);
            }
        });
        return used;
    }

    freeId()
    {
        let max = 0;
        for (const level of this.campaign)
        {
            const match = /^L(\d+)$/.exec(level.id || '');
            if (match)
                max = Math.max(max, Number(match[1]));
        }
        return 'L' + String(max + 1).padStart(3, '0');
    }
}
