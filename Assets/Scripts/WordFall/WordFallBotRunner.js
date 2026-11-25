include("Scripts/WordFall/Core/WordFallBot.js");

globalThis.WordFallGame = globalThis.WordFallGame || {};

// Прогон бота в самой игре. LevelLab (Tools/WordFall/LevelLab) кладёт рядом с игрой запрос — уровень, профиль
// игрока, сиды поля и бота, число попыток — и запускает её; бот играет через те же вьюхи, что и человек: жмёт
// плитки по одной, ✓ и бустеры, думая между ходами. С теми же сидами попытка повторяет ту, что показал
// симулятор. Скорость всей игры задаёт запуск (O2_GAME_SPEED), итоги попыток пишутся в файл запроса resultPath.
// Запрос с human: true открывает уровень для человека: играет он сам, «Ещё раз» в попапе начинает новую попытку,
// а её итог (ходы, очки, слова) так же уходит в resultPath
WordFallBotRunner = class WordFallBotRunner
{
    // Запрос из файла рядом с игрой; null — файла нет, он битый или устарел (игру запустили не из LevelLab).
    // Прочитанный запрос удаляется: следующий старт игры (Restart в вебе) — снова обычная игра
    static ReadRequest(path)
    {
        var text = o2.FileSystem.ReadFile(path);
        if (text === undefined)
            return null;
        o2.FileSystem.FileDelete(path);

        try
        {
            var request = JSON.parse(text);
            return request && request.level && request.expires > Date.now() ? request : null;
        }
        catch (e)
        {
            return null;
        }
    }

    constructor(request)
    {
        this.clickInterval = 0.28;  // пауза между буквами слова, с
        this.acceptPause = 0.4;     // пауза перед ✓
        this.boosterPause = 0.6;    // пауза между бустером и его целью
        this.attemptPause = 3;      // пауза между попытками

        this._request = request;
        this._attempts = Math.max(1, request.attempts || 1);
        this._think = typeof request.think == "number" ? request.think : 0.5;
        // во сколько раз быстрее идут паузы бота: в вебе (портал) игру саму не ускорить, как O2_GAME_SPEED на машине
        this._pace = typeof request.pace == "number" ? Math.max(0.25, Math.min(16, request.pace)) : 1;
        this._attempt = -1;
        this._results = [];
        this._bot = null;
        this._state = "wait";
        this._timer = 0;
        this._action = null;
        this._cells = [];
        this._refused = 0;
        this._moves = 0;
        this._movesLeft = 0;
        this._words = [];
    }

    get _svc() { return WordFallGame.service; }

    IsHuman() { return !!this._request.human; }

    Update(dt)
    {
        var views = globalThis.WordFallViews;
        if (!this._svc || !views || !views.board || !views.wordPanel || !views.boosters)
            return;

        if (this.IsHuman())
        {
            this._WatchHuman();
            return;
        }

        if (this._state == "wait")
        {
            this._BeginAttempt();
            return;
        }
        if (this._state == "done")
            return;

        // эффекты хода и обвал доигрывают, как перед глазами человека
        if (this._Busy())
            return;

        this._timer -= dt*this._pace;
        if (this._timer > 0)
            return;

        switch (this._state)
        {
            case "think": this._Decide(); break;
            case "pick": this._PickNext(); break;
            case "accept": this._Accept(); break;
            case "aim": this._Aim(); break;
            case "confirm": this._Confirm(); break;
            case "settle": this._Settle(); break;
            case "between": this._BeginAttempt(); break;
        }
    }

    _Busy()
    {
        var views = WordFallViews;
        return (views.fx && views.fx.IsBusy()) || this._svc.IsCollapseAnimating() || views.board.IsSelecting() ||
            views.board.IsReshuffling();
    }

    _BeginAttempt()
    {
        var request = this._request;
        var svc = this._svc;
        this._attempt++;

        // первая попытка играется на сидах запроса — так её показал симулятор; остальные — на производных
        svc.randomSeed = ((request.seed >>> 0) + Math.imul(this._attempt, 2654435761)) >>> 0 || 1;
        if (this._attempt == 0)
            svc.PlayCustomLevel(request.level, request.language);
        else
            svc.RestartLevel();
        if (WordFallViews.tutorial)
            WordFallViews.tutorial.Restart();

        this._bot = new WordFallBot(request.profile, ((request.botSeed >>> 0) + Math.imul(this._attempt, 40503)) >>> 0 || 1);
        this._bot.Begin(svc.GetLevel(), svc.GetDictionary());
        this._refused = 0;
        this._moves = 0;
        this._state = "think";
        this._timer = 1.2;
        WordFallViews.wordPanel.ShowMessage("Бот" + (request.profileName ? " «" + request.profileName + "»" : "") +
                                            (this._attempts > 1 ? ": попытка " + (this._attempt + 1) + " из " + this._attempts : ""));
    }

    // Человек играет сам: первая попытка — на сиде запроса (если он есть), следующие начинает попап и они случайны
    _WatchHuman()
    {
        var svc = this._svc;
        if (this._state == "wait")
        {
            this._attempt = 0;
            svc.randomSeed = this._request.seed >>> 0;
            svc.PlayCustomLevel(this._request.level, this._request.language);
            svc.randomSeed = 0;
            this._BeginHumanAttempt();
            var level = this._request.level;
            print("WordFall player: level " + level.id + " from LevelLab, moves " + svc.GetMovesLeft() + ", target " + svc.GetTargetScore());
            WordFallViews.wordPanel.ShowMessage("LevelLab, " + (this._request.title || level.name || level.id || "уровень") + ": играйте сами");
            return;
        }

        var state = svc.GetGameState();
        if (this._state == "ended")
        {
            if (state == "playing")
            {
                this._attempt++;
                this._BeginHumanAttempt();
            }
            return;
        }

        // уровень начат заново посреди попытки (смена языка, читы): недоигранная попытка не считается
        var left = svc.GetMovesLeft();
        if (left > this._movesLeft)
        {
            this._BeginHumanAttempt();
            return;
        }
        if (left < this._movesLeft)
        {
            var move = svc.GetLastMove();
            this._moves++;
            if (move.ok && move.word)
                this._words.push(move.word);
        }
        this._movesLeft = left;
        if (state != "playing")
        {
            this._state = "ended";
            this._Record({ attempt: this._attempt + 1, won: state == "won", stuck: false, moves: this._moves, movesLeft: left,
                           score: svc.GetScore(), target: svc.GetTargetScore(), words: this._words.slice() });
        }
    }

    _BeginHumanAttempt()
    {
        this._state = "play";
        this._moves = 0;
        this._words = [];
        this._movesLeft = this._svc.GetMovesLeft();
    }

    _Record(result)
    {
        this._results.push(result);
        print("WordFall " + (this.IsHuman() ? "player" : "bot") + ": attempt " + result.attempt + (result.won ? " won" : " lost") +
              ", moves " + result.moves + ", score " + result.score + "/" + result.target);
        if (this._request.resultPath)
            o2.FileSystem.WriteFile(this._request.resultPath, JSON.stringify({ profileName: this._request.profileName || "", human: this.IsHuman(),
                                                                               attempts: this._results }));
    }

    _Decide()
    {
        var svc = this._svc;
        if (svc.GetGameState() != "playing")
        {
            this._EndAttempt(false);
            return;
        }

        var action = this._bot.NextAction();
        this._action = action;
        var boosters = WordFallViews.boosters;
        switch (action.type)
        {
            case "word":
                svc.ClearSelection();
                this._cells = action.cells.slice();
                this._state = "pick";
                this._timer = (action.think || 2)*this._think;
                break;
            case "accept":
                this._state = "accept";
                this._timer = this.acceptPause;
                break;
            case "hint":
                boosters.OnBooster(WordLevel.Hint, "hint");
                this._state = "think";
                this._timer = this.boosterPause;
                break;
            case "reshuffle":
                boosters.OnBooster(WordLevel.Reshuffle, "reshuffle");
                this._state = "confirm";
                this._timer = this.boosterPause;
                break;
            case "hammer":
            case "joker":
                boosters.OnBooster(action.type == "hammer" ? WordLevel.Hammer : WordLevel.Joker, action.type);
                this._state = "aim";
                this._timer = this.boosterPause;
                break;
            default:
                this._EndAttempt(action.type == "stuck");
        }
    }

    _PickNext()
    {
        if (this._cells.length == 0)
        {
            this._state = "accept";
            this._timer = this.acceptPause;
            return;
        }
        var cell = this._cells.shift();
        WordFallViews.board.OnTileClick(cell.c, cell.r);
        this._timer = this.clickInterval;
    }

    _Accept()
    {
        var svc = this._svc;
        var score = svc.GetScore();
        var moves = svc.GetMovesLeft();
        WordFallViews.wordPanel.OnAccept();
        var move = svc.GetLastMove();
        if (svc.GetMovesLeft() < moves || svc.GetGameState() != "playing")
        {
            this._bot.OnMove({ ok: true, word: move.word, gain: svc.GetScore() - score });
            this._moves++;
            this._refused = 0;
        }
        else if (++this._refused >= 3)
        {
            this._EndAttempt(true);
            return;
        }
        else
            svc.ClearSelection();
        this._state = "settle";
        this._timer = 0.2;
    }

    _Aim()
    {
        var cell = this._action.cell;
        WordFallViews.board.OnTileClick(cell.c, cell.r);
        this._state = "settle";
        this._timer = 0.2;
    }

    _Confirm()
    {
        if (WordFallViews.reshuffleConfirm)
            WordFallViews.reshuffleConfirm.Confirm();
        this._state = "settle";
        this._timer = 0.2;
    }

    _Settle()
    {
        if (this._svc.GetGameState() != "playing")
        {
            this._EndAttempt(false);
            return;
        }
        this._state = "think";
        this._timer = 0.3;
    }

    _EndAttempt(stuck)
    {
        var svc = this._svc;
        this._Record({ attempt: this._attempt + 1, won: svc.GetGameState() == "won", stuck: !!stuck, moves: this._moves, movesLeft: svc.GetMovesLeft(),
                       score: svc.GetScore(), target: svc.GetTargetScore(), seed: svc.randomSeed });

        if (this._attempt + 1 < this._attempts)
        {
            this._state = "between";
            this._timer = this.attemptPause;
        }
        else
            this._state = "done";
    }
};
