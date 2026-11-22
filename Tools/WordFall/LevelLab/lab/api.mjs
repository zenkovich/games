// What the LevelLab page asks for, whoever serves it: server.mjs over HTTP on this machine, or the page itself on the
// o2 portal (web/portal.js), where the same calls run in the browser. Everything that differs between the two is a
// service handed in:
//
//   io      the project's files (store.mjs)
//   game    the real game: status(), play(request, { speed, background }), stop(), result(), build()
//   remote  the levels in the game's builds through a remote config, or null where there is none
//   vcs     the working copy's changes and a commit, or null (on this machine git is the developer's own)
//   send    an event for the page (job progress, a level done, the game's state)
import { loadCore, seedOf, languages, dictionary, paths, reloadDictionaries } from './core.mjs';
import { Pool } from './pool.mjs';
import { Store, campaignText } from './store.mjs';
import { buildCurve, defaultCurve } from './curve.mjs';
import { evaluateLevel, defaultSettings } from './difficulty.mjs';
import { tuneLevel } from './tune.mjs';
import { generateLevel, validateLevel, compactLevel, unlocks, recentShapes } from './generate.mjs';
import { shapes, shapeOf, mirrorHoles, shapeMetrics } from './shapes.mjs';
import { shapeHardness } from './shape_cache.mjs';
import { relayout, patternNames } from './layouts.mjs';
import { playAttempt } from './sim.mjs';
import { parseTable, assetOf } from '../dictionary/table.mjs';

// The remote config the game reads its level overrides from (Assets/Scripts/WordFall/Core/WordFallRemote.js)
export const levelsConfigKey = 'wordfall_levels';

export function mulberry(seed)
{
    let state = seed >>> 0;
    const next = function() {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0)/4294967296;
    };
    next.int = (n) => Math.min(n - 1, Math.floor(next()*n));
    next.range = (min, max) => min + next.int(max - min + 1);
    next.pick = (list) => list[next.int(list.length)];
    next.chance = (p) => next() < p;
    next.shuffle = (list) => {
        for (let i = list.length - 1; i > 0; i--)
        {
            const j = next.int(i + 1);
            [list[i], list[j]] = [list[j], list[i]];
        }
        return list;
    };
    return next;
}

// Catalog name and metrics of a level's shape
export function describeShape(holes)
{
    const own = shapeOf(holes);
    const mirrored = own ? null : shapeOf(mirrorHoles(holes || []));
    const shape = own || mirrored;
    return { id: shape ? shape.id : '', name: shape ? shape.name + (mirrored ? ' (зеркально)' : '') : '', ...shapeMetrics(holes || []) };
}

export class LabApi
{
    constructor({ io, game, remote = null, vcs = null, send = () => {}, workers = 0 })
    {
        loadCore();
        this.io = io;
        this.game = game;
        this.remote = remote;
        this.vcs = vcs;
        this.send = send;
        this.store = new Store(io);
        this.pool = new Pool(workers);
        this.job = null;
    }

    close()
    {
        if (this.job && this.job.state == 'running')
            this.job.cancelled = true;
        this.pool.close();
    }

    targets() { return buildCurve(this.store.curve); }

    publicJob()
    {
        const job = this.job;
        return job ? { id: job.id, mode: job.mode, from: job.from, to: job.to, state: job.state, done: job.done, total: job.total,
                       current: job.current, startedAt: job.startedAt, finishedAt: job.finishedAt || 0, error: job.error || '',
                       attempts: this.pool.attempts - job.attemptsAt } : null;
    }

    hello() { return { type: 'hello', job: this.publicJob() }; }

    state()
    {
        const store = this.store;
        return {
            campaign: store.campaign, meta: store.meta, curve: store.curve, targets: this.targets(), settings: store.settings,
            defaults: { curve: defaultCurve(), settings: defaultSettings() },
            languages: languages().map((code) => ({ code, name: WordFallLanguages.Get(code).name, alphabet: WordFallLanguages.Alphabet(code),
                                                     words: dictionary(code).GetWordsCount() })),
            unlocks, taskTypes: WordFallConfigs.TaskTypes, columns: 7, rows: 8, workers: this.pool.size, job: this.publicJob(),
            game: this.game.status(), services: { remote: !!this.remote, vcs: !!this.vcs, host: this.io.kind || 'node' }
        };
    }

