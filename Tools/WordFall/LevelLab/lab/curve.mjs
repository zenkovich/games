// The difficulty curve of a campaign: the target for every level is the average number of attempts an average
// player needs to pass it. The default follows what match-3 games publish (see README: sources): an unfailable
// onboarding, a slowly rising base with a saw of five-level waves, a hard level every tenth level, a super hard
// one from the middle of the campaign, and a breather right after every peak.

export function defaultCurve()
{
    return {
        count: 100,
        onboarding: 12,         // levels that nobody fails
        onboardingEnd: 1.05,    // target at the end of the onboarding
        baseEnd: 1.7,           // target of an ordinary level at the end of the campaign
        baseShape: 0.8,         // < 1 — the base grows faster at the start, > 1 — at the end
        wave: 0.18,             // swing of the saw inside a block, a share of the base
        block: 5,               // length of a wave
        hard: { first: 25, every: 10, from: 1.9, to: 3.2 },
        superHard: { first: 49, every: 10, from: 3.0, to: 5.0 },
        relief: 1.05,           // the level after a peak
        overrides: {}           // manual targets by level number: { "37": 2.4 }
    };
}

export function normalizeCurve(raw)
{
    const curve = defaultCurve();
    if (!raw || typeof raw != 'object')
        return curve;

    const number = (value, fallback, min, max) => typeof value == 'number' && isFinite(value) ? Math.min(Math.max(value, min), max) : fallback;
    curve.count = Math.round(number(raw.count, curve.count, 1, 1000));
    curve.onboarding = Math.round(number(raw.onboarding, curve.onboarding, 0, curve.count));
    curve.onboardingEnd = number(raw.onboardingEnd, curve.onboardingEnd, 1, 3);
    curve.baseEnd = number(raw.baseEnd, curve.baseEnd, 1, 20);
    curve.baseShape = number(raw.baseShape, curve.baseShape, 0.2, 4);
    curve.wave = number(raw.wave, curve.wave, 0, 1);
    curve.block = Math.round(number(raw.block, curve.block, 2, 50));
    curve.relief = number(raw.relief, curve.relief, 1, 5);
    for (const key of ['hard', 'superHard'])
    {
        const peak = raw[key] || {};
        curve[key] = {
            first: Math.round(number(peak.first, curve[key].first, 0, 100000)),
            every: Math.round(number(peak.every, curve[key].every, 1, 1000)),
            from: number(peak.from, curve[key].from, 1, 50),
            to: number(peak.to, curve[key].to, 1, 50)
        };
    }
    curve.overrides = {};
    for (const key in raw.overrides || {})
    {
        const value = raw.overrides[key];
        if (typeof value == 'number' && isFinite(value) && Number(key) >= 1)
            curve.overrides[String(Math.round(Number(key)))] = Math.min(Math.max(value, 1), 50);
    }
    return curve;
}

export const tiers = ['tutorial', 'normal', 'relief', 'hard', 'super'];

// Targets of the levels 1..count: [{ target, tier, manual }]
export function buildCurve(raw)
{
    const curve = normalizeCurve(raw);
    const result = [];
    const isPeak = (peak, level) => peak.first > 0 && level >= peak.first && (level - peak.first) % peak.every == 0;
    const peakValue = (peak, level) => {
        const span = Math.max(1, curve.count - peak.first);
        return peak.from + (peak.to - peak.from)*Math.min(1, (level - peak.first)/span);
    };
    const peakOf = (level) => level > curve.onboarding && isPeak(curve.superHard, level) ? 'super'
        : level > curve.onboarding && isPeak(curve.hard, level) ? 'hard' : '';

    for (let level = 1; level <= curve.count; level++)
    {
        let target, tier;
        const peak = peakOf(level);
        if (level <= curve.onboarding)
        {
            tier = 'tutorial';
            target = 1 + (curve.onboardingEnd - 1)*(curve.onboarding > 1 ? (level - 1)/(curve.onboarding - 1) : 1);
        }
        else if (peak)
        {
            tier = peak;
            target = peakValue(peak == 'super' ? curve.superHard : curve.hard, level);
        }
        else if (peakOf(level - 1))
        {
            tier = 'relief';
            target = curve.relief;
        }
        else
        {
            tier = 'normal';
            const span = Math.max(1, curve.count - curve.onboarding);
            const base = curve.onboardingEnd + (curve.baseEnd - curve.onboardingEnd)*Math.pow((level - curve.onboarding)/span, curve.baseShape);
            const phase = ((level - 1) % curve.block)/(curve.block - 1) - 0.5;
            target = Math.max(1, base*(1 + curve.wave*phase));
        }

        const manual = curve.overrides[String(level)];
        if (manual !== undefined)
        {
            target = manual;
            tier = tierOf(manual, tier == 'tutorial');
        }
        result.push({ target: Math.round(target*100)/100, tier, manual: manual !== undefined });
    }
    return result;
}

// Tier of a level by its attempts (measured or a manual target)
export function tierOf(attempts, onboarding)
{
    if (attempts < 1.12)
        return onboarding ? 'tutorial' : 'relief';
    if (attempts < 1.85)
        return 'normal';
    if (attempts < 2.9)
        return 'hard';
    return 'super';
}
