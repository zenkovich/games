globalThis.WordFallGame = globalThis.WordFallGame || {};

// Партикловые эффекты игры: вспышки сгорания букв, взрывы бонусов, салюты.
// Эмиттеры — дочерние акторы Vfx в прототипе экрана (настраиваются в редакторе),
// здесь только проигрывание в экранных координатах
WordFallVfx = class WordFallVfx extends o2.Component
{
    constructor()
    {
        super();
        this._emitters = {};
        this._burnPool = [];
        this._fireworkPool = [];
        this._nextBurn = 0;
        this._nextFirework = 0;
        this._pools = {}; // эмиттеры вариантов эффектов S_<имя>_<i>: { entries, next }
    }

    // Вращение частиц эмиттеров вариантов, градусов в секунду в обе стороны (в прототипе оно не хранится)
    static get styleSpins()
    {
        return { B1_Chips: 900, B2_Stars: 360, B2_Stars2: 240, R2_Launch: 360, F2_Inner: 240, B3_Confetti: 720, B3_Confetti2: 720, B5_Stars: 500, R1_TrailStar: 400,
                 R1_Hit: 500, R2_Trail: 300, R2_Hit: 400, R3_Trail: 720, R3_Hit: 720, R4_Hit: 900, R6_Trail: 400,
                 F2_Burst: 300, F4_Confetti: 720, F4_Confetti2: 720 };
    }

    OnStart()
    {
        WordFallGame.vfx = this;

        var self = this;
        var find = function(name) {
            var actor = self._actor.GetChild(name);
            var emitter = actor ? actor.GetComponent("o2::ParticlesEmitterComponent") : null;
            return emitter ? { actor: actor, emitter: emitter } : null;
        };

        for (var i = 0; find("Burn" + i); i++)
            this._burnPool.push(find("Burn" + i));

        for (var i = 0; find("Firework" + i + "_0"); i++)
            this._fireworkPool.push([find("Firework" + i + "_0"), find("Firework" + i + "_1"), find("Firework" + i + "_2")]);

        var singles = ["Explosion", "Win", "BombFlash", "BombRing", "BombCore", "BombDebris", "BombEmbers",
                       "BombSmoke", "RocketRing", "LaunchFlash", "LaunchRing", "LaunchDust", "LaunchEmbers", "CrateChips",
                       "CrateDust", "SnowPuff", "SnowDrops", "DeliveredRing", "DeliveredSparkle", "WinTiles", "WinSparkle",
                       "FireworkFlash", "FireworkSparks0", "FireworkSparks1", "FireworkSparks2", "FireworkConfetti",
                       "FireworkGlitter", "BonusSparkle0", "BonusSparkle1", "BonusSparkle2", "BonusSpawn0", "BonusSpawn1",
                       "BonusSpawn2"];
        for (var i = 0; i < singles.length; i++)
            this._emitters[singles[i]] = find(singles[i]);

        var spins = WordFallVfx.styleSpins;
        var children = this._actor.GetChildren();
        for (var i = 0; i < children.length; i++)
        {
            var parts = /^S_(.+)_(\d+)$/.exec(children[i].GetName());
            var entry = parts ? find(children[i].GetName()) : null;
            if (!entry)
                continue;
            if (!this._pools[parts[1]])
                this._pools[parts[1]] = { entries: [], next: 0 };
            this._pools[parts[1]].entries.push(entry);
            if (spins[parts[1]])
            {
                entry.emitter.SetInitialAngleSpeed(0);
                entry.emitter.SetInitialAngleSpeedRange(spins[parts[1]]*2);
            }
        }
    }

    HasStyleEffect(name) { return !!this._pools[name]; }

    // Эффект варианта: следующий эмиттер пула проигрывается в точке
    PlayStyle(name, x, y)
    {
        var pool = this._pools[name];
        if (!pool)
        {
            this._PlayAt(this._emitters[name], x, y); // общие эмиттеры (кольца) тоже годятся
            return;
        }
        this._PlayAt(pool.entries[pool.next], x, y);
        pool.next = (pool.next + 1) % pool.entries.length;
    }

    // Шлейф ракеты: эмиттер пула идёт за ней весь полёт, StopTrail гасит выпуск, частицы дотлевают сами
    StartTrail(name, x, y)
    {
        var pool = this._pools[name];
        if (!pool)
            return null;
        for (var i = 0; i < pool.entries.length; i++)
        {
            var entry = pool.entries[(pool.next + i) % pool.entries.length];
            if (entry.trailBusy)
                continue;
            pool.next = (pool.next + i + 1) % pool.entries.length;
            entry.trailBusy = true;
            this._PlayAt(entry, x, y);
            return entry;
        }
        return null;
    }

    MoveTrail(entry, x, y)
    {
        if (entry)
            entry.actor.GetTransform().SetPosition2D(new Vec2(x, y));
    }

    StopTrail(entry)
    {
        if (!entry)
            return;
        entry.emitter.Stop();
        entry.trailBusy = false;
    }

    PlayBurn(x, y)
    {
        if (this._burnPool.length == 0)
            return;

        this._PlayAt(this._burnPool[this._nextBurn], x, y);
        this._nextBurn = (this._nextBurn + 1) % this._burnPool.length;
    }

    PlayExplosion(x, y) { this._Play(["Explosion"], x, y); }
    PlayWin() { this._Play(["Win"], 0, 100); }

    // Разноцветный салют: тройка эмиттеров из пула
    PlayFirework(x, y)
    {
        if (this._fireworkPool.length == 0)
            return;

        var triple = this._fireworkPool[this._nextFirework];
        for (var i = 0; i < triple.length; i++)
            this._PlayAt(triple[i], x, y);
        this._nextFirework = (this._nextFirework + 1) % this._fireworkPool.length;
    }

    PlayBombBlast(x, y) { this._Play(["BombFlash", "BombCore", "BombRing", "BombDebris", "BombEmbers", "BombSmoke"], x, y); }
    PlayRocketImpact(x, y) { this._Play(["RocketRing"], x, y); } // росчерки и глиттер выпускает салют самой ракеты
    PlayRocketLaunch(x, y) { this._Play(["LaunchFlash", "LaunchRing", "LaunchDust", "LaunchEmbers"], x, y); }
    PlayCrateBreak(x, y) { this._Play(["CrateChips", "CrateDust"], x, y); }
    PlayCrateHit(x, y) { this._Play(["CrateDust"], x, y); }
    PlaySnowMelt(x, y) { this._Play(["SnowPuff", "SnowDrops"], x, y); }
    PlayDelivered(x, y) { this._Play(["DeliveredRing", "DeliveredSparkle"], x, y); }
    PlayWinTiles(x, y) { this._Play(["WinTiles", "WinSparkle"], x, y); }

    PlayFireworkBurst(x, y)
    {
        this._Play(["FireworkFlash", "FireworkSparks0", "FireworkSparks1", "FireworkSparks2", "FireworkConfetti", "FireworkGlitter"], x, y);
    }

    // Искра бонуса, ждущего на поле; kind — bomb/rocket/fireworks
    PlayBonusSparkle(x, y, kind) { this._Play(["BonusSparkle" + WordFallVfx._KindIndex(kind)], x, y); }
    PlayBonusSpawn(x, y, kind) { this._Play(["BonusSpawn" + WordFallVfx._KindIndex(kind)], x, y); }

    static _KindIndex(kind)
    {
        return kind == "rocket" ? 1 : kind == "fireworks" ? 2 : 0;
    }

    _Play(names, x, y)
    {
        for (var i = 0; i < names.length; i++)
            this._PlayAt(this._emitters[names[i]], x, y);
    }

    _PlayAt(entry, x, y)
    {
        if (!entry)
            return;

        entry.actor.GetTransform().SetPosition2D(new Vec2(x, y));
        entry.emitter.RewindAndPlay();
    }
};
