include("Scripts/WordFall/WordFallWindow.js");

// Покупка бустера (кнопки под полем) или бонуса на старт уровня (WordFall/UI/BoosterShopWindow.proto): картинка,
// что он делает, пачка за монеты. Монет не хватает — поверх открывается банк
WordFallBoosterShopView = class WordFallBoosterShopView extends WordFallWindow
{
    constructor() { super("boosterShop"); this._item = null; }

    // Бустеры — по индексам WordLevel, бонусы — по индексам WordFallGameService.BonusKinds
    static get Boosters()
    {
        return [
            { key: "hammer", title: "HAMMER", text: "Breaks one tile\nor a layer of an obstacle" },
            { key: "shuffle", title: "SHUFFLE", text: "New letters on the board,\nsome tiles swap places" },
            { key: "hint", title: "HINT", text: "Shows a word\nthat helps the goals" },
            { key: "joker", title: "JOKER", text: "Turns a tile\ninto any letter" }
        ];
    }

    static get Bonuses()
    {
        return [
            { key: "bomb", title: "BOMB", text: "A bomb on the board\nat the start of a level" },
            { key: "rocket", title: "ROCKET", text: "A rocket on the board\nat the start of a level" },
            { key: "fireworks", title: "FIREWORKS", text: "Fireworks on the board\nat the start of a level" }
        ];
    }

    OnInit()
    {
        var self = this;
        this._title = this._Child("safe_area/dialog/header/title");
        this._text = this._Child("safe_area/dialog/parchment/description");
        this._amount = this._Child("safe_area/dialog/parchment/amount_badge/amount");
        this._price = this._Child("safe_area/dialog/buy_button/label");
        this._owned = this._Child("safe_area/dialog/owned");
        this._buy = this._Bind("safe_area/dialog/buy_button", function() { self._Buy(); });
        this._icons = {};
        var all = WordFallBoosterShopView.Boosters.concat(WordFallBoosterShopView.Bonuses);
        for (var i = 0; i < all.length; i++)
            this._icons[all[i].key] = this._Child("safe_area/dialog/parchment/icon_" + all[i].key);
    }

    // item: { booster: индекс } или { bonus: индекс }; onClosed(true), если покупка состоялась
    Open(item, onClosed)
    {
        this._item = item;
        super.Open(onClosed);
    }

    _Info()
    {
        var item = this._item || { booster: 0 };
        return item.bonus !== undefined ? WordFallBoosterShopView.Bonuses[item.bonus] : WordFallBoosterShopView.Boosters[item.booster];
    }

    _Price()
    {
        var item = this._item || { booster: 0 };
        return item.bonus !== undefined ? this._svc.GetBonusPrice(item.bonus) : this._svc.GetBoosterPrice(item.booster);
    }

    _Owned()
    {
        var item = this._item || { booster: 0 };
        return item.bonus !== undefined ? this._svc.GetBonusCount(item.bonus) : this._svc.GetBoosterStock(item.booster);
    }

    OnOpen()
    {
        var info = this._Info();
        for (var key in this._icons)
        {
            if (this._icons[key])
                this._icons[key].SetEnabled(key == info.key);
        }
        this._SetText(this._title, info.title);
        this._SetText(this._text, info.text);
        this._SetText(this._amount, "x" + this._svc.boosterPack);
        this._SetText(this._price, WordFallUi.FormatNumber(this._Price()));
        this._SetText(this._owned, "You have " + this._Owned());
        this._SetAffordable(this._buy, this._svc.GetCoins() >= this._Price());
    }

    _Buy()
    {
        if (!this.IsOpen())
            return;
        var item = this._item || { booster: 0 };
        var bought = item.bonus !== undefined ? this._svc.BuyBonus(item.bonus) : this._svc.BuyBooster(item.booster);
        if (bought)
            this.Close(true);
        else
            this._OpenBank();
    }
};
