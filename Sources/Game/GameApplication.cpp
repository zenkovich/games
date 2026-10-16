#include "o2/stdafx.h"
#include "GameApplication.h"

#include "ObbySceneFactory.h"
#include "o2/Assets/Assets.h"
#include "o2/Render/Render.h"
#include "o2/Scene/Scene.h"
#include "o2/Utils/Debug/Debug.h"
#include "o2/Utils/FileSystem/FileSystem.h"

GameApplication::GameApplication(RefCounter* refCounter):
	Application(refCounter)
{}

void GameApplication::OnStarted()
{
	o2Application.SetWindowSize(Vec2I(1280, 900));

	// The game is its bootstrap scene, the same one the editor opens; a missing built scene
	// (fresh checkout before the assets build) is replaced by the one the factory builds in memory
	String scenePath = o2Assets.GetBuiltAssetsPath() + String(obby::kSceneName);
	if (o2FileSystem.IsFileExist(scenePath))
		o2Scene.Load(scenePath);
	else
		obby::BuildBootstrapScene();
}

void GameApplication::OnUpdate(float dt)
{
	o2Application.windowCaption = String("Potato Obby") +
		"; FPS: " + (String)((int)o2Time.GetFPS());
}

void GameApplication::OnDraw()
{
	o2Render.camera = Camera::Default();
}
