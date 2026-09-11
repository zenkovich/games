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

        var singles = ["Explosion", "Win", "ScoreHit", "BombFlash", "BombRing", "BombCore", "BombDebris", "BombEmbers",
                       "BombSmoke", "RocketRing", "LaunchFlash", "LaunchRing", "LaunchDust", "LaunchEmbers", "CrateChips",
                       "CrateDust", "SnowPuff", "SnowDrops", "DeliveredRing", "DeliveredSparkle", "WinTiles", "WinSparkle",
                       "FireworkFlash", "FireworkSparks0", "FireworkSparks1", "FireworkSparks2", "FireworkConfetti",
                       "FireworkGlitter", "BonusSparkle0", "BonusSparkle1", "BonusSparkle2", "BonusSpawn0", "BonusSpawn1",
                       "BonusSpawn2"];
        for (var i = 0; i < singles.length; i++)
            this._emitters[singles[i]] = find(singles[i]);
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
    PlayScoreHit(x, y) { this._Play(["ScoreHit"], x, y); }

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
