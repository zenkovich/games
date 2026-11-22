// The lab on this machine: the checkout's files, the rules run in this realm by node:vm, bots in worker threads.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(here, '../../../..');
export const labRoot = path.resolve(here, '..');

const full = (rel) => path.join(projectRoot, rel);

export const host = {
    kind: 'node',
    readText(rel) { try { return fs.readFileSync(full(rel), 'utf8'); } catch (error) { return undefined; } },
    exists(rel) { return fs.existsSync(full(rel)); },
    runScript(code, rel) { vm.runInThisContext(code, { filename: full(rel) }); },
    readFile(file) { try { return fs.readFileSync(file, 'utf8'); } catch (error) { return undefined; } },
    writeFile(file, text) { try { fs.writeFileSync(file, text); return true; } catch (error) { return false; } },
    parallelism() { return Math.max(1, os.availableParallelism() - 2); },
    makeWorker()
    {
        const worker = new Worker(new URL('./worker.mjs', import.meta.url));
        return {
            post: (message) => worker.postMessage(message),
            onMessage: (fn) => worker.on('message', fn),
            onError: (fn) => worker.on('error', fn),
            terminate: () => worker.terminate()
        };
    }
};

// The project's files as the store and the API write them: relative paths, an atomic write
export const io = {
    kind: 'node',
    read(rel) { try { return fs.readFileSync(full(rel), 'utf8'); } catch (error) { return null; } },
    write(rel, text)
    {
        const file = full(rel);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const temporary = file + '.tmp';
        fs.writeFileSync(temporary, text);
        fs.renameSync(temporary, file);
    },
    // a copy of the campaign among data/backups (git history is the backup where there is no disk of one's own)
    backup(rel, label)
    {
        const from = full(rel);
        if (!fs.existsSync(from))
            return '';
        const root = full('Tools/WordFall/LevelLab/data/backups');
        fs.mkdirSync(root, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const file = path.join(root, 'campaign-' + stamp + (label ? '-' + label : '') + '.json');
        fs.copyFileSync(from, file);
        const old = fs.readdirSync(root).filter((name) => name.startsWith('campaign-')).sort();
        while (old.length > 30)
            fs.unlinkSync(path.join(root, old.shift()));
        return path.relative(projectRoot, file);
    }
};
