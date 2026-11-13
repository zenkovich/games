#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "o2/Application/Application.h"
#include "o2/Assets/Assets.h"
#include "o2/Assets/Types/ActorAsset.h"
#include "o2/Scene/CameraActor.h"
#include "o2/Scene/Scene.h"
#include "o2/Scene/UI/Widget.h"
#include "o2/Utils/Bitmap/Bitmap.h"
#include "o2/Utils/FileSystem/FileSystem.h"
#include "o2/Utils/Test/AppTestDriver.h"

using namespace o2;

// Main menu prototypes ported from the Unity UI Toolkit layouts: every screen instantiates and renders
class DragonMenuPrototypes: public ::testing::Test
{
protected:
	void SetUp() override
	{
		o2Application.SetWindowSize(Vec2I(1920, 1080));
		AppTestDriver::PumpFrames(2);
		auto camera = mmake<CameraActor>();
		camera->SetFittedSize(Vec2F(1920, 1080));
		camera->fillColor = Color4(30, 30, 40, 255);
	}

	void TearDown() override
	{
		o2Scene.Clear(true);
		o2Scene.UpdateDestroyingEntities();
		AppTestDriver::PumpFrames(2);
	}

	Ref<Actor> Spawn(const String& name, float depth)
	{
		AssetRef<ActorAsset> asset("DragonCrashers/UI/MainMenu/" + name + ".proto");
		if (!asset)
			return nullptr;
		auto actor = asset->Instantiate();
		if (auto widget = DynamicCast<Widget>(actor))
			widget->SetDrawingDepth(depth);
		return actor;
	}

	void Shot(const String& name)
	{
		AppTestDriver::PumpFrames(4);
		o2FileSystem.FolderCreate("TestScreenshots/DragonMenu", true);
		auto shot = AppTestDriver::TakeScreenshot();
		ASSERT_TRUE(shot);
		shot->Save("TestScreenshots/DragonMenu/" + name + ".png", Bitmap::ImageType::Png);
	}
};

TEST_F(DragonMenuPrototypes, AllScreensInstantiate)
{
	for (auto name : { "Background", "HomeScreen", "CharScreen", "InfoScreen", "MailScreen", "ShopScreen", "MenuBar",
					   "OptionsBar", "InventoryScreen", "SettingsScreen", "PopUpText" })
	{
		auto actor = Spawn(name, 1);
		ASSERT_TRUE(actor) << name;
		EXPECT_EQ(actor->GetName(), String(name));
	}
}

TEST_F(DragonMenuPrototypes, RenderScreens)
{
	struct Case { const char* name; Vector<const char*> views; };
	Vector<Case> cases = {
		{ "menu_home", { "Background", "HomeScreen" } },
		{ "menu_char_stats", { "CharScreen" } },
		{ "menu_shop", { "ShopScreen" } },
		{ "menu_mail", { "MailScreen" } },
		{ "menu_info", { "InfoScreen" } },
		{ "menu_settings", { "SettingsScreen" } },
		{ "menu_inventory", { "CharScreen", "InventoryScreen" } },
	};

	for (auto& c : cases)
	{
		float depth = 1;
		for (auto view : c.views)
			Spawn(view, depth++);
		Spawn("MenuBar", 10);
		Spawn("OptionsBar", 11);
		Shot(c.name);
		o2Scene.Clear(true);
		o2Scene.UpdateDestroyingEntities();
		auto camera = mmake<CameraActor>();
		camera->SetFittedSize(Vec2F(1920, 1080));
		camera->fillColor = Color4(30, 30, 40, 255);
	}
}
