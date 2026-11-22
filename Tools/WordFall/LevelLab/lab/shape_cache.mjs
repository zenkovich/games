// Measured hardness of the catalog shapes, kept in data/shapes.json: measured again when the catalog, the bot,
// the rules or the bot settings change
import { getHost, paths } from './core.mjs';
import { shapes, measureShapes } from './shapes.mjs';
import { storeFiles } from './store.mjs';

async function fingerprint(settings)
{
    const host = getHost();
    const parts = [JSON.stringify(shapes.map((shape) => shape.lines)), JSON.stringify([settings.language, settings.profiles.average])];
    for (const script of ['WordFallBot.js', 'WordBoard.js', 'WordLevel.js'])
        parts.push(host.readText(paths.scripts + '/' + script) || '');
    const digest = await globalThis.crypto.subtle.digest('SHA-1', new TextEncoder().encode(parts.join('')));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

let measuring = null;

export async function shapeHardness(pool, settings, io)
{
    const stamp = await fingerprint(settings);
    try
    {
        const cached = JSON.parse(io.read(storeFiles.shapes) || 'null');
        if (cached && cached.stamp == stamp)
            return cached.shapes;
    }
    catch (error) {}
    // two callers at once (the page asks for the gallery while a job starts) measure once
    if (!measuring || measuring.stamp != stamp)
    {
        const job = measureShapes(pool, settings, { count: 600 }).then((measured) => {
            io.write(storeFiles.shapes, JSON.stringify({ stamp, shapes: measured }, null, 1) + '\n');
            return measured;
        });
        measuring = { stamp, job };
        job.catch(() => { if (measuring && measuring.job == job) measuring = null; });
    }
    return measuring.job;
}
