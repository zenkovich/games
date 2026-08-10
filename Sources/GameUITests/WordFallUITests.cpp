#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "WordFall/WordFallBootstrap.h"
#include "o2/Application/Application.h"
#include "o2/Assets/Assets.h"
#include "o2/Assets/Types/SceneAsset.h"
#include "o2/Scene/Actor.h"
#include "o2/Scene/Scene.h"
#include "o2/Scene/UI/Widgets/Button.h"
#include "o2/Scene/UI/Widgets/Label.h"
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
	EXPECT_TRUE(root->GetChild("Hud/LevelLabel"));
	EXPECT_TRUE(root->GetChild("Tasks/Task0"));
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

	AppTestDriver::Wait(0.5f); // буквы долетают до панели слова
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "02_selection.png"));

	// все три слота панели слова показаны
	auto root = o2Scene.FindActor("WordFall");
	ASSERT_TRUE(root);
	EXPECT_TRUE(root->GetChild("WordPanel/Slot0")->IsEnabled());
	EXPECT_TRUE(root->GetChild("WordPanel/Slot2")->IsEnabled());
	EXPECT_FALSE(root->GetChild("WordPanel/Slot3")->IsEnabled());

	// re-clicking the first letter drops the whole selection tail
	ClickTile(1, 0);
	EXPECT_EQ(EvalChecked("WordFall_instance.DebugGetModel().GetSelected().length").GetValue<int>(), 0);
}

// Путь реального приложения: сцена загружается из WordFall.scn, как в
// GameApplication::OnStarted, а не через CreateBootstrapActor
TEST_F(WordFallUI, SceneLoadedFromAssetRespondsToClicks)
{
	EvalChecked("WordFall_instance = undefined;");
	o2Scene.Clear(true);
	o2Scene.UpdateDestroyingEntities();
	AppTestDriver::PumpFrames(2);

	auto sceneAsset = o2Assets.GetAssetRefByType<SceneAsset>(String("WordFall.scn"));
	ASSERT_TRUE(sceneAsset);
	sceneAsset->Load();
	AppTestDriver::PumpFrames(10);

	ASSERT_TRUE(EvalChecked("typeof WordFall_instance !== 'undefined'").GetValue<bool>());

	PlantKot();
	ClickTile(1, 0);
	ClickTile(2, 0);

	EXPECT_EQ(EvalChecked("WordFall_instance.DebugGetModel().GetSelected().length").GetValue<int>(), 2);
}

TEST_F(WordFallUI, BombActivationPlaysEffects)
{
	// бомба на средней букве слова: при принятии играют вспышка и летящие цифры
	PlantKot();
	EvalChecked(
		"WordFall_instance.DebugGetModel()._grid[2][0].powerup = 'bomb';"
		"WordFall_instance.SyncBoard();");
	AppTestDriver::PumpFrames(1);

	ClickTile(1, 0);
	ClickTile(2, 0);
	ClickTile(3, 0);
	AppTestDriver::Click(Vec2F(135, 295)); // ПРИНЯТЬ

	AppTestDriver::Wait(0.55f); // середина: взрыв отыграл, цифры со свечением в полёте
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "10_bomb_fx.png"));

	AppTestDriver::Wait(3.0f); // вся последовательность начисления завершается
	EXPECT_GE(EvalChecked("WordFall_instance.DebugGetModel().GetScore()").GetValue<int>(), 15); // 12 за КОТ + минимум 3 за взорванные буквы
	EXPECT_TRUE(EvalChecked("WordFall_instance._fxAnims.length == 0").GetValue<bool>());
}

TEST_F(WordFallUI, PressedButtonShowsPressIn)
{
	// зажатая кнопка ПРИНЯТЬ — снимок вдавленного состояния
	AppTestDriver::MoveCursor(Vec2F(135, 295));
	AppTestDriver::PumpFrames(2);
	AppTestDriver::PressCursor(Vec2F(135, 295));
	AppTestDriver::PumpFrames(4);
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "09_pressed.png"));
	AppTestDriver::ReleaseCursor();
	AppTestDriver::PumpFrames(2);

	// пустое слово не принимается — состояние игры не изменилось
	EXPECT_EQ(EvalChecked("WordFall_instance.DebugGetModel().GetMovesLeft()").GetValue<int>(), 12);
}

TEST_F(WordFallUI, AcceptButtonBurnsWordAndScores)
{
	PlantKot();
	ClickTile(1, 0);
	ClickTile(2, 0);
	ClickTile(3, 0);

	AppTestDriver::Click(Vec2F(135, 295)); // ПРИНЯТЬ
	AppTestDriver::PumpFrames(3);

	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "03_falling.png"));

	// КОТ подряд: base 4 × кластер 3 = 12
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

	AppTestDriver::Click(Vec2F(225, 295)); // СБРОС
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

