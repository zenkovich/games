#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "o2/Application/Application.h"
#include "o2/Assets/Assets.h"
#include "o2/Assets/Types/Spine/SpineAsset.h"
#include "o2/Scene/Actor.h"
#include "o2/Scene/CameraActor.h"
#include "o2/Scene/Components/SpineComponent.h"
#include "o2/Scene/Scene.h"
#include "o2/Utils/Bitmap/Bitmap.h"
#include "o2/Utils/FileSystem/FileSystem.h"
#include "o2/Utils/Test/AppTestDriver.h"

using namespace o2;

// Characters exported from Unity (PSB + bones + IK) as Spine skeletons render and animate
class DragonCharacters: public ::testing::Test
{
protected:
	void SetUp() override
	{
		o2Application.SetWindowSize(Vec2I(1280, 720));
		AppTestDriver::PumpFrames(2);

		auto camera = mmake<CameraActor>();
		camera->SetFittedSize(Vec2F(1920, 1080));
		camera->fillColor = Color4(90, 90, 110, 255);
		mCamera = camera;
	}

	void TearDown() override
	{
		o2Scene.Clear(true);
		o2Scene.UpdateDestroyingEntities();
		AppTestDriver::PumpFrames(2);
	}

	Ref<SpineComponent> Spawn(const String& name, const Vec2F& pos, float scale, const String& anim)
	{
		auto actor = mmake<Actor>(ActorCreateMode::InScene);
		actor->SetName(name);
		actor->transform->position = pos;
		actor->transform->scale = Vec2F(scale, scale);
		auto spine = actor->AddComponent<SpineComponent>();
		spine->SetSpineAsset(AssetRef<SpineAsset>("DragonCrashers/Characters/" + name + ".spine-json"));
		if (auto state = spine->GetState(anim))
		{
			state->SetLooped(true);
			spine->Play(anim);
		}
		return spine;
	}

	Ref<CameraActor> mCamera;
};

TEST_F(DragonCharacters, AllSkeletonsLoadWithAnimations)
{
	for (auto name : { "Knight", "Witch", "Wolfman", "Skeleton_A", "Skeleton_B", "Skeleton_C", "Dragon" })
	{
		auto spine = Spawn(name, Vec2F(), 0.4f, "Idle");
		auto names = spine->GetStatesNames();
		EXPECT_TRUE(names.Contains("Idle") || names.Contains("Sleeping")) << name;
		EXPECT_TRUE(names.Contains("GetHit")) << name;
		spine->GetActor()->Destroy();
	}
}

TEST_F(DragonCharacters, RenderLineup)
{
	Spawn("Witch", Vec2F(-750, -250), 0.43f, "Idle");
	Spawn("Knight", Vec2F(-450, -250), 0.43f, "Idle");
	Spawn("Wolfman", Vec2F(-150, -250), 0.43f, "Idle");
	Spawn("Skeleton_A", Vec2F(-750, 150), 0.43f, "Run");
	Spawn("Skeleton_B", Vec2F(-450, 150), 0.43f, "GetHit");
	Spawn("Skeleton_C", Vec2F(-150, 150), 0.43f, "Die");
	Spawn("Dragon", Vec2F(450, -300), 0.43f, "Idle");

	AppTestDriver::PumpFrames(30);
	o2FileSystem.FolderCreate("TestScreenshots", true);
	auto shot = AppTestDriver::TakeScreenshot();
	ASSERT_TRUE(shot);
	shot->Save("TestScreenshots/dragon_characters_lineup.png", Bitmap::ImageType::Png);
}
