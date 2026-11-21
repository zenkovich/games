// Layouts of blockers and bonuses, the way match-3 boards are laid out: mirror symmetry about the middle column,
// whole rows and columns, 2×2 blocks, a ring around a bonus, a checkerboard band, the frame of the shape, the
// bottom to dig through, the top where things fall from. Bonuses come in mirrored pairs, a row of three or one in
// the middle, and sit where they help: inside a block of crates, at the ends of an ice row, under the snow.
//
// A pattern lists its cells as groups: one cell in the middle column or a mirrored pair. Groups are taken whole,
// in the pattern's order (rows from the middle outwards, blocks corner first), so a layout cut short to the count
// still looks designed.
import { columns, rows } from './shapes.mjs';

const key = (x, y) => x + ',' + y;
const mid = (columns - 1)/2;

function groupOf(x, y)
{
    const mirror = columns - 1 - x;
    return mirror == x ? [{ x, y }] : [{ x: Math.min(x, mirror), y }, { x: Math.max(x, mirror), y }];
}

// Pattern generators: (layout, rng) -> [groups]; a group is [{x, y}] of one or two cells
const patterns = {
    // whole rows from the middle outwards, rows in the given order
    rows: (layout, rng, zone) => {
        const ys = layout.rowsIn(zone, rng);
        const groups = [];
        for (const y of ys)
            for (let d = 0; d <= mid; d++)
                groups.push(groupOf(mid - d, y));
        return groups;
    },
    // rows from the edges inwards: bands touching the sides
    rowsOuter: (layout, rng, zone) => {
        const groups = [];
        for (const y of layout.rowsIn(zone, rng))
            for (let d = mid; d >= 0; d--)
                groups.push(groupOf(mid - d, y));
        return groups;
    },
    // mirrored 2×2 blocks, one pair of blocks per band of two rows
    blocks: (layout, rng, zone) => {
        const groups = [];
        const ys = layout.rowsIn(zone, rng).filter((y) => y + 1 < rows);
        const x0 = rng.pick([0, 1]);
        for (const y of ys.filter((y, i) => i % 2 == 0))
            for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]])
                groups.push(groupOf(x0 + dx, y + dy));
        return groups;
    },
    // a 3-wide block in the middle
    center: (layout, rng, zone) => {
        const groups = [];
        for (const y of layout.rowsIn(zone, rng))
            groups.push(groupOf(mid, y), groupOf(mid - 1, y));
        return groups;
    },
    // vertical lines at a mirrored pair of columns
    columns: (layout, rng, zone) => {
        const x = rng.pick([0, 1, 2]);
        return layout.rowsIn(zone, rng).sort((a, b) => a - b).map((y) => groupOf(x, y));
    },
    // the eight cells around the middle of a row — the middle itself is left for a bonus
    ring: (layout, rng, zone) => {
        const ys = layout.rowsIn(zone, rng).filter((y) => y > 0 && y < rows - 1);
        const cy = ys.length > 0 ? ys[Math.floor(ys.length/2)] : 3;
        layout.hint.ringCenter = { x: mid, y: cy };
        return [groupOf(mid, cy + 1), groupOf(mid, cy - 1), groupOf(mid - 1, cy), groupOf(mid - 1, cy + 1), groupOf(mid - 1, cy - 1)];
    },
    // a checkerboard band; mirrored cells share the colour since the board is odd-wide
    checker: (layout, rng, zone) => {
        const parity = rng.int(2);
        const groups = [];
        for (const y of layout.rowsIn(zone, rng))
            for (let x = 0; x <= mid; x++)
                if ((x + y) % 2 == parity)
                    groups.push(groupOf(x, y));
        return groups;
    },
    // the diagonals of an X through the middle
    cross: (layout, rng) => {
        const cy = rng.pick([3, 4]);
        const groups = [groupOf(mid, cy)];
        for (let d = 1; d <= 3; d++)
            groups.push(groupOf(mid - d, cy + d), groupOf(mid - d, cy - d));
        return groups;
    },
    // a V from the top corners to the middle of the bottom
    vee: (layout) => {
        const groups = [];
        for (let d = 0; d <= mid; d++)
            groups.push(groupOf(d, rows - 1 - d));
        return groups;
    },
    // cells of the shape's edge, corners first
    frame: (layout) => {
        const edge = layout.cells.filter((cell) => layout.isEdge(cell.x, cell.y) && cell.x <= mid);
        edge.sort((a, b) => layout.cornerness(b) - layout.cornerness(a) || a.y - b.y);
        return edge.map((cell) => groupOf(cell.x, cell.y));
    },
    // the lowest cells of every column, row by row: the part of the board to dig through
    bottom: (layout) => {
        const groups = [];
        for (let level = 0; level < 3; level++)
            for (let x = 0; x <= mid; x++)
            {
                const y = layout.columnCells(x)[level];
                if (y !== undefined)
                    groups.push(groupOf(x, y));
            }
        return groups;
    },
    // the highest cells of every column: where falling things come from
    top: (layout) => {
        const groups = [];
        for (let level = 0; level < 2; level++)
            for (let x = mid; x >= 0; x--)
            {
                const cells = layout.columnCells(x);
                const y = cells[cells.length - 1 - level];
                if (y !== undefined)
                    groups.push(groupOf(x, y));
            }
        return groups;
    },
    // a few cells in each corner of the shape
    corners: (layout) => {
        const groups = [];
        const sorted = layout.cells.filter((cell) => cell.x <= mid).sort((a, b) => layout.cornerness(b) - layout.cornerness(a));
        for (const cell of sorted.slice(0, 8))
            groups.push(groupOf(cell.x, cell.y));
        return groups;
    }
};

