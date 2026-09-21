globalThis.WordFallGame = globalThis.WordFallGame || {};

// Баланс из Live-ops (o2libs.RemoteConfig, конфиг "wordfall_balance"): длины слов для бонусов,
// серия согласных, скорость падения. Значения из сцены — умолчания; удалённые перекрывают их
// только когда проходят проверку диапазона. Без модуля o2libs или без сети игра идёт на умолчаниях
WordFallRemote = class WordFallRemote
{
    static get ConfigKey() { return "wordfall_balance"; }
    static get Experiment() { return "bomb_length"; }

    // Поля конфига поля, которыми можно управлять удалённо: [мин, макс]
    static get BoardRanges()
    {
        return { bombWordLength: [3, 8], rocketWordLength: [4, 9], fireworksWordLength: [5, 10], maxConsonantRun: [2, 6] };
    }

    static IsAvailable()
    {
        return typeof o2libs !== "undefined" && !!o2libs.RemoteConfig;
    }

    // Весь удалённый конфиг или null
    static Balance()
    {
        if (!WordFallRemote.IsAvailable())
            return null;

        var balance = o2libs.RemoteConfig.Get(WordFallRemote.ConfigKey);
        return balance && typeof balance === "object" ? balance : null;
    }

    static _InRange(value, range)
    {
        return typeof value === "number" && isFinite(value) && Math.floor(value) === value && value >= range[0] && value <= range[1];
    }

    // Конфиг поля с удалёнными значениями поверх; исходный не меняется
    static ApplyBoard(config)
    {
        var result = {};
        for (var key in config)
            result[key] = config[key];

        var balance = WordFallRemote.Balance();
        var applied = {};
        if (balance)
        {
            var ranges = WordFallRemote.BoardRanges;
            for (var field in ranges)
            {
                if (WordFallRemote._InRange(balance[field], ranges[field]))
                {
                    result[field] = balance[field];
                    applied[field] = balance[field];
                }
            }

            // Бонусы идут по возрастанию длины слова; конфиг, который это ломает, не применяется вовсе
            if (!(result.bombWordLength < result.rocketWordLength && result.rocketWordLength < result.fireworksWordLength))
            {
                for (var reverted in applied)
                    result[reverted] = config[reverted];
                applied = {};
            }
        }

        WordFallGame.remote = { source: balance ? "remote" : "defaults", applied: applied, group: WordFallRemote.Group() };
        return result;
    }

    static FallSpeed(defaultSpeed)
    {
        var balance = WordFallRemote.Balance();
        var speed = balance ? balance.fallSpeedCells : undefined;
        return typeof speed === "number" && isFinite(speed) && speed >= 2 && speed <= 30 ? speed : defaultSpeed;
    }

    // Группа игрока в A/B-тесте длины слова для бомбы; "" — не в тесте
    static Group()
    {
        return WordFallRemote.IsAvailable() ? o2libs.RemoteConfig.GetGroup(WordFallRemote.Experiment) : "";
    }

    // Зовёт callback, когда конфиги обновились (докачались или началось событие по расписанию)
    static OnChanged(callback)
    {
        if (WordFallRemote.IsAvailable())
            o2libs.RemoteConfig.OnChanged(callback);
    }
};