    levelFor(body)
    {
        if (body.level)
            return compactLevel(body.level);
        const level = this.store.level(body.id);
        if (!level)
            throw new Error('нет уровня ' + body.id);
        return level;
    }

    targetOf(index)
    {
        const store = this.store;
        const meta = store.meta[store.campaign[index] ? store.campaign[index].id : ''] || {};
        const point = this.targets()[index];
        return point ? point : { target: meta.target || 1.2, tier: meta.tier || 'normal' };
    }

    async runJob(options)
    {
        const store = this.store, pool = this.pool;
        const curve = this.targets();
        const from = Math.max(1, Math.round(options.from || 1));
        const to = Math.min(options.mode == 'new' ? curve.length : store.campaign.length, Math.round(options.to || from));
        if (to < from)
            throw new Error('пустой диапазон уровней');

        const current = this.job = { id: Date.now(), mode: options.mode || 'new', from, to, state: 'running', done: 0, total: to - from + 1, current: from,
                                     startedAt: Date.now(), cancelled: false, attemptsAt: pool.attempts };
        this.send({ type: 'job', job: this.publicJob() });
        const seed = typeof options.seed == 'number' ? options.seed : 1;

        try
        {
            for (let number = from; number <= to && !current.cancelled; number++)
            {
                current.current = number;
                this.send({ type: 'job', job: this.publicJob() });
                const index = number - 1;
                const point = curve[index] || this.targetOf(index);
                const report = (event) => this.send({ type: 'progress', event: { ...event, level: undefined } });
                let level, meta;

                if (current.mode == 'evaluate')
                {
                    level = store.campaign[index];
                    const stats = await evaluateLevel(pool, level, store.settings, { languages: languages() });
                    meta = { ...(store.meta[level.id] || {}), target: point.target, tier: point.tier, stats, dirty: false };
                }
                else
                {
                    const measured = await shapeHardness(pool, store.settings, this.io);
                    const existing = store.campaign[index];
                    const keep = current.mode == 'retune' ? existing : null;
                    const variant = typeof options.variant == 'number' ? options.variant
                        : current.mode == 'new' && existing && store.meta[existing.id] ? ((store.meta[existing.id].variant || 0) >> 4) + 1 : 0;
                    const result = await generateLevel(pool, { number, count: curve.length, target: point.target, tier: point.tier, seed, variant,
                                                               usedWords: store.usedWords(index), keepStructure: keep, shapes: measured,
                                                               recentShapes: recentShapes(store.campaign, index) }, store.settings, report);
                    level = result.level;
                    meta = result.meta;
                    if (existing)
                    {
                        level.id = existing.id;
                        if (existing.name)
                            level.name = existing.name;
                    }
                    else if (store.indexOf(level.id) >= 0)
                        level.id = store.freeId();
                }

                store.setLevel(index, level, meta);
                current.done++;
                this.send({ type: 'level', index, level, meta });
            }
            current.state = current.cancelled ? 'cancelled' : 'done';
        }
        catch (error)
        {
            current.state = 'error';
            current.error = String(error && error.message || error);
            console.error(error);
        }
        finally
        {
            current.finishedAt = Date.now();
            if (current.mode != 'evaluate')
                store.saveCampaign();
            store.saveMeta();
            this.send({ type: 'job', job: this.publicJob() });
            this.send({ type: 'game', game: this.game.status() });
        }
    }

