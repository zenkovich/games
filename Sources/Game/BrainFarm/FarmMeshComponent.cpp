#include "o2/stdafx.h"
#include "FarmMeshComponent.h"
#include "o2/Render/Render.h"
#include "o2/Scene/Actor.h"

namespace brain_farm
{
    FarmMeshComponent::FarmMeshComponent(const FarmMeshComponent& other):
        o2::Mesh3DComponent(other)
    {}

    bool FarmMeshComponent::Get3DDrawableBounds(o2::AABB& bounds)
    {
        // Avoid rescanning static crop vertices for shadow bounds.
        if (!mBoundsValid || mNeedRebuildMesh || mBoundsAsset != mMeshAsset)
        {
            mBoundsValid = o2::Mesh3DComponent::Get3DDrawableBounds(mCachedBounds);
            mBoundsAsset = mMeshAsset;
        }
        bounds = mCachedBounds;
        return mBoundsValid;
    }

    void FarmMeshComponent::OnTransformUpdated()
    {
        o2::Mat4 worldTransform;
        if (auto owner = mOwner.Lock())
            worldTransform = owner->transform->GetWorldTransform3D();

        bool changed = !mWorldTransformValid;
        if (!changed)
        {
            for (int i = 0; i < 16; i++)
            {
                if (worldTransform.m[i] != mLastWorldTransform.m[i])
                {
                    changed = true;
                    break;
                }
            }
        }

        // Ignore redundant editor transform notifications.
        if (!changed)
            return;

        mLastWorldTransform = worldTransform;
        mWorldTransformValid = true;
        mBoundsValid = false;
        o2::Mesh3DComponent::OnTransformUpdated();
    }

    void FarmMeshComponent::OnDraw()
    {
        if (mNeedRebuildMesh)
            mBoundsValid = false;

        static o2::Camera previousCamera;
        static o2::Vec2I previousResolution;
        static o2::Mat4 viewProjection;
        auto camera = o2Render.GetCamera();
        auto resolution = o2Render.GetCurrentResolution();
        if (camera != previousCamera || resolution != previousResolution)
        {
            viewProjection = camera.GetProjectionMatrix((o2::Vec2F)resolution)*camera.GetViewMatrix3D();
            previousCamera = camera;
            previousResolution = resolution;
        }
        o2::AABB bounds;
        if (Get3DDrawableBounds(bounds) && !IntersectsView(bounds, viewProjection))
            return;
        o2::Mesh3DComponent::OnDraw();
    }

    bool FarmMeshComponent::IntersectsView(const o2::AABB& bounds, const o2::Mat4& matrix)
    {
        for (int axis = 0; axis < 3; axis++)
            for (float sign : {-1.0f, 1.0f})
            {
                float a = matrix.At(3, 0) + sign*matrix.At(axis, 0);
                float b = matrix.At(3, 1) + sign*matrix.At(axis, 1);
                float c = matrix.At(3, 2) + sign*matrix.At(axis, 2);
                float d = matrix.At(3, 3) + sign*matrix.At(axis, 3);
                float x = a >= 0 ? bounds.max.x : bounds.min.x;
                float y = b >= 0 ? bounds.max.y : bounds.min.y;
                float z = c >= 0 ? bounds.max.z : bounds.min.z;
                if (a*x + b*y + c*z + d < -0.001f)
                    return false;
            }
        return true;
    }
}
// --- META ---

DECLARE_CLASS(brain_farm::FarmMeshComponent, brain_farm__FarmMeshComponent);
// --- END META ---
