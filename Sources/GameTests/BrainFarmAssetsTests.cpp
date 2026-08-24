#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "o2/Assets/Assets.h"
#include "o2/Assets/Types/Mesh3DAsset.h"
#include "o2/Assets/Types/SkinnedModelAsset.h"
#include "o2/Utils/Math/AABB.h"

using namespace o2;

namespace
{
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
            { "Models/Stand.obj", 100.0f, 300.0f },
            { "Models/Dirt.obj", 80.0f, 250.0f },
            { "Models/Fence.obj", 300.0f, 700.0f },
            { "Models/PineTrunk.obj", 200.0f, 800.0f },
            { "Models/PineLeaves.obj", 200.0f, 800.0f },
            { "Models/Bat.obj", 30.0f, 120.0f },
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
            float maxDimension = Math::Max(size.x, Math::Max(size.y, size.z));
            EXPECT_GT(maxDimension, expected.minSize) << expected.path;
            EXPECT_LT(maxDimension, expected.maxSize) << expected.path;
        }
    }

    TEST(BrainFarmAssets, CharactersParseWithAnimations)
    {
        auto farmer = o2Assets.GetAssetRefByType<SkinnedModelAsset>(String("Models/Farmer.glb"));
        ASSERT_TRUE(farmer);
        auto& farmerData = farmer->GetModelData();
        EXPECT_GT(farmerData.positions.Count(), 1000);
        EXPECT_EQ(farmerData.joints.Count(), 62);
        EXPECT_GE(farmerData.FindAnimation("CharacterArmature|Idle"), 0);
        EXPECT_GE(farmerData.FindAnimation("CharacterArmature|Run"), 0);

        auto zombie = o2Assets.GetAssetRefByType<SkinnedModelAsset>(String("Models/Zombie.glb"));
        ASSERT_TRUE(zombie);
        auto& zombieData = zombie->GetModelData();
        EXPECT_GT(zombieData.positions.Count(), 1000);
        EXPECT_GE(zombieData.FindAnimation("Zombie|ZombieWalk"), 0);
        EXPECT_GE(zombieData.FindAnimation("Zombie|ZombieIdle"), 0);
    }
}
