include("Scripts/WordFall/Core/WordLevel.js");

// Бот-игрок: проходит уровень примерно как человек. Каждый ход он «вспоминает» слова своего словарного запаса
// (узнаваемые и простые приходят в голову чаще), проверяет, собираются ли они из букв поля, и выбирает ход
// по целям уровня. Профиль игрока, все значения 0..1:
//   erudition — словарный запас: какие слова бот вообще знает (по узнаваемости слова в словаре);
//   effort    — усидчивость: сколько вариантов слова он находит, прежде чем сыграть лучший;
//   skill     — тактика: насколько удачно берёт плитки (кластер, соседство с препятствиями и бонусами)
//               и насколько трезво взвешивает цели;
//   boosters  — охота до бустеров;
//   spread    — разброс между игроками одного профиля (каждая попытка — новый человек).
// Один и тот же код играет в симуляторе LevelLab (Tools/WordFall/LevelLab) и в самой игре (WordFallBotView)
WordFallBot = class WordFallBot
{
    static Profiles()
    {
        return {
            weak: { erudition: 0.35, effort: 0.38, skill: 0.36, boosters: 0.5, spread: 0.08 },
            average: { erudition: 0.5, effort: 0.5, skill: 0.5, boosters: 0.5, spread: 0.08 },
            strong: { erudition: 0.7, effort: 0.66, skill: 0.66, boosters: 0.5, spread: 0.08 }
        };
    }

    // Профиль одним числом 0..1 — «ум» игрока: от слабого (0) через среднего (0.5) к сильному (1)
    static ProfileOf(mind)
    {
        var profiles = WordFallBot.Profiles();
        var from = mind < 0.5 ? profiles.weak : profiles.average;
        var to = mind < 0.5 ? profiles.average : profiles.strong;
        var k = Math.min(Math.max(mind < 0.5 ? mind*2 : (mind - 0.5)*2, 0), 1);
        var profile = {};
        for (var key in from)
            profile[key] = from[key] + (to[key] - from[key])*k;
        return profile;
    }

    static NormalizeProfile(profile)
    {
        var result = WordFallBot.Profiles().average;
        for (var key in result)
        {
            if (profile && typeof profile[key] == "number" && isFinite(profile[key]))
                result[key] = Math.min(Math.max(profile[key], 0), 1);
        }
        return result;
    }

    // Доля взрослых, знающих слово узнаваемости 1..9 — шкала, по которой оценён словарь
    static get KnownShare() { return [0, 0.03, 0.1, 0.25, 0.45, 0.65, 0.85, 0.95, 0.98, 0.995]; }

    // Как узнаваемость и сложность слова меняют шанс, что оно придёт в голову (на единицу оценки)
    static get RecallByFamiliarity() { return 0.55; }
    static get RecallByDifficulty() { return 1.1; }

    // Насколько каждая буква сверх трёх режет шанс додуматься до слова у неусидчивого игрока
    static get Reach() { return 0.5; }

    // Сколько вариантов слова набирает самый усидчивый игрок, прежде чем выбрать ход
    static get Patience() { return 7; }

    constructor(profile, seed)
    {
        this.profile = WordFallBot.NormalizeProfile(profile);
        this.stats = { recalls: 0, found: 0, hints: 0, boosters: 0, stuck: 0 };
        this._random = new WordFallRandom(seed || 1);
        this._level = null;
        this._dictionary = null;
        this._tables = null;
        this._queue = [];
        this._knowLimit = new Float64Array(10);
        this._gains = 0;
        this._moves = 0;
        this._assume = null;
    }

    // Новая попытка — новый человек: запас слов и навыки в пределах разброса профиля
    Begin(level, dictionary)
    {
        this._level = level;
        this._dictionary = dictionary;
        this._tables = WordFallBot._Tables(dictionary);
        this._queue = [];
        this._gains = 0;
        this._moves = 0;
        this._persona = (Math.imul(this._random.NextInt(65536) + 1, 40503) ^ Math.imul(this._random.NextInt(65536) + 1, 2654435761)) >>> 0;

        var profile = this.profile;
        var self = this;
        var personal = function(value) { return Math.min(Math.max(value + self._Gauss()*profile.spread, 0), 1); };
        var erudition = personal(profile.erudition);
        this._effort = personal(profile.effort);
        this._skill = personal(profile.skill);
        this._recalls = Math.round(40*Math.pow(2, 3*this._effort));
        this._reach = Math.min(1, Math.exp(-WordFallBot.Reach*(0.9 - this._effort)));
        this._patience = Math.max(1, Math.round(1 + WordFallBot.Patience*Math.pow(this._effort, 1.5) + this._random.Next01() - 0.5));

        var share = WordFallBot.KnownShare;
        for (var f = 1; f <= 9; f++)
        {
            var logit = Math.log(share[f]/(1 - share[f])) + 6*(erudition - 0.5);
            this._knowLimit[f] = 4294967296/(1 + Math.exp(-logit));
        }

        if (!this._stamps || this._stamps.length != dictionary.GetWordsCount())
            this._stamps = new Int32Array(dictionary.GetWordsCount());
        this._stamp = 0;
    }

    // Бот считает, что на уровень дано столько ходов и такая цель по очкам — для прогонов, где настоящие
    // пределы сняты, чтобы записать, как шла бы игра дальше
    Assume(moves, targetScore)
    {
        this._assume = moves > 0 ? { moves: moves, targetScore: targetScore } : null;
    }

    // Знает ли этот игрок слово: зависит только от попытки и слова, а не от порядка ходов
    Knows(index)
    {
        var h = Math.imul(index + 1, 2654435761) ^ this._persona;
        h = Math.imul(h ^ (h >>> 15), 2246822519);
        h = Math.imul(h ^ (h >>> 13), 3266489917);
        h ^= h >>> 16;
        return (h >>> 0) < this._knowLimit[this._dictionary.GetFamiliarity(index)];
    }

    // Следующее действие: {type, cells, word, cell, think} — type: word (выбрать cells и принять), hint (подсказка
    // набирает слово), accept (принять набранное), hammer / joker / doubler (по клетке cell), shuffle, stuck
    // (слов не нашлось — попытка проиграна), none (уровень закончен). think — сколько секунд думал бы человек
    NextAction()
    {
        var level = this._level;
        if (!level || level.GetState() != "playing")
            return { type: "none" };

        if (this._queue.length > 0)
            return this._queue.shift();

        var view = this._Scan();
        var best = this._Choose(view, this._Recall(view));
        var booster = this._Booster(view, best);
        if (booster)
            return booster;

        if (!best)
            best = this._Choose(view, this._RecallHard(view));
        if (!best)
        {
            this.stats.stuck++;
            return { type: "stuck", think: 20 };
        }
        return this._WordAction(best);
    }

    // Исполняет действие над уровнем без вьюх; возвращает результат хода, если он был
    static Apply(level, dictionary, action)
    {
        var board = level.GetBoard();
        switch (action.type)
        {
            case "word":
                board.ClearSelection();
                for (var i = 0; i < action.cells.length; i++)
                    board.ToggleSelect(action.cells[i]);
                return level.AcceptWord(dictionary);
            case "accept": return level.AcceptWord(dictionary);
            case "hint": level.UseHint(dictionary); return null;
            case "hammer": return level.UseHammer(action.cell, dictionary);
            case "shuffle": level.UseShuffle(dictionary); return null;
            case "joker": level.UseJoker(action.cell); return null;
            case "doubler": level.UseDoubler(action.cell); return null;
        }
        return null;
    }

    // Итог принятого слова — бот помнит свой темп набора очков
    OnMove(result)
    {
        if (result && result.ok && result.word)
        {
            this._gains += result.gain;
            this._moves++;
        }
    }

    _WordAction(best)
    {
        var dictionary = this._dictionary;
        var difficulty = dictionary.GetDifficulty(best.index);
        var think = 1.5 + difficulty*0.9 + this._random.Next01()*5;
        return { type: "word", word: dictionary.GetAllWords()[best.index], cells: best.cells, think: think,
                 score: best.outcome.score, levelWord: best.levelWord };
    }

    _Gauss()
    {
        var u = Math.max(this._random.Next01(), 1e-7);
        var v = this._random.Next01();
        return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
    }

    // Веса «вспоминаемости» слов и накопленные суммы для выборки: по всему словарю и по длинам
    static _Tables(dictionary)
    {
        if (dictionary._botTables)
            return dictionary._botTables;

        var count = dictionary.GetWordsCount();
        var offsets = dictionary.GetOffsets();
        var weights = new Float64Array(count);
        var cumulative = new Float64Array(count);
        var total = 0;
        for (var i = 0; i < count; i++)
        {
            weights[i] = Math.exp(WordFallBot.RecallByFamiliarity*(dictionary.GetFamiliarity(i) - 9) -
                                  WordFallBot.RecallByDifficulty*(dictionary.GetDifficulty(i) - 1));
            total += weights[i];
            cumulative[i] = total;
        }

        var byLength = {};
        for (var length = 2; length <= WordSearch.maxBoundLength; length++)
        {
            var indices = dictionary.GetIndices(length);
            if (indices.length == 0)
                continue;
            var sums = new Float64Array(indices.length);
            var sum = 0;
            for (var k = 0; k < indices.length; k++)
            {
                sum += weights[indices[k]];
                sums[k] = sum;
            }
            byLength[length] = { indices: indices, cumulative: sums, total: sum };
        }

        var order = [];
        for (var i = 0; i < count; i++)
            order.push(i);
        order.sort(function(a, b) { return weights[b] - weights[a] || a - b; });

        dictionary._botTables = { weights: weights, cumulative: cumulative, total: total, byLength: byLength,
                                  order: Int32Array.from(order), offsets: offsets };
        return dictionary._botTables;
    }

    static _Pick(cumulative, total, roll)
    {
        var target = roll*total;
        var lo = 0, hi = cumulative.length - 1;
        while (lo < hi)
        {
            var mid = (lo + hi) >> 1;
            if (cumulative[mid] > target)
                hi = mid;
            else
                lo = mid + 1;
        }
        return lo;
    }

    // Что видит игрок: буквы поля, препятствия, бонусы, незакрытые цели и сколько ещё надо очков
    _Scan()
    {
        var level = this._level;
        var board = level.GetBoard();
        var columns = board.GetColumns(), rows = board.GetRows();
        var view = {
            columns: columns, rows: rows, board: board,
            counts: new Int32Array(WordDictionary.LetterCodesCount), tiles: [], jokers: [],
            value: new Float64Array(columns*rows), worth: new Float64Array(columns*rows),
            ice: 0, crates: 0, snow: 0, parcels: [], bonuses: [], usable: 0,
            length: 0, letter: -1, letterLeft: 0, powerupLength: 0, wordScore: 0, clearIce: false, cratesTask: false,
            meltLeft: 0, deliverLeft: 0, tasksLeft: 0, wordsLeft: [], cues: []
        };
        for (var code = 0; code < WordDictionary.LetterCodesCount; code++)
            view.tiles.push([]);

        var tasks = level.GetTasks();
        for (var i = 0; i < tasks.length; i++)
        {
            var task = tasks[i];
            if (task.done)
                continue;

            view.tasksLeft++;
            var config = task.config;
            switch (config.taskType)
            {
                case "Length": view.length = config.length; break;
                case "Letter":
                    view.letter = config.letter ? WordDictionary.LetterCode(config.letter) : -1;
                    view.letterLeft = config.count - task.progress;
                    break;
                case "Powerup": view.powerupLength = WordFallConfigs.PowerupLength(config.powerupKind); break;
                case "WordScore": view.wordScore = config.scoreThreshold; break;
                case "ClearIce": view.clearIce = true; break;
                case "Crates": view.cratesTask = true; break;
                case "Melt": view.meltLeft = config.count - task.progress; break;
                case "Deliver": view.deliverLeft = config.count - task.progress; break;
            }
        }

        var words = level.GetWords();
        for (var i = 0; i < words.length; i++)
        {
            if (!words[i].found)
                view.wordsLeft.push(words[i].word);
        }

        for (var c = 0; c < columns; c++)
        {
            for (var r = 0; r < rows; r++)
            {
                var tile = board.grid[c][r];
                if (tile.hole)
                    continue;

                if (tile.ice > 0)
                    view.ice++;
                if (tile.crate > 0)
                    view.crates += tile.crate;
                if (tile.snow)
                    view.snow++;
                if (tile.parcel)
                    view.parcels.push({ c: c, r: r });
                if (tile.powerup)
                    view.bonuses.push({ c: c, r: r, kind: tile.powerup });
                if (!WordBoard.IsTileUsable(tile))
                    continue;

                var index = c*rows + r;
                view.usable++;
                view.value[index] = tile.joker ? 0 : tile.value*(tile.doubled ? 2 : 1);
                if (tile.joker)
                    view.jokers.push(index);
                else
                {
                    var letterCode = WordDictionary.LetterCode(tile.letter);
                    view.counts[letterCode]++;
                    view.tiles[letterCode].push(index);
                }
            }
        }

        var moves = level.GetMovesLeft(), target = level.GetTargetScore();
        if (this._assume)
        {
            moves = Math.max(1, this._assume.moves - this._moves);
            target = this._assume.targetScore;
        }
        view.movesLeft = moves;
        view.scoreLeft = Math.max(0, target - level.GetScore());
        view.pace = view.scoreLeft/Math.max(1, moves);
        var usual = this._moves > 0 ? this._gains/this._moves : 30;
        view.scoreWeight = Math.min(1.5, Math.max(0.25, view.pace/Math.max(usual, 1)));
        view.obstacleTask = (view.clearIce && view.ice > 0) || (view.cratesTask && view.crates > 0) || view.meltLeft > 0;

        this._Worth(view);
        return view;
    }

    // Чем клетка хороша для слова: соседние препятствия и бонусы, конверт над ней, номинал
    _Worth(view)
    {
        var board = view.board, rows = view.rows, columns = view.columns;
        var parcelAbove = [];
        for (var c = 0; c < columns; c++)
            parcelAbove.push(-1);
        for (var i = 0; i < view.parcels.length; i++)
            parcelAbove[view.parcels[i].c] = Math.max(parcelAbove[view.parcels[i].c], view.parcels[i].r);

        for (var c = 0; c < columns; c++)
        {
            for (var r = 0; r < rows; r++)
            {
                if (!WordBoard.IsTileUsable(board.grid[c][r]))
                    continue;

                var worth = view.value[c*rows + r]*0.05;
                for (var dc = -1; dc <= 1; dc++)
                {
                    for (var dr = -1; dr <= 1; dr++)
                    {
                        var nc = c + dc, nr = r + dr;
                        if ((dc == 0 && dr == 0) || nc < 0 || nc >= columns || nr < 0 || nr >= rows)
                            continue;

                        var near = board.grid[nc][nr];
                        if (near.ice > 0)
                            worth += view.clearIce ? 1 : 0.25;
                        else if (near.crate > 0)
                            worth += view.cratesTask ? 1 : 0.2;
                        else if (near.snow)
                            worth += view.meltLeft > 0 ? 1 : 0.15;
                        else if (near.powerup)
                            worth += near.powerup == "fireworks" ? 1.5 : 0.8;
                    }
                }
                if (view.deliverLeft > 0 && parcelAbove[c] > r)
                    worth += 1;
                view.worth[c*rows + r] = worth;
                if (worth >= 1 && !board.grid[c][r].joker)
                    view.cues.push(WordDictionary.LetterCode(board.grid[c][r].letter));
            }
        }
    }

    // Слово собирается из букв поля (джокеры добирают недостачу), игрок его знает и оно ещё не сыграно
    _Fits(index, view)
    {
        if (this._stamps[index] == this._stamp)
            return false;
        this._stamps[index] = this._stamp;
        this.stats.recalls++;

        if (!this.Knows(index))
            return false;

        var codes = this._dictionary.GetCodes(), offsets = this._tables.offsets;
        var extra = offsets[index + 1] - offsets[index] - 3;
        // с шестой буквы додуматься до слова всё труднее
        if (extra > 0 && this._reach < 1 && this._random.Next01() > Math.pow(this._reach, extra*(1 + 0.25*Math.max(0, extra - 2))))
            return false;

        var counts = view.counts, scratch = this._scratch || (this._scratch = new Int32Array(WordDictionary.LetterCodesCount));
        var start = offsets[index], end = offsets[index + 1];
        var deficit = 0, jokers = view.jokers.length, i = start;
        for (; i < end; i++)
        {
            var code = codes[i];
            if (scratch[code] >= counts[code] && ++deficit > jokers)
            {
                i++;
                break;
            }
            scratch[code]++;
        }
        for (var j = start; j < i; j++)
            scratch[codes[j]] = 0;
        if (deficit > jokers)
            return false;

        return !this._level.IsWordUsed(this._dictionary.GetAllWords()[index]) || jokers > 0;
    }

    // Слова, пришедшие в голову за ход: слова уровня (они на виду), затем игрок перебирает запас, пока не
    // наберёт столько вариантов, на сколько хватает усидчивости, — часть попыток прицельно под цель: слово
    // нужной длины, с буквой задания или с буквой плитки, которую нужно убрать
    _Recall(view)
    {
        var dictionary = this._dictionary, tables = this._tables;
        var found = [];
        this._stamp++;

        for (var i = 0; i < view.wordsLeft.length; i++)
        {
            var index = dictionary.IndexOf(view.wordsLeft[i]);
            if (index >= 0 && view.board.CanAssembleWord(view.wordsLeft[i]))
            {
                this._stamps[index] = this._stamp;
                found.push({ index: index, levelWord: true });
            }
        }

        var goalLength = view.length || view.powerupLength || (view.wordScore > 0 ? 6 : 0);
        var masks = dictionary.GetLetterMasks();
        var wanted = found.length + this._patience;
        for (var i = 0; i < this._recalls && found.length < wanted; i++)
        {
            var index;
            var table = goalLength && i % 3 == 0 ? tables.byLength[goalLength] : null;
            if (table)
                index = table.indices[WordFallBot._Pick(table.cumulative, table.total, this._random.Next01())];
            else
                index = WordFallBot._Pick(tables.cumulative, tables.total, this._random.Next01());

            // буква задания или буква плитки, которую надо убрать (под конвертом, у препятствия, у бонуса),
            // наводит на слова с ней
            var letter = -1;
            if (view.letter >= 0 && i % 3 == 1)
                letter = view.letter;
            else if (view.cues.length > 0 && i % 3 == 2)
                letter = view.cues[this._random.NextInt(view.cues.length)];
            if (letter >= 0)
            {
                for (var retry = 0; retry < 6; retry++)
                {
                    var has = letter < 32 ? (masks.lo[index] >>> letter) & 1 : (masks.hi[index] >>> (letter - 32)) & 1;
                    if (has)
                        break;
                    index = WordFallBot._Pick(tables.cumulative, tables.total, this._random.Next01());
                }
            }

            if (this._Fits(index, view))
                found.push({ index: index, levelWord: false });
        }
        this.stats.found += found.length;
        return found;
    }

    // Когда ничего не пришло в голову: игрок перебирает запас от самых ходовых слов, пока не сложится первое
    _RecallHard(view)
    {
        var order = this._tables.order;
        var found = [];
        this._stamp++;
        var limit = Math.min(order.length, 2000 + this._recalls*60);
        for (var i = 0; i < limit && found.length < 2; i++)
        {
            if (this._Fits(order[i], view))
                found.push({ index: order[i], levelWord: false });
        }
        return found;
    }

    // Лучший ход из вспомненных слов: у каждого слова свой лучший набор плиток, оценка с долей случайности —
    // чем слабее игрок, тем чаще он играет не самое выгодное
    _Choose(view, found)
    {
        var best = null;
        var noise = 1.6*(1 - this._skill);
        for (var i = 0; i < found.length; i++)
        {
            var move = this._Assign(found[i], view);
            if (!move)
                continue;
            move.weight = move.utility + this._Gauss()*noise;
            if (!best || move.weight > best.weight)
                best = move;
        }
        return best;
    }

    // Плитки под слово: несколько попыток жадного набора, лучшая по пользе
    _Assign(candidate, view)
    {
        var offsets = this._tables.offsets;
        var start = offsets[candidate.index], end = offsets[candidate.index + 1];
        var tries = 1 + Math.floor(this._skill*this._skill*4 + this._random.Next01()*0.5);
        var best = null;
        for (var t = 0; t < tries; t++)
        {
            var cells = this._Greedy(start, end, view);
            if (!cells)
                return null;
            var outcome = this._Outcome(cells, view);
            var utility = this._Utility(candidate, end - start, outcome, view);
            if (!best || utility > best.utility)
                best = { index: candidate.index, levelWord: candidate.levelWord, cells: cells, outcome: outcome, utility: utility };
        }
        return best;
    }

    // Набор плиток по буквам слова. Про множитель за соседние плитки игра не рассказывает — им пользуется
    // только умелый игрок; про препятствия и бонусы рассказывает обучение — их учитывает и средний; остальные
    // плитки берутся какие попались, чаще неподалёку от предыдущей
    _Greedy(start, end, view)
    {
        var codes = this._dictionary.GetCodes();
        var rows = view.rows;
        var taken = this._taken || (this._taken = new Int32Array(view.columns*rows));
        var mark = this._takenMark = (this._takenMark || 0) + 1;
        var skill = this._skill;
        var adjacency = view.scoreLeft > 0 ? 1 : 0.2;
        var chosen = [];
        var jokerAt = 0;
        var lastC = -1, lastR = -1;

        for (var i = start; i < end; i++)
        {
            var list = view.tiles[codes[i]];
            var roll = this._random.Next01();
            var cluster = roll < skill*skill;
            var aimed = cluster || roll < 0.25 + 0.75*skill;
            var pick = -1;
            var bestWorth = -1;
            var total = 0;
            for (var k = 0; k < list.length; k++)
            {
                var index = list[k];
                if (taken[index] == mark)
                    continue;

                var c = (index/rows) | 0, r = index - c*rows;
                var worth;
                if (!aimed)
                {
                    // взвешенный случайный выбор за один проход: ближние к предыдущей плитке вероятнее
                    var weight = lastC < 0 ? 1 : 1/(1 + 0.5*Math.max(Math.abs(c - lastC), Math.abs(r - lastR)));
                    total += weight;
                    if (this._random.Next01()*total < weight)
                        pick = index;
                    continue;
                }

                worth = view.worth[index] + this._random.Next01()*0.2;
                if (cluster)
                {
                    var near = 0;
                    for (var j = 0; j < chosen.length; j++)
                    {
                        var oc = (chosen[j]/rows) | 0, or = chosen[j] - oc*rows;
                        if (Math.abs(oc - c) <= 1 && Math.abs(or - r) <= 1)
                            near++;
                    }
                    worth += adjacency*Math.min(near, 2);
                }
                if (worth > bestWorth)
                {
                    bestWorth = worth;
                    pick = index;
                }
            }

            if (pick < 0)
            {
                while (jokerAt < view.jokers.length && taken[view.jokers[jokerAt]] == mark)
                    jokerAt++;
                if (jokerAt >= view.jokers.length)
                    return null;
                pick = view.jokers[jokerAt];
            }
            taken[pick] = mark;
            chosen.push(pick);
            lastC = (pick/rows) | 0;
            lastR = pick - lastC*rows;
        }

        return chosen.map(function(index) { var c = (index/rows) | 0; return { c: c, r: index - c*rows }; });
    }

    // Что даст слово на этих плитках: очки (как их считает поле), задетые препятствия и бонусы, конверты
    _Outcome(cells, view)
    {
        var board = view.board, rows = view.rows, columns = view.columns;
        var base = 0;
        for (var i = 0; i < cells.length; i++)
            base += view.value[cells[i].c*rows + cells[i].r];

        var cluster = 1;
        var visited = [];
        for (var i = 0; i < cells.length; i++)
        {
            if (visited[i])
                continue;
            var queue = [i], size = 0;
            visited[i] = true;
            while (queue.length > 0)
            {
                var current = queue.pop();
                size++;
                for (var j = 0; j < cells.length; j++)
                {
                    if (!visited[j] && Math.abs(cells[j].c - cells[current].c) <= 1 && Math.abs(cells[j].r - cells[current].r) <= 1)
                    {
                        visited[j] = true;
                        queue.push(j);
                    }
                }
            }
            cluster = Math.max(cluster, size);
        }
        var score = Math.ceil(Math.fround(Math.fround(base*WordBoard.LengthMultiplier(cells.length))*(cluster >= 2 ? cluster : 1)));

        var outcome = { score: score, ice: 0, crates: 0, snow: 0, bombs: 0, rockets: 0, delivery: 0, rocketDelivery: 0, extra: 0 };
        var seen = {};
        for (var i = 0; i < cells.length; i++)
            seen[cells[i].c*rows + cells[i].r] = true;
        for (var i = 0; i < cells.length; i++)
        {
            for (var dc = -1; dc <= 1; dc++)
            {
                for (var dr = -1; dr <= 1; dr++)
                {
                    var c = cells[i].c + dc, r = cells[i].r + dr;
                    if (c < 0 || c >= columns || r < 0 || r >= rows || seen[c*rows + r])
                        continue;

                    seen[c*rows + r] = true;
                    var tile = board.grid[c][r];
                    if (tile.ice > 0)
                        outcome.ice++;
                    else if (tile.crate > 0)
                        outcome.crates++;
                    else if (tile.snow)
                        outcome.snow++;
                    else if (tile.powerup == "bomb")
                    {
                        outcome.bombs++;
                        outcome.extra += 14;
                    }
                    else if (tile.powerup)
                    {
                        // ракета без выгодной цели бьёт случайную букву — в среднем дешёвую
                        var shots = tile.powerup == "fireworks" ? 10 : 1;
                        outcome.rockets += shots;
                        outcome.extra += 2*shots;
                    }
                }
            }
        }

        // ракеты после препятствий заданий копают под конверт, что ближе к дну
        var nearest = 0;
        for (var i = 0; i < view.parcels.length; i++)
        {
            var parcel = view.parcels[i];
            var below = 0, cleared = 0;
            for (var r = 0; r < parcel.r; r++)
            {
                if (board.grid[parcel.c][r].hole)
                    continue;
                below++;
                for (var j = 0; j < cells.length; j++)
                    cleared += cells[j].c == parcel.c && cells[j].r == r ? 1 : 0;
            }
            if (below > 0)
            {
                outcome.delivery += cleared/below;
                if (below > cleared)
                    nearest = Math.max(nearest, 1/(below - cleared));
            }
        }
        if (outcome.rockets > 0 && nearest > 0)
            outcome.rocketDelivery = Math.min(1, outcome.rockets*nearest);
        return outcome;
    }

    // Польза хода: слова уровня и задания важнее всего, очки — по тому, сколько их ещё нужно за ход
    _Utility(candidate, length, outcome, view)
    {
        var utility = candidate.levelWord ? 10 : 0;
        var skill = this._skill;
        var gain = outcome.score + outcome.extra*skill;

        if (view.length > 0 && length == view.length)
            utility += 3;
        if (view.powerupLength > 0 && (length == view.powerupLength || (view.powerupLength == 7 && length > 7)))
            utility += 3;
        if (view.wordScore > 0 && outcome.score >= view.wordScore)
            utility += 3;
        if (view.letter >= 0 && view.letterLeft > 0)
        {
            var codes = this._dictionary.GetCodes(), offsets = this._tables.offsets;
            var hits = 0;
            for (var i = offsets[candidate.index]; i < offsets[candidate.index + 1]; i++)
                hits += codes[i] == view.letter ? 1 : 0;
            utility += 2.5*Math.min(hits, view.letterLeft)/view.letterLeft;
        }

        // ракеты сами летят в препятствия заданий, затем под конверты; бомба бьёт вокруг себя — умелый игрок
        // это учитывает
        var blast = (outcome.rockets + outcome.bombs*2)*skill;
        if (view.clearIce && view.ice > 0)
            utility += 3*Math.min(outcome.ice + blast, view.ice)/view.ice;
        if (view.cratesTask && view.crates > 0)
            utility += 3*Math.min(outcome.crates + blast, view.crates)/view.crates;
        if (view.meltLeft > 0)
            utility += 3*Math.min(outcome.snow + blast, view.meltLeft)/view.meltLeft;
        if (view.deliverLeft > 0)
            utility += 4*Math.min(outcome.delivery + outcome.rocketDelivery*skill, 1.5);

        if (length >= 5)
            utility += 0.6*skill;

        // пока очки набираются с запасом к цели, игрок занят заданиями; отстаёт — гонится за очками
        if (view.scoreLeft > 0)
            utility += 2*view.scoreWeight*Math.min(2, gain/Math.max(view.pace, 8));
        else
            utility += 0.002*gain;
        return utility;
    }

    // Бустеры — когда прижало: нет слов, мало ходов или не хватает очков
    _Booster(view, best)
    {
        var level = this._level;
        var eager = this.profile.boosters;
        if (eager <= 0)
            return null;

        var random = this._random;
        var tight = view.movesLeft <= 3;
        var goalsLeft = view.tasksLeft > 0 || view.wordsLeft.length > 0;

        if (!best)
        {
            if (level.GetBoosterCharges(WordLevel.Hint) > 0 && random.Next01() < eager)
                return this._Hint();
            if (level.GetBoosterCharges(WordLevel.Shuffle) > 0 && view.usable > 3 && random.Next01() < eager*0.3)
            {
                this.stats.boosters++;
                return { type: "shuffle", think: 4 };
            }
            return null;
        }

        if (view.obstacleTask && level.GetBoosterCharges(WordLevel.Hammer) > 0 && random.Next01() < (tight ? eager : eager*0.12))
        {
            var cell = this._HammerTarget(view);
            if (cell)
            {
                this.stats.boosters++;
                return { type: "hammer", cell: cell, think: 3 };
            }
        }

        // ход не двигает ни одной цели, а ходы на исходе — подсказка ведёт к целям уровня
        var idle = best.utility < 2.2 && goalsLeft;
        if (idle && tight && level.GetBoosterCharges(WordLevel.Hint) > 0 && random.Next01() < eager)
            return this._Hint();

        var average = this._moves > 0 ? this._gains/this._moves : 14;
        var behind = view.scoreLeft > 0 && view.pace > Math.max(average, best.outcome.score)*1.15;
        if (behind && level.GetBoosterCharges(WordLevel.Doubler) > 0 && random.Next01() < (tight ? eager : eager*0.25))
        {
            var target = null, value = 0;
            for (var i = 0; i < best.cells.length; i++)
            {
                var tile = view.board.grid[best.cells[i].c][best.cells[i].r];
                if (!tile.joker && !tile.doubled && tile.value > value)
                {
                    value = tile.value;
                    target = best.cells[i];
                }
            }
            if (target)
            {
                this.stats.boosters++;
                this._queue.push(this._WordAction(best));
                return { type: "doubler", cell: { c: target.c, r: target.r }, think: 3 };
            }
        }

        // слова нужной заданию длины не видно, а ходов мало — джокер вместо самой дешёвой плитки
        var lengthGoal = view.length || view.powerupLength;
        if (lengthGoal > 0 && tight && view.jokers.length == 0 && this._dictionary.GetOffsets()[best.index + 1] - this._dictionary.GetOffsets()[best.index] != lengthGoal &&
            level.GetBoosterCharges(WordLevel.Joker) > 0 && random.Next01() < eager*0.5)
        {
            var cheapest = null, cheapestValue = 1e9;
            for (var code = 0; code < view.tiles.length; code++)
            {
                for (var k = 0; k < view.tiles[code].length; k++)
                {
                    var index = view.tiles[code][k];
                    if (view.value[index] < cheapestValue)
                    {
                        cheapestValue = view.value[index];
                        cheapest = index;
                    }
                }
            }
            if (cheapest != null)
            {
                this.stats.boosters++;
                var column = (cheapest/view.rows) | 0;
                return { type: "joker", cell: { c: column, r: cheapest - column*view.rows }, think: 3 };
            }
        }
        return null;
    }

    _Hint()
    {
        this.stats.hints++;
        this.stats.boosters++;
        this._queue.push({ type: "accept", think: 1 });
        return { type: "hint", think: 3 };
    }

    // Молоток — по препятствию задания: ящик послабее, лёд, снежок
    _HammerTarget(view)
    {
        var board = view.board;
        var best = null, bestWorth = 0;
        for (var c = 0; c < view.columns; c++)
        {
            for (var r = 0; r < view.rows; r++)
            {
                var tile = board.grid[c][r];
                var worth = 0;
                if (view.cratesTask && tile.crate > 0)
                    worth = 4 - tile.crate;
                else if (view.clearIce && tile.ice > 0)
                    worth = 2;
                else if (view.meltLeft > 0 && tile.snow)
                    worth = 2;
                if (worth > bestWorth)
                {
                    bestWorth = worth;
                    best = { c: c, r: r };
                }
            }
        }
        return best;
    }
};
