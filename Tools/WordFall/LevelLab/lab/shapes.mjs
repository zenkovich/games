// Board shapes of the 7×8 field, after the boards of match-3 games: cut corners, hearts, crosses, rings, islands,
// towers, combs. Letters fall through the gaps (WordBoard._CollapseOnce), so any shape is playable. A shape is
// drawn top row first: '#' a cell, '.' a gap.
//
// A shape is a difficulty lever of its own: fewer cells mean fewer letters to make words of, gaps and islands
// break the clusters that multiply a word's score, narrow necks keep long words apart. `measureShapes` makes the
// bots say by how much: the score per move of each shape against the full board.

export const columns = 7, rows = 8;

const catalog = [
    // easy: the whole board or nearly
    ['full', 'Прямоугольник', 'easy', ['#######', '#######', '#######', '#######', '#######', '#######', '#######', '#######']],
    ['corners', 'Срезанные углы', 'easy', ['.#####.', '#######', '#######', '#######', '#######', '#######', '#######', '.#####.']],
    ['pillow', 'Подушка', 'easy', ['..###..', '.#####.', '#######', '#######', '#######', '#######', '#######', '#######']],
    ['crown', 'Корона', 'easy', ['#..#..#', '##.#.##', '#######', '#######', '#######', '#######', '#######', '.#####.']],
    ['stalactites', 'Сосульки', 'easy', ['#######', '#######', '#######', '#######', '#######', '#.#.#.#', '#.#.#.#', '#.#.#.#']],
    ['keyhole', 'Замочная скважина', 'easy', ['#######', '#######', '###.###', '##...##', '###.###', '###.###', '#######', '#######']],
    ['honeycomb', 'Соты', 'easy', ['#######', '##.#.##', '#######', '#.###.#', '#######', '##.#.##', '#######', '#######']],
    ['floors', 'Два этажа', 'easy', ['#######', '#######', '#######', '.......', '#######', '#######', '#######', '#######']],
    ['towers2', 'Две башни', 'easy', ['###.###', '###.###', '###.###', '###.###', '###.###', '###.###', '###.###', '###.###']],

    // medium
    ['octagon', 'Восьмиугольник', 'medium', ['..###..', '.#####.', '#######', '#######', '#######', '#######', '.#####.', '..###..']],
    ['house', 'Домик', 'medium', ['...#...', '..###..', '.#####.', '#######', '#######', '#######', '###.###', '###.###']],
    ['heart', 'Сердце', 'medium', ['.##.##.', '#######', '#######', '#######', '#######', '.#####.', '..###..', '...#...']],
    ['butterfly', 'Бабочка', 'medium', ['##...##', '###.###', '#######', '.#####.', '.#####.', '#######', '###.###', '##...##']],
    ['hourglass', 'Песочные часы', 'medium', ['#######', '#######', '.#####.', '..###..', '..###..', '.#####.', '#######', '#######']],
    ['ring', 'Бублик', 'medium', ['.#####.', '#######', '###.###', '##...##', '##...##', '###.###', '#######', '.#####.']],
    ['frame', 'Рамка', 'medium', ['#######', '#######', '##...##', '##...##', '##...##', '##...##', '#######', '#######']],
    ['arch', 'Арка', 'medium', ['.#####.', '#######', '#######', '#######', '###.###', '##...##', '##...##', '##...##']],
    ['comb', 'Гребёнка', 'medium', ['#######', '#######', '#######', '#.#.#.#', '#.#.#.#', '#.#.#.#', '#.#.#.#', '#.#.#.#']],
    ['quarters', 'Четыре квадрата', 'medium', ['###.###', '###.###', '###.###', '.......', '###.###', '###.###', '###.###', '###.###']],
    ['cross', 'Крест', 'medium', ['..###..', '..###..', '#######', '#######', '#######', '#######', '..###..', '..###..']],
    ['mushroom', 'Гриб', 'medium', ['.#####.', '#######', '#######', '#######', '..###..', '..###..', '..###..', '.#####.']],
    ['towers3', 'Три колонны', 'medium', ['##.#.##', '##.#.##', '##.#.##', '##.#.##', '##.#.##', '##.#.##', '##.#.##', '##.#.##']],
    ['wave', 'Волна', 'medium', ['#####..', '######.', '#######', '.######', '..#####', '.######', '#######', '######.']],

    // hard: few cells, islands, necks
    ['bowl', 'Ваза', 'hard', ['##...##', '##...##', '##...##', '##...##', '#######', '#######', '.#####.', '..###..']],
    ['bridge', 'Мост', 'hard', ['#######', '#######', '##...##', '##...##', '##...##', '##...##', '##...##', '##...##']],
    ['pyramid', 'Пирамида', 'hard', ['...#...', '..###..', '..###..', '.#####.', '.#####.', '#######', '#######', '#######']],
    ['funnel', 'Воронка', 'hard', ['#######', '#######', '#######', '.#####.', '.#####.', '..###..', '..###..', '...#...']],
    ['wings', 'Крылья', 'hard', ['#.....#', '##...##', '###.###', '#######', '#######', '###.###', '##...##', '#.....#']],
    ['tee', 'Буква Т', 'hard', ['#######', '#######', '#######', '..###..', '..###..', '..###..', '..###..', '..###..']],
    ['diamond', 'Ромб', 'hard', ['...#...', '..###..', '.#####.', '#######', '#######', '.#####.', '..###..', '...#...']],
    ['star', 'Звезда', 'hard', ['...#...', '..###..', '#######', '.#####.', '.#####.', '#######', '..###..', '...#...']],
    ['zigzag', 'Зигзаг', 'hard', ['####...', '####...', '.####..', '..####.', '...####', '..####.', '.####..', '####...']],
    ['stairs', 'Лестница', 'hard', ['##.....', '###....', '####...', '#####..', '######.', '#######', '#######', '#######']],
    ['islands', 'Острова', 'hard', ['###.###', '###.###', '.......', '.#####.', '.#####.', '.......', '###.###', '###.###']]
];

