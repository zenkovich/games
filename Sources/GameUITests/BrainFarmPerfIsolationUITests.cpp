#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include <chrono>
#include <mach/mach.h>

#include "o2/Application/Application.h"
#include "o2/Assets/Assets.h"
#include "o2/Assets/Types/ImageAsset.h"
#include "o2/Assets/Types/Mesh3DAsset.h"
#include "o2/Assets/Types/SkinnedModelAsset.h"
#include "o2/Render/Pipeline/Pipelines.h"
#include "o2/Render/Render.h"
#include "o2/Scene/Actor.h"
#include "o2/Scene/CameraActor.h"
#include "o2/Scene/Components/LightComponent.h"
#include "o2/Scene/Components/Mesh3DComponent.h"
#include "o2/Scene/Components/MeshPrimitiveComponent.h"
#include "o2/Scene/Components/SkinnedMeshComponent.h"
#include "o2/Scene/Scene.h"
#include "o2/Utils/Math/Math.h"
#include "o2/Utils/Test/AppTestDriver.h"

using namespace o2;

namespace
{
    size_t RssMb()
    {
        mach_task_basic_info info;
        mach_msg_type_number_t count = MACH_TASK_BASIC_INFO_COUNT;
        if (task_info(mach_task_self(), MACH_TASK_BASIC_INFO, (task_info_t)&info, &count) != KERN_SUCCESS)
            return 0;

        return info.resident_size/(1024*1024);
    }

    void Soak(const char* tag, int chunks, int frames, const Function<void(int frame)>& perFrame = {})
    {
        for (int i = 0; i < chunks; i++)
        {
            auto start = std::chrono::steady_clock::now();
            for (int f = 0; f < frames; f++)
            {
                if (perFrame)
                    perFrame(i*frames + f);

                AppTestDriver::PumpFrames(1);
            }
            auto ms = std::chrono::duration<float, std::milli>(std::chrono::steady_clock::now() - start).count()/frames;
            printf("%s %d: frame %6.2f ms | rss %4zu MB | dc %3d | prims %6d\n",
                   tag, i, ms, RssMb(), o2Render.GetDrawCallsCount(), o2Render.GetDrawnPrimitives());
            fflush(stdout);
        }
    }

    void BuildMinimal3DScene()
    {
        o2Scene.AddLayer("3D");

        auto camera = mmake<CameraActor>();
        camera->SetName("camera3d");
        camera->SetLayer("3D");
        camera->drawLayers.SetLayers(Vector<String>{ "3D" });
        camera->SetRenderPipeline(mmake<DeferredPipeline>());
        camera->SetPerspective(Math::Deg2rad(45.0f), 10.0f, 10000.0f);
        camera->transform->SetPosition(Vec3F(0, -560.0f, 720.0f));
        camera->transform->SetEulerAngles(Vec3F(Math::Deg2rad(38.0f), 0, 0));
        camera->fillColor = Color4(150, 200, 235);

        auto sun = mmake<Actor>(ActorCreateMode::InScene);
        sun->SetName("sun");
        sun->SetLayer("3D");
        auto light = sun->AddComponent<LightComponent>();
        light->SetLightType(LightComponent::Type::Directional);
        sun->transform->SetEulerAngles(Vec3F(Math::Deg2rad(35.0f), 0, Math::Deg2rad(25.0f)));

        auto ground = mmake<Actor>(ActorCreateMode::InScene);
        ground->SetName("ground");
        ground->SetLayer("3D");
        auto plane = ground->AddComponent<MeshPrimitiveComponent>();
        plane->SetPrimitiveType(PrimitiveType3D::Plane);
        plane->SetSize(Vec3F(2600, 3200, 0));
        plane->SetColor(Color4(122, 178, 92));
    }

    class BrainFarmPerfIsolation: public ::testing::Test
    {
    protected:
        void TearDown() override
        {
            o2Scene.Clear(true);
            o2Scene.UpdateDestroyingEntities();
            AppTestDriver::PumpFrames(2);
        }
    };

