// Анимации экранов меты (главный экран, окна победы и продолжения): очередь твинов и общие приёмы —
// окно выскакивает, кнопка пружинит, число набегает

WordFallUiTweens = class WordFallUiTweens
{
    constructor()
    {
        this._list = [];
    }

    Clear() { this._list = []; }
    IsBusy() { return this._list.length > 0; }

    // apply(k) получает долю 0..1 после задержки, done — по окончании
    Add(delay, dur, apply, done)
    {
        this._list.push({ delay: delay, dur: Math.max(dur, 0.001), apply: apply, done: done || null, t: 0 });
    }

    Update(dt)
    {
        var list = this._list.slice();
        for (var i = 0; i < list.length; i++)
        {
            var a = list[i];
            a.t += dt;
            if (a.t < a.delay)
                continue;
            var k = Math.min(1, (a.t - a.delay)/a.dur);
            try
            {
                a.apply(k);
                if (k >= 1 && a.done)
                    a.done();
            }
            catch (e)
            {
                print("WordFall: ui animation failed: " + e);
                k = 1;
            }
            if (k >= 1)
            {
                var index = this._list.indexOf(a);
                if (index >= 0)
                    this._list.splice(index, 1);
            }
        }
    }
};

WordFallUi = {
    // 13010 → «13,010»
    FormatNumber: function(value)
    {
        var text = "" + Math.round(Math.abs(value));
        var out = "";
        for (var i = 0; i < text.length; i++)
        {
            if (i > 0 && (text.length - i) % 3 == 0)
                out += ",";
            out += text.charAt(i);
        }
        return (value < 0 ? "-" : "") + out;
    },

    EaseOut: function(k) { return 1 - (1 - k)*(1 - k)*(1 - k); },

    // Масштаб и поворот виджета — вокруг его центра
    Center: function(widget)
    {
        if (widget)
            widget.GetTransform().SetPivot2D(new Vec2(0.5, 0.5));
    },

    SetScale: function(widget, scale)
    {
        widget.GetTransform().SetScale2D(new Vec2(scale, scale));
    },

    // Окно выскакивает: проявляется и растёт с небольшим перелётом
    PopIn: function(tweens, widget, delay, dur)
    {
        WordFallUi.Center(widget);
        widget.SetTransparency(0);
        WordFallUi.SetScale(widget, 0.7);
        tweens.Add(delay, dur || 0.38, function(k) {
            var s = k < 0.7 ? 0.7 + 0.38*(k/0.7) : 1.08 - 0.08*((k - 0.7)/0.3);
            WordFallUi.SetScale(widget, s);
            widget.SetTransparency(Math.min(1, k*2.5));
        }, function() { WordFallUi.SetScale(widget, 1); widget.SetTransparency(1); });
    },

    // Проявление до to (по умолчанию 1): у затемнения своя прозрачность из макета
    FadeIn: function(tweens, widget, delay, dur, to)
    {
        var target = to === undefined ? 1 : to;
        widget.SetTransparency(0);
        tweens.Add(delay, dur || 0.25, function(k) { widget.SetTransparency(target*k); });
    },

    // Отклик нажатия: короткое сжатие и отскок
    Bounce: function(tweens, widget)
    {
        WordFallUi.Center(widget);
        tweens.Add(0, 0.22, function(k) {
            WordFallUi.SetScale(widget, k < 0.35 ? 1 - 0.1*(k/0.35) : 0.9 + 0.1*WordFallUi.EaseOut((k - 0.35)/0.65));
        }, function() { WordFallUi.SetScale(widget, 1); });
    },

    // Отказ: виджет трясётся по горизонтали
    Shake: function(tweens, widget)
    {
        WordFallUi.Center(widget);
        tweens.Add(0, 0.4, function(k) {
            widget.GetTransform().SetAngleDegrees(Math.sin(k*30)*(1 - k)*6);
        }, function() { widget.GetTransform().SetAngleDegrees(0); });
    },

    // Число на ярлыке набегает от from до to
    CountUp: function(tweens, label, from, to, delay, dur, format)
    {
        var fmt = format || WordFallUi.FormatNumber;
        tweens.Add(delay, dur, function(k) {
            label.SetText(fmt(from + (to - from)*WordFallUi.EaseOut(k)));
        }, function() { label.SetText(fmt(to)); });
    }
};
