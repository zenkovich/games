globalThis.WordFallGame = globalThis.WordFallGame || {};

// Вьюха панели бустеров: пять круглых кнопок с бейджами зарядов и режим
// прицела (молоток/джокер применяются кликом по плитке); решафл спрашивает подтверждение посреди экрана

WordFallBoostersView = class WordFallBoostersView extends o2.Component
{
    get _svc() { return WordFallGame.service; }

    constructor()
    {
        super();
        this._chargeLabels = [];
        this._aimMode = null;   // null | "hammer" | "joker"
        this._lastRevision = -1;
    }

    OnStart()
    {
        globalThis.WordFallViews = globalThis.WordFallViews || {};
        WordFallViews.boosters = this;

        this._modeLabel = this._actor.GetChild("ModeLabel");

        var modes = ["hammer", "shuffle", "hint", "joker", "reshuffle"];
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
        var board = WordFallViews.board;
        if (svc.GetGameState() != "playing" || (board && board.IsReshuffling()))
            return;

        if (this._aimMode == mode)
        {
            this.CancelAimMode(); // повторный клик — отмена прицела
            return;
        }

        if (svc.GetBoosterCharges(index) <= 0)
        {
            // в кампании заряды — запас игрока: пустой бустер открывает его покупку
            if (WordFallGame.screens && WordFallGame.screens.IsMetaFlow() && !svc.IsCustomLevel() && WordFallViews.boosterShop)
                WordFallViews.boosterShop.Open({ booster: index });
            return;
        }

        if (mode == "shuffle")
            svc.UseShuffle();
        else if (mode == "reshuffle")
            this._AskReshuffle();
        else if (mode == "hint")
        {
            // подсказка: сервис находит слово, вью разбирает выбор и
            // прощёлкивает буквы по одной — они штатно улетают в лоток
            if (svc.UseHint())
            {
                var cells = svc.GetSelection();
                svc.ClearSelection();
                if (board)
                    board.SelectAnimated(cells);
            }
        }
        else
        {
            this._aimMode = mode;
            this._SyncModeLabel();
        }
    }

    // Решафл — после кнопки «Перемешать» посреди экрана; клик мимо неё отменяет
    _AskReshuffle()
    {
        this.CancelAimMode();
        var board = WordFallViews.board;
        var confirm = WordFallViews.reshuffleConfirm;
        if (!board)
            return;
        if (!confirm)
        {
            board.Reshuffle();
            return;
        }
        board.PrepareReshuffle();
        confirm.Open(function(confirmed) {
            if (confirmed)
                board.Reshuffle();
        });
    }

    _SyncModeLabel()
    {
        var texts = {
            hammer: "Молоток: кликните плитку",
            joker: "Джокер: кликните плитку"
        };
        this._modeLabel.SetText(this._aimMode ? texts[this._aimMode] : "");
        this._modeLabel.SetEnabled(this._aimMode != null); // плашка подсказки закрывает поле лотка, пока идёт прицел
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
