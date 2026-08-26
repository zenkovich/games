// HUD: score with count-up and pulse, timer badge, the current-sum pill with the
// READY / SUM state line, best score and floating "+N" labels
ZL.Hud = class
{
    constructor(root)
    {
        this.root = root;
        this.status = "";        // "READY" | "SUM: +3" | "" — readable headless for tests
        this.expr = "";
        this.time = -1;
        this.shownScore = 0;
        this.targetScore = 0;
        this.pulse = 0;
        this.floats = [];
        this.floatPool = [];

        if (ZL.headless)
            return;

        ZL.makeLabel(root, "SCORE", -150, 400, 200, 30, 22, 100, true, ZL.colors.muted);
        this.scoreLabel = ZL.makeLabel(root, "0", -150, 360, 260, 64, 52, 100, true);

        this.badge = ZL.makeSprite(root, "ZeroLine/timer_badge.png", 96, 96, 100);
        ZL.setPos(this.badge.actor, 190, 385);
        this.timerLabel = ZL.makeLabel(root, "60", 190, 386, 96, 60, 40, 101, true);

        this.pill = ZL.makeSprite(root, "ZeroLine/pill.png", 440, 54, 100);
        ZL.setPos(this.pill.actor, 0, 290);
        this.exprLabel = ZL.makeLabel(root, "", 0, 291, 420, 50, 26, 101, true);
        this.statusLabel = ZL.makeLabel(root, "", 0, 228, 400, 40, 30, 100, true);

        this.bestLabel = ZL.makeLabel(root, "BEST 0", 0, -340, 400, 30, 22, 100, true, ZL.colors.muted);
    }

    SetScore(value, animate)
    {
        this.targetScore = value;
        if (!animate)
            this.shownScore = value;
        else
            this.pulse = 1;
        this._RefreshScore();
    }

    _RefreshScore()
    {
        if (this.scoreLabel)
            this.scoreLabel.SetText("" + Math.round(this.shownScore));
    }

    SetBest(value)
    {
        if (this.bestLabel)
            this.bestLabel.SetText("BEST " + value);
    }

    SetTime(seconds)
    {
        this.time = seconds;
        if (!this.timerLabel)
            return;

        this.timerLabel.SetText("" + seconds);
        this.timerLabel.SetColor(ZL.color(seconds <= 10 ? ZL.colors.red : ZL.colors.white));
    }

    ShowSelection(values, ready)
    {
        let sum = 0;
        for (let v of values)
            sum += v;

        this.expr = ZL.fmtExpr(values) + (ready ? " = 0" : "");
        this.status = ready ? "READY" : "SUM: " + ZL.fmtSigned(sum);
        this._SetPill(this.expr, ZL.colors.green, 26, this.status, ready ? ZL.colors.green : ZL.colors.white);
        if (!ready && this.exprLabel)
            this.exprLabel.SetColor(ZL.color(ZL.colors.white));
    }

    ShowIdle()
    {
        this.expr = "DRAW A LINE THAT SUMS TO 0";
        this.status = "";
        this._SetPill(this.expr, ZL.colors.muted, 22, "", ZL.colors.white);
    }

    ShowTimeUp()
    {
        this.expr = "TIME'S UP";
        this.status = "";
        this._SetPill(this.expr, ZL.colors.muted, 26, "", ZL.colors.white);
    }

    _SetPill(expr, exprColor, exprHeight, status, statusColor)
    {
        if (ZL.headless)
            return;

        this.exprLabel.SetText(expr);
        this.exprLabel.SetHeight(exprHeight);
        this.exprLabel.SetColor(ZL.color(exprColor));
        this.statusLabel.SetText(status);
        this.statusLabel.SetColor(ZL.color(statusColor));
    }

    FloatScore(text, x, y)
    {
        let fl = { t: 0, x: x, y: y, label: null };
        if (!ZL.headless)
        {
            fl.label = this.floatPool.pop() || ZL.makeLabel(this.root, text, x, y, 220, 50, 36, 110, true, ZL.colors.gold);
            fl.label.SetEnabled(true);
            fl.label.SetText(text);
            fl.label.SetTransparency(1);
            ZL.place(fl.label, x, y, 220, 50);
        }
        this.floats.push(fl);
    }

    Update(dt)
    {
        if (this.shownScore != this.targetScore)
        {
            let diff = this.targetScore - this.shownScore;
            if (Math.abs(diff) < 1)
                this.shownScore = this.targetScore;
            else
                this.shownScore += diff*Math.min(1, dt*ZL.cfg.anim.scoreSpeed);
            this._RefreshScore();
        }

        if (this.pulse > 0)
        {
            this.pulse = Math.max(0, this.pulse - dt*4);
            if (this.scoreLabel) // the layout ignores transform scale, pulse the font height
                this.scoreLabel.SetHeight(Math.round(52*(1 + 0.25*this.pulse)));
        }

        for (let fl of this.floats)
        {
            fl.t = Math.min(1, fl.t + dt/ZL.cfg.anim.floatTime);
            if (fl.label)
            {
                let e = 1 - (1 - fl.t)*(1 - fl.t);
                ZL.place(fl.label, fl.x, fl.y + 70*e, 220, 50);
                fl.label.SetTransparency(fl.t < 0.6 ? 1 : 1 - (fl.t - 0.6)/0.4);
            }

            if (fl.t >= 1)
            {
                fl.done = true;
                if (fl.label)
                {
                    fl.label.SetEnabled(false);
                    this.floatPool.push(fl.label);
                }
            }
        }

        this.floats = this.floats.filter(f => !f.done);
    }
};
