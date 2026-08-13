#pragma once

#include "o2/Utils/Types/Ref.h"

namespace o2
{
	class Actor;
}

namespace space_evolver
{
	// Design resolution of the prototype; window and camera are fixed to it,
	// so world coordinates match screen coordinates (center (0,0), y up)
	constexpr int kScreenWidth = 540;
	constexpr int kScreenHeight = 960;

	// Builds the bootstrap scene in code: camera, layers and the "Game" actor
	// with the SpaceEvolver.js scriptable component. Returns the game actor
	o2::Ref<o2::Actor> BuildBootstrapScene();

	// Saves the freshly built scene as Assets/Bootstrap.scn for the editor, if not saved yet
	void SaveBootstrapSceneIfMissing();
}
