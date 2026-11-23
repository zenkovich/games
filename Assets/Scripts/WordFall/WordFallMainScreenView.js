include("Scripts/WordFall/WordFallUiTweens.js");

globalThis.WordFallGame = globalThis.WordFallGame || {};

// Главный экран (макет пайплайна «Wordfall UI», WordFall/UI/MainScreen.proto): счётчики монет, жизней и звёзд
// догоняют сервис, PLAY открывает окно старта уровня, плюс у монет — банк, жизни — их окно, шестерёнка —
// настройки; вкладки нижней панели пока только откликаются
WordFallMainScreenView = class WordFallMainScreenView extends o2.Component
{
    constructor()
    {
        super();
        globalThis.WordFallViews = globalThis.WordFallViews || {};
        WordFallViews.main = this;
        this._tweens = new WordFallUiTweens();
        this._ready = false;
        this._time = 0;
        this._counters = [];
    }

    OnStart() { this._Init(); }

    OnEnabled()
    {
        this._Init();
        this._SyncCounters(0, true);
    }

    _Init()
    {
        if (this._ready || !this._actor)
            return;
        this._ready = true;

        var root = this._actor;
        var self = this;
        this._counters = [
            { label: root.GetChild("safe_area/top_hud/coin_counter/coin_balance"), shown: -1, get: function(svc) { return svc.GetCoins(); } },
            { label: root.GetChild("safe_area/top_hud/lives_counter/lives_value"), shown: -1, get: function(svc) { return svc.GetLives(); } },
            { label: root.GetChild("safe_area/top_hud/stars_counter/stars_value"), shown: -1, get: function(svc) { return svc.GetStars(); } }
        ].filter(function(c) { return c.label; });

        this._play = root.GetChild("safe_area/play_button");
        WordFallUi.Center(this._play);
        this._play.onClick = function() {
            if (WordFallGame.screens)
                WordFallGame.screens.Play();
        };

        var windows = { "safe_area/top_hud/coin_counter/add_currency_button": "shop", "safe_area/top_hud/settings_button": "settings",
                        "safe_area/top_hud/lives_counter/lives_button": "lives" };
        Object.keys(windows).forEach(function(path) {
            var button = root.GetChild(path);
            if (button)
                button.onClick = function() {
                    var window = (globalThis.WordFallViews || {})[windows[path]];
                    if (window)
                        window.Open();
                };
        });

        var idle = ["safe_area/bottom_navigation/tabs/map/map_button", "safe_area/bottom_navigation/tabs/trophy/trophy_button",
                    "safe_area/bottom_navigation/tabs/team/team_button", "safe_area/bottom_navigation/tabs/journal/journal_button"];
        idle.forEach(function(path) {
            var button = root.GetChild(path);
            if (button)
                button.onClick = function() { WordFallUi.Bounce(self._tweens, button); };
        });

        this._letter = root.GetChild("backdrop/bird_letter");
        WordFallUi.Center(this._letter);
        this._SyncCounters(0, true);
    }

    // Счётчик догоняет значение сервиса примерно за полсекунды; snap — сразу
    _SyncCounters(dt, snap)
    {
        var svc = WordFallGame.service;
        if (!svc)
            return;

        for (var i = 0; i < this._counters.length; i++)
        {
            var c = this._counters[i];
            var target = c.get(svc);
            var shown = c.shown;
            if (snap || shown < 0)
                shown = target;
            else if (shown != target)
            {
                var step = (target - shown)*Math.min(1, dt*7);
                shown = Math.abs(target - shown) <= 1 ? target : shown + (Math.abs(step) < 1 ? Math.sign(step) : step);
            }
            if (Math.round(shown) != Math.round(c.shown))
                c.label.SetText(WordFallUi.FormatNumber(shown));
            c.shown = shown;
        }
    }

    Update(dt)
    {
        this._Init();
        this._time += dt;
        this._tweens.Update(dt);
        this._SyncCounters(dt, false);

        // PLAY дышит, буква в клюве сороки покачивается
        WordFallUi.SetScale(this._play, 1 + 0.025*Math.sin(this._time*3.2));
        if (this._letter)
            this._letter.GetTransform().SetAngleDegrees(7*Math.sin(this._time*1.6));
    }
};
