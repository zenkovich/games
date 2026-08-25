#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "ColorTownGame.h"
#include "Screens/BuildWindow.h"
#include "Screens/CharacterScreen.h"
#include "Screens/CityScreen.h"
#include "Screens/DateScreen.h"
#include "Screens/GlassScreen.h"
#include "Screens/WorkshopScreen.h"
#include "o2/Assets/Assets.h"
#include "o2/Scene/Scene.h"
#include "o2/Utils/FileSystem/FileSystem.h"
#include "Scene/SceneTestHelpers.h"

using namespace o2;

// Headless screen flow: the game builds every screen without visuals and navigates on model events
class ColorTownFlow: public ::testing::Test
{
protected:
	SceneCleanGuard     sceneGuard;
	Ref<ColorTownGame>  game;
	Ref<GameModel>      model;

	void SetUp() override
	{
		ColorTownGame::CreateBootstrapActor();
		TickFrame();

		game = ColorTownGame::Find();
		ASSERT_TRUE(game);
		model = game->GetModel();
		ASSERT_TRUE(model && model->IsValid());
	}
};

TEST_F(ColorTownFlow, StartsOnTheCityScreen)
{
	EXPECT_EQ(game->GetCurrentScreenName(), ColorTownGame::kCity);
	EXPECT_TRUE(game->GetCurrentScreen()->IsShown());
	EXPECT_FALSE(game->GetScreen(ColorTownGame::kGlass)->IsShown());
	EXPECT_FALSE(game->GetWindow());
}

TEST_F(ColorTownFlow, GlassScreenBuildsTheFieldOfTheBuildingAndHarvestsPops)
{
	game->ShowGlass("mine");
	EXPECT_EQ(game->GetCurrentScreenName(), ColorTownGame::kGlass);
	EXPECT_FALSE(game->GetScreen(ColorTownGame::kCity)->IsShown());

	auto glass = game->GetGlassScreen();
	ASSERT_TRUE(glass);
	EXPECT_EQ(glass->GetBuilding(), "mine");

	auto field = glass->GetField();
	ASSERT_TRUE(field);
	EXPECT_EQ(field->GetColors(), Vector<String>({ "iron", "gold", "coal" }));
	EXPECT_EQ(field->GetMaxBalls(), 56);

	auto a = field->SpawnBall("gold", Vec2F(0, 0));
	field->SpawnBall("gold", Vec2F(90, 0));
	field->SpawnBall("gold", Vec2F(180, 0));
	TickFrame();

	EXPECT_TRUE(field->PopGroup(a));
	EXPECT_EQ(model->GetInt("GetItem", "gold"), 3);

	game->ShowCity();
	EXPECT_FALSE(glass->GetField()) << "the field is dropped with the screen";
}

TEST_F(ColorTownFlow, WorkshopScreenShowsRecipesOfTheBuilding)
{
	game->ShowWorkshop("bakery");
	auto workshop = DynamicCast<WorkshopScreen>(game->GetCurrentScreen());
	ASSERT_TRUE(workshop);
	EXPECT_EQ(workshop->GetBuilding(), "bakery");
	EXPECT_TRUE(workshop->GetCraftButton(0));

	model->Call<int>("AddItem", String("wheat"), 3);
	game->RefreshAll();
	TickFrame();
	workshop->GetCraftButton(0)->onClick();
	EXPECT_TRUE(model->GetBool("IsCrafting", "bakery"));
}

