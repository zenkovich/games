#include "o2/stdafx.h"
#include "GameJsBridge.h"

#include "BrainFarmBootstrap.h"

#include "o2/Application/Application.h"
#include "o2/Application/Input.h"
#include "o2/Assets/Assets.h"
#include "o2/Assets/Types/VectorFontAsset.h"
#include "o2/Integration.h"
#include "o2/Render/Render.h"
#include "o2/Render/Sprite.h"
#include "o2/Render/Text.h"
#include "o2/Scene/Actor.h"
#include "o2/Scene/CameraActor.h"
#include "o2/Scene/Components/SkinnedMeshComponent.h"
#include "o2/Scene/Scene.h"
#include "o2/Scene/UI/Widgets/Button.h"
#include "o2/Scene/UI/Widgets/Label.h"
#include "o2/Scripts/ScriptEngine.h"
#include "o2/Utils/Debug/Debug.h"
#include "o2/Utils/FileSystem/FileSystem.h"

using namespace o2;

namespace brain_farm
{
    static const String kFontPath = "debugFont.ttf";

    // Only a mouse is ever cursor zero; a touch carries whatever id the platform assigns,
    // so asking for cursor zero finds nothing on a phone
    static const Input::Cursor* PressedCursor()
    {
        for (auto& cursor : o2Input.GetCursors())
        {
            if (cursor.isPressed)
                return &cursor;
        }

        return nullptr;
    }

    static Vec2F ActiveCursorPos()
    {
        if (auto* cursor = PressedCursor())
            return cursor->position;

        return o2Input.GetCursorPos();
    }

    // The project ships no ui_style asset, so o2UI can't build styled widgets: the game's
    // labels and buttons are assembled here from widget layers instead
    static Ref<Text> MakeText(const String& value, int height)
    {
        auto text = mmake<Text>();
        text->SetFontAsset(AssetRef<VectorFontAsset>(kFontPath));
        text->SetHeight(height);
        text->SetText((WString)value);
        text->SetHorAlign(HorAlign::Middle);
        text->SetVerAlign(VerAlign::Middle);
        return text;
    }

    static Ref<Label> MakeLabel(const String& value, int height)
    {
        auto label = mmake<Label>();
        label->RemoveAllLayers();
        label->AddLayer("text", MakeText(value, height));
        label->SetText((WString)value);
        return label;
    }

    static Ref<Button> MakeButton(const String& caption, int height)
    {
        auto button = mmake<Button>();
        button->AddLayer("regular", mmake<Sprite>(Color4(64, 130, 90, 255)));
        button->AddLayer("caption", MakeText(caption, height));
        return button;
    }

    static Ref<SkinnedMeshComponent> FindSkinnedMesh(const Ref<Actor>& actor)
    {
        if (!actor)
            return nullptr;

        if (auto mesh = actor->GetComponent<SkinnedMeshComponent>())
            return mesh;

        if (auto visual = actor->GetChild("Visual"))
            return visual->GetComponent<SkinnedMeshComponent>();

        return nullptr;
    }

    static Ref<Actor> SpawnFromTemplate(const String& templatePath, const String& containerPath)
    {
        auto templateActor = o2Scene.FindActor(templatePath);
        auto container = o2Scene.FindActor(containerPath);
        if (!templateActor || !container)
        {
            o2Debug.LogError("SpawnFromTemplate: not found - " + templatePath);
            return nullptr;
        }

        auto clone = templateActor->CloneAsRef<Actor>();
        container->AddChild(clone);
        return clone;
    }

