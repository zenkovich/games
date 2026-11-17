include("Scripts/WordFall/WordFallUiTweens.js");

globalThis.WordFallGame = globalThis.WordFallGame || {};

// Окно победы (макет пайплайна «Wordfall UI», WordFall/UI/VictoryWindow.proto) поверх главного экрана: номер уровня,
// награда набегает на подушке, CONTINUE и крестик забирают её, кнопка с роликом — удвоенную. Монеты на счётчике окна
// набегают, после этого окно закрывается
WordFallVictoryView = class WordFallVictoryView extends o2.Component
{
    constructor()
    {
        super();
        globalThis.WordFallViews = globalThis.WordFallViews || {};
        WordFallViews.victory = this;
        this._tweens = new WordFallUiTweens();
        this._ready = false;
        this._open = false;
        this._claimed = false;
        this._time = 0;
        this._result = null;
    }

    OnStart() { this._Init(); }

    IsOpen() { return this._open; }

    _Init()
    {
        if (this._ready || !this._actor)
            return;
        this._ready = true;

        var self = this;
        var hud = this._actor.GetChild("home_screen");
        var parchment = "victory_frame/victory_parchment/";
        this._content = hud;
        this._dim = hud.GetChild("modal_dimmer");
        this._dimTransparency = this._dim.GetTransparency();
        this._popup = hud.GetChild("victory_popup");
        this._levelLabel = this._popup.GetChild("level_header/level_header_label");
        this._amount = this._popup.GetChild(parchment + "reward_amount");
        this._doubleLabel = this._popup.GetChild(parchment + "double_reward_button/double_reward_label");
        this._coins = hud.GetChild("coin_counter/coin_balance");
        this._lives = hud.GetChild("lives_counter/lives_value");
        this._stars = hud.GetChild("stars_counter/stars_value");
        this._continue = this._popup.GetChild(parchment + "continue_button");
        this._double = this._popup.GetChild(parchment + "double_reward_button");
        this._close = this._popup.GetChild("close_button");
        this._owl = this._popup.GetChild("owl_guide");
        this._tiles = ["letter_a_tile", "letter_e_tile", "letter_o_tile"].map(function(name, i) {
            var tile = self._popup.GetChild(parchment + name);
            WordFallUi.Center(tile);
            return { widget: tile, phase: i*1.3 };
        });
        WordFallUi.Center(this._amount);
        WordFallUi.Center(this._owl);

        this._continue.onClick = function() { self._Claim(1, self._continue); };
        // Рекламы в игре нет: просмотр ролика засчитывается сразу
        this._double.onClick = function() { self._Claim(2, self._double); };
        this._close.onClick = function() { self._Claim(1, self._close); };

        this._content.SetEnabled(false);
    }

    // result — WordFallGameService.WinLevel(): level, score, stars, reward
    Open(result)
    {
        this._Init();
        var svc = WordFallGame.service;
        var self = this;
        this._result = result;
        this._open = true;
        this._claimed = false;
        this._time = 0;
        this._tweens.Clear();

        this._levelLabel.SetText("LEVEL " + result.level);
        this._amount.SetText("0");
        this._doubleLabel.SetText(WordFallUi.FormatNumber(result.reward*2) + "\nCOINS");
        this._coins.SetText(WordFallUi.FormatNumber(svc.GetCoins()));
        this._lives.SetText("" + svc.GetLives());
        this._stars.SetText(WordFallUi.FormatNumber(svc.GetStars()));
        this._content.SetEnabled(true);
        this._content.SetTransparency(1);

        WordFallUi.FadeIn(this._tweens, this._dim, 0, 0.3, this._dimTransparency);
        WordFallUi.PopIn(this._tweens, this._popup, 0.08, 0.42);
        WordFallUi.CountUp(this._tweens, this._amount, 0, result.reward, 0.45, 0.8);
        this._tweens.Add(0.45, 0.8, function(k) {
            WordFallUi.SetScale(self._amount, 1 + 0.12*Math.sin(k*Math.PI));
        }, function() { WordFallUi.SetScale(self._amount, 1); });
    }

    _Claim(multiplier, button)
    {
        if (!this._open || this._claimed)
            return;
        this._claimed = true;

        var self = this;
        var svc = WordFallGame.service;
        var reward = this._result.reward*multiplier;
        var from = svc.GetCoins();
        var to = svc.ClaimReward(reward);
        WordFallUi.Bounce(this._tweens, button);

        var delay = 0;
        if (multiplier > 1)
        {
            WordFallUi.CountUp(this._tweens, this._amount, this._result.reward, reward, 0, 0.4);
            delay = 0.4;
        }
        WordFallUi.CountUp(this._tweens, this._coins, from, to, delay, 0.7);
        this._tweens.Add(delay + 1.0, 0.25, function(k) {
            self._content.SetTransparency(1 - k);
        }, function() {
            self._content.SetEnabled(false);
            self._content.SetTransparency(1);
            self._open = false;
        });
    }

    Update(dt)
    {
        this._tweens.Update(dt);
        if (!this._open)
            return;

        // буквы на плашках парят, сова кивает
        this._time += dt;
        for (var i = 0; i < this._tiles.length; i++)
        {
            var tile = this._tiles[i];
            if (tile.widget)
                tile.widget.GetTransform().SetAngleDegrees(5*Math.sin(this._time*1.4 + tile.phase));
        }
        if (this._owl)
            this._owl.GetTransform().SetAngleDegrees(3*Math.sin(this._time*2.1));
    }
};
