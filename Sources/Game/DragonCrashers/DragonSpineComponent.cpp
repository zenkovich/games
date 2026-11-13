#include "o2/stdafx.h"
#include "DragonSpineComponent.h"

namespace dragon
{
    void DragonSpineComponent::OnUpdate(float dt)
    {
        SpineComponent::OnUpdate(dt*timeScale);
    }
}
// --- META ---

DECLARE_CLASS(dragon::DragonSpineComponent, dragon__DragonSpineComponent);
// --- END META ---