    words(query)
    {
        const language = query.get('lang') || this.store.settings.language;
        const list = dictionary(language);
        const text = (query.get('q') || '').toUpperCase().replace(/Ё/g, 'Е').trim();
        const kind = query.get('kind') || '';
        const length = Number(query.get('len') || 0);
        const minF = Number(query.get('minF') || 1), maxF = Number(query.get('maxF') || 9);
        const limit = Math.min(1000, Number(query.get('limit') || 300));
        const kindOf = (index) => list.GetKind(index) == 1 ? 'n' : list.GetKind(index) == 2 ? 'p' : list.HasLevelWords() && list.IsLevelWord(index) ? 'w' : '.';
        const all = list.GetAllWords();
        const found = [];
        let total = 0;
        const histogram = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        for (let i = 0; i < all.length; i++)
        {
            const word = all[i];
            const f = list.GetFamiliarity(i);
            if ((length && word.length != length) || (kind && kindOf(i) != kind) || f < minF || f > maxF ||
                (text && !(text.endsWith('*') ? word.startsWith(text.slice(0, -1)) : word.includes(text))))
            {
                continue;
            }
            total++;
            histogram[f]++;
            if (found.length < limit)
                found.push([word, list.GetDifficulty(i), f, kindOf(i)]);
        }
        return { language, total, count: all.length, rated: list.HasRatings(), words: found, histogram };
    }

    // A change of a word's ratings or a new word: the table, the asset, and bots that know the new dictionary
    async saveWord(body)
    {
        const language = body.lang;
        if (!WordFallLanguages.Get(language))
            throw new Error('нет языка ' + language);
        const word = String(body.word || '').toUpperCase().replace(/Ё/g, 'Е').trim();
        const alphabet = WordFallLanguages.Alphabet(language);
        if (word.length < 2 || word.length > 8 || [...word].some((letter) => !alphabet.includes(letter)))
            throw new Error('слово должно быть из 2–8 букв алфавита языка');
        const d = Math.round(body.difficulty), f = Math.round(body.familiarity);
        const kind = ['.', 'w', 'n', 'p'].includes(body.kind) ? body.kind : '.';
        if (!(d >= 1 && d <= 9) || !(f >= 1 && f <= 9))
            throw new Error('оценки — от 1 до 9');

        const table = paths.tables + '/' + language + '.tsv';
        const text = this.io.read(table) ?? (this.io.load ? await this.io.load(table) : null);
        if (text == null)
            throw new Error('нет таблицы ' + table);
        const lines = text.split('\n').filter((line) => line.trim());
        const line = [word, d, f, kind].join('\t');
        const at = lines.findIndex((item) => item.split('\t')[0] == word);
        if (at >= 0)
            lines[at] = line;
        else
            lines.push(line);
        const tableText = lines.join('\n') + '\n';
        const asset = JSON.stringify(assetOf(language, parseTable(language, tableText), this.io.read(paths.languages)));
        this.io.write(table, tableText);
        this.io.write(paths.dictionaries + '/' + language + '.json', asset);

        reloadDictionaries();
        const size = this.pool.size;
        this.pool.close();
        this.pool = new Pool(size);
        return { added: at < 0, word };
    }

    // The request the game's WordFallBotRunner reads (Assets/Scripts/WordFall/WordFallBotRunner.js)
    playRequest(body)
    {
        const store = this.store;
        const level = this.levelFor(body);
        const human = !!body.human;
        const language = body.language || store.settings.language;
        const seed = human ? body.seed >>> 0 : (body.seed >>> 0) || seedOf(level.id, 'play', Date.now());
        if (human)
            return { expires: Date.now() + 60000, language, level, human: true, title: String(body.title || ''), seed, resultPath: 'wordfall_bot_result.json' };
        return {
            expires: Date.now() + 60000, language, level,
            profile: body.profile || store.settings.profiles.average, profileName: body.profileName || '',
            seed, botSeed: seedOf(seed, 'bot'), attempts: Math.max(1, Math.round(body.attempts || 1)),
            think: typeof body.think == 'number' ? body.think : 0.5, resultPath: 'wordfall_bot_result.json'
        };
    }

    // The levels in the game's builds: what the remote config holds against the campaign
    async buildState()
    {
        if (!this.remote)
            return { available: false };
        const state = await this.remote.get(levelsConfigKey);
        const levelsOf = (data) => (data && data.levels && typeof data.levels == 'object' ? data.levels : {});
        const compare = (levels) => {
            let same = 0, differ = 0;
            for (const level of this.store.campaign)
            {
                if (!levels[level.id])
                    continue;
                JSON.stringify(levels[level.id]) == JSON.stringify(level) ? same++ : differ++;
            }
            return { count: Object.keys(levels).length, same, differ };
        };
        return { available: true, key: levelsConfigKey, canPublish: !!state.canPublish, publishedAt: state.publishedAt || 0,
                 draft: compare(levelsOf(state.draft)), live: compare(levelsOf(state.live)),
                 note: (state.live && state.live.note) || '', campaign: this.store.campaign.length };
    }

