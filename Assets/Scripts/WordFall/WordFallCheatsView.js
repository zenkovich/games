globalThis.WordFallGame = globalThis.WordFallGame || {};

// Читы: кнопка в правом верхнем углу открывает экран действий над уровнем, ресурсами,
// полем и обучением; отсюда же открывается редактор уровней

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

        var actions = {
            WinBtn: function() { self._svc.DebugCompleteTasks(); self._svc.DebugAddScore(Math.max(0, self._svc.GetTargetScore() - self._svc.GetScore())); },
            LoseBtn: function() { self._svc.DebugLoseLevel(); },
            NextBtn: function() { self._FinishFx(); self._svc.StartLevel((self._svc.GetLevelIndex() + 1) % self._svc.GetLevelCount()); },
            RestartBtn: function() { self._FinishFx(); self._svc.RestartLevel(); },
            MovesBtn: function() { self._svc.DebugAddMoves(5); },
            ScoreBtn: function() { self._svc.DebugAddScore(100); },
            ChargesBtn: function() { self._svc.DebugAddCharges(3); },
            PowerupBtn: function() { self._svc.DebugSpawnRandomPowerup(); },
            TutorialBtn: function() { self._svc.ResetTutorials(); var t = WordFallViews.tutorial; if (t) t.Restart(); },
            EditorBtn: function() { if (WordFallGame.screens) WordFallGame.screens.ShowEditor(); },
            CloseBtn: function() {}
        };
        for (var name in actions)
        {
            (function(action, button) {
                if (button)
                    button.onClick = function() { action(); self.Close(); };
            })(actions[name], this._panel.GetChild(name + "/Btn"));
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

    _FinishFx()
    {
        var fx = WordFallViews.fx;
        if (fx)
            fx.Finish();
    }
};
