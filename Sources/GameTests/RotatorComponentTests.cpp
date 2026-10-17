#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "RotatorComponent.h"
#include "o2/Scene/Actor.h"
#include "o2/Scene/Scene.h"
#include "Scene/SceneTestHelpers.h"
#include "o2libs/o2libs.h"

using namespace o2;

TEST(Rotator, RotatesOwnerActor)
{
	SceneCleanGuard sceneGuard;

	auto actor = mmake<Actor>(ActorCreateMode::InScene);
	auto rotator = actor->AddComponent<RotatorComponent>();
	rotator->speed = 90.0f;

	TickFrame();
	float angleBefore = actor->transform->angleDegrees.Get();

	TickFrames(10, 0.1f);

	float rotated = actor->transform->angleDegrees.Get() - angleBefore;
	EXPECT_NEAR(rotated, 90.0f, 5.0f);
}

namespace
{
	// A remote config for the code under test, without a service: a local override of the game's client
	struct RemoteConfigGuard
	{
		RemoteConfigGuard(const char* key, const char* json)
		{
			DataDocument doc;
			doc.LoadFromData(json);
			o2RemoteConfig.SetLocalOverride(key, doc);
		}

		~RemoteConfigGuard() { o2RemoteConfig.ClearLocalOverride(); }
	};
}

TEST(Rotator, TakesItsSpeedFromTheRemoteBalance)
{
	SceneCleanGuard sceneGuard;
	RemoteConfigGuard remote("rotator_balance", R"({"speed": 180, "clockwise": true})");

	auto actor = mmake<Actor>(ActorCreateMode::InScene);
	auto rotator = actor->AddComponent<RotatorComponent>();
	rotator->speed = 90.0f;
	rotator->balanceConfig = "rotator_balance";

	EXPECT_FLOAT_EQ(rotator->GetEffectiveSpeed(), -180.0f);

	TickFrame();
	float angleBefore = actor->transform->angleDegrees.Get();
	TickFrames(10, 0.1f);
	EXPECT_NEAR(actor->transform->angleDegrees.Get() - angleBefore, -180.0f, 10.0f);
}

TEST(Rotator, FollowsTheConfigAsItChangesAndFallsBackWithoutIt)
{
	SceneCleanGuard sceneGuard;

	auto actor = mmake<Actor>(ActorCreateMode::InScene);
	auto rotator = actor->AddComponent<RotatorComponent>();
	rotator->speed = 90.0f;
	rotator->balanceConfig = "rotator_balance";
	EXPECT_FLOAT_EQ(rotator->GetEffectiveSpeed(), 90.0f);

	{
		// a field the config leaves out keeps the component's value
		RemoteConfigGuard remote("rotator_balance", R"({"clockwise": true})");
		EXPECT_FLOAT_EQ(rotator->GetEffectiveSpeed(), -90.0f);
	}

	EXPECT_FLOAT_EQ(rotator->GetEffectiveSpeed(), 90.0f);

	rotator->balanceConfig = "";
	RemoteConfigGuard other("rotator_balance", R"({"speed": 5})");
	EXPECT_FLOAT_EQ(rotator->GetEffectiveSpeed(), 90.0f);
}
