#include "o2/stdafx.h"
#include "WordFallUITestSupport.h"
#include "o2/Render/Camera.h"

// Мета по макетам пайплайна «Wordfall UI»: игра начинается с главного экрана, PLAY ведёт в уровень, победа —
// окно с наградой поверх главного экрана, кончились ходы — окно продолжения поверх поля. Клики настоящие
class WordFallMetaUI: public WordFallUI
{
protected:
	bool StartOnMainScreen() const override { return true; }

	static Ref<Actor> Find(const String& root, const String& path = "")
	{
		auto actor = o2Scene.FindActor(root);
		return actor && !path.IsEmpty() ? actor->GetChild(path) : actor;
	}

	static bool Shown(const String& root, const String& path = "")
	{
		auto actor = Find(root, path);
		return actor && actor->IsEnabledInHierarchy();
	}

	static String Text(const String& root, const String& path)
	{
		auto label = DynamicCast<Label>(Find(root, path));
		EXPECT_TRUE(label) << path.Data();
		return label ? String(label->GetText()) : String();
	}

	// Центр виджета в мире: экраны меты масштабированы, рамка layout'а — до масштаба
	static Vec2F Center(const Ref<Widget>& widget)
	{
		return widget->layout->GetLayoutToWorldBasis().Transform(widget->layout->GetWorldRect().Center());
	}

	static RectF WorldRect(const Ref<Widget>& widget)
	{
		Basis basis = widget->layout->GetLayoutToWorldBasis();
		RectF rect = widget->layout->GetWorldRect();
		return RectF(basis.Transform(rect.LeftBottom()), basis.Transform(rect.RightTop()));
	}

	static void Tap(const String& root, const String& path)
	{
		auto widget = DynamicCast<Widget>(Find(root, path));
		ASSERT_TRUE(widget) << path.Data();
		Click(Center(widget)/kGameScale); // Click берёт единицы экрана игры
		AppTestDriver::PumpFrames(3);
	}

	template<typename _cond>
	static bool WaitFor(_cond condition, float seconds)
	{
		for (float t = 0; t < seconds; t += 0.1f)
		{
			if (condition())
				return true;
			AppTestDriver::Wait(0.1f);
		}
		return condition();
	}

	// Окно в пропорциях iPhone 16: снимки — то, что покажет устройство кита
	void SetUp() override
	{
		WordFallUI::SetUp();
		o2Application.SetWindowSize(Vec2I(590, 1279));
		AppTestDriver::PumpFrames(3);
	}

	int Coins() const { return mService->Call("GetCoins").GetValue<int>(); }

	static ScriptValue Js(const String& code) { return o2Scripts.Eval(code); }

	// Окно меты открыто и его клип показа доигран (клики попадают в диалог в полный размер)
	static bool WindowOpen(const String& root)
	{
		if (!Shown(root))
			return false;
		auto dialog = DynamicCast<Widget>(Find(root, "dialog"));
		return dialog && dialog->transform->GetScale().x > 0.999f && dialog->transform->GetScale().x < 1.001f;
	}

	static bool WaitWindow(const String& root, float seconds = 3.0f)
	{
		bool shown = WaitFor([&]() { return Shown(root); }, seconds);
		AppTestDriver::Wait(0.45f);
		return shown && WindowOpen(root);
	}

	// Клик по затемнению над диалогом окна
	static void TapOutside(const String& root)
	{
		RectF dialog = WorldRect(DynamicCast<Widget>(Find(root, "dialog")));
		Click(Vec2F(dialog.Center().x, dialog.top + 60.0f)/kGameScale);
		AppTestDriver::PumpFrames(3);
	}

	static bool WaitClosed(const String& root, float seconds = 3.0f)
	{
		return WaitFor([&]() { return !Shown(root); }, seconds);
	}

	// PLAY главного экрана → окно старта уровня → его PLAY: уровень на поле
	void StartLevelFromMain()
	{
		Tap("MainScreen", "play_button");
		ASSERT_TRUE(WaitWindow("LevelStartWindow")) << "окно старта уровня";
		Tap("LevelStartWindow", "dialog/play_button");
		ASSERT_TRUE(WaitFor([]() { return Shown("WordFall"); }, 2.0f));
		AppTestDriver::Wait(0.3f);
	}

