// Board view: number tiles (widgets from the bridge), the selection glow and line,
// removal flash, gravity and spawn animations. Logic lives in ZL.Board; the view
// only mirrors it, so input never waits for an animation
ZL.BoardView = class
{
    constructor(root)
    {
        this.root = root;
        this.board = null;
        this.tiles = [];     // tiles[c][r] — the tile object currently shown in the cell
        this.pool = [];
        this.removing = [];  // tiles playing the removal animation
        this.segments = [];
        this.dots = [];
        for (let c = 0; c < ZL.cfg.size; c++)
            this.tiles.push(new Array(ZL.cfg.size).fill(null));

        if (ZL.headless)
            return;

        this.tray = ZL.makeSprite(root, "ZeroLine/board_tray.png", 480, 480, 1);
        ZL.setPos(this.tray.actor, 0, ZL.cfg.boardY);
        this.lineRoot = ZL.makeActor(root, "Line");
    }

    Build(board)
    {
        this.board = board;
        for (let c = 0; c < ZL.cfg.size; c++)
        {
            for (let r = 0; r < ZL.cfg.size; r++)
            {
                if (this.tiles[c][r])
                    this._Recycle(this.tiles[c][r]);
                this.tiles[c][r] = null;
            }
        }

        for (let t of this.removing)
            this._Recycle(t);
        this.removing = [];

        for (let c = 0; c < ZL.cfg.size; c++)
        {
            for (let r = 0; r < ZL.cfg.size; r++)
            {
                let pos = ZL.cellCenter(c, r);
                this.tiles[c][r] = this._Spawn(board.Get(c, r), pos.x, pos.y);
            }
        }

        this._Line([], false);
    }

    CountTiles()
    {
        let n = 0;
        for (let c = 0; c < ZL.cfg.size; c++)
        {
            for (let r = 0; r < ZL.cfg.size; r++)
                if (this.tiles[c][r]) n++;
        }
        return n;
    }

    IsAnimating()
    {
        if (this.removing.length > 0)
            return true;

        for (let c = 0; c < ZL.cfg.size; c++)
        {
            for (let r = 0; r < ZL.cfg.size; r++)
                if (this.tiles[c][r] && this.tiles[c][r].anim) return true;
        }
        return false;
    }

    // ------------------------------------------------------------ tiles
    _NewTile()
    {
        let t = { w: null, value: 0, x: 0, y: 0, scale: 1, scaleTarget: 1, alpha: 1, anim: null, hidden: false };
        if (ZL.headless)
            return t;

        let w = Bridge.CreateTile();
        this.root.AddChild(w);
        w.SetLayer("2D");
        w.SetDrawingDepth(10);
        t.w = w;
        t.glow = w.GetLayer("glow");
        t.pos = w.GetLayer("pos");
        t.neg = w.GetLayer("neg");
        t.zero = w.GetLayer("zero");
        t.text = w.GetLayer("text").drawable;
        return t;
    }

    _Spawn(value, x, y)
    {
        let t = this.pool.pop() || this._NewTile();
        t.value = value;
        t.x = x;
        t.y = y;
        t.scale = 1;
        t.scaleTarget = 1;
        t.alpha = 1;
        t.anim = null;
        t.hidden = false;
        t.fadeIn = false;
        if (!ZL.headless)
        {
            t.w.SetEnabled(true);
            this._SetValue(t, value);
            this._Glow(t, false, false);
            this._Apply(t);
        }
        return t;
    }

    _Recycle(t)
    {
        t.anim = null;
        if (t.w)
            t.w.SetEnabled(false);
        this.pool.push(t);
    }

    _SetValue(t, value)
    {
        t.pos.SetEnabled(value > 0);
        t.neg.SetEnabled(value < 0);
        t.zero.SetEnabled(value == 0);
        t.text.text = "" + value;
    }

    _Glow(t, on, ready)
    {
        t.glow.SetEnabled(on);
        if (on)
            t.glow.drawable.SetColor(ZL.color(ready ? ZL.colors.green : ZL.colors.white));
    }

    // The widget layout ignores the transform scale: the tile grows through its rect,
    // the number through the font height (only while enlarged, the shrink fades instead)
    _Apply(t)
    {
        let size = ZL.cfg.tile*t.scale;
        ZL.place(t.w, t.x, t.y, size, size);
        if (t.scale > 0.99)
        {
            let h = Math.round(ZL.cfg.textHeight*t.scale);
            if (h != t.textHeight)
            {
                t.textHeight = h;
                t.text.height = h;
            }
        }
        t.w.SetTransparency(t.alpha);
    }

    // ------------------------------------------------------------ selection
    SetSelection(cells, ready)
    {
        for (let c = 0; c < ZL.cfg.size; c++)
        {
            for (let r = 0; r < ZL.cfg.size; r++)
            {
                let t = this.tiles[c][r];
                if (!t)
                    continue;

                let selected = cells.some(s => s.c == c && s.r == r);
                t.scaleTarget = selected ? ZL.cfg.anim.selectScale : 1;
                if (!ZL.headless)
                    this._Glow(t, selected, ready);
            }
        }

        this._Line(cells, ready);
    }

    _Line(cells, ready)
    {
        if (ZL.headless)
            return;

        let color = ZL.color(ready ? ZL.colors.green : ZL.colors.white, 190);
        let count = Math.max(0, cells.length - 1);
        while (this.segments.length < count)
            this.segments.push(ZL.makeRect(this.lineRoot, ZL.cfg.cell, 14, color, 20));
        while (this.dots.length < cells.length)
            this.dots.push(ZL.makeSprite(this.lineRoot, "ZeroLine/dot.png", 16, 16, 21));

        for (let i = 0; i < this.segments.length; i++)
        {
            let seg = this.segments[i];
            let on = i < count;
            seg.actor.SetEnabled(on);
            if (!on)
                continue;

            let a = ZL.cellCenter(cells[i].c, cells[i].r);
            let b = ZL.cellCenter(cells[i + 1].c, cells[i + 1].r);
            let t = seg.actor.GetTransform();
            ZL.setPos(seg.actor, (a.x + b.x)/2, (a.y + b.y)/2);
            t.SetSize2D(new Vec2(Math.hypot(b.x - a.x, b.y - a.y), 14));
            t.SetAngle(Math.atan2(b.y - a.y, b.x - a.x));
            seg.img.SetColor(color);
        }

        for (let i = 0; i < this.dots.length; i++)
        {
            let dot = this.dots[i];
            let on = i < cells.length;
            dot.actor.SetEnabled(on);
            if (!on)
                continue;

            let p = ZL.cellCenter(cells[i].c, cells[i].r);
            ZL.setPos(dot.actor, p.x, p.y);
            dot.img.SetColor(color);
        }
    }

    // ------------------------------------------------------------ move animation
    PlayMove(result)
    {
        let cfg = ZL.cfg.anim;

        for (let rm of result.removed)
        {
            let t = this.tiles[rm.c][rm.r];
            if (!t)
                continue;

            this.tiles[rm.c][rm.r] = null;
            t.anim = { type: "remove", t: 0 };
            t.scaleTarget = cfg.flashScale;
            if (!ZL.headless)
                this._Glow(t, true, true);
            this.removing.push(t);
        }

        let moved = [];
        for (let f of result.falls)
        {
            moved.push({ t: this.tiles[f.c][f.fromR], f: f });
            this.tiles[f.c][f.fromR] = null;
        }

        for (let m of moved)
        {
            let to = ZL.cellCenter(m.f.c, m.f.toR);
            this.tiles[m.f.c][m.f.toR] = m.t;
            m.t.anim = { type: "fall", t: 0, delay: cfg.fallDelay, fromY: m.t.y, toY: to.y,
                         dur: cfg.fallBase + cfg.fallPerCell*(m.f.fromR - m.f.toR) };
        }

        // new tiles enter from just above the tray and fade in on the way, so they
        // don't sit over the HUD while waiting
        let top = ZL.cellCenter(0, ZL.cfg.size - 1).y;
        for (let s of result.spawns)
        {
            let pos = ZL.cellCenter(s.c, s.r);
            let fromY = top + (s.order + 1)*ZL.cfg.cell;
            let t = this._Spawn(s.value, pos.x, fromY);
            t.hidden = true;
            t.fadeIn = true;
            t.alpha = 0;
            if (!ZL.headless)
                t.w.SetEnabled(false);
            t.anim = { type: "fall", t: 0, delay: cfg.fallDelay, fromY: fromY, toY: pos.y,
                       dur: cfg.fallBase + cfg.fallPerCell*((fromY - pos.y)/ZL.cfg.cell) };
            this.tiles[s.c][s.r] = t;
        }

        this._Line([], false);
    }

    Update(dt)
    {
        let k = Math.min(1, dt*ZL.cfg.anim.selectSpeed);
        for (let c = 0; c < ZL.cfg.size; c++)
        {
            for (let r = 0; r < ZL.cfg.size; r++)
            {
                if (this.tiles[c][r])
                    this._Step(this.tiles[c][r], dt, k);
            }
        }

        for (let t of this.removing)
            this._Step(t, dt, k);
        this.removing = this.removing.filter(t => t.anim);
    }

    _Step(t, dt, k)
    {
        let cfg = ZL.cfg.anim;
        t.scale += (t.scaleTarget - t.scale)*k;

        let a = t.anim;
        if (a && a.type == "remove")
        {
            a.t += dt;
            if (a.t > cfg.flash)
            {
                let p = Math.min(1, (a.t - cfg.flash)/cfg.shrink);
                t.scale = cfg.flashScale*(1 - p);
                t.alpha = 1 - p;
                if (p >= 1)
                {
                    this._Recycle(t);
                    return;
                }
            }
        }
        else if (a && a.type == "fall")
        {
            a.delay -= dt;
            if (a.delay > 0)
            {
                if (t.hidden)
                    return;
            }
            else
            {
                if (t.hidden)
                {
                    t.hidden = false;
                    if (!ZL.headless)
                        t.w.SetEnabled(true);
                }

                a.t = Math.min(1, a.t + dt/a.dur);
                t.y = ZL.lerp(a.fromY, a.toY, a.t*a.t); // gravity: accelerates down
                if (t.fadeIn) // invisible a cell above the top row, opaque once inside the tray
                    t.alpha = ZL.clamp(1 - (t.y - ZL.cellCenter(0, ZL.cfg.size - 1).y)/ZL.cfg.cell, 0, 1);
                if (a.t >= 1)
                {
                    t.y = a.toY;
                    t.alpha = 1;
                    t.fadeIn = false;
                    t.anim = null;
                }
            }
        }

        if (!ZL.headless)
            this._Apply(t);
    }
};