function parse(lines)
{
    const holes = [];
    for (let line = 0; line < rows; line++)
    {
        for (let x = 0; x < columns; x++)
        {
            if (lines[line][x] != '#')
                holes.push({ x, y: rows - 1 - line });
        }
    }
    return holes;
}

const key = (x, y) => x + ',' + y;

// Shape metrics: cells, islands (cells joined by sides or corners, as words are), the average number of
// neighbours a cell has (how well letters cluster), symmetry
export function shapeMetrics(holes)
{
    const holeSet = new Set(holes.map((cell) => key(cell.x, cell.y)));
    const inside = (x, y) => x >= 0 && x < columns && y >= 0 && y < rows && !holeSet.has(key(x, y));
    let cells = 0, neighbours = 0;
    const seen = new Set();
    let islands = 0;
    for (let x = 0; x < columns; x++)
    {
        for (let y = 0; y < rows; y++)
        {
            if (!inside(x, y))
                continue;
            cells++;
            for (let dx = -1; dx <= 1; dx++)
                for (let dy = -1; dy <= 1; dy++)
                    neighbours += (dx || dy) && inside(x + dx, y + dy) ? 1 : 0;
            if (seen.has(key(x, y)))
                continue;
            islands++;
            const queue = [[x, y]];
            seen.add(key(x, y));
            while (queue.length > 0)
            {
                const [cx, cy] = queue.pop();
                for (let dx = -1; dx <= 1; dx++)
                {
                    for (let dy = -1; dy <= 1; dy++)
                    {
                        if (inside(cx + dx, cy + dy) && !seen.has(key(cx + dx, cy + dy)))
                        {
                            seen.add(key(cx + dx, cy + dy));
                            queue.push([cx + dx, cy + dy]);
                        }
                    }
                }
            }
        }
    }
    let symmetric = true;
    for (const cell of holes)
        symmetric = symmetric && holeSet.has(key(columns - 1 - cell.x, cell.y));
    return { cells, islands, neighbours: cells > 0 ? Math.round(neighbours/cells*100)/100 : 0, symmetric };
}

