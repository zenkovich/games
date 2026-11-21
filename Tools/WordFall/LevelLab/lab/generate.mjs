// Level generator: designs the structure of a level for its place in the campaign (board shape, blockers,
// goals, words), then the tuner sets moves and the target score so that the bots need the target attempts.
import { loadCore, seedOf, dictionary, languages } from './core.mjs';
import { tuneLevel, withinTolerance } from './tune.mjs';
import { evaluateLevel } from './difficulty.mjs';
import { shapes, shapeById, shapeOf, mirrorHoles, columns, rows } from './shapes.mjs';
import { Layout, patternNames } from './layouts.mjs';

export const generatorVersion = 2;

// Level at which a mechanic first appears; the level that introduces it shows it alone
export const unlocks = {
    crates: 3, ice: 6, length: 8, bonus: 11, snow: 14, wordScore: 17, parcels: 23, chains: 27, stones: 33,
    crates2: 38, snowfall: 44, crates3: 55
};

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
    next.weighted = (items) => {
        const total = items.reduce((sum, item) => sum + item[1], 0);
        let roll = next()*total;
        for (const item of items)
        {
            roll -= item[1];
            if (roll <= 0)
                return item[0];
        }
        return items[items.length - 1][0];
    };
    return next;
}

// Hardness of a shape by the bots (shapes.measureShapes): 0 — plays like the full board. Without a fresh measure the
// catalog's stored one stands in
function hardnessOf(shape, measured)
{
    const item = measured && measured[shape.id];
    return item ? item.hardness : shape.hardness !== undefined ? shape.hardness : { easy: 0.03, medium: 0.08, hard: 0.13 }[shape.group];
}

// A shape for the level's place in the campaign: the full board and its near kin while the player learns, then the
// harder the further and the higher the peak; never the shape of the levels just before (consecutive levels should
// not look alike). An asymmetric shape may come mirrored
function pickShape(rng, number, count, tier, options)
{
    const progress = count > 1 ? (number - 1)/(count - 1) : 0;
    const soften = options.soften || 0;
    let low = 0, high = 0.05;
    if (number <= 5) high = 0.005;
    else if (tier == 'tutorial' || tier == 'relief') high = 0.05;
    else if (tier == 'normal') { low = Math.max(0, 0.06*progress - 0.04); high = 0.05 + 0.08*progress; }
    else if (tier == 'hard') { low = 0.06; high = 0.16; }
    else if (tier == 'super') { low = 0.1; high = progress > 0.75 ? 0.5 : 0.2; }
    high = Math.max(0.005, high - 0.04*soften);
    low = Math.min(low, high);

    const recent = new Set(options.recentShapes || []);
    let pool = shapes.filter((shape) => !recent.has(shape.id) && hardnessOf(shape, options.measured) >= low - 1e-9 &&
                                        hardnessOf(shape, options.measured) <= high + 1e-9);
    if (pool.length == 0)
        pool = shapes.filter((shape) => !recent.has(shape.id) && hardnessOf(shape, options.measured) <= high + 0.03);
    if (pool.length == 0)
        pool = [shapeById('full')];
    // symmetric shapes are the rule, the others a seasoning
    const shape = rng.weighted(pool.map((item) => [item, item.symmetric ? 3 : 1]));
    const mirrored = !shape.symmetric && rng.chance(0.5);
    return { id: shape.id, name: shape.name + (mirrored ? ' (зеркально)' : ''), holes: mirrored ? mirrorHoles(shape.holes) : shape.holes.slice(),
             hardness: hardnessOf(shape, options.measured) };
}

const key = (cell) => cell.x + ',' + cell.y;

function letterValues(language)
{
    const values = {};
    for (const def of WordFallLanguages.Get(language).letters)
        values[def.letter] = def;
    return values;
}

