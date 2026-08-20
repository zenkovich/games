// Вьюха игрового поля: плитки (буквы, лёд, пауэрапы, выделение), клики,
// анимация падения, партикловые вспышки. Данные — в C++ сервисе
// (актор GameService, инжектится бутстрапом в this.serviceActor).
// Координаты локальные: центр секции Board = (0,0)

WordFallBoardView = class WordFallBoardView extends o2.Component
{
    constructor()
    {
        super();
        // падение считает C++ модель (WordBoardMotion в сервисе) — вью только
        // отображает офсеты и видимость плиток
        this.cellSize = 96;     // шаг сетки — источник раскладки плиток
        this.tileSize = 88;     // размер плитки в ячейке
        this.boardCenterY = -121; // центр секции Board в экранных координатах

        this._svc = null;
        this._vfx = null;
        this._tiles = null;
        this._collapsing = false; // модель анимирует обвал — рисуем офсеты
        this._hintQueue = [];   // клетки подсказки, выбираются по одной
        this._hintTimer = 0;
        this._pendingCollapse = null; // обвал ждёт окончания подтверждения слова
        this._lastRevision = -1;
        this._columns = 7;
        this._rows = 8;
    }

    OnStart()
    {
        globalThis.WordFallViews = globalThis.WordFallViews || {};
        WordFallViews.board = this;

        this._svc = this.serviceActor.GetComponent("WordFallGameService");
        if (this.vfxActor)
            this._vfx = this.vfxActor.GetComponent("WordFallVfx");

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
                    fireworks: btn.GetLayer("fireworks")
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

    // Подсказка: выбирает клетки по одной, буквы штатно улетают в лоток
    SelectAnimated(cells)
    {
        this._hintQueue = cells.slice();
        this._hintTimer = 0;
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
    }

    // Принятое слово: буквы остаются на месте до конца подтверждения,
    // обвал произойдёт по вызову ApplyPendingCollapse от секвенсора
    HoldCollapse(result)
    {
        this._pendingCollapse = { moved: result.moved, spawned: result.spawned,
                                  destroyed: result.destroyed, activated: result.activated,
                                  iceBroken: result.iceBroken };
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

        // бонус занимает слот: буквы и номинала нет, крупная иконка по центру
        view.letter.text = isBonus ? "" : tile.joker ? "?" : tile.letter;
        view.letter.color = tile.joker ? new Color4(160, 90, 200, 255)
                          : tile.ice > 0 ? new Color4(44, 106, 158, 255)    // на льду синеет
                          : tile.stone > 0 ? new Color4(245, 245, 248, 255) // на камне светлеет
                          : new Color4(74, 48, 34, 255);

        view.points.text = (isBonus || tile.joker) ? "" : ("" + tile.value);
        view.points.color = tile.doubled ? new Color4(215, 150, 20, 255)
                          : tile.ice > 0 ? new Color4(64, 124, 172, 255)
                          : tile.stone > 0 ? new Color4(200, 200, 210, 255)
                          : new Color4(150, 108, 70, 255);

        // бонус рисуется без плашки-подложки — только иконка
        view.back.SetEnabled(!isBonus);
        view.ice.SetEnabled(tile.ice > 0);
        view.stone.SetEnabled(tile.stone > 0);
        view.bomb.SetEnabled(tile.powerup == "bomb");
        view.rocket.SetEnabled(tile.powerup == "rocket");
        view.fireworks.SetEnabled(tile.powerup == "fireworks");
    }

    SyncBoard()
    {
        for (var c = 0; c < this._columns; c++)
        {
            for (var r = 0; r < this._rows; r++)
                this.SyncTile(c, r);
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
                this._tiles[c][r].btn.SetEnabled(!isSel);
            }
        }
    }

    _SetTileRect(c, r, extraY)
    {
        var pos = this.TileLocalPos(c, r);
        var half = this.tileSize*0.5;
        var layout = this._tiles[c][r].btn.GetLayout();
        layout.SetOffsetMin(new Vec2(pos.x - half, pos.y + extraY - half));
        layout.SetOffsetMax(new Vec2(pos.x + half, pos.y + extraY + half));
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
                this._tiles[c][r].btn.SetEnabled(!this._svc.IsTileFallHidden(c, r));
            }
        }
    }

    Update(dt)
    {
        if (!this._svc)
            return;

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
    }
};