// Which patterns suit a kind of blocker, and where on the board
const plans = {
    crates: [['blocks', 'low'], ['bottom'], ['rows', 'low'], ['ring', 'mid'], ['center', 'mid'], ['columns', 'low'], ['checker', 'low']],
    ice: [['rows', 'mid'], ['checker', 'mid'], ['frame'], ['cross'], ['corners'], ['rowsOuter', 'low'], ['ring', 'mid'], ['vee']],
    snow: [['top'], ['rows', 'high'], ['blocks', 'high'], ['rowsOuter', 'high']],
    stones: [['corners'], ['columns', 'mid'], ['center', 'mid'], ['rowsOuter', 'mid']],
    // a chain starves the cells under it until its letter is used: chains hang in the middle, not at the top
    chains: [['rows', 'mid'], ['rowsOuter', 'mid'], ['checker', 'mid'], ['rows', 'low']],
    parcels: [['top']]
};

export const patternNames = {
    rows: 'ряды', rowsOuter: 'ряды от краёв', blocks: 'блоки 2×2', center: 'центр', columns: 'колонны', ring: 'кольцо', checker: 'шахматка',
    cross: 'крест', vee: 'клин', frame: 'рамка', bottom: 'дно', top: 'верх', corners: 'углы', pairs: 'пары', trio: 'тройка'
};

export class Layout
{
    // holes: [{x, y}] of the shape; taken: cells already used
    constructor(rng, holes, taken)
    {
        this.rng = rng;
        this.holes = new Set((holes || []).map((cell) => key(cell.x, cell.y)));
        this.taken = new Set((taken || []).map((cell) => key(cell.x, cell.y)));
        this.cells = [];
        for (let x = 0; x < columns; x++)
            for (let y = 0; y < rows; y++)
                if (!this.holes.has(key(x, y)))
                    this.cells.push({ x, y });
        this.zonesUsed = [];
        this.placed = {};    // kind -> cells
        this.used = [];      // [{kind, pattern, zone}]
        this.hint = {};
    }

    inside(x, y) { return x >= 0 && x < columns && y >= 0 && y < rows && !this.holes.has(key(x, y)); }
    free(x, y) { return this.inside(x, y) && !this.taken.has(key(x, y)); }

    isEdge(x, y)
    {
        return !this.inside(x - 1, y) || !this.inside(x + 1, y) || !this.inside(x, y - 1) || !this.inside(x, y + 1);
    }

