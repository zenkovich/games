#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "o2/Assets/Assets.h"
#include "o2/Assets/Types/Mesh3DAsset.h"
#include "o2/Assets/Types/SkinnedModelAsset.h"
#include "o2/Utils/Math/AABB.h"
#include "BrainFarm/FarmMeshComponent.h"
#include "o2/Scene/Actor.h"
#include "Scene/SceneTestHelpers.h"

using namespace o2;

namespace
{
    class InspectableFarmMeshComponent: public brain_farm::FarmMeshComponent
    {
    public:
        bool HasCachedBounds() const { return mBoundsValid; }
    };

    Vec3F MeshSize(const AssetRef<Mesh3DAsset>& mesh)
    {
        Vec3F lo(FLT_MAX, FLT_MAX, FLT_MAX), hi(-FLT_MAX, -FLT_MAX, -FLT_MAX);
        for (auto& v : mesh->vertices)
        {
            lo.x = Math::Min(lo.x, v.x); lo.y = Math::Min(lo.y, v.y); lo.z = Math::Min(lo.z, v.z);
            hi.x = Math::Max(hi.x, v.x); hi.y = Math::Max(hi.y, v.y); hi.z = Math::Max(hi.z, v.z);
        }
        return hi - lo;
    }

    TEST(BrainFarmAssets, StaticMeshesLoadWithSaneSizes)
    {
        struct Expected { const char* path; float minSize, maxSize; };
        const Expected meshes[] = {
            { "Models/Brain.obj", 20.0f, 100.0f },
            { "Models/SahurStand.obj", 100.0f, 300.0f },
            { "Models/GardenBed.obj", 1000.0f, 1800.0f },
            { "Models/FarmGround.obj", 2000.0f, 3000.0f },
            { "Models/FarmDecor.obj", 2400.0f, 4000.0f },
        };

        for (auto& expected : meshes)
        {
            auto mesh = o2Assets.GetAssetRefByType<Mesh3DAsset>(String(expected.path));
            ASSERT_TRUE(mesh) << expected.path;
            EXPECT_GT(mesh->vertices.Count(), 0) << expected.path;
            EXPECT_GT(mesh->indices.Count(), 0) << expected.path;
            EXPECT_EQ(mesh->normals.Count(), mesh->vertices.Count()) << expected.path;
            EXPECT_EQ(mesh->uvs.Count(), mesh->vertices.Count()) << expected.path;

            Vec3F size = MeshSize(mesh);
            if (String(expected.path) == "Models/SahurStand.obj")
                EXPECT_LT(size.z, 115.0f) << "Counter canopy must not cover the stock";
            float maxDimension = Math::Max(size.x, Math::Max(size.y, size.z));
            EXPECT_GT(maxDimension, expected.minSize) << expected.path;
            EXPECT_LT(maxDimension, expected.maxSize) << expected.path;
        }
    }

    TEST(BrainFarmAssets, CharactersParseWithAnimations)
    {
        auto zombie = o2Assets.GetAssetRefByType<SkinnedModelAsset>(String("Models/Zombie.glb"));
        ASSERT_TRUE(zombie);
        auto& zombieData = zombie->GetModelData();
        EXPECT_GT(zombieData.positions.Count(), 1000);
        EXPECT_GE(zombieData.FindAnimation("Zombie|ZombieWalk"), 0);
        EXPECT_GE(zombieData.FindAnimation("Zombie|ZombieIdle"), 0);
    }

