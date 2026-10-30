#include "o2/stdafx.h"
#include "GameApplication.h"

#include "o2/Assets/Assets.h"
#include "o2/Render/Render.h"
#include "o2/Scene/Scene.h"
#include "o2/Utils/Debug/Debug.h"
#include "o2libs/o2libs.h"

GameApplication::GameApplication(RefCounter* refCounter):
	Application(refCounter), mScenePath(GAME_START_SCENE)
{}

void GameApplication::OnStarted()
{
	PROFILE_SAMPLE_FUNC();

	{
		PROFILE_SAMPLE("Set window size");
		o2Application.SetWindowSize(Vec2I(GAME_WINDOW_WIDTH, GAME_WINDOW_HEIGHT));
	}

	{
		PROFILE_SAMPLE("Start o2libs");
		O2LIBS_START;
	}

	// The game is its start scene: the same scene the editor opens
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
	o2Application.windowCaption = String(GAME_TITLE) + "; FPS: " + (String)((int)o2Time.GetFPS());
}

void GameApplication::OnDraw()
{
	o2Render.camera = Camera::Default();
}
