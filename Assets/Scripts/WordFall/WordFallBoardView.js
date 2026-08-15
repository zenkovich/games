// Вьюха игрового поля: плитки (буквы, лёд, пауэрапы, выделение), клики,
// анимация падения, партикловые вспышки. Данные — в C++ сервисе
// (актор GameService, инжектится бутстрапом в this.serviceActor).
// Координаты локальные: центр секции Board = (0,0)

WordFallBoardView = class WordFallBoardView extends o2.Component
{
    constructor()
    {
        super();
        this.fallSpeed = 900;   // скорость падения плиток, px/с
        this.cellSize = 96;     // шаг сетки — источник раскладки плиток
        this.tileSize = 88;     // размер плитки в ячейке
        this.boardCenterY = -121; // центр секции Board в экранных координатах

        this._svc = null;
        this._vfx = null;
        this._tiles = null;
        this._fallAnims = [];
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
                    letter: btn.GetLayer("letter").drawable,
                    points: btn.GetLayer("points").drawable,
                    sel: btn.GetLayer("sel"),
                    ice: btn.GetLayer("ice"),
                    bomb: btn.GetLayer("bomb"),
                    rocket: btn.GetLayer("rocket"),
                    wand: btn.GetLayer("wand")
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

    // Мгновенные анимации результата (молоток)
    PlayMoveResult(result)
    {
        this._StartFallAnims(result.moved, result.spawned);

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
                                  burned: result.burned, activated: result.activated,
                                  extra: result.extraScore };
    }

    ApplyPendingCollapse()
    {
        if (!this._pendingCollapse)
            return;

        var collapse = this._pendingCollapse;
        this._pendingCollapse = null;

        this._StartFallAnims(collapse.moved, collapse.spawned);

        if (this._vfx)
        {
            for (var i = 0; i < collapse.burned.length; i++)
            {
                var pos = this.TileWorldPos(collapse.burned[i].c, collapse.burned[i].r);
                this._vfx.PlayBurn(pos.x, pos.y);
            }
            for (var i = 0; i < collapse.activated.length; i++)
            {
                var pos = this.TileWorldPos(collapse.activated[i].c, collapse.activated[i].r);
                this._vfx.PlayBurn(pos.x, pos.y);
            }
            if (collapse.extra > 0 && collapse.burned.length > 0)
            {
                var last = collapse.burned[collapse.burned.length - 1];
                var pos = this.TileWorldPos(last.c, last.r);
                this._vfx.PlayExplosion(pos.x, pos.y);
            }
        }

        this.SyncBoard();
        this.SyncSelection();
    }

    SyncTile(c, r)
    {
        var tile = this._svc.GetTile(c, r);
        var view = this._tiles[c][r];

        view.letter.text = tile.joker ? "?" : tile.letter;
        view.letter.color = tile.joker ? new Color4(160, 90, 200, 255)
                          : tile.ice > 0 ? new Color4(44, 106, 158, 255)   // буква на льду синеет
                          : new Color4(74, 48, 34, 255);

        view.points.text = tile.joker ? "" : ("" + tile.value);
        view.points.color = tile.doubled ? new Color4(215, 150, 20, 255)
                          : tile.ice > 0 ? new Color4(64, 124, 172, 255)
                          : new Color4(150, 108, 70, 255);

        view.ice.SetEnabled(tile.ice > 0);
        view.bomb.SetEnabled(tile.powerup == "bomb");
        view.rocket.SetEnabled(tile.powerup == "rocket");
        view.wand.SetEnabled(tile.powerup == "wand");
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

    _StartFallAnims(moved, spawned)
    {
        for (var i = 0; i < this._fallAnims.length; i++)
            this._SetTileRect(this._fallAnims[i].c, this._fallAnims[i].r, 0);
        this._fallAnims = [];

        for (var i = 0; i < moved.length; i++)
        {
            var m = moved[i];
            this._fallAnims.push({ c: m.c, r: m.toR, offset: (m.fromR - m.toR)*this.cellSize });
        }
        for (var i = 0; i < spawned.length; i++)
        {
            var s = spawned[i];
            this._fallAnims.push({ c: s.c, r: s.r, offset: (this._rows - s.r)*this.cellSize + 60 });
        }

        for (var i = 0; i < this._fallAnims.length; i++)
            this._SetTileRect(this._fallAnims[i].c, this._fallAnims[i].r, this._fallAnims[i].offset);
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

        if (this._fallAnims.length > 0)
        {
            var alive = [];
            for (var i = 0; i < this._fallAnims.length; i++)
            {
                var a = this._fallAnims[i];
                a.offset -= this.fallSpeed*dt;
                if (a.offset <= 0)
                    this._SetTileRect(a.c, a.r, 0);
                else
                {
                    this._SetTileRect(a.c, a.r, a.offset);
                    alive.push(a);
                }
            }
            this._fallAnims = alive;
        }
    }
};
