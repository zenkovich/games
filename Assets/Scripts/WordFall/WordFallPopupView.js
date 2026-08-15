// Вьюха попапа финала уровня: следит за состоянием игры по ревизии сервиса,
// показывает результат и ведёт по кампании (дальше / сначала / ещё раз).
// Контент — отдельный включаемый виджет Content с анимацией появления

WordFallPopupView = class WordFallPopupView extends o2.Component
{
    constructor()
    {
        super();
        this._svc = null;
        this._vfx = null;
        this._shownState = "playing";
        this._lastRevision = -1;
    }

    OnStart()
    {
        globalThis.WordFallViews = globalThis.WordFallViews || {};
        WordFallViews.popup = this;

        this._svc = this.serviceActor.GetComponent("WordFallGameService");
        if (this.vfxActor)
            this._vfx = this.vfxActor.GetComponent("WordFallVfx");

        this._content = this._actor.GetChild("Content");
        this._title = this._actor.GetChild("Content/Title");
        this._scoreLine = this._actor.GetChild("Content/ScoreLine");
        this._button = this._actor.GetChild("Content/RestartBtn/Btn");
        this._buttonCaption = this._button.GetLayer("caption").drawable;

        var self = this;
        this._button.onClick = function() { self.OnButton(); };
    }

    _IsLastLevel()
    {
        return this._svc.GetLevelIndex() >= this._svc.GetLevelCount() - 1;
    }

    Show(won)
    {
        var last = this._IsLastLevel();
        this._title.SetText(won ? (last ? "ИГРА ПРОЙДЕНА!" : "УРОВЕНЬ ПРОЙДЕН!") : "ПОРАЖЕНИЕ");
        this._scoreLine.SetText("Очки: " + this._svc.GetScore());
        this._buttonCaption.text = won ? (last ? "СНАЧАЛА" : "ДАЛЬШЕ") : "ЕЩЁ РАЗ";
        this._content.SetEnabled(true);

        if (won && this._vfx)
            this._vfx.PlayWin();
    }

    Hide()
    {
        this._content.SetEnabled(false);
    }

    OnButton()
    {
        var fx = WordFallViews.fx;
        if (fx)
            fx.Finish();

        // победа двигает прогресс (с сохранением), поражение — рестарт текущего
        if (this._svc.GetGameState() == "won")
            this._svc.AdvanceToNextLevel();
        else
            this._svc.RestartLevel();

        this._shownState = "playing";
        this.Hide();

        var boosters = WordFallViews.boosters;
        if (boosters)
            boosters.CancelAimMode();
    }

    Update(dt)
    {
        if (!this._svc)
            return;

        var state = this._svc.GetGameState();
        var fx = WordFallViews.fx;

        // попап ждёт окончания хореографии начисления очков
        if (state != "playing" && this._shownState != state && (!fx || !fx.IsBusy()))
        {
            this._shownState = state;
            this.Show(state == "won");
        }
        else if (state == "playing" && this._shownState != "playing")
        {
            this._shownState = "playing";
            this.Hide();
        }
    }
};
