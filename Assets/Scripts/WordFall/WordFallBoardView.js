globalThis.WordFallGame = globalThis.WordFallGame || {};

// Вьюха игрового поля: плитки (буквы, лёд, пауэрапы, выделение), клики,
// анимация падения, партикловые вспышки. Данные — в сервисе WordFallGame.service.
// Координаты локальные: центр секции Board = (0,0)

WordFallBoardView = class WordFallBoardView extends o2.Component
{
    get _svc() { return WordFallGame.service; }
    get _vfx() { return WordFallGame.vfx || null; }

    constructor()
    {
        super();
        // падение считает модель WordBoardMotion в сервисе — вью только
        // отображает офсеты и видимость плиток
        this.cellSize = 96;     // шаг сетки — источник раскладки плиток
        this.tileSize = 88;     // размер плитки в ячейке
        this.boardCenterY = -121; // центр секции Board в экранных координатах

        // «дыхание» бонуса на поле: плитка качает масштаб, аура — прозрачность,
        // сверху редкие искры по очереди на каждый бонус
        this.bonusPulseSpeed = 3.2;
        this.bonusPulseScale = 0.07;
        this.bonusGlowMin = 0.30;
        this.bonusGlowMax = 0.85;
        this.bonusSparkleInterval = 0.7;
        this.bonusChargeScale = 0.35; // раздувание бонуса перед срабатыванием
        this.shakeFrequency = 46;    // частота колебаний тряски поля

        this._tiles = null;
        this._collapsing = false; // модель анимирует обвал — рисуем офсеты
        this._hintQueue = [];   // клетки подсказки, выбираются по одной
        this._hintTimer = 0;
        this._pendingCollapse = null; // обвал ждёт окончания подтверждения слова
        this._lastRevision = -1;
        this._columns = 7;
        this._rows = 8;
        this._bonusCells = [];      // [{c, r, kind}] — пересобирается в SyncBoard
        this._bonusKindCount = {};  // сколько бонусов каждого вида сейчас на поле
        this._bonusTime = 0;
        this._bonusSparkleTimer = 0;
        this._bonusSparkleIndex = 0;
        this._chargeCell = null;    // бонус, который сейчас разгорается — пульс его не трогает
        this._shakeOffset = { x: 0, y: 0 };
        this._shakeTime = 0;
        this._shakeDuration = 1;
        this._shakeStrength = 0;
    }

    OnStart()
    {
        globalThis.WordFallViews = globalThis.WordFallViews || {};
        WordFallViews.board = this;


        this._columns = this._svc.GetColumns();
        this._rows = this._svc.GetRows();

        var self = this;
        this._tiles = [];
        for (var c = 0; c < this._columns; c++)
        {
            this._tiles[c] = [];
            for (var r = 0; r < this._rows; r++)
            {
                var btn = this._actor.GetChild("Tile_" + c + "_" + r);
                var glowLayer = btn.GetLayer("bonusGlow"); // старый экран без бонусных слоёв не должен ронять поле
                this._tiles[c][r] = {
                    btn: btn,
                    back: btn.GetLayer("back"),
                    letter: btn.GetLayer("letter").drawable,
                    points: btn.GetLayer("points").drawable,
                    sel: btn.GetLayer("sel"),
                    ice: btn.GetLayer("ice"),
                    stone: btn.GetLayer("stone"),
                    bomb: btn.GetLayer("bomb"),
                    rocket: btn.GetLayer("rocket"),
                    fireworks: btn.GetLayer("fireworks"),
                    bonusPlate: btn.GetLayer("bonusPlate"),
                    bonusGlow: glowLayer,
                    bonusGlowDraw: glowLayer ? glowLayer.drawable : null,
                    cellBack: this._actor.GetChild("CellBack_" + c + "_" + r),
                    crate: btn.GetLayer("crate"),
                    crateHit: btn.GetLayer("crateHit"),
                    chain: btn.GetLayer("chain"),
                    snow: btn.GetLayer("snow"),
                    parcel: btn.GetLayer("parcel")
                };

                (function(cc, rr) {
                    self._tiles[cc][rr].btn.onClick = function() { self.OnTileClick(cc, rr); };
                })(c, r);
            }
        }

        this._LayoutTiles();
        this.SyncBoard();
    }

    // Раскладывает сетку плиток по полям cellSize/tileSize — параметры редактируются
    // в прототипе экрана, вьюха применяет их на старте
    _LayoutTiles()
    {
        for (var c = 0; c < this._columns; c++)
        {
            for (var r = 0; r < this._rows; r++)
                this._SetTileRect(c, r, 0);
        }
    }

    // Центр плитки в локальных координатах секции Board
    TileLocalPos(c, r)
    {
        return new Vec2((c - 3)*this.cellSize, (r - 3.5)*this.cellSize);
    }

    // Центр плитки в экранных координатах (для флаеров и VFX)
    TileWorldPos(c, r)
    {
        var local = this.TileLocalPos(c, r);
        return new Vec2(local.x, local.y + this.boardCenterY);
    }

    OnTileClick(c, r)
    {
        var svc = this._svc;
        if (svc.GetGameState() != "playing")
            return;

        // режим прицела бустера перехватывает клик
        var boosters = WordFallViews.boosters;
        if (boosters && boosters.HasAimMode())
        {
            var mode = boosters.ConsumeAimMode();
            var result = null;
            if (mode == "hammer")
            {
                result = svc.UseHammer(c, r);
                if (result.ok)
                    this.PlayMoveResult(result);
            }
            else if (mode == "joker")
                svc.UseJoker(c, r);
            else if (mode == "doubler")
                svc.UseDoubler(c, r);
            return;
        }

        var action = svc.ToggleSelect(c, r);
        if (action == "added")
        {
            var wordPanel = WordFallViews.wordPanel;
            if (wordPanel)
            {
                var index = svc.GetSelection().length - 1;
                wordPanel.OnLetterPicked(c, r, index, this.TileWorldPos(c, r));
            }

        }
    }

    // Прячет плитку немедленно (взрыв бонуса до обвала); SyncBoard вернёт её
    HideTileVisual(c, r)
    {
        this._tiles[c][r].btn.SetEnabled(false);
    }

    // Разгорание бонуса перед срабатыванием: k 0..1 — плитка раздувается, аура белеет
    SetBonusCharge(c, r, k)
    {
        this._chargeCell = k > 0 ? { c: c, r: r } : null;

        var view = this._tiles[c][r];
        if (!view.btn.IsEnabled())
            return;

        var offset = this._collapsing ? this._svc.GetTileFallOffset(c, r)*this.cellSize : 0;
        this._SetTileRect(c, r, offset, 1 + this.bonusChargeScale*k);
        if (view.bonusGlowDraw)
            view.bonusGlowDraw.SetTransparency(Math.min(1, this.bonusGlowMin + k));
    }

    // Тряска поля от взрыва: затухающие колебания всей раскладки плиток
    Shake(strength, duration)
    {
        this._shakeStrength = strength;
        this._shakeDuration = duration;
        this._shakeTime = duration;
    }

    _UpdateShake(dt)
    {
        if (this._shakeTime <= 0)
            return;

        this._shakeTime -= dt;
        var k = Math.max(0, this._shakeTime/this._shakeDuration);
        var amp = this._shakeStrength*k*k;
        var phase = (this._shakeDuration - this._shakeTime)*this.shakeFrequency;
        this._shakeOffset = k > 0 ? { x: Math.sin(phase)*amp, y: Math.cos(phase*0.8)*amp*0.5 }
                                  : { x: 0, y: 0 };

        if (this._collapsing)
            this._ApplyCollapseView();
        else
            this._LayoutTiles();
    }

    // Подсказка: выбирает клетки по одной, буквы штатно улетают в лоток
    SelectAnimated(cells)
    {
        this._hintQueue = cells.slice();
        this._hintTimer = 0;
    }

    // Рамка формы поля из кусочков: рёбра вдоль границ с дырами/краем, внешние углы там, где
    // две соседние стороны снаружи, внутренние — где обе стороны внутри, а диагональ снаружи.
    // Рим лежит снаружи клетки (18 px) с заходом внутрь на 6 px; у внутреннего угла угловая
    // точка поля — внутренний угол рима, центр куска смещён в сторону дыры на 8.8 px
    LayoutFrame()
    {
        var svc = this._svc;
        var cols = this._columns, rows = this._rows;
        var self = this;
        var inside = function(c, r) {
            return c >= 0 && c < cols && r >= 0 && r < rows && !svc.GetTile(c, r).hole;
        };
        var kinds = ["edge_top", "edge_right", "edge_bottom", "edge_left", "corner_tl", "corner_tr", "corner_br", "corner_bl",
                     "inner_tl", "inner_tr", "inner_br", "inner_bl"];
        var used = {};
        for (var i = 0; i < kinds.length; i++)
            used[kinds[i]] = 0;
        var sizes = { edge_top: [100, 22], edge_bottom: [100, 22], edge_left: [22, 100], edge_right: [22, 100] }; // с нахлёстом, чтобы швы не читались
        var place = function(kind, x, y) {
            var index = used[kind]++;
            var piece = self._actor.GetChild("Frame_" + kind + "_" + index);
            if (!piece)
                return;
            var size = sizes[kind] || (kind.indexOf("inner") == 0 ? [28, 28] : [22, 22]);
            var layout = piece.GetLayout();
            layout.SetOffsetMin(new Vec2(x - size[0]*0.5, y - size[1]*0.5));
            layout.SetOffsetMax(new Vec2(x + size[0]*0.5, y + size[1]*0.5));
            piece.SetEnabled(true);
        };
        var half = this.cellSize*0.5, off = 5, k = 8.0;
        for (var c = 0; c < cols; c++)
        {
            for (var r = 0; r < rows; r++)
            {
                if (!inside(c, r))
                    continue;
                var p = this.TileLocalPos(c, r);
                var x0 = p.x - half, x1 = p.x + half, y0 = p.y - half, y1 = p.y + half; // y вверх
                var N = inside(c, r + 1), S = inside(c, r - 1), E = inside(c + 1, r), W = inside(c - 1, r);
                if (!N) place("edge_top", p.x, y1 + off);
                if (!S) place("edge_bottom", p.x, y0 - off);
                if (!E) place("edge_right", x1 + off, p.y);
                if (!W) place("edge_left", x0 - off, p.y);
                if (!N && !W) place("corner_tl", x0 - off, y1 + off);
                if (!N && !E) place("corner_tr", x1 + off, y1 + off);
                if (!S && !E) place("corner_br", x1 + off, y0 - off);
                if (!S && !W) place("corner_bl", x0 - off, y0 - off);
                if (N && E && !inside(c + 1, r + 1)) place("inner_tr", x1 + k, y1 + k);
                if (N && W && !inside(c - 1, r + 1)) place("inner_tl", x0 - k, y1 + k);
                if (S && E && !inside(c + 1, r - 1)) place("inner_br", x1 + k, y0 - k);
                if (S && W && !inside(c - 1, r - 1)) place("inner_bl", x0 - k, y0 - k);
            }
        }
        // лишние куски пула — выключить
        for (var i = 0; i < kinds.length; i++)
        {
            for (var n = used[kinds[i]]; n < 24; n++)
            {
                var piece = this._actor.GetChild("Frame_" + kinds[i] + "_" + n);
                if (piece)
                    piece.SetEnabled(false);
            }
        }
    }

    // Ключ формы поля (дыры) — рамка перекладывается, когда форма сменилась
    _ShapeKey()
    {
        var key = "";
        for (var c = 0; c < this._columns; c++)
            for (var r = 0; r < this._rows; r++)
                if (this._svc.GetTile(c, r).hole)
                    key += c + ":" + r + ";";
        return key;
    }

    // Буква и номинал, которые клетка показывает сейчас (до синка после хода)
    TileInfo(c, r)
    {
        var view = this._tiles[c][r];
        var value = parseInt(view.points.text);
        return { letter: view.letter.text, value: isNaN(value) ? 0 : value };
    }

    // Мгновенные анимации результата (молоток)
    PlayMoveResult(result)
    {
        this._BeginCollapseView();

        for (var i = 0; i < result.burned.length; i++)
        {
            var pos = this.TileWorldPos(result.burned[i].c, result.burned[i].r);
            if (this._vfx)
                this._vfx.PlayBurn(pos.x, pos.y);
        }
        this._PlayObstacleFx(result);
    }

    // Эффекты препятствий по результату хода: ящики, снежки, конверты
    _PlayObstacleFx(result)
    {
        if (!this._vfx)
            return;

        var self = this;
        var play = function(cells, fn) {
            if (!cells)
                return;
            for (var i = 0; i < cells.length; i++)
            {
                var pos = self.TileWorldPos(cells[i].c, cells[i].r);
                fn(pos.x, pos.y);
            }
        };
        play(result.crateHit, function(x, y) { self._vfx.PlayCrateHit(x, y); });
        play(result.crateBroken, function(x, y) { self._vfx.PlayCrateBreak(x, y); });
        play(result.snowMelted, function(x, y) { self._vfx.PlaySnowMelt(x, y); });
        play(result.delivered, function(x, y) { self._vfx.PlayDelivered(x, y); });
    }

    // Принятое слово: буквы остаются на месте до конца подтверждения,
    // обвал произойдёт по вызову ApplyPendingCollapse от секвенсора
    HoldCollapse(result)
    {
        this._pendingCollapse = { moved: result.moved, spawned: result.spawned,
                                  destroyed: result.destroyed, activated: result.activated,
                                  iceBroken: result.iceBroken, crateHit: result.crateHit,
                                  crateBroken: result.crateBroken, snowMelted: result.snowMelted,
                                  delivered: result.delivered };
    }

    ApplyPendingCollapse()
    {
        if (!this._pendingCollapse)
            return;

        var collapse = this._pendingCollapse;
        this._pendingCollapse = null;

        if (this._vfx)
        {
            // искрят только реально задетые: снятая броня и сколотый лёд;
            // буквы слова уже улетели в лоток — на их клетках эффектов нет
            for (var i = 0; i < collapse.activated.length; i++)
            {
                var pos = this.TileWorldPos(collapse.activated[i].c, collapse.activated[i].r);
                this._vfx.PlayBurn(pos.x, pos.y);
            }
            for (var i = 0; i < collapse.iceBroken.length; i++)
            {
                var pos = this.TileWorldPos(collapse.iceBroken[i].c, collapse.iceBroken[i].r);
                this._vfx.PlayBurn(pos.x, pos.y);
            }
            this._PlayObstacleFx(collapse);
        }

        // порядок важен: сначала новые буквы, затем — офсеты модели в этом же
        // кадре, чтобы плитки не показались на конечных местах
        this.SyncBoard();
        this.SyncSelection();
        this._BeginCollapseView();
    }

    SyncTile(c, r)
    {
        var tile = this._svc.GetTile(c, r);
        var view = this._tiles[c][r];
        var isBonus = tile.powerup != "";
        var isObstacle = tile.crate > 0 || tile.snow || tile.parcel;

        // дыры и пустые клетки под ящиком/цепью не рисуются вовсе; подложка формы поля — только у живых клеток
        view.visible = !tile.hole && !tile.empty;
        view.btn.SetEnabled(view.visible);
        if (view.cellBack)
            view.cellBack.SetEnabled(!tile.hole);
        if (!view.visible)
            return;

        // бонус или препятствие занимает слот: буквы и номинала нет, крупная иконка по центру
        view.letter.text = (isBonus || isObstacle) ? "" : tile.joker ? "?" : tile.letter;
        view.letter.color = tile.joker ? new Color4(160, 90, 200, 255)
                          : tile.ice > 0 ? new Color4(44, 106, 158, 255)    // на льду синеет
                          : tile.stone > 0 ? new Color4(245, 245, 248, 255) // на камне светлеет
                          : new Color4(74, 48, 34, 255);

        view.points.text = (isBonus || isObstacle || tile.joker) ? "" : ("" + tile.value);
        view.points.color = tile.doubled ? new Color4(215, 150, 20, 255)
                          : tile.ice > 0 ? new Color4(64, 124, 172, 255)
                          : tile.stone > 0 ? new Color4(200, 200, 210, 255)
                          : new Color4(150, 108, 70, 255);

        // бонус рисуется в своей золотой оправе поверх ауры, буквенной плашки нет;
        // конверт лежит на плашке, ящик и снежок закрывают клетку целиком
        view.back.SetEnabled(!isBonus && tile.crate == 0 && !tile.snow);
        if (view.crate)
            view.crate.SetEnabled(tile.crate > 1);
        if (view.crateHit)
            view.crateHit.SetEnabled(tile.crate == 1);
        if (view.chain)
            view.chain.SetEnabled(tile.chained);
        if (view.snow)
            view.snow.SetEnabled(tile.snow);
        if (view.parcel)
            view.parcel.SetEnabled(tile.parcel);
        view.ice.SetEnabled(tile.ice > 0);
        view.stone.SetEnabled(tile.stone > 0);
        view.bomb.SetEnabled(tile.powerup == "bomb");
        view.rocket.SetEnabled(tile.powerup == "rocket");
        view.fireworks.SetEnabled(tile.powerup == "fireworks");
        if (view.bonusPlate)
            view.bonusPlate.SetEnabled(isBonus);
        if (view.bonusGlow)
        {
            view.bonusGlow.SetEnabled(isBonus);
            if (isBonus)
                view.bonusGlowDraw.SetColor(this._BonusGlowColor(tile.powerup));
        }
    }

    // Аура бонуса повторяет палитру его иконки
    _BonusGlowColor(kind)
    {
        if (kind == "rocket")
            return new Color4(150, 225, 255, 255);

        if (kind == "fireworks")
            return new Color4(255, 150, 220, 255);

        return new Color4(255, 190, 110, 255);
    }

    SyncBoard()
    {
        for (var c = 0; c < this._columns; c++)
        {
            for (var r = 0; r < this._rows; r++)
                this.SyncTile(c, r);
        }

        this._SyncBonuses();
    }

    // Собирает бонусы поля и салютует появившимся. Обвал сдвигает бонусы по клеткам,
    // поэтому «новый» — только тот, чьих собратьев по виду стало больше
    _SyncBonuses()
    {
        var cells = [];
        var kindCount = {};
        for (var c = 0; c < this._columns; c++)
        {
            for (var r = 0; r < this._rows; r++)
            {
                var kind = this._svc.GetTile(c, r).powerup;
                if (kind == "")
                    continue;

                cells.push({ c: c, r: r, kind: kind });
                kindCount[kind] = (kindCount[kind] || 0) + 1;
            }
        }

        if (this._vfx)
        {
            for (var i = 0; i < cells.length; i++)
            {
                var cell = cells[i];
                if ((kindCount[cell.kind] || 0) <= (this._bonusKindCount[cell.kind] || 0))
                    continue;

                var known = false;
                for (var k = 0; k < this._bonusCells.length; k++)
                {
                    if (this._bonusCells[k].c == cell.c && this._bonusCells[k].r == cell.r &&
                        this._bonusCells[k].kind == cell.kind)
                    {
                        known = true;
                        break;
                    }
                }

                if (!known)
                {
                    var pos = this.TileWorldPos(cell.c, cell.r);
                    this._vfx.PlayBonusSpawn(pos.x, pos.y, cell.kind);
                }
            }
        }

        this._bonusCells = cells;
        this._bonusKindCount = kindCount;
    }

    // Пульс бонусов: масштаб плитки, яркость ауры и искры по очереди
    _UpdateBonusIdle(dt)
    {
        this._bonusTime += dt;

        if (this._bonusCells.length == 0)
            return;

        var pulse = 0.5 + 0.5*Math.sin(this._bonusTime*this.bonusPulseSpeed);
        var scale = 1 + this.bonusPulseScale*pulse;
        var glow = this.bonusGlowMin + (this.bonusGlowMax - this.bonusGlowMin)*pulse;

        for (var i = 0; i < this._bonusCells.length; i++)
        {
            var cell = this._bonusCells[i];
            if (this._chargeCell && this._chargeCell.c == cell.c && this._chargeCell.r == cell.r)
                continue;

            var view = this._tiles[cell.c][cell.r];
            if (!view.btn.IsEnabled())
                continue;

            var offset = this._collapsing ? this._svc.GetTileFallOffset(cell.c, cell.r)*this.cellSize : 0;
            this._SetTileRect(cell.c, cell.r, offset, scale);
            if (view.bonusGlowDraw)
                view.bonusGlowDraw.SetTransparency(glow);
        }

        this._bonusSparkleTimer -= dt;
        if (this._bonusSparkleTimer <= 0)
        {
            this._bonusSparkleTimer = this.bonusSparkleInterval;
            this._bonusSparkleIndex = (this._bonusSparkleIndex + 1)%this._bonusCells.length;

            var sparkling = this._bonusCells[this._bonusSparkleIndex];
            if (this._vfx && this._tiles[sparkling.c][sparkling.r].btn.IsEnabled())
            {
                var pos = this.TileWorldPos(sparkling.c, sparkling.r);
                this._vfx.PlayBonusSparkle(pos.x, pos.y, sparkling.kind);
            }
        }
    }

    // Выбранная плитка улетает в лоток — её ячейка на поле пустеет
    SyncSelection()
    {
        var selected = this._svc.GetSelection();
        for (var c = 0; c < this._columns; c++)
        {
            for (var r = 0; r < this._rows; r++)
            {
                var isSel = false;
                for (var i = 0; i < selected.length; i++)
                {
                    if (selected[i].c == c && selected[i].r == r)
                    {
                        isSel = true;
                        break;
                    }
                }
                this._tiles[c][r].btn.SetEnabled(!isSel && this._tiles[c][r].visible !== false);
            }
        }
    }

    _SetTileRect(c, r, extraY, scale)
    {
        var pos = this.TileLocalPos(c, r);
        var half = this.tileSize*0.5*(scale || 1);
        var x = pos.x + this._shakeOffset.x;
        var y = pos.y + extraY + this._shakeOffset.y;
        var layout = this._tiles[c][r].btn.GetLayout();
        layout.SetOffsetMin(new Vec2(x - half, y - half));
        layout.SetOffsetMax(new Vec2(x + half, y + half));
    }

    // Запуск отображения обвала: офсеты и видимость применяются сразу, в этом
    // же кадре — иначе новые буквы промигивают на конечных местах до падения
    _BeginCollapseView()
    {
        this._svc.StartCollapseAnimation();
        this._collapsing = true;
        this._ApplyCollapseView();
    }

    // Отображение текущего состояния модели падения
    _ApplyCollapseView()
    {
        for (var c = 0; c < this._columns; c++)
        {
            for (var r = 0; r < this._rows; r++)
            {
                var offset = this._svc.GetTileFallOffset(c, r)*this.cellSize;
                this._SetTileRect(c, r, offset);
                this._tiles[c][r].btn.SetEnabled(!this._svc.IsTileFallHidden(c, r) && this._tiles[c][r].visible !== false);
            }
        }
    }

    Update(dt)
    {
        if (!this._svc)
            return;

        // новый уровень: рамка по новой форме поля
        var levelIndex = this._svc.GetLevelIndex();
        if (levelIndex != this._frameLevel || this._frameShape != this._ShapeKey())
        {
            this._frameLevel = levelIndex;
            this._frameShape = this._ShapeKey();
            this.LayoutFrame();
        }

        var revision = this._svc.GetRevision();
        if (revision != this._lastRevision)
        {
            this._lastRevision = revision;
            // при отложенном обвале доска рисует состояние до хода
            if (!this._pendingCollapse)
            {
                this.SyncBoard();
                this.SyncSelection();
            }
        }

        if (this._hintQueue.length > 0)
        {
            this._hintTimer -= dt;
            if (this._hintTimer <= 0)
            {
                var cell = this._hintQueue.shift();
                this._hintTimer = 0.14;
                var action = this._svc.ToggleSelect(cell.c, cell.r);
                if (action == "added")
                {
                    var wordPanel = WordFallViews.wordPanel;
                    if (wordPanel)
                    {
                        var index = this._svc.GetSelection().length - 1;
                        wordPanel.OnLetterPicked(cell.c, cell.r, index, this.TileWorldPos(cell.c, cell.r));
                    }
                }
            }
        }

        if (this._collapsing)
        {
            var animating = this._svc.IsCollapseAnimating();
            this._ApplyCollapseView();

            if (!animating)
            {
                this._collapsing = false;
                this.SyncBoard();
                this.SyncSelection();
            }
        }

        // после раскладки обвала: тряска двигает всё поле, пульс — плитки бонусов
        this._UpdateShake(dt);
        this._UpdateBonusIdle(dt);
    }
};
