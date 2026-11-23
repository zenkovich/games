include("Scripts/WordFall/WordFallWindow.js");

// Жизни (WordFall/UI/LivesWindow.proto): сколько есть, когда следующая, полный запас за монеты, жизнь за ролик.
// Рекламы в игре нет: просмотр засчитывается сразу
WordFallLivesView = class WordFallLivesView extends WordFallWindow
{
    constructor() { super("lives"); this._shownSeconds = -1; this._shownLives = -1; }

    OnInit()
    {
        var self = this;
        this._count = this._Child("safe_area/dialog/parchment/heart/count");
        this._status = this._Child("safe_area/dialog/parchment/status");
        this._price = this._Child("safe_area/dialog/refill_button/label");
        this._refill = this._Bind("safe_area/dialog/refill_button", function() { self._Refill(); });
        this._ad = this._Bind("safe_area/dialog/ad_button", function() { self._Ad(); });
    }

    OnOpen()
    {
        this._shownSeconds = -1;
        this._shownLives = -1;
        this._SetText(this._price, WordFallUi.FormatNumber(this._svc.livesRefillPrice));
        this._Sync();
    }

    _Sync()
    {
        var svc = this._svc;
        var lives = svc.GetLives(), full = lives >= svc.GetMaxLives();
        var seconds = svc.GetNextLifeSeconds();
        if (lives != this._shownLives)
        {
            this._shownLives = lives;
            this._SetText(this._count, "" + lives);
            this._SetAffordable(this._refill, !full && svc.GetCoins() >= svc.livesRefillPrice);
            this._SetAffordable(this._ad, !full);
        }
        if (seconds != this._shownSeconds)
        {
            this._shownSeconds = seconds;
            this._SetText(this._status, full ? "Your lives are full!" : "Next life in " + WordFallLivesView.FormatTime(seconds));
        }
    }

    static FormatTime(seconds)
    {
        var minutes = Math.floor(seconds/60), rest = seconds % 60;
        return minutes + ":" + (rest < 10 ? "0" : "") + rest;
    }

    _Refill()
    {
        var svc = this._svc;
        if (!this.IsOpen() || svc.GetLives() >= svc.GetMaxLives())
            return;
        if (!svc.RefillLivesWithCoins())
            this._OpenBank();
        this._shownLives = -1;
    }

    _Ad()
    {
        if (this.IsOpen())
            this._svc.AddLifeForAd();
        this._shownLives = -1;
    }

    Update(dt)
    {
        if (this.IsOpen())
            this._Sync();
    }
};
