#!/usr/bin/env node
// LevelLab on this machine: the page (web/), its API (lab/api.mjs) over HTTP with the checkout's files, and the native
// game started for a bot or a person. On the o2 portal the same page runs the API in the browser (web/portal.js).
//   node Tools/WordFall/LevelLab/server.mjs [--port 8737] [--workers N] [--open]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { projectRoot, labRoot, io } from './lab/node_host.mjs';
import { LabApi } from './lab/api.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => { const at = args.indexOf('--' + name); return at >= 0 && args[at + 1] ? args[at + 1] : fallback; };
const port = Number(option('port', 8737));
const webRoot = path.join(labRoot, 'web');
const labModules = path.join(labRoot, 'lab');
const assetsRoot = path.join(projectRoot, 'Assets');
const platform = process.platform == 'darwin' ? 'Mac' : process.platform == 'win32' ? 'Windows' : 'Linux';
const binRoot = path.join(projectRoot, 'Bin', platform);
const gameBinary = path.join(binRoot, process.platform == 'win32' ? 'Game.exe' : 'Game');
const assetsBuilder = path.join(binRoot, process.platform == 'win32' ? 'AssetsBuilder.exe' : 'AssetsBuilder');
const botRequestPath = path.join(binRoot, 'wordfall_bot.json');
const botResultPath = path.join(binRoot, 'wordfall_bot_result.json');

const clients = new Set();
function send(event)
{
    const text = 'data: ' + JSON.stringify(event) + '\n\n';
    for (const client of clients)
        client.write(text);
}

// ---------------------------------------------------------------- the native game

let game = null;
let gameHuman = false;
let building = null;

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

function readBotResult()
{
    try { return JSON.parse(fs.readFileSync(botResultPath, 'utf8')); }
    catch (error) { return null; }
}

const nativeGame = {
    // What the game binary would play: built assets older than the scripts, the campaign or the dictionaries mean
    // the game does not see the lab's latest work until the assets are rebuilt
    status()
    {
        const builtTree = path.join(projectRoot, 'BuiltAssets', platform, 'Data.json');
        const built = fs.existsSync(builtTree) ? fs.statSync(builtTree).mtimeMs : 0;
        const sources = Math.max(newestFile(path.join(assetsRoot, 'Scripts/WordFall'), /\.js$/),
                                 newestFile(path.join(assetsRoot, 'WordFall/Dictionaries'), /\.json$/),
                                 newestFile(path.join(assetsRoot, 'WordFall'), /^(campaign|languages)\.json$/));
        return {
            kind: 'native', binary: fs.existsSync(gameBinary), builder: fs.existsSync(assetsBuilder), built: built > 0, stale: built < sources,
            running: !!game, human: !!game && gameHuman, building: !!building, binaryPath: path.relative(projectRoot, gameBinary)
        };
    },

    build()
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
        send({ type: 'game', game: nativeGame.status() });
        building.on('exit', (code) => {
            building = null;
            send({ type: 'game', game: nativeGame.status(), built: code == 0, code });
        });
        building.on('error', () => { building = null; send({ type: 'game', game: nativeGame.status(), built: false }); });
    },

    // Starts the game with the request for its bot (or for a person: request.human). background: the game plays
    // without a window, only for its outcome, and is closed when the attempts are over
    play(request, { speed, background })
    {
        if (!fs.existsSync(gameBinary))
            throw new Error('нет ' + path.relative(projectRoot, gameBinary) + ' — соберите игру: cmake --build --preset mac --target Game');
        if (game)
        {
            game.kill();
            game = null;
        }
        try { fs.unlinkSync(botResultPath); } catch (error) {}
        fs.writeFileSync(botRequestPath, JSON.stringify(request));

        const env = { ...process.env, O2_GAME_SPEED: String(background ? 16 : speed) };
        if (background)
            Object.assign(env, { O2_BACKGROUND_WINDOW: '1', O2_INVISIBLE_WINDOW: '1' });
        const child = spawn(gameBinary, [], { cwd: binRoot, stdio: 'ignore', env });
        game = child;
        gameHuman = !!request.human;
        const started = Date.now();
        const watch = setInterval(() => {
            const result = readBotResult();
            const done = result && result.attempts && result.attempts.length >= request.attempts;
            if (result)
                send({ type: 'game', game: nativeGame.status(), result });
            if (game != child || (background && (done || Date.now() - started > 600000)))
            {
                clearInterval(watch);
                if (game == child && background)
                    child.kill();
            }
        }, 700);
        child.on('exit', () => {
            clearInterval(watch);
            if (game == child)
                game = null;
            try { fs.unlinkSync(botRequestPath); } catch (error) {}
            send({ type: 'game', game: nativeGame.status(), result: readBotResult() });
        });
        child.on('error', () => { if (game == child) game = null; });
        send({ type: 'game', game: nativeGame.status() });
        return { speed, background: !!background };
    },

    stop() { if (game) game.kill(); },
    result() { return readBotResult(); }
};

const lab = new LabApi({ io, game: nativeGame, send, workers: Number(option('workers', 0)) });

// ---------------------------------------------------------------- HTTP

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
               '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

function serveFile(response, root, rel)
{
    const file = path.join(root, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory())
    {
        response.writeHead(404);
        response.end('not found');
        return;
    }
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(fs.readFileSync(file));
}

const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    try
    {
        if (url.pathname == '/api/events')
        {
            response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
            response.write('data: ' + JSON.stringify(lab.hello()) + '\n\n');
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
            const result = await lab.handle(request.method, url, body);
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

        // the page is web/; on the portal it imports the lab's modules next to it the same way
        if (url.pathname.startsWith('/lab/'))
            return serveFile(response, labModules, url.pathname.slice('/lab/'.length));
        serveFile(response, webRoot, url.pathname == '/' ? 'index.html' : url.pathname);
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
    console.log('LevelLab: ' + address + '  (' + lab.pool.size + ' workers, ' + lab.store.campaign.length + ' levels)');
    if (args.includes('--open'))
        spawn(process.platform == 'darwin' ? 'open' : process.platform == 'win32' ? 'start' : 'xdg-open', [address], { stdio: 'ignore', shell: process.platform == 'win32' });
});

process.on('SIGINT', () => { lab.close(); if (game) game.kill(); process.exit(0); });
process.on('SIGTERM', () => { lab.close(); if (game) game.kill(); process.exit(0); });
