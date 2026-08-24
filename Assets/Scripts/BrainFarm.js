// Root scriptable component of the bootstrap scene: loads the game modules and drives the game.
// Assigned to a global property: a bare `class` declaration is a lexical binding the
// component loader can't see when it looks the class up by file name
var BrainFarm = class extends o2.Component
{
    constructor()
    {
        super();
        this._started = false;
    }

    OnStart()
    {
        if (this._started) // the component may receive OnStart more than once per scene
            return;

        // Without the C++ bridge nothing can be loaded; report once instead of failing every frame
        if (typeof Bridge === 'undefined')
        {
            print("BrainFarm: the Bridge API is not registered, the game stays idle");
            return;
        }

        this._started = true;

        Bridge.RunScript("BF_Core.js");
        Bridge.RunScript("BF_Hud.js");
        Bridge.RunScript("BF_Player.js");
        Bridge.RunScript("BF_Plantations.js");
        Bridge.RunScript("BF_Counter.js");
        Bridge.RunScript("BF_Zombies.js");
        Bridge.RunScript("BF_Game.js");

        BF.game = new BF.Game(this._actor);
        BF.game.Start();
    }

    Update(dt)
    {
        if (!this._started)
            return;

        BF.game.Update(dt);
    }
}
