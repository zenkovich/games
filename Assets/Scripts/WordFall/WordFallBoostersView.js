// Вьюха панели бустеров: пять круглых кнопок с бейджами зарядов и режим
// прицела (молоток/джокер/удвоитель применяются кликом по плитке)

WordFallBoostersView = class WordFallBoostersView extends o2.Component
{
    constructor()
    {
        super();
        this._svc = null;
        this._chargeLabels = [];
        this._aimMode = null;   // null | "hammer" | "joker" | "doubler"
        this._lastRevision = -1;
    }

    OnStart()
    {
        globalThis.WordFallViews = globalThis.WordFallViews || {};
        WordFallViews.boosters = this;

        this._svc = this.serviceActor.GetComponent("WordFallGameService");
        this._modeLabel = this._actor.GetChild("ModeLabel");

        var modes = ["hammer", "shuffle", "hint", "joker", "doubler"];
        var self = this;
        for (var i = 0; i < 5; i++)
        {
            var booster = this._actor.GetChild("Booster" + i);
            this._chargeLabels.push(booster.GetChild("Charge"));

            (function(index, mode) {
                booster.GetChild("Btn").onClick = function() { self.OnBooster(index, mode); };
            })(i, modes[i]);
        }
    }

    HasAimMode() { return this._aimMode != null; }

    ConsumeAimMode()
    {
        var mode = this._aimMode;
        this._aimMode = null;
        this._SyncModeLabel();
        return mode;
    }

    CancelAimMode()
    {
        this._aimMode = null;
        this._SyncModeLabel();
    }

    OnBooster(index, mode)
    {
        var svc = this._svc;
        if (svc.GetGameState() != "playing")
            return;

        if (this._aimMode == mode)
        {
            this.CancelAimMode(); // повторный клик — отмена прицела
            return;
        }

        if (svc.GetBoosterCharges(index) <= 0)
            return;

        if (mode == "shuffle")
            svc.UseShuffle();
        else if (mode == "hint")
            svc.UseHint();
        else
        {
            this._aimMode = mode;
            this._SyncModeLabel();
        }
    }

    _SyncModeLabel()
    {
        var texts = {
            hammer: "Молоток: кликните плитку",
            joker: "Джокер: кликните плитку",
            doubler: "Удвоитель: кликните плитку"
        };
        this._modeLabel.SetText(this._aimMode ? texts[this._aimMode] : "");
    }

    Sync()
    {
        for (var i = 0; i < 5; i++)
            this._chargeLabels[i].SetText("" + this._svc.GetBoosterCharges(i));
    }

    Update(dt)
    {
        if (!this._svc)
            return;

        var revision = this._svc.GetRevision();
        if (revision != this._lastRevision)
        {
            this._lastRevision = revision;
            this.Sync();
        }
    }
};
