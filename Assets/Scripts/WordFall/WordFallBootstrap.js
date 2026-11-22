include("Scripts/WordFall/WordFallBotRunner.js");

globalThis.WordFallGame = globalThis.WordFallGame || {};

// Точка входа сцены WordFall: собирает экраны из прототипов при старте и переключает их (WordFallGame.screens).
// Игра начинается с главного экрана; конец уровня ведёт в окно победы поверх главного экрана или в окно
// продолжения поверх поля. Без главного экрана (startOnMain = false) — сразу уровень, финал в попапе поля.
// С запросом LevelLab (botRequestPath) игра сразу открывает его уровень, и играет бот или сам человек.
// Сервис игры живёт рядом, на акторе GameService
WordFallBootstrap = class WordFallBootstrap extends o2.Component
{
    constructor()
    {
        super();
        this.screenPrototype = "WordFall/Prototypes/GameScreen.proto"; // экран: поле, HUD, панели, эффекты
        this.editorPrototype = "WordFall/Prototypes/LevelEditorScreen.proto"; // редактор уровней, создаётся при первом открытии
        this.mainPrototype = "WordFall/UI/MainScreen.proto";              // главный экран (макет пайплайна «Wordfall UI»)
        this.victoryPrototype = "WordFall/UI/VictoryWindow.proto";        // окно победы
        this.continuePrototype = "WordFall/UI/ContinueWindow.proto";      // окно продолжения за ходы
        this.windowPrototypes = [                                          // окна меты (Tools/WordFall/build_meta_windows.py)
            "WordFall/UI/LevelStartWindow.proto", "WordFall/UI/LivesWindow.proto", "WordFall/UI/SettingsWindow.proto",
            "WordFall/UI/QuitLevelWindow.proto", "WordFall/UI/BoosterShopWindow.proto", "WordFall/UI/ShopWindow.proto"
        ];
        this.startOnMain = true;   // начинать с главного экрана
        this.endDelay = 0.5;       // пауза после эффектов финала уровня до окна, с
        this.botRequestPath = "wordfall_bot.json"; // запрос LevelLab на прогон бота, файл рядом с игрой
        this._bot = null;
        this._game = null;
        this._editor = null;
        this._main = null;
        this._victory = null;
        this._continue = null;
        this._ended = "";
        this._endWait = 0;

        WordFallGame.screens = this;
    }

    OnStart()
    {
        WordFallGame.screens = this;
        var self = this;
        var request = WordFallBotRunner.ReadRequest(this.botRequestPath);
        if (request)
            this._bot = new WordFallBotRunner(request);
        this._game = o2.Profile("WordFall: game screen", function() { return self._Instantiate(self.screenPrototype); });
        if (!this.startOnMain || this._bot)
            return;

        o2.Profile("WordFall: meta screens", function() {
            self._main = self._Instantiate(self.mainPrototype);
            self._victory = self._Instantiate(self.victoryPrototype);
            self._continue = self._Instantiate(self.continuePrototype);
            self.windowPrototypes.forEach(function(path) { self._Instantiate(path); });
        });
        if (this._main)
            this.ShowMain();
    }

    // Конец уровня решают окна меты, а не попап поля
    IsMetaFlow() { return this._main != null; }

    IsEditorOpen() { return this._editor != null && this._editor.IsEnabled(); }
    IsMainShown() { return this._main != null && this._main.IsEnabled(); }

    ShowEditor()
    {
        if (!this._editor)
            this._editor = this._Instantiate(this.editorPrototype);
        if (!this._editor)
            return;

        this._editor.SetEnabled(true);
        if (this._game)
            this._game.SetEnabled(false);
        if (this._main)
            this._main.SetEnabled(false);
    }

    ShowGame()
    {
        if (this._editor)
            this._editor.SetEnabled(false);
        if (this._main)
            this._main.SetEnabled(false);
        if (this._game)
            this._game.SetEnabled(true);
    }

    ShowMain()
    {
        if (this._editor)
            this._editor.SetEnabled(false);
        if (this._game)
            this._game.SetEnabled(false);
        if (this._main)
            this._main.SetEnabled(true);
    }

    // PLAY главного экрана: без жизней — окно жизней, иначе окно старта уровня с выбором бонусов
    Play()
    {
        var svc = WordFallGame.service;
        var views = globalThis.WordFallViews || {};
        if (svc && svc.GetLives() <= 0 && views.lives)
            views.lives.Open();
        else if (views.levelStart)
            views.levelStart.Open();
        else
            this.PlayLevel([]);
    }

    // Уровень кампании с нуля, с бонусами на старт (индексы WordFallGameService.BonusKinds)
    PlayLevel(bonuses)
    {
        var svc = WordFallGame.service;
        if (svc)
            svc.StartLevelWithBonuses(bonuses);
        this.ShowGame();
    }

    // Конец уровня: после эффектов начисления и короткой паузы — окно победы (поверх главного экрана) или
    // окно продолжения (поверх поля)
    Update(dt)
    {
        if (this._bot)
            this._bot.Update(dt);

        var svc = WordFallGame.service;
        if (!this.IsMetaFlow() || !svc || !this._game || !this._game.IsEnabled())
            return;

        var state = svc.GetGameState();
        if (state == "playing")
        {
            this._ended = "";
            this._endWait = 0;
            return;
        }
        if (this._ended == state)
            return;

        var fx = globalThis.WordFallViews ? WordFallViews.fx : null;
        if (fx && fx.IsBusy())
        {
            this._endWait = 0;
            return;
        }
        this._endWait += dt;
        if (this._endWait < this.endDelay)
            return;

        this._ended = state;
        if (state == "won")
        {
            if (fx)
                fx.Finish();
            var result = svc.WinLevel();
            this.ShowMain();
            if (WordFallViews.victory)
                WordFallViews.victory.Open(result);
        }
        else if (WordFallViews.continueWindow)
            WordFallViews.continueWindow.Open();
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
