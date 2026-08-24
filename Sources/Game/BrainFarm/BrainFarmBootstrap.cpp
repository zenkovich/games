#include "o2/stdafx.h"
#include "BrainFarmBootstrap.h"

#include "o2/Assets/Assets.h"
#include "o2/Assets/Types/ImageAsset.h"
#include "o2/Assets/Types/JavaScriptAsset.h"
#include "o2/Assets/Types/Mesh3DAsset.h"
#include "o2/Assets/Types/SkinnedModelAsset.h"
#include "o2/Integration.h"
#include "o2/Render/Pipeline/Pipelines.h"
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
        auto mesh = actor->AddComponent<Mesh3DComponent>();
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
        camera->SetRenderPipeline(mmake<DeferredPipeline>());
        camera->SetPerspective(Math::Deg2rad(45.0f), 0.1f*kUnitsPerMeter, 100.0f*kUnitsPerMeter);
        camera->transform->SetPosition(Vec3F(0, -5.6f*kUnitsPerMeter, 7.2f*kUnitsPerMeter));
        camera->transform->SetEulerAngles(Vec3F(Math::Deg2rad(38.0f), 0, 0));
        camera->fillColor = Color4(150, 200, 235);

        auto sun = MakeActor(nullptr, "sun", Vec3F(0, 0, 10*kUnitsPerMeter));
        auto light = sun->AddComponent<LightComponent>();
        light->SetLightType(LightComponent::Type::Directional);
        light->SetColor(Color4(255, 250, 235));
        light->SetIntensity(1.0f);
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

        auto ground = MakeActor(location, "Ground", Vec3F(0, 0.5f*U, 0));
        auto plane = ground->AddComponent<MeshPrimitiveComponent>();
        plane->SetPrimitiveType(PrimitiveType3D::Plane);
        plane->SetSize(Vec3F(26*U, 32*U, 0));
        plane->SetColor(Color4(122, 178, 92));

        auto fences = MakeActor(location, "Fences", Vec3F());
        const float sideX = 4.1f*U, backY = 8.6f*U, frontY = -7.0f*U;
        for (float y : { -3.9f*U, 1.6f*U, 7.1f*U })
        {
            MakeStatic(fences, "FenceL", "Models/Fence.obj", "Models/FencePalette.png", Vec3F(-sideX, y, 0), 90);
            MakeStatic(fences, "FenceR", "Models/Fence.obj", "Models/FencePalette.png", Vec3F(sideX, y, 0), 90);
        }
        // The back fence leaves a middle gap: the zombie gate
        for (float x : { -3.6f*U, 3.6f*U })
            MakeStatic(fences, "FenceB", "Models/Fence.obj", "Models/FencePalette.png", Vec3F(x, backY, 0), 0);
        for (float x : { -1.6f*U, 1.6f*U })
            MakeStatic(fences, "FenceF", "Models/Fence.obj", "Models/FencePalette.png", Vec3F(x, frontY, 0), 0);

        auto pines = MakeActor(location, "Pines", Vec3F());
        const Vec3F pinePositions[] = { Vec3F(-5.6f*U, 2.5f*U, 0), Vec3F(5.8f*U, -1.5f*U, 0), Vec3F(-5.2f*U, -5.5f*U, 0),
                                        Vec3F(5.4f*U, 6.0f*U, 0), Vec3F(-2.2f*U, 10.3f*U, 0), Vec3F(2.8f*U, 10.8f*U, 0) };
        int pineIndex = 0;
        for (auto& pos : pinePositions)
        {
            auto pine = MakeActor(pines, String("Pine") + (String)pineIndex, pos, (float)(pineIndex*60));
            float scale = 0.8f + 0.13f*(pineIndex % 3);
            pine->transform->SetScale(Vec3F(scale, scale, scale));
            MakeStatic(pine, "Trunk", "Models/PineTrunk.obj", "Models/PineBark.png", Vec3F());
            MakeStatic(pine, "Leaves", "Models/PineLeaves.obj", "Models/PineLeavesTex.png", Vec3F());
            pineIndex++;
        }

        MakeStatic(location, "Stand", "Models/Stand.obj", "Models/StandPalette.png", Vec3F(0, 4.6f*U, 0), 180);

        // The meme homage: a baseball bat dropped by the stand
        MakeStatic(location, "Bat", "Models/Bat.obj", "Models/BatPalette.png", Vec3F(1.15f*U, 3.85f*U, 0.05f*U), 0)
            ->transform->SetEulerAngles(Vec3F(Math::Deg2rad(90.0f), 0, Math::Deg2rad(55.0f)));

        // Counter top spots where sold stock is displayed, tuned to the stand shelf
        auto counterSpots = MakeActor(location, "CounterSpots", Vec3F(0, 4.25f*U, 0.95f*U));
        for (int i = 0; i < 6; i++)
        {
            MakeActor(counterSpots, String("Spot") + (String)i,
                      Vec3F((-0.62f + 0.25f*(i % 3) + 0.06f*(i/3))*U, 0.18f*(i/3)*U, 0));
        }
    }

    static void BuildPlantation(const Ref<Actor>& parent, int index, const Vec3F& position, bool unlocked)
    {
        auto plantation = MakeActor(parent, String("Plantation") + (String)index, position);

        MakeStatic(plantation, "Bed", "Models/Dirt.obj", "Models/DirtPalette.png", Vec3F());

        constexpr float U = kUnitsPerMeter;
        const Vec2F spots[] = { Vec2F(-0.45f*U, -0.3f*U), Vec2F(0.45f*U, -0.3f*U), Vec2F(-0.45f*U, 0.35f*U), Vec2F(0.45f*U, 0.35f*U) };
        for (int i = 0; i < 4; i++)
        {
            auto spot = MakeActor(plantation, String("Spot") + (String)i, Vec3F(spots[i].x, spots[i].y, 0.05f*U));
            AddMesh(spot, "Models/Brain.obj", "Models/BrainPalette.png");
            spot->transform->SetScale(Vec3F(0.01f, 0.01f, 0.01f));
            spot->SetEnabled(false);
        }

        plantation->SetEnabled(unlocked);
    }

    static void BuildPlantations()
    {
        constexpr float U = kUnitsPerMeter;

        auto plantations = MakeActor(nullptr, "Plantations", Vec3F());
        BuildPlantation(plantations, 0, Vec3F(0, -1.6f*U, 0), true);
        BuildPlantation(plantations, 1, Vec3F(-2.0f*U, -4.3f*U, 0), false);
        BuildPlantation(plantations, 2, Vec3F(2.0f*U, -4.3f*U, 0), false);

        auto buyZones = MakeActor(nullptr, "BuyZones", Vec3F());
        const Vec3F zonePositions[] = { Vec3F(-2.0f*U, -4.3f*U, 0), Vec3F(2.0f*U, -4.3f*U, 0) };
        for (int i = 0; i < 2; i++)
        {
            auto zone = MakeActor(buyZones, String("BuyZone") + (String)(i + 1), zonePositions[i]);
            // the cylinder axis runs along Y, lay it flat to get a floor pad
            zone->transform->SetEulerAngles(Vec3F(Math::Deg2rad(90.0f), 0, 0));
            auto disc = zone->AddComponent<MeshPrimitiveComponent>();
            disc->SetPrimitiveType(PrimitiveType3D::Cylinder);
            disc->SetSize(Vec3F(1.7f*U, 0.06f*U, 1.7f*U));
            disc->SetColor(Color4(255, 244, 180));
        }
    }

    static void BuildCharacters()
    {
        constexpr float U = kUnitsPerMeter;

        auto player = MakeActor(nullptr, "Player", Vec3F(0, -0.2f*U, 0));
        AddCharacterVisual(player, "Models/Farmer.glb", "Models/FarmerPalette.png", U);

        auto stack = MakeActor(player, "Stack", Vec3F(0, 0.35f*U, 0.95f*U));
        stack->transform->SetScale(Vec3F(0.55f, 0.55f, 0.55f));

        auto zombies = MakeActor(nullptr, "Zombies", Vec3F());
        auto zombieTemplate = MakeActor(zombies, "ZombieTemplate", Vec3F(0, 12*U, 0));
        // The zombie model skins to ~7m tall, scale it down to human height
        AddCharacterVisual(zombieTemplate, "Models/Zombie.glb", "Models/ZombieTex.png", 0.25f*U);
        zombieTemplate->SetEnabled(false);

        auto templates = MakeActor(nullptr, "Templates", Vec3F(0, 0, -5*U));
        auto brainTemplate = MakeActor(templates, "BrainTemplate", Vec3F());
        AddMesh(brainTemplate, "Models/Brain.obj", "Models/BrainPalette.png");
        brainTemplate->SetEnabled(false);

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
