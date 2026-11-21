// Difficulty of a level as the bots see it: the attempts an average player needs, and the parameters around
// that number — how weaker and stronger players fare, how much slack a win leaves, how close the losses are.
import { loadCore, seedOf } from './core.mjs';
import { summarize, attemptsOf } from './sim.mjs';
import { tierOf } from './curve.mjs';

export function defaultSettings()
{
    loadCore();
    return {
        language: WordFallLanguages.Default(),
        profiles: WordFallBot.Profiles(),
        // attempts per run: a tuning run, the final statistics (per player profile)
        attempts: { tune: 800, final: 1000 },
        tolerance: 0.12,                       // accepted miss of the target, in ln(attempts)
        moves: { min: 8, max: 20 },            // limits of a level's moves for the tuner
        peakGoals: 0.75,                       // share of a hard level's difficulty carried by its goals, the rest by the score
        boosterCharges: [1, 1, 1, 1, 1],       // boosters of a generated level
        // the single number: weights of the player profiles, of the slack of a win and of hopeless losses
        index: { average: 0.6, weak: 0.25, strong: 0.15, slack: 0.3, frustration: 0.2 },
        // logit(p human) = offset + slope*logit(p bot): the place for a fit against real players' pass rates
        calibration: { offset: 0, slope: 1 }
    };
}

export function normalizeSettings(raw)
{
    const settings = defaultSettings();
    if (!raw || typeof raw != 'object')
        return settings;

    const number = (value, fallback, min, max) => typeof value == 'number' && isFinite(value) ? Math.min(Math.max(value, min), max) : fallback;
    if (typeof raw.language == 'string' && WordFallLanguages.Get(raw.language))
        settings.language = raw.language;
    for (const name in settings.profiles)
        settings.profiles[name] = WordFallBot.NormalizeProfile({ ...settings.profiles[name], ...(raw.profiles || {})[name] });
    for (const key in settings.attempts)
        settings.attempts[key] = Math.round(number((raw.attempts || {})[key], settings.attempts[key], 20, 20000));
    settings.tolerance = number(raw.tolerance, settings.tolerance, 0.02, 1);
    settings.moves.min = Math.round(number((raw.moves || {}).min, settings.moves.min, 3, 40));
    settings.moves.max = Math.round(number((raw.moves || {}).max, settings.moves.max, settings.moves.min, 40));
    settings.peakGoals = number(raw.peakGoals, settings.peakGoals, 0, 1);
    if (Array.isArray(raw.boosterCharges) && raw.boosterCharges.length == 5)
        settings.boosterCharges = raw.boosterCharges.map((charges) => Math.round(number(charges, 0, 0, 99)));
    for (const key in settings.index)
        settings.index[key] = number((raw.index || {})[key], settings.index[key], 0, 5);
    settings.calibration.offset = number((raw.calibration || {}).offset, 0, -10, 10);
    settings.calibration.slope = number((raw.calibration || {}).slope, 1, 0.1, 10);
    return settings;
}

// Bot win rate mapped to the expected win rate of people (identity until fitted on real data)
export function calibrated(winRate, calibration)
{
    if (!calibration || (calibration.offset == 0 && calibration.slope == 1))
        return winRate;
    const p = Math.min(Math.max(winRate, 1e-4), 1 - 1e-4);
    const logit = calibration.offset + calibration.slope*Math.log(p/(1 - p));
    return 1/(1 + Math.exp(-logit));
}

// The single number: attempts averaged over the kinds of players (geometric mean by the weights), lowered when
// wins leave moves to spare and raised when losses end far from the goal
export function difficultyIndex(profiles, weights)
{
    const total = weights.average + weights.weak + weights.strong;
    if (total <= 0 || !profiles.average)
        return profiles.average ? profiles.average.attempts : 0;

    let log = 0;
    for (const name of ['average', 'weak', 'strong'])
    {
        const stats = profiles[name] || profiles.average;
        log += weights[name]/total*Math.log(stats.attempts);
    }
    const average = profiles.average;
    const hopeless = (1 - average.winRate)*(1 - average.nearMiss);
    const feel = 1 - weights.slack*average.slack + weights.frustration*hopeless;
    return Math.exp(log)*Math.max(0.5, feel);
}

// The level's own "difficulty" field (1..10), filled from the index
export function difficultyGrade(index)
{
    return Math.min(10, Math.max(1, Math.round(1 + 3.2*Math.log(Math.max(index, 1)))));
}

// Full statistics of a level: every player profile in the main language, the average one in the others
export async function evaluateLevel(pool, level, settings, options = {})
{
    const count = options.count || settings.attempts.final;
    const seedBase = options.seedBase || seedOf(level.id || 'level', 'final');
    const names = options.profiles || ['average', 'weak', 'strong'];
    const jobs = names.map((name) => pool.simulate(level, { language: settings.language, profile: settings.profiles[name], count, seedBase }));

    const others = (options.languages || []).filter((language) => language != settings.language);
    const otherJobs = others.map((language) => pool.simulate(level, { language, profile: settings.profiles.average,
                                                                      count: Math.round(count/2), seedBase }));
    const results = await Promise.all(jobs.concat(otherJobs));

    const profiles = {};
    names.forEach((name, i) => {
        profiles[name] = summarize(results[i]);
        const winRate = calibrated(profiles[name].winRate, settings.calibration);
        if (winRate != profiles[name].winRate)
        {
            profiles[name].botWinRate = profiles[name].winRate;
            profiles[name].winRate = winRate;
            profiles[name].attempts = attemptsOf(winRate);
            profiles[name].attemptsLo = attemptsOf(calibrated(profiles[name].winHi, settings.calibration));
            profiles[name].attemptsHi = attemptsOf(calibrated(profiles[name].winLo, settings.calibration));
        }
    });

    const languages = {};
    others.forEach((language, i) => {
        const stats = summarize(results[names.length + i]);
        languages[language] = { attempts: stats.attempts, winRate: stats.winRate, n: stats.n };
    });

    const average = profiles.average;
    const index = difficultyIndex(profiles, settings.index);
    return {
        language: settings.language,
        attempts: average.attempts,
        winRate: average.winRate,
        index: Math.round(index*100)/100,
        grade: difficultyGrade(index),
        tier: tierOf(average.attempts, false),
        // how much the level sorts players by skill: attempts of a weak player per attempt of a strong one
        skillGap: profiles.weak && profiles.strong ? profiles.weak.attempts/profiles.strong.attempts : null,
        profiles,
        languages,
        moves: level.moves,
        targetScore: level.targetScore,
        at: new Date().toISOString()
    };
}
