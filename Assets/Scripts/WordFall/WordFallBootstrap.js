globalThis.WordFallGame = globalThis.WordFallGame || {};

// Точка входа сцены WordFall: собирает экран игры из прототипа при старте и переключает
// его с редактором уровней (WordFallGame.screens). Сервис игры живёт рядом, на акторе GameService
WordFallBootstrap = class WordFallBootstrap extends o2.Component
{
    constructor()
    {
        super();
        this.screenPrototype = "WordFall/Prototypes/GameScreen.proto"; // экран: поле, HUD, панели, эффекты
        this.editorPrototype = "WordFall/Prototypes/LevelEditorScreen.proto"; // редактор уровней, создаётся при первом открытии
        this._game = null;
        this._editor = null;
    }

    OnStart()
    {
        WordFallGame.screens = this;
        var self = this;
        this._game = o2.Profile("WordFall: game screen", function() { return self._Instantiate(self.screenPrototype); });
    }

    IsEditorOpen() { return this._editor != null && this._editor.IsEnabled(); }

    ShowEditor()
    {
        if (!this._editor)
            this._editor = this._Instantiate(this.editorPrototype);
        if (!this._editor)
            return;

        this._editor.SetEnabled(true);
        if (this._game)
            this._game.SetEnabled(false);
    }

    ShowGame()
    {
        if (this._editor)
            this._editor.SetEnabled(false);
        if (this._game)
            this._game.SetEnabled(true);
    }

    _Instantiate(path)
    {
        var asset = new o2.AssetRefActorAsset(path);
        if (!asset.IsValid())
        {
            print("WordFall: no screen prototype " + path);
            return null;
        }
        return asset.Get().Instantiate();
    }
};