// Hardness by the average bot (measureShapes), kept for runs without a fresh measure; data/shapes.json overrides it
const measuredHardness = { full: 0, corners: 0, pillow: 0, crown: 0.01, wave: 0.01, octagon: 0.02, stalactites: 0.04, keyhole: 0.04, hourglass: 0.04, honeycomb: 0.05, floors: 0.05, towers2: 0.05, heart: 0.05, butterfly: 0.05, arch: 0.05, stairs: 0.06, house: 0.07, frame: 0.07, mushroom: 0.08, funnel: 0.08, cross: 0.09, pyramid: 0.09, ring: 0.1, bowl: 0.11, wings: 0.12, tee: 0.12, quarters: 0.13, diamond: 0.14, star: 0.14, bridge: 0.15, comb: 0.16, zigzag: 0.17, towers3: 0.19, islands: 0.26 };

export const shapes = catalog.map(([id, name, group, lines]) => {
    const holes = parse(lines);
    return { id, name, group, lines, holes, hardness: measuredHardness[id], ...shapeMetrics(holes) };
});

export function shapeById(id)
{
    return shapes.find((shape) => shape.id == id) || null;
}

// The catalog shape a level's holes make, or null
export function shapeOf(holes)
{
    const own = new Set((holes || []).map((cell) => key(cell.x, cell.y)));
    return shapes.find((shape) => shape.holes.length == own.size && shape.holes.every((cell) => own.has(key(cell.x, cell.y)))) || null;
}

export function mirrorHoles(holes)
{
    return holes.map((cell) => ({ x: columns - 1 - cell.x, y: cell.y }));
}

// Score per move of every shape against the full board, by the average bot on an open level (no limits, one easy
// word): the share of points a shape leaves the player. Resolves to { id: { scorePerMove, factor } }
export async function measureShapes(pool, settings, options = {})
{
    const count = options.count || 400;
    const moves = 12;
    const word = { ru: ['КОТ'], en: ['CAT'] };
    const results = {};
    const jobs = shapes.map((shape) => pool.simulate({ id: 'SHAPE_' + shape.id, words: word, moves, targetScore: 10, holeCells: shape.holes,
                                                       boosterCharges: [0, 0, 0, 0, 0], tasks: [] },
                                                     { language: settings.language, profile: settings.profiles.average, count, seedBase: 7,
                                                       cap: moves, assume: { moves, targetScore: 100000 } }));
    const runs = await Promise.all(jobs);
    shapes.forEach((shape, i) => {
        const records = runs[i];
        const perMove = records.reduce((sum, record) => sum + (record.scoreAt.length > 0 ? record.scoreAt[record.scoreAt.length - 1]/record.scoreAt.length : 0), 0)/records.length;
        let words = 0, long = 0;
        for (const record of records)
        {
            for (let length = 0; length < record.lengths.length; length++)
            {
                words += record.lengths[length];
                long += length >= 5 ? record.lengths[length] : 0;
            }
        }
        results[shape.id] = { scorePerMove: Math.round(perMove*10)/10, longWords: words > 0 ? long/words : 0 };
    });
    const full = results.full;
    for (const id in results)
    {
        const item = results[id];
        item.factor = Math.round(item.scorePerMove/(full.scorePerMove || 1)*100)/100;
        item.longFactor = Math.round(item.longWords/(full.longWords || 1)*100)/100;
        // how much harder the shape makes a level: points and long words it takes away, 0 — none
        item.hardness = Math.round(Math.max(0, 0.6*(1 - item.factor) + 0.4*(1 - item.longFactor))*100)/100;
        item.longWords = Math.round(item.longWords*1000)/1000;
    }
    return results;
}
