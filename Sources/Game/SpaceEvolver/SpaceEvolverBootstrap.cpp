#include "o2/stdafx.h"
#include "SpaceEvolverBootstrap.h"

#include "o2/Assets/Assets.h"
#include "o2/Assets/Types/JavaScriptAsset.h"
#include "o2/Scene/Actor.h"
#include "o2/Scene/CameraActor.h"
#include "o2/Scene/Components/ScriptableComponent.h"
#include "o2/Scene/Scene.h"
#include "o2/Utils/FileSystem/FileSystem.h"

using namespace o2;

namespace space_evolver
{
	Ref<Actor> BuildBootstrapScene()
	{
		o2Scene.AddLayer("Background");
		o2Scene.AddLayer("Game");
		o2Scene.AddLayer("UI");

		auto camera = mmake<CameraActor>();
		camera->SetName("camera");
		camera->fillBackground = true;
		camera->fillColor = Color4(10, 10, 26, 255);
		camera->drawLayers.SetAllLayers();
		camera->SetFittedSize(Vec2F(kScreenWidth, kScreenHeight));
		camera->transform->pivot = Vec2F(0.5f, 0.5f); // world origin at the screen center

		auto game = mmake<Actor>();
		game->SetName("Game");
		game->transform->size = Vec2F(kScreenWidth, kScreenHeight);

		auto scriptable = game->AddComponent<ScriptableComponent>();
		scriptable->SetScript(o2Assets.GetAssetRefByType<JavaScriptAsset>(String("Scripts/SpaceEvolver.js")));

		return game;
	}

	void SaveBootstrapSceneIfMissing()
	{
		// Only where the source assets live: a packaged build (WebAssembly, mobile) ships the
		// built tree alone and has nowhere to save the authoring scene
		if (!o2FileSystem.IsFolderExist(o2Assets.GetAssetsPath()))
			return;

		auto path = o2Assets.GetAssetsPath() + "Bootstrap.scn";
		if (o2FileSystem.IsFileExist(path))
			return;

		// Freshly created actors reach the scene's root list only on the next frame's
		// added-entities pass; without it the saved scene would hold no actors at all
		o2Scene.UpdateAddedEntities();
		o2Scene.Save(path);
	}
}
