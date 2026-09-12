globalThis.WordFallGame = globalThis.WordFallGame || {};

// Секвенсор хореографии хода: буквы из лотка летят в прогресс-бар с искрами
// на прилёте, «+N» всплывает у бара, отложенный обвал поля; эффекты пауэрапов
// (вспышка бомбы, лучи ракеты, звёзды). Все координаты экранные (секция Fx
// растянута на весь Screen)

WordFallFxView = class WordFallFxView extends o2.Component
{
    get _svc() { return WordFallGame.service; }
    get _vfx() { return WordFallGame.vfx || null; }

    constructor()
    {
        super();
        this.letterStagger = 0.12; // задержка между стартами букв — удары по бару читаются раздельно
        this.letterFlight = 0.45;   // длительность клипа полёта в прототипе FxFlyingLetter
        this.letterSpeed = 900;     // px/с — буква с поля летит дольше буквы из лотка
        this.letterMinFlight = 0.4;
        this.letterMaxFlight = 0.95;
        this.collapseDelay = 0.15; // обвал поля (ячейки уже пустые)
        this.rocketFlight = 1.05;   // длительность клипа полёта в прототипе FxRocket
        this.rocketSpeed = 760;     // px/с — скорость ракеты одинакова для любой дистанции
        this.rocketMinFlight = 0.5; // короче не летим: успеть прочитать взлёт и попадание
        this.rocketMaxFlight = 1.2;
        this.rocketDetour = 300;    // близкая цель: крюк, чтобы ракета не «топталась» на месте
        this.rocketStagger = 0.15; // задержка между ракетами фейерверка
        this.rocketCharge = 0.14;  // сжатие бонуса перед стартом ракеты
        this.bonusPause = 0.3;     // общая пауза между этапами бонусов и перед обвалом
        this.bombCharge = 0.28;    // разгорание фитиля перед взрывом бомбы
        this.bombShake = 13;       // амплитуда тряски поля на взрыве, px

        this._anims = [];        // { delay, dur, apply(k), done, t }
        this._flashNext = 0;
        this._busy = false;
    }

    OnStart()
    {
        globalThis.WordFallViews = globalThis.WordFallViews || {};
        WordFallViews.fx = this;


        this._total = this._actor.GetChild("FxTotal");

        this._letters = [];
        for (var i = 0; i < 8; i++)
        {
            var letter = this._actor.GetChild("FxLetter" + i);
            this._letters.push({
                widget: letter,
                letter: letter.GetLayer("letter").drawable,
                points: letter.GetLayer("points").drawable
            });
        }

        this._flashes = [];
        for (var i = 0; i < 10; i++)
        {
            var flash = this._actor.GetChild("FxFlash" + i);
            this._flashes.push({ widget: flash, img: flash.GetLayer("img") });
        }

        this._rockets = [];
        for (var i = 0; i < 10; i++)
            this._rockets.push({ widget: this._actor.GetChild("FxRocket" + i), busy: false });

        var beamH = this._actor.GetChild("FxBeamH");
        var beamV = this._actor.GetChild("FxBeamV");
        this._beamH = { widget: beamH, img: beamH.GetLayer("img") };
        this._beamV = { widget: beamV, img: beamV.GetLayer("img") };
    }

    IsBusy() { return this._busy || this._anims.length > 0; }

    _SetRect(widget, x, y, size)
    {
        var half = size*0.5;
        var layout = widget.GetLayout();
        layout.SetOffsetMin(new Vec2(x - half, y - half));
        layout.SetOffsetMax(new Vec2(x + half, y + half));
    }

    _Fx(delay, dur, apply, done)
    {
        this._anims.push({ delay: delay, dur: Math.max(dur, 0.001), apply: apply, done: done || null, t: 0 });
    }

    // Полная последовательность принятого слова: буквы из лотка друг за другом
    // летят в прогресс-бар, каждая вспыхивает на прилёте; после последней —
    // искры, набегание счёта и всплывающий «+N».
    // slots: [{letter, value, x, y}] — буквы и экранные позиции слотов лотка
    PlayAccept(slots, result)
    {
        var self = this;
        var board = WordFallViews.board;
        var hud = WordFallViews.hud;

        this._busy = true;
        for (var i = 0; i < this._letters.length; i++)
            this._letters[i].busy = false;

        // счёт бара: база + доля букв слова + доля букв, выбитых бонусами; финал — точный
        this._scoreBase = hud ? hud.DisplayScore() : 0;
        this._scoreFinal = this._svc.GetScore();
        this._wordShare = 0;
        this._bonusShare = 0;
        this._lastArrive = 0;

        var count = Math.min(slots.length, this._letters.length);
        var wordScore = result.wordScore || 0;
        for (var i = 0; i < count; i++)
        {
            (function(idx) {
                var slot = slots[idx];
                var share = Math.round(wordScore*(idx + 1)/count);
                self._FlyLetter(slot.letter, slot.value, slot.x, slot.y, idx*self.letterStagger, true, function() {
                    self._wordShare = Math.max(self._wordShare, share);
                    self._PushScore();
                });
            })(i);
        }

        // бонусы играют этапами (их буквы улетают в бар при уничтожении);
        // обвал поля — после последнего эффекта с паузой
        var bonusEnd = this._PlayPowerupFx(result);
        var collapseAt = bonusEnd > 0 ? bonusEnd + this.bonusPause : this.collapseDelay;
        this._Fx(collapseAt, 0.01, function(k) {}, function() {
            if (board)
                board.ApplyPendingCollapse();
        });

        // финал: искры, точный счёт и всплывающий «+N» у бара — после последнего прилёта
        var finishAt = Math.max(this._lastArrive, collapseAt);
        var total = this._total;
        this._Fx(finishAt, 0.01, function(k) {}, function() {
            var tip = hud ? hud.BarTip() : { x: 0, y: 598 };
            if (self._vfx)
                self._vfx.PlayScoreHit(tip.x, tip.y);
            self.Flash(tip.x, tip.y, 30, 120, 0, 0.3);
            if (hud)
                hud.AnimateScoreTo(self._scoreFinal);
        });
        this._Fx(finishAt, 0.7, function(k) {
            var tip = hud ? hud.BarTip() : { x: 0, y: 598 };
            total.SetText("+" + result.gain);
            total.SetEnabled(true);
            self._SetRect(total, tip.x, tip.y - 52 + 22*k, 60);
            total.SetTransparency(k < 0.6 ? 1 : 1 - (k - 0.6)/0.4);
        }, function() {
            total.SetEnabled(false);
            total.SetTransparency(1);
            self._busy = false;
        });
    }

    // Бар получает накопленную долю (не больше финала и только вперёд)
    _PushScore()
    {
        var hud = WordFallViews.hud;
        if (!hud)
            return;
        var score = Math.min(this._scoreFinal, this._scoreBase + this._wordShare + this._bonusShare);
        if (score > hud.DisplayScore())
            hud.AnimateScoreTo(score);
    }

    // Свободная плашка пула летящих букв
    _AllocLetter()
    {
        for (var i = 0; i < this._letters.length; i++)
        {
            if (!this._letters[i].busy)
            {
                this._letters[i].busy = true;
                return this._letters[i];
            }
        }
        return null;
    }

    // Полёт одной буквы из точки в кончик заливки бара; onArrive — начисление доли.
    // Длительность считается по дистанции, клип полёта растягивается под неё скоростью —
    // буква с дальнего края поля не «телепортируется» за то же время, что буква из лотка
    _FlyLetter(letter, value, fromX, fromY, start, fromWord, onArrive)
    {
        var self = this;
        var hud = WordFallViews.hud;
        var view = this._AllocLetter();
        if (!view)
            return this.letterMinFlight;

        var tipOf = function() { return hud ? hud.BarTip() : { x: 0, y: 598 }; };
        var aim = tipOf();
        var dx = aim.x - fromX, dy = aim.y - fromY;
        var flight = Math.max(this.letterMinFlight,
                              Math.min(this.letterMaxFlight, Math.sqrt(dx*dx + dy*dy)/this.letterSpeed));
        view.letter.text = letter;
        view.points.text = value > 0 ? ("" + value) : "";
        // буква слова стартует в зелёной подсветке лотка, буква от бонуса — в тёплой
        var from = fromWord ? { r: 56, g: 142, b: 60 } : { r: 224, g: 140, b: 40 };
        view.letter.color = new Color4(from.r, from.g, from.b, 255);

        var tip = tipOf();
        this._PlaceAtStart(view, fromX, fromY, tip.x, tip.y);

        this._Fx(start, 0.01, function(k) {}, function() { self._StartFlight(view, self.letterFlight/flight); });
        this._Fx(start, flight, function(k) {
            var tip = tipOf();
            self._Aim(view, fromX, fromY, tip.x, tip.y);
        });
        this._Fx(start, flight*0.5, function(k) {
            view.letter.color = new Color4(from.r + (74 - from.r)*k, from.g + (48 - from.g)*k, from.b + (34 - from.b)*k, 255);
        });
        this._Fx(start + flight, 0.01, function(k) {}, function() {
            var tip = tipOf();
            self.Flash(tip.x, tip.y, 18, 64, 0, 0.22);
            if (onArrive)
                onArrive();
        });
        this._Fx(start + flight + 0.5, 0.01, function(k) {}, function() {
            view.widget.SetEnabled(false);
            view.busy = false;
        });
        this._lastArrive = Math.max(this._lastArrive, start + flight);
        return flight;
    }

    // Буквы, выбитые бонусом: улетают из своих клеток в бар и засчитываются
    _FlyFromCells(cells, at)
    {
        var self = this;
        var board = WordFallViews.board;
        if (!board)
            return;
        for (var i = 0; i < cells.length; i++)
        {
            (function(cell, idx) {
                var info = board.TileInfo(cell.c, cell.r);
                if (!info.letter)
                    return;
                var pos = board.TileWorldPos(cell.c, cell.r);
                self._FlyLetter(info.letter, info.value, pos.x, pos.y, at + idx*0.05, false, function() {
                    self._bonusShare += info.value;
                    self._PushScore();
                });
            })(cells[i], i);
        }
    }

    // Ставит плашку на старт траектории (видимой, ещё без полёта)
    _PlaceAtStart(view, fromX, fromY, toX, toY)
    {
        var trajectory = view.widget.GetComponent("o2::FlightTrajectoryComponent");
        if (!trajectory)
            return;

        // хвост прошлого полёта держит слои растворёнными (микшер стейта пишет
        // последние значения треков каждый кадр, даже остановленный) — глушим
        // стейт весом: с нулевым весом микшер возвращает исходные значения слоёв
        var anim = view.widget.GetComponent("o2::AnimationComponent");
        if (anim)
        {
            anim.Stop("flight");
            var state = anim.GetState("flight");
            if (state)
                state.SetWeight(0);
        }

        trajectory.SetPoints(fromX, fromY, toX, toY);
        trajectory.ResetRandomOffset(); // новое смещение в коридоре сплайна
        trajectory.SetPosition(0);

        view.widget.SetEnabled(true);
    }

    // Перенацеливает траекторию на лету (смещение в коридоре не трогается)
    _Aim(view, fromX, fromY, toX, toY)
    {
        var trajectory = view.widget.GetComponent("o2::FlightTrajectoryComponent");
        if (trajectory)
            trajectory.SetPoints(fromX, fromY, toX, toY);
    }

    // Заводит анимацию полёта (траектория уже нацелена); speed растягивает клип под дистанцию
    _StartFlight(view, speed)
    {
        var anim = view.widget.GetComponent("o2::AnimationComponent");
        if (!anim)
            return;

        var state = anim.GetState("flight");
        if (state)
        {
            state.SetWeight(1);
            state.SetSpeed(speed || 1);
        }
        anim.RewindAndPlay("flight");
    }

    // Эффекты сработавших бонусов этапами: пауза → эффект → пауза → обвал.
    // Возвращает время окончания последнего эффекта (0 — бонусов не было)
    _PlayPowerupFx(result)
    {
        var self = this;
        var board = WordFallViews.board;
        if (!board)
            return 0;

        var used = result.powerupsUsed || [];
        if (used.length == 0)
            return 0;

        var time = 0;
        for (var i = 0; i < used.length; i++)
        {
            var pu = used[i];
            var pos = board.TileWorldPos(pu.c, pu.r);
            time += this.bonusPause; // пауза перед этапом бонуса

            if (pu.kind == "bomb")
            {
                (function(pu, pos, at) {
                    // фитиль: бомба раздувается и разгорается перед взрывом
                    self._Fx(at, self.bombCharge, function(k) {
                        board.SetBonusCharge(pu.c, pu.r, k*k);
                    });

                    // буквы из зоны 3×3 улетают в бар в момент взрыва
                    var area = [];
                    var destroyed = result.destroyed || [];
                    for (var d = 0; d < destroyed.length; d++)
                        if (Math.abs(destroyed[d].c - pu.c) <= 1 && Math.abs(destroyed[d].r - pu.r) <= 1 && !(destroyed[d].c == pu.c && destroyed[d].r == pu.r))
                            area.push(destroyed[d]);
                    self._FlyFromCells(area, at + self.bombCharge);

                    self._Fx(at + self.bombCharge, 0.01, function(k) {}, function() {
                        // взрыв: вспышка, ударная волна, осколки и дым; зона 3×3 пустеет сразу
                        board.SetBonusCharge(pu.c, pu.r, 0);
                        board.HideTileVisual(pu.c, pu.r);
                        for (var d = 0; d < area.length; d++)
                            board.HideTileVisual(area[d].c, area[d].r);

                        self.Flash(pos.x, pos.y, 60, 260, 0, 0.45);
                        board.Shake(self.bombShake, 0.42);
                        if (self._vfx)
                            self._vfx.PlayBombBlast(pos.x, pos.y); // огненная палитра без конфетти салюта
                    });
                })(pu, pos, time);

                time += this.bombCharge + 0.25;
            }
            else if (pu.kind == "rocket" || pu.kind == "fireworks")
            {
                // бонус сжимается перед стартом; фейерверк сначала рвётся сам, потом залп
                (function(pu, pos, at) {
                    self._Fx(at, self.rocketCharge, function(k) {
                        board.SetBonusCharge(pu.c, pu.r, k*k);
                    });
                    if (pu.kind == "fireworks")
                    {
                        self._Fx(at + self.rocketCharge, 0.01, function(k) {}, function() {
                            board.SetBonusCharge(pu.c, pu.r, 0);
                            board.HideTileVisual(pu.c, pu.r);
                            self.Flash(pos.x, pos.y, 30, 130, 0, 0.3);
                            board.Shake(6, 0.28);
                            if (self._vfx)
                                self._vfx.PlayFireworkBurst(pos.x, pos.y);
                        });
                    }
                })(pu, pos, time);

                time += this.rocketCharge + (pu.kind == "fireworks" ? 0.12 : 0);

                var targets = pu.targets || [];
                var lastArrive = time;
                var destroyedByRockets = result.destroyed || [];
                for (var t = 0; t < targets.length; t++)
                {
                    var target = board.TileWorldPos(targets[t].c, targets[t].r);
                    var launchAt = time + t*this.rocketStagger;
                    this._LaunchRocket(pu, targets[t], pos, target, launchAt);
                    lastArrive = Math.max(lastArrive, launchAt + this.RocketFlightPlan(pos, target).duration);
                    // сгоревшая буква улетает в бар в момент попадания
                    for (var d = 0; d < destroyedByRockets.length; d++)
                        if (destroyedByRockets[d].c == targets[t].c && destroyedByRockets[d].r == targets[t].r)
                            this._FlyFromCells([targets[t]], launchAt + this.RocketFlightPlan(pos, target).duration);
                }
                time = lastArrive + 0.1;
            }
        }

        return time;
    }

    // Полёт ракеты бонуса: траектория и салют на прилёте живут в прототипе FxRocket.
    // На взлёте плитка бонуса гаснет — летит тот же спрайт, без визуального разрыва
    // Длительность полёта по дистанции: скорость постоянна, близкие цели получают крюк
    RocketFlightPlan(from, to)
    {
        var dx = to.x - from.x, dy = to.y - from.y;
        var dist = Math.sqrt(dx*dx + dy*dy);
        var detour = dist < 320 ? this.rocketDetour*(1 - dist/320) : 0;
        var path = dist + detour;
        var duration = Math.max(this.rocketMinFlight, Math.min(this.rocketMaxFlight, path/this.rocketSpeed));
        // точка облёта: за целью и вбок, туда ракета целится первую половину пути
        var nx = dist > 1 ? dx/dist : 1, ny = dist > 1 ? dy/dist : 0;
        var over = detour > 0
            ? { x: from.x + nx*(dist + detour*0.8) - ny*detour*0.75, y: from.y + ny*(dist + detour*0.8) + nx*detour*0.75 }
            : null;
        return { duration: duration, detour: detour, over: over };
    }

    _LaunchRocket(bonus, targetCell, from, to, delay)
    {
        var view = null;
        for (var i = 0; i < this._rockets.length; i++)
        {
            if (!this._rockets[i].busy)
            {
                view = this._rockets[i];
                break;
            }
        }
        if (!view)
            return;

        view.busy = true;
        var self = this;
        var board = WordFallViews.board;
        var plan = this.RocketFlightPlan(from, to);

        this._Fx(delay, 0.01, function(k) {}, function() {
            var trajectory = view.widget.GetComponent("o2::FlightTrajectoryComponent");
            var anim = view.widget.GetComponent("o2::AnimationComponent");
            if (!trajectory || !anim)
                return;

            if (board)
            {
                board.SetBonusCharge(bonus.c, bonus.r, 0);
                board.HideTileVisual(bonus.c, bonus.r);
            }

            if (self._vfx)
                self._vfx.PlayRocketLaunch(from.x, from.y); // зажигание, пыль и угли

            anim.Stop("flight");
            // близкую цель ракета сперва проскакивает: целимся за неё, на середине пути
            // финиш переставляется на клетку — выходит облёт вместо топтания на месте
            var aim = plan.over || to;
            trajectory.SetPoints(from.x, from.y, aim.x, aim.y);
            trajectory.ResetRandomOffset(); // новое смещение в коридоре сплайна
            trajectory.SetPosition(0);
            view.widget.SetEnabled(true);

            var state = anim.GetState("flight");
            if (state)
            {
                state.SetWeight(1);
                state.SetSpeed(self.rocketFlight/plan.duration); // клип растягивается под дистанцию
            }
            anim.RewindAndPlay("flight");
        });

        if (plan.over)
        {
            this._Fx(delay + plan.duration*0.45, 0.01, function(k) {}, function() {
                var trajectory = view.widget.GetComponent("o2::FlightTrajectoryComponent");
                if (trajectory)
                    trajectory.SetPoints(from.x, from.y, to.x, to.y); // доводка на цель без рывка
            });
        }

        // попадание: клетка гаснет сразу, кольцо и вспышка (салют выпускают суб-треки)
        this._Fx(delay + plan.duration, 0.01, function(k) {}, function() {
            if (board)
                board.HideTileVisual(targetCell.c, targetCell.r);
            self.Flash(to.x, to.y, 16, 70, 0, 0.22);
            board.Shake(3, 0.2);
            if (self._vfx)
                self._vfx.PlayRocketImpact(to.x, to.y);
        });

        // спрятать ракету, когда доиграло самое долгое в салюте — конфетти (0.1 + 1.0 с)
        this._Fx(delay + plan.duration + 1.15, 0.01, function(k) {}, function() {
            var anim = view.widget.GetComponent("o2::AnimationComponent");
            if (anim)
            {
                anim.Stop("flight");
                var state = anim.GetState("flight");
                if (state)
                    state.SetWeight(0);
            }
            view.widget.SetEnabled(false);
            view.busy = false;
        });
    }

    Flash(x, y, fromSize, toSize, delay, dur)
    {
        var self = this;
        var flash = this._flashes[this._flashNext % this._flashes.length];
        this._flashNext++;

        this._Fx(delay, dur, function(k) {
            flash.widget.SetEnabled(true);
            flash.img.transparency = 1 - k;
            self._SetRect(flash.widget, x, y, fromSize + (toSize - fromSize)*k);
        }, function() {
            flash.widget.SetEnabled(false);
            flash.img.transparency = 1;
        });
    }

    _BeamFx(beam, horizontal, pos, delay)
    {
        this._Fx(delay, 0.3, function(k) {
            beam.widget.SetEnabled(true);
            beam.img.transparency = 1;
            var layout = beam.widget.GetLayout();
            if (horizontal)
            {
                var half = 20 + 330*k;
                layout.SetOffsetMin(new Vec2(pos.x - half, pos.y - 17));
                layout.SetOffsetMax(new Vec2(pos.x + half, pos.y + 17));
            }
            else
            {
                var half = 20 + 364*k;
                layout.SetOffsetMin(new Vec2(pos.x - 17, pos.y - half));
                layout.SetOffsetMax(new Vec2(pos.x + 17, pos.y + half));
            }
        });

        // луч держится и растворяется
        this._Fx(delay + 0.55, 0.25, function(k) {
            beam.img.transparency = 1 - k;
        }, function() {
            beam.widget.SetEnabled(false);
            beam.img.transparency = 1;
        });
    }

    // Мгновенно доводит текущую последовательность до конечного состояния
    Finish()
    {
        if (!this.IsBusy())
            return;

        this._anims = [];

        var board = WordFallViews.board;
        if (board)
            board.ApplyPendingCollapse();

        this._total.SetEnabled(false);
        this._total.SetTransparency(1);

        for (var i = 0; i < this._letters.length; i++)
            this._letters[i].widget.SetEnabled(false);

        for (var i = 0; i < this._flashes.length; i++)
        {
            this._flashes[i].widget.SetEnabled(false);
            this._flashes[i].img.transparency = 1;
        }
        for (var i = 0; i < this._rockets.length; i++)
        {
            this._rockets[i].widget.SetEnabled(false);
            this._rockets[i].busy = false;
        }
        this._beamH.widget.SetEnabled(false);
        this._beamH.img.transparency = 1;
        this._beamV.widget.SetEnabled(false);
        this._beamV.img.transparency = 1;

        var wordPanel = WordFallViews.wordPanel;
        if (wordPanel)
            wordPanel.SetGainText("");

        var hud = WordFallViews.hud;
        if (hud)
            hud.SnapScore();

        this._busy = false;
    }

    Update(dt)
    {
        if (this._anims.length == 0)
            return;

        var alive = [];
        for (var i = 0; i < this._anims.length; i++)
        {
            var a = this._anims[i];
            a.t += dt;
            var k = (a.t - a.delay)/a.dur;
            if (k < 0)
            {
                alive.push(a);
                continue;
            }
            try
            {
                if (k >= 1)
                {
                    a.apply(1);
                    if (a.done)
                        a.done();
                }
                else
                {
                    a.apply(k*k*(3 - 2*k)); // smoothstep
                    alive.push(a);
                }
            }
            catch (e)
            {
                // сломанный эффект выпадает, не останавливая ход: иначе он повторялся бы каждый кадр
                print("WordFall: effect step failed: " + e);
            }
        }
        this._anims = alive;
    }
};
