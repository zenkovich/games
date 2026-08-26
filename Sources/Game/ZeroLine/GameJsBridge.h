#pragma once

namespace zero_line
{
    // Registers the global `Bridge` JS object: pointer input, screen size, styled widgets
    // (labels, buttons, number tiles), best-score storage, module loading and logging.
    // Idempotent: the game application and the scene host component both call it
    void RegisterGameJsApi();
}
