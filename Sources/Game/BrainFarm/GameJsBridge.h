#pragma once

namespace brain_farm
{
    // Registers the global `Bridge` JS object: input, screen, 3D helpers (animation
    // switching, template spawning, world-to-screen projection), styled UI widgets,
    // module loading and logging. The JS game code is built on top of it
    void RegisterGameJsApi();
}