// Level words: ordinary, widely known words of the wanted lengths that were not used in the campaign yet
function pickWords(rng, language, lengths, used, minFamiliarity, simple)
{
    const words = dictionary(language);
    const values = letterValues(language);
    const picked = [];
    for (const length of lengths)
    {
        let found = '';
        for (let familiarity = minFamiliarity; familiarity >= 5 && !found; familiarity--)
        {
            const pool = [];
            const indices = words.GetIndices(length);
            for (let i = 0; i < indices.length; i++)
            {
                const index = indices[i];
                const word = words.GetAllWords()[index];
                if (!words.IsLevelWord(index) || words.GetFamiliarity(index) < familiarity || used.has(word) || picked.includes(word) ||
                    words.GetDifficulty(index) > (simple ? length - 1 : length + 1))
                {
                    continue;
                }
                // a word of two rare letters may never come together on the board
                let rare = 0, spellable = true;
                for (const letter of word)
                {
                    spellable = spellable && !!values[letter];
                    rare += values[letter] && values[letter].bagCount <= 1 ? 1 : 0;
                }
                if (spellable && rare <= (simple ? 0 : 1))
                    pool.push(word);
            }
            if (pool.length > 0)
                found = rng.pick(pool);
        }
        if (found)
            picked.push(found);
    }
    return picked;
}

function wordLengths(rng, number, tier)
{
    let options;
    if (number <= 6) options = [[3]];
    else if (number <= 14) options = [[3], [4], [4]];
    else if (number <= 24) options = [[4], [4], [3, 4], [5]];
    else if (number <= 44) options = [[4], [5], [3, 4], [4, 4], [4, 5]];
    else if (number <= 70) options = [[5], [4, 5], [5, 5], [4, 4], [6], [3, 4, 5]];
    else options = [[5], [6], [4, 5], [5, 5], [5, 6], [4, 5, 6], [7]];

    let lengths = rng.pick(options).slice();
    if (tier == 'relief' || tier == 'tutorial')
        lengths = lengths.slice(0, 1);
    if (tier == 'super' && lengths.length < 3)
        lengths.push(Math.min(7, lengths[lengths.length - 1] + 1));
    return lengths;
}

