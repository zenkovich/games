include("Scripts/WordFall/WordFallWindow.js");

// Выход из уровня (WordFall/UI/QuitLevelWindow.proto, крестик на экране уровня): уйти — жизнь сгорает и игрок
// возвращается на главный экран; играть дальше — окно закрывается
WordFallQuitView = class WordFallQuitView extends WordFallWindow
{
    constructor() { super("quit"); }

    OnInit()
    {
        var self = this;
        this._Bind("dialog/quit_button", function() { self._Quit(); });
        this._Bind("dialog/play_on_button", function() { self.Close(); });
    }

    _Quit()
    {
        if (!this.IsOpen())
            return;
        this.Close();
        this._svc.GiveUpLevel();
        if (WordFallGame.screens)
            WordFallGame.screens.ShowMain();
    }
};