    void RegisterGameJsApi()
    {
        auto bridge = ScriptValue::EmptyObject();

        bridge.SetProperty("GetCursorX", Function<float()>([]() { return ActiveCursorPos().x; }));
        bridge.SetProperty("GetCursorY", Function<float()>([]() { return ActiveCursorPos().y; }));
        bridge.SetProperty("IsCursorDown", Function<bool()>([]() { return PressedCursor() != nullptr; }));

        bridge.SetProperty("IsCursorPressed", Function<bool()>([]()
        {
            auto* cursor = PressedCursor();
            return cursor && cursor->pressedTime < FLT_EPSILON;
        }));

        bridge.SetProperty("GetScreenWidth", Function<float()>([]() { return (float)o2Application.GetContentSize().x; }));
        bridge.SetProperty("GetScreenHeight", Function<float()>([]() { return (float)o2Application.GetContentSize().y; }));

        bridge.SetProperty("FindActor", Function<Ref<Actor>(const String&)>([](const String& path)
        {
            return o2Scene.FindActor(path);
        }));

        bridge.SetProperty("PlayAnim", Function<void(const Ref<Actor>&, const String&, bool, float)>(
            [](const Ref<Actor>& actor, const String& clip, bool looped, float speed)
        {
            auto mesh = FindSkinnedMesh(actor);
            if (!mesh)
                return;

            if (mesh->GetAnimation() != clip)
                mesh->SetAnimation(clip);

            mesh->SetLooped(looped);
            mesh->SetSpeed(speed);
            mesh->SetPlaying(true);
        }));

        bridge.SetProperty("SpawnZombie", Function<Ref<Actor>()>([]()
        {
            return SpawnFromTemplate("Zombies/ZombieTemplate", "Zombies");
        }));

        bridge.SetProperty("SpawnBrain", Function<Ref<Actor>()>([]()
        {
            return SpawnFromTemplate("Templates/BrainTemplate", "Templates");
        }));

        // Structured returns (Vec2F/Vec3F) marshal to JS with undefined fields, so every
        // cross-boundary read is a plain float getter

        auto worldToScreen = [](float x, float y, float z)
        {
            auto cameraActor = DynamicCast<CameraActor>(o2Scene.FindActor("camera3d"));
            if (!cameraActor)
                return Vec2F();

            Vec2F resolution = (Vec2F)o2Application.GetContentSize();
            Camera camera = cameraActor->GetRenderCamera();
            Vec3F ndc = (camera.GetProjectionMatrix(resolution)*camera.GetViewMatrix3D()).TransformPoint(Vec3F(x, y, z));
            return Vec2F(ndc.x*resolution.x*0.5f, ndc.y*resolution.y*0.5f);
        };

        bridge.SetProperty("WorldToScreenX", Function<float(float, float, float)>(
            [worldToScreen](float x, float y, float z) { return worldToScreen(x, y, z).x; }));
        bridge.SetProperty("WorldToScreenY", Function<float(float, float, float)>(
            [worldToScreen](float x, float y, float z) { return worldToScreen(x, y, z).y; }));

        auto worldPos = [](const Ref<Actor>& actor)
        {
            return actor ? actor->transform->GetWorldPosition() : Vec3F();
        };

        bridge.SetProperty("WorldPosX", Function<float(const Ref<Actor>&)>(
            [worldPos](const Ref<Actor>& actor) { return worldPos(actor).x; }));
        bridge.SetProperty("WorldPosY", Function<float(const Ref<Actor>&)>(
            [worldPos](const Ref<Actor>& actor) { return worldPos(actor).y; }));
        bridge.SetProperty("WorldPosZ", Function<float(const Ref<Actor>&)>(
            [worldPos](const Ref<Actor>& actor) { return worldPos(actor).z; }));

        bridge.SetProperty("CreateLabel", Function<Ref<Label>(const String&, int)>([](const String& text, int height)
        {
            if (Integration::IsHeadless())
                return Ref<Label>();

            return MakeLabel(text, height);
        }));

        bridge.SetProperty("CreateButton", Function<Ref<Button>(const String&, int)>([](const String& caption, int height)
        {
            if (Integration::IsHeadless())
                return Ref<Button>();

            return MakeButton(caption, height);
        }));

        bridge.SetProperty("Log", Function<void(const String&)>([](const String& text)
        {
            o2Debug.Log(text);
        }));

        bridge.SetProperty("RunScript", Function<void(const String&)>([](const String& name)
        {
            auto source = o2FileSystem.ReadFile(o2Assets.GetBuiltAssetsPath() + "Scripts/" + name);
            if (source.IsEmpty())
            {
                o2Debug.LogError("RunScript: module not found - " + name);
                return;
            }

            auto res = o2Scripts.Eval(source, name);
            if (res.GetValueType() == ScriptValue::ValueType::Error)
                o2Debug.LogError("RunScript " + name + ": " + res.GetError());
        }));

        o2Scripts.GetGlobal().SetProperty("Bridge", bridge);
    }
}