	int CountPowerups() const
	{
		int count = 0;
		for (int c = 0; c < 7; c++)
			for (int r = 0; r < 8; r++)
				count += Js(String::Format("WordFallGame.service.GetTile(%i, %i).powerup ? 1 : 0", c, r)).GetValue<int>();
		return count;
	}
	int Lives() const { return mService->Call("GetLives").GetValue<int>(); }

	void TearDown() override
	{
		o2FileSystem.FileDelete(mService->GetProgressPath());
		WordFallUI::TearDown();
	}
};

TEST_F(WordFallMetaUI, MainScreenComesFirstAndPlayStartsTheLevel)
{
	ASSERT_TRUE(Find("MainScreen"));
	EXPECT_TRUE(Shown("MainScreen"));
	EXPECT_FALSE(Shown("WordFall"));
	EXPECT_EQ(Text("MainScreen", "top_hud/coin_counter/coin_balance"), String("1,000"));
	EXPECT_EQ(Text("MainScreen", "top_hud/lives_counter/lives_value"), String("5"));
	EXPECT_EQ(Text("MainScreen", "top_hud/stars_counter/stars_value"), String("0"));
	EXPECT_FALSE(Shown("VictoryWindow", "home_screen"));
	EXPECT_FALSE(Shown("ContinueWindow", "continue_dialog"));

	// корень — кадр ui camera (экран iPhone 16) без масштаба; фон с пропорциями картинки покрывает и то, что камера
	// показывает за кадром, — до краёв фона экрана игры
	RectF root = WorldRect(DynamicCast<Widget>(Find("MainScreen")));
	EXPECT_NEAR(root.Width(), kCameraSize.x, 1.0f);
	EXPECT_NEAR(root.Height(), kCameraSize.y, 1.0f);
	EXPECT_NEAR(root.Center().x, 0.0f, 1.0f);
	EXPECT_NEAR(root.Center().y, 0.0f, 1.0f);
	EXPECT_NEAR(DynamicCast<Widget>(Find("MainScreen"))->layout->GetScale().x, 1.0f, 0.001f);
	RectF backdrop = WorldRect(DynamicCast<Widget>(Find("MainScreen", "backdrop")));
	EXPECT_LE(backdrop.left, root.left);
	EXPECT_GE(backdrop.right, root.right);
	EXPECT_GE(backdrop.Height(), 1933.0f*kGameScale - 1.0f);
	EXPECT_NEAR(backdrop.Width()/backdrop.Height(), 1179.0f/2112.0f, 0.01f) << "пропорции картинки сохранены";

	AppTestDriver::Wait(0.3f);
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "50_meta_main_screen.png"));

	StartLevelFromMain();
	EXPECT_FALSE(Shown("MainScreen"));
	EXPECT_TRUE(Shown("WordFall"));
	EXPECT_EQ(mService->GetGameState(), String("playing"));

	AppTestDriver::Wait(0.5f);
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "54_meta_game_screen.png"));

	// экран игры (кадр 868x1813) вписан в тот же кадр камеры по ширине
	RectF game = WorldRect(DynamicCast<Widget>(Find("WordFall", "Screen")));
	EXPECT_NEAR(game.Width(), kCameraSize.x, 1.0f);
	EXPECT_NEAR(game.Height(), kScreenSize.y*kGameScale, 1.0f);
	EXPECT_LE(game.Height(), kCameraSize.y);
}

TEST_F(WordFallMetaUI, WinOpensTheVictoryWindowAndPaysTheReward)
{
	StartLevelFromMain();
	mService->DebugSetTargetScore(10);
	mService->DebugCompleteTasks();
	PlantKot();
	ClickTile(1, 0);
	ClickTile(2, 0);
	ClickTile(3, 0);
	Click(AcceptPosition());

	ASSERT_TRUE(WaitFor([]() { return Shown("VictoryWindow", "home_screen"); }, 8.0f)) << "окно победы";
	EXPECT_TRUE(Shown("MainScreen")) << "под окном — главный экран";
	EXPECT_FALSE(Shown("WordFall"));
	EXPECT_EQ(Text("VictoryWindow", "home_screen/victory_popup/level_header/level_header_label"), String("LEVEL 1"));
	EXPECT_EQ(mService->GetLevelIndex(), 1) << "следующий уровень уже начат";

	int reward = o2Scripts.Eval("WordFallViews.victory._result.reward").GetValue<int>();
	EXPECT_GT(reward, 0);
	AppTestDriver::Wait(1.5f);
	EXPECT_EQ(Text("VictoryWindow", "home_screen/victory_popup/victory_frame/victory_parchment/reward_amount"),
			  String::Format("%i", reward));
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "51_meta_victory_window.png"));

	Tap("VictoryWindow", "home_screen/victory_popup/victory_frame/victory_parchment/continue_button");
	EXPECT_EQ(Coins(), 1000 + reward);
	EXPECT_TRUE(WaitFor([]() { return !Shown("VictoryWindow", "home_screen"); }, 3.0f)) << "окно закрылось";
	EXPECT_TRUE(Shown("MainScreen"));
	EXPECT_TRUE(WaitFor([&]() { return Text("MainScreen", "top_hud/coin_counter/coin_balance") == o2Scripts.Eval(
		String::Format("WordFallUi.FormatNumber(%i)", 1000 + reward)).ToString(); }, 3.0f)) << "монеты на главном экране";
	EXPECT_EQ(Text("MainScreen", "top_hud/stars_counter/stars_value"),
			  o2Scripts.Eval("'' + WordFallGame.service.GetStars()").ToString());
}

