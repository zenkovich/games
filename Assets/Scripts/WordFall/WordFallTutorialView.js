globalThis.WordFallGame = globalThis.WordFallGame || {};

// Туториал: серия шагов с плашкой текста и рукой-указателем. Базовая механика ведётся
// по действиям игрока (выбор букв → принятие слова), бустеры и элементы поля показываются
// при первом появлении. Показанные ключи хранит прогресс игрока.
// Вся анимация — в прототипе (Screen/Tutorial в GameScreen.proto): затемнение, плашка и рука проявляются своими
// состояниями visible, плашка выскакивает клипом appear, кайма выреза дышит (pulse) и сходится на новый вырез
// (focus), рука нажимает (tap). Скрипт только раскладывает куски по вырезам и запускает клипы

WordFallTutorialView = class WordFallTutorialView extends o2.Component
{
    get _svc() { return WordFallGame.service; }

    constructor()
    {
        super();
        this.dimAlpha = 0.74;          // плотность затемнения (куски и скруглённые углы вырезов)
        this.dimReach = 3000;          // затемнение от центра экрана во все стороны — с запасом за край любого телефона
        this.cellPad = 10;             // поле выреза вокруг клетки, если рядом нет другого выреза
        this.buttonPad = 10;           // поле выреза вокруг кнопки ✓
        this.boostersPad = 6;          // поле выреза вокруг ряда бустеров
        this.goalsPad = 8;             // поле вырезов вокруг шкалы очков с задачами и вокруг ходов
        this.glowMargin = 20;          // кайма выходит за вырез на столько: линия tutorial_glow.png — в 20 px от его края
        this.captionWidth = 780;
        this.captionPadding = 30;      // от края плашки до текста по вертикали
        this.captionLineHeight = 44;
        this.captionAbove = 120;       // сова над плашкой
        this.captionBelow = 64;        // «нажми, чтобы продолжить» под плашкой
        this.captionCenters = [20, -300, -560]; // где может стоять плашка (центр по высоте): верх, середина, низ поля
        this.captionCenter = -140;     // плашка шага без выреза
        this.captionGap = 16;          // от плашки до каймы выреза и руки
        this.handSize = 112;
        this.handTipX = 0.17;          // кончик пальца в спрайте руки (доли размера, от левого нижнего угла)
        this.handTipY = 0.95;
        this.appearState = "appear";   // клипы AnimationComponent плашки и каймы
        this.focusState = "focus";

        this._queue = [];      // шаги текущего показа
        this._step = null;
        this._levelIndex = -1;
        this._revision = -1;
        this._startMoves = 0;
        this._pendingCheck = 0;
        this._holesKey = "";
    }

    OnStart()
    {
        globalThis.WordFallViews = globalThis.WordFallViews || {};
        WordFallViews.tutorial = this;

        var self = this;
        this._dim = this._actor.GetChild("Dim");
        this._pieces = this._Numbered(this._dim, "Piece", 48);
        this._holes = this._Numbered(this._dim, "Hole", 8);
        this._glows = this._Numbered(this._dim, "Glow", 8).map(function(glow) {
            return { widget: glow, anim: glow.GetComponent("o2::AnimationComponent") };
        });
        this._pieces.forEach(function(piece) { piece.onClick = function() { self.OnTap(); }; });
        this._caption = this._actor.GetChild("Caption");
        this._captionAnim = this._caption.GetComponent("o2::AnimationComponent");
        this._text = this._caption.GetChild("Text");
        var textLayer = this._text.GetLayer("text");
        this._textDrawable = textLayer ? textLayer.drawable : null;
        this._tap = this._caption.GetChild("Tap");
        this._hand = this._actor.GetChild("Hand");

        this._Hide();
    }

    _Numbered(parent, prefix, limit)
    {
        var list = [];
        for (var i = 0; i < limit; i++)
        {
            var child = parent.GetChild(prefix + i);
            if (!child)
                break;
            list.push(child);
        }
        return list;
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

    _SetBox(widget, box, grow)
    {
        var layout = widget.GetLayout();
        layout.SetOffsetMin(new Vec2(box.x - grow, box.y - grow));
        layout.SetOffsetMax(new Vec2(box.x + box.w + grow, box.y + box.h + grow));
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

    // Вырезы затемнения для шага: клетки поля и цели вне поля (прямоугольники экрана)
    _HolesFor(step)
    {
        var board = WordFallViews.board;
        var cells = [];
        if (step.seeded && board)
        {
            var next = this._NextSeededCell(step);
            if (next)
                cells.push(next.cell);
        }
        else if (step.cells && board)
            cells = step.cells.slice(0, 6);
        else if (step.cell && board)
            cells.push(step.cell);
        return this._CellHoles(cells).concat(step.target ? this._TargetRects(step.target) : []);
    }

    // Соседние клетки сливаются в прямоугольники (отрезки строк, затем одинаковые отрезки соседних строк). Поле вокруг
    // получает вырез, которому оно не наползает на другой: скруглённые углы не закрывают соседние клетки
    _CellHoles(cells)
    {
        if (cells.length == 0)
            return [];
        var board = WordFallViews.board;
        var pitchX = board.cellSizeX || board.cellSize, pitchY = board.cellSize;

        var sorted = cells.slice().sort(function(a, b) { return a.r != b.r ? a.r - b.r : a.c - b.c; });
        var runs = [];
        for (var i = 0; i < sorted.length; i++)
        {
            var cell = sorted[i], last = runs.length > 0 ? runs[runs.length - 1] : null;
            if (last && last.r0 == cell.r && last.c1 + 1 == cell.c)
                last.c1 = cell.c;
            else if (!last || last.r0 != cell.r || last.c1 != cell.c)
                runs.push({ c0: cell.c, c1: cell.c, r0: cell.r, r1: cell.r });
        }
        var rects = [];
        for (var i = 0; i < runs.length; i++)
        {
            var run = runs[i], merged = false;
            for (var k = 0; k < rects.length && !merged; k++)
                if (rects[k].c0 == run.c0 && rects[k].c1 == run.c1 && rects[k].r1 + 1 == run.r0)
                {
                    rects[k].r1 = run.r0;
                    merged = true;
                }
            if (!merged)
                rects.push(run);
        }

        var holes = rects.map(function(rect) {
            var from = board.TileWorldPos(rect.c0, rect.r0), to = board.TileWorldPos(rect.c1, rect.r1);
            return { x: from.x - pitchX*0.5, y: from.y - pitchY*0.5, w: to.x - from.x + pitchX, h: to.y - from.y + pitchY,
                     pad: 0 };
        });
        var pad = this.cellPad;
        holes.forEach(function(h) { h.pad = pad; });
        var overlaps = function(a, b) {
            return a.x - a.pad < b.x + b.w + b.pad && b.x - b.pad < a.x + a.w + a.pad &&
                   a.y - a.pad < b.y + b.h + b.pad && b.y - b.pad < a.y + a.h + a.pad;
        };
        for (var changed = true; changed;)
        {
            changed = false;
            for (var i = 0; i < holes.length; i++)
                for (var j = i + 1; j < holes.length; j++)
                    if ((holes[i].pad > 0 || holes[j].pad > 0) && overlaps(holes[i], holes[j]))
                    {
                        holes[i].pad = 0;
                        holes[j].pad = 0;
                        changed = true;
                    }
        }
        return holes.map(function(h) { return { x: h.x - h.pad, y: h.y - h.pad, w: h.w + h.pad*2, h: h.h + h.pad*2 }; });
    }

    // Вырезы цели шага с полями: слово в лотке вместе с кнопкой ✓, ряд бустеров или цели уровня (шкала очков вместе с
    // задачами — одним вырезом, ходы — другим)
    _TargetRects(target)
    {
        var self = this;
        var box = function(paths, pad) {
            var rects = paths.map(function(path) { return self._WidgetRect(path); }).filter(function(r) { return r != null; });
            if (rects.length == 0)
                return [];
            var left = 1e9, bottom = 1e9, right = -1e9, top = -1e9;
            rects.forEach(function(r) {
                left = Math.min(left, r.left); bottom = Math.min(bottom, r.bottom);
                right = Math.max(right, r.right); top = Math.max(top, r.top);
            });
            return [{ x: left - pad, y: bottom - pad, w: right - left + pad*2, h: top - bottom + pad*2 }];
        };
        if (target == "accept")
            return box(["../WordBar/Tray", "../WordBar/AcceptBtn"], this.buttonPad);
        if (target == "boosters")
            return box(["../Boosters"], this.boostersPad);
        if (target == "goals")
        {
            var goals = ["../Hud/ScorePanel"];
            for (var i = 0; i < 6; i++)
                goals.push("../Tasks/Objectives/Item" + i);
            return box(goals, this.goalsPad).concat(box(["../Hud/MovesBox"], this.goalsPad));
        }
        return [];
    }

    _WidgetRect(path)
    {
        var widget = this._actor.GetChild(path);
        return widget && widget.IsEnabled() ? widget.GetLayout().GetWorldRect() : null;
    }

    // Затемнение полосами: экран режется горизонтальными полосами по границам вырезов,
    // в каждой полосе смежные тёмные ячейки склеиваются в один прямоугольник — кусков
    // хватает даже на шесть вырезов. Сам вырез закрывает спрайт со скруглёнными мягкими углами того же цвета,
    // поверх — кайма. Тап по затемнению ведёт дальше; на пояснительных шагах сверху лежит прозрачный
    // кусок во весь экран, чтобы вырез не пропускал клики
    _ShowDim(holes, blockAll)
    {
        // раскладка округляет центр и размер виджета по отдельности: от нечётных размеров соседние куски расходились
        // на единицу, и через весь экран светилась щель — у затемнения размер чётный, у кусков края чётные
        var dimLayout = this._dim.GetLayout(), dimRect = dimLayout.GetWorldRect(), grown = dimLayout.GetOffsetMax();
        var parentW = Math.round(dimRect.right - dimRect.left - grown.x), parentH = Math.round(dimRect.top - dimRect.bottom - grown.y);
        if (dimRect.right - dimRect.left > 1 && (grown.x != parentW % 2 || grown.y != parentH % 2))
            dimLayout.SetOffsetMax(new Vec2(parentW % 2, parentH % 2));
        var even = function(v) { return Math.round(v*0.5)*2; };
        holes = holes.map(function(h) {
            var x = even(h.x), y = even(h.y);
            return { x: x, y: y, w: even(h.x + h.w) - x, h: even(h.y + h.h) - y };
        });
        var R = even(this.dimReach);
        var xs = [-R, R], ys = [-R, R];
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
                        place(runStart, y0, x0, y1, this.dimAlpha);
                        runStart = null;
                    }
                }
                else if (runStart == null)
                    runStart = x0;
            }
            if (runStart != null)
                place(runStart, y0, xs[xs.length - 1], y1, this.dimAlpha);
        }

        if (blockAll)
            place(-R, -R, R, R, 0.0);

        for (var i = used; i < this._pieces.length; i++)
            this._pieces[i].SetEnabled(false);

        var key = JSON.stringify(holes);
        var moved = key != this._holesKey;
        this._holesKey = key;
        for (var i = 0; i < this._holes.length; i++)
        {
            var corner = this._holes[i];
            if (i < holes.length)
            {
                this._SetBox(corner, holes[i], 0);
                corner.SetTransparency(this.dimAlpha);
            }
            corner.SetEnabled(i < holes.length);
        }
        for (var i = 0; i < this._glows.length; i++)
        {
            var glow = this._glows[i];
            if (i < holes.length)
            {
                this._SetBox(glow.widget, holes[i], this.glowMargin);
                glow.widget.SetEnabled(true);
                if (moved && glow.anim)
                    glow.anim.RewindAndPlay(this.focusState);
            }
            else
                glow.widget.SetEnabled(false);
        }
        this._dim.SetEnabled(true);
    }

    _Hide()
    {
        this._step = null;
        this._holesKey = "";
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
            steps.push({ key: "basics", block: true, target: "goals",
                         text: "Буквы улетают в шкалу очков.\nЗаполни её и закрой задачи —\nходы ограничены!" });
        }
        if (!svc.IsTutorialSeen("boosters") && svc.GetLevelIndex() >= 1)
            steps.push({ key: "boosters", block: true, target: "boosters",
                         text: "Бустеры: молоток, перемешать,\nподсказка, джокер — любая\nбуква, ×2 — удвоить номинал" });

        var elements = [
            { key: "ice", pred: function(t) { return t.ice > 0; }, text: "Лёд: буква видна,\nно не выбирается.\nРазбей словом по соседству" },
            { key: "stone", pred: function(t) { return t.stone > 0; }, text: "Камень ломают только бонусы:\nбомба, ракета, фейерверк" },
            { key: "bonus", pred: function(t) { return t.powerup != ""; }, text: "Бонус срабатывает от слова\nпо соседству. Длинные слова\nдают новые бонусы" },
            { key: "crate", pred: function(t) { return t.crate > 0; }, text: "Ящик падает вместе с буквами.\nСлово рядом снимает прочность" },
            { key: "chain", pred: function(t) { return t.chained; }, text: "Цепь держит букву и всё\nнад ней. Используй её\nв слове — цепь спадёт" },
            { key: "snow", pred: function(t) { return t.snow; }, text: "Снежки сыплются сверху.\nСлово по соседству\nих растапливает" },
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
        return "Отлично! Теперь букву «" + step.word[next.index] + "»";
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
        this._svc.MarkTutorialSeen(step.key);

        // на пояснительных шагах перекрыт весь экран (в том числе вырез): случайный
        // тап по подсвеченному бустеру не должен ломать обучение
        this._selected = this._svc.GetSelection().length;
        this._tap.SetEnabled(step.block);
        this._Show(step);
    }

    // Вырезы, плашка и рука под текущее состояние шага; плашка выскакивает заново
    _Show(step)
    {
        var holes = this._HolesFor(step);
        this._ShowDim(holes, step.block);
        var text = this._TextFor(step);
        this._text.SetText(text);
        // по высоте плашка — по тексту: длинное слово задания или другой язык переносят строки
        var measured = this._textDrawable ? this._textDrawable.GetRealSize().y : 0;
        var height = this.captionPadding*2 + Math.max(measured, text.split("\n").length*this.captionLineHeight - 12);
        var hand = this._PlaceHand(step);
        this._SetRect(this._caption, 0, this._CaptionY(holes, hand, height), this.captionWidth, height);
        this._caption.SetEnabled(true);
        if (this._captionAnim)
            this._captionAnim.RewindAndPlay(this.appearState);
    }

    // Плашка ставится на одно из мест поля: не накрывая вырезы и руку, а из свободных — ближе к подсвеченному
    _CaptionY(holes, hand, height)
    {
        if (holes.length == 0)
            return this.captionCenter;
        var boxes = holes.map(function(h) { return h; });
        if (hand)
            boxes.push(hand);
        var margin = this.glowMargin + this.captionGap;
        var halfWidth = this.captionWidth*0.5;
        var focusY = 0;
        for (var i = 0; i < holes.length; i++)
            focusY += (holes[i].y + holes[i].h*0.5)/holes.length;

        var best = this.captionCenters[0], bestScore = 1e18;
        for (var b = 0; b < this.captionCenters.length; b++)
        {
            var center = this.captionCenters[b];
            var y0 = center - height*0.5 - this.captionBelow, y1 = center + height*0.5 + this.captionAbove;
            var overlap = 0;
            for (var i = 0; i < boxes.length; i++)
            {
                var box = boxes[i];
                var w = Math.min(halfWidth, box.x + box.w + margin) - Math.max(-halfWidth, box.x - margin);
                var h = Math.min(y1, box.y + box.h + margin) - Math.max(y0, box.y - margin);
                if (w > 0 && h > 0)
                    overlap += w*h;
            }
            var score = overlap*1000 + Math.abs(center - focusY);
            if (score < bestScore)
            {
                bestScore = score;
                best = center;
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
        if (step.target == "accept" || step.target == "boosters")
        {
            var rect = this._WidgetRect(step.target == "accept" ? "../WordBar/AcceptBtn" : "../Boosters");
            return rect ? { x: rect.left + (rect.right - rect.left)*(step.target == "accept" ? 0.45 : 0.5), y: (rect.bottom + rect.top)*0.5 } : null;
        }
        return null;
    }

    // Рука ставится кончиком пальца на цель; возвращает её прямоугольник (или null — руки нет)
    _PlaceHand(step)
    {
        var pos = step ? this._TargetPos(step) : null;
        this._hand.SetEnabled(pos != null);
        if (!pos)
            return null;
        var size = this.handSize;
        var x = pos.x + (0.5 - this.handTipX)*size, y = pos.y - (this.handTipY - 0.5)*size;
        this._SetRect(this._hand, x, y, size, size);
        return { x: x - size*0.5, y: y - size*0.5, w: size, h: size };
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
                this._Show(this._step);
            }
        }

        if (this._step.until && this._step.until(this))
            this._Next();
    }
};
