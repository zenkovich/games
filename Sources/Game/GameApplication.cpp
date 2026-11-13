#include "o2/stdafx.h"
#include "GameApplication.h"

#include "DragonCrashers/DragonBridge.h"
#include "o2/Assets/Assets.h"
#include "o2/Render/Render.h"
#include "o2/Scene/Scene.h"
#include "o2/Utils/Debug/Debug.h"
#include "o2libs/o2libs.h"

GameApplication::GameApplication(RefCounter* refCounter):
	Application(refCounter)
{}

void GameApplication::OnStarted()
{
	o2Application.SetWindowSize(Vec2I(1600, 900));

	O2LIBS_START;

	// Dragon Crashers (port of the Unity UI Toolkit sample): the main menu scene, the same one the editor opens
	dragon::RegisterDragonJsApi();
	o2Scene.Load(o2Assets.GetBuiltAssetsPath() + mScenePath);
}

const String& GameApplication::GetScenePath() const
{
	return mScenePath;
}

void GameApplication::Restart()
{
	o2Scene.Clear();
	OnStarted();
}

void GameApplication::OnUpdate(float dt)
{
	o2Application.windowCaption = String("Dragon Crashers (o2 port)") +
		"; FPS: " + (String)((int)o2Time.GetFPS());
}

void GameApplication::OnDraw()
{
	o2Render.camera = Camera::Default();
}