// Structure of the level number (1-based) of a campaign: raw level in the campaign.json format plus design notes
export function designLevel(number, count, tier, options = {})
{
    loadCore();
    const rng = mulberry(seedOf(options.seed || 1, number, options.variant || 0));
    const progress = count > 1 ? (number - 1)/(count - 1) : 0;
    const soften = options.soften || 0;
    const tierShift = { tutorial: -0.1, relief: -0.2, normal: 0, hard: 0.15, super: 0.25 }[tier] || 0;
    const density = Math.min(1, Math.max(0.1, 0.25 + 0.6*progress + tierShift - 0.15*soften));
    const unlocked = (mechanic) => number >= unlocks[mechanic];
    const introduces = Object.keys(unlocks).find((mechanic) => unlocks[mechanic] == number) || '';

    const shape = pickShape(rng, number, count, tier, options);
    const playable = columns*rows - shape.holes.length;
    const layout = new Layout(rng, shape.holes, []);

    const level = {
        id: WordFallConfigs.LevelId(number - 1), difficulty: 1, words: {}, targetScore: 200, moves: 12,
        boosterCharges: (options.boosterCharges || [1, 1, 1, 1, 1]).slice(), holeCells: shape.holes, tasks: []
    };

    // blockers: one kind early, up to three later; a freshly introduced kind is featured for a few levels
    // an envelope may refuse to come down whatever the player does: no place for it on a breather
    const blockers = ['crates', 'ice', 'snow', 'parcels', 'chains', 'stones', 'bonus'].filter(unlocked)
        .filter((mechanic) => mechanic != 'parcels' || (tier != 'relief' && tier != 'tutorial'));
    const recent = blockers.filter((mechanic) => number - unlocks[mechanic] <= 3);
    let wanted = number < 3 ? 0 : number <= 12 ? 1 : number <= 40 ? rng.range(1, 2) : rng.range(1, 3);
    if (tier == 'hard' || tier == 'super')
        wanted = Math.min(3, wanted + 1);
    if (tier == 'relief')
        wanted = Math.min(wanted, 1);
    if (soften >= 2)
        wanted = Math.min(wanted, 1);

    let chosen = [];
    if (blockers.includes(introduces))
        chosen = [introduces];
    else
    {
        chosen = rng.shuffle(recent.slice()).slice(0, 1);
        const rest = rng.shuffle(blockers.filter((mechanic) => !chosen.includes(mechanic)));
        while (chosen.length < wanted && rest.length > 0)
            chosen.push(rest.pop());
        chosen = chosen.slice(0, wanted);
    }
    // chains and stones only get in the way: they come with something to do
    if (chosen.length > 0 && chosen.every((mechanic) => mechanic == 'chains' || mechanic == 'stones') && blockers.includes('crates') && !blockers.includes(introduces))
        chosen.push(rng.pick(['crates', 'ice'].filter(unlocked)));

    const tasks = [];
    const notes = { shape: shape.name, shapeId: shape.id, shapeHardness: shape.hardness, blockers: chosen.slice(), density: Math.round(density*100)/100 };
    // at least 26 letters stay free: fewer leave too few words on the board
    const limit = Math.max(0, Math.min(Math.floor(playable*0.42), playable - 26));
    let blocked = 0;
    const room = (count) => Math.max(0, Math.min(count, limit - blocked));

    if (chosen.includes('parcels'))
    {
        const gentle = introduces == 'parcels' || tier == 'tutorial' || tier == 'relief' || soften >= 2;
        const total = gentle ? 1 : Math.max(1, Math.min(4, Math.round(1 + density*2.4 + (rng() - 0.5))));
        const onScreen = total >= 2 && rng.chance(0.6) ? 2 : 1;
        level.parcelCells = layout.place('parcels', onScreen);
        level.parcelTotal = Math.max(total, level.parcelCells.length);
        level.parcelOnScreen = onScreen;
        tasks.push({ taskType: 'Deliver', count: level.parcelTotal });
        blocked += level.parcelCells.length;
    }
    if (chosen.includes('crates'))
    {
        const cells = layout.place('crates', room(Math.round(3 + density*7)));
        level.crateCells = cells;
        // mirrored crates get the same strength
        const grades = {};
        level.crateGrades = cells.map((cell) => {
            const pair = Math.min(cell.x, columns - 1 - cell.x) + ',' + cell.y;
            if (grades[pair] === undefined)
                grades[pair] = unlocked('crates3') && rng.chance(density*0.2) ? 3 : unlocked('crates2') && rng.chance(density*0.45) ? 2 : 1;
            return grades[pair];
        });
        tasks.push({ taskType: 'Crates' });
        blocked += cells.length;
    }
    if (chosen.includes('snow'))
    {
        const cells = layout.place('snow', room(Math.round(3 + density*5)));
        level.snowCells = cells;
        const snowfall = unlocked('snowfall') && rng.chance(0.4);
        if (snowfall)
            level.snowPerMove = 1;
        tasks.push({ taskType: 'Melt', count: cells.length + (snowfall ? Math.round(3 + density*5) : 0) });
        blocked += cells.length;
    }
    if (chosen.includes('ice'))
    {
        const cells = layout.place('ice', room(Math.round(2 + density*8)));
        level.iceCells = cells;
        if (introduces == 'ice' || rng.chance(0.55))
            tasks.push({ taskType: 'ClearIce' });
        blocked += cells.length;
    }
    if (chosen.includes('stones'))
    {
        level.stoneCells = layout.place('stones', room(2*Math.round(0.5 + density*2)));
        blocked += level.stoneCells.length;
    }
    if (chosen.includes('chains'))
        level.chainCells = layout.place('chains', 2*Math.round(0.5 + density*2) + (rng.chance(0.4) ? 1 : 0));
    // bonuses where they help: in the middle of a ring, by the thickest blockers; stones only break by bonuses
    if (chosen.includes('bonus') || (level.stoneCells && level.stoneCells.length > 0))
    {
        const kinds = number < 35 ? ['bomb'] : number < 70 ? ['bomb', 'rocket'] : ['bomb', 'rocket', 'fireworks'];
        const bonuses = layout.placeBonuses(chosen.includes('bonus') ? rng.pick([1, 2, 2, 3]) : 2, kinds);
        level.powerupCells = bonuses.map((item) => item.cell);
        level.powerupKinds = bonuses.map((item) => item.kind);
    }
    notes.layout = layout.used.map((item) => item.kind + ': ' + (patternNames[item.pattern] || item.pattern));

    // word goals fill the list up to the wanted number of tasks
    const tasksWanted = Math.max(1, Math.min(4, (number <= 10 ? 1 : number <= 30 ? rng.range(1, 2) : rng.range(2, 3)) +
                                             (tier == 'super' ? 1 : 0) - (tier == 'relief' ? 1 : 0) - (soften >= 2 ? 1 : 0) - (soften >= 4 ? 1 : 0)));
    const wordGoals = ['letter', 'anyWords'];
    if (unlocked('length')) wordGoals.push('length', 'length');
    if (unlocked('wordScore')) wordGoals.push('wordScore');
    if (unlocked('bonus')) wordGoals.push('powerup');
    const goalOrder = rng.shuffle(wordGoals.slice());
    if (introduces == 'length' || introduces == 'wordScore')
        goalOrder.unshift(introduces);
    if (introduces == 'bonus')
        goalOrder.unshift('powerup');

    const letterOf = {};
    for (const language of languages())
    {
        const common = WordFallLanguages.Get(language).letters.filter((def) => def.bagCount >= 4).map((def) => def.letter);
        letterOf[language] = rng.pick(common);
    }
    const seenGoals = new Set();
    for (const goal of goalOrder)
    {
        if (tasks.length >= tasksWanted)
            break;
        if (seenGoals.has(goal))
            continue;
        seenGoals.add(goal);

        if (goal == 'letter')
            tasks.push({ taskType: 'Letter', count: Math.round(3 + density*5), letter: { ...letterOf } });
        else if (goal == 'anyWords')
            tasks.push({ taskType: 'AnyWords', count: Math.round(4 + density*3) });
        else if (goal == 'length')
            tasks.push({ taskType: 'Length', length: number < 30 ? 4 : rng.pick(number < 60 ? [4, 5] : [4, 5, 5, 6]), count: Math.max(1, Math.round(1 + density*1.6)) });
        else if (goal == 'wordScore')
            tasks.push({ taskType: 'WordScore', scoreThreshold: Math.round((20 + density*25)/5)*5 });
        else if (goal == 'powerup')
        {
            const kind = number < 35 ? 'bomb' : number < 70 ? rng.pick(['bomb', 'rocket']) : rng.pick(['bomb', 'rocket', 'fireworks']);
            tasks.push({ taskType: 'Powerup', powerupKind: kind, count: kind == 'bomb' && density > 0.6 && rng.chance(0.4) ? 2 : 1 });
        }
    }
    level.tasks = tasks;

    const lengths = wordLengths(rng, number, tier);
    const used = options.usedWords || {};
    for (const language of languages())
        level.words[language] = pickWords(rng, language, lengths, used[language] || new Set(), number <= 30 ? 9 : 8, number <= 30);

    level.extraVowels = number <= 20 ? 6 : number <= 40 ? 4 : number <= 70 ? 2 : 0;
    if (number > 50)
        level.extraRare = rng.range(0, 3) + (tier == 'hard' || tier == 'super' ? 1 : 0);

    notes.preferredMoves = Math.round(Math.min(18, Math.max(9, 9 + tasks.length*1.5 + lengths.length + (tier == 'tutorial' || tier == 'relief' ? 2 : 0))));
    level.moves = notes.preferredMoves;
    return { level: compactLevel(level), notes };
}

