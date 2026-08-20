// Вьюха панели слова: слоты-плитки набираемого слова в лотке, перелёт буквы
// с поля по безье, кнопки ПРИНЯТЬ и сброс, всплывающее «+N».
// Слоты — в локальных координатах WordBar (центр = (0,0)), флаеры — в Screen
// (экранные координаты)

WordFallWordPanelView = class WordFallWordPanelView extends o2.Component
{
    constructor()
    {
        super();
        this.flightDuration = 0.38; // время перелёта буквы, с
        this.arcHeight = 110;       // высота дуги перелёта
        this.slotSize = 64;
        this.slotGap = 6;
        this.trayCenterX = 0;       // центр зоны плашек (локально в лотке)
        this.trayWidth = 470;       // ширина зоны плашек в лотке
        this.trayWorldX = -96;      // центр лотка в экранных координатах — для флаеров
        this.barWorldY = 331;
        this.tileSize = 88;         // стартовый размер летящей буквы

        this.slotSlideSpeed = 14; // скорость плавного сдвига слотов, 1/с

        this._svc = null;
        this._slots = [];
        this._flyers = [];
        this._flights = [];
        this._gainTimer = 0;
        this._lastRevision = -1;
    }

    OnStart()
    {
        globalThis.WordFallViews = globalThis.WordFallViews || {};
        WordFallViews.wordPanel = this;

        this._svc = this.serviceActor.GetComponent("WordFallGameService");

        var self = this;
        for (var i = 0; i < 8; i++)
        {
            var slot = this._actor.GetChild("Tray/Slot" + i);
            this._slots.push({
                widget: slot,
                letter: slot.GetLayer("letter").drawable,
                points: slot.GetLayer("points").drawable,
                x: 0,
                targetX: 0,
                placed: false
            });

            // клик по слоту снимает выбор с этой буквы и хвоста — буквы возвращаются на поле
            (function(index) {
                slot.onClick = function() { self.OnSlotClick(index); };
            })(i);
        }

        // флаеры живут в Screen (сиблинг WordBar)
        for (var i = 0; i < 4; i++)
        {
            var flyer = this._actor.GetChild("../Flyer" + i);
            this._flyers.push({
                widget: flyer,
                letter: flyer.GetLayer("letter").drawable,
                points: flyer.GetLayer("points").drawable,
                busy: false
            });
        }

        this._gainLabel = this._actor.GetChild("Tray/GainLabel");
        this._actor.GetChild("AcceptBtn/Btn").onClick = function() { self.OnAccept(); };
        this._actor.GetChild("ClearBtn/Btn").onClick = function() { self.OnClear(); };
    }

    _SlotPos(index, count)
    {
        // длинное слово ужимается, чтобы не вылезать из лотка
        var step = this.slotSize + this.slotGap;
        if (count > 1)
            step = Math.min(step, (this.trayWidth - this.slotSize)/(count - 1));
        var total = step*(count - 1) + this.slotSize;
        return new Vec2(this.trayCenterX - total*0.5 + this.slotSize*0.5 + index*step, 0);
    }

    _SetRect(widget, x, y, size)
    {
        var half = size*0.5;
        var layout = widget.GetLayout();
        layout.SetOffsetMin(new Vec2(x - half, y - half));
        layout.SetOffsetMax(new Vec2(x + half, y + half));
    }

    _FillLetterView(view, tile)
    {
        view.letter.text = tile.joker ? "?" : tile.letter;
        view.points.text = tile.joker ? "" : ("" + tile.value);
    }

    OnSlotClick(index)
    {
        var selected = this._svc.GetSelection();
        if (index >= selected.length)
            return;

        this._svc.ToggleSelect(selected[index].c, selected[index].r);
    }

    // Board сообщает о добавленной букве — запускаем перелёт
    OnLetterPicked(c, r, slotIndex, worldPos)
    {
        var flyer = null;
        for (var i = 0; i < this._flyers.length; i++)
        {
            if (!this._flyers[i].busy)
            {
                flyer = this._flyers[i];
                break;
            }
        }
        if (!flyer)
            return; // все флаеры заняты — слот просто появится

        this._FillLetterView(flyer, this._svc.GetTile(c, r));
        flyer.letter.color = new Color4(74, 48, 34, 255);
        flyer.busy = true;
        flyer.widget.SetEnabled(true);
        this._SetRect(flyer.widget, worldPos.x, worldPos.y, this.tileSize);

        this._flights.push({ flyer: flyer, slot: slotIndex, t: 0, from: worldPos });
    }

    SetGainText(text)
    {
        this._gainLabel.SetText(text);
    }

    OnAccept()
    {
        var svc = this._svc;
        var board = WordFallViews.board;
        var fx = WordFallViews.fx;

        // добить предыдущую последовательность, пока модель со старым счётом
        if (fx)
            fx.Finish();

        // буквы и позиции слотов лотка — для полёта в прогресс-бар
        var slots = [];
        var selected = svc.GetSelection();
        var count = selected.length;
        for (var i = 0; i < count; i++)
        {
            var tile = svc.GetTile(selected[i].c, selected[i].r);
            var pos = this._SlotPos(i, count);
            slots.push({ letter: tile.joker ? "?" : tile.letter,
                         value: tile.joker ? 0 : tile.value,
                         x: this.trayWorldX + pos.x, y: this.barWorldY });
        }

        var result = svc.AcceptWord();
        if (!result.ok)
        {
            if (result.reason == "invalid")
                this._flashTimer = 0.7;
            this.SyncSlots();
            return;
        }

        this._CancelFlights();

        // слоты пустеют сразу — их буквы подхватывает секвенсор
        for (var i = 0; i < this._slots.length; i++)
            this._slots[i].widget.SetEnabled(false);

        if (board)
            board.HoldCollapse(result);
        if (fx)
            fx.PlayAccept(slots, result);
        else if (board)
            board.ApplyPendingCollapse();
    }

    OnClear()
    {
        this._svc.ClearSelection();
        this._CancelFlights();
        var boosters = WordFallViews.boosters;
        if (boosters)
            boosters.CancelAimMode();
    }

    SyncSlots()
    {
        var svc = this._svc;
        var selected = svc.GetSelection();
        var valid = svc.IsCurrentWordValid();
        var count = selected.length;

        var letterColor = this._flashTimer > 0 ? new Color4(200, 60, 40, 255)
                        : valid ? new Color4(56, 142, 60, 255) : new Color4(74, 48, 34, 255);

        for (var i = 0; i < this._slots.length; i++)
        {
            var slot = this._slots[i];
            if (i >= count)
            {
                slot.widget.SetEnabled(false);
                slot.placed = false;
                continue;
            }

            this._FillLetterView(slot, svc.GetTile(selected[i].c, selected[i].r));
            slot.letter.color = letterColor;

            // ранее стоявшие слоты съезжают на новые места плавно (в Update),
            // впервые появившийся — сразу на своём месте
            var pos = this._SlotPos(i, count);
            slot.targetX = pos.x;
            if (!slot.placed)
            {
                slot.placed = true;
                slot.x = pos.x;
                this._SetRect(slot.widget, slot.x, 0, this.slotSize);
            }

            // пока буква летит в этот слот — слот скрыт
            var flying = false;
            for (var f = 0; f < this._flights.length; f++)
            {
                if (this._flights[f].slot == i)
                    flying = true;
            }
            slot.widget.SetEnabled(!flying);
        }
    }

    _FinishFlight(flight)
    {
        flight.flyer.busy = false;
        flight.flyer.widget.SetEnabled(false);
    }

    _CancelFlights()
    {
        for (var i = 0; i < this._flights.length; i++)
            this._FinishFlight(this._flights[i]);
        this._flights = [];
    }

    _UpdateFlights(dt)
    {
        if (this._flights.length == 0)
            return;

        var count = this._svc.GetSelection().length;
        var alive = [];
        for (var i = 0; i < this._flights.length; i++)
        {
            var f = this._flights[i];
            f.t += dt/this.flightDuration;

            // буква снята с выбора, пока летела — гасим перелёт
            if (f.slot >= count)
            {
                this._FinishFlight(f);
                continue;
            }

            var toLocal = this._SlotPos(f.slot, count);
            var to = new Vec2(this.trayWorldX + toLocal.x, this.barWorldY);
            var t = Math.min(f.t, 1);
            var e = t*t*(3 - 2*t); // smoothstep

            // квадратичное безье: контрольная точка выше и сбоку от середины
            var cx = (f.from.x + to.x)*0.5 + (to.x - f.from.x)*0.18;
            var cy = Math.max(f.from.y, to.y) + this.arcHeight;
            var inv = 1 - e;
            var x = inv*inv*f.from.x + 2*inv*e*cx + e*e*to.x;
            var y = inv*inv*f.from.y + 2*inv*e*cy + e*e*to.y;

            // размер: от плитки к слоту, с лёгким «вспуханием» по дороге
            var size = this.tileSize + (this.slotSize - this.tileSize)*e + 10*Math.sin(Math.PI*e);
            this._SetRect(f.flyer.widget, x, y, size);

            if (f.t >= 1)
                this._FinishFlight(f);
            else
                alive.push(f);
        }

        var landed = alive.length != this._flights.length;
        this._flights = alive;
        if (landed)
            this.SyncSlots(); // открыть слоты приземлившихся букв
    }

    Update(dt)
    {
        if (!this._svc)
            return;

        this._UpdateFlights(dt);

        // плавный сдвиг слотов к целевым местам
        for (var i = 0; i < this._slots.length; i++)
        {
            var slot = this._slots[i];
            if (!slot.placed || Math.abs(slot.targetX - slot.x) < 0.5)
                continue;

            slot.x += (slot.targetX - slot.x)*Math.min(1, this.slotSlideSpeed*dt);
            this._SetRect(slot.widget, slot.x, 0, this.slotSize);
        }

        var revision = this._svc.GetRevision();
        if (revision != this._lastRevision)
        {
            this._lastRevision = revision;
            this.SyncSlots();
        }

        if (this._gainTimer > 0)
        {
            this._gainTimer -= dt;
            if (this._gainTimer <= 0)
                this._gainLabel.SetText("");
        }

        if (this._flashTimer > 0)
        {
            this._flashTimer -= dt;
            if (this._flashTimer <= 0)
                this.SyncSlots();
        }
    }
};
