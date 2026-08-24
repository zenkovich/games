#pragma once

#include "o2/Application/Application.h"

using namespace o2;

class GameApplication: public Application
{
public:
	GameApplication(RefCounter* refCounter);

protected:
	// Called when application is starting
	void OnStarted() override;

	// Called on updating
	void OnUpdate(float dt) override;

	// Called on drawing
	void OnDraw() override;

private:
	float mPerfLogTimer = 0.0f;
};
