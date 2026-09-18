#include "o2/stdafx.h"
#include "BrainFarmBootstrap.h"
#include "FarmLightingPass.h"
#include "FarmMeshComponent.h"

#include "o2/Assets/Assets.h"
#include "o2/Assets/Types/ImageAsset.h"
#include "o2/Assets/Types/JavaScriptAsset.h"
#include "o2/Assets/Types/Mesh3DAsset.h"
#include "o2/Assets/Types/SkinnedModelAsset.h"
#include "o2/Integration.h"
#include "o2/Render/Pipeline/Pipelines.h"
#include "o2/Render/Pipeline/DeferredPasses.h"
#include "o2/Scene/Actor.h"
#include "o2/Scene/CameraActor.h"
#include "o2/Scene/Components/LightComponent.h"
#include "o2/Scene/Components/Mesh3DComponent.h"
#include "o2/Scene/Components/MeshPrimitiveComponent.h"
#include "o2/Scene/Components/ScriptableComponent.h"
#include "o2/Scene/Components/SkinnedMeshComponent.h"
#include "o2/Scene/Scene.h"
#include "o2/Utils/FileSystem/FileSystem.h"
#include "o2/Utils/Math/Math.h"

using namespace o2;

namespace brain_farm
{
    static Ref<Actor> MakeActor(const Ref<Actor>& parent, const String& name, const Vec3F& position,
                                float yawDegrees = 0.0f)
    {
        auto actor = parent ? mmake<Actor>() : mmake<Actor>(ActorCreateMode::InScene);
        actor->SetName(name);
        if (parent)
            parent->AddChild(actor);

        actor->SetLayer("3D");
        actor->transform->SetPosition(position);
        actor->transform->SetEulerAngles(Vec3F(0, 0, Math::Deg2rad(yawDegrees)));
        return actor;
    }

    static void AddMesh(const Ref<Actor>& actor, const String& meshPath, const String& texturePath)
    {
        auto mesh = actor->AddComponent<FarmMeshComponent>();
        mesh->SetShaded(false);
        mesh->SetMeshAsset(o2Assets.GetAssetRefByType<Mesh3DAsset>(meshPath));

        // Headless test runs have no render device, a texture reference would crash there
        if (!Integration::IsHeadless() && !texturePath.IsEmpty())
            mesh->SetTexture(o2Assets.GetAssetRefByType<ImageAsset>(texturePath));
    }

    static Ref<Actor> MakeStatic(const Ref<Actor>& parent, const String& name, const String& meshPath,
                                 const String& texturePath, const Vec3F& position, float yawDegrees = 0.0f,
                                 float scale = 1.0f)
    {
        auto actor = MakeActor(parent, name, position, yawDegrees);
        if (scale != 1.0f)
            actor->transform->SetScale(Vec3F(scale, scale, scale));

        AddMesh(actor, meshPath, texturePath);
        return actor;
    }

    // Characters come from Y-up glTF: the visual child stands the model up in the Z-up world,
    // the parent actor keeps a clean yaw-only rotation for the game logic
    static Ref<Actor> AddCharacterVisual(const Ref<Actor>& owner, const String& modelPath,
                                         const String& texturePath, float scale = 1.0f)
    {
        auto visual = MakeActor(owner, "Visual", Vec3F());
        visual->transform->SetEulerAngles(Vec3F(Math::Deg2rad(90.0f), 0, 0));
        if (scale != 1.0f)
            visual->transform->SetScale(Vec3F(scale, scale, scale));

        auto mesh = visual->AddComponent<SkinnedMeshComponent>();
        mesh->SetShaded(false);
        mesh->SetModelAsset(o2Assets.GetAssetRefByType<SkinnedModelAsset>(modelPath));
        mesh->SetLooped(true);

        if (!Integration::IsHeadless() && !texturePath.IsEmpty())
            mesh->SetTexture(o2Assets.GetAssetRefByType<ImageAsset>(texturePath));

        return visual;
    }

