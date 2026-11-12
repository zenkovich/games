#include "o2/stdafx.h"
#include "GameApplication.h"

#include "Physics3DDemo.h"
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
	o2Application.SetWindowSize(Vec2I(1280, 800));

	O2LIBS_START;

	// The main scene shows a deferred 3D layer with a 2D overlay on top;
	// the same scene is opened by the editor
	o2Scene.Load(o2Assets.GetBuiltAssetsPath() + mScenePath);

	// Example of the 3D physics API (Box3D): drops a few bodies onto the ground plane
	demo::SpawnPhysics3DDemo();
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
	o2Application.windowCaption = String("o2 Template") +
		"; FPS: " + (String)((int)o2Time.GetFPS());
}

void GameApplication::OnDraw()
{
	o2Render.camera = Camera::Default();
}
