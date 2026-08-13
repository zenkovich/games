#include "o2/stdafx.h"
#include "GameApplication.h"

#include "SpaceEvolver/GameJsBridge.h"
#include "SpaceEvolver/SpaceEvolverBootstrap.h"
#include "o2/Render/Render.h"
#include "o2/Utils/Debug/Debug.h"

GameApplication::GameApplication(RefCounter* refCounter):
	Application(refCounter)
{}

void GameApplication::OnStarted()
{
	o2Application.SetWindowSize(Vec2I(space_evolver::kScreenWidth, space_evolver::kScreenHeight));

	space_evolver::RegisterGameJsApi();
	space_evolver::BuildBootstrapScene();
	space_evolver::SaveBootstrapSceneIfMissing();
}

void GameApplication::OnUpdate(float dt)
{
	o2Application.windowCaption = String("Space Evolver: Galaxy Core") +
		"; FPS: " + (String)((int)o2Time.GetFPS());
}

void GameApplication::OnDraw()
{
	o2Render.camera = Camera::Default();
}
