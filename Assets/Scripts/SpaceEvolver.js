// Root scriptable component of the bootstrap scene: loads the game modules and drives the game.
// Assigned to a global property: a bare `class` declaration is a lexical binding the
// component loader can't see when it looks the class up by file name
var SpaceEvolver = class extends o2.Component
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
            print("SpaceEvolver: the Bridge API is not registered, the game stays idle");
            return;
        }

        this._started = true;

        Bridge.RunScript("SE_Core.js");
        Bridge.RunScript("SE_Configs.js");
        Bridge.RunScript("SE_Meta.js");
        Bridge.RunScript("SE_Fx.js");
        Bridge.RunScript("SE_Tutorial.js");
        Bridge.RunScript("SE_Run.js");
        Bridge.RunScript("SE_Hangar.js");

        SE.LoadConfigs();
        SE.game = new SE.Game(this._actor);
        SE.game.Start();
    }

    Update(dt)
    {
        if (!this._started)
            return;

        SE.game.Update(dt);
    }
}
