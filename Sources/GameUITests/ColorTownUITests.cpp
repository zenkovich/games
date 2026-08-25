#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "ColorTownGame.h"
#include "Screens/BuildWindow.h"
#include "Screens/CharacterScreen.h"
#include "Screens/CityScreen.h"
#include "Screens/DateScreen.h"
#include "Screens/GlassScreen.h"
#include "Screens/WarehouseWindow.h"
#include "Screens/WorkshopScreen.h"
#include "o2/Application/Application.h"
#include "o2/Assets/Assets.h"
#include "o2/Scene/CameraActor.h"
#include "o2/Scene/Scene.h"
#include "o2/Utils/Bitmap/Bitmap.h"
#include "o2/Utils/FileSystem/FileSystem.h"
#include "o2/Utils/Test/AppTestDriver.h"

using namespace o2;

namespace
{
	const String kScreenshotsDir = "TestScreenshots/ColorTown/";

	int CountDistinctColors(const Ref<Bitmap>& bitmap)
	{
		Vector<UInt32> seen;
		const UInt32* pixels = reinterpret_cast<const UInt32*>(bitmap->GetData());
		Vec2I size = bitmap->GetSize();
		for (int y = 0; y < size.y; y += 16)
		{
			for (int x = 0; x < size.x; x += 16)
			{
				UInt32 color = pixels[y*size.x + x];
				if (!seen.Contains(color))
					seen.Add(color);
			}
		}

		return seen.Count();
	}
}

// Rendered walkthrough of the prototype: real window, cursor taps on the widgets and the balls
class ColorTownUI: public ::testing::Test
{
protected:
	Ref<ColorTownGame> game;
	Ref<GameModel>     model;

	void SetUp() override
	{
		o2Application.SetWindowSize(Vec2I(540, 960));
		o2Scene.Load(o2Assets.GetBuiltAssetsPath() + String("Bootstrap.scn"));
		AppTestDriver::PumpFrames(5);

		game = ColorTownGame::Find();
		ASSERT_TRUE(game);
		model = game->GetModel();
		ASSERT_TRUE(model && model->IsValid());

		o2FileSystem.FolderCreate(kScreenshotsDir, true);
	}

	void TearDown() override
	{
		o2Scene.Clear(true);
		o2Scene.UpdateDestroyingEntities();
		AppTestDriver::PumpFrames(2);
	}

	Vec2F WorldToScreen(const Vec2F& world) const
	{
		auto camera = o2Scene.GetCameras()[0].Lock();
		return camera->listenersLayer->ScreenFromLocal(world);
	}

	void Click(const Ref<Widget>& widget)
	{
		ASSERT_TRUE(widget);
		AppTestDriver::Click(WorldToScreen(widget->transform->GetWorldRect().Center()));
		AppTestDriver::PumpFrames(2);
	}

	void Shot(const String& name)
	{
		EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + name + ".png"));
	}

	Ref<CityScreen> City() { return DynamicCast<CityScreen>(game->GetScreen(ColorTownGame::kCity)); }
	Ref<GlassScreen> Glass() { return DynamicCast<GlassScreen>(game->GetScreen(ColorTownGame::kGlass)); }
	Ref<WorkshopScreen> Workshop() { return DynamicCast<WorkshopScreen>(game->GetScreen(ColorTownGame::kWorkshop)); }
	Ref<CharacterScreen> Character() { return DynamicCast<CharacterScreen>(game->GetScreen(ColorTownGame::kCharacter)); }
	Ref<DateScreen> Date() { return DynamicCast<DateScreen>(game->GetScreen(ColorTownGame::kDate)); }
	Ref<WarehouseWindow> Warehouse() { return DynamicCast<WarehouseWindow>(game->GetScreen(ColorTownGame::kWarehouse)); }
	Ref<BuildWindow> Build() { return DynamicCast<BuildWindow>(game->GetScreen(ColorTownGame::kBuild)); }
};

TEST_F(ColorTownUI, CityScreenRenders)
{
	EXPECT_EQ(game->GetCurrentScreenName(), ColorTownGame::kCity);

	auto bitmap = AppTestDriver::TakeScreenshot();
	ASSERT_TRUE(bitmap);
	EXPECT_GT(CountDistinctColors(bitmap), 8);
	Shot("01_city");
}

TEST_F(ColorTownUI, GlassScreenPopsBallsByTap)
{
	Click(City()->GetTier1Button("farm"));
	ASSERT_EQ(game->GetCurrentScreenName(), ColorTownGame::kGlass);
	EXPECT_EQ(Glass()->GetBuilding(), "farm");

	auto field = Glass()->GetField();
	ASSERT_TRUE(field);
	AppTestDriver::Wait(4.0f);
	EXPECT_GE(field->GetBallCount(), 45) << "the glass fills up by itself";
	Shot("02_glass_full");

	Ref<ResourceBall> target;
	int groupSize = 0;
	for (auto& ball : field->GetBalls())
	{
		int size = field->CollectGroup(ball).Count();
		if (size > groupSize)
		{
			groupSize = size;
			target = ball;
		}
	}
	ASSERT_TRUE(target);
	ASSERT_GE(groupSize, 2) << "56 balls of 3 colors always touch somewhere";

	String type = target->GetResourceType();
	int before = model->GetInt("GetItem", type);
	int ballsBefore = field->GetBallCount();

	AppTestDriver::Click(WorldToScreen(target->GetActor()->transform->GetWorldPosition2D()));
	AppTestDriver::PumpFrames(2);

	EXPECT_EQ(model->GetInt("GetItem", type), before + groupSize);
	EXPECT_EQ(field->GetBallCount(), ballsBefore - groupSize);
	Shot("03_glass_popped");

	Click(Glass()->GetBackButton());
	EXPECT_EQ(game->GetCurrentScreenName(), ColorTownGame::kCity);
}

