// Board model: the grid of values, the line being drawn, removal with gravity and
// refill, scoring. Pure logic — no scene objects, runs headless
ZL.Board = class
{
    constructor(rng)
    {
        this.size = ZL.cfg.size;
        this.rng = rng || Math.random;
        this.cells = [];      // cells[c][r], row 0 at the bottom
        this.selection = [];  // [{c, r}] in drawing order
        for (let c = 0; c < this.size; c++)
        {
            this.cells.push([]);
            for (let r = 0; r < this.size; r++)
                this.cells[c].push(0);
        }

        this.Fill();
    }

    Fill()
    {
        let fresh = [];
        for (let c = 0; c < this.size; c++)
        {
            for (let r = 0; r < this.size; r++)
            {
                this.cells[c][r] = this.GenerateValue();
                fresh.push({ c: c, r: r });
            }
        }

        this.EnsureSolvable(fresh);
    }

    Get(c, r) { return this.cells[c][r]; }

    // rows[0] is the top row, as it reads on screen
    LoadRows(rows)
    {
        for (let i = 0; i < rows.length; i++)
        {
            for (let c = 0; c < this.size; c++)
                this.cells[c][this.size - 1 - i] = rows[i][c];
        }

        this.selection = [];
    }

    Rows()
    {
        let rows = [];
        for (let r = this.size - 1; r >= 0; r--)
        {
            let row = [];
            for (let c = 0; c < this.size; c++)
                row.push(this.cells[c][r]);
            rows.push(row);
        }
        return rows;
    }

    IsFull()
    {
        for (let c = 0; c < this.size; c++)
        {
            for (let r = 0; r < this.size; r++)
            {
                let v = this.cells[c][r];
                if (typeof v !== 'number' || isNaN(v) || v < -9 || v > 9)
                    return false;
            }
        }
        return true;
    }

    // ------------------------------------------------------------ generation
    GenerateValue()
    {
        let w = ZL.cfg.weights;
        let total = 0;
        for (let i = 0; i < w.length; i++)
            total += w[i];

        let roll = this.rng()*total;
        let abs = w.length - 1;
        for (let i = 0; i < w.length; i++)
        {
            roll -= w[i];
            if (roll < 0)
            {
                abs = i;
                break;
            }
        }

        if (abs == 0)
            return 0;

        return this.rng() < this.PositiveChance() ? abs : -abs;
    }

    // Leans the sign towards whatever the board is short of, so it can't drift
    // into an all-positive (unsolvable) field
    PositiveChance()
    {
        let pos = 0, neg = 0;
        for (let c = 0; c < this.size; c++)
        {
            for (let r = 0; r < this.size; r++)
            {
                let v = this.cells[c][r];
                if (v > 0) pos++;
                else if (v < 0) neg++;
            }
        }

        let total = pos + neg;
        if (total == 0)
            return 0.5;

        return ZL.clamp(0.5 - 0.5*(pos - neg)/total, 0.2, 0.8);
    }

    Neighbours(c, r)
    {
        let res = [];
        if (c > 0) res.push({ c: c - 1, r: r });
        if (c < this.size - 1) res.push({ c: c + 1, r: r });
        if (r > 0) res.push({ c: c, r: r - 1 });
        if (r < this.size - 1) res.push({ c: c, r: r + 1 });
        return res;
    }

    // Any line of 2..maxLineCheck neighbouring tiles that sums to zero, or null
    FindMove()
    {
        let visited = [];
        for (let c = 0; c < this.size; c++)
            visited.push(new Array(this.size).fill(false));

        for (let c = 0; c < this.size; c++)
        {
            for (let r = 0; r < this.size; r++)
            {
                visited[c][r] = true;
                let path = this._Search([{ c: c, r: r }], this.cells[c][r], visited);
                visited[c][r] = false;
                if (path)
                    return path;
            }
        }

        return null;
    }

    _Search(path, sum, visited)
    {
        let last = path[path.length - 1];
        for (let n of this.Neighbours(last.c, last.r))
        {
            if (visited[n.c][n.r])
                continue;

            let next = sum + this.cells[n.c][n.r];
            if (path.length + 1 >= ZL.cfg.minLine && next == 0)
                return path.concat([n]);

            if (path.length + 1 < ZL.cfg.maxLineCheck)
            {
                visited[n.c][n.r] = true;
                let res = this._Search(path.concat([n]), next, visited);
                visited[n.c][n.r] = false;
                if (res)
                    return res;
            }
        }

        return null;
    }

    // Rerolls the freshly generated cells until the board has a move; as a last resort
    // one of them becomes the exact answer for a neighbour
    EnsureSolvable(fresh)
    {
        if (fresh.length == 0)
            return;

        for (let attempt = 0; attempt < ZL.cfg.solvableTries; attempt++)
        {
            if (this.FindMove())
                return;

            for (let f of fresh)
                this.cells[f.c][f.r] = this.GenerateValue();
        }

        if (this.FindMove())
            return;

        let f = fresh[Math.floor(this.rng()*fresh.length)];
        let around = this.Neighbours(f.c, f.r);
        let n = around[Math.floor(this.rng()*around.length)];
        this.cells[f.c][f.r] = -this.cells[n.c][n.r];
    }

    // ------------------------------------------------------------ selection
    IsAdjacent(a, b) { return Math.abs(a.c - b.c) + Math.abs(a.r - b.r) == 1; }

    IsSelected(c, r) { return this.selection.some(s => s.c == c && s.r == r); }

    // Extends the line with the cell: "added", "undo" (stepped back onto the previous
    // cell — the last one leaves the line) or "ignored"
    Select(c, r)
    {
        if (c < 0 || r < 0 || c >= this.size || r >= this.size)
            return "ignored";

        let n = this.selection.length;
        if (n == 0)
        {
            this.selection.push({ c: c, r: r });
            return "added";
        }

        if (n >= 2)
        {
            let prev = this.selection[n - 2];
            if (prev.c == c && prev.r == r)
            {
                this.selection.pop();
                return "undo";
            }
        }

        if (this.IsSelected(c, r))
            return "ignored";

        if (!this.IsAdjacent(this.selection[n - 1], { c: c, r: r }))
            return "ignored";

        this.selection.push({ c: c, r: r });
        return "added";
    }

    SelectedValues() { return this.selection.map(s => this.cells[s.c][s.r]); }

    Sum()
    {
        let sum = 0;
        for (let s of this.selection)
            sum += this.cells[s.c][s.r];
        return sum;
    }

    IsReady() { return this.selection.length >= ZL.cfg.minLine && this.Sum() == 0; }

    ClearSelection() { this.selection = []; }

    // ------------------------------------------------------------ resolution
    static ScoreFor(values)
    {
        let score = 0;
        for (let v of values)
            score += Math.abs(v)*ZL.cfg.scorePerUnit + (v == 0 ? ZL.cfg.zeroBonus : 0);
        return score;
    }

    // Removes the ready line: survivors drop down their columns, new values enter from
    // the top. Returns everything the view needs to animate the move
    Commit()
    {
        if (!this.IsReady())
            return { ok: false };

        let removed = this.selection.map(s => ({ c: s.c, r: s.r, value: this.cells[s.c][s.r] }));
        let score = ZL.Board.ScoreFor(removed.map(t => t.value));
        this.selection = [];

        let gone = [];
        for (let c = 0; c < this.size; c++)
            gone.push(new Array(this.size).fill(false));
        for (let t of removed)
            gone[t.c][t.r] = true;

        let falls = [], spawns = [];
        for (let c = 0; c < this.size; c++)
        {
            let column = [];
            for (let r = 0; r < this.size; r++)
            {
                if (!gone[c][r])
                    column.push({ r: r, value: this.cells[c][r] });
            }

            for (let i = 0; i < column.length; i++)
            {
                if (column[i].r != i)
                    falls.push({ c: c, fromR: column[i].r, toR: i, value: column[i].value });
                this.cells[c][i] = column[i].value;
            }

            for (let r = column.length; r < this.size; r++)
            {
                this.cells[c][r] = this.GenerateValue();
                spawns.push({ c: c, r: r, value: 0, order: r - column.length });
            }
        }

        this.EnsureSolvable(spawns);
        for (let s of spawns)
            s.value = this.cells[s.c][s.r];

        return { ok: true, removed: removed, score: score, falls: falls, spawns: spawns };
    }
};
