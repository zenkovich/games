#pragma once

#include "o2/Utils/Types/Ref.h"
#include "o2/Utils/Types/String.h"

using namespace o2;

namespace o2
{
	class Actor;
}

namespace obby
{
	const char* const kSceneName = "PotatoObby.scn";

	// Clears the scene and builds the bootstrap scene: a fitted 1280x720 camera and the "Game" actor
	// with ObbyGameComponent. Returns the game actor
	Ref<Actor> BuildBootstrapScene();

	// Builds the bootstrap scene and writes it to the path
	bool SaveBootstrapScene(const String& path);
}
