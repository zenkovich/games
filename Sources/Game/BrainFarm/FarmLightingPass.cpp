#include "o2/stdafx.h"
#include "FarmLightingPass.h"

#include "o2/Assets/Assets.h"
#include "o2/Assets/Types/FragmentShaderAsset.h"

using namespace o2;

namespace brain_farm
{
    void FarmLightingPass::Execute(RenderPassContext& context)
    {
        if (!mColorCorrectionReady)
        {
            if (!EnsureResources())
                return;

            auto shader = o2Assets.GetAssetRefByType<FragmentShaderAsset>(String("Shaders/FarmLighting.frag"));
            if (!shader || !shader->GetShader() || !shader->GetShader()->IsReady())
                return;

            mMaterial->SetFragmentShader(shader->GetShader());
            mMaterial->AddParam(mmake<ShaderParamFloat>("u_grade", 1.0f));
            mMaterial->Build();
            mColorCorrectionReady = mMaterial->IsReady();
        }

        DynamicCast<ShaderParamFloat>(mMaterial->GetShaderParam("u_grade"))->SetValue(mColorCorrectionEnabled ? 1.0f : 0.0f);
        DeferredLightingPass::Execute(context);
    }

    void FarmLightingPass::SetColorCorrectionEnabled(bool enabled)
    {
        mColorCorrectionEnabled = enabled;
    }

    bool FarmLightingPass::IsColorCorrectionReady() const
    {
        return mColorCorrectionReady;
    }
}
// --- META ---

DECLARE_CLASS(brain_farm::FarmLightingPass, brain_farm__FarmLightingPass);
// --- END META ---
