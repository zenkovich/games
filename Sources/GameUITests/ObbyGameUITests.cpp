#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "ObbyGameComponent.h"
#include "ObbySceneFactory.h"
#include "ObbyWorld.h"
#include "o2/Application/Application.h"
#include "o2/Application/Input.h"
#include "o2/Application/VKCodes.h"
#include "o2/Render/Render.h"
#include "o2/Scene/Actor.h"
#include "o2/Scene/Scene.h"
#include "o2/Utils/FileSystem/FileSystem.h"
#include "o2/Utils/Test/AppTestDriver.h"

using namespace o2;
using namespace obby;

namespace
{
	const String kScreenshotsDir = "../../Work/ScreenShots/";

	Vec2F WorldToScreen(const ObbyGameComponent& game, const Vec2F& world)
	{
		Vec2F probe = game.ScreenToWorld(Vec2F(100.0f, 100.0f));
		float scale = probe.x != 0.0f ? 100.0f/probe.x : 1.0f;
		return world*scale;
	}

	void Shot(const String& name)
	{
		o2FileSystem.FolderCreate(kScreenshotsDir, true);
		EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + name));
	}
}

class ObbyGameUI: public ::testing::Test
{
protected:
	Ref<ObbyGameComponent> game;

	void SetUp() override
	{
		o2Application.SetWindowSize(Vec2I(1280, 900));
		auto actor = BuildBootstrapScene();
		game = actor->GetComponent<ObbyGameComponent>();
		if (game)
			game->savePath = "potato_obby_test_save.json";
		o2FileSystem.FileDelete("potato_obby_test_save.json");
		AppTestDriver::PumpFrames(5);
	}

	void TearDown() override
	{
		for (int key : { VK_LEFT, VK_RIGHT, VK_SPACE })
			o2Input.OnKeyReleased(key);

		game = nullptr;
		o2Scene.Clear(true);
		o2Scene.UpdateDestroyingEntities();
		AppTestDriver::PumpFrames(2);
		o2FileSystem.FileDelete("potato_obby_test_save.json");
	}

	// Frames in the test driver take almost no game time, so everything that moves waits for it
	void HoldKey(int key, float seconds)
	{
		o2Input.OnKeyPressed(key);
		AppTestDriver::Wait(seconds);
		o2Input.OnKeyReleased(key);
		AppTestDriver::PumpFrames(1);
	}
};

TEST_F(ObbyGameUI, SceneStartsInMenuWithAllLevelsLoaded)
{
	ASSERT_TRUE(game);
	EXPECT_TRUE(game->IsViewBuilt());
	EXPECT_EQ(game->GetScreen(), ObbyGameComponent::Screen::Menu);
	EXPECT_EQ(game->GetLevels().levels.Count(), 30);
	EXPECT_EQ(game->GetUnlockedLevels(), 1);
	EXPECT_EQ(o2Scene.GetCameras().Count(), 1);
	Shot("00_menu.png");
}

TEST_F(ObbyGameUI, PlayButtonStartsFirstLevel)
{
	ASSERT_TRUE(game);
	AppTestDriver::Click(WorldToScreen(*game, game->GetPlayButtonBox().Center()));
	AppTestDriver::PumpFrames(3);
	EXPECT_EQ(game->GetScreen(), ObbyGameComponent::Screen::Playing);
	EXPECT_EQ(game->GetLevelIndex(), 0);
	EXPECT_TRUE(game->GetPlayerActor()->IsEnabled());
	Shot("01_level1_start.png");
}

TEST_F(ObbyGameUI, LockedLevelButtonIsIgnored)
{
	ASSERT_TRUE(game);
	AppTestDriver::Click(WorldToScreen(*game, game->GetLevelButtonBox(5).Center()));
	AppTestDriver::PumpFrames(3);
	EXPECT_EQ(game->GetScreen(), ObbyGameComponent::Screen::Menu);
}

TEST_F(ObbyGameUI, KeyboardMovesAndJumps)
{
	ASSERT_TRUE(game);
	game->StartLevel(0);
	AppTestDriver::Wait(0.5f);
	float x0 = game->GetWorld().GetPlayerPos().x;
	float y0 = game->GetWorld().GetPlayerPos().y;

	HoldKey(VK_RIGHT, 0.3f);
	EXPECT_GT(game->GetWorld().GetPlayerPos().x, x0 + 40.0f);

	o2Input.OnKeyPressed(VK_SPACE);
	AppTestDriver::Wait(0.2f);
	EXPECT_GT(game->GetWorld().GetPlayerPos().y, y0 + 20.0f);
	Shot("02_jump.png");
	o2Input.OnKeyReleased(VK_SPACE);
	AppTestDriver::Wait(1.0f);
	EXPECT_TRUE(game->GetWorld().IsOnGround());
}

