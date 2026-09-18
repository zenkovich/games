#pragma once

#include "o2/Scene/Components/Mesh3DComponent.h"

namespace brain_farm
{
    using o2::Ref;
    class FarmMeshComponent: public o2::Mesh3DComponent
    {
    public:
        FarmMeshComponent() = default;
        FarmMeshComponent(const FarmMeshComponent& other);
        bool Get3DDrawableBounds(o2::AABB& bounds) override;
        static bool IntersectsView(const o2::AABB& bounds, const o2::Mat4& viewProjection);

        SERIALIZABLE(FarmMeshComponent);
        CLONEABLE_REF(FarmMeshComponent);

    protected:
        o2::AABB mCachedBounds;
        o2::AssetRef<o2::Mesh3DAsset> mBoundsAsset;
        o2::Mat4 mLastWorldTransform;
        bool mBoundsValid = false;
        bool mWorldTransformValid = false;

        void OnTransformUpdated() override;
        void OnDraw() override;
    };
}
// --- META ---

CLASS_BASES_META(brain_farm::FarmMeshComponent)
{
    BASE_CLASS(o2::Mesh3DComponent);
}
END_META;
CLASS_FIELDS_META(brain_farm::FarmMeshComponent)
{
    FIELD().PROTECTED().NAME(mCachedBounds);
    FIELD().PROTECTED().NAME(mBoundsAsset);
    FIELD().PROTECTED().NAME(mLastWorldTransform);
    FIELD().PROTECTED().DEFAULT_VALUE(false).NAME(mBoundsValid);
    FIELD().PROTECTED().DEFAULT_VALUE(false).NAME(mWorldTransformValid);
}
END_META;
CLASS_METHODS_META(brain_farm::FarmMeshComponent)
{

    FUNCTION().PUBLIC().CONSTRUCTOR();
    FUNCTION().PUBLIC().CONSTRUCTOR(const FarmMeshComponent&);
    FUNCTION().PUBLIC().SIGNATURE(bool, Get3DDrawableBounds, o2::AABB&);
    FUNCTION().PUBLIC().SIGNATURE_STATIC(bool, IntersectsView, const o2::AABB&, const o2::Mat4&);
    FUNCTION().PROTECTED().SIGNATURE(void, OnTransformUpdated);
    FUNCTION().PROTECTED().SIGNATURE(void, OnDraw);
}
END_META;
// --- END META ---
