#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "ObbyLevel.h"
#include "ObbyTestSupport.h"
#include "ObbyWorld.h"

using namespace o2;
using namespace obby;

namespace
{
	const float kTile = World::kTile;

	World MakeWorld(const Vector<String>& rows, const Function<void(LevelData&)>& setup = Function<void(LevelData&)>())
	{
		LevelData level = LevelData::FromRows(rows);
		if (setup)
			setup(level);

		World world;
		world.Load(level, Physics());
		return world;
	}

	float FeetY(const World& world)
	{
		return world.GetPlayerBox().bottom;
	}

	bool HasEvent(const Vector<Event>& events, EventType type)
	{
		return events.Contains([&](const Event& e) { return e.type == type; });
	}
}

TEST(ObbyWorld, CellMathRoundTrips)
{
	for (int c : { 0, 5, 31 })
	{
		for (int r : { 0, 9, 17 })
		{
			Vec2F center = World::CellCenter(c, r);
			EXPECT_EQ(World::ColOf(center.x), c);
			EXPECT_EQ(World::RowOf(center.y), r);
		}
	}

	EXPECT_NEAR(World::CellCenter(0, 17).y, -340.0f, 0.01f);
	EXPECT_NEAR(World::CellCenter(0, 0).x, -620.0f, 0.01f);
}

TEST(ObbyWorld, FallsOntoGroundAndStands)
{
	World world = MakeWorld({ "S....E", "######" });
	obbytest::Run(world, 1.0f);
	EXPECT_TRUE(world.IsOnGround());
	EXPECT_NEAR(FeetY(world), World::CellBox(0, 17).top, 0.5f);
	EXPECT_EQ(world.GetDeaths(), 0);
}

TEST(ObbyWorld, WalksRightAtMoveSpeed)
{
	World world = MakeWorld({ "S..............E", "################" });
	obbytest::Run(world, 0.5f);
	float x0 = world.GetPlayerPos().x;
	Input right; right.right = true;
	obbytest::Run(world, 0.5f, right);
	EXPECT_NEAR(world.GetPlayerPos().x - x0, 160.0f, 3.0f);
	EXPECT_EQ(world.GetFacing(), 1);
}

TEST(ObbyWorld, WallsStopThePotato)
{
	World world = MakeWorld({ "S.#..E", "######" });
	obbytest::Run(world, 0.5f);
	Input right; right.right = true;
	obbytest::Run(world, 1.0f, right);
	EXPECT_NEAR(world.GetPlayerBox().right, World::CellBox(2, 16).left, 0.5f);
	EXPECT_EQ(world.GetDeaths(), 0);
}

TEST(ObbyWorld, JumpReachesThreeTilesButNotFour)
{
	World world = MakeWorld({ "S....E", "######" });
	obbytest::Run(world, 0.5f);
	float ground = FeetY(world);

	Input jump; jump.jump = true;
	float top = ground;
	const float dt = 1.0f/120.0f;
	for (int i = 0; i < 120; i++)
	{
		world.Step(dt, jump);
		top = Math::Max(top, FeetY(world));
	}

	EXPECT_GT(top - ground, 3.0f*kTile);
	EXPECT_LT(top - ground, 4.0f*kTile);
	EXPECT_TRUE(world.IsOnGround());
}

TEST(ObbyWorld, ReleasingJumpCutsTheHeight)
{
	World world = MakeWorld({ "S....E", "######" });
	obbytest::Run(world, 0.5f);
	float ground = FeetY(world);

	Input jump; jump.jump = true;
	const float dt = 1.0f/120.0f;
	float top = ground;
	for (int i = 0; i < 120; i++)
	{
		world.Step(dt, i < 6 ? jump : Input());
		top = Math::Max(top, FeetY(world));
	}

	EXPECT_LT(top - ground, 2.0f*kTile);
}

TEST(ObbyWorld, ClearsFourTileGapAndDiesInSixTileGap)
{
	World narrow = MakeWorld({ "S........E", "###....###" });
	obbytest::Run(narrow, 0.5f);
	EXPECT_TRUE(obbytest::AutoRunRight(narrow, 5.0f));
	EXPECT_EQ(narrow.GetDeaths(), 0);

	World wide = MakeWorld({ "S..........E", "###......###" });
	obbytest::Run(wide, 0.5f);
	obbytest::AutoRunRight(wide, 3.0f);
	EXPECT_GE(wide.GetDeaths(), 1);
}