// Drops empty lists and default values, as the game's own export does
export function compactLevel(level)
{
    const compact = {};
    for (const name in level)
    {
        const value = level[name];
        if (value === undefined || value === null || (Array.isArray(value) && value.length == 0) || value === 0 || value === '')
            continue;
        if (name == 'parcelOnScreen' && !level.parcelTotal)
            continue;
        if (name == 'tasks')
        {
            compact.tasks = value.map((task) => {
                const out = { taskType: task.taskType };
                for (const field in task)
                {
                    const skip = field == 'taskType' || task[field] === undefined || task[field] === '' ||
                        (field == 'count' && task[field] == 1) || (field == 'length' && task.taskType != 'Length') ||
                        (field == 'scoreThreshold' && task.taskType != 'WordScore') || (field == 'powerupKind' && task.taskType != 'Powerup') ||
                        (field == 'letter' && task.taskType != 'Letter');
                    if (!skip)
                        out[field] = task[field];
                }
                return out;
            });
            continue;
        }
        compact[name] = value;
    }
    return compact;
}

// Problems of a level a person should know about before playing or tuning it
export function validateLevel(level)
{
    loadCore();
    const problems = [];
    const holes = new Set((level.holeCells || []).map(key));
    const inside = (cell) => cell.x >= 0 && cell.x < columns && cell.y >= 0 && cell.y < rows && !holes.has(key(cell));
    const lists = ['iceCells', 'stoneCells', 'crateCells', 'chainCells', 'snowCells', 'parcelCells', 'powerupCells'];
    const occupied = new Map();
    for (const name of lists)
    {
        for (const cell of level[name] || [])
        {
            if (!inside(cell))
                problems.push(name + ': клетка ' + key(cell) + ' вне поля');
            else if (occupied.has(key(cell)))
                problems.push('клетка ' + key(cell) + ' занята дважды: ' + occupied.get(key(cell)) + ' и ' + name);
            occupied.set(key(cell), name);
        }
    }
    // a chain holds its column: cells under it get no letters until the chain is gone — fine for a few, not for a pile
    for (const cell of level.chainCells || [])
    {
        let starved = 0;
        for (let y = cell.y - 1; y >= 0; y--)
            starved += inside({ x: cell.x, y }) ? 1 : 0;
        if (starved >= 6)
            problems.push('цепь на ' + key(cell) + ' перекрывает ' + starved + ' клеток колонки');
    }

    const blockedCells = ['iceCells', 'stoneCells', 'crateCells', 'snowCells', 'parcelCells', 'powerupCells']
        .reduce((sum, name) => sum + (level[name] || []).length, 0);
    if (columns*rows - holes.size - blockedCells < 24)
        problems.push('свободных букв меньше 24 — поле слишком забито');

    for (const language of languages())
    {
        const words = (level.words || {})[language] || [];
        if (words.length == 0)
            problems.push(language + ': нет слов уровня');
        for (const word of words)
        {
            if (!dictionary(language).Contains(word))
                problems.push(language + ': слова ' + word + ' нет в словаре');
        }
    }

    const has = (name) => (level[name] || []).length > 0;
    for (const task of level.tasks || [])
    {
        if (task.taskType == 'Crates' && !has('crateCells')) problems.push('задание «Ящики» без ящиков');
        if (task.taskType == 'ClearIce' && !has('iceCells')) problems.push('задание «Лёд» без льда');
        if (task.taskType == 'Melt' && !has('snowCells') && !level.snowPerMove) problems.push('задание «Снежки» без снежков');
        if (task.taskType == 'Melt' && !level.snowPerMove && (task.count || 1) > (level.snowCells || []).length)
            problems.push('задание «Снежки»: нужно ' + (task.count || 1) + ', на поле ' + (level.snowCells || []).length);
        if (task.taskType == 'Deliver' && (task.count || 1) > Math.max(level.parcelTotal || 0, (level.parcelCells || []).length))
            problems.push('задание «Конверты»: нужно ' + (task.count || 1) + ', всего конвертов ' + (level.parcelTotal || 0));
        if (task.taskType == 'AnyWords' && (task.count || 1) > (level.moves || 12))
            problems.push('задание «Найти слова»: ' + (task.count || 1) + ' слов за ' + (level.moves || 12) + ' ходов');
    }
    if ((level.crateGrades || []).length != (level.crateCells || []).length && has('crateCells'))
        problems.push('число прочностей ящиков не совпадает с числом ящиков');
    if ((level.powerupKinds || []).length != (level.powerupCells || []).length)
        problems.push('число видов бонусов не совпадает с числом клеток бонусов');
    return problems;
}

