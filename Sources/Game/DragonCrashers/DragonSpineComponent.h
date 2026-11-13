#pragma once

#include "o2/Scene/Components/SpineComponent.h"

using namespace o2;

namespace dragon
{
    // Spine character of the battle: the battle's time scale (pause ramp, victory slow motion) applies to the skeleton
    class DragonSpineComponent: public SpineComponent
    {
    public:
        float timeScale = 1.0f; // Playback speed multiplier @SERIALIZABLE @EDITOR_PROPERTY

    public:
        SERIALIZABLE(DragonSpineComponent);
        CLONEABLE_REF(DragonSpineComponent);

    protected:
        void OnUpdate(float dt) override;
    };
}
// --- META ---

CLASS_BASES_META(dragon::DragonSpineComponent)
{
    BASE_CLASS(o2::SpineComponent);
}
END_META;
CLASS_FIELDS_META(dragon::DragonSpineComponent)
{
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(1.0f).NAME(timeScale);
}
END_META;
CLASS_METHODS_META(dragon::DragonSpineComponent)
{

    FUNCTION().PROTECTED().SIGNATURE(void, OnUpdate, float);
}
END_META;
// --- END META ---
