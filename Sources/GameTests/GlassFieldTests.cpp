#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "Core/GlassField.h"
#include "o2/Physics/PhysicsWorld.h"
#include "o2/Scene/Actor.h"
#include "o2/Scene/Scene.h"
#include "Scene/SceneTestHelpers.h"

using namespace o2;

// Mirrors Integration::UpdateFrameFixed: the physics world steps only in the fixed update
static void TickPhysicsFrame(float dt)
{
	o2Scene.UpdateAddedEntities();
	o2Scene.UpdateTransforms();
	o2Scene.FixedUpdate(dt);
	o2Physics.PreUpdate();
	o2Physics.Update(dt);
	o2Physics.PostUpdate();
	TickFrame(dt);
}

class GlassFieldTest: public ::testing::Test
{
protected:
	SceneCleanGuard sceneGuard;
	Ref<Actor>      actor;
	Ref<GlassField> field;
	Vector<Pair<String, int>> pops;

	void SetUp() override
	{
		actor = mmake<Actor>(ActorCreateMode::InScene);
		field = actor->AddComponent<GlassField>();
		field->Setup({ "wheat", "berry", "cotton" }, 10, Vec2F(600, 800), 40.0f);
		field->onGroupPopped = [this](const String& type, int count) { pops.Add({ type, count }); };
		TickFrame();
	}
};

TEST_F(GlassFieldTest, BuildsBorderAndContainer)
{
	EXPECT_TRUE(actor->FindChild("Border"));
	EXPECT_TRUE(actor->FindChild("Balls"));
	EXPECT_EQ(field->GetBallCount(), 0);
}

TEST_F(GlassFieldTest, SpawnsUpToMaxBallsOverTime)
{
	for (int i = 0; i < 240; i++)
		TickPhysicsFrame(1.0f / 30.0f);
	EXPECT_EQ(field->GetBallCount(), 10);

	for (auto& ball : field->GetBalls())
		EXPECT_TRUE(field->GetColors().Contains(ball->GetResourceType()));
}

TEST_F(GlassFieldTest, CollectsTouchingSameColorGroup)
{
	auto a = field->SpawnBall("wheat", Vec2F(0, 0));
	auto b = field->SpawnBall("wheat", Vec2F(80, 0));
	auto c = field->SpawnBall("wheat", Vec2F(160, 0));
	auto far = field->SpawnBall("wheat", Vec2F(400, 0));
	auto other = field->SpawnBall("berry", Vec2F(0, 80));
	TickFrame();

	auto group = field->CollectGroup(a);
	EXPECT_EQ(group.Count(), 3);
	EXPECT_TRUE(group.Contains(b));
	EXPECT_TRUE(group.Contains(c));
	EXPECT_FALSE(group.Contains(far));
	EXPECT_FALSE(group.Contains(other));
}

TEST_F(GlassFieldTest, PopRemovesGroupAndReports)
{
	auto a = field->SpawnBall("berry", Vec2F(0, 0));
	field->SpawnBall("berry", Vec2F(80, 0));
	auto alone = field->SpawnBall("wheat", Vec2F(-200, 0));
	TickFrame();

	EXPECT_FALSE(field->PopGroup(alone)) << "single ball never pops";
	EXPECT_TRUE(field->PopGroup(a));
	TickFrame();

	ASSERT_EQ(pops.Count(), 1);
	EXPECT_EQ(pops[0].first, "berry");
	EXPECT_EQ(pops[0].second, 2);
	EXPECT_EQ(field->GetBallCount(), 1);
}

TEST_F(GlassFieldTest, TapPopsThroughBallCallback)
{
	auto a = field->SpawnBall("cotton", Vec2F(0, 0));
	field->SpawnBall("cotton", Vec2F(0, 80));
	TickFrame();

	a->onTap(a);
	TickFrame();

	ASSERT_EQ(pops.Count(), 1);
	EXPECT_EQ(pops[0].second, 2);
}

TEST_F(GlassFieldTest, BallsFallUnderPhysicsAndStayInsideCup)
{
	auto ball = field->SpawnBall("wheat", Vec2F(0, 500));
	for (int i = 0; i < 180; i++)
		TickPhysicsFrame(1.0f / 60.0f);

	Vec2F pos = ball->GetActor()->transform->GetPosition2D();
	EXPECT_LT(pos.y, 450.0f) << "the ball must fall";
	EXPECT_GT(pos.y, -400.0f - 1.0f) << "the ball must rest on the bottom border";
	EXPECT_LT(Math::Abs(pos.x), 300.0f - 40.0f) << "the ball must stay between the walls";
}
