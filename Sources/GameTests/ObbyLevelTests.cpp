#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "ObbyLevel.h"
#include "ObbyTestSupport.h"
#include "ObbyWorld.h"
#include "o2/Assets/Assets.h"

using namespace o2;
using namespace obby;

namespace
{
	LevelSet LoadShippedLevels()
	{
		LevelSet levels;
		EXPECT_TRUE(levels.LoadFromFile(o2Assets.GetBuiltAssetsPath() + String("PotatoObby/levels.json")));
		return levels;
	}
}

TEST(ObbyLevels, TileCharsRoundTrip)
{
	const char* chars = ".#FIKDdV^vMNB<>GCTSEXe";
	for (int i = 0; chars[i]; i++)
		EXPECT_EQ(CharFromTile(TileFromChar(chars[i])), chars[i]);

	EXPECT_EQ(TileFromChar('?'), Tile::Empty);
}

TEST(ObbyLevels, ShippedSetHasThirtyValidLevels)
{
	LevelSet levels = LoadShippedLevels();
	ASSERT_EQ(levels.levels.Count(), 30);
	EXPECT_TRUE(levels.Validate().IsEmpty()) << (const char*)levels.Validate();

	for (auto& level : levels.levels)
	{
		EXPECT_FALSE(level.name.IsEmpty());
		EXPECT_FALSE(level.hint.IsEmpty());
		EXPECT_EQ(level.Count(Tile::Start), 1);
		EXPECT_EQ(level.Count(Tile::Exit), 1);
	}

	EXPECT_NEAR(levels.physics.gravity, 2400.0f, 0.01f);
	EXPECT_NEAR(levels.physics.jumpSpeed, 800.0f, 0.01f);
}

TEST(ObbyLevels, FlagsAreRead)
{
	LevelSet levels = LoadShippedLevels();
	ASSERT_EQ(levels.levels.Count(), 30);

	EXPECT_TRUE(levels.levels[11].mirror);
	EXPECT_TRUE(levels.levels[14].darkness);
	EXPECT_TRUE(levels.levels[15].startFalls);
	EXPECT_TRUE(levels.levels[28].lowGravity);
	EXPECT_TRUE(levels.levels[29].mirror && levels.levels[29].startFalls);
	EXPECT_FALSE(levels.levels[0].mirror || levels.levels[0].darkness || levels.levels[0].startFalls || levels.levels[0].lowGravity);
}

TEST(ObbyLevels, ValidateRejectsBrokenLevels)
{
	LevelData noExit = LevelData::FromRows({ "S...", "####" });
	EXPECT_FALSE(noExit.Validate().IsEmpty());

	LevelData twoStarts = LevelData::FromRows({ "S..S..E", "#######" });
	EXPECT_FALSE(twoStarts.Validate().IsEmpty());

	LevelData fine = LevelData::FromRows({ "S.....E", "#######" });
	EXPECT_TRUE(fine.Validate().IsEmpty());
}

TEST(ObbyLevels, LoadFromJsonString)
{
	LevelSet levels;
	ASSERT_TRUE(levels.LoadFromJson("{\"physics\": {\"gravity\": 1000}, \"levels\": [{\"name\": \"a\", \"hint\": \"b\", \"mirror\": true, \"rows\": [\"S.E\", \"###\"]}]}"));
	ASSERT_EQ(levels.levels.Count(), 1);
	EXPECT_NEAR(levels.physics.gravity, 1000.0f, 0.01f);
	EXPECT_EQ(levels.levels[0].name, "a");
	EXPECT_TRUE(levels.levels[0].mirror);
	EXPECT_EQ(levels.levels[0].At(0, 0), Tile::Start);
	EXPECT_EQ(levels.levels[0].At(2, 0), Tile::Exit);
	EXPECT_EQ(levels.levels[0].At(0, 1), Tile::Block);
	EXPECT_EQ(levels.levels[0].At(5, 5), Tile::Empty);
}

// Standing still on the start pad for most of a second is safe on every level that does not drop it
TEST(ObbyLevels, StartIsSafeToStandOn)
{
	LevelSet levels = LoadShippedLevels();
	for (int i = 0; i < levels.levels.Count(); i++)
	{
		World world;
		world.Load(levels.levels[i], levels.physics);
		obbytest::Run(world, levels.levels[i].startFalls ? 0.5f : 2.0f);
		EXPECT_EQ(world.GetDeaths(), 0) << "level " << (i + 1);
		EXPECT_FALSE(world.IsWon()) << "level " << (i + 1);
		EXPECT_TRUE(world.IsOnGround()) << "level " << (i + 1);
	}
}

TEST(ObbyLevels, StartPadDropsOnStartFallsLevels)
{
	LevelSet levels = LoadShippedLevels();
	World world;
	world.Load(levels.levels[15], levels.physics);
	obbytest::Run(world, 2.0f);
	EXPECT_GE(world.GetDeaths(), 1);
}

// Every mechanic of every level survives ten seconds of a reckless runner without crashing
TEST(ObbyLevels, AllLevelsSurviveTheRunner)
{
	LevelSet levels = LoadShippedLevels();
	for (int i = 0; i < levels.levels.Count(); i++)
	{
		World world;
		world.Load(levels.levels[i], levels.physics);
		obbytest::AutoRunRight(world, 10.0f);
		EXPECT_LT(world.GetDeaths(), 100) << "level " << (i + 1);
		EXPECT_TRUE(world.GetPlayerPos().x >= -700.0f && world.GetPlayerPos().x <= 700.0f) << "level " << (i + 1);
	}
}

TEST(ObbyLevels, FirstLevelsAreBeatableByRunningRight)
{
	LevelSet levels = LoadShippedLevels();
	for (int i : { 0, 2 })
	{
		World world;
		world.Load(levels.levels[i], levels.physics);
		EXPECT_TRUE(obbytest::AutoRunRight(world, 20.0f)) << "level " << (i + 1) << " deaths " << world.GetDeaths();
	}
}
