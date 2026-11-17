include("Scripts/WordFall/WordFallUiTweens.js");

globalThis.WordFallGame = globalThis.WordFallGame || {};

// Окно продолжения (макет пайплайна «Wordfall UI», WordFall/UI/ContinueWindow.proto) поверх поля, когда кончились
// ходы: +N ходов за монеты или за ролик; крестик — отказ: жизнь сгорает, игрок возвращается на главный экран
WordFallContinueView = class WordFallContinueView extends o2.Component
{
    constructor()
    {
        super();
        globalThis.WordFallViews = globalThis.WordFallViews || {};
        WordFallViews.continueWindow = this;
        this._tweens = new WordFallUiTweens();
        this._ready = false;
        this._open = false;
        this._time = 0;
    }

    OnStart() { this._Init(); }

    IsOpen() { return this._open; }

    _Init()
    {
        if (this._ready || !this._actor)
            return;
        this._ready = true;

        var self = this;
        var root = this._actor;
        var parchment = "dialog_frame/message_parchment/";
        this._dim = root.GetChild("background_dimmer");
        this._dialog = root.GetChild("continue_dialog");
        this._dimTransparency = this._dim.GetTransparency();
        this._moves = this._dialog.GetChild(parchment + "moves_ribbon/moves_amount");
        this._message = this._dialog.GetChild(parchment + "continue_message");
        this._ribbon = this._dialog.GetChild(parchment + "moves_ribbon");
        this._price = this._dialog.GetChild("dialog_frame/action_row/buy_moves_button/buy_moves_price");
        this._buy = this._dialog.GetChild("dialog_frame/action_row/buy_moves_button");
        this._ad = this._dialog.GetChild("dialog_frame/action_row/watch_ad_button");
        this._close = this._dialog.GetChild("close_button");
        this._owl = this._dialog.GetChild("owl_portrait");
        WordFallUi.Center(this._ribbon);
        WordFallUi.Center(this._owl);

        this._buy.onClick = function() { self._Buy(); };
        // Рекламы в игре нет: просмотр ролика засчитывается сразу
        this._ad.onClick = function() {
            if (self._open && WordFallGame.service.ContinueForAd())
                self.Close();
        };
        this._close.onClick = function() { self._GiveUp(); };

        this._SetShown(false);
    }

    _SetShown(shown)
    {
        this._dim.SetEnabled(shown);
        this._dialog.SetEnabled(shown);
    }

    Open()
    {
        this._Init();
        var svc = WordFallGame.service;
        this._open = true;
        this._time = 0;
        this._tweens.Clear();

        this._moves.SetText("+" + svc.continueMoves);
        this._message.SetText("Add " + svc.continueMoves + " moves and\ncontinue!");
        this._price.SetText(WordFallUi.FormatNumber(svc.continuePrice));
        this._buy.SetTransparency(svc.CanContinueWithCoins() ? 1 : 0.6);
        this._SetShown(true);
        this._dialog.SetTransparency(1);

        WordFallUi.FadeIn(this._tweens, this._dim, 0, 0.3, this._dimTransparency);
        WordFallUi.PopIn(this._tweens, this._dialog, 0.05, 0.42);
    }

    Close(then)
    {
        if (!this._open)
            return;
        this._open = false;

        var self = this;
        this._tweens.Add(0.12, 0.22, function(k) {
            self._dialog.SetTransparency(1 - k);
            self._dim.SetTransparency(self._dimTransparency*(1 - k));
        }, function() {
            self._SetShown(false);
            if (then)
                then();
        });
    }

    _Buy()
    {
        if (!this._open)
            return;

        if (WordFallGame.service.ContinueWithCoins())
        {
            WordFallUi.Bounce(this._tweens, this._buy);
            this.Close();
        }
        else
            WordFallUi.Shake(this._tweens, this._buy);
    }

    _GiveUp()
    {
        if (!this._open)
            return;

        WordFallGame.service.GiveUpLevel();
        this.Close(function() {
            if (WordFallGame.screens)
                WordFallGame.screens.ShowMain();
        });
    }

    Update(dt)
    {
        this._tweens.Update(dt);
        if (!this._open)
            return;

        // лента с ходами дышит, сова кивает
        this._time += dt;
        WordFallUi.SetScale(this._ribbon, 1 + 0.03*Math.sin(this._time*3.0));
        if (this._owl)
            this._owl.GetTransform().SetAngleDegrees(3*Math.sin(this._time*2.1));
    }
};
