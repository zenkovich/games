// Files of the lab: the game's campaign (Assets/WordFall/campaign.json — the levels themselves) and, next to the
// tool, what only the lab needs: the difficulty curve, the settings and per-level notes (target, statistics).
import fs from 'node:fs';
import path from 'node:path';
import { campaignPath, dataRoot } from './core.mjs';
import { normalizeCurve } from './curve.mjs';
import { normalizeSettings } from './difficulty.mjs';

const curvePath = path.join(dataRoot, 'curve.json');
const settingsPath = path.join(dataRoot, 'settings.json');
const metaPath = path.join(dataRoot, 'levels.json');
const backupsRoot = path.join(dataRoot, 'backups');

function readJson(file, fallback)
{
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (error) { return fallback; }
}

function writeJson(file, value, text)
{
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = file + '.tmp';
    fs.writeFileSync(temporary, text || JSON.stringify(value, null, 2) + '\n');
    fs.renameSync(temporary, file);
}

let backedUp = false;

export class Store
{
    constructor()
    {
        this.campaign = readJson(campaignPath, []);
        this.curve = normalizeCurve(readJson(curvePath, null));
        this.settings = normalizeSettings(readJson(settingsPath, null));
        this.meta = (readJson(metaPath, {}) || {}).levels || {};
    }

    indexOf(id) { return this.campaign.findIndex((level) => level.id == id); }
    level(id) { return this.campaign[this.indexOf(id)] || null; }

    // The campaign as it was before this session's first change, kept among the backups
    backup(label)
    {
        if (!fs.existsSync(campaignPath))
            return '';
        fs.mkdirSync(backupsRoot, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const file = path.join(backupsRoot, 'campaign-' + stamp + (label ? '-' + label : '') + '.json');
        fs.copyFileSync(campaignPath, file);
        const old = fs.readdirSync(backupsRoot).filter((name) => name.startsWith('campaign-')).sort();
        while (old.length > 30)
            fs.unlinkSync(path.join(backupsRoot, old.shift()));
        return file;
    }

    saveCampaign()
    {
        if (!backedUp)
        {
            this.backup('before');
            backedUp = true;
        }
        // one level per line: a change of a level is one line of the diff
        const text = '[\n' + this.campaign.map((level) => JSON.stringify(level)).join(',\n') + '\n]\n';
        writeJson(campaignPath, null, text);
    }

    saveMeta()
    {
        const ids = new Set(this.campaign.map((level) => level.id));
        for (const id in this.meta)
        {
            if (!ids.has(id))
                delete this.meta[id];
        }
        writeJson(metaPath, { version: 1, levels: this.meta });
    }

    saveCurve(curve)
    {
        this.curve = normalizeCurve(curve);
        writeJson(curvePath, this.curve);
    }

    saveSettings(settings)
    {
        this.settings = normalizeSettings(settings);
        writeJson(settingsPath, this.settings);
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
