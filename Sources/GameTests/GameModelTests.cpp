#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "Core/GameModel.h"
#include "o2/Scene/Actor.h"
#include "o2/Scene/Scene.h"
#include "Scene/SceneTestHelpers.h"

using namespace o2;

// Rules live in Assets/Scripts/GameModel.js; the tests drive the real script through the C++ facade
class GameModelTest: public ::testing::Test
{
protected:
	SceneCleanGuard sceneGuard;
	Ref<Actor>      actor;
	Ref<GameModel>  model;

	void SetUp() override
	{
		actor = mmake<Actor>(ActorCreateMode::InScene);
		model = GameModel::CreateOn(actor);
		ASSERT_TRUE(model->IsValid());
	}

	void Fill(const String& item, int count)
	{
		model->Call<int>("AddItem", item, count);
	}
};

TEST_F(GameModelTest, StartsWithCoinsBakeryAndFourGlassBuildings)
{
	EXPECT_EQ(model->GetInt("GetCoins"), 50);
	EXPECT_EQ(model->GetInt("GetPopulation"), 0);
	EXPECT_FLOAT_EQ(model->GetFloat("GetMultiplier"), 1.0f);
	EXPECT_TRUE(model->GetBool("IsBuilt", "bakery"));
	EXPECT_FALSE(model->GetBool("IsBuilt", "forge"));
	EXPECT_EQ(model->GetStrings("GetTier1Ids").Count(), 4);
	EXPECT_EQ(model->GetStrings("GetGlassColors", "farm"), Vector<String>({ "wheat", "berry", "cotton" }));
}

TEST_F(GameModelTest, HarvestStoresResourcesAndPaysComboBonus)
{
	int gained = model->Call<int>("Harvest", String("farm"), String("wheat"), 3);
	EXPECT_EQ(gained, 3);
	EXPECT_EQ(model->GetInt("GetItem", "wheat"), 3);
	EXPECT_EQ(model->GetInt("GetCoins"), 50);

	model->Call<int>("Harvest", String("farm"), String("wheat"), 6);
	EXPECT_EQ(model->GetInt("GetItem", "wheat"), 9);
	EXPECT_EQ(model->GetInt("GetCoins"), 52) << "a group of 6 pays 2 bonus coins";
}

TEST_F(GameModelTest, OverflowConvertsToCoinsAndXp)
{
	int cap = model->GetInt("GetStorageCap");
	int overflow = model->Call<int>("AddItem", String("wheat"), cap + 5);

	EXPECT_EQ(overflow, 5);
	EXPECT_EQ(model->GetInt("GetItem", "wheat"), cap);
	EXPECT_EQ(model->GetInt("GetCoins"), 55);
	EXPECT_EQ(model->GetInt("GetXp"), 5);
	EXPECT_NE(model->GetString("PopNotification").Find("Storage full"), -1);
	EXPECT_EQ(model->GetString("PopNotification"), "");
}

TEST_F(GameModelTest, CraftConsumesInputsAndFinishesByTime)
{
	EXPECT_FALSE(model->GetBool("CanCraft", "bread"));
	Fill("wheat", 5);
	EXPECT_TRUE(model->GetBool("CanCraft", "bread"));

	EXPECT_TRUE(model->Call<bool>("StartCraft", String("bread")));
	EXPECT_EQ(model->GetInt("GetItem", "wheat"), 2);
	EXPECT_TRUE(model->GetBool("IsCrafting", "bakery"));
	EXPECT_FALSE(model->GetBool("CanCraft", "bread")) << "one order at a time per workshop";

	model->Call<void>("Update", 4.0f);
	EXPECT_EQ(model->GetInt("GetItem", "bread"), 0);
	model->Call<void>("Update", 1.5f);
	EXPECT_EQ(model->GetInt("GetItem", "bread"), 1);
	EXPECT_FALSE(model->GetBool("IsCrafting", "bakery"));
}

TEST_F(GameModelTest, ScriptableComponentUpdatesCraftTimers)
{
	Fill("wheat", 3);
	model->Call<bool>("StartCraft", String("bread"));

	TickFrames(10, 1.0f);

	EXPECT_EQ(model->GetInt("GetItem", "bread"), 1);
}

TEST_F(GameModelTest, CannotCraftInUnbuiltWorkshop)
{
	Fill("iron", 10);
	Fill("coal", 10);
	EXPECT_FALSE(model->GetBool("CanCraft", "nails"));
}

TEST_F(GameModelTest, PopulationRaisesSellPrice)
{
	Fill("bread", 2);
	EXPECT_EQ(model->GetInt("GetSellPrice", "bread"), 12);
	EXPECT_EQ(model->Call<int>("Sell", String("bread"), 1), 12);
	EXPECT_EQ(model->GetInt("GetCoins"), 62);

	model->Call<void>("AddCoins", 1000);
	EXPECT_TRUE(model->Call<bool>("Build", 1, String("cottage")));
	EXPECT_TRUE(model->Call<bool>("Build", 2, String("cottage")));
	model->Call<void>("Update", 10.0f);

	EXPECT_EQ(model->GetInt("GetPopulation"), 100);
	EXPECT_FLOAT_EQ(model->GetFloat("GetMultiplier"), 1.5f);
	EXPECT_EQ(model->GetInt("GetSellPrice", "bread"), 18);
}

