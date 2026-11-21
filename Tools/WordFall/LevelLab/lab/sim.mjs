// One simulated attempt of a level by the bot, on the game's own rules, and the statistics of many attempts.
import { loadCore, boardConfig, dictionary, seedOf } from './core.mjs';

export const continueMoves = 5;      // moves the game sells after a loss (WordFallGameService.continueMoves)
export const nearMissMoves = 2;      // a loss that this many more moves would have turned into a win
const maxActionsPerMove = 12;

function snapshot(level)
{
    const board = level.GetBoard();
    const cells = [];
    for (let c = 0; c < board.GetColumns(); c++)
    {
        for (let r = 0; r < board.GetRows(); r++)
        {
            const tile = board.grid[c][r];
            const cell = {};
            if (tile.hole) cell.hole = 1;
            if (tile.letter) { cell.l = tile.joker ? '?' : tile.letter; cell.v = tile.joker ? 0 : tile.value*(tile.doubled ? 2 : 1); }
            if (tile.ice) cell.ice = tile.ice;
            if (tile.stone) cell.stone = 1;
            if (tile.crate) cell.crate = tile.crate;
            if (tile.chained) cell.chain = 1;
            if (tile.snow) cell.snow = 1;
            if (tile.parcel) cell.parcel = 1;
            if (tile.powerup) cell.bonus = tile.powerup;
            if (tile.doubled) cell.x2 = 1;
            if (tile.joker) cell.joker = 1;
            if (tile.tint) cell.t = tile.tint;
            cells.push(cell);
        }
    }
    return cells;
}

function progress(level)
{
    return {
        score: level.GetScore(),
        movesLeft: level.GetMovesLeft(),
        state: level.GetState(),
        words: level.GetWords().map((word) => ({ word: word.word, found: word.found })),
        tasks: level.GetTasks().map((task) => ({ type: task.config.taskType, progress: task.progress, done: task.done })),
        charges: [0, 1, 2, 3, 4].map((booster) => level.GetBoosterCharges(booster))
    };
}

// options: language, profile, seed, trace (keep every step for a replay), cap (play this many moves with no score
// target and record how the game went: the tuner reads moves and target off such runs), assume {moves, targetScore},
// scoreScale (try another score scale of the language than languages.json has)
export function playAttempt(rawLevel, options)
{
    loadCore();
    const language = options.language || WordFallLanguages.Default();
    WordFallLanguages.SetCurrent(language);
    const words = dictionary(language);
    const config = WordFallConfigs.NormalizeLevel(WordFallConfigs.UpgradeFileLevel(rawLevel));
    const seed = options.seed >>> 0 || 1;

    const open = options.cap > 0;
    if (open)
    {
        config.moves = options.cap;
        config.targetScore = 1e9;
        config.autoTarget = false;
    }

    const board = boardConfig(language);
    if (options.scoreScale > 0)
        board.scoreScale = options.scoreScale;
    const level = new WordLevel();
    level.Start(config, board, words, seed);
    const bot = new WordFallBot(options.profile, seedOf(seed, 'bot'));
    bot.Begin(level, words);
    if (options.assume)
        bot.Assume(options.assume.moves, options.assume.targetScore);

    const record = {
        won: false, stuck: false, moves: 0, movesLeft: 0, score: 0, target: level.GetTargetScore(),
        lengths: [0, 0, 0, 0, 0, 0, 0, 0, 0], boosters: 0, hints: 0, bonuses: 0, extra: 0,
        left: null
    };
    const trace = options.trace ? { language, seed, start: { board: snapshot(level), progress: progress(level) }, steps: [] } : null;
    if (open)
    {
        record.goalsAt = 0;
        record.scoreAt = [];
    }

    const tasksDone = () => level.GetWords().every((word) => word.found) && level.GetTasks().every((task) => task.done);
    const failure = () => ({
        score: level.GetScore() < level.GetTargetScore(),
        words: level.GetWords().filter((word) => !word.found).length,
        tasks: level.GetTasks().filter((task) => !task.done).map((task) => task.config.taskType)
    });

    let lostAt = -1;
    let idle = 0;
    for (;;)
    {
        if (level.GetState() == 'won')
            break;

        if (level.GetState() == 'lost')
        {
            // a real loss; the bot plays on as if the player had bought moves, to see how close it was
            if (open || lostAt >= 0 || record.stuck)
                break;
            lostAt = record.moves;
            record.left = failure();
            level.AddMoves(continueMoves);
            continue;
        }

        const action = bot.NextAction();
        if (action.type == 'none')
            break;
        if (action.type == 'stuck' || ++idle > maxActionsPerMove)
        {
            record.stuck = true;
            if (lostAt < 0)
                record.left = failure();
            break;
        }

        const selection = action.type == 'accept' ? WordFallCells.Copy(level.GetBoard().GetSelection()) : null;
        const result = WordFallBot.Apply(level, words, action);
        const moved = !!(result && result.ok && result.word);
        if (action.type != 'word' && action.type != 'accept')
            record.boosters++;
        if (action.type == 'hint')
            record.hints++;

        if (moved)
        {
            bot.OnMove(result);
            idle = 0;
            record.moves++;
            record.lengths[Math.min(result.word.length, 8)]++;
            record.bonuses += result.powerupEarned ? 1 : 0;
            if (open)
            {
                record.scoreAt.push(level.GetScore());
                if (!record.goalsAt && tasksDone())
                    record.goalsAt = record.moves;
            }
        }

        if (trace)
        {
            const step = { type: action.type, think: action.think || 0, progress: progress(level), board: snapshot(level) };
            if (action.cell)
                step.cell = action.cell;
            if (action.type == 'word' || action.type == 'accept')
            {
                step.cells = action.cells || selection;
                step.ok = moved;
            }
            if (result && result.ok)
            {
                step.word = result.word || '';
                step.gain = result.gain;
                step.wordFound = result.wordFound || '';
                step.bonus = result.powerupEarned || '';
                step.used = result.powerupsUsed.map((use) => ({ kind: use.kind, c: use.c, r: use.r, targets: use.targets }));
                step.burned = result.burned;
                step.broken = result.iceBroken.concat(result.crateBroken, result.snowMelted, result.crateHit);
                step.delivered = result.delivered;
            }
            if (lostAt >= 0)
                step.extra = true;
            trace.steps.push(step);
        }
    }

    const won = level.GetState() == 'won';
    record.won = won && lostAt < 0;
    record.extra = won && lostAt >= 0 ? record.moves - lostAt : 0;
    record.moves = lostAt >= 0 ? lostAt : record.moves;
    record.movesLeft = record.won ? level.GetMovesLeft() : 0;
    record.score = level.GetScore();
    if (!record.won && !record.left)
        record.left = failure();
    if (trace)
    {
        trace.won = record.won;
        trace.extra = record.extra;
        record.trace = trace;
    }
    return record;
}

