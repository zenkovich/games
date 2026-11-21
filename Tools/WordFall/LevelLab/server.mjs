#!/usr/bin/env node
// LevelLab: the level tool of Word Fall. Serves the page (web/) and runs the bots, the tuner and the generator.
//   node Tools/WordFall/LevelLab/server.mjs [--port 8737] [--workers N] [--open]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadCore, projectRoot, assetsRoot, labRoot, seedOf, languages, dictionary } from './lab/core.mjs';
import { Pool } from './lab/pool.mjs';
import { Store } from './lab/store.mjs';
import { buildCurve, defaultCurve } from './lab/curve.mjs';
import { evaluateLevel, defaultSettings } from './lab/difficulty.mjs';
import { tuneLevel } from './lab/tune.mjs';
import { generateLevel, validateLevel, compactLevel, unlocks, recentShapes } from './lab/generate.mjs';
import { shapes, shapeOf, mirrorHoles, shapeMetrics } from './lab/shapes.mjs';
import { shapeHardness } from './lab/shape_cache.mjs';
import { relayout, patternNames } from './lab/layouts.mjs';
import { playAttempt } from './lab/sim.mjs';
import { buildAsset } from './dictionary/build_dictionary.mjs';

loadCore();

const args = process.argv.slice(2);
const option = (name, fallback) => { const at = args.indexOf('--' + name); return at >= 0 && args[at + 1] ? args[at + 1] : fallback; };
const port = Number(option('port', 8737));
const webRoot = path.join(labRoot, 'web');
const platform = process.platform == 'darwin' ? 'Mac' : process.platform == 'win32' ? 'Windows' : 'Linux';
const binRoot = path.join(projectRoot, 'Bin', platform);
const gameBinary = path.join(binRoot, process.platform == 'win32' ? 'Game.exe' : 'Game');
const assetsBuilder = path.join(binRoot, process.platform == 'win32' ? 'AssetsBuilder.exe' : 'AssetsBuilder');
const botRequestPath = path.join(binRoot, 'wordfall_bot.json');
const botResultPath = path.join(binRoot, 'wordfall_bot_result.json');

const store = new Store();
let pool = new Pool(Number(option('workers', 0)));
let job = null;
let game = null;
let building = null;
const clients = new Set();

function send(event)
{
    const text = 'data: ' + JSON.stringify(event) + '\n\n';
    for (const client of clients)
        client.write(text);
}

function targets()
{
    return buildCurve(store.curve);
}

function publicJob()
{
    return job ? { id: job.id, mode: job.mode, from: job.from, to: job.to, state: job.state, done: job.done, total: job.total,
                   current: job.current, startedAt: job.startedAt, finishedAt: job.finishedAt || 0, error: job.error || '', attempts: pool.attempts - job.attemptsAt } : null;
}

function newestFile(root, pattern)
{
    let newest = 0;
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true }))
        {
            const file = path.join(dir, entry.name);
            if (entry.isDirectory())
                walk(file);
            else if (pattern.test(entry.name))
                newest = Math.max(newest, fs.statSync(file).mtimeMs);
        }
    };
    try { walk(root); } catch (error) {}
    return newest;
}

// What the game binary would play: built assets older than the scripts, the campaign or the dictionaries mean
// the game does not see the lab's latest work until the assets are rebuilt
function gameStatus()
{
    const builtTree = path.join(projectRoot, 'BuiltAssets', platform, 'Data.json');
    const built = fs.existsSync(builtTree) ? fs.statSync(builtTree).mtimeMs : 0;
    const sources = Math.max(newestFile(path.join(assetsRoot, 'Scripts/WordFall'), /\.js$/),
                             newestFile(path.join(assetsRoot, 'WordFall/Dictionaries'), /\.json$/),
                             newestFile(path.join(assetsRoot, 'WordFall'), /^(campaign|languages)\.json$/));
    return {
        binary: fs.existsSync(gameBinary), builder: fs.existsSync(assetsBuilder), built: built > 0, stale: built < sources,
        running: !!game, building: !!building, binaryPath: path.relative(projectRoot, gameBinary)
    };
}

