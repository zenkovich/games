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

	// Scene the game starts with, relative to the built assets
	const String& GetScenePath() const;

protected:
	// Called when application is starting
	void OnStarted() override;

	// Called on updating
	void OnUpdate(float dt) override;

	// Called on drawing
	void OnDraw() override;

protected:
	String mScenePath = "Main.scn"; // Scene loaded on start and on restart
};
