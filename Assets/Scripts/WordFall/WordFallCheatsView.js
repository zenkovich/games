globalThis.WordFallGame = globalThis.WordFallGame || {};

// Читы: кнопка в правом верхнем углу открывает панель действий над уровнем

WordFallCheatsView = class WordFallCheatsView extends o2.Component
{
    get _svc() { return WordFallGame.service; }

    constructor()
    {
        super();
        this._open = false;
    }

    OnStart()
    {
        globalThis.WordFallViews = globalThis.WordFallViews || {};
        WordFallViews.cheats = this;

        this._panel = this._actor.GetChild("Panel");
        this._toggle = this._actor.GetChild("Toggle");

        var self = this;
        this._toggle.onClick = function() { self.Toggle(); };
        var actions = [
            function() { self._svc.DebugCompleteTasks(); self._svc.DebugAddScore(Math.max(0, self._svc.GetTargetScore() - self._svc.GetScore())); },
            function() { self._svc.DebugLoseLevel(); },
            function() { self._svc.DebugAddMoves(5); },
            function() { self._svc.DebugAddScore(100); },
            function() { self._svc.DebugSpawnRandomPowerup(); },
            function() { self._svc.DebugAddCharges(3); },
            function() { var fx = WordFallViews.fx; if (fx) fx.Finish(); self._svc.StartLevel((self._svc.GetLevelIndex() + 1) % self._svc.GetLevelCount()); },
            function() { self._svc.ResetTutorials(); var t = WordFallViews.tutorial; if (t) t.Restart(); }
        ];
        for (var i = 0; i < actions.length; i++)
        {
            (function(index) {
                var button = self._panel.GetChild("Cheat" + index + "/Btn");
                if (button)
                    button.onClick = function() { actions[index](); self.Close(); };
            })(i);
        }
    }

    IsOpen() { return this._open; }

    Toggle()
    {
        this._open = !this._open;
        this._panel.SetEnabled(this._open);
    }

    Close()
    {
        this._open = false;
        this._panel.SetEnabled(false);
    }
};