TEST_F(GameModelTest, BuildingNeedsCoinsItemsAndFreeUnlockedSlot)
{
	EXPECT_EQ(model->GetString("GetBuildBlocker", "forge"), "Need 150 coins");
	model->Call<void>("AddCoins", 500);
	EXPECT_EQ(model->GetString("GetBuildBlocker", "forge"), "Need 4 Wood");
	Fill("wood", 4);
	EXPECT_EQ(model->GetString("GetBuildBlocker", "forge"), "");

	EXPECT_FALSE(model->Call<bool>("Build", 0, String("forge"))) << "slot 0 holds the bakery";
	EXPECT_FALSE(model->Call<bool>("Build", 7, String("forge"))) << "slot 7 is locked at city level 0";
	EXPECT_TRUE(model->Call<bool>("Build", 1, String("forge")));

	EXPECT_EQ(model->GetInt("GetItem", "wood"), 0);
	EXPECT_EQ(model->GetInt("GetCoins"), 400);
	EXPECT_TRUE(model->GetBool("IsSlotConstructing", 1));
	EXPECT_FALSE(model->GetBool("IsBuilt", "forge"));
	EXPECT_FALSE(model->GetStrings("GetBuildableIds").Contains("forge")) << "no second forge while it is under construction";

	model->Call<void>("Update", 10.5f);
	EXPECT_TRUE(model->GetBool("IsBuilt", "forge"));
	EXPECT_EQ(model->GetString("GetSlot", 1), "forge");
}

TEST_F(GameModelTest, HousesOfHigherTierNeedBeauty)
{
	model->Call<void>("AddCoins", 5000);
	EXPECT_EQ(model->GetString("GetBuildBlocker", "townhouse"), "Need beauty 10");
	model->Call<bool>("Build", 1, String("park"));
	model->Call<void>("Update", 10.0f);
	EXPECT_EQ(model->GetInt("GetBeauty"), 10);
	EXPECT_EQ(model->GetString("GetBuildBlocker", "townhouse"), "");
}

TEST_F(GameModelTest, GiftsRaiseAffinityWithRepeatPenalty)
{
	Fill("bread", 5);
	EXPECT_EQ(model->GetInt("GetAffinityLevel", "tom"), 0);

	EXPECT_EQ(model->Call<int>("Gift", String("tom"), String("bread")), 6);
	EXPECT_EQ(model->Call<int>("Gift", String("tom"), String("bread")), 6);
	EXPECT_EQ(model->Call<int>("Gift", String("tom"), String("bread")), 3) << "third identical gift in a row is halved";
	EXPECT_EQ(model->GetInt("GetAffinity", "tom"), 15);
	EXPECT_EQ(model->GetInt("GetItem", "bread"), 2);

	EXPECT_EQ(model->Call<int>("Gift", String("tom"), String("pie")), 0) << "nothing to give";
}

TEST_F(GameModelTest, DateNeedsSpotAndPremiumGiftAndTellsStory)
{
	Fill("cake", 1);
	EXPECT_FALSE(model->GetBool("CanDate", "tom", "park", "cake"));

	model->Call<void>("AddCoins", 500);
	model->Call<bool>("Build", 1, String("park"));
	model->Call<void>("Update", 10.0f);
	EXPECT_TRUE(model->GetBool("CanDate", "tom", "park", "cake"));
	EXPECT_FALSE(model->GetBool("CanDate", "tom", "park", "bread")) << "bread is not a premium gift";

	auto lines = model->Call<Vector<String>>("Date", String("tom"), String("park"), String("cake"));
	EXPECT_EQ(lines.Count(), 3);
	EXPECT_EQ(model->GetInt("GetAffinity", "tom"), 40);
	EXPECT_EQ(model->GetInt("GetItem", "cake"), 0);
	EXPECT_TRUE(model->GetBool("IsStorySeen", "tom", "park"));
}

TEST_F(GameModelTest, Tier1UpgradeNeedsAffinityAndBoostsYield)
{
	model->Call<void>("AddCoins", 1000);
	EXPECT_FALSE(model->GetBool("CanUpgradeTier1", "farm")) << "affinity 1 with Tom required";

	Fill("cake", 1);
	model->Call<int>("Gift", String("tom"), String("cake"));
	EXPECT_GE(model->GetInt("GetAffinityLevel", "tom"), 1);
	EXPECT_TRUE(model->GetBool("CanUpgradeTier1", "farm"));
	EXPECT_TRUE(model->Call<bool>("UpgradeTier1", String("farm")));

	EXPECT_EQ(model->GetInt("GetTier1Level", "farm"), 2);
	EXPECT_EQ(model->GetInt("GetGlassMaxBalls", "farm"), 66);
	EXPECT_EQ(model->Call<int>("Harvest", String("farm"), String("wheat"), 10), 13);
}

TEST_F(GameModelTest, SaveAndLoadRoundTrip)
{
	Fill("wheat", 7);
	model->Call<void>("AddCoins", 123);
	String json = model->GetString("ToJson");

	model->Call<void>("Reset");
	EXPECT_EQ(model->GetInt("GetItem", "wheat"), 0);

	EXPECT_TRUE(model->Call<bool>("FromJson", json));
	EXPECT_EQ(model->GetInt("GetItem", "wheat"), 7);
	EXPECT_EQ(model->GetInt("GetCoins"), 173);
	EXPECT_FALSE(model->Call<bool>("FromJson", String("garbage")));
}
