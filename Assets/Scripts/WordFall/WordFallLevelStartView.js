include("Scripts/WordFall/WordFallWindow.js");

// Старт уровня (WordFall/UI/LevelStartWindow.proto, PLAY главного экрана): номер уровня, его цели и ходы, бонусы
// на старт — бомба, ракета, салют из запаса игрока. Бонус с нулевым запасом открывает его покупку; PLAY начинает
// уровень с выбранными бонусами на поле
WordFallLevelStartView = class WordFallLevelStartView extends WordFallWindow
{
    constructor()
    {
        super("levelStart");
        this.goalSpacing = 140; // шаг ячеек целей
        this._selected = [false, false, false];
    }

    // Картинки целей в ячейке, по порядку прототипа
    static get GoalKinds()
    {
        return ["words", "anyWords", "clearIce", "crates", "deliver", "melt", "bomb", "rocket", "fireworks", "tile", "score"];
    }

    // Цели уровня для окна: [{kind, count, symbol}] — слова уровня, задания, очки
    static Goals(words, tasks, target)
    {
        var goals = [];
        if (words.length > 0)
            goals.push({ kind: "words", count: "x" + words.length });
        for (var i = 0; i < tasks.length; i++)
        {
            var task = tasks[i];
            switch (task.type)
            {
                case "powerup": goals.push({ kind: task.kind || "bomb", count: "x" + task.count }); break;
                case "clearIce": case "crates": goals.push({ kind: task.type, count: "x" + task.remaining }); break;
                case "deliver": case "melt": case "anyWords": goals.push({ kind: task.type, count: "x" + task.count }); break;
                case "letter": goals.push({ kind: "tile", symbol: task.letter, count: "x" + task.count }); break;
                case "length": goals.push({ kind: "tile", symbol: "" + task.length, count: "x" + task.count }); break;
                case "wordScore": goals.push({ kind: "tile", symbol: task.score + "+", count: "x" + task.count }); break;
            }
        }
        goals.push({ kind: "score", count: WordFallUi.FormatNumber(target) });
        return goals.slice(0, 6);
    }

    OnInit()
    {
        var self = this;
        this._title = this._Child("safe_area/dialog/header/title");
        this._moves = this._Child("safe_area/dialog/parchment/moves");
        this._slots = [];
        for (var i = 0; i < 6; i++)
        {
            var path = "safe_area/dialog/parchment/goals/goal" + i;
            var slot = { root: this._Child(path), icons: {}, symbol: this._Child(path + "/symbol"), count: this._Child(path + "/count") };
            WordFallLevelStartView.GoalKinds.forEach(function(kind) { slot.icons[kind] = self._Child(path + "/icon_" + kind); });
            this._slots.push(slot);
        }
        this._bonuses = [];
        WordFallGameService.BonusKinds.forEach(function(kind, index) {
            var path = "safe_area/dialog/bonuses/" + kind;
            self._Bind(path, function() { self._TapBonus(index); });
            self._bonuses.push({ check: self._Child(path + "/check"), count: self._Child(path + "/badge/count"),
                                 plus: self._Child(path + "/badge/plus") });
        });
        this._Bind("safe_area/dialog/play_button", function() { self._Play(); });
    }

    OnOpen()
    {
        var svc = this._svc;
        this._SetText(this._title, "LEVEL " + (svc.GetLevelIndex() + 1));
        this._SetText(this._moves, svc.GetMovesLeft() + " moves");

        var goals = WordFallLevelStartView.Goals(svc.GetWords(), svc.GetTasks(), svc.GetTargetScore());
        for (var i = 0; i < this._slots.length; i++)
        {
            var slot = this._slots[i], goal = goals[i];
            if (!slot.root)
                continue;
            slot.root.SetEnabled(!!goal);
            if (!goal)
                continue;
            // ячейки целей — по центру строки
            var x = (i - (goals.length - 1)/2)*this.goalSpacing;
            slot.root.GetLayout().SetOffsetMin(new Vec2(x - this.goalSpacing/2, -190));
            slot.root.GetLayout().SetOffsetMax(new Vec2(x + this.goalSpacing/2, 0));
            for (var kind in slot.icons)
            {
                if (slot.icons[kind])
                    slot.icons[kind].SetEnabled(kind == goal.kind);
            }
            if (slot.symbol)
            {
                slot.symbol.SetEnabled(goal.kind == "tile");
                slot.symbol.SetText(goal.symbol || "");
            }
            this._SetText(slot.count, goal.count);
        }

        // выбор бонусов не переживает открытие: бонус с нулевым запасом выбрать нельзя
        for (var b = 0; b < this._selected.length; b++)
            this._selected[b] = this._selected[b] && svc.GetBonusCount(b) > 0;
        this._SyncBonuses();
    }

    _SyncBonuses()
    {
        for (var i = 0; i < this._bonuses.length; i++)
        {
            var view = this._bonuses[i], count = this._svc.GetBonusCount(i);
            if (view.check)
                view.check.SetEnabled(this._selected[i]);
            if (view.count)
            {
                view.count.SetEnabled(count > 0);
                view.count.SetText("" + count);
            }
            if (view.plus)
                view.plus.SetEnabled(count <= 0);
        }
    }

    _TapBonus(index)
    {
        if (!this.IsOpen())
            return;
        if (this._svc.GetBonusCount(index) > 0)
        {
            this._selected[index] = !this._selected[index];
            this._SyncBonuses();
            return;
        }
        var self = this;
        if (WordFallViews.boosterShop)
        {
            WordFallViews.boosterShop.Open({ bonus: index }, function(bought) {
                if (bought)
                    self._selected[index] = true;
                self._SyncBonuses();
            });
        }
    }

    _Play()
    {
        if (!this.IsOpen())
            return;
        var chosen = [];
        for (var i = 0; i < this._selected.length; i++)
        {
            if (this._selected[i])
                chosen.push(i);
        }
        this._selected = [false, false, false];
        this.Close();
        if (WordFallGame.screens)
            WordFallGame.screens.PlayLevel(chosen);
    }
};