// Generates one level for its target: designs, tunes, retries with a softer or another design when the target is
// out of reach. report(event) follows the process. Returns { level, meta }
// context: { number, count, target, tier, seed, variant, usedWords: {lang: Set}, keepStructure: level,
//            shapes: measured shape hardness (shapes.measureShapes), recentShapes: ids of the shapes of the levels before }
export async function generateLevel(pool, context, settings, report = () => {})
{
    const { number, count, target, tier } = context;
    let best = null;
    const maxTries = context.keepStructure ? 1 : 7;
    for (let attempt = 0; attempt < maxTries; attempt++)
    {
        const variant = (context.variant || 0)*16 + attempt;
        const tooHard = best && (best.reason == 'goals' || best.reason == 'invalid' || (best.reason == 'miss' && best.attempts > target));
        const soften = tooHard ? (best.soften || 0) + 1 : best ? best.soften || 0 : 0;
        const designed = context.keepStructure
            ? { level: JSON.parse(JSON.stringify(context.keepStructure)), notes: { kept: true, preferredMoves: context.keepStructure.moves } }
            : designLevel(number, count, tier, { seed: context.seed, variant, soften, usedWords: context.usedWords,
                                                 boosterCharges: settings.boosterCharges, measured: context.shapes,
                                                 recentShapes: context.recentShapes });
        report({ type: 'design', number, attempt, notes: designed.notes, level: designed.level });

        const problems = validateLevel(designed.level);
        if (problems.length > 0 && !context.keepStructure)
        {
            report({ type: 'invalid', number, problems });
            best = best || { reason: 'invalid', soften };
            continue;
        }

        // a peak is short on moves by design; other levels keep the moves the design asks for
        const preferredMoves = tier == 'hard' || tier == 'super' ? Math.max(settings.moves.min, designed.notes.preferredMoves - 3 - (number % 3))
            : designed.notes.preferredMoves;
        // on a peak the goals carry more of the difficulty: a score target alone shuts weak players out
        const goalsWeight = tier == 'hard' || tier == 'super' ? settings.peakGoals : 0.5;
        const tuned = await tuneLevel(pool, designed.level, target, settings, { preferredMoves, goalsWeight, salt: variant },
                                      (event) => report({ ...event, number }));
        // a design whose goals are out of reach is the last resort
        const miss = (tuned.attempts ? Math.abs(Math.log(tuned.attempts/target)) : 100) + (tuned.reason == 'goals' ? 10 : 0);
        const candidate = { ...tuned, notes: designed.notes, miss, soften, variant };
        if (!best || !best.level || miss < best.miss)
            best = candidate;
        else
            best.soften = soften;
        if (tuned.ok)
            break;
        best.reason = tuned.reason;
        if (tuned.reason == 'miss' && withinTolerance(tuned.attempts, target, settings.tolerance*2))
            break;
    }

    if (!best || !best.level)
        throw new Error('level ' + number + ': no playable design');

    const stats = await evaluateLevel(pool, best.level, settings, { languages: languages(), seedBase: seedOf(best.level.id, 'final', best.variant) });
    best.level.difficulty = stats.grade;
    const meta = {
        target, tier, seed: context.seed || 1, variant: best.variant, generator: generatorVersion,
        notes: best.notes, rounds: best.rounds, tuned: !!best.ok, stats
    };
    report({ type: 'done', number, level: best.level, meta });
    return { level: compactLevel(best.level), meta };
}

// Ids of the catalog shapes of the levels just before the given index: the next level takes another one
export function recentShapes(campaign, index, depth = 2)
{
    const ids = [];
    for (let i = Math.max(0, index - depth); i < index; i++)
    {
        const shape = campaign[i] ? shapeOf(campaign[i].holeCells) || shapeOf(mirrorHoles(campaign[i].holeCells || [])) : null;
        if (shape)
            ids.push(shape.id);
    }
    return ids;
}
