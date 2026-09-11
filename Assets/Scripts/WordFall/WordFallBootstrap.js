// Точка входа сцены WordFall: собирает экран игры из прототипа при старте.
// Сервис игры живёт рядом, на акторе GameService
WordFallBootstrap = class WordFallBootstrap extends o2.Component
{
    constructor()
    {
        super();
        this.screenPrototype = "WordFall/Prototypes/GameScreen.proto"; // экран: поле, HUD, панели, эффекты
    }

    OnStart()
    {
        var asset = new o2.AssetRefActorAsset(this.screenPrototype);
        if (!asset.IsValid())
        {
            print("WordFall: no screen prototype " + this.screenPrototype);
            return;
        }
        asset.Get().Instantiate();
    }
};
