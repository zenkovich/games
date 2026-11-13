#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "o2/Application/Application.h"
#include "o2/Assets/Assets.h"
#include "o2/Scene/Scene.h"
#include "o2/Utils/Bitmap/Bitmap.h"
#include "o2/Utils/FileSystem/FileSystem.h"
#include "o2/Utils/Test/AppTestDriver.h"
#include "DragonCrashers/DragonBridge.h"

using namespace o2;

// The ported scenes load the way the game starts them and render
class DragonScenes: public ::testing::Test
{
protected:
	void SetUp() override
	{
		o2Application.SetWindowSize(Vec2I(1920, 1080));
		dragon::RegisterDragonJsApi();
		AppTestDriver::PumpFrames(2);
	}

	void TearDown() override
	{
		o2Scene.Clear(true);
		o2Scene.UpdateDestroyingEntities();
		AppTestDriver::PumpFrames(2);
	}

	void Load(const String& scene)
	{
		o2Scene.Load(o2Assets.GetBuiltAssetsPath() + scene);
		AppTestDriver::PumpFrames(5);
	}

	void Shot(const String& name)
	{
		o2FileSystem.FolderCreate("TestScreenshots/DragonScenes", true);
		auto shot = AppTestDriver::TakeScreenshot();
		ASSERT_TRUE(shot);
		shot->Save("TestScreenshots/DragonScenes/" + name + ".png", Bitmap::ImageType::Png);
	}
};

TEST_F(DragonScenes, GameSceneRenders)
{
	Load("DragonCrashers/Game.scn");
	ASSERT_TRUE(o2Scene.FindActor("World/Unit_Dragon_Rustum"));
	ASSERT_TRUE(o2Scene.FindActor("World"));
	AppTestDriver::Wait(1.0f);
	Shot("game_t01.5");
}

TEST_F(DragonScenes, MainMenuSceneRenders)
{
	Load("DragonCrashers/MainMenu.scn");
	ASSERT_TRUE(o2Scene.FindActor("UI"));
	AppTestDriver::Wait(1.0f);
	Shot("menu_home");
}
