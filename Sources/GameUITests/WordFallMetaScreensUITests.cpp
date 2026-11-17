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

	Tap("MainScreen", "play_button");
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
	Tap("MainScreen", "play_button");
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
	Tap("MainScreen", "play_button");
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
	Tap("MainScreen", "play_button");
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

	// монет не хватает — кнопка не продаёт, ролик продолжает
	mService->DebugLoseLevel();
	ASSERT_TRUE(WaitFor([]() { return Shown("ContinueWindow", "continue_dialog"); }, 4.0f));
	AppTestDriver::Wait(0.6f);
	Tap("ContinueWindow", "continue_dialog/dialog_frame/action_row/buy_moves_button");
	EXPECT_EQ(Coins(), 100);
	EXPECT_EQ(mService->GetGameState(), String("lost"));
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
