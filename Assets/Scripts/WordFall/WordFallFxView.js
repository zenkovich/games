// Секвенсор хореографии хода: буквы из лотка летят в прогресс-бар с искрами
// на прилёте, «+N» всплывает у бара, отложенный обвал поля; эффекты пауэрапов
// (вспышка бомбы, лучи ракеты, звёзды). Все координаты экранные (секция Fx
// растянута на весь Screen)

WordFallFxView = class WordFallFxView extends o2.Component
{
    constructor()
    {
        super();
        this.letterStagger = 0.08; // задержка между стартами букв
        this.letterFlight = 0.45;  // время полёта буквы в бар
        this.collapseDelay = 0.15; // обвал поля (ячейки уже пустые)
        this.rocketFlight = 0.8;   // полёт ракеты бонуса — небыстрый, чтобы читался
        this.rocketStagger = 0.15; // задержка между ракетами фейерверка
        this.bonusPause = 0.3;     // общая пауза между этапами бонусов и перед обвалом

        this._svc = null;
        this._vfx = null;
        this._anims = [];        // { delay, dur, apply(k), done, t }
        this._flashNext = 0;
        this._busy = false;
    }

    OnStart()
    {
        globalThis.WordFallViews = globalThis.WordFallViews || {};
        WordFallViews.fx = this;

        this._svc = this.serviceActor.GetComponent("WordFallGameService");
        if (this.vfxActor)
            this._vfx = this.vfxActor.GetComponent("WordFallVfx");

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

        // бонусы играют этапами; обвал поля — после последнего эффекта с паузой
        var bonusEnd = this._PlayPowerupFx(result);
        var collapseAt = bonusEnd > 0 ? bonusEnd + this.bonusPause : this.collapseDelay;
        this._Fx(collapseAt, 0.01, function(k) {}, function() {
            if (board)
                board.ApplyPendingCollapse();
        });

        // звёзды влетают в кончик текущей заливки прогресс-бара
        var barX = hud ? hud.BarTipWorldX() : 0;
        var barY = hud ? hud.BarWorldY() : 598;

        var count = Math.min(slots.length, this._letters.length);
        var lastArrive = this.letterFlight;
        for (var i = 0; i < count; i++)
        {
            (function(idx) {
                var slot = slots[idx];
                var view = self._letters[idx];
                view.letter.text = slot.letter;
                view.points.text = slot.value > 0 ? ("" + slot.value) : "";

                // бесшовно: плашка встаёт на место слота в тот же кадр, что слот
                // погас, и в его зелёной подсветке собранного слова
                view.letter.color = new Color4(56, 142, 60, 255);
                self._PlaceAtStart(view, slot.x, slot.y, barX, barY);

                var start = idx*self.letterStagger;
                // старт полёта: траекторию, скейл, угол, растворение в звезду и
                // искры ведёт анимация "flight" прототипа FxFlyingLetter
                self._Fx(start, 0.01, function(k) {}, function() {
                    self._StartFlight(view);
                });
                // подсветка гаснет к середине полёта — буква становится обычной
                self._Fx(start, self.letterFlight*0.5, function(k) {
                    view.letter.color = new Color4(56 + (74 - 56)*k, 142 + (48 - 142)*k, 60 + (34 - 60)*k, 255);
                });
                // прилёт: вспышка на баре; плашку прячем после пучка искр
                self._Fx(start + self.letterFlight, 0.01, function(k) {}, function() {
                    self.Flash(barX, barY, 18, 64, 0, 0.22);
                });
                self._Fx(start + self.letterFlight + 0.5, 0.01, function(k) {}, function() {
                    view.widget.SetEnabled(false);
                });
            })(i);

            lastArrive = i*this.letterStagger + this.letterFlight;
        }

        // финал: искры и набегание счёта
        this._Fx(lastArrive, 0.01, function(k) {}, function() {
            if (self._vfx)
                self._vfx.PlayScoreHit(barX, barY);
            self.Flash(barX, barY, 30, 120, 0, 0.3);
            if (hud)
                hud.AnimateScoreTo(self._svc.GetScore());
        });

        // всплывающий «+N» у бара
        var total = this._total;
        this._Fx(lastArrive, 0.7, function(k) {
            total.SetText("+" + result.gain);
            total.SetEnabled(true);
            self._SetRect(total, barX, barY - 52 + 22*k, 60);
            total.SetTransparency(k < 0.6 ? 1 : 1 - (k - 0.6)/0.4);
        }, function() {
            total.SetEnabled(false);
            total.SetTransparency(1);
            self._busy = false;
        });
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
        trajectory.SetPosition(0); // сброс в старт + новое смещение в коридоре сплайна

        view.widget.SetEnabled(true);
    }

    // Заводит анимацию полёта (траектория уже нацелена)
    _StartFlight(view)
    {
        var anim = view.widget.GetComponent("o2::AnimationComponent");
        if (!anim)
            return;

        var state = anim.GetState("flight");
        if (state)
            state.SetWeight(1);
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
                    self._Fx(at, 0.01, function(k) {}, function() {
                        // взрыв: салют, вспышка, зона 3×3 пустеет сразу
                        board.HideTileVisual(pu.c, pu.r);
                        var destroyed = result.destroyed || [];
                        for (var d = 0; d < destroyed.length; d++)
                            board.HideTileVisual(destroyed[d].c, destroyed[d].r);

                        self.Flash(pos.x, pos.y, 40, 200, 0, 0.5);
                        if (self._vfx)
                            self._vfx.PlayFirework(pos.x, pos.y);
                    });
                })(pu, pos, time);

                time += 0.15;
            }
            else if (pu.kind == "rocket" || pu.kind == "fireworks")
            {
                var targets = pu.targets || [];
                var lastArrive = time;
                for (var t = 0; t < targets.length; t++)
                {
                    var target = board.TileWorldPos(targets[t].c, targets[t].r);
                    var launchAt = time + t*this.rocketStagger;
                    this._LaunchRocket(pu, targets[t], pos, target, launchAt);
                    lastArrive = launchAt + this.rocketFlight;
                }
                time = lastArrive + 0.1;
            }
        }

        return time;
    }

    // Полёт ракеты бонуса: траектория и салют на прилёте живут в прототипе FxRocket.
    // На взлёте плитка бонуса гаснет — летит тот же спрайт, без визуального разрыва
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

        this._Fx(delay, 0.01, function(k) {}, function() {
            var trajectory = view.widget.GetComponent("o2::FlightTrajectoryComponent");
            var anim = view.widget.GetComponent("o2::AnimationComponent");
            if (!trajectory || !anim)
                return;

            if (board)
                board.HideTileVisual(bonus.c, bonus.r);

            anim.Stop("flight");
            trajectory.SetPoints(from.x, from.y, to.x, to.y);
            trajectory.SetPosition(0);
            view.widget.SetEnabled(true);

            var state = anim.GetState("flight");
            if (state)
                state.SetWeight(1);
            anim.RewindAndPlay("flight");
        });

        // попадание: клетка гаснет сразу, вспышка (салют выпускают суб-треки)
        this._Fx(delay + this.rocketFlight, 0.01, function(k) {}, function() {
            if (board)
                board.HideTileVisual(targetCell.c, targetCell.r);
            self.Flash(to.x, to.y, 24, 110, 0, 0.3);
        });

        // спрятать ракету после разлёта салюта
        this._Fx(delay + this.rocketFlight + 0.55, 0.01, function(k) {}, function() {
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
        this._anims = alive;
    }
};
