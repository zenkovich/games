#include "o2/stdafx.h"
#include "GameApplication.h"

#include "ZeroLine/GameJsBridge.h"
#include "ZeroLine/ZeroLineBootstrap.h"
#include "o2/Assets/Assets.h"
#include "o2/Render/Render.h"
#include "o2/Scene/Scene.h"
#include "o2/Utils/FileSystem/FileSystem.h"

GameApplication::GameApplication(RefCounter* refCounter):
	Application(refCounter)
{}

void GameApplication::OnStarted()
{
	// Portrait window emulates the mobile aspect on desktop
	o2Application.SetWindowSize(Vec2I(450, 800));

	zero_line::RegisterGameJsApi();

	// The bootstrap scene is the same one the editor opens; a fresh checkout without the
	// built asset gets the scene assembled in code and saved for the editor
	auto scenePath = o2Assets.GetBuiltAssetsPath() + String("Bootstrap.scn");
	if (o2FileSystem.IsFileExist(scenePath))
		o2Scene.Load(scenePath);
	else
	{
		zero_line::BuildBootstrapScene();
		zero_line::SaveBootstrapSceneIfMissing();
	}
}

void GameApplication::OnUpdate(float dt)
{
	o2Application.windowCaption = String("Zero Line") +
		"; FPS: " + (String)((int)o2Time.GetFPS());
}

void GameApplication::OnDraw()
{
	o2Render.camera = Camera::Default();
}