    TEST_F(BrainFarmPerfIsolation, EngineBaselinesAndSuspects)
    {
        o2Application.SetWindowSize(Vec2I(450, 800));
        BuildMinimal3DScene();
        AppTestDriver::PumpFrames(5);

        printf("multithreaded render: %d\n", (int)o2Render.IsMultithreadedRenderEnabled());

        // A: bare scene, nothing changes
        Soak("A bare        ", 3, 150);

        // B: static brains
        Vector<Ref<Actor>> brains;
        for (int i = 0; i < 12; i++)
        {
            auto brain = mmake<Actor>(ActorCreateMode::InScene);
            brain->SetName(String("brain") + (String)i);
            brain->SetLayer("3D");
            brain->transform->SetPosition(Vec3F(-250.0f + 50.0f*i, -100.0f, 30.0f));
            auto mesh = brain->AddComponent<Mesh3DComponent>();
            mesh->SetMeshAsset(o2Assets.GetAssetRefByType<Mesh3DAsset>(String("Models/Brain.obj")));
            mesh->SetTexture(o2Assets.GetAssetRefByType<ImageAsset>(String("Models/BrainPalette.png")));
            brains.Add(brain);
        }
        AppTestDriver::PumpFrames(5);
        Soak("B brains-static", 3, 150);

        // C: one brain rescales every frame (transform churn -> mesh rebuild)
        Soak("C brain-scale  ", 3, 150, [&](int frame)
        {
            float scale = 0.5f + 0.4f*Math::Sin(frame*0.05f);
            brains[0]->transform->SetScale(Vec3F(scale, scale, scale));
        });

        for (auto& brain : brains)
            brain->Destroy();
        o2Scene.UpdateDestroyingEntities();
        AppTestDriver::PumpFrames(5);

        // D: a skinned character playing a clip
        auto farmer = mmake<Actor>(ActorCreateMode::InScene);
        farmer->SetName("farmer");
        farmer->SetLayer("3D");
        farmer->transform->SetEulerAngles(Vec3F(Math::Deg2rad(90.0f), 0, 0));
        auto skinned = farmer->AddComponent<SkinnedMeshComponent>();
        skinned->SetModelAsset(o2Assets.GetAssetRefByType<SkinnedModelAsset>(String("Models/Farmer.glb")));
        skinned->SetTexture(o2Assets.GetAssetRefByType<ImageAsset>(String("Models/FarmerPalette.png")));
        skinned->SetLooped(true);
        skinned->SetAnimation("CharacterArmature|Run");
        skinned->SetPlaying(true);
        AppTestDriver::PumpFrames(5);
        Soak("D skinned      ", 3, 150);

        // E: same bare scene with the single-threaded render path
        farmer->Destroy();
        o2Scene.UpdateDestroyingEntities();
        o2Render.SetMultithreadedRenderEnabled(false);
        AppTestDriver::PumpFrames(5);
        Soak("E bare-st      ", 3, 150);

        // F: the leaking static brains again, but on the single-threaded path
        for (int i = 0; i < 12; i++)
        {
            auto brain = mmake<Actor>(ActorCreateMode::InScene);
            brain->SetName(String("stBrain") + (String)i);
            brain->SetLayer("3D");
            brain->transform->SetPosition(Vec3F(-250.0f + 50.0f*i, -100.0f, 30.0f));
            auto mesh = brain->AddComponent<Mesh3DComponent>();
            mesh->SetMeshAsset(o2Assets.GetAssetRefByType<Mesh3DAsset>(String("Models/Brain.obj")));
            mesh->SetTexture(o2Assets.GetAssetRefByType<ImageAsset>(String("Models/BrainPalette.png")));
        }
        AppTestDriver::PumpFrames(5);
        Soak("F brains-st    ", 3, 150);

        o2Render.SetMultithreadedRenderEnabled(true);
        AppTestDriver::PumpFrames(5);
    }
}
