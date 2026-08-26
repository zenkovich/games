// Game root: round state and timer, pointer handling (mouse and touch come through
// the same bridge cursor), scoring, best score persistence
ZL.Game = class
{
    constructor(rootActor)
    {
        this.root = rootActor;
        this.state = "idle";      // "playing" | "gameover"
        this.score = 0;
        this.best = 0;
        this.moves = 0;
        this.timeLeft = 0;
        this.board = null;
        this.dragging = false;
        this.lastPointer = null;
        this._wasDown = false;
    }

    Start()
    {
        this.best = this._LoadBest();

        if (!ZL.headless)
            this.bg = ZL.makeSprite(this.root, "ZeroLine/bg.png", ZL.W, ZL.H, 0);

        this.view = new ZL.BoardView(this.root);
        this.hud = new ZL.Hud(this.root);
        let self = this;
        this.popup = new ZL.Popup(this.root, function() { self.Restart(); });

        this.NewRound();
    }

    NewRound()
    {
        this.board = new ZL.Board();
        this.view.Build(this.board);
        this.score = 0;
        this.moves = 0;
        this.timeLeft = ZL.cfg.roundTime;
        this.state = "playing";
        this.dragging = false;
        this.lastPointer = null;

        this.hud.SetScore(0, false);
        this.hud.SetBest(this.best);
        this.hud.SetTime(ZL.cfg.roundTime);
        this.hud.ShowIdle();
        this.popup.Hide();
    }

    Restart()
    {
        this.NewRound();
    }

    // ------------------------------------------------------------ pointer
    PointerDown(pos)
    {
        if (this.state != "playing")
            return;

        this.dragging = true;
        this.lastPointer = pos;
        let cell = ZL.cellAt(pos.x, pos.y);
        if (cell)
            this._Step(cell);
    }

    PointerMove(pos)
    {
        if (!this.dragging || this.state != "playing")
            return;

        // sample the path since the last event so a fast swipe doesn't skip tiles
        let from = this.lastPointer || pos;
        let dist = Math.hypot(pos.x - from.x, pos.y - from.y);
        let steps = Math.max(1, Math.ceil(dist/(ZL.cfg.cell*0.25)));
        for (let i = 1; i <= steps; i++)
        {
            let k = i/steps;
            let cell = ZL.cellAt(ZL.lerp(from.x, pos.x, k), ZL.lerp(from.y, pos.y, k));
            if (cell)
                this._Step(cell);
        }

        this.lastPointer = pos;
    }

    PointerUp()
    {
        if (!this.dragging)
            return;

        this.dragging = false;
        this.lastPointer = null;
        if (this.state != "playing")
            return;

        if (this.board.IsReady())
        {
            let center = this._SelectionCenter();
            let result = this.board.Commit();
            this.view.PlayMove(result);
            this.AddScore(result.score, center);
            this.moves++;
        }
        else
            this.board.ClearSelection();

        this._RefreshSelection();
    }

    _Step(cell)
    {
        let sel = this.board.selection;
        let last = sel[sel.length - 1];
        if (last && last.c == cell.c && last.r == cell.r)
            return;

        if (this.board.Select(cell.c, cell.r) != "ignored")
            this._RefreshSelection();
    }

    _RefreshSelection()
    {
        let ready = this.board.IsReady();
        this.view.SetSelection(this.board.selection, ready);
        if (this.board.selection.length > 0)
            this.hud.ShowSelection(this.board.SelectedValues(), ready);
        else
            this.hud.ShowIdle();
    }

    _SelectionCenter()
    {
        let x = 0, y = 0, n = this.board.selection.length;
        for (let s of this.board.selection)
        {
            let p = ZL.cellCenter(s.c, s.r);
            x += p.x;
            y += p.y;
        }
        return { x: x/n, y: y/n };
    }

    CancelSelection()
    {
        this.board.ClearSelection();
        this.dragging = false;
        this.lastPointer = null;
        this._RefreshSelection();
    }

    // ------------------------------------------------------------ round
    AddScore(points, at)
    {
        this.score += points;
        this.hud.SetScore(this.score, true);
        this.hud.FloatScore("+" + points, at.x, at.y);
    }

    EndGame()
    {
        if (this.state != "playing")
            return;

        this.state = "gameover";
        this.CancelSelection();
        this.timeLeft = 0;
        this.hud.SetTime(0);
        this.hud.ShowTimeUp();

        let isNewBest = this.score > this.best;
        if (isNewBest)
        {
            this.best = this.score;
            this._SaveBest();
            this.hud.SetBest(this.best);
        }

        this.popup.Show(this.score, this.best, isNewBest);
    }

    _ProcessInput()
    {
        if (ZL.headless)
            return;

        let down = Bridge.IsCursorDown();
        if (down && !this._wasDown)
            this.PointerDown(ZL.cursorUI());
        else if (down)
            this.PointerMove(ZL.cursorUI());

        if (!down && this._wasDown)
        {
            this.PointerMove(ZL.cursorUI());
            this.PointerUp();
        }

        this._wasDown = down;
    }

    Update(dt)
    {
        dt = Math.min(dt, 0.1); // a long hitch must not eat the round timer

        if (this.state == "playing")
        {
            this._ProcessInput();

            this.timeLeft -= dt;
            let shown = Math.max(0, Math.ceil(this.timeLeft));
            if (shown != this.hud.time)
                this.hud.SetTime(shown);

            if (this.timeLeft <= 0)
                this.EndGame();
        }
        else
        {
            // keep the edge tracking in sync so the next round starts from a clean press
            if (!ZL.headless)
                this._wasDown = Bridge.IsCursorDown();
        }

        this.view.Update(dt);
        this.hud.Update(dt);
    }

    // ------------------------------------------------------------ persistence
    _LoadBest()
    {
        try
        {
            let raw = Bridge.LoadText(ZL.cfg.saveName);
            if (!raw)
                return 0;

            let data = JSON.parse(raw);
            return (data && data.best > 0) ? Math.floor(data.best) : 0;
        }
        catch (e)
        {
            return 0;
        }
    }

    _SaveBest()
    {
        try
        {
            Bridge.SaveText(ZL.cfg.saveName, JSON.stringify({ best: this.best }));
        }
        catch (e)
        {
            Bridge.Log("ZeroLine: best score not saved - " + e);
        }
    }
};
