#!/usr/bin/env node
// Command line of the lab, for runs without the page:
//   node lab/cli.mjs curve                         print the target curve
//   node lab/cli.mjs evaluate [--from 1 --to 100]  measure the levels of the campaign and store the statistics
//   node lab/cli.mjs generate [--from 1 --to 100] [--seed 7] [--count 100] [--dry]
//                                                  generate the levels of the range into the campaign
//   node lab/cli.mjs scale en                      find the score scale of a language (languages.json: scoreScale)
//                                                  that makes the campaign as hard as in the main language
import { loadCore, languages } from './core.mjs';
import { Pool } from './pool.mjs';
import { Store } from './store.mjs';
import { buildCurve } from './curve.mjs';
import { evaluateLevel } from './difficulty.mjs';
import { generateLevel, recentShapes } from './generate.mjs';
import { shapeHardness } from './shape_cache.mjs';
import { summarize } from './sim.mjs';
import { io } from './node_host.mjs';

function parseArgs(list)
{
    const args = { _: [] };
    for (let i = 0; i < list.length; i++)
    {
        if (list[i].startsWith('--'))
        {
            const next = list[i + 1];
            if (next === undefined || next.startsWith('--'))
                args[list[i].slice(2)] = true;
            else
                args[list[i].slice(2)] = isNaN(Number(next)) ? next : Number(next), i++;
        }
        else
            args._.push(list[i]);
    }
    return args;
}

const bar = (value, scale = 8) => '█'.repeat(Math.max(0, Math.min(60, Math.round(value*scale))));

function statsLine(number, level, meta)
{
    const stats = meta.stats;
    const profiles = stats.profiles;
    const other = Object.entries(stats.languages || {}).map(([code, item]) => code + ' ' + item.attempts.toFixed(2)).join(' ');
    return String(number).padStart(3) + ' ' + (meta.tier || '').padEnd(8) + ' цель ' + (meta.target || 0).toFixed(2) +
        ' → ' + stats.attempts.toFixed(2) + ' [' + profiles.average.attemptsLo.toFixed(2) + '..' + profiles.average.attemptsHi.toFixed(2) + ']' +
        ' слаб ' + (profiles.weak ? profiles.weak.attempts.toFixed(1) : '-').padStart(4) + ' сильн ' + (profiles.strong ? profiles.strong.attempts.toFixed(2) : '-') +
        ' инд ' + stats.index.toFixed(2).padStart(5) + ' ходов ' + String(level.moves).padStart(2) + ' очки ' + String(level.targetScore).padStart(4) +
        ' запас ' + profiles.average.movesLeft.toFixed(1) + ' почти ' + (profiles.average.nearMiss*100).toFixed(0).padStart(2) + '%' +
        (other ? ' | ' + other : '') + ' | ' + (level.words.ru || []).join(',') + ' ' + (level.tasks || []).map((task) => task.taskType).join('+') + (meta.notes && meta.notes.shape ? ' | ' + meta.notes.shape + ' · ' + (meta.notes.layout || []).join(', ') : '');
}

async function main()
{
    loadCore();
    const args = parseArgs(process.argv.slice(2));
    const command = args._[0] || 'curve';
    const store = new Store(io);
    if (typeof args.count == 'number')
        store.curve.count = args.count;
    const curve = buildCurve(store.curve);

    if (command == 'curve')
    {
        curve.forEach((point, i) => console.log(String(i + 1).padStart(3) + ' ' + point.tier.padEnd(8) + ' ' + point.target.toFixed(2).padStart(5) + ' ' + bar(point.target)));
        return;
    }

    const from = Math.max(1, args.from || 1);
    const pool = new Pool(typeof args.workers == 'number' ? args.workers : 0);
    const started = Date.now();
    try
    {
        if (command == 'evaluate')
        {
            const to = Math.min(store.campaign.length, args.to || store.campaign.length);
            for (let number = from; number <= to; number++)
            {
                const level = store.campaign[number - 1];
                const stats = await evaluateLevel(pool, level, store.settings, { languages: languages() });
                const meta = store.meta[level.id] = { ...(store.meta[level.id] || {}), stats };
                if (meta.target === undefined && curve[number - 1])
                {
                    meta.target = curve[number - 1].target;
                    meta.tier = curve[number - 1].tier;
                }
                console.log(statsLine(number, level, meta));
            }
            if (!args.dry)
                store.saveMeta();
        }
        else if (command == 'generate')
        {
            const to = Math.min(curve.length, args.to || curve.length);
            const seed = typeof args.seed == 'number' ? args.seed : 1;
            if (!args.dry && store.campaign.length > curve.length && from == 1 && to == curve.length)
                store.campaign.length = curve.length;
            const measured = await shapeHardness(pool, store.settings, io);
            for (let number = from; number <= to; number++)
            {
                const point = curve[number - 1];
                const result = await generateLevel(pool, { number, count: curve.length, target: point.target, tier: point.tier, seed,
                                                           variant: args.variant || 0, usedWords: store.usedWords(number - 1),
                                                           shapes: measured, recentShapes: recentShapes(store.campaign, number - 1) }, store.settings);
                store.setLevel(number - 1, result.level, result.meta);
                console.log(statsLine(number, result.level, result.meta) + (result.meta.tuned ? '' : '  ! не в допуске'));
            }
            if (!args.dry)
            {
                store.saveCampaign();
                store.saveMeta();
            }
        }
        else if (command == 'scale')
        {
            // which score scale of a language makes its levels as hard as in the main language
            const language = args._[1];
            const main = store.settings.language;
            const profile = store.settings.profiles.average;
            const count = args.attempts || 300;
            const levels = store.campaign.filter((level, index) => index % (args.every || 2) == 0);
            const base = [];
            for (const level of levels)
                base.push(summarize(await pool.simulate(level, { language: main, profile, count, seedBase: 9 })).winRate);
            for (let scale = 0.6; scale <= 1.001; scale += 0.05)
            {
                let gap = 0, bias = 0;
                for (let i = 0; i < levels.length; i++)
                {
                    const winRate = summarize(await pool.simulate(levels[i], { language, profile, count, seedBase: 9, scoreScale: scale })).winRate;
                    gap += Math.abs(winRate - base[i]);
                    bias += winRate - base[i];
                }
                console.log(language + ' scoreScale ' + scale.toFixed(2) + ': средний разрыв побед с ' + main + ' ' + (gap/levels.length*100).toFixed(1) +
                            ' п.п., смещение ' + (bias/levels.length*100).toFixed(1) + ' п.п.');
            }
        }
        else
            console.log('unknown command ' + command);
    }
    finally
    {
        console.log('время ' + ((Date.now() - started)/1000).toFixed(1) + ' с, попыток ' + pool.attempts + ', воркеров ' + pool.size);
        pool.close();
    }
}

main().catch((error) => { console.error(error); process.exit(1); });