TEST_F(ColorTownFlow, BuildWindowBuildsIntoTheSlotAndCloses)
{
	model->Call<void>("AddCoins", 500);
	game->OpenBuild(1);
	auto window = DynamicCast<BuildWindow>(game->GetWindow());
	ASSERT_TRUE(window);
	EXPECT_EQ(window->GetSlot(), 1);
	EXPECT_TRUE(window->IsShown());

	auto build = window->GetBuildButton("cottage");
	ASSERT_TRUE(build);
	build->onClick();

	EXPECT_FALSE(game->GetWindow());
	EXPECT_FALSE(window->IsShown());
	EXPECT_TRUE(model->GetBool("IsSlotConstructing", 1));

	auto city = DynamicCast<CityScreen>(game->GetCurrentScreen());
	ASSERT_TRUE(city);
	EXPECT_TRUE(city->GetSlotButton(1));
	EXPECT_TRUE(city->GetTier1Button("farm"));
}

TEST_F(ColorTownFlow, CharacterScreenGiftsAndDatesThroughOptions)
{
	model->Call<int>("AddItem", String("cake"), 2);
	model->Call<void>("AddCoins", 500);
	model->Call<bool>("Build", 1, String("park"));
	model->Call<void>("Update", 10.0f);

	game->ShowCharacter("leo");
	auto screen = DynamicCast<CharacterScreen>(game->GetCurrentScreen());
	ASSERT_TRUE(screen);
	EXPECT_EQ(screen->GetNpc(), "leo");

	screen->GetGiftButton()->onClick();
	EXPECT_EQ(screen->GetMode(), CharacterScreen::Mode::Gift);
	ASSERT_TRUE(screen->GetOptionButton(0)->IsEnabled());
	screen->GetOptionButton(0)->onClick();
	EXPECT_GT(model->GetInt("GetAffinity", "leo"), 0);
	EXPECT_EQ(model->GetInt("GetItem", "cake"), 1);

	screen->GetDateButton()->onClick();
	EXPECT_EQ(screen->GetMode(), CharacterScreen::Mode::Date);
	ASSERT_TRUE(screen->GetOptionButton(0)->IsEnabled());
	screen->GetOptionButton(0)->onClick();

	EXPECT_EQ(game->GetCurrentScreenName(), ColorTownGame::kDate);
	auto date = DynamicCast<DateScreen>(game->GetCurrentScreen());
	ASSERT_TRUE(date);
	EXPECT_EQ(date->GetNpc(), "leo");
	EXPECT_EQ(model->GetInt("GetItem", "cake"), 0);

	for (int i = 0; i < 3; i++)
		date->GetNextButton()->onClick();

	EXPECT_EQ(game->GetCurrentScreenName(), ColorTownGame::kCharacter);
	EXPECT_TRUE(model->GetBool("IsStorySeen", "leo", "park"));
}

TEST_F(ColorTownFlow, ModelNotificationsAreConsumedEachFrame)
{
	model->Call<int>("AddItem", String("wheat"), 100);
	EXPECT_NE(model->GetString("PopNotification"), "");
	model->Call<int>("AddItem", String("wheat"), 100);
	TickFrame();
	EXPECT_EQ(model->GetString("PopNotification"), "") << "the game consumed the notification";
}

// Builds the bootstrap scene the way the shipped Assets/Bootstrap.scn is produced and checks it boots
TEST(BootstrapScene, SavesAndLoadsARunningGame)
{
	SceneCleanGuard sceneGuard;

	String path = "TestTemp/Bootstrap.scn";
	o2FileSystem.FolderCreate("TestTemp", true);

	ColorTownGame::CreateBootstrapActor();
	o2Scene.UpdateAddedEntities(); // registers the actor without starting it: the saved scene stays minimal
	o2Scene.Save(path);

	o2Scene.Clear(true);
	o2Scene.UpdateDestroyingEntities();
	EXPECT_FALSE(ColorTownGame::Find());

	o2Scene.Load(path);
	TickFrame();

	auto game = ColorTownGame::Find();
	ASSERT_TRUE(game);
	ASSERT_TRUE(game->GetModel() && game->GetModel()->IsValid());
	EXPECT_EQ(game->GetModel()->GetInt("GetCoins"), 50);
	EXPECT_EQ(game->GetCurrentScreenName(), ColorTownGame::kCity);
}
