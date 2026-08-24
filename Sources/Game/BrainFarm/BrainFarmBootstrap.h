#pragma once

#include "o2/Utils/Types/Ref.h"

namespace o2
{
    class Actor;
}

namespace brain_farm
{
    // UI design resolution; the 2D camera is fitted to it, world origin at the screen center
    constexpr int kScreenWidth = 540;
    constexpr int kScreenHeight = 960;

    // World scale: engine convention (demo scenes, physics, editor 3D navigation) is
    // ~100 units per meter; characters stand ~180 units tall
    constexpr float kUnitsPerMeter = 100.0f;

    // Builds the whole game scene in code: 3D layer (perspective camera with deferred
    // pipeline and shadows, sun, farm location, plantations, market stand, player and
    // the zombie template) plus the 2D UI camera. Returns the "Game" actor carrying
    // the BrainFarm.js scriptable component
    o2::Ref<o2::Actor> BuildBootstrapScene();

    // Saves the freshly built scene as Assets/Bootstrap.scn for the editor, if not saved yet
    void SaveBootstrapSceneIfMissing();
}
