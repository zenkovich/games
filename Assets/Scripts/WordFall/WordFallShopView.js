include("Scripts/WordFall/WordFallWindow.js");

// Банк (WordFall/UI/ShopWindow.proto): шесть пачек монет и баланс. Платежей в игре нет — пачка засчитывается сразу
// (WordFallGameService.BuyCoins); окно остаётся открытым, баланс догоняет покупку
WordFallShopView = class WordFallShopView extends WordFallWindow
{
    constructor() { super("shop"); this._shown = -1; }

    OnInit()
    {
        var self = this;
        this._balance = this._Child("safe_area/dialog/balance/value");
        this._packs = [];
        for (var i = 0; i < 6; i++)
        {
            var path = "safe_area/dialog/packs/pack" + i;
            this._packs.push({ amount: this._Child(path + "/amount"), price: this._Child(path + "/buy/label") });
            (function(index) { self._Bind(path + "/buy", function() { self._Buy(index); }); })(i);
        }
    }

    OnOpen()
    {
        var packs = this._svc.GetShopPacks();
        for (var i = 0; i < this._packs.length; i++)
        {
            var pack = packs[i] || { coins: 0, price: "" };
            this._SetText(this._packs[i].amount, WordFallUi.FormatNumber(pack.coins));
            this._SetText(this._packs[i].price, pack.price);
        }
        this._shown = this._svc.GetCoins();
        this._SetText(this._balance, WordFallUi.FormatNumber(this._shown));
    }

    _Buy(index)
    {
        if (this.IsOpen())
            this._svc.BuyCoins(index);
    }

    Update(dt)
    {
        if (!this.IsOpen())
            return;
        // баланс догоняет покупку примерно за полсекунды
        var target = this._svc.GetCoins();
        if (this._shown == target)
            return;
        var step = (target - this._shown)*Math.min(1, dt*7);
        this._shown = Math.abs(target - this._shown) <= 1 ? target : this._shown + (Math.abs(step) < 1 ? Math.sign(step) : step);
        this._SetText(this._balance, WordFallUi.FormatNumber(Math.round(this._shown)));
    }
};
