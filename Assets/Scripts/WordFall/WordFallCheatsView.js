globalThis.WordFallGame = globalThis.WordFallGame || {};

// Читы: кнопка в правом верхнем углу открывает экран действий над уровнем, ресурсами,
// полем, обучением и языком игрока; отсюда же открывается редактор уровней.
// Отладочная кнопка LangToggle на главном экране переключает язык одним тапом — с телефона

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
        this._langToggle = this._actor.GetChild("LangToggle/Btn");

        var self = this;
        this._toggle.onClick = function() { self.Toggle(); };
        if (this._langToggle)
            this._langToggle.onClick = function() { self.Close(); self.SwitchLanguage(); };
        this._UpdateLanguageCaption();

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
            LangBtn: function() { self.SwitchLanguage(); },
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
        if (this._open)
            this._UpdateLanguageCaption();
    }

    Close()
    {
        this._open = false;
        this._panel.SetEnabled(false);
    }

    // Следующий язык по кругу: уровень и обучение перезапускаются на новом алфавите
    SwitchLanguage()
    {
        this._FinishFx();
        this._svc.SetLanguage(WordFallLanguages.Next(this._svc.GetLanguage()));
        var t = WordFallViews.tutorial;
        if (t) t.Restart();
        this._UpdateLanguageCaption();
    }

    _UpdateLanguageCaption()
    {
        if (!this._svc)
            return;

        var code = this._svc.GetLanguage();
        var language = WordFallLanguages.Get(code);
        var button = this._panel.GetChild("LangBtn/Btn");
        if (button)
            button.SetCaption("ЯЗЫК: " + (language ? language.name : code).toUpperCase());
        if (this._langToggle)
            this._langToggle.SetCaption(code.toUpperCase());
    }

    _FinishFx()
    {
        var fx = WordFallViews.fx;
        if (fx)
            fx.Finish();
    }
};
