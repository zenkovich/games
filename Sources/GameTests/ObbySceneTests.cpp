#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "ObbyGameComponent.h"
#include "ObbySceneFactory.h"
#include "o2/Assets/Assets.h"
#include "o2/Scene/Actor.h"
#include "o2/Scene/CameraActor.h"
#include "o2/Scene/Scene.h"
#include "o2/Utils/FileSystem/FileSystem.h"
#include "Scene/SceneTestHelpers.h"

using namespace o2;

TEST(ObbyScene, FactoryBuildsCameraAndGame)
{
	SceneCleanGuard guard;

	auto game = obby::BuildBootstrapScene();
	ASSERT_TRUE(game);
	EXPECT_TRUE(o2Scene.FindActor("Game"));
	EXPECT_TRUE(DynamicCast<CameraActor>(o2Scene.FindActor("camera")));

	auto component = game->GetComponent<ObbyGameComponent>();
	ASSERT_TRUE(component);

	TickFrame();
	EXPECT_EQ(component->GetScreen(), ObbyGameComponent::Screen::Menu);
	EXPECT_EQ(component->GetLevels().levels.Count(), 30);
	EXPECT_FALSE(component->IsViewBuilt());

	component->StartLevel(3);
	TickFrames(30, 1.0f/60.0f);
	EXPECT_EQ(component->GetScreen(), ObbyGameComponent::Screen::Playing);
	EXPECT_EQ(component->GetLevelIndex(), 3);
	EXPECT_TRUE(component->GetWorld().IsOnGround());
}

// The bootstrap scene asset is generated from the factory: regenerated only when missing, so the
// actor ids in the committed file stay stable
TEST(ObbyScene, BootstrapSceneAssetExists)
{
	SceneCleanGuard guard;

	String path = o2Assets.GetAssetsPath() + String(obby::kSceneName);
	if (!o2FileSystem.IsFileExist(path))
		EXPECT_TRUE(obby::SaveBootstrapScene(path));

	ASSERT_TRUE(o2FileSystem.IsFileExist(path));

	o2Scene.Clear(true);
	o2Scene.UpdateDestroyingEntities();
	o2Scene.Load(path);
	TickFrame();

	auto actor = o2Scene.FindActor("Game");
	ASSERT_TRUE(actor);
	EXPECT_TRUE(actor->GetComponent<ObbyGameComponent>());
	EXPECT_TRUE(DynamicCast<CameraActor>(o2Scene.FindActor("camera")));
}