export function playBatch(rawLevel, options)
{
    const records = [];
    for (let i = 0; i < options.count; i++)
    {
        const seed = seedOf(options.seedBase || 1, options.first + i);
        records.push(playAttempt(rawLevel, { ...options, seed, trace: false }));
    }
    return records;
}

// Wilson score interval of a share
export function wilson(successes, n, z = 1.96)
{
    if (n == 0)
        return [0, 1];
    const p = successes/n;
    const denominator = 1 + z*z/n;
    const centre = p + z*z/(2*n);
    const margin = z*Math.sqrt(p*(1 - p)/n + z*z/(4*n*n));
    return [Math.max(0, (centre - margin)/denominator), Math.min(1, (centre + margin)/denominator)];
}

export const maxAttempts = 50;    // attempts are capped: a level nobody passes in the sample is "50+"

export function attemptsOf(winRate)
{
    return winRate > 0 ? Math.min(maxAttempts, 1/winRate) : maxAttempts;
}

// Statistics of a batch of real attempts
export function summarize(records)
{
    const n = records.length;
    const wins = records.filter((record) => record.won);
    const losses = records.filter((record) => !record.won);
    const winRate = n > 0 ? wins.length/n : 0;
    const [lo, hi] = wilson(wins.length, n);
    const mean = (list, pick) => list.length > 0 ? list.reduce((sum, item) => sum + pick(item), 0)/list.length : 0;

    const lengths = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    let wordsPlayed = 0, letters = 0;
    for (const record of records)
    {
        for (let length = 0; length < lengths.length; length++)
        {
            lengths[length] += record.lengths[length];
            wordsPlayed += record.lengths[length];
            letters += record.lengths[length]*length;
        }
    }

    const reasons = { score: 0, words: 0, stuck: 0 };
    for (const record of losses)
    {
        const left = record.left || { score: false, words: 0, tasks: [] };
        if (record.stuck)
            reasons.stuck++;
        if (left.score)
            reasons.score++;
        if (left.words > 0)
            reasons.words++;
        for (const type of left.tasks)
            reasons[type] = (reasons[type] || 0) + 1;
    }
    for (const key in reasons)
        reasons[key] = losses.length > 0 ? reasons[key]/losses.length : 0;

    const near = losses.filter((record) => record.extra > 0 && record.extra <= nearMissMoves).length;
    const continued = losses.filter((record) => record.extra > 0).length;
    const movesGiven = records.length > 0 ? Math.max(...records.map((record) => record.moves + record.movesLeft)) : 0;
    const movesLeft = [];
    for (const record of wins)
        movesLeft[record.movesLeft] = (movesLeft[record.movesLeft] || 0) + 1;

    const stars = [0, 0, 0, 0];
    for (const record of wins)
        stars[record.score >= record.target*1.6 ? 3 : record.score >= record.target*1.25 ? 2 : 1]++;

    const nearShare = losses.length > 0 ? near/losses.length : 0;
    return {
        n, wins: wins.length, winRate, winLo: lo, winHi: hi,
        attempts: attemptsOf(winRate), attemptsLo: attemptsOf(hi), attemptsHi: attemptsOf(lo),
        movesLeft: mean(wins, (record) => record.movesLeft),
        slack: movesGiven > 0 ? mean(wins, (record) => record.movesLeft)/movesGiven : 0,
        movesLeftHistogram: Array.from(movesLeft, (count) => count || 0),
        scoreRatio: mean(records, (record) => record.target > 0 ? record.score/record.target : 0),
        stars: stars.map((count) => wins.length > 0 ? count/wins.length : 0),
        nearMiss: nearShare,
        continueWin: losses.length > 0 ? continued/losses.length : 0,
        // Wooga's FUUU factor: tries until the win per almost-win on the way; a level over 10 frustrates
        fuuu: losses.length > 0 && near > 0 && winRate > 0 ? (1/winRate)/(((1 - winRate)/winRate)*nearShare) : null,
        reasons,
        wordLength: wordsPlayed > 0 ? letters/wordsPlayed : 0,
        lengthShare: lengths.map((count) => wordsPlayed > 0 ? count/wordsPlayed : 0),
        boosters: mean(records, (record) => record.boosters),
        hints: mean(records, (record) => record.hints),
        bonuses: mean(records, (record) => record.bonuses),
        stuck: mean(records, (record) => record.stuck ? 1 : 0)
    };
}