TEST_F(WordFallMetaUI, DoubleRewardPaysTwice)
{
	StartLevelFromMain();
	mService->DebugSetTargetScore(10);
	mService->DebugCompleteTasks();
	PlantKot();
	ClickTile(1, 0);
	ClickTile(2, 0);
	ClickTile(3, 0);
	Click(AcceptPosition());
	ASSERT_TRUE(WaitFor([]() { return Shown("VictoryWindow", "home_screen"); }, 8.0f));
	int reward = o2Scripts.Eval("WordFallViews.victory._result.reward").GetValue<int>();
	EXPECT_EQ(Text("VictoryWindow", "home_screen/victory_popup/victory_frame/victory_parchment/double_reward_button/double_reward_label"),
			  String::Format("%i\nCOINS", reward*2));

	AppTestDriver::Wait(1.0f);
	Tap("VictoryWindow", "home_screen/victory_popup/victory_frame/victory_parchment/double_reward_button");
	EXPECT_EQ(Coins(), 1000 + reward*2);
	Tap("VictoryWindow", "home_screen/victory_popup/close_button");
	EXPECT_EQ(Coins(), 1000 + reward*2) << "награда забирается один раз";
}

TEST_F(WordFallMetaUI, OutOfMovesOffersMovesForCoinsOrAnAd)
{
	StartLevelFromMain();
	mService->DebugLoseLevel();
	ASSERT_TRUE(WaitFor([]() { return Shown("ContinueWindow", "continue_dialog"); }, 4.0f)) << "окно продолжения";
	EXPECT_TRUE(Shown("WordFall")) << "поверх поля";
	EXPECT_EQ(Text("ContinueWindow", "continue_dialog/dialog_frame/message_parchment/moves_ribbon/moves_amount"), String("+5"));
	EXPECT_EQ(Text("ContinueWindow", "continue_dialog/dialog_frame/action_row/buy_moves_button/buy_moves_price"), String("900"));
	AppTestDriver::Wait(0.8f);
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "52_meta_continue_window.png"));

	// за монеты
	Tap("ContinueWindow", "continue_dialog/dialog_frame/action_row/buy_moves_button");
	EXPECT_EQ(Coins(), 100);
	EXPECT_EQ(mService->GetMovesLeft(), 5);
	EXPECT_EQ(mService->GetGameState(), String("playing"));
	EXPECT_TRUE(WaitFor([]() { return !Shown("ContinueWindow", "continue_dialog"); }, 2.0f));

	// монет не хватает — кнопка открывает банк поверх окна; ролик продолжает
	mService->DebugLoseLevel();
	ASSERT_TRUE(WaitFor([]() { return Shown("ContinueWindow", "continue_dialog"); }, 4.0f));
	AppTestDriver::Wait(0.6f);
	Tap("ContinueWindow", "continue_dialog/dialog_frame/action_row/buy_moves_button");
	EXPECT_EQ(Coins(), 100);
	EXPECT_EQ(mService->GetGameState(), String("lost"));
	ASSERT_TRUE(WaitWindow("ShopWindow")) << "банк поверх окна продолжения";
	Tap("ShopWindow", "dialog/close_button");
	EXPECT_TRUE(WaitClosed("ShopWindow"));
	Tap("ContinueWindow", "continue_dialog/dialog_frame/action_row/watch_ad_button");
	EXPECT_EQ(mService->GetMovesLeft(), 5);
	EXPECT_EQ(mService->GetGameState(), String("playing"));
	EXPECT_TRUE(WaitFor([]() { return !Shown("ContinueWindow", "continue_dialog"); }, 2.0f));

	// отказ: жизнь сгорает, главный экран
	mService->DebugLoseLevel();
	ASSERT_TRUE(WaitFor([]() { return Shown("ContinueWindow", "continue_dialog"); }, 4.0f));
	AppTestDriver::Wait(0.6f);
	Tap("ContinueWindow", "continue_dialog/close_button");
	EXPECT_EQ(Lives(), 4);
	EXPECT_TRUE(WaitFor([]() { return Shown("MainScreen"); }, 2.0f));
	EXPECT_FALSE(Shown("WordFall"));
	EXPECT_EQ(mService->GetGameState(), String("playing"));
	EXPECT_TRUE(WaitFor([]() { return Text("MainScreen", "top_hud/lives_counter/lives_value") == String("4"); }, 2.0f));
}

