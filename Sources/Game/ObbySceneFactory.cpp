#include "o2/stdafx.h"
#include "ObbySceneFactory.h"

#include "ObbyGameComponent.h"
#include "o2/Scene/Actor.h"
#include "o2/Scene/CameraActor.h"
#include "o2/Scene/Scene.h"
#include "o2/Utils/FileSystem/FileSystem.h"
#include "o2/Utils/Serialization/DataValue.h"

namespace obby
{
	Ref<Actor> BuildBootstrapScene()
	{
		o2Scene.Clear(true);
		o2Scene.UpdateDestroyingEntities();

		auto camera = mmake<CameraActor>();
		camera->name = "camera";
		camera->SetFittedSize(Vec2F(1280.0f, 900.0f));
		camera->fillBackground = true;
		camera->fillColor = Color4(110, 190, 245, 255);

		auto game = mmake<Actor>(ActorCreateMode::InScene);
		game->name = "Game";
		game->AddComponent<ObbyGameComponent>();

		o2Scene.UpdateAddedEntities();

		// A camera made in code registers from the base Actor constructor, before its own
		// OnAddToScene exists; a round trip through the scene document adds it like a file load does
		DataDocument doc;
		o2Scene.Save(doc);
		o2Scene.Clear(true);
		o2Scene.UpdateDestroyingEntities();
		o2Scene.Load(doc);
		o2Scene.UpdateAddedEntities();

		return o2Scene.FindActor("Game");
	}

	bool SaveBootstrapScene(const String& path)
	{
		BuildBootstrapScene();
		o2Scene.Save(path);
		return o2FileSystem.IsFileExist(path);
	}
}
