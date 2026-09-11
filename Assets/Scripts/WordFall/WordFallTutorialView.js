// Туториал: серия шагов с плашкой текста и рукой-указателем. Базовая механика ведётся
// по действиям игрока (выбор букв → принятие слова), бустеры и элементы поля показываются
// при первом появлении. Показанные ключи хранит прогресс игрока

WordFallTutorialView = class WordFallTutorialView extends o2.Component
{
    constructor()
    {
        super();
        this._svc = null;
        this._queue = [];      // шаги текущего показа
        this._step = null;
        this._time = 0;
        this._levelIndex = -1;
        this._revision = -1;
        this._startMoves = 0;
        this._pendingCheck = 0;
    }

    OnStart()
    {
        globalThis.WordFallViews = globalThis.WordFallViews || {};
        WordFallViews.tutorial = this;

        var self = this;
        this._svc = this.serviceActor.GetComponent("WordFallGameService");
        this._dim = this._actor.GetChild("Dim");
        this._pieces = [];
        this._glows = [];
        for (var i = 0; i < 48; i++)
        {
            var piece = this._dim.GetChild("Piece" + i);
            if (!piece)
                break;
            piece.onClick = function() { self.OnTap(); };
            this._pieces.push(piece);
        }
        for (var i = 0; i < 8; i++)
        {
            var glow = this._dim.GetChild("Glow" + i);
            if (!glow)
                break;
            this._glows.push(glow);
        }
        this._caption = this._actor.GetChild("Caption");
        this._text = this._actor.GetChild("Caption/Text");
        this._shadow = this._actor.GetChild("Caption/Shadow");
        this._tap = this._actor.GetChild("Caption/Tap");
        this._hand = this._actor.GetChild("Hand");

        this._Hide();
    }

    IsActive() { return this._step != null; }

    // После сброса туториалов — показать заново с текущего уровня
    Restart()
    {
        this._levelIndex = -1;
        this._pendingCheck = 0.1;
    }

    _SetRect(widget, x, y, w, h)
    {
        var layout = widget.GetLayout();
        layout.SetOffsetMin(new Vec2(x - w*0.5, y - h*0.5));
        layout.SetOffsetMax(new Vec2(x + w*0.5, y + h*0.5));
    }

    // Следующая ненабранная буква слова-задания (в порядке слова)
    _NextSeededCell(step)
    {
        var selection = this._svc.GetSelection();
        for (var i = 0; i < step.seeded.length; i++)
        {
            var cell = step.seeded[i];
            var taken = false;
            for (var s = 0; s < selection.length; s++)
                if (selection[s].c == cell.c && selection[s].r == cell.r)
                    taken = true;
            if (!taken)
                return { cell: cell, index: i };
        }
        return null;
    }

    // Вырезы затемнения для шага: клетки цели, кнопка ✓ или ряд бустеров (мировые прямоугольники)
    _HolesFor(step)
    {
        var board = WordFallViews.board;
        var holes = [];
        var cell = function(c, r) {
            var p = board.TileWorldPos(c, r);
            return { x: p.x - 50, y: p.y - 50, w: 100, h: 100 };
        };
        if (step.seeded && board)
        {
            var next = this._NextSeededCell(step);
            if (next)
                holes.push(cell(next.cell.c, next.cell.r));
        }
        else if (step.cells && board)
            for (var i = 0; i < step.cells.length && i < 6; i++)
                holes.push(cell(step.cells[i].c, step.cells[i].r));
        else if (step.cell && board)
            holes.push(cell(step.cell.c, step.cell.r));
        if (step.target == "accept")
            holes.push({ x: 170, y: 279, w: 104, h: 104 }); // кнопка ✓ панели слова
        if (step.target == "boosters")
            holes.push({ x: -340, y: -660, w: 680, h: 130 });
        return holes;
    }

    // Затемнение полосами: экран режется горизонтальными полосами по границам вырезов,
    // в каждой полосе смежные тёмные ячейки склеиваются в один прямоугольник — кусков
    // хватает даже на шесть вырезов. Тап по затемнению ведёт дальше; на пояснительных
    // шагах сверху лежит прозрачный кусок во весь экран, чтобы вырез не пропускал клики
    _ShowDim(holes, blockAll)
    {
        var W = 800, H = 1440; // с запасом шире экрана 768×1376
        var xs = [-W/2, W/2], ys = [-H/2, H/2];
        for (var i = 0; i < holes.length; i++)
        {
            var h = holes[i];
            xs.push(h.x); xs.push(h.x + h.w);
            ys.push(h.y); ys.push(h.y + h.h);
        }
        xs.sort(function(a, b) { return a - b; });
        ys.sort(function(a, b) { return a - b; });

        var used = 0;
        var self = this;
        var place = function(x0, y0, x1, y1, transparency) {
            if (used >= self._pieces.length || x1 - x0 < 0.5 || y1 - y0 < 0.5)
                return;
            var piece = self._pieces[used++];
            var layout = piece.GetLayout();
            layout.SetOffsetMin(new Vec2(x0, y0));
            layout.SetOffsetMax(new Vec2(x1, y1));
            piece.SetTransparency(transparency);
            piece.SetEnabled(true);
        };

        for (var j = 0; j + 1 < ys.length; j++)
        {
            var y0 = ys[j], y1 = ys[j + 1];
            if (y1 - y0 < 0.5)
                continue;
            var cy = (y0 + y1)*0.5;
            var runStart = null;
            for (var i = 0; i + 1 < xs.length; i++)
            {
                var x0 = xs[i], x1 = xs[i + 1];
                if (x1 - x0 < 0.5)
                    continue;
                var cx = (x0 + x1)*0.5;
                var inHole = false;
                for (var k = 0; k < holes.length; k++)
                {
                    var h = holes[k];
                    if (cx > h.x && cx < h.x + h.w && cy > h.y && cy < h.y + h.h)
                    {
                        inHole = true;
                        break;
                    }
                }
                if (inHole)
                {
                    if (runStart != null)
                    {
                        place(runStart, y0, x0, y1, 150/255);
                        runStart = null;
                    }
                }
                else if (runStart == null)
                    runStart = x0;
            }
            if (runStart != null)
                place(runStart, y0, xs[xs.length - 1], y1, 150/255);
        }

        if (blockAll)
            place(-W/2, -H/2, W/2, H/2, 0.0);

        for (var i = used; i < this._pieces.length; i++)
            this._pieces[i].SetEnabled(false);

        for (var i = 0; i < this._glows.length; i++)
        {
            var glow = this._glows[i];
            if (i < holes.length)
            {
                var h = holes[i];
                this._SetRect(glow, h.x + h.w*0.5, h.y + h.h*0.5, h.w + 26, h.h + 26);
                glow.SetEnabled(true);
            }
            else
                glow.SetEnabled(false);
        }
        this._dim.SetEnabled(true);
    }

    _Hide()
    {
        this._step = null;
        this._dim.SetEnabled(false);
        this._caption.SetEnabled(false);
        this._hand.SetEnabled(false);
    }

    // Клетки поля с нужным элементом (не больше limit)
    _FindCells(pred, limit)
    {
        var svc = this._svc;
        var cells = [];
        for (var r = svc.GetRows() - 1; r >= 0; r--)
            for (var c = 0; c < svc.GetColumns(); c++)
                if (cells.length < limit && pred(svc.GetTile(c, r)))
                    cells.push({ c: c, r: r });
        return cells;
    }

    // Первая клетка поля с нужным элементом
    _FindCell(pred)
    {
        var svc = this._svc;
        for (var r = svc.GetRows() - 1; r >= 0; r--)
            for (var c = 0; c < svc.GetColumns(); c++)
                if (pred(svc.GetTile(c, r)))
                    return { c: c, r: r };
        return null;
    }

    // Шаги для уровня: базовая механика, бустеры, элементы при первом появлении
    _StepsForLevel()
    {
        var svc = this._svc;
        var steps = [];
        var seeded = svc.GetSeededCells();
        if (!svc.IsTutorialSeen("basics") && seeded.length > 0)
        {
            var word = "";
            for (var i = 0; i < seeded.length; i++)
                word += svc.GetTile(seeded[i].c, seeded[i].r).letter;
            // указание идёт за набором: подсвечена и подписана следующая нужная буква
            steps.push({ key: "basics", block: false, seeded: seeded, word: word,
                         text: "Собирай слова из букв на поле.\nНажми буквы слова «" + word + "»",
                         until: function() { return svc.GetSelection().length >= seeded.length; } });
            steps.push({ key: "basics", block: false, target: "accept",
                         text: "Слово готово!\nНажми ✓, чтобы принять",
                         until: function(view) { return svc.GetMovesLeft() < view._startMoves; } });
            steps.push({ key: "basics", block: true,
                         text: "Буквы улетают в шкалу очков.\nЗаполни её и закрой задачи — ходы ограничены" });
        }
        if (!svc.IsTutorialSeen("boosters") && svc.GetLevelIndex() >= 1)
            steps.push({ key: "boosters", block: true, target: "boosters",
                         text: "Бустеры: молоток, перемешать, подсказка,\nджокер — любая буква, ×2 — удвоить номинал" });

        var elements = [
            { key: "ice", pred: function(t) { return t.ice > 0; }, text: "Лёд: буква видна, но не выбирается.\nРазбей словом по соседству" },
            { key: "stone", pred: function(t) { return t.stone > 0; }, text: "Камень ломают только бонусы:\nбомба, ракета, фейерверк" },
            { key: "bonus", pred: function(t) { return t.powerup != ""; }, text: "Бонус срабатывает от слова по соседству.\nДлинные слова дают новые бонусы" },
            { key: "crate", pred: function(t) { return t.crate > 0; }, text: "Ящик падает вместе с буквами.\nСлово рядом снимает прочность" },
            { key: "chain", pred: function(t) { return t.chained; }, text: "Цепь держит букву и всё над ней.\nИспользуй её в слове — цепь спадёт" },
            { key: "snow", pred: function(t) { return t.snow; }, text: "Снежки сыплются сверху.\nСлово по соседству их растапливает" },
            { key: "parcel", pred: function(t) { return t.parcel; }, text: "Конверт нужно спустить вниз:\nубирай буквы под ним" }
        ];
        for (var e = 0; e < elements.length; e++)
        {
            if (svc.IsTutorialSeen(elements[e].key))
                continue;
            var cells = this._FindCells(elements[e].pred, 6);
            if (cells.length > 0)
                steps.push({ key: elements[e].key, block: true, cell: cells[0], cells: cells, text: elements[e].text });
        }
        return steps;
    }

    // Текст шага: на наборе слова подсказка ведёт по буквам
    _TextFor(step)
    {
        if (!step.seeded)
            return step.text;

        var next = this._NextSeededCell(step);
        if (!next)
            return "Слово «" + step.word + "» собрано!";
        if (next.index == 0)
            return "Собирай слова из букв на поле.\nНажми букву «" + step.word[0] + "» слова «" + step.word + "»";
        return "Теперь букву «" + step.word[next.index] + "»";
    }

    _Begin(steps)
    {
        this._queue = steps;
        this._startMoves = this._svc.GetMovesLeft();
        this._Next();
    }

    _Next()
    {
        if (this._queue.length == 0)
        {
            this._Hide();
            return;
        }
        var step = this._queue.shift();
        this._step = step;
        this._time = 0;
        this._svc.MarkTutorialSeen(step.key);

        // на пояснительных шагах перекрыт весь экран (в том числе вырез): случайный
        // тап по подсвеченному бустеру не должен ломать обучение
        this._selected = -1;
        var holes = this._HolesFor(step);
        this._ShowDim(holes, step.block);
        this._caption.SetEnabled(true);
        this._text.SetText(this._TextFor(step));
        this._shadow.SetText(this._TextFor(step));
        this._tap.SetEnabled(step.block);
        this._SetRect(this._caption, 0, this._CaptionY(holes), 700, 148);
        this._UpdateHand();
    }

    // Подпись не ложится на HUD и не накрывает вырезы: если подсвеченное выше центра —
    // текст внизу над бустерами, иначе — под панелью слова
    _CaptionY(holes)
    {
        if (holes.length == 0)
            return 0;
        // подпись живёт в поле: HUD, задачи и лоток слова заняты. Из двух полос выбирается
        // та, что меньше перекрывает подсвеченное
        var bands = [150, -400, -120];
        var best = bands[0], bestOverlap = 1e9;
        for (var b = 0; b < bands.length; b++)
        {
            var y0 = bands[b] - 74, y1 = bands[b] + 74, overlap = 0;
            for (var i = 0; i < holes.length; i++)
            {
                var h = holes[i];
                overlap += Math.max(0, Math.min(y1, h.y + h.h) - Math.max(y0, h.y))*h.w;
            }
            if (overlap < bestOverlap - 1)
            {
                bestOverlap = overlap;
                best = bands[b];
            }
        }
        return best;
    }

    _TargetPos(step)
    {
        var board = WordFallViews.board;
        if (step.seeded && board)
        {
            var next = this._NextSeededCell(step);
            return next ? board.TileWorldPos(next.cell.c, next.cell.r) : null;
        }
        if (step.cell && board)
            return board.TileWorldPos(step.cell.c, step.cell.r);
        if (step.target == "accept")
            return { x: 156, y: 328 };   // кнопка ✓ в панели слова
        if (step.target == "boosters")
            return { x: 0, y: -600 };    // ряд бустеров
        return null;
    }

    _UpdateHand()
    {
        var step = this._step;
        var pos = step ? this._TargetPos(step) : null;
        this._hand.SetEnabled(pos != null);
        if (!pos)
            return;
        var bob = Math.sin(this._time*6)*8;
        // кончик пальца — в левом верхнем углу спрайта: сдвигаем руку вправо-вниз от цели
        this._SetRect(this._hand, pos.x + 34 + bob*0.3, pos.y - 40 - bob, 96, 96);
    }

    OnTap()
    {
        if (this._step && this._step.block)
            this._Next();
    }

    Update(dt)
    {
        if (!this._svc)
            return;

        // новый уровень (или сброс): подобрать шаги после того, как поле синхронизировалось
        var index = this._svc.GetLevelIndex();
        if (index != this._levelIndex)
        {
            this._levelIndex = index;
            this._Hide();
            this._pendingCheck = 0.6;
        }
        if (this._pendingCheck > 0)
        {
            this._pendingCheck -= dt;
            if (this._pendingCheck <= 0 && this._svc.GetGameState() == "playing")
            {
                var steps = this._StepsForLevel();
                if (steps.length > 0)
                    this._Begin(steps);
            }
        }

        if (!this._step)
            return;

        // финал уровня: обучение уступает попапу
        if (this._svc.GetGameState() != "playing")
        {
            this._queue = [];
            this._Hide();
            return;
        }

        // шаг с набором слова: указание переезжает на следующую букву по мере набора
        if (this._step.seeded)
        {
            var selected = this._svc.GetSelection().length;
            if (selected != this._selected)
            {
                this._selected = selected;
                var holes = this._HolesFor(this._step);
                this._ShowDim(holes, this._step.block);
                this._text.SetText(this._TextFor(this._step));
                this._shadow.SetText(this._TextFor(this._step));
                this._SetRect(this._caption, 0, this._CaptionY(holes), 700, 148);
            }
        }

        this._time += dt;
        this._UpdateHand();
        var pulse = 0.35 + 0.25*Math.sin(this._time*4);
        for (var i = 0; i < this._glows.length; i++)
            if (this._glows[i].IsEnabled())
                this._glows[i].SetTransparency(pulse);
        if (this._step.until && this._step.until(this))
            this._Next();
    }
};