    static void BuildCameraAndLight()
    {
        auto camera = mmake<CameraActor>();
        camera->SetName("camera3d");
        camera->SetLayer("3D");
        camera->drawLayers.SetLayers(Vector<String>{ "3D" });
        auto pipeline = mmake<DeferredPipeline>();
        pipeline->GetPass<ShadowMapPass>()->SetShadowMapSize(2048);
        auto lighting = mmake<FarmLightingPass>();
        lighting->SetAmbient(0.64f);
        pipeline->RemovePass(pipeline->GetPass<DeferredLightingPass>());
        pipeline->InsertPass(lighting, 2);
        camera->SetRenderPipeline(pipeline);
        camera->SetPerspective(Math::Deg2rad(35.0f), 0.1f*kUnitsPerMeter, 100.0f*kUnitsPerMeter);
        camera->transform->SetPosition(Vec3F(1840, -2190, 2300));
        camera->transform->SetEulerAngles(Vec3F(Math::Deg2rad(45.0f), 0, Math::Deg2rad(35.0f)));
        camera->fillColor = Color4(150, 200, 235);

        auto sun = MakeActor(nullptr, "sun", Vec3F(0, 0, 10*kUnitsPerMeter));
        auto light = sun->AddComponent<LightComponent>();
        light->SetLightType(LightComponent::Type::Directional);
        light->SetColor(Color4(255, 250, 235));
        light->SetIntensity(0.42f);
        sun->transform->SetEulerAngles(Vec3F(Math::Deg2rad(35.0f), 0, Math::Deg2rad(25.0f)));

        auto uiCamera = mmake<CameraActor>();
        uiCamera->SetName("ui camera");
        uiCamera->SetLayer("2D");
        uiCamera->drawLayers.SetLayers(Vector<String>{ "2D" });
        uiCamera->SetFittedSize(Vec2F(kScreenWidth, kScreenHeight));
        uiCamera->fillBackground = false;
    }

    static void BuildLocation()
    {
        constexpr float U = kUnitsPerMeter;

        auto location = MakeActor(nullptr, "Location", Vec3F());

        auto ground = MakeActor(location, "Ground", Vec3F(0, 0.5f*U, -30));
        auto plane = ground->AddComponent<MeshPrimitiveComponent>();
        plane->SetPrimitiveType(PrimitiveType3D::Plane);
        plane->SetSize(Vec3F(60*U, 64*U, 0));
        plane->SetColor(Color4(100, 154, 117));

        MakeStatic(location, "PathsAndFence", "Models/FarmGround.obj", "Models/TerrainPaint.png", Vec3F());
        MakeStatic(location, "GardenDecor", "Models/FarmDecor.obj", "Models/FarmPaint.png", Vec3F());
        MakeStatic(location, "Stand", "Models/SahurStand.obj", "Models/StandPaint.png", Vec3F(820, -260, 0), -90);

        // Counter top spots where sold stock is displayed, tuned to the stand shelf
        auto counterSpots = MakeActor(location, "CounterSpots", Vec3F(785, -260, 101), -90);
        for (int i = 0; i < 36; i++)
        {
            MakeActor(counterSpots, String("Spot") + (String)i,
                      Vec3F((-0.68f + 0.44f*(i % 4))*U, 0.24f*((i/4)%3)*U, 20.0f*(i/12)));
        }
    }

    static void BuildPlantation(const Ref<Actor>& parent, int index, const Vec3F& position, bool unlocked)
    {
        auto plantation = MakeActor(parent, String("Plantation") + (String)index, position, 90);

        MakeStatic(plantation, "Bed", "Models/GardenBed.obj", "Models/GardenPaint.png", Vec3F());

        constexpr float U = kUnitsPerMeter;
        for (int row = 0; row < 20; row++)
        {
            for (int col = 0; col < 4; col++)
            {
                int i = row*4 + col;
                auto spot = MakeActor(plantation, String("Spot") + (String)i,
                                      Vec3F(-102 + col*68, -665 + row*70, 12));
                AddMesh(spot, "Models/Brain.obj", index == 2 ? "Models/BrainGold.png" : "Models/BrainPaint.png");
                spot->transform->SetScale(Vec3F(0.85f, 0.85f, 0.85f));
                spot->SetEnabled(unlocked);
            }
        }
    }

