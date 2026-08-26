// Root scriptable component of the bootstrap scene: loads the game modules and drives the game.
// Assigned to a global property: a bare `class` declaration is a lexical binding the
// component loader can't see when it looks the class up by file name
var ZeroLine = class extends o2.Component
{
    constructor()
    {
        super();
        this._started = false;
    }

    OnStart()
    {
        this._TryStart();
    }

    // The Bridge is registered by the host component or the application; whichever
    // component starts first, the game boots as soon as the API is there
    _TryStart()
    {
        if (this._started || typeof Bridge === 'undefined')
            return;

        this._started = true;

        Bridge.RunScript("ZL_Core.js");
        Bridge.RunScript("ZL_Board.js");
        Bridge.RunScript("ZL_BoardView.js");
        Bridge.RunScript("ZL_Hud.js");
        Bridge.RunScript("ZL_Popup.js");
        Bridge.RunScript("ZL_Game.js");

        ZL.game = new ZL.Game(this._actor);
        ZL.game.Start();
    }

    Update(dt)
    {
        if (!this._started)
        {
            this._TryStart();
            if (!this._started)
                return;
        }

        ZL.game.Update(dt);
    }
}
