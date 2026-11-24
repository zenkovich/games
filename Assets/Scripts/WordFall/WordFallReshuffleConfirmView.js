globalThis.WordFallGame = globalThis.WordFallGame || {};
globalThis.WordFallViews = globalThis.WordFallViews || {};

// Подтверждение решафла (Screen/ReshuffleConfirm экрана игры): посреди экрана кнопка «Перемешать» над затемнением.
// Открытие и закрытие — состояние visible корня (клип в прототипе), вьюха только включает и выключает корень.
// Клик по затемнению — отмена
WordFallReshuffleConfirmView = class WordFallReshuffleConfirmView extends o2.Component
{
    constructor()
    {
        super();
        WordFallViews.reshuffleConfirm = this;
        this._ready = false;
        this._onClosed = null;
    }

    OnStart() { this._Init(); }

    IsOpen() { return this._ready && this._actor.IsEnabled(); }

    // onClosed(confirmed) — когда кнопку нажали (true) или подтверждение отменили (false)
    Open(onClosed)
    {
        this._Init();
        this._onClosed = onClosed || null;
        this._actor.SetEnabled(true);
    }

    Confirm() { this._Close(true); }
    Cancel() { this._Close(false); }

    _Close(confirmed)
    {
        if (!this.IsOpen())
            return;
        this._actor.SetEnabled(false);
        var then = this._onClosed;
        this._onClosed = null;
        if (then)
            then(confirmed);
    }

    _Init()
    {
        if (this._ready || !this._actor)
            return;
        this._ready = true;

        var self = this;
        this._actor.GetChild("dimmer").onClick = function() { self.Cancel(); };
        this._actor.GetChild("dialog/button").onClick = function() { self.Confirm(); };
    }
};
