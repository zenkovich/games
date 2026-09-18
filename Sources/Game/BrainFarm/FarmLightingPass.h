#pragma once

#include "o2/Render/Pipeline/DeferredPasses.h"

namespace brain_farm
{
    using o2::Ref;
    class FarmLightingPass: public o2::DeferredLightingPass
    {
    public:
        void Execute(o2::RenderPassContext& context) override;
        void SetColorCorrectionEnabled(bool enabled);
        bool IsColorCorrectionReady() const;

        SERIALIZABLE(FarmLightingPass);
        CLONEABLE_REF(FarmLightingPass);

    protected:
        bool mColorCorrectionEnabled = true; // @SERIALIZABLE
        bool mColorCorrectionReady = false;
    };
}
// --- META ---

CLASS_BASES_META(brain_farm::FarmLightingPass)
{
    BASE_CLASS(o2::DeferredLightingPass);
}
END_META;
CLASS_FIELDS_META(brain_farm::FarmLightingPass)
{
    FIELD().PROTECTED().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(true).NAME(mColorCorrectionEnabled);
    FIELD().PROTECTED().DEFAULT_VALUE(false).NAME(mColorCorrectionReady);
}
END_META;
CLASS_METHODS_META(brain_farm::FarmLightingPass)
{

    FUNCTION().PUBLIC().SIGNATURE(void, Execute, o2::RenderPassContext&);
    FUNCTION().PUBLIC().SIGNATURE(void, SetColorCorrectionEnabled, bool);
    FUNCTION().PUBLIC().SIGNATURE(bool, IsColorCorrectionReady);
}
END_META;
// --- END META ---