TEST(ObbyWorld, FakeBlockFallsAfterDelayAndRestoresOnDeath)
{
	World world = MakeWorld({ "S...E", "#F###" });
	obbytest::Run(world, 0.3f);
	world.SetPlayerPos(World::CellCenter(1, 16));
	obbytest::Run(world, 0.1f);
	EXPECT_TRUE(world.IsOnGround());
	EXPECT_TRUE(world.TileAt(1, 17).triggered);
	EXPECT_FALSE(world.TileAt(1, 17).fallen);

	obbytest::Run(world, 0.3f);
	EXPECT_TRUE(world.TileAt(1, 17).fallen);
	EXPECT_FALSE(world.IsOnGround());

	obbytest::Run(world, 2.0f);
	EXPECT_EQ(world.GetDeaths(), 1);
	EXPECT_FALSE(world.TileAt(1, 17).fallen);
	EXPECT_FALSE(world.TileAt(1, 17).triggered);
}

TEST(ObbyWorld, InvisibleBlockHoldsAndReveals)
{
	World world = MakeWorld({ "S...E", "#III#" });
	EXPECT_FALSE(world.IsTileVisible(2, 17));
	obbytest::Run(world, 0.3f);
	Input right; right.right = true;
	obbytest::Run(world, 0.4f, right);
	EXPECT_EQ(world.GetDeaths(), 0);
	EXPECT_TRUE(world.IsOnGround());
	EXPECT_TRUE(world.TileAt(1, 17).revealed);
	EXPECT_TRUE(world.IsTileVisible(1, 17));
}

TEST(ObbyWorld, MimicKillsOnTouch)
{
	World world = MakeWorld({ "S...E", "#K###" });
	obbytest::Run(world, 0.3f);
	Input right; right.right = true;
	obbytest::Run(world, 0.5f, right);
	EXPECT_EQ(world.GetDeaths(), 1);
	EXPECT_TRUE(world.IsFrozen());
	auto events = world.TakeEvents();
	EXPECT_TRUE(HasEvent(events, EventType::Death));
}

TEST(ObbyWorld, SpikeKillsAndRespawnsAtStart)
{
	World world = MakeWorld({ "S...E", "##^##" });
	obbytest::Run(world, 0.3f);
	Input right; right.right = true;
	obbytest::Run(world, 0.5f, right);
	EXPECT_EQ(world.GetDeaths(), 1);
	EXPECT_NEAR(world.GetPlayerPos().x, World::CellCenter(0, 16).x, 1.0f);
}

TEST(ObbyWorld, ExitWinsAndFreezes)
{
	World world = MakeWorld({ "S.E", "###" });
	obbytest::Run(world, 0.3f);
	Input right; right.right = true;
	obbytest::Run(world, 0.5f, right);
	EXPECT_TRUE(world.IsWon());
	EXPECT_TRUE(HasEvent(world.TakeEvents(), EventType::Win));

	Vec2F pos = world.GetPlayerPos();
	obbytest::Run(world, 0.5f, right);
	EXPECT_EQ(world.GetPlayerPos().x, pos.x);
}

TEST(ObbyWorld, FakeExitTeleportsToSpawn)
{
	World world = MakeWorld({ "S.X....E", "########" });
	obbytest::Run(world, 0.3f);
	Input right; right.right = true;
	obbytest::Run(world, 0.4f, right);
	EXPECT_FALSE(world.IsWon());
	EXPECT_EQ(world.GetDeaths(), 0);
	EXPECT_TRUE(HasEvent(world.TakeEvents(), EventType::Teleport));
	EXPECT_LT(world.GetPlayerPos().x, World::CellCenter(1, 16).x);
}