// На телефоне выше iPhone 16 (20:9) камера показывает больше по высоте: фон под панелями доходит до краёв, раскладка в
// кадре та же
TEST_F(WordFallMetaUI, MainScreenFitsATallPhone)
{
	o2Application.SetWindowSize(Vec2I(540, 1200));
	AppTestDriver::PumpFrames(3);

	Vec2F visible = Camera::FittedSize(kCameraSize).GetSize2D();
	EXPECT_GT(visible.y, kCameraSize.y);
	RectF root = WorldRect(DynamicCast<Widget>(Find("MainScreen")));
	EXPECT_NEAR(root.Height(), kCameraSize.y, 1.0f) << "кадр не зависит от окна";
	RectF backdrop = WorldRect(DynamicCast<Widget>(Find("MainScreen", "backdrop")));
	EXPECT_GE(backdrop.top, visible.y/2);
	EXPECT_LE(backdrop.bottom, -visible.y/2);
	EXPECT_LE(backdrop.left, -visible.x/2);
	EXPECT_GE(backdrop.right, visible.x/2);
	RectF hud = WorldRect(DynamicCast<Widget>(Find("MainScreen", "top_hud")));
	RectF nav = WorldRect(DynamicCast<Widget>(Find("MainScreen", "bottom_navigation")));
	EXPECT_NEAR(root.top - hud.top, 35.0f, 1.0f) << "панель — у верха кадра";
	EXPECT_LE(nav.bottom, root.bottom) << "навигация — у низа кадра";
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "53_meta_main_screen_phone.png"));
}

// Окна меты из спрайтов кита (Tools/WordFall/build_meta_windows.py): старт уровня с бонусами, покупка бонуса и бустера,
// банк, жизни, выход из уровня, настройки. Клики настоящие, снимки — в Work/ScreenShots/55..61
TEST_F(WordFallMetaUI, LevelStartShowsTheGoalsAndStartsWithTheChosenBonuses)
{
	Tap("MainScreen", "play_button");
	ASSERT_TRUE(WaitWindow("LevelStartWindow"));
	EXPECT_TRUE(Shown("MainScreen")) << "окно — поверх главного экрана";
	EXPECT_EQ(Text("LevelStartWindow", "dialog/header/title"), String("LEVEL 1"));
	EXPECT_EQ(Text("LevelStartWindow", "dialog/bonuses/bomb/badge/count"), String("1"));
	EXPECT_TRUE(Shown("LevelStartWindow", "dialog/parchment/goals/goal0"));
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "55_meta_level_start.png"));

	Tap("LevelStartWindow", "dialog/bonuses/bomb");
	Tap("LevelStartWindow", "dialog/bonuses/rocket");
	EXPECT_TRUE(Shown("LevelStartWindow", "dialog/bonuses/bomb/check"));
	EXPECT_TRUE(Shown("LevelStartWindow", "dialog/bonuses/rocket/check"));
	Tap("LevelStartWindow", "dialog/bonuses/rocket");
	EXPECT_FALSE(Shown("LevelStartWindow", "dialog/bonuses/rocket/check")) << "второй клик снимает выбор";
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "55b_meta_level_start_bonus.png"));

	Tap("LevelStartWindow", "dialog/play_button");
	ASSERT_TRUE(WaitFor([]() { return Shown("WordFall"); }, 2.0f));
	EXPECT_TRUE(WaitClosed("LevelStartWindow"));
	EXPECT_EQ(CountPowerups(), 1) << "бомба на поле";
	EXPECT_EQ(Js("WordFallGame.service.GetBonusCount(0)").GetValue<int>(), 0);
	EXPECT_EQ(Js("WordFallGame.service.GetBonusCount(1)").GetValue<int>(), 1);
}

