#pragma once

#include "o2/Application/Application.h"

using namespace o2;

class GameApplication: public Application
{
public:
	GameApplication(RefCounter* refCounter);

	// Reloads the scene from scratch, as if the game had just started. The web
	// preview restarts the client this way after the assets were rebuilt
	void Restart();

	// Scene the game starts with, for the tools that report what is open
	const String& GetScenePath() const;

protected:
	// Called when application is starting
	void OnStarted() override;

	// Called on updating
	void OnUpdate(float dt) override;

	// Called on drawing
	void OnDraw() override;

protected:
	String mScenePath; // What the game starts with, and restarts into (GameInfo.json startScene)

	float mSpeed = 1.0f;         // Game time per real time, set by O2_GAME_SPEED: tools watch a bot play faster
	double mLastFrameTime = 0.0; // When the previous frame was updated, seconds of the steady clock
};
