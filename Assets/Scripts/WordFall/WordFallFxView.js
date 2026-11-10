globalThis.WordFallGame = globalThis.WordFallGame || {};

// Секвенсор хореографии хода: буквы из лотка радужными звёздами летят в звезду у
// прогресс-бара (она пружинит и светится на каждый прилёт), бар растёт, «+N» всплывает
// над заливкой, отложенный обвал поля; эффекты пауэрапов
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
        this.letterFlight = 0.45;   // время прилёта в клипе полёта прототипа FxFlyingLetter
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
        // варианты эффектов бонусов: 0 — исходные, 1..5 — альтернативы (Tools/WordFall/build_fx_variants.py);
        // в игре — радужный (2)
        this.bombStyle = 2;
        this.rocketStyle = 2;
        this.fireworksStyle = 2;

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
        for (var i = 0; this._actor.GetChild("FxLetter" + i); i++)
        {
            var letter = this._actor.GetChild("FxLetter" + i);
            this._letters.push({
                widget: letter,
                back: letter.GetLayer("back").drawable,
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
        {
            var rocket = this._actor.GetChild("FxRocket" + i);
            var img = rocket.GetLayer("img");
            this._rockets.push({ widget: rocket, busy: false, img: img, flame: rocket.GetLayer("flame"),
                                 image: img.drawable.imageName, trails: [] });
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
    // летят в звезду у бара, каждая доталкивает заливку; после последней —
    // вспышка у кончика заливки, точный счёт и всплывающий «+N».
    // slots: [{letter, value, x, y, image}] — буквы, экранные позиции и плашки слотов лотка
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
                }, slot);
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

        // финал: тёплая вспышка у кончика заливки, удар по бару, точный счёт и «+N» — после последнего прилёта
        var finishAt = Math.max(this._lastArrive, collapseAt);
        var total = this._total;
        this._Fx(finishAt, 0.01, function(k) {}, function() {
            var tip = hud ? hud.BarTip() : { x: 0, y: 598 };
            self.Flash(tip.x, tip.y, 50, 170, 0, 0.34, { r: 255, g: 236, b: 170 });
            if (hud)
            {
                hud.Punch(0.064);
                hud.AnimateScoreTo(self._scoreFinal);
            }
        });
        this._Fx(finishAt, 0.9, function(k) {
            var tip = hud ? hud.BarTip() : { x: 0, y: 598 };
            total.SetText("+" + result.gain);
            total.SetEnabled(true);
            // «+N» выскакивает над кончиком заливки и всплывает
            var pop = k < 0.15 ? 1.35 - 0.35*k/0.15 : 1;
            self._SetRect(total, tip.x, tip.y + 40 + 36*k, 120);
            total.GetTransform().SetScale2D(new Vec2(pop, pop));
            total.SetTransparency(k < 0.65 ? 1 : 1 - (k - 0.65)/0.35);
        }, function() {
            total.SetEnabled(false);
            total.SetTransparency(1);
            total.GetTransform().SetScale2D(new Vec2(1, 1));
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

    // Полёт одной буквы из точки в центр звезды у бара; onArrive — начисление доли.
    // Длительность считается по дистанции, клип полёта растягивается под неё скоростью —
    // буква с дальнего края поля не «телепортируется» за то же время, что буква из лотка.
    // look.image — плашка слота или клетки: буква взлетает того же цвета
    _FlyLetter(letter, value, fromX, fromY, start, fromWord, onArrive, look)
    {
        var self = this;
        var hud = WordFallViews.hud;
        var view = this._AllocLetter();
        if (!view)
            return this.letterMinFlight;

        var aim = hud ? hud.StarCenter() : { x: -370, y: 346 };
        var dx = aim.x - fromX, dy = aim.y - fromY;
        var flight = Math.max(this.letterMinFlight,
                              Math.min(this.letterMaxFlight, Math.sqrt(dx*dx + dy*dy)/this.letterSpeed));
        view.letter.text = letter;
        view.points.text = value > 0 ? ("" + value) : "";
        if (look && look.image && view.back.imageName != look.image)
        {
            var rect = view.back.rect;
            view.back.imageName = look.image;
            view.back.rect = rect;
        }
        // буква слова стартует в зелёной подсветке лотка, буква от бонуса — в тёплой
        var from = fromWord ? { r: 56, g: 142, b: 60 } : { r: 224, g: 140, b: 40 };
        view.letter.color = new Color4(from.r, from.g, from.b, 255);

        // буква слова стоит на месте слота сразу (слоты лотка уже погасли),
        // буква от бонуса появляется к старту — до взрыва в клетке ещё плитка поля
        this._PlaceAtStart(view, fromX, fromY, aim.x, aim.y, fromWord);

        this._Fx(start, 0.01, function(k) {}, function() {
            view.widget.SetEnabled(true);
            self._StartFlight(view, self.letterFlight/flight);
        });
        this._Fx(start, flight*0.5, function(k) {
            view.letter.color = new Color4(from.r + (74 - from.r)*k, from.g + (48 - from.g)*k, from.b + (34 - from.b)*k, 255);
        });
        this._Fx(start + flight, 0.01, function(k) {}, function() {
            self.Flash(aim.x, aim.y, 24, 90, 0, 0.22, { r: 255, g: 250, b: 236 });
            if (hud)
                hud.PunchStar();
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
                }, info);
            })(cells[i], i);
        }
    }

    // Ставит плашку на старт траектории (без полёта); visible — показать сразу
    _PlaceAtStart(view, fromX, fromY, toX, toY, visible)
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

        view.widget.SetEnabled(visible);
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
                var bombStyle = this.bombStyle;
                var bombCharge = WordFallFxView.BombCharge(bombStyle, this.bombCharge);
                (function(pu, pos, at) {
                    // фитиль: бомба раздувается и разгорается перед взрывом
                    if (bombStyle == 4)
                        self._Fx(at, 0.01, function(k) {}, function() { board.Shake(2.5, bombCharge); });
                    self._Fx(at, bombCharge, function(k) {
                        // качание мультяшной бомбы — частые пульсы поверх раздувания;
                        // радужная набирает заряд и на последних кадрах сжимается перед хлопком
                        var swing = bombStyle == 5 ? 0.45*Math.abs(Math.sin(k*Math.PI*4))*k : 0;
                        var charge = bombStyle == 2 ? (k < 0.8 ? Math.pow(k/0.8, 2) : 1 - 0.6*(k - 0.8)/0.2) : k*k;
                        board.SetBonusCharge(pu.c, pu.r, Math.min(1, charge + swing));
                    });

                    // буквы из зоны 3×3 улетают в бар в момент взрыва
                    var area = [];
                    var destroyed = result.destroyed || [];
                    for (var d = 0; d < destroyed.length; d++)
                        if (Math.abs(destroyed[d].c - pu.c) <= 1 && Math.abs(destroyed[d].r - pu.r) <= 1 && !(destroyed[d].c == pu.c && destroyed[d].r == pu.r))
                            area.push(destroyed[d]);
                    self._FlyFromCells(area, at + bombCharge);

                    self._Fx(at + bombCharge, 0.01, function(k) {}, function() {
                        // взрыв: вспышка, ударная волна, осколки и дым; зона 3×3 пустеет сразу
                        board.SetBonusCharge(pu.c, pu.r, 0);
                        board.HideTileVisual(pu.c, pu.r);
                        for (var d = 0; d < area.length; d++)
                            board.HideTileVisual(area[d].c, area[d].r);

                        if (bombStyle > 0)
                        {
                            self._BombBlast(bombStyle, pos, board);
                            return;
                        }
                        self.Flash(pos.x, pos.y, 60, 260, 0, 0.45);
                        board.Shake(self.bombShake, 0.42);
                        if (self._vfx)
                            self._vfx.PlayBombBlast(pos.x, pos.y); // огненная палитра без конфетти салюта
                    });
                })(pu, pos, time);

                time += bombCharge + 0.25;
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
                        var fireworksStyle = self.fireworksStyle;
                        self._Fx(at + self.rocketCharge, 0.01, function(k) {}, function() {
                            board.SetBonusCharge(pu.c, pu.r, 0);
                            board.HideTileVisual(pu.c, pu.r);
                            if (fireworksStyle > 0)
                            {
                                self._FireworksBurst(fireworksStyle, pos, board);
                                return;
                            }
                            self.Flash(pos.x, pos.y, 30, 130, 0, 0.3);
                            board.Shake(6, 0.28);
                            if (self._vfx)
                                self._vfx.PlayFireworkBurst(pos.x, pos.y);
                        });
                    }
                })(pu, pos, time);

                time += this.rocketCharge + (pu.kind == "fireworks" ? 0.12 : 0);

                var look = pu.kind == "rocket" ? this.rocketStyle : WordFallFxView.SalvoLook(this.fireworksStyle);
                var targets = pu.targets || [];
                var lastArrive = time;
                var destroyedByRockets = result.destroyed || [];
                var stagger = pu.kind == "fireworks" && this.fireworksStyle == 2 ? 0.09 : this.rocketStagger;
                for (var t = 0; t < targets.length; t++)
                {
                    var target = board.TileWorldPos(targets[t].c, targets[t].r);
                    var launchAt = time + t*stagger;
                    var flight = this.RocketFlightPlan(pos, target, look).duration;
                    this._LaunchRocket(pu, targets[t], pos, target, launchAt, look);
                    lastArrive = Math.max(lastArrive, launchAt + flight);
                    // сгоревшая буква улетает в бар в момент попадания
                    for (var d = 0; d < destroyedByRockets.length; d++)
                        if (destroyedByRockets[d].c == targets[t].c && destroyedByRockets[d].r == targets[t].r)
                            this._FlyFromCells([targets[t]], launchAt + flight);
                }
                time = lastArrive + 0.1;
            }
        }

        return time;
    }

    // Полёт ракеты-варианта «вертолётиком»: длительности взлёта и зависания, высота взлёта, рост к камере
    static get propeller() { return { lift: 0.24, hover: 0.12, height: 64, scale: 1.4, minFly: 0.36 }; }

    static EaseBack(k) { return 1 + 2.7*Math.pow(k - 1, 3) + 1.7*Math.pow(k - 1, 2); }
    static EaseInOut(k) { return k < 0.5 ? 2*k*k : 1 - 2*(1 - k)*(1 - k); }

    // Длительность полёта по дистанции: у исходной ракеты скорость постоянна и близкие цели получают крюк
    RocketFlightPlan(from, to, look)
    {
        var spec = WordFallFxView.RocketLook(look || 0);
        var dx = to.x - from.x, dy = to.y - from.y;
        var dist = Math.sqrt(dx*dx + dy*dy);
        if (spec)
        {
            var p = WordFallFxView.propeller;
            var speed = this.rocketSpeed*(spec.speed || 1);
            var fly = Math.max(p.minFly/(spec.speed || 1), Math.min(this.rocketMaxFlight, (dist + p.height)/speed));
            return { duration: p.lift + p.hover + fly, fly: fly, detour: 0, over: null };
        }
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

    // Полёт ракеты бонуса: траектория и салют на прилёте живут в прототипе FxRocket.
    // На взлёте плитка бонуса гаснет — летит тот же спрайт, без визуального разрыва
    _LaunchRocket(bonus, targetCell, from, to, delay, look)
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
        var spec = WordFallFxView.RocketLook(look || 0);
        var plan = this.RocketFlightPlan(from, to, look);

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

            self._DressRocket(view, spec);
            if (self._vfx && !spec)
                self._vfx.PlayRocketLaunch(from.x, from.y); // зажигание, пыль и угли
            if (self._vfx && spec)
            {
                self.Flash(from.x, from.y, 30, 110, 0, 0.25, { r: 255, g: 226, b: 160 });
                (spec.launch || []).forEach(function(name) { self._vfx.PlayStyle(name, from.x, from.y); });
                view.trails = (spec.trail || []).map(function(name) { return self._vfx.StartTrail(name, from.x, from.y); });
            }

            anim.Stop("flight");
            // вариант летит без клипа (его микшер каждый кадр пишет масштаб): ведёт _PropellerFlight
            anim.SetEnabled(!spec);
            if (spec)
            {
                trajectory.SetPoints(from.x, from.y, from.x, from.y);
                trajectory.SetPosition(0);
                var tr = view.widget.GetTransform();
                tr.SetScale2D(new Vec2(1, 1));
                tr.SetAngleDegrees(0);
                view.img.transparency = 1;
                view.aimed = false;
                view.widget.SetEnabled(true);
                return;
            }
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

        if (spec)
            this._PropellerFlight(view, from, to, plan, delay);

        if (plan.over)
        {
            this._Fx(delay + plan.duration*0.45, 0.01, function(k) {}, function() {
                var trajectory = view.widget.GetComponent("o2::FlightTrajectoryComponent");
                if (trajectory)
                    trajectory.SetPoints(from.x, from.y, to.x, to.y); // доводка на цель без рывка
            });
        }

        // шлейф варианта идёт за корпусом ракеты весь полёт
        if (spec && spec.trail)
        {
            this._Fx(delay, plan.duration, function(k) {
                var rect = view.widget.GetLayout().GetWorldRect();
                for (var i = 0; i < view.trails.length; i++)
                    self._vfx.MoveTrail(view.trails[i], (rect.left + rect.right)*0.5, (rect.bottom + rect.top)*0.5);
            }, function() {
                for (var i = 0; i < view.trails.length; i++)
                    self._vfx.StopTrail(view.trails[i]);
                view.trails = [];
            });
        }

        // попадание: клетка гаснет сразу, кольцо и вспышка (салют выпускают суб-треки)
        this._Fx(delay + plan.duration, 0.01, function(k) {}, function() {
            if (board)
                board.HideTileVisual(targetCell.c, targetCell.r);
            if (spec)
            {
                view.widget.GetTransform().SetScale2D(new Vec2(1.28, 0.76));
                self._RocketHit(spec, to, board);
                return;
            }
            self.Flash(to.x, to.y, 16, 70, 0, 0.22);
            board.Shake(3, 0.2);
            if (self._vfx)
                self._vfx.PlayRocketImpact(to.x, to.y);
        });

        // спрятать ракету, когда доиграло самое долгое в салюте — конфетти (0.1 + 1.0 с); вариант гаснет сразу
        this._Fx(delay + plan.duration + (spec ? 0.08 : 1.15), 0.01, function(k) {}, function() {
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

    static get starImage() { return "Generated/UI/Screen_Resources/Sprites/icon_rainbow_star.png"; }
    static get ringImage() { return "WordFall/Sprites/vfx_ring.png"; }
    static get boomImage() { return "WordFall/Sprites/vfx_boom.png"; }

    // Разгорание бомбы по варианту: волна копит заряд дольше, мультяшная бомба раскачивается
    static BombCharge(style, base)
    {
        return [base, 0.3, 0.36, 0.26, 0.45, 0.42][style] || base;
    }

    // Взрыв бомбы по варианту: 1 — тёплый взрыв, 2 — радужная звезда, 3 — хлопушка, 4 — ударная волна, 5 — мультяшный бум
    _BombBlast(style, pos, board)
    {
        var self = this;
        var play = function(names) { if (self._vfx) names.forEach(function(n) { self._vfx.PlayStyle(n, pos.x, pos.y); }); };
        switch (style)
        {
            case 1:
                this.Flash(pos.x, pos.y, 60, 240, 0, 0.35, { r: 255, g: 168, b: 80 });
                board.Shake(10, 0.4);
                play(["B1_Fire", "B1_Chips", "B1_Embers", "B1_Smoke", "BombRing"]);
                break;
            case 2:
                // хлопок: белая вспышка, звезда с перелётом, два кольца звёзд (быстрые дальше, медленные ближе),
                // блёстки; соседние плашки отталкивает волной
                this.Flash(pos.x, pos.y, 80, 300, 0, 0.22, { r: 255, g: 252, b: 240 });
                this.Flash(pos.x, pos.y, 60, 260, 0, 0.55, null, { image: WordFallFxView.starImage, hold: 0.35, ease: "back" });
                board.Shake(8, 0.26);
                board.Ripple(pos.x, pos.y, 320, 12, 1300);
                play(["B2_Stars", "B2_Stars2", "B2_Twinkle"]);
                break;
            case 3:
                this.Flash(pos.x, pos.y, 50, 200, 0, 0.3, { r: 255, g: 245, b: 220 });
                board.Shake(5, 0.3);
                board.Ripple(pos.x, pos.y, 270, 10, 1400);
                play(["B3_Confetti", "B3_Confetti2", "B3_Dust"]);
                break;
            case 4:
                this.Flash(pos.x, pos.y, 60, 260, 0, 0.3, { r: 255, g: 230, b: 170 });
                this.Flash(pos.x, pos.y, 60, 560, 0, 0.55, null, { image: WordFallFxView.ringImage, ease: true });
                this.Flash(pos.x, pos.y, 40, 380, 0.08, 0.45, null, { image: WordFallFxView.ringImage, ease: true });
                board.Shake(16, 0.5);
                board.Ripple(pos.x, pos.y, 540, 18, 1100);
                play(["B4_Sparks", "B4_Dust"]);
                break;
            case 5:
                this.Flash(pos.x, pos.y, 60, 340, 0, 0.42, null, { image: WordFallFxView.boomImage, hold: 0.55, ease: true });
                board.Shake(9, 0.35);
                board.Ripple(pos.x, pos.y, 230, 8, 1200);
                play(["B5_Puffs", "B5_Stars"]);
                break;
        }
    }

    // Разрыв фейерверка на своей клетке по варианту: 1 — золотая хризантема, 2 — радужный, 3 — звёздный дождь,
    // 4 — конфетти, 5 — кольца
    _FireworksBurst(style, pos, board)
    {
        var self = this;
        var play = function(names, delay) {
            if (!self._vfx)
                return;
            self._Fx(delay || 0, 0.01, function(k) {}, function() {
                names.forEach(function(n) { self._vfx.PlayStyle(n, pos.x, pos.y); });
            });
        };
        board.Shake(5, 0.28);
        switch (style)
        {
            case 1:
                this.Flash(pos.x, pos.y, 40, 300, 0, 0.4, { r: 255, g: 190, b: 100 });
                play(["F1_Burst", "F1_Glitter"]);
                break;
            case 2:
                // большая звезда с перелётом, радужный шар звёзд, внутри медленные звёзды и блёстки
                this.Flash(pos.x, pos.y, 80, 320, 0, 0.24, { r: 255, g: 252, b: 240 });
                this.Flash(pos.x, pos.y, 60, 330, 0, 0.6, null, { image: WordFallFxView.starImage, hold: 0.35, ease: "back" });
                board.Shake(7, 0.3);
                board.Ripple(pos.x, pos.y, 400, 12, 1200);
                play(["F2_Burst", "F2_Inner", "B2_Twinkle"]);
                break;
            case 3:
                this.Flash(pos.x, pos.y, 40, 230, 0, 0.4, { r: 255, g: 214, b: 130 });
                play(["F3_Willow"]);
                play(["F3_Crackle"], 0.35);
                break;
            case 4:
                this.Flash(pos.x, pos.y, 40, 200, 0, 0.3, { r: 255, g: 245, b: 220 });
                play(["F4_Confetti", "F4_Confetti2"]);
                break;
            case 5:
                this.Flash(pos.x, pos.y, 40, 220, 0, 0.3, { r: 255, g: 240, b: 200 });
                this.Flash(pos.x, pos.y, 40, 380, 0, 0.42, null, { image: WordFallFxView.ringImage, ease: true });
                this.Flash(pos.x, pos.y, 40, 560, 0.14, 0.48, null, { image: WordFallFxView.ringImage, ease: true });
                play(["F5_RingA"]);
                play(["F5_RingB"], 0.14);
                break;
        }
    }

    // Облик ракет залпа фейерверка по его варианту
    static SalvoLook(fireworksStyle)
    {
        return [0, 1, 2, 6, 3, 7][fireworksStyle] || 0;
    }

    // Облик ракеты: корпус, шлейф, старт, попадание, скорость; 0 — исходная ракета прототипа (null).
    // 1 — золотая комета, 2 — радужная звезда, 3 — хлопушка, 4 — реактивная, 5 — мультяшная,
    // 6 — падающая звезда, 7 — пунктир из блёсток
    static RocketLook(look)
    {
        switch (look)
        {
            case 1: return { trail: ["R1_Trail", "R1_TrailStar"], hit: ["R1_Hit"], glow: { r: 255, g: 200, b: 110 }, size: 140 };
            case 2: return { trail: ["R2_Trail"], launch: ["R2_Launch"], hit: ["R2_Hit"], image: WordFallFxView.starImage, size: 130, hold: 0.3, ease: "back", ripple: 8 };
            case 3: return { trail: ["R3_Trail"], hit: ["R3_Hit"], glow: { r: 255, g: 240, b: 210 }, size: 110 };
            case 4: return { trail: ["R4_Trail"], launch: ["R4_Launch"], hit: ["R4_Hit"], glow: { r: 255, g: 252, b: 240 }, size: 150, speed: 1.6, ripple: true };
            case 5: return { trail: ["R5_Trail"], hit: ["R5_Hit"], image: WordFallFxView.boomImage, size: 150, hold: 0.5 };
            case 6: return { trail: ["R6_Trail"], hit: ["R6_Hit"], glow: { r: 255, g: 210, b: 120 }, size: 100 };
            case 7: return { trail: ["R7_Trail"], hit: ["R7_Hit"], glow: { r: 255, g: 245, b: 220 }, size: 100 };
        }
        return null;
    }

    // Позицию каждый кадр пишет траектория: до дуги её концы сведены в точку (угол она не трогает),
    // а позиция не опускается к нулю — там она перебрасывает случайное смещение дуги
    _PropellerFlight(view, from, to, plan, delay)
    {
        var P = WordFallFxView.propeller;
        var lift = { x: from.x, y: from.y + P.height };
        this._Fx(delay, plan.duration, function(k) {
            var t = k*plan.duration;
            var tr = view.widget.GetTransform();
            var trajectory = view.widget.GetComponent("o2::FlightTrajectoryComponent");
            if (!trajectory)
                return;
            if (view.flame)
                view.flame.transparency = 0.6 + 0.4*Math.abs(Math.sin(t*46));

            if (t < P.lift)
            {
                // взлёт: подъём с замедлением, рост с перелётом, затухающее покачивание
                var u = t/P.lift;
                var rise = 1 - Math.pow(1 - u, 3);
                var size = 1 + (P.scale - 1)*WordFallFxView.EaseBack(u);
                trajectory.SetPoints(from.x, from.y + P.height*rise, from.x, from.y + P.height*rise);
                trajectory.SetPosition(0);
                tr.SetScale2D(new Vec2(size, size));
                tr.SetAngleDegrees(Math.sin(t*38)*7*(1 - u));
                return;
            }

            if (!view.aimed)
            {
                // начало дуги: её касательная — куда развернуться в зависании
                trajectory.SetPoints(lift.x, lift.y, to.x, to.y);
                trajectory.ResetRandomOffset();
                trajectory.SetPosition(0.02);
                var a = tr.GetAngleDegrees();
                view.startAngle = ((a + 540) % 360) - 180;
                view.aimed = true;
            }

            if (t < P.lift + P.hover)
            {
                var u = (t - P.lift)/P.hover;
                var bob = lift.y + Math.sin(u*Math.PI)*4;
                trajectory.SetPoints(lift.x, bob, lift.x, bob);
                trajectory.SetPosition(0.02);
                tr.SetScale2D(new Vec2(P.scale, P.scale));
                tr.SetAngleDegrees(view.startAngle*WordFallFxView.EaseInOut(u));
                return;
            }

            // дуга: разгон и торможение; ближе к клетке ракета «опускается» к полю
            var u = Math.min(1, (t - P.lift - P.hover)/plan.fly);
            trajectory.SetPoints(lift.x, lift.y, to.x, to.y);
            trajectory.SetPosition(Math.max(0.002, WordFallFxView.EaseInOut(u)));
            var size = u < 0.65 ? P.scale : P.scale + (1 - P.scale)*(u - 0.65)/0.35;
            tr.SetScale2D(new Vec2(size, size));
        }, function() {
            view.aimed = false;
            var trajectory = view.widget.GetComponent("o2::FlightTrajectoryComponent");
            if (trajectory)
            {
                trajectory.SetPoints(lift.x, lift.y, to.x, to.y);
                trajectory.SetPosition(1);
            }
        });
    }

    // Ракета прототипа со своим шлейфом и салютом — только в исходном облике; у вариантов их место занимают эмиттеры Vfx
    _DressRocket(view, spec)
    {
        // их эмиттеры ведут суб-треки клипа полёта и выключенный актор не останавливает: молчат по лимиту частиц
        var own = !spec;
        var children = ["Smoke", "Sparks", "BurstFlash", "BurstPink", "BurstYellow", "BurstBlue", "Confetti", "Glitter"];
        view.limits = view.limits || {};
        for (var i = 0; i < children.length; i++)
        {
            var child = view.widget.GetChild(children[i]);
            var emitter = child ? child.GetComponent("o2::ParticlesEmitterComponent") : null;
            if (!child || !emitter)
                continue;
            if (view.limits[children[i]] === undefined)
                view.limits[children[i]] = emitter.GetMaxParticles();
            emitter.SetMaxParticles(own ? view.limits[children[i]] : 0);
            child.SetEnabled(own);
        }

        var image = spec && spec.body ? spec.body : view.image;
        var drawable = view.img.drawable;
        if (drawable.imageName != image)
        {
            var rect = drawable.rect;
            drawable.imageName = image;
            drawable.rect = rect;
        }
        if (view.flame)
            view.flame.SetEnabled(!(spec && spec.body));
    }

    _RocketHit(spec, to, board)
    {
        var self = this;
        if (spec.image)
            this.Flash(to.x, to.y, 30, spec.size, 0, 0.36, null, { image: spec.image, hold: spec.hold || 0.3, ease: spec.ease || true });
        else
            this.Flash(to.x, to.y, 20, spec.size, 0, 0.26, spec.glow);
        board.Shake(3, 0.2);
        if (spec.ripple)
            board.Ripple(to.x, to.y, 240, spec.ripple === true ? 12 : spec.ripple, 1500);
        if (this._vfx)
            (spec.hit || []).forEach(function(n) { self._vfx.PlayStyle(n, to.x, to.y); });
    }

    // color — тёплое свечение полёта букв (мягкий спрайт vfx_glow), без него — вспышка бонусов.
    // opts.image — вспышка картинкой (звезда, кольцо волны, «бум»), opts.hold — доля времени до затухания,
    // opts.ease — быстрый разлёт с замедлением, "back" — с перелётом
    Flash(x, y, fromSize, toSize, delay, dur, color, opts)
    {
        var self = this;
        var flash = this._flashes[this._flashNext % this._flashes.length];
        this._flashNext++;
        var image = opts && opts.image ? opts.image : color ? "WordFall/Sprites/vfx_glow.png" : "WordFall/Sprites/ui_fx_flash.png";
        var hold = opts && opts.hold ? opts.hold : 0;
        var ease = opts && opts.ease;

        this._Fx(delay, dur, function(k) {
            if (flash.look !== image)
            {
                var drawable = flash.img.drawable;
                var rect = drawable.rect;
                drawable.imageName = image;
                drawable.rect = rect;
                flash.look = image;
            }
            flash.img.drawable.color = color ? new Color4(color.r, color.g, color.b, 255) : new Color4(255, 255, 255, 255);
            flash.widget.SetEnabled(true);
            flash.img.transparency = k < hold ? 1 : 1 - (k - hold)/(1 - hold);
            // "back" — перелёт за конечный размер и возврат: хлопок, а не надувание
            var grow = ease == "back" ? 1 + 2.7*Math.pow(k - 1, 3) + 1.7*Math.pow(k - 1, 2) : ease ? 1 - (1 - k)*(1 - k)*(1 - k) : k;
            self._SetRect(flash.widget, x, y, fromSize + (toSize - fromSize)*grow);
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
        this._total.GetTransform().SetScale2D(new Vec2(1, 1));

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
        {
            hud.SnapScore();
            hud.StopPunch();
        }

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