TEST_F(WordFallMetaUI, AnEmptyBonusOpensItsPurchase)
{
	Js("WordFallGame.service.GetProgress().bonuses = [1, 1, 0]");
	Tap("MainScreen", "play_button");
	ASSERT_TRUE(WaitWindow("LevelStartWindow"));
	EXPECT_TRUE(Shown("LevelStartWindow", "dialog/bonuses/fireworks/badge/plus")) << "пустой бонус — с плюсом";

	Tap("LevelStartWindow", "dialog/bonuses/fireworks");
	ASSERT_TRUE(WaitWindow("BoosterShopWindow"));
	EXPECT_EQ(Text("BoosterShopWindow", "dialog/header/title"), String("FIREWORKS"));
	EXPECT_TRUE(Shown("BoosterShopWindow", "dialog/parchment/icon_fireworks"));
	EXPECT_FALSE(Shown("BoosterShopWindow", "dialog/parchment/icon_hammer"));
	EXPECT_EQ(Text("BoosterShopWindow", "dialog/buy_button/label"), String("900"));
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "56_meta_bonus_shop.png"));

	Tap("BoosterShopWindow", "dialog/buy_button");
	EXPECT_EQ(Coins(), 100);
	EXPECT_TRUE(WaitClosed("BoosterShopWindow"));
	EXPECT_EQ(Text("LevelStartWindow", "dialog/bonuses/fireworks/badge/count"), String("3"));
	EXPECT_TRUE(Shown("LevelStartWindow", "dialog/bonuses/fireworks/check")) << "купленный бонус сразу выбран";

	// второй раз монет не хватает: поверх открывается банк
	Js("WordFallGame.service.GetProgress().bonuses[2] = 0; WordFallViews.levelStart.OnOpen()");
	Tap("LevelStartWindow", "dialog/bonuses/fireworks");
	ASSERT_TRUE(WaitWindow("BoosterShopWindow"));
	Tap("BoosterShopWindow", "dialog/buy_button");
	ASSERT_TRUE(WaitWindow("ShopWindow")) << "банк";
	EXPECT_TRUE(Shown("BoosterShopWindow")) << "под банком — покупка бонуса";
}

TEST_F(WordFallMetaUI, TheBankSellsCoins)
{
	Tap("MainScreen", "top_hud/coin_counter/add_currency_button");
	ASSERT_TRUE(WaitWindow("ShopWindow"));
	EXPECT_EQ(Text("ShopWindow", "dialog/balance/value"), String("1,000"));
	EXPECT_EQ(Text("ShopWindow", "dialog/packs/pack0/amount"), String("1,000"));
	EXPECT_EQ(Text("ShopWindow", "dialog/packs/pack5/buy/label"), String("$49.99"));
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "57_meta_shop.png"));

	Tap("ShopWindow", "dialog/balance");
	AppTestDriver::Wait(0.4f);
	EXPECT_TRUE(Js("WordFallViews.shop.IsOpen()").ToBool()) << "клик по диалогу мимо кнопок окно не закрывает";
	EXPECT_TRUE(WindowOpen("ShopWindow")) << "диалог в полный размер";

	Tap("ShopWindow", "dialog/packs/pack1/buy");
	EXPECT_EQ(Coins(), 4000);
	EXPECT_TRUE(WaitFor([]() { return Text("ShopWindow", "dialog/balance/value") == String("4,000"); }, 2.0f));
	TapOutside("ShopWindow");
	EXPECT_TRUE(WaitClosed("ShopWindow")) << "клик мимо окна закрывает его";
	EXPECT_TRUE(WaitFor([]() { return Text("MainScreen", "top_hud/coin_counter/coin_balance") == String("4,000"); }, 3.0f));
}

