// Fits a level's moves and target score to a target difficulty (average attempts of the average player).
//
// An "open" run plays the level with the limits lifted and records, for every attempt, the move on which the
// words and tasks were done and the score after each move. Any pair (moves, target score) can be judged on those
// records without playing again: an attempt wins when its goals were done within the moves and its score at
// that move reaches the target. The pick is then checked by real attempts and corrected.
import { seedOf } from './core.mjs';

const roundScore = (score) => Math.max(10, Math.round(score/10)*10);

// Share of open attempts that would win with the given limits
export function winShare(records, moves, targetScore)
{
    let wins = 0;
    for (const record of records)
    {
        if (record.goalsAt > 0 && record.goalsAt <= moves && scoreAfter(record, moves) >= targetScore)
            wins++;
    }
    return records.length > 0 ? wins/records.length : 0;
}

function scoreAfter(record, moves)
{
    const scores = record.scoreAt;
    return scores.length == 0 ? 0 : scores[Math.min(moves, scores.length) - 1];
}

// Moves and target score for the win rate from the open records. options: min, max (moves), preferred (the
// designer's moves — fewer are not tried unless keepMoves), keepMoves, goalsWeight (0..1: how much of the
// difficulty the goals carry; the rest is the score target, which sorts players by skill much harder)
export function fitLimits(records, winRate, options)
{
    const n = records.length;
    const wanted = Math.max(1, Math.round(winRate*n));
    const goalsBy = (moves) => records.filter((record) => record.goalsAt > 0 && record.goalsAt <= moves).length;

    // the goals take a part of the difficulty (half of it in log terms by default), the score target takes the rest
    const weight = typeof options.goalsWeight == 'number' ? options.goalsWeight : 0.5;
    const goalsShare = winRate >= 0.9 ? winRate + (1 - winRate)*0.5 : Math.pow(winRate, weight);
    const goalsWanted = Math.min(Math.round(Math.min(goalsShare, 0.99)*n), n);

    const candidate = (moves) => {
        const scores = records.filter((record) => record.goalsAt > 0 && record.goalsAt <= moves)
            .map((record) => scoreAfter(record, moves)).sort((a, b) => b - a);
        if (scores.length < wanted)
            return null;
        const all = records.map((record) => scoreAfter(record, moves)).sort((a, b) => a - b);
        return { moves, score: roundScore(scores[wanted - 1]), median: all[all.length >> 1], goals: scores.length/n };
    };

    if (options.keepMoves)
    {
        const kept = candidate(options.preferred);
        return kept ? { ok: true, ...kept } : { ok: false, moves: options.preferred, goals: goalsBy(options.preferred)/n };
    }

    let from = options.min;
    while (from < options.max && goalsBy(from) < goalsWanted)
        from++;
    from = Math.max(from, Math.min(options.preferred || from, options.max));

    // a target far below what everyone scores means the goals alone are too hard at these moves: add moves
    let fallback = null;
    for (let moves = from; moves <= options.max; moves++)
    {
        const fit = candidate(moves);
        if (!fit)
            continue;
        fallback = fallback || fit;
        if (fit.score >= 0.45*fit.median)
            return { ok: true, ...fit };
    }
    if (fallback)
        return { ok: true, ...fallback, weakScore: true };
    return { ok: false, moves: options.max, goals: goalsBy(options.max)/n };
}

export function withinTolerance(attempts, target, tolerance)
{
    // near 1 the scale is the share of losses, not the ratio of attempts
    if (target < 1.25)
        return Math.abs(1/attempts - 1/target) <= 0.035;
    return Math.abs(Math.log(attempts/target)) <= tolerance;
}

// Tunes a copy of the level; report(event) gets the steps. Returns { ok, level, attempts, winRate, rounds, reason }
// options: preferredMoves, keepMoves, goalsWeight, salt.
// Every open run plays the same seeds, and the bot is told the limits picked so far (they change how it plays:
// with the score in hand it stops chasing points). When a run picks the limits it was played with, its win
// share is exactly what real attempts on those seeds give — the search ends there
export async function tuneLevel(pool, source, target, settings, options = {}, report = () => {})
{
    const level = JSON.parse(JSON.stringify(source));
    const profile = settings.profiles.average;
    const language = settings.language;
    const winRate = Math.min(Math.max(1/target, 0.02), 0.995);
    const bounds = { min: settings.moves.min, max: settings.moves.max };
    const clampMoves = (moves) => Math.min(Math.max(Math.round(moves), bounds.min), bounds.max);
    const preferred = options.keepMoves ? level.moves : clampMoves(options.preferredMoves || level.moves);
    const seedBase = seedOf(level.id, 'tune', options.salt || 0);
    const rounds = [];

    let assume = { moves: preferred, targetScore: level.targetScore || 200 };
    let keepMoves = !!options.keepMoves;
    let result = null;
    for (let round = 0; round < 7; round++)
    {
        const open = await pool.simulate(level, { language, profile, count: settings.attempts.tune, seedBase,
                                                  cap: keepMoves ? assume.moves : bounds.max, assume });
        const fit = fitLimits(open, winRate, { ...bounds, preferred: keepMoves ? assume.moves : preferred, keepMoves, goalsWeight: options.goalsWeight });
        if (!fit.ok)
        {
            // the goals alone are harder than the target: the level is left as easy as its limits allow
            const scores = open.map((record) => scoreAfter(record, fit.moves)).sort((a, b) => a - b);
            level.moves = fit.moves;
            level.targetScore = roundScore(0.5*scores[scores.length >> 1]);
            report({ type: 'unreachable', moves: fit.moves, goals: fit.goals, target });
            return { ok: false, level, rounds, reason: 'goals', goals: fit.goals, attempts: fit.goals > 0 ? 1/fit.goals : Infinity };
        }

        // what the limits this run was played with really give, and what the new pick promises
        const played = winShare(open, assume.moves, assume.targetScore);
        const settled = fit.moves == assume.moves && fit.score == assume.targetScore;
        const entry = { moves: assume.moves, targetScore: assume.targetScore, winRate: played, attempts: played > 0 ? 1/played : Infinity,
                        next: { moves: fit.moves, targetScore: fit.score }, settled };
        rounds.push(entry);
        report({ type: 'round', ...entry, target });

        if (round > 0 && played > 0 && (!result || Math.abs(Math.log(entry.attempts/target)) < Math.abs(Math.log(result.attempts/target))))
            result = entry;
        if (settled)
        {
            result = entry;
            break;
        }
        assume = { moves: fit.moves, targetScore: fit.score };
        // the moves are settled in the first rounds; after that only the score target moves
        if (round >= 2)
            keepMoves = true;
    }

    level.moves = result.moves;
    level.targetScore = result.targetScore;
    const ok = withinTolerance(result.attempts, target, settings.tolerance);
    return { ok, level, rounds, attempts: result.attempts, winRate: result.winRate, reason: ok ? '' : 'miss' };
}
