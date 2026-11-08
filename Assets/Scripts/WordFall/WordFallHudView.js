globalThis.WordFallGame = globalThis.WordFallGame || {};

// Вьюха верхней панели: прогресс-бар очков, счётчик ходов (номер уровня — если на экране есть его плашка).
// Синк по ревизии сервиса; координаты локальные (центр Hud = (0,0))

WordFallHudView = class WordFallHudView extends o2.Component
{
    get _svc() { return WordFallGame.service; }

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
        this.scorePrefix = ""; // подпись перед счётом: «Очки: 120 / 250»
        this.starPunch = 0.12;  // баунс звезды на прилёт буквы — доля размера
        this.starGlowFade = 0.55; // за столько секунд гаснет радужное свечение звезды после прилёта

        this._lastRevision = -1;
        this._displayScore = 0;  // экранный счёт отстаёт от модели до конца анимации
        this._scoreTween = null; // { from, to, t }
        this._punch = null;      // { t, amp } — бар вздрагивает в финале хода
        this._starPunch = null;  // звезда пружинит на прилёт буквы
        this._glowLevel = 0;     // 1 — свечение звезды в полную силу, гаснет к 0
    }

    // Мировые координаты центра прогресс-бара (для полёта итога)
    BarWorldX() { return this.barOffsetX; }
    BarWorldY() { return this.BarTip().y; }

    // Мировая точка кончика текущей заливки — сюда влетают буквы
    BarTip() { return this.BarTipForScore(this._displayScore); }

    // Мировая точка, где кончик заливки окажется при данном счёте: буква целится в точку,
    // куда она сама доталкивает бар. Геометрия — из виджета прогресса (область заливки)
    BarTipForScore(score)
    {
        if (this._bar)
        {
            // прогресс — область заливки внутри рамки бара: доля заливки откладывается по ней
            var rect = this._bar.GetLayout().GetWorldRect();
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

    // Центр звезды слева от бара — сюда влетают буквы
    StarCenter()
    {
        var r = this._star.GetLayout().GetWorldRect();
        return { x: (r.left + r.right)*0.5, y: (r.bottom + r.top)*0.5 };
    }

    // Удар по бару: бар с подписью вздрагивают затухающей пружиной
    Punch(amount) { this._punch = { t: 0, amp: amount }; }

    // Прилёт буквы в звезду: звезда пружинит от центра и вспыхивает радужным свечением
    PunchStar()
    {
        this._starPunch = { t: 0, amp: this.starPunch };
        this._glowLevel = 1;
    }

    StopPunch()
    {
        this._punch = { t: 1, amp: 0 };
        this._starPunch = { t: 1, amp: 0 };
        this._glowLevel = Math.min(this._glowLevel, 0.001);
    }

    // false — пружина затухла (масштаб уже вернулся к 1)
    _Spring(punch, dt, apply)
    {
        punch.t += dt;
        var done = punch.t > 0.6;
        apply(done ? 0 : 1.6*punch.amp*Math.sin(punch.t*30)*Math.exp(-punch.t*9));
        return !done;
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

        this._levelLabel = this._actor.GetChild("LevelBox/Value");
        this._scoreLabel = this._actor.GetChild("ScorePanel/ScoreLabel");
        this._movesLabel = this._actor.GetChild("MovesBox/Value");
        this._bar = this._actor.GetChild("ScorePanel/Bar");
        this._star = this._actor.GetChild("ScorePanel/Star");
        this._glow = this._star.GetChild("Glow");
        // раскладка экрана ставит пивот в угол — баунс и свечение должны расходиться от центра звезды
        this._star.GetTransform().SetPivot2D(new Vec2(0.5, 0.5));
        if (this._glow)
        {
            this._glow.GetTransform().SetPivot2D(new Vec2(0.5, 0.5));
            this._glow.SetTransparency(0);
        }
    }

    Sync()
    {
        var svc = this._svc;
        this._levelLabel.SetText("" + (svc.GetLevelIndex() + 1));
        this._scoreLabel.SetText(this.scorePrefix ? this.scorePrefix + this._displayScore + " / " + svc.GetTargetScore()
                                                  : this._displayScore + "/" + svc.GetTargetScore());
        this._movesLabel.SetText("" + svc.GetMovesLeft());

        this._bar.SetValueForcible(this.BarFill(this._displayScore));
    }

    Update(dt)
    {
        if (!this._svc)
            return;

        var self = this;
        if (this._punch && !this._Spring(this._punch, dt, function(v) {
                var scale = new Vec2(1 + 0.2*v, 1 + v);
                self._bar.GetTransform().SetScale2D(scale);
                self._scoreLabel.GetTransform().SetScale2D(scale);
            }))
            this._punch = null;

        if (this._starPunch && !this._Spring(this._starPunch, dt, function(v) {
                self._star.GetTransform().SetScale2D(new Vec2(1 + v, 1 + v));
            }))
            this._starPunch = null;

        if (this._glowLevel > 0 && this._glow)
        {
            this._glowLevel = Math.max(0, this._glowLevel - dt/this.starGlowFade);
            var a = this._glowLevel;
            this._glow.SetTransparency(a*a*(3 - 2*a));
            this._glow.GetTransform().SetScale2D(new Vec2(1 + 0.15*(1 - a), 1 + 0.15*(1 - a)));
        }

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