TEST_F(WordFallMetaUI, WithoutLivesPlayOpensTheLivesWindow)
{
	Js("var p = WordFallGame.service.GetProgress(); p.lives = 0; p.livesAt = Date.now() - 60000");
	Tap("MainScreen", "play_button");
	ASSERT_TRUE(WaitWindow("LivesWindow")) << "жизней нет — их окно, а не уровень";
	EXPECT_FALSE(Shown("LevelStartWindow"));
	EXPECT_EQ(Text("LivesWindow", "dialog/parchment/heart/count"), String("0"));
	EXPECT_EQ(Text("LivesWindow", "dialog/parchment/status"), String("Next life in 29:00"));
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "58_meta_lives.png"));

	Tap("LivesWindow", "dialog/refill_button");
	EXPECT_EQ(Lives(), 5);
	EXPECT_EQ(Coins(), 100);
	EXPECT_TRUE(WaitFor([]() { return Text("LivesWindow", "dialog/parchment/status") == String("Your lives are full!"); }, 2.0f));
	Tap("LivesWindow", "dialog/close_button");
	EXPECT_TRUE(WaitClosed("LivesWindow"));

	// счётчик жизней главного экрана открывает то же окно
	Tap("MainScreen", "top_hud/lives_counter/lives_button");
	EXPECT_TRUE(WaitWindow("LivesWindow"));
}

TEST_F(WordFallMetaUI, QuittingALevelAsksAndCostsALife)
{
	StartLevelFromMain();
	EXPECT_TRUE(Shown("WordFall", "Screen/Hud/QuitButton"));
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "59a_meta_game_quit_button.png"));
	Tap("WordFall", "Screen/Hud/QuitButton");
	ASSERT_TRUE(WaitWindow("QuitLevelWindow"));
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "59_meta_quit_level.png"));

	Tap("QuitLevelWindow", "dialog/play_on_button");
	EXPECT_TRUE(WaitClosed("QuitLevelWindow"));
	EXPECT_TRUE(Shown("WordFall"));
	EXPECT_EQ(Lives(), 5);

	Tap("WordFall", "Screen/Hud/QuitButton");
	ASSERT_TRUE(WaitWindow("QuitLevelWindow"));
	Tap("QuitLevelWindow", "dialog/quit_button");
	EXPECT_EQ(Lives(), 4);
	EXPECT_TRUE(WaitFor([]() { return Shown("MainScreen"); }, 2.0f));
	EXPECT_FALSE(Shown("WordFall"));
}

TEST_F(WordFallMetaUI, AnEmptyBoosterOpensItsPurchase)
{
	StartLevelFromMain();
	Js("WordFallGame.service.GetProgress().boosters[0] = 0");
	EXPECT_EQ(mService->GetBoosterCharges(0), 0) << "заряды уровня — запас игрока";
	Tap("WordFall", "Screen/Boosters/Booster0/Btn");
	ASSERT_TRUE(WaitWindow("BoosterShopWindow"));
	EXPECT_EQ(Text("BoosterShopWindow", "dialog/header/title"), String("HAMMER"));
	EXPECT_EQ(Text("BoosterShopWindow", "dialog/owned"), String("You have 0"));
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "60_meta_booster_shop.png"));

	Tap("BoosterShopWindow", "dialog/buy_button");
	EXPECT_TRUE(WaitClosed("BoosterShopWindow"));
	EXPECT_EQ(mService->GetBoosterCharges(0), 3);
	EXPECT_EQ(Coins(), 400);
}

TEST_F(WordFallMetaUI, SettingsKeepSoundMusicAndLanguage)
{
	Tap("MainScreen", "top_hud/settings_button");
	ASSERT_TRUE(WaitWindow("SettingsWindow"));
	EXPECT_EQ(Text("SettingsWindow", "dialog/parchment/language/switch/value"), String("RUSSIAN"));
	EXPECT_TRUE(Shown("SettingsWindow", "dialog/parchment/sound/toggle/on"));
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "61_meta_settings.png"));

	Tap("SettingsWindow", "dialog/parchment/sound/toggle");
	EXPECT_FALSE(Js("WordFallGame.service.GetSetting('sound')").ToBool());
	EXPECT_TRUE(Shown("SettingsWindow", "dialog/parchment/sound/toggle/off"));
	EXPECT_FALSE(Shown("SettingsWindow", "dialog/parchment/sound/toggle/on"));
	EXPECT_TRUE(Js("WordFallGame.service.GetSetting('music')").ToBool());

	Tap("SettingsWindow", "dialog/parchment/language/switch");
	EXPECT_EQ(Js("WordFallGame.service.GetLanguage()").ToString(), String("en"));
	EXPECT_EQ(Text("SettingsWindow", "dialog/parchment/language/switch/value"), String("ENGLISH"));
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "61b_meta_settings_changed.png"));
	Tap("SettingsWindow", "dialog/parchment/language/switch");
	EXPECT_EQ(Js("WordFallGame.service.GetLanguage()").ToString(), String("ru"));
}
