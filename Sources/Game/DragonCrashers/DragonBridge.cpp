#include "o2/stdafx.h"
#include "DragonBridge.h"

#include "o2/Application/Application.h"
#include "o2/Application/Input.h"
#include "o2/Assets/Assets.h"
#include "o2/Assets/Types/SoundAsset.h"
#include "o2/Scene/Actor.h"
#include "o2/Scene/Components/SpineComponent.h"
#include "DragonCrashers/DragonSpineComponent.h"
#include "o2/Scene/Scene.h"
#include "o2/Scene/UI/Widget.h"
#include "o2/Scene/UI/WidgetLayer.h"
#include "o2/Scripts/ScriptEngine.h"
#include "o2/Sound/SoundPlayer.h"
#include "o2/Utils/Debug/Debug.h"
#include "o2/Utils/System/Time/Time.h"
#include "o2/Utils/Tasks/TaskManager.h"

namespace dragon
{
    static const Vec2F kDesignSize(1920, 1080);

    struct Audio
    {
        Vector<Ref<SoundPlayer>> sfx;
        int                      nextSfx = 0;
        Ref<SoundPlayer>         music;
        String                   musicPath;
    };

    static Audio& GetAudio()
    {
        static Audio audio;
        return audio;
    }

    // Cursor position in the units of the fitted 1920x1080 camera (origin in the center, y up)
    static Vec2F CursorUi()
    {
        Vec2F pos = o2Input.GetCursorPos();
        for (auto& cursor : o2Input.GetCursors())
        {
            if (cursor.isPressed)
            {
                pos = cursor.position;
                break;
            }
        }

        Vec2F screen = (Vec2F)o2Application.GetContentSize();
        float k = Math::Min(screen.x/kDesignSize.x, screen.y/kDesignSize.y);
        return k > 0 ? pos/k : pos;
    }

    static Ref<SpineComponent> SpineOf(const Ref<Actor>& actor)
    {
        return actor ? actor->GetComponent<SpineComponent>() : nullptr;
    }

    void RegisterDragonJsApi()
    {
        auto global = o2Scripts.GetGlobal();
        if (global.GetProperty("Bridge").IsObject())
            return;

        auto bridge = ScriptValue::EmptyObject();

        bridge.SetProperty("LoadScene", Function<void(const String&)>([](const String& path)
        {
            String full = o2Assets.GetBuiltAssetsPath() + path;
            o2Tasks.Invoke([full]() { o2Scene.Load(full); }, 0.0f);
        }));

        bridge.SetProperty("FindActor", Function<Ref<Actor>(const String&)>([](const String& path) { return o2Scene.FindActor(path); }));

        bridge.SetProperty("Quit", Function<void()>([]() { o2Application.Shutdown(); }));
        bridge.SetProperty("OpenURL", Function<void(const String&)>([](const String& url) { o2Debug.Log("OpenURL: " + url); }));
        bridge.SetProperty("Log", Function<void(const String&)>([](const String& text) { o2Debug.Log(text); }));
        bridge.SetProperty("Time", Function<float()>([]() { return o2Time.GetApplicationTime(); }));

        bridge.SetProperty("PlaySfx", Function<void(const String&, float)>([](const String& path, float volume)
        {
            auto& audio = GetAudio();
            if (audio.sfx.IsEmpty())
            {
                for (int i = 0; i < 8; i++)
                    audio.sfx.Add(mmake<SoundPlayer>());
            }

            auto& player = audio.sfx[audio.nextSfx];
            audio.nextSfx = (audio.nextSfx + 1)%audio.sfx.Count();
            player->Stop();
            player->SetSound(AssetRef<SoundAsset>(path));
            player->SetVolume(volume);
            player->SetLoop(Loop::None);
            player->RewindAndPlay();
        }));

        bridge.SetProperty("PlayMusic", Function<void(const String&, float)>([](const String& path, float volume)
        {
            auto& audio = GetAudio();
            if (!audio.music)
                audio.music = mmake<SoundPlayer>();

            audio.music->SetVolume(volume);
            if (audio.musicPath == path && audio.music->IsPlaying())
                return;

            audio.musicPath = path;
            audio.music->Stop();
            audio.music->SetSound(AssetRef<SoundAsset>(path));
            audio.music->SetLoop(Loop::Repeat);
            audio.music->RewindAndPlay();
        }));

        bridge.SetProperty("StopMusic", Function<void()>([]()
        {
            auto& audio = GetAudio();
            if (audio.music)
                audio.music->Stop();
            audio.musicPath = "";
        }));

        bridge.SetProperty("SetMusicVolume", Function<void(float)>([](float volume)
        {
            if (auto& music = GetAudio().music)
                music->SetVolume(volume);
        }));

        bridge.SetProperty("CursorX", Function<float()>([]() { return CursorUi().x; }));
        bridge.SetProperty("CursorY", Function<float()>([]() { return CursorUi().y; }));
        bridge.SetProperty("IsCursorDown", Function<bool()>([]()
        {
            for (auto& cursor : o2Input.GetCursors())
            {
                if (cursor.isPressed)
                    return true;
            }
            return false;
        }));
        bridge.SetProperty("IsCursorPressed", Function<bool()>([]() { return o2Input.IsCursorPressed(); }));
        bridge.SetProperty("IsCursorReleased", Function<bool()>([]() { return o2Input.IsCursorReleased(); }));

        // Plays one Spine animation exclusively: every exported animation keys the whole pose
        bridge.SetProperty("SpinePlay", Function<float(const Ref<Actor>&, const String&, bool)>(
            [](const Ref<Actor>& actor, const String& anim, bool loop)
        {
            auto spine = SpineOf(actor);
            if (!spine)
                return 0.0f;

            auto state = spine->GetState(anim);
            if (!state)
                return 0.0f;

            spine->StopAll();
            state->SetLooped(loop);
            spine->RewindAndPlay(anim);
            return state->GetDuration();
        }));

        bridge.SetProperty("SpineDuration", Function<float(const Ref<Actor>&, const String&)>(
            [](const Ref<Actor>& actor, const String& anim)
        {
            auto spine = SpineOf(actor);
            auto state = spine ? spine->GetState(anim) : nullptr;
            return state ? state->GetDuration() : 0.0f;
        }));

        bridge.SetProperty("SpineSetSpeed", Function<void(const Ref<Actor>&, float)>([](const Ref<Actor>& actor, float speed)
        {
            if (auto spine = actor ? actor->GetComponent<DragonSpineComponent>() : nullptr)
                spine->timeScale = speed;
        }));

        bridge.SetProperty("SetLayerImage", Function<void(const Ref<Widget>&, const String&, const String&)>(
            [](const Ref<Widget>& widget, const String& layerName, const String& imagePath)
        {
            if (!widget)
                return;

            if (auto layer = widget->FindLayer(layerName))
                layer->SetImage(imagePath);
        }));

        global.SetProperty("Bridge", bridge);
    }

    void DragonBootstrapComponent::OnInitialized()
    {
        RegisterDragonJsApi();
    }
}
// --- META ---

DECLARE_CLASS(dragon::DragonBootstrapComponent, dragon__DragonBootstrapComponent);
// --- END META ---
