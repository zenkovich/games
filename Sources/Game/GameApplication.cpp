#include "o2/stdafx.h"
#include "GameApplication.h"

#include "ColorTownGame.h"

#include "o2/Assets/Assets.h"
#include "o2/Render/Render.h"
#include "o2/Scene/Scene.h"
#include "o2/Utils/Debug/Debug.h"

GameApplication::GameApplication(RefCounter* refCounter):
	Application(refCounter)
{}

void GameApplication::OnStarted()
{
	o2Application.SetWindowSize(Vec2I(540, 960));

	// The bootstrap scene carries the ColorTownGame component that builds the whole game;
	// the same scene played in the editor runs the game there
	ColorTownGame::savePath = "ColorTownSave.json";
	o2Scene.Load(o2Assets.GetBuiltAssetsPath() + String("Bootstrap.scn"));
}

void GameApplication::OnUpdate(float dt)
{
	o2Application.windowCaption = String("Color Town") +
		"; FPS: " + (String)((int)o2Time.GetFPS());
}

void GameApplication::OnDraw()
{
	o2Render.camera = Camera::Default();
}