    cornerness(cell)
    {
        let outside = 0;
        for (let dx = -1; dx <= 1; dx++)
            for (let dy = -1; dy <= 1; dy++)
                outside += (dx || dy) && !this.inside(cell.x + dx, cell.y + dy) ? 1 : 0;
        return outside;
    }

    // Playable rows of a column, bottom up
    columnCells(x)
    {
        const result = [];
        for (let y = 0; y < rows; y++)
            if (this.inside(x, y))
                result.push(y);
        return result;
    }

    // Rows of a zone (low, mid, high) in a designed order: the zone's middle first
    rowsIn(zone, rng)
    {
        const ranges = { low: [0, 1, 2], mid: [3, 4, 2, 5], high: [6, 5, 7, 4] };
        let ys = ranges[zone] || [0, 1, 2, 3, 4, 5, 6, 7];
        if (zone == 'low')
            ys = rng.chance(0.5) ? [0, 1, 2] : [1, 0, 2];
        return ys.filter((y) => this.cells.some((cell) => cell.y == y));
    }

    take(cells, kind)
    {
        for (const cell of cells)
            this.taken.add(key(cell.x, cell.y));
        this.placed[kind] = (this.placed[kind] || []).concat(cells);
        return cells;
    }

    // Groups whose cells are all free; a pair cut by an asymmetric shape keeps its playable half
    _Usable(groups)
    {
        const result = [];
        const seen = new Set();
        for (const group of groups)
        {
            const cells = group.filter((cell) => this.free(cell.x, cell.y) && !seen.has(key(cell.x, cell.y)));
            if (cells.length == 0 || (cells.length < group.length && group.some((cell) => this.inside(cell.x, cell.y) && !this.free(cell.x, cell.y))))
                continue;
            cells.forEach((cell) => seen.add(key(cell.x, cell.y)));
            result.push(cells);
        }
        return result;
    }

    // Takes whole groups up to count; an odd remainder goes to the middle column when it can
    _Fill(groups, count)
    {
        const chosen = [];
        let left = count;
        const singles = groups.filter((group) => group.length == 1);
        for (const group of groups)
        {
            if (left <= 0)
                break;
            if (group.length > left)
            {
                const single = singles.find((other) => !chosen.includes(other) && other.length <= left);
                if (single)
                {
                    chosen.push(single);
                    left -= single.length;
                }
                continue;
            }
            if (chosen.includes(group))
                continue;
            chosen.push(group);
            left -= group.length;
        }
        return chosen.flat();
    }

    // Lays out count blockers of a kind; returns the cells (fewer when the board has no room)
    place(kind, count)
    {
        if (count <= 0)
            return [];
        const plan = plans[kind] || [['rows']];
        const options = this.rng.shuffle(plan.slice());
        // a zone already given to another blocker is tried last: blockers of a level share the board, not cells
        options.sort((a, b) => (this.zonesUsed.includes(a[1]) ? 1 : 0) - (this.zonesUsed.includes(b[1]) ? 1 : 0));
        let best = null;
        for (const [pattern, zone] of options)
        {
            const groups = this._Usable(patterns[pattern](this, this.rng, zone));
            const cells = this._Fill(groups, count);
            const score = Math.min(cells.length, count) - (this.zonesUsed.includes(zone) ? 0.5 : 0);
            if (!best || score > best.score)
                best = { cells, pattern, zone, score };
            if (cells.length >= count)
                break;
        }
        if (!best || best.cells.length == 0)
            return [];
        if (best.zone)
            this.zonesUsed.push(best.zone);
        this.used.push({ kind, pattern: best.pattern, zone: best.zone || '' });
        return this.take(best.cells, kind);
    }