TEST(ObbyWorld, CheckpointMovesSpawnAndFakeOneResetsIt)
{
	World world = MakeWorld({ "S...C..^..E", "###########" });
	obbytest::Run(world, 0.3f);
	Input right; right.right = true;
	obbytest::Run(world, 0.7f, right);
	EXPECT_TRUE(HasEvent(world.TakeEvents(), EventType::Checkpoint));
	EXPECT_NEAR(world.GetSpawnPos().x, World::CellCenter(4, 16).x, 0.01f);

	obbytest::Run(world, 0.6f, right);
	EXPECT_EQ(world.GetDeaths(), 1);
	EXPECT_NEAR(world.GetPlayerPos().x, World::CellCenter(4, 16).x, 1.0f);

	World fake = MakeWorld({ "S......T..E", "###########" });
	obbytest::Run(fake, 0.3f);
	obbytest::Run(fake, 1.2f, right);
	EXPECT_TRUE(HasEvent(fake.TakeEvents(), EventType::Teleport));
	EXPECT_NEAR(fake.GetSpawnPos().x, World::CellCenter(0, 16).x, 0.01f);
	EXPECT_NEAR(fake.GetPlayerPos().x, World::CellCenter(0, 16).x, 1.0f);
}

TEST(ObbyWorld, GravityTileFlipsAndCeilingHolds)
{
	World world = MakeWorld({
		"########",
		"........",
		"........",
		"S.G....E",
		"########" });
	obbytest::Run(world, 0.3f);
	Input right; right.right = true;
	obbytest::Run(world, 0.4f, right);
	EXPECT_EQ(world.GetGravityDir(), 1);
	obbytest::Run(world, 1.0f);
	EXPECT_TRUE(world.IsOnGround());
	EXPECT_NEAR(world.GetPlayerBox().top, World::CellBox(0, 13).bottom, 0.5f);
	EXPECT_EQ(world.GetDeaths(), 0);
}

TEST(ObbyWorld, BounceLaunchesHigherThanAJump)
{
	World world = MakeWorld({ "S..E", "#B##" });
	obbytest::Run(world, 0.3f);
	float ground = FeetY(world);
	world.SetPlayerPos(World::CellCenter(1, 16));

	float top = ground;
	const float dt = 1.0f/120.0f;
	for (int i = 0; i < 240; i++)
	{
		world.Step(dt, Input());
		top = Math::Max(top, FeetY(world));
	}

	EXPECT_GT(top - ground, 6.0f*kTile);
	EXPECT_TRUE(HasEvent(world.TakeEvents(), EventType::Bounce));
}

TEST(ObbyWorld, ConveyorPushesStandingPotato)
{
	World world = MakeWorld({ "S......E", "#>>>>>>#" });
	obbytest::Run(world, 0.3f);
	world.SetPlayerPos(World::CellCenter(1, 16));
	obbytest::Run(world, 0.2f);
	float x0 = world.GetPlayerPos().x;
	obbytest::Run(world, 0.5f);
	EXPECT_NEAR(world.GetPlayerPos().x - x0, 80.0f, 4.0f);
}

TEST(ObbyWorld, MirrorSwapsDirections)
{
	World world = MakeWorld({ "...S...E", "########" }, [](LevelData& level) { level.mirror = true; });
	obbytest::Run(world, 0.3f);
	float x0 = world.GetPlayerPos().x;
	Input right; right.right = true;
	obbytest::Run(world, 0.2f, right);
	EXPECT_LT(world.GetPlayerPos().x, x0);
}

TEST(ObbyWorld, MoverBouncesBetweenWallsAndCarriesThePotato)
{
	World world = MakeWorld({ "S........E", "#M.......#" });
	ASSERT_EQ(world.GetMovers().Count(), 1);
	EXPECT_EQ(world.TileAt(1, 17).type, Tile::Empty);

	float startX = world.GetMovers()[0].pos.x;
	obbytest::Run(world, 0.5f);
	EXPECT_GT(world.GetMovers()[0].pos.x, startX);

	World ride = MakeWorld({ "S........E", "#M.......#" });
	obbytest::Run(ride, 0.1f);
	ride.SetPlayerPos(ride.GetMovers()[0].pos + Vec2F(0.0f, kTile));
	obbytest::Run(ride, 0.5f);
	EXPECT_TRUE(ride.IsOnGround());
	float dx = ride.GetPlayerPos().x - ride.GetMovers()[0].pos.x;
	obbytest::Run(ride, 0.5f);
	EXPECT_NEAR(ride.GetPlayerPos().x - ride.GetMovers()[0].pos.x, dx, 2.0f);

	obbytest::Run(ride, 3.0f);
	EXPECT_LT(ride.GetMovers()[0].pos.x, World::CellCenter(8, 17).x + 1.0f);
}

