// Модель движения плиток при обвале: у клетки вертикальный офсет в клетках
// (0 — на месте, больше — выше цели). Колонка — стек: плитка не опускается ниже
// плитки под ней, поэтому наложений нет при любом каскаде. Спавны входят из-за
// верхней границы и скрыты, пока не покажутся в поле. Отображение только читает
WordBoardMotion = class WordBoardMotion
{
    constructor()
    {
        this._columns = 0;
        this._rows = 0;
        this._fallSpeed = 9.5;    // клеток/с
        this._cascadeDelay = 0.05;
        this._spawnGap = 0.6;     // зазор над полем перед первой спавн-плиткой
        this._grid = [];          // [column][row] {offset, delay, active}
    }

    static _NewMotion() { return { offset: 0, delay: 0, active: false }; }

    // При тех же размерах текущее движение не сбрасывается: рестарт обвала продолжается от офсетов
    Configure(columns, rows, fallSpeedCells, cascadeDelay, spawnGap)
    {
        this._fallSpeed = fallSpeedCells;
        this._cascadeDelay = cascadeDelay;
        this._spawnGap = spawnGap;

        if (this._columns == columns && this._rows == rows)
            return;

        this._columns = columns;
        this._rows = rows;
        this._grid = [];
        for (var c = 0; c < columns; c++)
        {
            var column = [];
            for (var r = 0; r < rows; r++)
                column.push(WordBoardMotion._NewMotion());
            this._grid.push(column);
        }
    }

    // Запускает движение по ходу moved [{c, fromR, toR}] и спавнам [{c, r}]
    StartCollapse(moved, spawned)
    {
        var previous = this._grid;
        this._grid = previous.map(function(column) { return column.map(function() { return WordBoardMotion._NewMotion(); }); });

        for (var i = 0; i < moved.length; i++)
        {
            var move = moved[i];
            if (move.c < 0 || move.c >= this._columns || move.toR < 0 || move.toR >= this._rows)
                continue;

            var motion = this._grid[move.c][move.toR];
            motion.active = true;
            motion.offset = move.fromR - move.toR;
            if (move.fromR >= 0 && move.fromR < this._rows && previous[move.c][move.fromR].active)
                motion.offset += previous[move.c][move.fromR].offset;
        }

        // спавны колонки стопкой из-за верхней границы: нижний сразу над полем, следующие выше
        var lowestSpawnRow = [];
        for (var c = 0; c < this._columns; c++)
            lowestSpawnRow.push(this._rows);

        for (var i = 0; i < spawned.length; i++)
        {
            if (this._IsValid(spawned[i]))
                lowestSpawnRow[spawned[i].c] = Math.min(lowestSpawnRow[spawned[i].c], spawned[i].r);
        }

        for (var i = 0; i < spawned.length; i++)
        {
            var cell = spawned[i];
            if (!this._IsValid(cell))
                continue;

            var motion = this._grid[cell.c][cell.r];
            motion.active = true;
            motion.offset = (this._rows - lowestSpawnRow[cell.c]) + this._spawnGap;
        }

        // каскад: плитки колонки стартуют снизу вверх с общей паузой
        for (var c = 0; c < this._columns; c++)
        {
            var index = 0;
            for (var r = 0; r < this._rows; r++)
            {
                if (this._grid[c][r].active)
                    this._grid[c][r].delay = (index++)*this._cascadeDelay;
            }
        }

        // даже на неточных входных данных плитка не начинает ниже плитки под собой
        for (var c = 0; c < this._columns; c++)
        {
            for (var r = 1; r < this._rows; r++)
            {
                var motion = this._grid[c][r];
                if (motion.active)
                    motion.offset = Math.max(motion.offset, this._grid[c][r - 1].offset);
            }
        }
    }

    Update(dt)
    {
        for (var c = 0; c < this._columns; c++)
        {
            for (var r = 0; r < this._rows; r++)
            {
                var motion = this._grid[c][r];
                if (!motion.active)
                    continue;

                if (motion.delay > 0)
                {
                    motion.delay -= dt;
                    if (motion.delay > 0)
                        continue;
                }

                motion.offset -= this._fallSpeed*dt;

                if (r > 0 && this._grid[c][r - 1].active)
                    motion.offset = Math.max(motion.offset, this._grid[c][r - 1].offset);

                if (motion.offset <= 0)
                {
                    motion.offset = 0;
                    motion.active = false;
                }
            }
        }
    }

    Finish()
    {
        this._grid = this._grid.map(function(column) { return column.map(function() { return WordBoardMotion._NewMotion(); }); });
    }

    IsAnimating()
    {
        for (var c = 0; c < this._grid.length; c++)
        {
            for (var r = 0; r < this._grid[c].length; r++)
            {
                if (this._grid[c][r].active)
                    return true;
            }
        }
        return false;
    }

    GetOffset(cell)
    {
        return this._IsValid(cell) ? this._grid[cell.c][cell.r].offset : 0;
    }

    // Плитка ещё за верхней границей поля (центр выше верхнего ряда)
    IsHidden(cell)
    {
        if (!this._IsValid(cell))
            return false;

        var motion = this._grid[cell.c][cell.r];
        return motion.active && cell.r + motion.offset > this._rows - 0.5;
    }

    _IsValid(cell)
    {
        return cell.c >= 0 && cell.c < this._columns && cell.r >= 0 && cell.r < this._rows;
    }
};