TEST_F(WordFallUI, WinShowsPopupAndNextLevelStarts)
{
	// очки — обязательное условие; задачи уровня закрываем читом, оставляя только цель
	EvalChecked(
		"WordFall_instance.DebugGetModel()._target = 10;"
		"WordFall_instance.DebugGetModel().DebugCompleteTasks();");
	PlantKot();
	ClickTile(1, 0);
	ClickTile(2, 0);
	ClickTile(3, 0);

	AppTestDriver::Click(Vec2F(135, 295)); // ПРИНЯТЬ
	AppTestDriver::PumpFrames(3);

	auto root = o2Scene.FindActor("WordFall");
	ASSERT_TRUE(root);

	// победа зафиксирована сразу, но попап ждёт окончания анимации начисления очков
	EXPECT_EQ(EvalChecked("WordFall_instance.DebugGetModel().GetState()").GetValue<String>(), String("win"));
	EXPECT_FALSE(root->GetChild("Popup")->IsEnabled());

	AppTestDriver::Wait(2.8f); // цифры → счётчик → пауза → бар → попап
	EXPECT_TRUE(root->GetChild("Popup")->IsEnabled());
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "06_win_popup.png"));

	AppTestDriver::Click(Vec2F(0, -80)); // ДАЛЬШЕ
	AppTestDriver::PumpFrames(3);

	// после победы стартует следующий уровень кампании
	EXPECT_FALSE(root->GetChild("Popup")->IsEnabled());
	EXPECT_EQ(EvalChecked("WordFall_instance._levelIndex").GetValue<int>(), 1);
	EXPECT_EQ(EvalChecked("WordFall_instance.DebugGetModel().GetScore()").GetValue<int>(), 0);
	EXPECT_EQ(EvalChecked("WordFall_instance.DebugGetModel().GetState()").GetValue<String>(), String("playing"));
}

TEST_F(WordFallUI, TasksPanelShowsLevelTasks)
{
	auto root = o2Scene.FindActor("WordFall");
	ASSERT_TRUE(root);

	// уровень 1 содержит 3 задачи — первые три строки заполнены, остальные пустые
	auto task0 = DynamicCast<Label>(root->GetChild("Tasks/Task0"));
	auto task2 = DynamicCast<Label>(root->GetChild("Tasks/Task2"));
	auto task3 = DynamicCast<Label>(root->GetChild("Tasks/Task3"));
	ASSERT_TRUE(task0 && task2 && task3);
	EXPECT_FALSE(task0->GetText().IsEmpty());
	EXPECT_FALSE(task2->GetText().IsEmpty());
	EXPECT_TRUE(task3->GetText().IsEmpty());

	auto levelLabel = DynamicCast<Label>(root->GetChild("Hud/LevelLabel"));
	ASSERT_TRUE(levelLabel);
	EXPECT_EQ(levelLabel->GetText(), WString("Уровень 1"));

	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "07_tasks_panel.png"));
}

TEST_F(WordFallUI, FiveLetterWordSpawnsBombPowerup)
{
	EvalChecked(
		"WordFall_instance.DebugSetTile(1, 0, 'Ч');"
		"WordFall_instance.DebugSetTile(2, 0, 'А');"
		"WordFall_instance.DebugSetTile(3, 0, 'Ш');"
		"WordFall_instance.DebugSetTile(4, 0, 'К');"
		"WordFall_instance.DebugSetTile(5, 0, 'А');");
	AppTestDriver::PumpFrames(1);

	for (int i = 1; i <= 5; i++)
		ClickTile(i, 0);

	AppTestDriver::Click(Vec2F(135, 295)); // ПРИНЯТЬ
	AppTestDriver::PumpFrames(3);

	// модель начислила бомбу сразу, вью — после отложенного исчезновения букв
	EXPECT_EQ(EvalChecked("WordFall_instance.DebugGetModel().GetTile(5, 0).powerup").GetValue<String>(),
			  String("bomb"));
	AppTestDriver::Wait(1.1f);

	auto root = o2Scene.FindActor("WordFall");
	ASSERT_TRUE(root);
	auto tile = DynamicCast<Button>(root->GetChild("Board/Tile_5_0"));
	ASSERT_TRUE(tile);
	EXPECT_TRUE(tile->GetLayer("bomb")->IsEnabled());
	EXPECT_FALSE(tile->GetLayer("rocket")->IsEnabled());

	AppTestDriver::Wait(1.2f);
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "08_bomb_powerup.png"));
}

#endif // IS_SCRIPTING_SUPPORTED