TEST(ObbyWorld, BlinkTilesAlternatePhases)
{
	World world = MakeWorld({ "S...E", "#Dd##" });
	Physics physics = world.GetPhysics();
	EXPECT_TRUE(world.IsTileVisible(1, 17));
	EXPECT_TRUE(world.IsTileVisible(2, 17));
	EXPECT_TRUE(world.IsTileSolidNow(1, 17));

	obbytest::Run(world, 1.0f);
	EXPECT_TRUE(world.IsTileVisible(1, 17));
	EXPECT_FALSE(world.IsTileVisible(2, 17));
	EXPECT_FALSE(world.IsTileSolidNow(2, 17));

	obbytest::Run(world, physics.blinkVisible - 1.0f + 0.1f);
	EXPECT_FALSE(world.IsTileVisible(1, 17));
	EXPECT_TRUE(world.IsTileVisible(2, 17));
	EXPECT_FALSE(world.IsTileSolidNow(1, 17));
}

TEST(ObbyWorld, ShyTileHidesWhenApproachedAndReturns)
{
	World world = MakeWorld({ "S......E", "####V###" });
	obbytest::Run(world, 0.3f);
	EXPECT_TRUE(world.IsTileVisible(4, 17));

	world.SetPlayerPos(World::CellCenter(3, 16));
	obbytest::Run(world, 0.1f);
	EXPECT_TRUE(world.TileAt(4, 17).triggered);
	obbytest::Run(world, 0.6f);
	EXPECT_FALSE(world.IsTileVisible(4, 17));
	EXPECT_FALSE(world.IsTileSolidNow(4, 17));

	world.SetPlayerPos(World::CellCenter(0, 16));
	obbytest::Run(world, 2.5f);
	EXPECT_TRUE(world.IsTileVisible(4, 17));
}

TEST(ObbyWorld, ExitRunsAwayToTarget)
{
	World world = MakeWorld({
		"..........e.",
		"............",
		"S.....E.....",
		"############" });
	obbytest::Run(world, 0.3f);
	Vec2F exitAtStart = world.GetExitPos();
	Input right; right.right = true;
	obbytest::Run(world, 0.5f, right);
	EXPECT_TRUE(world.HasExitRun());
	EXPECT_NE(world.GetExitPos().x, exitAtStart.x);
	EXPECT_NEAR(world.GetExitPos().x, World::CellCenter(10, 14).x, 0.01f);
	EXPECT_FALSE(world.IsWon());
	EXPECT_TRUE(HasEvent(world.TakeEvents(), EventType::ExitRan));
}

TEST(ObbyWorld, StartFallsDropsThePadAfterASecond)
{
	World world = MakeWorld({ "S......E", "########" }, [](LevelData& level) { level.startFalls = true; });
	EXPECT_EQ(world.TileAt(0, 17).type, Tile::Fake);
	EXPECT_EQ(world.TileAt(3, 17).type, Tile::Fake);
	EXPECT_EQ(world.TileAt(4, 17).type, Tile::Block);
	obbytest::Run(world, 0.8f);
	EXPECT_EQ(world.GetDeaths(), 0);
	obbytest::Run(world, 1.5f);
	EXPECT_EQ(world.GetDeaths(), 1);
	EXPECT_FALSE(world.TileAt(0, 17).fallen);
	EXPECT_TRUE(world.TileAt(0, 17).triggered);
}

TEST(ObbyWorld, LowGravityJumpsHigher)
{
	World normal = MakeWorld({ "S....E", "######" });
	World low = MakeWorld({ "S....E", "######" }, [](LevelData& level) { level.lowGravity = true; });
	obbytest::Run(normal, 0.5f);
	obbytest::Run(low, 0.5f);

	auto measure = [](World& world)
	{
		float ground = FeetY(world), top = ground;
		Input jump; jump.jump = true;
		for (int i = 0; i < 300; i++)
		{
			world.Step(1.0f/120.0f, jump);
			top = Math::Max(top, FeetY(world));
		}
		return top - ground;
	};

	EXPECT_GT(measure(low), measure(normal)*1.8f);
}

TEST(ObbyWorld, FallingOffTheWorldKills)
{
	World world = MakeWorld({ "S.....E", "#....##" });
	obbytest::Run(world, 0.3f);
	Input right; right.right = true;
	obbytest::Run(world, 2.0f, right);
	EXPECT_GE(world.GetDeaths(), 1);
}
