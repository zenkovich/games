// Вьюха верхней панели: номер уровня, прогресс-бар очков, счётчик ходов.
// Синк по ревизии сервиса; координаты локальные (центр Hud = (0,0))

WordFallHudView = class WordFallHudView extends o2.Component
{
    constructor()
    {
        super();
        this.barOffsetX = 0;   // центр бара относительно центра Hud
        this.barOffsetY = -5;
        this.barWidth = 325;   // ширина заливки бара
        this.barMinFill = 0.12; // минимальная доля заливки — 9-slice торцы не схлопываются
        this.hudWorldY = 603;  // центр секции Hud в экранных координатах

        this._svc = null;
        this._lastRevision = -1;
        this._displayScore = 0;  // экранный счёт отстаёт от модели до конца анимации
        this._scoreTween = null; // { from, to, t }
    }

    // Мировые координаты центра прогресс-бара (для полёта итога)
    BarWorldX() { return this.barOffsetX; }
    BarWorldY() { return this.hudWorldY + this.barOffsetY; }

    // Мировая X кончика текущей заливки — сюда влетают звёзды
    BarTipWorldX()
    {
        var progress = Math.max(0, Math.min(1, this._displayScore/this._svc.GetTargetScore()));
        var fill = progress <= 0 ? 0 : Math.max(this.barMinFill, progress);
        return this.barOffsetX - this.barWidth*0.5 + this.barWidth*fill;
    }

    // Плавное дозаполнение бара до нового счёта
    AnimateScoreTo(score)
    {
        this._scoreTween = { from: this._displayScore, to: score, t: 0 };
    }

    // Мгновенно показать актуальный счёт
    SnapScore()
    {
        this._scoreTween = null;
        this._displayScore = this._svc.GetScore();
        this.Sync();
    }

    OnStart()
    {
        globalThis.WordFallViews = globalThis.WordFallViews || {};
        WordFallViews.hud = this;

        this._svc = this.serviceActor.GetComponent("WordFallGameService");
        this._levelLabel = this._actor.GetChild("LevelBox/Value");
        this._scoreLabel = this._actor.GetChild("ScorePanel/ScoreLabel");
        this._movesLabel = this._actor.GetChild("MovesBox/Value");
        this._bar = this._actor.GetChild("ScorePanel/Bar");
    }

    Sync()
    {
        var svc = this._svc;
        this._levelLabel.SetText("" + (svc.GetLevelIndex() + 1));
        this._scoreLabel.SetText(this._displayScore + "/" + svc.GetTargetScore());
        this._movesLabel.SetText("" + svc.GetMovesLeft());

        var progress = Math.max(0, Math.min(1, this._displayScore/svc.GetTargetScore()));
        this._bar.SetValueForcible(progress <= 0 ? 0 : Math.max(this.barMinFill, progress));
    }

    Update(dt)
    {
        if (!this._svc)
            return;

        if (this._scoreTween)
        {
            var tween = this._scoreTween;
            tween.t += dt/0.35;
            var k = Math.min(tween.t, 1);
            k = k*k*(3 - 2*k);
            this._displayScore = Math.round(tween.from + (tween.to - tween.from)*k);
            if (tween.t >= 1)
            {
                this._displayScore = tween.to;
                this._scoreTween = null;
            }
            this.Sync();
        }

        var revision = this._svc.GetRevision();
        if (revision != this._lastRevision)
        {
            this._lastRevision = revision;

            // рестарт/новый уровень сбрасывают счёт мгновенно
            if (this._svc.GetScore() < this._displayScore)
            {
                this._scoreTween = null;
                this._displayScore = this._svc.GetScore();
            }
            this.Sync();
        }
    }
};