TEST_F(ObbyGameUI, TouchButtonsDriveThePotato)
{
	ASSERT_TRUE(game);
	game->StartLevel(0);
	AppTestDriver::Wait(0.5f);
	float x0 = game->GetWorld().GetPlayerPos().x;

	AppTestDriver::PressCursor(WorldToScreen(*game, game->GetTouchButtonBox(1).Center()));
	AppTestDriver::Wait(0.4f);
	EXPECT_TRUE(game->GetLastInput().right);
	AppTestDriver::ReleaseCursor();
	EXPECT_GT(game->GetWorld().GetPlayerPos().x, x0 + 40.0f);
}

TEST_F(ObbyGameUI, FirstLevelIsWonAndProgressSaved)
{
	ASSERT_TRUE(game);
	game->StartLevel(0);
	AppTestDriver::PumpFrames(2);

	// The naive runner from the headless tests, fed through the external input each frame
	float jumpHold = 0.0f;
	for (int frame = 0; frame < 60*20 && game->GetScreen() == ObbyGameComponent::Screen::Playing; frame++)
	{
		if (frame == 90)
			Shot("03_level1_running.png");

		auto& world = game->GetWorld();
		Vec2F pos = world.GetPlayerPos();
		int feetRow = World::RowOf(world.GetPlayerBox().bottom - 4.0f);
		int col = World::ColOf(pos.x);
		bool gapAhead = !IsStaticSolid(world.TileAt(col + 1, feetRow).type);

		if (world.IsOnGround() && gapAhead)
			jumpHold = 0.3f;

		game->SetExternalInput(false, true, jumpHold > 0.0f);
		jumpHold -= 1.0f/60.0f;
		AppTestDriver::Wait(1.0f/60.0f);
	}
	game->SetExternalInput(false, false, false);

	EXPECT_EQ(game->GetScreen(), ObbyGameComponent::Screen::LevelWon);
	EXPECT_EQ(game->GetUnlockedLevels(), 2);
	EXPECT_TRUE(o2FileSystem.IsFileExist("potato_obby_test_save.json"));
	Shot("04_level1_won.png");

	AppTestDriver::Wait(2.0f);
	EXPECT_EQ(game->GetScreen(), ObbyGameComponent::Screen::Playing);
	EXPECT_EQ(game->GetLevelIndex(), 1);
}

TEST_F(ObbyGameUI, DeathShowsMessageAndCounts)
{
	ASSERT_TRUE(game);
	game->StartLevel(2);
	AppTestDriver::Wait(0.5f);
	HoldKey(VK_RIGHT, 1.5f);
	EXPECT_GE(game->GetWorld().GetDeaths(), 1);
	EXPECT_GE(game->GetTotalDeaths(), 1);
	Shot("05_level3_death.png");
}

TEST_F(ObbyGameUI, EscapeReturnsToMenu)
{
	ASSERT_TRUE(game);
	game->StartLevel(0);
	AppTestDriver::PumpFrames(2);
	o2Input.OnKeyPressed(VK_ESCAPE);
	AppTestDriver::PumpFrames(2);
	o2Input.OnKeyReleased(VK_ESCAPE);
	EXPECT_EQ(game->GetScreen(), ObbyGameComponent::Screen::Menu);
}

TEST_F(ObbyGameUI, LevelsRenderScreenshots)
{
	ASSERT_TRUE(game);
	struct Shot_ { int level; const char* file; };
	for (auto& s : Vector<Shot_>{ { 4, "10_level5_bounce.png" }, { 9, "11_level10_movers.png" }, { 12, "12_level13_gravity.png" },
								  { 14, "13_level15_darkness.png" }, { 22, "14_level23_trampolines.png" }, { 29, "15_level30_legend.png" } })
	{
		game->StartLevel(s.level);
		AppTestDriver::Wait(0.4f);
		EXPECT_EQ(game->GetLevelIndex(), s.level);
		Shot(s.file);
	}
}

TEST_F(ObbyGameUI, BootstrapSceneSavesAndLoadsBack)
{
	ASSERT_TRUE(game);
	String path = "potato_obby_test_scene.scn";
	EXPECT_TRUE(SaveBootstrapScene(path));

	o2Scene.Clear(true);
	o2Scene.UpdateDestroyingEntities();
	o2Scene.Load(path);
	AppTestDriver::PumpFrames(3);

	auto actor = o2Scene.FindActor("Game");
	ASSERT_TRUE(actor);
	auto loaded = actor->GetComponent<ObbyGameComponent>();
	ASSERT_TRUE(loaded);
	EXPECT_EQ(loaded->GetScreen(), ObbyGameComponent::Screen::Menu);
	EXPECT_EQ(loaded->GetLevels().levels.Count(), 30);
	o2FileSystem.FileDelete(path);
}
