include("Scripts/WordFall/WordFallUiTweens.js");

globalThis.WordFallGame = globalThis.WordFallGame || {};
globalThis.WordFallViews = globalThis.WordFallViews || {};

// Окно меты (прототипы WordFall/UI/*Window.proto собирает Tools/WordFall/build_meta_windows.py): корень — кадр ui
// camera, затемнение под диалогом ловит клики (клик мимо диалога закрывает окно), диалог посередине. Открытие и
// закрытие — состояние visible корня: его клип в прототипе проявляет затемнение и выталкивает диалог, вьюха только
// включает и выключает корень. Окна открываются друг над другом (банк над покупкой бустера), их порядок — глубина
// отрисовки прототипов
WordFallWindow = class WordFallWindow extends o2.Component
{
    constructor(key)
    {
        super();
        WordFallViews[key] = this;
        this._ready = false;
        this._onClosed = null;
    }

    get _svc() { return WordFallGame.service; }

    OnStart() { this._Init(); }

    IsOpen() { return this._ready && this._actor.IsEnabled(); }

    // onClosed(result) — когда окно закрылось; result — что вернуло окно (Close(result))
    Open(onClosed)
    {
        this._Init();
        this._onClosed = onClosed || null;
        this.OnOpen();
        this._actor.SetEnabled(true);
    }

    Close(result)
    {
        if (!this.IsOpen())
            return;
        this._actor.SetEnabled(false);
        var then = this._onClosed;
        this._onClosed = null;
        if (then)
            then(result);
    }

    // Наследники: OnInit — найти виджеты и повесить кнопки, OnOpen — заполнить окно перед показом
    OnInit() {}
    OnOpen() {}

    _Init()
    {
        if (this._ready || !this._actor)
            return;
        this._ready = true;

        var self = this;
        this._Bind("dimmer", function() { self.Close(); });
        this._Bind("safe_area/dialog/close_button", function() { self.Close(); });
        this.OnInit();
    }

    _Child(path)
    {
        var child = this._actor.GetChild(path);
        if (!child)
            print("WordFall: no " + path + " in " + this._actor.GetName());
        return child;
    }

    _Bind(path, action)
    {
        var button = this._Child(path);
        if (button)
            button.onClick = action;
        return button;
    }

    _SetText(label, text)
    {
        if (label)
            label.SetText(text);
    }

    // Кнопка покупки тускнеет, когда монет не хватает
    _SetAffordable(button, affordable)
    {
        if (button)
            button.SetTransparency(affordable ? 1 : 0.6);
    }

    // Монет не хватает: поверх открывается банк, после него окно обновляется
    _OpenBank()
    {
        var self = this;
        if (WordFallViews.shop)
            WordFallViews.shop.Open(function() { if (self.IsOpen()) self.OnOpen(); });
    }
};
