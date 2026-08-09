#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "WordFall/WordFallBootstrap.h"
#include "o2/Application/Application.h"
#include "o2/Scene/Actor.h"
#include "o2/Scene/Scene.h"
#include "o2/Scene/UI/Widgets/Button.h"
#include "o2/Scripts/ScriptEngine.h"
#include "o2/Scripts/ScriptValue.h"
#include "o2/Utils/Test/AppTestDriver.h"

using namespace o2;

#if IS_SCRIPTING_SUPPORTED

namespace
{
	const String kScreenshotsDir = "../../Work/ScreenShots/";

	ScriptValue EvalChecked(const char* code)
	{
		ScriptValue res = o2Scripts.Eval(code);
		EXPECT_NE(res.GetValueType(), ScriptValue::ValueType::Error) << res.GetError().Data();
		return res;
	}

	void ClickTile(int column, int row)
	{
		AppTestDriver::Click(WordFallBootstrap::TilePosition(column, row));
		AppTestDriver::PumpFrames(2);
	}
}

// Drives the real Word Fall screen: the bootstrap builds the scene, the JS controller
// wires the widgets, and the test clicks through the actual buttons
class WordFallUI: public ::testing::Test
{
protected:
	void SetUp() override
	{
		o2Application.SetWindowSize(Vec2I(1280, 800));

		// fixed seed must be in place before the game script instance starts
		EvalChecked("WORDFALL_SEED = 42;");

		WordFallBootstrap::CreateBootstrapActor();
		AppTestDriver::PumpFrames(10); // bootstrap OnStart + script OnStart + layouts

		ASSERT_TRUE(EvalChecked("typeof WordFall_instance !== 'undefined'").GetValue<bool>());
	}

	void TearDown() override
	{
		EvalChecked("WordFall_instance = undefined;");
		o2Scene.Clear(true);
		o2Scene.UpdateDestroyingEntities();
		AppTestDriver::PumpFrames(2);
	}

	// Plants КОТ in the bottom row at columns 1..3
	void PlantKot()
	{
		EvalChecked(
			"WordFall_instance.DebugSetTile(1, 0, 'К');"
			"WordFall_instance.DebugSetTile(2, 0, 'О');"
			"WordFall_instance.DebugSetTile(3, 0, 'Т');");
		AppTestDriver::PumpFrames(1);
	}
};

TEST_F(WordFallUI, SceneBuildsBoardHudAndHiddenPopup)
{
	auto root = o2Scene.FindActor("WordFall");
	ASSERT_TRUE(root);

	for (int c = 0; c < WordFallBootstrap::kColumns; c++)
	{
		for (int r = 0; r < WordFallBootstrap::kRows; r++)
		{
			auto tile = root->GetChild(String::Format("Board/Tile_%i_%i", c, r));
			ASSERT_TRUE(tile) << "tile " << c << " " << r;
			EXPECT_TRUE(DynamicCast<Button>(tile));
		}
	}

	EXPECT_TRUE(root->GetChild("Hud/ScoreLabel"));
	EXPECT_TRUE(root->GetChild("WordPanel/AcceptBtn"));
	EXPECT_TRUE(root->GetChild("Boosters/Booster4"));
	EXPECT_FALSE(root->GetChild("Popup")->IsEnabled());

	// the model filled every tile with a letter
	EXPECT_TRUE(EvalChecked(
		"var m = WordFall_instance.DebugGetModel();"
		"var ok = true;"
		"for (var c = 0; c < 7; c++)"
		"    for (var r = 0; r < 8; r++)"
		"        if (m.GetTile(c, r).letter.length != 1) ok = false;"
		"ok").GetValue<bool>());

	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "01_board.png"));
}

TEST_F(WordFallUI, ClickingTilesSelectsWord)
{
	PlantKot();

	ClickTile(1, 0);
	ClickTile(2, 0);
	ClickTile(3, 0);

	EXPECT_EQ(EvalChecked("WordFall_instance.DebugGetModel().CurrentWord()").GetValue<String>(), String("КОТ"));
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "02_selection.png"));

	// re-clicking the first letter drops the whole selection tail
	ClickTile(1, 0);
	EXPECT_EQ(EvalChecked("WordFall_instance.DebugGetModel().GetSelected().length").GetValue<int>(), 0);
}

TEST_F(WordFallUI, AcceptButtonBurnsWordAndScores)
{
	PlantKot();
	ClickTile(1, 0);
	ClickTile(2, 0);
	ClickTile(3, 0);

	AppTestDriver::Click(Vec2F(285, 295)); // ПРИНЯТЬ
	AppTestDriver::PumpFrames(3);

	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "03_falling.png"));

	// КОТ in a row: base 4 × cluster 3 = 12
	EXPECT_EQ(EvalChecked("WordFall_instance.DebugGetModel().GetScore()").GetValue<int>(), 12);
	EXPECT_EQ(EvalChecked("WordFall_instance.DebugGetModel().GetMovesLeft()").GetValue<int>(), 11);

	AppTestDriver::Wait(1.6f); // fall animation settles
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "04_after_word.png"));
}

TEST_F(WordFallUI, ClearButtonDropsSelection)
{
	PlantKot();
	ClickTile(1, 0);
	ClickTile(2, 0);

	AppTestDriver::Click(Vec2F(435, 295)); // СБРОС
	AppTestDriver::PumpFrames(2);

	EXPECT_EQ(EvalChecked("WordFall_instance.DebugGetModel().GetSelected().length").GetValue<int>(), 0);
}

TEST_F(WordFallUI, HammerBoosterRemovesTileWithoutMove)
{
	AppTestDriver::Click(Vec2F(-160, -350)); // молоток — режим прицела
	AppTestDriver::PumpFrames(2);
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "05_hammer_aim.png"));

	ClickTile(0, 0);
	AppTestDriver::PumpFrames(2);

	EXPECT_EQ(EvalChecked("WordFall_instance.DebugGetModel().GetCharges(0)").GetValue<int>(), 2);
	EXPECT_EQ(EvalChecked("WordFall_instance.DebugGetModel().GetMovesLeft()").GetValue<int>(), 12);
}

TEST_F(WordFallUI, WinShowsPopupAndRestartStartsOver)
{
	EvalChecked("WordFall_instance.DebugGetModel()._target = 10;");
	PlantKot();
	ClickTile(1, 0);
	ClickTile(2, 0);
	ClickTile(3, 0);

	AppTestDriver::Click(Vec2F(285, 295)); // ПРИНЯТЬ
	AppTestDriver::PumpFrames(3);

	auto root = o2Scene.FindActor("WordFall");
	ASSERT_TRUE(root);
	EXPECT_TRUE(root->GetChild("Popup")->IsEnabled());
	EXPECT_EQ(EvalChecked("WordFall_instance.DebugGetModel().GetState()").GetValue<String>(), String("win"));

	AppTestDriver::Wait(1.2f);
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "06_win_popup.png"));

	AppTestDriver::Click(Vec2F(0, -80)); // ЕЩЁ РАЗ
	AppTestDriver::PumpFrames(3);

	EXPECT_FALSE(root->GetChild("Popup")->IsEnabled());
	EXPECT_EQ(EvalChecked("WordFall_instance.DebugGetModel().GetScore()").GetValue<int>(), 0);
	EXPECT_EQ(EvalChecked("WordFall_instance.DebugGetModel().GetMovesLeft()").GetValue<int>(), 12);
}

#endif // IS_SCRIPTING_SUPPORTED