TEST_F(ColorTownUI, WorkshopCraftsAndSells)
{
	model->Call<int>("AddItem", String("wheat"), 10);
	game->RefreshAll();
	AppTestDriver::PumpFrames(1);

	Click(City()->GetSlotButton(0));
	ASSERT_EQ(game->GetCurrentScreenName(), ColorTownGame::kWorkshop);
	EXPECT_EQ(Workshop()->GetBuilding(), "bakery");
	Shot("04_workshop");

	Click(Workshop()->GetCraftButton(0));
	EXPECT_TRUE(model->GetBool("IsCrafting", "bakery"));
	EXPECT_EQ(model->GetInt("GetItem", "wheat"), 7);

	AppTestDriver::Wait(5.5f);
	EXPECT_EQ(model->GetInt("GetItem", "bread"), 1);
	Shot("05_workshop_crafted");

	int coins = model->GetInt("GetCoins");
	Click(Workshop()->GetSellButton(0));
	EXPECT_EQ(model->GetInt("GetItem", "bread"), 0);
	EXPECT_EQ(model->GetInt("GetCoins"), coins + 12);
}

TEST_F(ColorTownUI, WarehouseWindowOpensAndCloses)
{
	model->Call<int>("AddItem", String("berry"), 40);
	game->RefreshAll();
	AppTestDriver::PumpFrames(1);

	Click(City()->GetUI()->GetChildWidget("WarehouseButton"));
	ASSERT_EQ(game->GetWindowName(), ColorTownGame::kWarehouse);
	Shot("06_warehouse");

	Click(Warehouse()->GetCloseButton());
	EXPECT_EQ(game->GetWindowName(), "");
}

TEST_F(ColorTownUI, BuildWindowConstructsACottage)
{
	model->Call<void>("AddCoins", 500);
	game->RefreshAll();
	AppTestDriver::PumpFrames(1);

	Click(City()->GetSlotButton(1));
	ASSERT_EQ(game->GetWindowName(), ColorTownGame::kBuild);
	EXPECT_EQ(Build()->GetSlot(), 1);
	Shot("07_build");

	Click(Build()->GetBuildButton("cottage"));
	EXPECT_EQ(game->GetWindowName(), "");
	EXPECT_TRUE(model->GetBool("IsSlotConstructing", 1));

	AppTestDriver::Wait(5.5f);
	EXPECT_EQ(model->GetString("GetSlot", 1), "cottage");
	EXPECT_EQ(model->GetInt("GetPopulation"), 50);
	Shot("08_city_cottage");
}

TEST_F(ColorTownUI, CharacterGiftAndDate)
{
	model->Call<int>("AddItem", String("cake"), 2);
	model->Call<void>("AddCoins", 500);
	model->Call<bool>("Build", 1, String("park"));
	model->Call<void>("Update", 10.0f);
	game->RefreshAll();
	AppTestDriver::PumpFrames(1);

	Click(City()->GetUI()->GetChildWidget("CharactersButton"));
	ASSERT_EQ(game->GetCurrentScreenName(), ColorTownGame::kCharacter);
	Click(Character()->GetTabButton(2));
	EXPECT_EQ(Character()->GetNpc(), "leo");
	Shot("09_character");

	Click(Character()->GetGiftButton());
	EXPECT_EQ(Character()->GetMode(), CharacterScreen::Mode::Gift);
	Shot("10_character_gift");
	Click(Character()->GetOptionButton(0));
	EXPECT_GT(model->GetInt("GetAffinity", "leo"), 0);
	EXPECT_EQ(model->GetInt("GetItem", "cake"), 1);

	Click(Character()->GetDateButton());
	EXPECT_EQ(Character()->GetMode(), CharacterScreen::Mode::Date);
	// The same option button was tapped for the gift a moment ago: a second tap within the
	// double-click interval would count as a double click and not fire onClick
	AppTestDriver::Wait(0.6f);
	Click(Character()->GetOptionButton(0));
	ASSERT_EQ(game->GetCurrentScreenName(), ColorTownGame::kDate);
	Shot("11_date");

	Click(Date()->GetNextButton());
	EXPECT_EQ(Date()->GetLineIndex(), 1);
	AppTestDriver::Wait(0.6f);
	Click(Date()->GetNextButton());
	AppTestDriver::Wait(0.6f);
	Click(Date()->GetNextButton());
	EXPECT_EQ(game->GetCurrentScreenName(), ColorTownGame::kCharacter);
	EXPECT_TRUE(model->GetBool("IsStorySeen", "leo", "park"));
}
