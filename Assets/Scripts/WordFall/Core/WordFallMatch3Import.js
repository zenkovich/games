include("Scripts/WordFall/Core/WordFallConfigs.js");

// Импорт поля из уровня игры «три в ряд» (XML уровней Gardenscapes и Homescapes): форма поля
// и препятствия переносятся в уровень Word Fall, слова и задачи уровня остаются свои.
// Gardenscapes: <Line> — ряд сверху вниз, <Cell exists="true" box=.. box_level=.. locks=..
// stone=.. ground_level=../>, <Cell /> — дыра. Homescapes: <Cell x y> с вложенными
// <Model modelId="BOX|LOCK|ICE|..." level=../>, ряды снизу вверх по y, ходы — movesLimitLocal.
// Поле больше 7×8 обрезается окном, где больше всего клеток
WordFallMatch3Import = class WordFallMatch3Import
{
    static LooksLikeMatch3(text)
    {
        return typeof text == "string" && /<Level\b/.test(text) && /<(Line|Cell)\b/.test(text);
    }

    // Разбор XML: {ok, format, width, height, moves, cells: [{x, y (сверху), crate, ice, stone, chain, powerup}], message}
    static Parse(text)
    {
        if (!WordFallMatch3Import.LooksLikeMatch3(text))
            return { ok: false, message: "Файл не похож на уровень «три в ряд»" };

        var tags = WordFallMatch3Import._Tags(text);
        var level = null, line = null, cell = null;
        var lines = [];
        for (var i = 0; i < tags.length; i++)
        {
            var tag = tags[i];
            if (tag.name == "Level" && !tag.closing)
                level = tag.attrs;
            else if (tag.name == "Line")
            {
                if (tag.closing)
                    line = null;
                else
                {
                    line = [];
                    lines.push(line);
                    if (tag.selfClosing)
                        line = null;
                }
            }
            else if (tag.name == "Cell")
            {
                if (tag.closing)
                    cell = null;
                else if (line)
                {
                    cell = { attrs: tag.attrs, models: [] };
                    line.push(cell);
                    if (tag.selfClosing)
                        cell = null;
                }
            }
            else if (cell && !tag.closing && (tag.name == "Model" || tag.name == "ChipModel"))
                cell.models.push(tag.attrs);
        }

        if (!level || lines.length == 0)
            return { ok: false, message: "В уровне нет поля" };

        var homescapes = lines.some(function(list) { return list.some(function(item) { return item.attrs.x !== undefined && item.attrs.y !== undefined; }); });
        var cells = homescapes ? WordFallMatch3Import._HomescapesCells(lines) : WordFallMatch3Import._GardenscapesCells(lines);
        if (cells.length == 0)
            return { ok: false, message: "В уровне нет клеток" };

        var width = 0, height = 0;
        cells.forEach(function(item) { width = Math.max(width, item.x + 1); height = Math.max(height, item.y + 1); });
        var moves = parseInt(level.movesLimitLocal || level.moves || "");
        return {
            ok: true,
            format: homescapes ? "Homescapes" : "Gardenscapes",
            width: width,
            height: height,
            moves: isNaN(moves) || moves <= 0 ? 0 : moves,
            cells: cells
        };
    }

    // Поле разобранного уровня поверх конфига base: {config, dropped, message}
    static ToLevel(parsed, base, columns, rows)
    {
        var config = WordFallConfigs.NormalizeLevel(base || WordFallConfigs.DefaultLevelConfig());
        var window = WordFallMatch3Import._Window(parsed, columns, rows);
        var inside = {};
        var dropped = 0;
        parsed.cells.forEach(function(item) {
            var c = item.x - window.x, rowFromTop = item.y - window.y;
            if (c < 0 || c >= columns || rowFromTop < 0 || rowFromTop >= rows)
            {
                dropped++;
                return;
            }
            inside[c + ":" + (rows - 1 - rowFromTop)] = item;
        });

        ["holeCells", "iceCells", "stoneCells", "crateCells", "crateGrades", "chainCells", "snowCells", "parcelCells",
         "powerupCells", "powerupKinds", "letterCells"].forEach(function(key) { config[key] = []; });
        var counts = { crate: 0, ice: 0, stone: 0, chain: 0, powerup: 0 };
        for (var c = 0; c < columns; c++)
        {
            for (var r = 0; r < rows; r++)
            {
                var item = inside[c + ":" + r];
                var at = { c: c, r: r };
                if (!item)
                {
                    config.holeCells.push(at);
                    continue;
                }
                if (item.crate > 0)
                {
                    config.crateCells.push(at);
                    config.crateGrades.push(item.crate);
                    counts.crate++;
                }
                else if (item.stone)
                {
                    config.stoneCells.push(at);
                    counts.stone++;
                }
                else if (item.powerup)
                {
                    config.powerupCells.push(at);
                    config.powerupKinds.push(item.powerup);
                    counts.powerup++;
                }
                else if (item.chain)
                {
                    config.chainCells.push(at);
                    counts.chain++;
                }
                else if (item.ice)
                {
                    config.iceCells.push(at);
                    counts.ice++;
                }
            }
        }
        if (parsed.moves > 0)
            config.moves = parsed.moves;

        var message = "Импорт " + parsed.format + ": поле " + parsed.width + "×" + parsed.height + " на " + columns + "×" + rows
            + ", клеток " + (columns*rows - config.holeCells.length) + ", ящиков " + counts.crate + ", льда " + counts.ice
            + ", цепей " + counts.chain + ", камней " + counts.stone + ", бонусов " + counts.powerup
            + (parsed.moves > 0 ? ", ходов " + parsed.moves : "") + (dropped > 0 ? "; за краем осталось " + dropped : "");
        return { config: config, dropped: dropped, message: message };
    }

    // Текст файла → уровень поверх base: {ok, config, message}
    static Import(text, base, columns, rows)
    {
        var parsed = WordFallMatch3Import.Parse(text);
        if (!parsed.ok)
            return { ok: false, message: parsed.message };

        var result = WordFallMatch3Import.ToLevel(parsed, base, columns, rows);
        return { ok: true, config: result.config, message: result.message };
    }

    static _GardenscapesCells(lines)
    {
        var cells = [];
        lines.forEach(function(line, y) {
            line.forEach(function(item, x) {
                var a = item.attrs;
                if (a.exists != "true")
                    return;
                cells.push({
                    x: x, y: y,
                    crate: a.box ? WordFallMatch3Import._Grade(a.box_level) : 0,
                    stone: !!a.stone,
                    chain: !!a.locks && a.locks != "0",
                    ice: (!!a.ground_level && a.ground_level != "0") || (!!a.is_grass && a.is_grass != "0"),
                    powerup: ""
                });
            });
        });
        return cells;
    }

    static _HomescapesCells(lines)
    {
        var raw = [];
        lines.forEach(function(line) { line.forEach(function(item) { raw.push(item); }); });
        var minX = Infinity, maxY = -Infinity;
        raw.forEach(function(item) {
            minX = Math.min(minX, parseInt(item.attrs.x));
            maxY = Math.max(maxY, parseInt(item.attrs.y));
        });

        var kinds = { BOMB: "bomb", LINE: "rocket", LIGHTNING: "fireworks", FISH: "rocket" };
        return raw.map(function(item) {
            var result = { x: parseInt(item.attrs.x) - minX, y: maxY - parseInt(item.attrs.y), crate: 0, stone: false, chain: false, ice: false, powerup: "" };
            item.models.forEach(function(model) {
                var id = model.modelId || model.type || "";
                if (id == "BOX" || id == "BOX_ST")
                    result.crate = WordFallMatch3Import._Grade(model.level);
                else if (id == "LOCK")
                    result.chain = true;
                else if (id == "ICE" || id == "HONEY")
                    result.ice = true;
                else if (id == "STATUE" || id == "TRASH_STONE")
                    result.stone = true;
                else if (kinds[id])
                    result.powerup = kinds[id];
            });
            return result;
        });
    }

    // Окно columns×rows: меньшее поле встаёт по центру, большее — туда, где больше клеток
    static _Window(parsed, columns, rows)
    {
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        parsed.cells.forEach(function(item) {
            minX = Math.min(minX, item.x); maxX = Math.max(maxX, item.x);
            minY = Math.min(minY, item.y); maxY = Math.max(maxY, item.y);
        });
        var w = maxX - minX + 1, h = maxY - minY + 1;
        var place = function(min, size, room, count) {
            if (size <= room)
                return [min - Math.floor((room - size)/2)];
            var options = [];
            for (var start = min; start + room <= min + size; start++)
                options.push(start);
            return options;
        };
        var xs = place(minX, w, columns), ys = place(minY, h, rows);
        var best = null;
        xs.forEach(function(x) {
            ys.forEach(function(y) {
                var count = 0;
                parsed.cells.forEach(function(item) {
                    if (item.x >= x && item.x < x + columns && item.y >= y && item.y < y + rows)
                        count++;
                });
                var centre = Math.abs(x + columns/2 - (minX + w/2)) + Math.abs(y + rows/2 - (minY + h/2));
                if (!best || count > best.count || (count == best.count && centre < best.centre))
                    best = { x: x, y: y, count: count, centre: centre };
            });
        });
        return best;
    }

    static _Grade(level)
    {
        var grade = parseInt(level || "1");
        return Math.min(Math.max(isNaN(grade) ? 1 : grade, 1), 3);
    }

    // Теги XML по порядку: {name, attrs, closing, selfClosing}; комментарии и заголовок пропускаются
    static _Tags(text)
    {
        var tags = [];
        var pattern = /<(\/?)([A-Za-z_][\w.-]*)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g;
        var attrPattern = /([\w:.-]+)\s*=\s*"([^"]*)"/g;
        var clean = text.replace(/<!--[\s\S]*?-->/g, "");
        var match;
        while ((match = pattern.exec(clean)) !== null)
        {
            var attrs = {};
            var attr;
            attrPattern.lastIndex = 0;
            while ((attr = attrPattern.exec(match[3])) !== null)
                attrs[attr[1]] = attr[2];
            tags.push({ name: match[2], attrs: attrs, closing: match[1] == "/", selfClosing: match[4] == "/" });
        }
        return tags;
    }
};