    // Bonuses: a ring's middle, then mirrored pairs where blockers are thickest around, then the middle column
    placeBonuses(count, kinds)
    {
        const cells = [];
        const result = [];
        const blockers = new Set(Object.entries(this.placed).filter(([kind]) => kind != 'parcels' && kind != 'chains')
            .flatMap(([, list]) => list.map((cell) => key(cell.x, cell.y))));
        const weight = (cell) => {
            let near = 0;
            for (let dx = -1; dx <= 1; dx++)
                for (let dy = -1; dy <= 1; dy++)
                    near += (dx || dy) && blockers.has(key(cell.x + dx, cell.y + dy)) ? 1 : 0;
            return near*3 - Math.abs(cell.y - 3.5)*0.4 - Math.abs(cell.x - mid)*0.2;
        };

        if (this.hint.ringCenter && this.free(this.hint.ringCenter.x, this.hint.ringCenter.y) && count > 0)
        {
            cells.push([this.hint.ringCenter]);
            this.used.push({ kind: 'bonus', pattern: 'ring', zone: '' });
        }

        const groups = [];
        for (const cell of this.cells)
        {
            if (cell.x > mid || !this.free(cell.x, cell.y))
                continue;
            const group = groupOf(cell.x, cell.y).filter((item) => this.free(item.x, item.y));
            if (group.length == groupOf(cell.x, cell.y).length)
                groups.push({ group, weight: group.reduce((sum, item) => sum + weight(item), 0)/group.length + (group.length == 2 ? 0.5 : 0) + this.rng()*0.6 });
        }
        groups.sort((a, b) => b.weight - a.weight);

        let left = count - cells.flat().length;
        // a row of three: the pair and the middle of the same row
        if (left == 3)
        {
            const pair = groups.find((item) => item.group.length == 2 && this.free(mid, item.group[0].y));
            if (pair)
            {
                cells.push(pair.group, [{ x: mid, y: pair.group[0].y }]);
                left = 0;
                this.used.push({ kind: 'bonus', pattern: 'trio', zone: '' });
            }
        }
        for (const item of groups)
        {
            if (left <= 0)
                break;
            if (item.group.length > left || cells.some((group) => group.some((cell) => item.group.some((other) => other.x == cell.x && other.y == cell.y))))
                continue;
            cells.push(item.group);
            left -= item.group.length;
        }

        if (cells.length > 0 && !this.used.some((item) => item.kind == 'bonus'))
            this.used.push({ kind: 'bonus', pattern: cells.every((group) => group.length == 2) ? 'pairs' : 'center', zone: '' });

        // a mirrored pair gets one kind; the middle may get another
        for (const group of cells)
        {
            const kind = kinds.length > 0 ? this.rng.pick(kinds) : 'bomb';
            for (const cell of group)
                result.push({ cell, kind });
        }
        this.take(result.map((item) => item.cell), 'bonus');
        return result;
    }
}

// Keeps a level's blockers and bonuses (their kinds and counts) and lays them out anew on its shape
export function relayout(level, rng)
{
    const layout = new Layout(rng, level.holeCells || [], []);
    const out = { ...level };
    const count = (name) => (level[name] || []).length;
    if (count('parcelCells') > 0)
        out.parcelCells = layout.place('parcels', count('parcelCells'));
    const order = ['crateCells', 'iceCells', 'snowCells', 'stoneCells', 'chainCells']
        .filter((name) => count(name) > 0).sort((a, b) => count(b) - count(a));
    const kinds = { crateCells: 'crates', iceCells: 'ice', snowCells: 'snow', stoneCells: 'stones', chainCells: 'chains' };
    for (const name of order)
    {
        const cells = layout.place(kinds[name], count(name));
        out[name] = cells;
        if (name == 'crateCells')
        {
            const grades = (level.crateGrades || []).slice().sort((a, b) => b - a);
            out.crateGrades = cells.map((cell, i) => grades[i] || 1);
        }
    }
    if (count('powerupCells') > 0)
    {
        const kindsUsed = [...new Set(level.powerupKinds || ['bomb'])];
        const bonuses = layout.placeBonuses(count('powerupCells'), kindsUsed);
        out.powerupCells = bonuses.map((item) => item.cell);
        out.powerupKinds = bonuses.map((item) => item.kind);
    }
    // a letter fixed by the level stays where it was when its cell is still free
    return { level: out, used: layout.used };
}
