// node --test Tools/WordFall/LevelLab/test
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from '../lab/core.mjs';
import { shapes, shapeOf, shapeMetrics, mirrorHoles, columns, rows } from '../lab/shapes.mjs';
import { Layout, relayout } from '../lab/layouts.mjs';
import { designLevel, validateLevel } from '../lab/generate.mjs';
import { buildCurve } from '../lab/curve.mjs';
import { playAttempt } from '../lab/sim.mjs';

loadCore();

function rng(seed)
{
    let state = seed >>> 0;
    const next = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state/4294967296; };
    next.int = (n) => Math.min(n - 1, Math.floor(next()*n));
    next.range = (a, b) => a + next.int(b - a + 1);
    next.pick = (list) => list[next.int(list.length)];
    next.chance = (p) => next() < p;
    next.shuffle = (list) => { for (let i = list.length - 1; i > 0; i--) { const j = next.int(i + 1); [list[i], list[j]] = [list[j], list[i]]; } return list; };
    next.weighted = (items) => items[0][0];
    return next;
}

const key = (cell) => cell.x + ',' + cell.y;
const mirrored = (cells) => new Set(cells.map((cell) => (columns - 1 - cell.x) + ',' + cell.y));

test('every catalog shape is a 7×8 board with a unique id and enough cells', () => {
    const ids = new Set();
    for (const shape of shapes)
    {
        assert.equal(shape.lines.length, rows, shape.id);
        assert.ok(shape.lines.every((line) => line.length == columns && /^[#.]+$/.test(line)), shape.id);
        assert.ok(!ids.has(shape.id), 'duplicate ' + shape.id);
        ids.add(shape.id);
        assert.ok(shape.cells >= 20, shape.id + ' has ' + shape.cells + ' cells');
        assert.equal(shapeOf(shape.holes).id, shape.id, 'a shape is found by its holes');
    }
    assert.ok(shapes.length >= 30);
});

test('shape metrics count cells, islands and symmetry', () => {
    assert.deepEqual(shapeMetrics([]), { cells: 56, islands: 1, neighbours: 6.46, symmetric: true });
    const islands = shapes.find((shape) => shape.id == 'islands');
    assert.equal(islands.islands, 5);
    const stairs = shapes.find((shape) => shape.id == 'stairs');
    assert.equal(stairs.symmetric, false);
    assert.equal(shapeOf(mirrorHoles(stairs.holes)), null, 'a mirrored asymmetric shape is another set of holes');
});

test('blockers on a symmetric shape are laid out symmetrically', () => {
    for (const shape of shapes.filter((item) => item.symmetric))
    {
        for (const kind of ['crates', 'ice', 'snow', 'stones', 'chains'])
        {
            for (let seed = 1; seed <= 4; seed++)
            {
                const layout = new Layout(rng(seed*31 + kind.length), shape.holes, []);
                const cells = layout.place(kind, 8);
                const set = new Set(cells.map(key));
                const holes = new Set(shape.holes.map(key));
                assert.ok(cells.every((cell) => !holes.has(key(cell))), shape.id + ' ' + kind + ': no blocker in a gap');
                assert.equal(set.size, cells.length, 'no cell twice');
                for (const cell of mirrored(cells))
                    assert.ok(set.has(cell), shape.id + ' ' + kind + ' seed ' + seed + ': the mirror of ' + cell + ' is missing');
            }
        }
    }
});

test('bonuses come in mirrored pairs or in the middle column', () => {
    const shape = shapes.find((item) => item.id == 'full');
    for (let seed = 1; seed <= 20; seed++)
    {
        const layout = new Layout(rng(seed), shape.holes, []);
        layout.place('crates', 8);
        const bonuses = layout.placeBonuses(2 + (seed % 2), ['bomb', 'rocket']);
        const cells = bonuses.map((item) => item.cell);
        const set = new Set(cells.map(key));
        for (const cell of cells)
            assert.ok(cell.x == 3 || set.has((columns - 1 - cell.x) + ',' + cell.y), 'seed ' + seed + ': ' + key(cell) + ' has no pair');
        for (const item of bonuses)
        {
            const pair = bonuses.find((other) => other.cell.x == columns - 1 - item.cell.x && other.cell.y == item.cell.y);
            assert.ok(!pair || pair.kind == item.kind, 'a pair is of one kind');
        }
    }
});

test('relayout keeps the kinds and counts of a level’s blockers and bonuses', () => {
    const level = { holeCells: shapes.find((item) => item.id == 'heart').holes,
                    crateCells: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 5, y: 3 }], crateGrades: [1, 2, 1],
                    iceCells: [{ x: 3, y: 3 }, { x: 0, y: 5 }], powerupCells: [{ x: 4, y: 4 }], powerupKinds: ['rocket'] };
    const { level: out } = relayout(level, rng(5));
    assert.equal(out.crateCells.length, 3);
    assert.deepEqual([...out.crateGrades].sort(), [1, 1, 2]);
    assert.equal(out.iceCells.length, 2);
    assert.equal(out.powerupCells.length, 1);
    assert.deepEqual(out.powerupKinds, ['rocket']);
    assert.deepEqual(validateLevel({ ...out, words: { ru: ['КОТ'], en: ['CAT'] }, tasks: [] }), []);
});

test('designed levels are valid, their shapes vary and follow the difficulty of their place', () => {
    const curve = buildCurve(null);
    let previous = '';
    let repeats = 0;
    for (let number = 1; number <= 100; number += 3)
    {
        const point = curve[number - 1];
        const { level, notes } = designLevel(number, 100, point.tier, { seed: 1, recentShapes: previous ? [previous] : [] });
        assert.deepEqual(validateLevel(level), [], 'level ' + number);
        repeats += notes.shapeId == previous ? 1 : 0;
        previous = notes.shapeId;
        if (number <= 5)
            assert.ok(['full', 'corners', 'pillow'].includes(notes.shapeId), 'level ' + number + ' starts on a near-full board, got ' + notes.shapeId);
    }
    assert.equal(repeats, 0, 'consecutive levels take different shapes');
});

test('letters fall through gaps inside the board in the simulator', () => {
    const ring = shapes.find((item) => item.id == 'ring');
    const record = playAttempt({ id: 'T1', words: { ru: ['КОТ'], en: ['CAT'] }, moves: 10, targetScore: 10000, holeCells: ring.holes, tasks: [] },
                               { language: 'ru', profile: { erudition: 0.5, effort: 0.5, skill: 0.5, boosters: 0, spread: 0 }, seed: 3, trace: true });
    const last = record.trace.steps[record.trace.steps.length - 1].board;
    const holes = new Set(ring.holes.map(key));
    for (let x = 0; x < columns; x++)
        for (let y = 0; y < rows; y++)
        {
            const cell = last[x*rows + y];
            if (holes.has(x + ',' + y))
                assert.ok(cell.hole, x + ',' + y + ' stays a gap');
            else
                assert.ok(cell.l || cell.bonus, x + ',' + y + ' has a letter after ' + record.moves + ' moves');
        }
});

test('the API sends the campaign to the builds through a remote config and says what differs', async () => {
    const { LabApi } = await import('../lab/api.mjs');
    const { io: disk } = await import('../lab/node_host.mjs');
    const written = {};
    const io = { kind: 'memory', read: (rel) => (rel in written ? written[rel] : disk.read(rel)), write: (rel, text) => { written[rel] = text; } };
    const configs = { draft: null, live: null };
    const remote = {
        get: async () => ({ draft: configs.draft, live: configs.live, canPublish: true, publishedAt: 0 }),
        set: async (key, data) => { assert.equal(key, 'wordfall_levels'); configs.draft = data; },
        publish: async () => { configs.live = configs.draft; }
    };
    const game = { status: () => ({ kind: 'test' }), play: async () => ({}), stop: async () => {}, result: async () => null, build: async () => {} };
    const api = new LabApi({ io, game, remote, workers: 1 });
    try
    {
        const url = (path) => new URL(path, 'http://lab');
        assert.deepEqual((await api.handle('GET', url('/api/build'), {})).live, { count: 0, same: 0, differ: 0 });
        await api.handle('POST', url('/api/build'), { publish: false });
        let state = await api.handle('GET', url('/api/build'), {});
        assert.equal(state.draft.count, api.store.campaign.length);
        assert.equal(state.live.count, 0, 'a draft is not what the builds get');
        await api.handle('POST', url('/api/build'), { publish: true, note: 'test' });
        const first = api.store.campaign[0];
        assert.deepEqual(configs.live.levels[first.id], first, 'the levels by their id, as the campaign has them');
        await api.handle('POST', url('/api/level'), { id: first.id, level: { ...first, moves: first.moves + 7 } });
        state = await api.handle('GET', url('/api/build'), {});
        assert.deepEqual(state.live, { count: api.store.campaign.length, same: api.store.campaign.length - 1, differ: 1 });
        assert.ok(written['Assets/WordFall/campaign.json'].includes('"moves":' + (first.moves + 7)), 'the edit went to the files of the io');
        await api.handle('POST', url('/api/build'), { publish: true, clear: true });
        assert.deepEqual(configs.live.levels, {});
        assert.equal((await api.handle('GET', url('/api/vcs'), {})).available, false, 'no working copy service: no commit from here');
    }
    finally { api.close(); }
});