function state()
{
    return {
        campaign: store.campaign, meta: store.meta, curve: store.curve, targets: targets(), settings: store.settings,
        defaults: { curve: defaultCurve(), settings: defaultSettings() },
        languages: languages().map((code) => ({ code, name: WordFallLanguages.Get(code).name, alphabet: WordFallLanguages.Alphabet(code),
                                                 words: dictionary(code).GetWordsCount() })),
        unlocks, taskTypes: WordFallConfigs.TaskTypes, columns: 7, rows: 8, workers: pool.size, job: publicJob(), game: gameStatus()
    };
}

function levelFor(body)
{
    if (body.level)
        return compactLevel(body.level);
    const level = store.level(body.id);
    if (!level)
        throw new Error('нет уровня ' + body.id);
    return level;
}

function targetOf(index)
{
    const meta = store.meta[store.campaign[index] ? store.campaign[index].id : ''] || {};
    const point = targets()[index];
    return point ? point : { target: meta.target || 1.2, tier: meta.tier || 'normal' };
}

async function runJob(options)
{
    const curve = targets();
    const from = Math.max(1, Math.round(options.from || 1));
    const to = Math.min(options.mode == 'new' ? curve.length : store.campaign.length, Math.round(options.to || from));
    if (to < from)
        throw new Error('пустой диапазон уровней');

    job = { id: Date.now(), mode: options.mode || 'new', from, to, state: 'running', done: 0, total: to - from + 1, current: from,
            startedAt: Date.now(), cancelled: false, attemptsAt: pool.attempts };
    send({ type: 'job', job: publicJob() });
    const current = job;
    const seed = typeof options.seed == 'number' ? options.seed : 1;

    try
    {
        for (let number = from; number <= to && !current.cancelled; number++)
        {
            current.current = number;
            send({ type: 'job', job: publicJob() });
            const index = number - 1;
            const point = curve[index] || targetOf(index);
            const report = (event) => send({ type: 'progress', event: { ...event, level: undefined } });
            let level, meta;

            if (current.mode == 'evaluate')
            {
                level = store.campaign[index];
                const stats = await evaluateLevel(pool, level, store.settings, { languages: languages() });
                meta = { ...(store.meta[level.id] || {}), target: point.target, tier: point.tier, stats, dirty: false };
            }
            else
            {
                const measured = await shapeHardness(pool, store.settings);
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
            send({ type: 'level', index, level, meta });
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
        send({ type: 'job', job: publicJob() });
        send({ type: 'game', game: gameStatus() });
    }
}

function buildAssets()
{
    if (building)
        return;
    if (!fs.existsSync(assetsBuilder))
        throw new Error('нет ' + path.relative(projectRoot, assetsBuilder) + ' — соберите игру: cmake --build --preset mac --target Game');

    const builderArgs = ['-platform', platform, '-source', path.join(projectRoot, 'Assets') + '/',
                         '-target', path.join(projectRoot, 'BuiltAssets', platform, 'Data') + '/',
                         '-target-tree', path.join(projectRoot, 'BuiltAssets', platform, 'Data.json'),
                         '-compressor-config', path.join(projectRoot, 'o2/CompressToolsConfig.json')];
    building = spawn(assetsBuilder, builderArgs, { cwd: binRoot, stdio: 'ignore' });
    send({ type: 'game', game: gameStatus() });
    building.on('exit', (code) => {
        building = null;
        send({ type: 'game', game: gameStatus(), built: code == 0, code });
    });
    building.on('error', () => { building = null; send({ type: 'game', game: gameStatus(), built: false }); });
}

// Starts the game with a request for its bot: the level, the player profile and the seeds of the attempt
function playInGame(body)
{
    if (!fs.existsSync(gameBinary))
        throw new Error('нет ' + path.relative(projectRoot, gameBinary) + ' — соберите игру: cmake --build --preset mac --target Game');
    if (game)
    {
        game.kill();
        game = null;
    }

    const level = levelFor(body);
    const seed = (body.seed >>> 0) || seedOf(level.id, 'play', Date.now());
    const speed = Math.min(Math.max(Number(body.speed) || 4, 0.5), 16);
    const request = {
        expires: Date.now() + 60000, language: body.language || store.settings.language, level,
        profile: body.profile || store.settings.profiles.average, profileName: body.profileName || '',
        seed, botSeed: seedOf(seed, 'bot'), attempts: Math.max(1, Math.round(body.attempts || 1)),
        think: typeof body.think == 'number' ? body.think : 0.5, resultPath: 'wordfall_bot_result.json'
    };
    try { fs.unlinkSync(botResultPath); } catch (error) {}
    fs.writeFileSync(botRequestPath, JSON.stringify(request));

    // "background": the game plays without a window, only for its outcome; it is closed when the attempts are over
    const env = { ...process.env, O2_GAME_SPEED: String(body.background ? 16 : speed) };
    if (body.background)
        Object.assign(env, { O2_BACKGROUND_WINDOW: '1', O2_INVISIBLE_WINDOW: '1' });
    const child = spawn(gameBinary, [], { cwd: binRoot, stdio: 'ignore', env });
    game = child;
    const started = Date.now();
    const watch = setInterval(() => {
        const result = readBotResult();
        const done = result && result.attempts && result.attempts.length >= request.attempts;
        if (result)
            send({ type: 'game', game: gameStatus(), result });
        if (game != child || (body.background && (done || Date.now() - started > 600000)))
        {
            clearInterval(watch);
            if (game == child && body.background)
                child.kill();
        }
    }, 700);
    child.on('exit', () => {
        clearInterval(watch);
        if (game == child)
            game = null;
        try { fs.unlinkSync(botRequestPath); } catch (error) {}
        send({ type: 'game', game: gameStatus(), result: readBotResult() });
    });
    child.on('error', () => { if (game == child) game = null; });
    send({ type: 'game', game: gameStatus() });
    return { seed, speed, background: !!body.background, stale: gameStatus().stale };
}

// Catalog name and metrics of a level's shape
function describeShape(holes)
{
    const own = shapeOf(holes);
    const mirrored = own ? null : shapeOf(mirrorHoles(holes || []));
    const shape = own || mirrored;
    return { id: shape ? shape.id : '', name: shape ? shape.name + (mirrored ? ' (зеркально)' : '') : '', ...shapeMetrics(holes || []) };
}

function mulberry(seed)
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

function readBotResult()
{
    try { return JSON.parse(fs.readFileSync(botResultPath, 'utf8')); }
    catch (error) { return null; }
}

function words(query)
{
    const language = query.get('lang') || store.settings.language;
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
function saveWord(body)
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

    const table = path.join(labRoot, 'dictionary', language + '.tsv');
    const lines = fs.readFileSync(table, 'utf8').split('\n').filter((line) => line.trim());
    const line = [word, d, f, kind].join('\t');
    const at = lines.findIndex((item) => item.split('\t')[0] == word);
    if (at >= 0)
        lines[at] = line;
    else
        lines.push(line);
    fs.writeFileSync(table, lines.join('\n') + '\n');
    fs.writeFileSync(path.join(assetsRoot, 'WordFall/Dictionaries', language + '.json'), JSON.stringify(buildAsset(language)));

    WordFallGame.dictionaries = {};
    const size = pool.size;
    pool.close();
    pool = new Pool(size);
    return { added: at < 0, word };
}

async function api(method, url, body)
{
    const route = method + ' ' + url.pathname;
    switch (route)
    {
        case 'GET /api/state': return state();
        case 'GET /api/words': return words(url.searchParams);
        case 'POST /api/word': return saveWord(body);

        case 'POST /api/curve':
            store.saveCurve(body);
            send({ type: 'curve' });
            return { curve: store.curve, targets: targets() };

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
            return { level, meta, problems: validateLevel(level), game: gameStatus() };
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
            return state();
        }

        case 'POST /api/validate':
        {
            const level = compactLevel(body.level);
            return { problems: validateLevel(level), shape: describeShape(level.holeCells) };
        }

        case 'GET /api/shapes':
        {
            const measured = await shapeHardness(pool, store.settings);
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
            const level = levelFor(body);
            const stats = await evaluateLevel(pool, level, store.settings, { languages: languages(), count: body.count });
            const index = store.indexOf(level.id);
            let meta = null;
            if (index >= 0 && !body.level)
            {
                const point = targetOf(index);
                meta = store.meta[level.id] = { ...(store.meta[level.id] || {}), target: point.target, tier: point.tier, stats, dirty: false };
                store.saveMeta();
            }
            return { stats, meta, problems: validateLevel(level) };
        }

        case 'POST /api/tune':
        {
            const source = levelFor(body);
            const index = store.indexOf(source.id);
            const point = targetOf(index);
            const target = typeof body.target == 'number' ? body.target : point.target;
            const rounds = [];
            const tuned = await tuneLevel(pool, source, target, store.settings, { keepMoves: !!body.keepMoves, preferredMoves: source.moves, salt: Date.now() & 0xffff },
                                          (event) => { rounds.push(event); send({ type: 'progress', event }); });
            if (!tuned.level || tuned.reason == 'goals')
                return { ok: false, reason: 'goals', goals: tuned.goals, rounds };
            const stats = await evaluateLevel(pool, tuned.level, store.settings, { languages: languages(), seedBase: seedOf(source.id, 'final', Date.now()) });
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
            if (job && job.state == 'running')
                throw new Error('генерация уже идёт');
            runJob(body);
            return { job: publicJob() };

        case 'POST /api/cancel':
            if (job && job.state == 'running')
                job.cancelled = true;
            return { job: publicJob() };

        case 'POST /api/replay':
        {
            const level = levelFor(body);
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

        case 'POST /api/play': return playInGame(body);
        case 'POST /api/play/stop':
            if (game)
                game.kill();
            return { game: gameStatus() };
        case 'GET /api/play/result': return { game: gameStatus(), result: readBotResult() };

        case 'POST /api/assets':
            buildAssets();
            return { game: gameStatus() };

        case 'POST /api/backup': return { file: path.relative(projectRoot, store.backup('manual')) };
    }
    return null;
}

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
               '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    try
    {
        if (url.pathname == '/api/events')
        {
            response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
            response.write('data: ' + JSON.stringify({ type: 'hello', job: publicJob() }) + '\n\n');
            clients.add(response);
            request.on('close', () => clients.delete(response));
            return;
        }

        if (url.pathname.startsWith('/api/'))
        {
            let body = {};
            if (request.method == 'POST')
            {
                const chunks = [];
                for await (const chunk of request)
                    chunks.push(chunk);
                const text = Buffer.concat(chunks).toString('utf8');
                body = text ? JSON.parse(text) : {};
            }
            const result = await api(request.method, url, body);
            if (result === null)
            {
                response.writeHead(404, { 'Content-Type': 'application/json' });
                response.end(JSON.stringify({ error: 'нет такого запроса: ' + url.pathname }));
                return;
            }
            response.writeHead(200, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify(result));
            return;
        }

        // the game's own sprites and font: the editor draws the board as the game does
        if (url.pathname.startsWith('/game/'))
        {
            const asset = path.normalize(path.join(assetsRoot, decodeURIComponent(url.pathname.slice('/game/'.length))));
            if (!asset.startsWith(assetsRoot + path.sep) || !/\.(png|ttf|otf)$/i.test(asset) || !fs.existsSync(asset))
            {
                response.writeHead(404);
                response.end('not found');
                return;
            }
            const type = asset.endsWith('.png') ? 'image/png' : 'font/ttf';
            response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'max-age=3600' });
            response.end(fs.readFileSync(asset));
            return;
        }

        const file = path.join(webRoot, url.pathname == '/' ? 'index.html' : path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
        if (!file.startsWith(webRoot) || !fs.existsSync(file) || fs.statSync(file).isDirectory())
        {
            response.writeHead(404);
            response.end('not found');
            return;
        }
        response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        response.end(fs.readFileSync(file));
    }
    catch (error)
    {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: String(error && error.message || error) }));
    }
});

// only this machine: the tool writes project files and starts the game
server.listen(port, '127.0.0.1', () => {
    const address = 'http://localhost:' + port + '/';
    console.log('LevelLab: ' + address + '  (' + pool.size + ' workers, ' + store.campaign.length + ' levels)');
    if (args.includes('--open'))
        spawn(process.platform == 'darwin' ? 'open' : process.platform == 'win32' ? 'start' : 'xdg-open', [address], { stdio: 'ignore', shell: process.platform == 'win32' });
});

process.on('SIGINT', () => { pool.close(); if (game) game.kill(); process.exit(0); });
process.on('SIGTERM', () => { pool.close(); if (game) game.kill(); process.exit(0); });
