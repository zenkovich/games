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
                points: letter.GetLayer("points").drawable,
                tileLayers: [letter.GetLayer("back"), letter.GetLayer("letter"), letter.GetLayer("points")],
                starLayer: letter.GetLayer("star")
            });
        }

        this._flashes = [];
        for (var i = 0; i < 10; i++)
        {
            var flash = this._actor.GetChild("FxFlash" + i);
            this._flashes.push({ widget: flash, img: flash.GetLayer("img") });
        }

        this._stars = [];
        for (var i = 0; i < 10; i++)
        {
            var star = this._actor.GetChild("FxStar" + i);
            this._stars.push({ widget: star, img: star.GetLayer("img") });
        }

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

        // ячейки поля опустели ещё при выборе — обвал почти сразу
        this._Fx(this.collapseDelay, 0.01, function(k) {}, function() {
            if (board)
                board.ApplyPendingCollapse();
        });

        this._PlayPowerupFx(result);

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

        trajectory.SetPoints(fromX, fromY, toX, toY);
        trajectory.SetPosition(0); // сброс в старт + новое смещение в коридоре сплайна

        // прошлый полёт оставил слои растворёнными — вернуть плашку, спрятать звезду
        for (var i = 0; i < view.tileLayers.length; i++)
            view.tileLayers[i].transparency = 1;
        view.starLayer.transparency = 0;

        view.widget.SetEnabled(true);
    }

    // Заводит анимацию полёта (траектория уже нацелена)
    _StartFlight(view)
    {
        var anim = view.widget.GetComponent("o2::AnimationComponent");
        if (anim)
            anim.RewindAndPlay("flight");
    }

    // Эффекты сработавших пауэрапов
    _PlayPowerupFx(result)
    {
        var self = this;
        var board = WordFallViews.board;
        if (!board)
            return;

        var used = result.powerupsUsed || [];
        var starIndex = 0;

        for (var i = 0; i < used.length; i++)
        {
            (function(pu, delay) {
                var pos = board.TileWorldPos(pu.c, pu.r);

                if (pu.kind == "bomb")
                {
                    self.Flash(pos.x, pos.y, 40, 220, delay, 0.55);

                    // маленькие отголоски на взорванных клетках
                    var destroyed = result.destroyed || [];
                    for (var d = 0; d < destroyed.length && d < 4; d++)
                    {
                        var dPos = board.TileWorldPos(destroyed[d].c, destroyed[d].r);
                        self.Flash(dPos.x, dPos.y, 20, 80, delay + 0.12 + d*0.05, 0.3);
                    }
                }
                else if (pu.kind == "rocket")
                {
                    self.Flash(pos.x, pos.y, 30, 120, delay, 0.35);
                    self._BeamFx(self._beamH, true, pos, delay);
                    self._BeamFx(self._beamV, false, pos, delay);
                }
                else if (pu.kind == "wand")
                {
                    self.Flash(pos.x, pos.y, 30, 150, delay, 0.4);
                    var activated = result.activated || [];
                    for (var a = 0; a < activated.length && starIndex < self._stars.length; a++)
                    {
                        var sPos = board.TileWorldPos(activated[a].c, activated[a].r);
                        self._StarFx(self._stars[starIndex++], sPos, delay + 0.15 + a*0.08);
                    }
                }
            })(used[i], i*0.25);
        }
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

    _StarFx(star, pos, delay)
    {
        var self = this;
        this._Fx(delay, 0.5, function(k) {
            star.widget.SetEnabled(true);
            star.img.transparency = k < 0.7 ? 1 : 1 - (k - 0.7)/0.3;
            self._SetRect(star.widget, pos.x, pos.y, 14 + 48*Math.sin(Math.PI*k));
        }, function() {
            star.widget.SetEnabled(false);
            star.img.transparency = 1;
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
        for (var i = 0; i < this._stars.length; i++)
        {
            this._stars[i].widget.SetEnabled(false);
            this._stars[i].img.transparency = 1;
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
