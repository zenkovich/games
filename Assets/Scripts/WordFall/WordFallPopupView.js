globalThis.WordFallGame = globalThis.WordFallGame || {};

// Вьюха попапа финала уровня (концепт E): компактная карточка с кремовой плашкой-заголовком,
// звёздами на гнёздах, счётом с бейджем «+N», строкой задач и кнопкой. Появление —
// хореография: карточка выскакивает, плашка падает сверху, звёзды зажигаются с бликами,
// счёт набегает, плитки-конфетти и блики над карточкой. Ведёт по кампании (дальше / ещё раз)

WordFallPopupView = class WordFallPopupView extends o2.Component
{
    get _svc() { return WordFallGame.service; }
    get _vfx() { return WordFallGame.vfx || null; }

    constructor()
    {
        super();
        this._shownState = "playing";
        this._anims = [];
        this._idleTime = 0;
        this._idle = false;
    }

    OnStart()
    {
        globalThis.WordFallViews = globalThis.WordFallViews || {};
        WordFallViews.popup = this;


        var content = this._actor.GetChild("Content");
        this._content = content;
        this._dim = content.GetChild("Dim");
        this._panel = content.GetChild("Panel");
        this._plate = content.GetChild("Plate");
        this._title = content.GetChild("Title");
        this._scoreLine = content.GetChild("ScoreLine");
        this._badge = content.GetChild("Badge");
        this._badgeText = content.GetChild("Badge/BadgeText");
        this._tasksLine = content.GetChild("TasksLine");
        this._tasksCheck = content.GetChild("TasksCheck");
        this._subtitle = content.GetChild("Subtitle");
        this._restart = content.GetChild("RestartBtn");
        this._button = content.GetChild("RestartBtn/Btn");
        this._buttonCaption = this._button.GetLayer("caption").drawable;
        this._inner = content.GetChild("Inner");
        this._divider = content.GetChild("Divider");
        this._stars = [];
        for (var i = 0; i < 3; i++)
            this._stars.push({ slot: content.GetChild("StarSlot" + i), lit: content.GetChild("Star" + i),
                               size: 84, x: -100 + i*100, y: 126 });
        this._confetti = [];
        for (var i = 0; i < 6; i++)
        {
            var tile = content.GetChild("Confetti" + i);
            if (tile)
                this._confetti.push({ widget: tile, letter: tile.GetLayer("letter").drawable,
                                      points: tile.GetLayer("points").drawable,
                                      tilt: [-18, 14, 20, -16, 12, -22][i],
                                      x: [-209, 161, -249, 256, -234, 246][i],
                                      y: [383, 393, 138, 128, -52, -72][i],
                                      radius: 10 + (i % 3)*4, rise: 12 + (i % 2)*6,
                                      period: 3.4 + i*0.35, phase: i*0.6, cycle: -1 });
        }

        var self = this;
        this._button.onClick = function() { self.OnButton(); };
    }

    _IsLastLevel() { return this._svc.GetLevelIndex() >= this._svc.GetLevelCount() - 1; }

    // Звёзды за запас очков сверх цели: 1 — цель, 2 — +25 %, 3 — +60 %
    _StarsFor(score, target)
    {
        if (score < target)
            return 0;
        return score >= target*1.6 ? 3 : score >= target*1.25 ? 2 : 1;
    }

    _SetRect(widget, x, y, w, h)
    {
        var layout = widget.GetLayout();
        layout.SetOffsetMin(new Vec2(x - w*0.5, y - h*0.5));
        layout.SetOffsetMax(new Vec2(x + w*0.5, y + h*0.5));
    }

    // Положение парящей буквы в момент t покоя. Ею же заканчивается влёт при появлении,
    // поэтому передача из одной анимации в другую проходит без рывка
    _IdleTransform(tile, t)
    {
        var phase = ((t + tile.phase) % tile.period)/tile.period;
        var swing = Math.sin(phase*Math.PI*2);
        var ease = 0.5 - 0.5*Math.cos(phase*Math.PI*2);   // 0 → 1 → 0, гладко
        return { x: tile.x + swing*tile.radius, y: tile.y + (ease - 0.5)*2*tile.rise,
                 angle: tile.tilt + swing*6 };
    }

    _Fx(delay, dur, apply, done)
    {
        this._anims.push({ delay: delay, dur: Math.max(dur, 0.001), apply: apply, done: done || null, t: 0 });
    }

    Show(won)
    {
        var self = this;
        var svc = this._svc;
        var last = this._IsLastLevel();
        var score = svc.GetScore();
        var target = svc.GetTargetScore();
        var best = svc.GetBestScore();
        var tasks = svc.GetTasks();
        var done = 0;
        for (var i = 0; i < tasks.length; i++)
            done += tasks[i].done ? 1 : 0;
        var bonus = Math.max(0, score - target);
        this._anims = [];
        this._idle = false;
        this._idleTime = 0;
        this._idleStars = 0;

        this._title.SetText(won ? (last ? "ФИНАЛ!" : "ПОБЕДА!") : "НЕ ВЫШЛО");
        this._scoreLine.SetText("0");
        this._badgeText.SetText("+" + bonus);
        this._tasksLine.SetText("Задачи " + done + "/" + tasks.length);
        this._tasksCheck.SetEnabled(false);
        this._subtitle.SetText(won ? (best > 0 && score > best ? "Новый рекорд! Было " + best : best > 0 ? "Рекорд: " + best : "")
                                   : (done < tasks.length ? "Задачи не закрыты" : score < target ? "Не хватило " + (target - score) + " очков" : "Не хватило ходов"));
        this._buttonCaption.text = won ? (last ? "СНАЧАЛА" : "ДАЛЬШЕ") : "ЕЩЁ РАЗ";
        this._content.SetEnabled(true);

        // затемнение, карточка выскакивает, плашка-заголовок падает сверху и пружинит
        this._dim.SetTransparency(0);
        this._Fx(0, 0.25, function(k) { self._dim.SetTransparency(200/255*k); });
        this._panel.SetTransparency(0);
        this._Fx(0.05, 0.38, function(k) {
            var s = k < 0.7 ? 0.6 + 0.5*(k/0.7) : 1.1 - 0.1*((k - 0.7)/0.3);
            self._SetRect(self._panel, 0, 24, 466*s, 490*s);
            self._panel.SetTransparency(Math.min(1, k*2.5));
        }, function() { self._SetRect(self._panel, 0, 28, 466, 490); self._panel.SetTransparency(1); });
        var dropPlate = function(k) {
            var y = k < 0.6 ? 364 - 102*(k/0.6) : 262 + Math.sin((k - 0.6)/0.4*Math.PI)*10;
            self._SetRect(self._plate, 0, y, 410, 88);
            self._SetRect(self._title, 0, y + 4, 400, 60);
        };
        this._plate.SetTransparency(0); this._title.SetTransparency(0);
        this._Fx(0.25, 0.35, function(k) { dropPlate(k); self._plate.SetTransparency(Math.min(1, k*3)); self._title.SetTransparency(Math.min(1, k*3)); },
                 function() { dropPlate(1); });

        var fade = function(widget, delay, dur) {
            widget.SetTransparency(0);
            self._Fx(delay, dur || 0.25, function(k) { widget.SetTransparency(k); });
        };
        fade(this._inner, 0.25); fade(this._divider, 0.5);
        for (var i = 0; i < 3; i++)
        {
            fade(this._stars[i].slot, 0.3 + i*0.06);
            this._stars[i].lit.SetEnabled(false);
        }
        fade(this._tasksLine, 0.55); fade(this._subtitle, 0.65); fade(this._restart, 0.75);

        // плитки-буквы вокруг карточки: буквы слова-задания (или запасные), лёгкое покачивание
        var letters = [];
        for (var i = 0; i < tasks.length; i++)
            if (tasks[i].type == "word" && tasks[i].word)
                letters = tasks[i].word.split("");
        var spare = ["П", "О", "Б", "Е", "Д", "А"];
        for (var i = 0; i < this._confetti.length; i++)
        {
            (function(tile, index) {
                tile.widget.SetEnabled(won);
                tile.cycle = -1;
                if (!won)
                    return;

                var letter = letters.length > index ? letters[index] : spare[index];
                tile.letter.text = letter;
                tile.points.text = "" + (1 + (index*3) % 5);

                // влёт снаружи в точку, с которой начнётся покой
                var target = self._IdleTransform(tile, 0);
                var from = { x: target.x + (target.x >= 0 ? 170 : -170), y: target.y + 70 };
                var startAngle = tile.tilt - 28;
                tile.widget.SetTransparency(0);
                self._SetRect(tile.widget, from.x, from.y, 52, 52);
                self._Fx(0.3 + index*0.09, 0.55, function(k) {
                    var e = 1 - Math.pow(1 - k, 3);              // easeOutCubic
                    var size = 52 + 32*e;
                    self._SetRect(tile.widget, from.x + (target.x - from.x)*e,
                                  from.y + (target.y - from.y)*e, size, size);
                    tile.widget.GetTransform().SetAngleDegrees(startAngle + (target.angle - startAngle)*e);
                    tile.widget.SetTransparency(Math.min(1, k*2.2));
                }, function() {
                    self._SetRect(tile.widget, target.x, target.y, 84, 84);
                    tile.widget.GetTransform().SetAngleDegrees(target.angle);
                    tile.widget.SetTransparency(1);
                });
            })(this._confetti[i], i);
        }

        // счёт набегает, бейдж выскакивает после
        this._scoreLine.SetTransparency(0);
        this._Fx(0.5, 0.9, function(k) {
            self._scoreLine.SetTransparency(Math.min(1, k*3));
            var e = 1 - (1 - k)*(1 - k);
            self._scoreLine.SetText("" + Math.round(score*e));
        }, function() { self._scoreLine.SetText("" + score); });
        this._badge.SetEnabled(bonus > 0);
        if (bonus > 0)
        {
            this._badge.SetTransparency(0);
            this._Fx(1.35, 0.3, function(k) {
                var s = k < 0.6 ? 0.3 + 1.0*(k/0.6) : 1.3 - 0.3*((k - 0.6)/0.4);
                self._SetRect(self._badge, 124, 66, 112*s, 60*s);
                self._badge.SetTransparency(Math.min(1, k*3));
            }, function() { self._SetRect(self._badge, 124, 66, 112, 60); });
        }
        if (done == tasks.length)
            this._Fx(0.7, 0.01, function(k) {}, function() { self._tasksCheck.SetEnabled(true); });

        // звёзды: заработанные зажигаются по очереди с бликами
        var earned = won ? this._StarsFor(score, target) : 0;
        this._idleStars = earned;
        for (var i = 0; i < earned; i++)
        {
            (function(star, at) {
                self._Fx(0.85 + at*0.32, 0.32, function(k) {
                    star.lit.SetEnabled(true);
                    var s = k < 0.6 ? 0.2 + 1.25*(k/0.6) : 1.45 - 0.45*((k - 0.6)/0.4);
                    self._SetRect(star.lit, star.x, star.y, star.size*s, star.size*s);
                }, function() {
                    self._SetRect(star.lit, star.x, star.y, star.size, star.size);
                    if (self._vfx)
                        self._vfx.PlayDelivered(star.x, star.y);
                });
            })(this._stars[i], i);
        }

        if (won && this._vfx)
        {
            this._Fx(0.3, 0.01, function(k) {}, function() { self._vfx.PlayWinTiles(0, 300); });
            this._Fx(0.9, 0.01, function(k) {}, function() { self._vfx.PlayWin(); });
        }
        if (!won)
        {
            this._Fx(0.45, 0.5, function(k) {
                var shake = Math.sin(k*28)*(1 - k)*12;
                self._SetRect(self._panel, shake, 28, 466, 490);
            }, function() { self._SetRect(self._panel, 0, 28, 466, 490); });
            if (this._vfx)
                this._Fx(0.45, 0.01, function(k) {}, function() { self._vfx.PlayCrateHit(0, 60); });
        }
    }

    Hide()
    {
        this._anims = [];
        this._idle = false;
        this._content.SetEnabled(false);
    }

    // Покой карточки: буквы вокруг плавно парят по замкнутой траектории (изинг, старт —
    // ровно та точка, где их оставила анимация появления), звёзды по очереди коротко бампают.
    // Карточка, счёт и кнопка стоят на месте
    _UpdateIdle(dt)
    {
        this._idleTime += dt;
        var t = this._idleTime;

        for (var i = 0; i < this._confetti.length; i++)
        {
            var tile = this._confetti[i];
            if (!tile.widget.IsEnabled())
                continue;

            var place = this._IdleTransform(tile, t);
            this._SetRect(tile.widget, place.x, place.y, 84, 84);
            tile.widget.GetTransform().SetAngleDegrees(place.angle);

            // на границе цикла плитка меняет букву — набор живёт
            var cycle = Math.floor((t + tile.phase)/tile.period);
            if (cycle != tile.cycle)
            {
                tile.cycle = cycle;
                tile.letter.text = this._RandomLetter();
                tile.points.text = "" + (1 + Math.floor(Math.random()*5));
            }
        }

        // звёзды: раз в 2.4 с следующая по кругу делает короткий бамп
        var slot = Math.floor(t/2.4);
        if (this._idleStars > 0)
        {
            var index = slot % this._idleStars;
            var local = t - slot*2.4;
            for (var i = 0; i < this._idleStars; i++)
            {
                var star = this._stars[i];
                var k = 1;
                if (i == index && local < 0.36)
                {
                    var b = local/0.36;
                    k = 1 + 0.18*Math.sin(b*Math.PI);   // вверх и обратно
                }
                this._SetRect(star.lit, star.x, star.y, star.size*k, star.size*k);
            }
        }
    }

    _RandomLetter()
    {
        var letters = "АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЫЭЮЯ";
        return letters[Math.floor(Math.random()*letters.length)];
    }

    OnButton()
    {
        var fx = WordFallViews.fx;
        if (fx)
            fx.Finish();

        // победа двигает прогресс (с сохранением), поражение — рестарт текущего
        if (this._svc.GetGameState() == "won")
            this._svc.AdvanceToNextLevel();
        else
            this._svc.RestartLevel();

        this._shownState = "playing";
        this.Hide();

        var boosters = WordFallViews.boosters;
        if (boosters)
            boosters.CancelAimMode();
    }

    Update(dt)
    {
        if (!this._svc)
            return;

        var state = this._svc.GetGameState();
        var fx = WordFallViews.fx;

        // попап ждёт окончания хореографии начисления очков
        if (state != "playing" && this._shownState != state && (!fx || !fx.IsBusy()))
        {
            this._shownState = state;
            this.Show(state == "won");
        }
        else if (state == "playing" && this._shownState != "playing")
        {
            this._shownState = "playing";
            this.Hide();
        }

        if (this._content.IsEnabled() && this._anims.length == 0)
        {
            if (!this._idle)
            {
                this._idle = true;
                this._idleTime = 0;
            }
            this._UpdateIdle(dt);
        }

        for (var i = this._anims.length - 1; i >= 0; i--)
        {
            var a = this._anims[i];
            a.t += dt;
            if (a.t < a.delay)
                continue;
            var k = Math.min(1, (a.t - a.delay)/a.dur);
            a.apply(k);
            if (k >= 1)
            {
                if (a.done)
                    a.done();
                this._anims.splice(i, 1);
            }
        }
    }
};
