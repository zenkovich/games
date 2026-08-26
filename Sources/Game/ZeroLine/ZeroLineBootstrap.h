#pragma once

#include "o2/Utils/Types/Ref.h"
#include "o2/Utils/Types/String.h"

namespace o2
{
    class Actor;
}

namespace zero_line
{
    // UI design resolution; the 2D camera is fitted to it, world origin at the screen center
    constexpr int kScreenWidth = 540;
    constexpr int kScreenHeight = 960;

    // Builds the bootstrap scene in code: the fitted 2D camera and the "Game" actor carrying
    // the ZeroLineHost component (JS API) and the ZeroLine.js scriptable component that
    // creates the whole interface at runtime. Returns the "Game" actor
    o2::Ref<o2::Actor> BuildBootstrapScene();

    // Saves the current scene as the bootstrap scene asset (flushes freshly added actors first)
    void SaveBootstrapScene(const o2::String& path);

    // Saves the freshly built scene as Assets/Bootstrap.scn for the editor, if not saved yet
    void SaveBootstrapSceneIfMissing();
}