    TEST(BrainFarmAssets, SahurFitsPlayableBudgetAndHasLocomotion)
    {
        auto model = o2Assets.GetAssetRefByType<SkinnedModelAsset>(String("Models/Sahur.glb"));
        ASSERT_TRUE(model);
        const auto& data = model->GetModelData();
        EXPECT_GT(data.positions.Count(), 1000);
        EXPECT_LT(data.positions.Count(), 22000);
        EXPECT_EQ(data.joints.Count(), 10);
        EXPECT_GE(data.FindAnimation("CharacterArmature|Idle"), 0);
        EXPECT_GE(data.FindAnimation("CharacterArmature|Run"), 0);
        EXPECT_EQ(data.normals.Count(), data.positions.Count());
        EXPECT_EQ(data.uvs.Count(), data.positions.Count());
    }
    TEST(BrainFarmAssets, CachedBoundsFollowTransformsAndMeshChanges)
    {
        SceneCleanGuard guard;
        auto actor = mmake<Actor>(ActorCreateMode::InScene);
        auto mesh = actor->AddComponent<brain_farm::FarmMeshComponent>();
        mesh->SetShaded(false);
        mesh->SetMeshAsset(o2Assets.GetAssetRefByType<Mesh3DAsset>(String("Models/Brain.obj")));
        AABB before, cached, moved;
        ASSERT_TRUE(mesh->Get3DDrawableBounds(before));
        ASSERT_TRUE(mesh->Get3DDrawableBounds(cached));
        EXPECT_EQ(before, cached);
        actor->transform->SetPosition(Vec3F(170, -90, 25));
        actor->transform->SetScale(Vec3F(2, 2, 2));
        TickFrames(2, .016f);
        ASSERT_TRUE(mesh->Get3DDrawableBounds(moved));
        EXPECT_NEAR(moved.min.x, before.min.x*2+170, .01f);
        EXPECT_NEAR(moved.max.y, before.max.y*2-90, .01f);
        EXPECT_NEAR(moved.max.z, before.max.z*2+25, .01f);
        mesh->SetMeshAsset(o2Assets.GetAssetRefByType<Mesh3DAsset>(String("Models/GardenBed.obj")));
        ASSERT_TRUE(mesh->Get3DDrawableBounds(moved));
        EXPECT_GT(moved.GetSize().y, 2500);
    }

    TEST(BrainFarmAssets, RedundantEditorTransformRefreshKeepsMeshCache)
    {
        SceneCleanGuard guard;
        auto actor = mmake<Actor>(ActorCreateMode::InScene);
        auto mesh = mmake<InspectableFarmMeshComponent>();
        actor->AddComponent(mesh);
        mesh->SetShaded(false);
        mesh->SetMeshAsset(o2Assets.GetAssetRefByType<Mesh3DAsset>(String("Models/Brain.obj")));

        actor->UpdateSelfTransform();
        AABB bounds;
        ASSERT_TRUE(mesh->Get3DDrawableBounds(bounds));
        ASSERT_TRUE(mesh->HasCachedBounds());

        // Editor edit mode invokes this even for an unchanged transform.
        actor->UpdateSelfTransform();
        EXPECT_TRUE(mesh->HasCachedBounds());

        actor->transform->SetPosition(Vec3F(10, 20, 30));
        actor->UpdateSelfTransform();
        EXPECT_FALSE(mesh->HasCachedBounds());
    }

    TEST(BrainFarmAssets, CullingKeepsPartialAndNearPlaneIntersections)
    {
        using brain_farm::FarmMeshComponent;
        auto perspective = Mat4::Perspective(Math::Deg2rad(60.0f), 1, 1, 100);
        EXPECT_TRUE(FarmMeshComponent::IntersectsView(AABB(Vec3F(-1,-1,-11), Vec3F(1,1,-9)), perspective));
        EXPECT_TRUE(FarmMeshComponent::IntersectsView(AABB(Vec3F(4,-1,-11), Vec3F(8,1,-9)), perspective));
        EXPECT_TRUE(FarmMeshComponent::IntersectsView(AABB(Vec3F(-1,-1,-2), Vec3F(1,1,1)), perspective));
        EXPECT_FALSE(FarmMeshComponent::IntersectsView(AABB(Vec3F(20,-1,-11), Vec3F(22,1,-9)), perspective));
        EXPECT_FALSE(FarmMeshComponent::IntersectsView(AABB(Vec3F(-1,-1,9), Vec3F(1,1,11)), perspective));
        EXPECT_FALSE(FarmMeshComponent::IntersectsView(AABB(Vec3F(-1,-1,-120), Vec3F(1,1,-110)), perspective));
        auto shadow = Mat4::Ortho(-5,5,-5,5,1,100);
        EXPECT_TRUE(FarmMeshComponent::IntersectsView(AABB(Vec3F(4,-1,-11), Vec3F(8,1,-9)), shadow));
        EXPECT_FALSE(FarmMeshComponent::IntersectsView(AABB(Vec3F(6,-1,-11), Vec3F(8,1,-9)), shadow));
    }

}
