// LevelLab as a tab of the project on the o2 portal (plugin.json): the page runs its API itself (lab/api.mjs) in this
// browser - the bots in Web Workers - over the project's working copy, which the portal's bridge (window.o2portal)
// reads and writes. The game is the project's own on the portal: a pane next to the page with the Play face of the
// working copy, where the bot (or the person) plays a level from a request file, as WordFallBotRunner reads it.
import { setHost, paths, coreScripts } from '../lab/core.mjs';
import { createWebHost } from '../lab/web_host.mjs';
import { storeFiles } from '../lab/store.mjs';

const REQUEST = 'wordfall_bot.json', RESULT = 'wordfall_bot_result.json';

// The project's files as the lab writes them: in memory at once (the lab reads its own writes back), to the working copy
// in the background, one write per file at a time and the latest text winning
function portalIo(bridge, files, report)
{
    const queued = new Map(), running = new Set();
    let idle = Promise.resolve(), settle = null;
    const pump = (rel) => {
        if (running.has(rel) || !queued.has(rel))
            return;
        const text = queued.get(rel);
        queued.delete(rel);
        running.add(rel);
        bridge.files.write(rel, text).then(() => report({ type: 'saved', path: rel }),
                                           (error) => report({ type: 'error', message: 'Не сохранено ' + rel + ': ' + error.message }))
            .finally(() => {
                running.delete(rel);
                pump(rel);
                if (!queued.size && !running.size && settle)
                {
                    settle();
                    settle = null;
                }
            });
    };
    return {
        kind: 'portal',
        read(rel) { return typeof files[rel] == 'string' ? files[rel] : null; },
        async load(rel)
        {
            try { files[rel] = await bridge.files.read(rel); }
            catch (error) { if (error.status == 404) return null; throw error; }
            return files[rel];
        },
        write(rel, text)
        {
            files[rel] = text;
            queued.set(rel, text);
            if (!settle)
                idle = new Promise((resolve) => { settle = resolve; });
            pump(rel);
        },
        // everything written so far is in the working copy
        flush() { return queued.size || running.size ? idle : Promise.resolve(); }
    };
}

// The game pane: the request goes into the game's folder, the game starts over on it and writes its result next to it
function portalGame(bridge, send)
{
    const state = { running: false, human: false, building: false, request: null };
    let watch = 0, last = '';
    const status = () => ({ kind: 'portal', binary: true, builder: true, built: true, stale: false, running: state.running, human: state.human,
                            building: state.building, binaryPath: 'Play' });
    const stopWatching = () => { clearInterval(watch); watch = 0; };
    const poll = async () => {
        const open = await bridge.game.state().catch(() => null);
        if (open && !open.open)
        {
            stopWatching();
            state.running = false;
            send({ type: 'game', game: status() });
            return;
        }
        const text = await bridge.game.readFile(RESULT).catch(() => null);
        if (!text || text == last)
            return;
        last = text;
        let result = null;
        try { result = JSON.parse(text); } catch (error) { return; }
        const request = state.request;
        if (request && !request.human && result.attempts && result.attempts.length >= request.attempts)
        {
            state.running = false;
            stopWatching();
        }
        send({ type: 'game', game: status(), result });
    };
    return {
        status,
        async play(request, { speed })
        {
            // the web game cannot run faster than the clock: the bot's own pauses shrink instead (WordFallBotRunner: pace)
            if (!request.human)
                request.pace = speed;
            // the game's client may be started over before it reads the request (the editor bakes the assets first)
            request.expires = Date.now() + 5*60000;
            await bridge.game.open();
            await bridge.game.removeFile(RESULT);
            await bridge.game.writeFile(REQUEST, JSON.stringify(request));
            await bridge.game.restart();
            stopWatching();
            last = '';
            state.running = true;
            state.human = !!request.human;
            state.request = request;
            watch = setInterval(() => { poll().catch(() => {}); }, 1000);
            send({ type: 'game', game: status() });
            return { speed: request.human ? 1 : speed, background: false };
        },
        async stop()
        {
            stopWatching();
            state.running = false;
            await bridge.game.close();
            send({ type: 'game', game: status() });
        },
        async result()
        {
            const text = await bridge.game.readFile(RESULT).catch(() => null);
            try { return text ? JSON.parse(text) : null; } catch (error) { return null; }
        },
        async build()
        {
            state.building = true;
            send({ type: 'game', game: status() });
            try
            {
                await bridge.game.open();
                await bridge.game.bake();
                send({ type: 'game', game: { ...status(), building: false }, built: true });
            }
            catch (error)
            {
                send({ type: 'game', game: { ...status(), building: false }, built: false, code: error.message });
            }
            finally { state.building = false; }
        }
    };
}

export async function createPortalBackend(onEvent)
{
    const bridge = window.o2portal;
    const context = await bridge.ready;
    document.documentElement.classList.add('o2portal');
    bridge.kit({ controls: false });

    // what the rules and the store read: loaded once, then kept in memory with the lab's own writes
    const files = {};
    const dictionaries = (await bridge.files.list(paths.dictionaries)).filter((file) => !file.dir && file.name.endsWith('.json')).map((file) => file.path);
    const wanted = [...coreScripts.map((name) => paths.scripts + '/' + name), paths.languages, ...dictionaries, ...Object.values(storeFiles)];
    await Promise.all(wanted.map(async (rel) => {
        try { files[rel] = await bridge.files.read(rel); }
        catch (error) { if (error.status != 404) throw new Error(rel + ': ' + error.message); }
    }));
    setHost(createWebHost(files, { workerUrl: new URL('../lab/worker_web.mjs', import.meta.url).href }));

    const emit = (event) => setTimeout(() => onEvent(JSON.parse(JSON.stringify(event))), 0);
    const io = portalIo(bridge, files, emit);
    const permissions = context.plugin.permissions;
    const remote = context.liveops && permissions.remoteConfigs.includes('wordfall_levels') ? {
        get: (key) => bridge.remoteConfig.get(key),
        set: (key, data, options) => bridge.remoteConfig.set(key, data, options),
        publish: (note) => bridge.remoteConfig.publish(note)
    } : null;
    const vcs = {
        async status()
        {
            await io.flush();
            return { available: true, changes: await bridge.files.status(), canCommit: context.canEdit };
        },
        async commit(options)
        {
            await io.flush();
            const done = await bridge.files.commit(options);
            emit({ type: 'vcs' });
            return done;
        }
    };

    const { LabApi } = await import('../lab/api.mjs');
    const api = new LabApi({ io, game: portalGame(bridge, emit), remote, vcs, send: emit });
    bridge.on('files', () => emit({ type: 'vcs' }));
    bridge.on('game', (data) => { if (data && !data.open) emit({ type: 'game', game: api.game.status() }); });
    window.addEventListener('beforeunload', () => api.close());

    return {
        context,
        async call(method, path, body)
        {
            const result = await api.handle(method, new URL(path, 'http://levellab'), body || {});
            if (result === null)
                throw new Error('нет такого запроса: ' + path);
            return JSON.parse(JSON.stringify(result));
        },
        hello() { return api.hello(); },
        assetUrl(rel) { return bridge.files.url(paths.assets + '/' + rel); },
        flush() { return io.flush(); }
    };
}
