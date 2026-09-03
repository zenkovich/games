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
        this.scorePunch = 0.12; // «удар» бара по прилёту буквы: быстро трогается, без раскачки
        this.barTipInset = 12;  // ближе к началу бара кончик не бывает (скругление торца)
        this.hudWorldY = 603;  // центр секции Hud в экранных координатах

        this._svc = null;
        this._lastRevision = -1;
        this._displayScore = 0;  // экранный счёт отстаёт от модели до конца анимации
        this._scoreTween = null; // { from, to, t }
    }

    // Мировые координаты центра прогресс-бара (для полёта итога)
    BarWorldX() { return this.barOffsetX; }
    BarWorldY() { return this.BarTip().y; }

    // Мировая точка кончика текущей заливки — сюда влетают буквы
    BarTip() { return this.BarTipForScore(this._displayScore); }

    // Мировая точка, где кончик заливки окажется при данном счёте: буква целится в точку,
    // куда она сама доталкивает бар. Геометрия — из слоя-якоря "track" (весь бар)
    BarTipForScore(score)
    {
        if (this._track)
        {
            var rect = this._track.GetRect();
            // минус barTipInset: бьём в центр скругления кончика, а не в самый край заливки
            var x = rect.left + (rect.right - rect.left)*this.BarFill(score) - this.barTipInset;
            x = Math.max(rect.left + this.barTipInset, Math.min(rect.right - this.barTipInset, x));
            return { x: x, y: (rect.bottom + rect.top)*0.5 };
        }

        var fill = this.BarFill(score);
        return { x: this.barOffsetX - this.barWidth*0.5 + this.barWidth*fill, y: this.hudWorldY + this.barOffsetY };
    }

    BarTipWorldX() { return this.BarTip().x; }

    // Счёт, который сейчас показывает бар (отстаёт от модели на время анимации)
    DisplayScore() { return this._displayScore; }

    // Доля заливки бара для счёта: выше минимума растёт линейно, чтобы каждая буква сдвигала бар
    BarFill(score)
    {
        var progress = Math.max(0, Math.min(1, score/this._svc.GetTargetScore()));
        return progress <= 0 ? 0 : this.barMinFill + (1 - this.barMinFill)*progress;
    }

    // Дозаполнение бара до нового счёта коротким ударом
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
        this._track = this._bar ? this._bar.GetLayer("track") : null;
    }

    Sync()
    {
        var svc = this._svc;
        this._levelLabel.SetText("" + (svc.GetLevelIndex() + 1));
        this._scoreLabel.SetText(this._displayScore + "/" + svc.GetTargetScore());
        this._movesLabel.SetText("" + svc.GetMovesLeft());

        this._bar.SetValueForcible(this.BarFill(this._displayScore));
    }

    Update(dt)
    {
        if (!this._svc)
            return;

        if (this._scoreTween)
        {
            var tween = this._scoreTween;
            tween.t += dt/this.scorePunch;
            var k = Math.min(tween.t, 1);
            k = 1 - (1 - k)*(1 - k)*(1 - k); // ease-out: рывок сразу, затухание в конце
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
