// Measured hardness of the catalog shapes, kept in data/shapes.json: measured again when the catalog, the bot,
// the rules or the bot settings change
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { assetsRoot, dataRoot } from './core.mjs';
import { shapes, measureShapes } from './shapes.mjs';

const file = path.join(dataRoot, 'shapes.json');

function fingerprint(settings)
{
    const hash = crypto.createHash('sha1');
    hash.update(JSON.stringify(shapes.map((shape) => shape.lines)));
    hash.update(JSON.stringify([settings.language, settings.profiles.average]));
    for (const script of ['Core/WordFallBot.js', 'Core/WordBoard.js', 'Core/WordLevel.js'])
        hash.update(fs.readFileSync(path.join(assetsRoot, 'Scripts/WordFall', script)));
    return hash.digest('hex').slice(0, 16);
}

export async function shapeHardness(pool, settings)
{
    const stamp = fingerprint(settings);
    try
    {
        const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (cached.stamp == stamp)
            return cached.shapes;
    }
    catch (error) {}
    const measured = await measureShapes(pool, settings, { count: 600 });
    fs.mkdirSync(dataRoot, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ stamp, shapes: measured }, null, 1) + '\n');
    return measured;
}
