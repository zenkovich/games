#pragma once

#include "o2/Scene/Component.h"

using namespace o2;

namespace dragon
{
    // Registers the global `Bridge` JS object of the Dragon Crashers port: scene switching, sound,
    // cursor in UI units, Spine playback and widget layer images. Idempotent
    void RegisterDragonJsApi();

    // First actor of every Dragon Crashers scene carries it: makes sure the JS API exists before the scripts start
    class DragonBootstrapComponent: public Component
    {
    public:
        SERIALIZABLE(DragonBootstrapComponent);
        CLONEABLE_REF(DragonBootstrapComponent);

    protected:
        void OnInitialized() override;

        REF_COUNTERABLE_IMPL(Component);
    };
}
// --- META ---

CLASS_BASES_META(dragon::DragonBootstrapComponent)
{
    BASE_CLASS(o2::Component);
}
END_META;
CLASS_FIELDS_META(dragon::DragonBootstrapComponent)
{
}
END_META;
CLASS_METHODS_META(dragon::DragonBootstrapComponent)
{

    FUNCTION().PROTECTED().SIGNATURE(void, OnInitialized);
}
END_META;
// --- END META ---
