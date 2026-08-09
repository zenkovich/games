#include "o2/stdafx.h"
#include "GameApplication.h"

#include "WordFall/WordFallBootstrap.h"
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
	o2Application.SetWindowSize(Vec2I(1280, 800));

	// Word Fall builds its scene in code from the bootstrap component; the saved
	// bootstrap scene keeps the editor entry point equal to the game one
	String scenePath = o2Assets.GetAssetsPath() + String("WordFall.scn");
	if (!o2FileSystem.IsFileExist(scenePath))
		WordFallBootstrap::SaveBootstrapScene(scenePath);
	else
		WordFallBootstrap::CreateBootstrapActor();
}

void GameApplication::OnUpdate(float dt)
{
	o2Application.windowCaption = String("Word Fall") +
		"; FPS: " + (String)((int)o2Time.GetFPS());
}

void GameApplication::OnDraw()
{
	o2Render.camera = Camera::Default();
}