    static void BuildPlantations()
    {
        constexpr float U = kUnitsPerMeter;

        auto plantations = MakeActor(nullptr, "Plantations", Vec3F());
        BuildPlantation(plantations, 0, Vec3F(-230, -260, 0), true);
        BuildPlantation(plantations, 1, Vec3F(-230, 160, 0), false);
        BuildPlantation(plantations, 2, Vec3F(-230, 580, 0), false);

        auto buyZones = MakeActor(nullptr, "BuyZones", Vec3F());
        const Vec3F positions[] = { Vec3F(570,160,4), Vec3F(590,-840,4), Vec3F(570,580,4), Vec3F(850,-600,4) };
        for (int i = 0; i < 4; i++)
        {
            auto zone = MakeStatic(buyZones, String("BuyZone") + (String)(i+1),
                                   "Models/BuildPad.obj", "Models/PadPaint.png", positions[i]);
            zone->SetEnabled(i == 0);
        }
        MakeStatic(nullptr, "Guide", "Models/Guide.obj", "Models/PadPaint.png", Vec3F(435,-260,30));
    }

    static void BuildCharacters()
    {
        constexpr float U = kUnitsPerMeter;

        auto player = MakeActor(nullptr, "Player", Vec3F(610,-430,0));
        AddCharacterVisual(player, "Models/Sahur.glb", "Models/SahurAtlas.png", U);

        auto stack = MakeActor(player, "Stack", Vec3F(65, 10, 100));

        auto zombies = MakeActor(nullptr, "Zombies", Vec3F());
        auto zombieTemplate = MakeActor(zombies, "ZombieTemplate", Vec3F(0, 12*U, 0));
        // The zombie model skins to ~7m tall, scale it down to human height
        AddCharacterVisual(zombieTemplate, "Models/Zombie.glb", "Models/ZombieTex.png", 0.25f*U);
        zombieTemplate->SetEnabled(false);

        auto templates = MakeActor(nullptr, "Templates", Vec3F(0, 0, -5*U));
        auto brainTemplate = MakeActor(templates, "BrainTemplate", Vec3F());
        AddMesh(brainTemplate, "Models/Brain.obj", "Models/BrainPaint.png");
        brainTemplate->SetEnabled(false);
        auto golden = MakeActor(templates, "GoldenBrainTemplate", Vec3F());
        AddMesh(golden, "Models/Brain.obj", "Models/BrainGold.png");
        golden->SetEnabled(false);

        MakeActor(nullptr, "Flights", Vec3F());
    }

    Ref<Actor> BuildBootstrapScene()
    {
        o2Scene.AddLayer("3D");
        o2Scene.AddLayer("2D");

        BuildCameraAndLight();
        BuildLocation();
        BuildPlantations();
        BuildCharacters();

        auto game = mmake<Actor>(ActorCreateMode::InScene);
        game->SetName("Game");
        game->SetLayer("2D");
        game->transform->SetSize2D(Vec2F(kScreenWidth, kScreenHeight));

        auto scriptable = game->AddComponent<ScriptableComponent>();
        scriptable->SetScript(o2Assets.GetAssetRefByType<JavaScriptAsset>(String("Scripts/BrainFarm.js")));

        return game;
    }

    void SaveBootstrapSceneIfMissing()
    {
        // Only where the source assets live: a packaged build ships the built tree alone
        if (!o2FileSystem.IsFolderExist(o2Assets.GetAssetsPath()))
            return;

        auto path = o2Assets.GetAssetsPath() + "Bootstrap.scn";
        if (o2FileSystem.IsFileExist(path))
            return;

        // Freshly created actors reach the scene's root list only on the next frame's
        // added-entities pass; without it the saved scene would hold no actors at all
        o2Scene.UpdateAddedEntities();
        o2Scene.Save(path);
    }
}