    // The campaign as the levels every build of the game plays: by level id, over what the build has baked in
    async publishLevels(body)
    {
        if (!this.remote)
            throw new Error('нет удалённых конфигов: уровни в билд отправляет LevelLab на портале o2');
        const levels = {};
        if (!body.clear)
        {
            for (const level of this.store.campaign)
                levels[level.id] = level;
        }
        const data = { version: 1, note: String(body.note || ''), at: new Date().toISOString(), levels };
        await this.remote.set(levelsConfigKey, data, { title: 'WordFall: уровни из LevelLab' });
        if (body.publish)
            await this.remote.publish(body.clear ? 'LevelLab: уровни билда сброшены' : 'LevelLab: ' + this.store.campaign.length + ' уровней' + (body.note ? ' — ' + body.note : ''));
        return this.buildState();
    }

    async handle(method, url, body)
    {
        const store = this.store;
        const route = method + ' ' + url.pathname;
        switch (route)
        {
            case 'GET /api/state': return this.state();
            case 'GET /api/words': return this.words(url.searchParams);
            case 'POST /api/word': return this.saveWord(body);

            case 'POST /api/curve':
                store.saveCurve(body);
                this.send({ type: 'curve' });
                return { curve: store.curve, targets: this.targets() };

            case 'POST /api/settings':
                store.saveSettings(body);
                return { settings: store.settings };

            case 'POST /api/level':
            {
                const index = store.indexOf(body.id);
                if (index < 0)
                    throw new Error('нет уровня ' + body.id);
                const level = compactLevel({ ...body.level, id: body.id });
                const meta = { ...(store.meta[body.id] || {}), dirty: true };
                store.setLevel(index, level, meta);
                store.saveCampaign();
                store.saveMeta();
                return { level, meta, problems: validateLevel(level), game: this.game.status() };
            }

            case 'POST /api/structure':
            {
                const index = store.indexOf(body.id);
                if (body.op == 'add')
                {
                    const at = index >= 0 ? index + 1 : store.campaign.length;
                    const level = body.level ? compactLevel(body.level) : { words: {}, tasks: [], moves: 12, targetScore: 200, boosterCharges: store.settings.boosterCharges.slice() };
                    level.id = store.freeId();
                    store.campaign.splice(at, 0, level);
                }
                else if (index < 0)
                    throw new Error('нет уровня ' + body.id);
                else if (body.op == 'duplicate')
                {
                    const copy = JSON.parse(JSON.stringify(store.campaign[index]));
                    copy.id = store.freeId();
                    copy.name = (copy.name || store.campaign[index].id) + ' копия';
                    store.campaign.splice(index + 1, 0, copy);
                }
                else if (body.op == 'delete' && store.campaign.length > 1)
                    store.campaign.splice(index, 1);
                else if (body.op == 'move')
                {
                    const to = Math.min(Math.max(Math.round(body.to), 0), store.campaign.length - 1);
                    const [level] = store.campaign.splice(index, 1);
                    store.campaign.splice(to, 0, level);
                }
                store.saveCampaign();
                store.saveMeta();
                return this.state();
            }

            case 'POST /api/validate':
            {
                const level = compactLevel(body.level);
                return { problems: validateLevel(level), shape: describeShape(level.holeCells) };
            }

            case 'GET /api/shapes':
            {
                const measured = await shapeHardness(this.pool, store.settings, this.io);
                return { shapes: shapes.map((shape) => ({ id: shape.id, name: shape.name, group: shape.group, lines: shape.lines, holes: shape.holes,
                                                           cells: shape.cells, islands: shape.islands, neighbours: shape.neighbours,
                                                           symmetric: shape.symmetric, ...(measured[shape.id] || {}) })) };
            }

            case 'POST /api/layout':
            {
                const seed = (body.seed >>> 0) || seedOf('layout', Date.now());
                const result = relayout(compactLevel(body.level), mulberry(seed));
                const level = compactLevel(result.level);
                return { level, used: result.used.map((item) => ({ ...item, name: patternNames[item.pattern] || item.pattern })), problems: validateLevel(level) };
            }

            case 'POST /api/evaluate':
            {
                const level = this.levelFor(body);
                const stats = await evaluateLevel(this.pool, level, store.settings, { languages: languages(), count: body.count });
                const index = store.indexOf(level.id);
                let meta = null;
                if (index >= 0 && !body.level)
                {
                    const point = this.targetOf(index);
                    meta = store.meta[level.id] = { ...(store.meta[level.id] || {}), target: point.target, tier: point.tier, stats, dirty: false };
                    store.saveMeta();
                }
                return { stats, meta, problems: validateLevel(level) };
            }

            case 'POST /api/tune':
            {
                const source = this.levelFor(body);
                const index = store.indexOf(source.id);
                const point = this.targetOf(index);
                const target = typeof body.target == 'number' ? body.target : point.target;
                const rounds = [];
                const tuned = await tuneLevel(this.pool, source, target, store.settings, { keepMoves: !!body.keepMoves, preferredMoves: source.moves, salt: Date.now() & 0xffff },
                                              (event) => { rounds.push(event); this.send({ type: 'progress', event }); });
                if (!tuned.level || tuned.reason == 'goals')
                    return { ok: false, reason: 'goals', goals: tuned.goals, rounds };
                const stats = await evaluateLevel(this.pool, tuned.level, store.settings, { languages: languages(), seedBase: seedOf(source.id, 'final', Date.now()) });
                tuned.level.difficulty = stats.grade;
                const level = compactLevel(tuned.level);
                const meta = { ...(store.meta[source.id] || {}), target, tier: point.tier, stats, rounds: tuned.rounds, tuned: tuned.ok, dirty: false };
                if (index >= 0)
                {
                    store.setLevel(index, level, meta);
                    store.saveCampaign();
                    store.saveMeta();
                }
                return { ok: tuned.ok, level, meta, rounds: tuned.rounds };
            }

            case 'POST /api/generate':
                if (this.job && this.job.state == 'running')
                    throw new Error('генерация уже идёт');
                this.runJob(body);
                return { job: this.publicJob() };

            case 'POST /api/cancel':
                if (this.job && this.job.state == 'running')
                    this.job.cancelled = true;
                return { job: this.publicJob() };

            case 'POST /api/replay':
            {
                const level = this.levelFor(body);
                const profile = body.profile || store.settings.profiles[body.profileName || 'average'] || store.settings.profiles.average;
                const language = body.language || store.settings.language;
                let seed = (body.seed >>> 0) || seedOf(level.id, 'replay', Date.now());
                let record = null;
                // "show me a win" / "a loss": the nearest seed with that outcome
                for (let tries = 0; tries < 300; tries++)
                {
                    record = playAttempt(level, { language, profile, seed, trace: true });
                    if (!body.want || (body.want == 'win') == record.won)
                        break;
                    seed = seedOf(seed, tries);
                }
                const trace = record.trace;
                delete record.trace;
                return { seed, record, trace, language };
            }

            case 'POST /api/play':
            {
                const request = this.playRequest(body);
                const human = !!request.human;
                const ran = await this.game.play(request, { speed: human ? 1 : Math.min(Math.max(Number(body.speed) || 4, 0.5), 16), background: !human && !!body.background });
                return { seed: request.seed, human, ...ran, stale: this.game.status().stale };
            }
            case 'POST /api/play/stop':
                await this.game.stop();
                return { game: this.game.status() };
            case 'GET /api/play/result': return { game: this.game.status(), result: await this.game.result() };

            case 'POST /api/assets':
                await this.game.build();
                return { game: this.game.status() };

            case 'POST /api/backup': return { file: store.backup('manual') };

            case 'GET /api/build': return this.buildState();
            case 'POST /api/build': return this.publishLevels(body);

            case 'GET /api/vcs': return this.vcs ? this.vcs.status() : { available: false };
            case 'POST /api/vcs/commit':
                if (!this.vcs)
                    throw new Error('коммит отсюда делает только LevelLab на портале o2');
                return this.vcs.commit({ message: String(body.message || ''), push: !!body.push });
        }
        return null;
    }
}

export { campaignText };
