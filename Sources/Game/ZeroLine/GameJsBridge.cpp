#include "o2/stdafx.h"
#include "GameJsBridge.h"

#include "o2/Application/Application.h"
#include "o2/Application/Input.h"
#include "o2/Assets/Assets.h"
#include "o2/Assets/Types/VectorFontAsset.h"
#include "o2/Integration.h"
#include "o2/Render/Sprite.h"
#include "o2/Render/Text.h"
#include "o2/Scene/UI/Widget.h"
#include "o2/Scene/UI/Widgets/Button.h"
#include "o2/Scene/UI/Widgets/Label.h"
#include "o2/Scripts/ScriptEngine.h"
#include "o2/Utils/Debug/Debug.h"
#include "o2/Utils/FileSystem/FileSystem.h"

#if defined(__EMSCRIPTEN__)
#include <emscripten.h>

// The browser build keeps the best score in localStorage, like a web game would
EM_JS(void, zl_storage_set, (const char* key, const char* value), {
    try { localStorage.setItem(UTF8ToString(key), UTF8ToString(value)); } catch (e) {}
});

EM_JS(int, zl_storage_get, (const char* key, char* out, int outSize), {
    try {
        var value = localStorage.getItem(UTF8ToString(key));
        if (value === null)
            return 0;
        stringToUTF8(value, out, outSize);
        return 1;
    } catch (e) { return 0; }
});
#endif

using namespace o2;

namespace zero_line
{
    static const String kSprites = "ZeroLine/";
    static const String kFontHeavy = "Fonts/GameFontHeavy.ttf";
    static const String kFontRegular = "Fonts/GameFont.ttf";

    // Only a mouse is ever cursor zero; a touch carries whatever id the platform assigns,
    // so the game follows whichever cursor is pressed
    static const Input::Cursor* PressedCursor()
    {
        for (auto& cursor : o2Input.GetCursors())
        {
            if (cursor.isPressed)
                return &cursor;
        }

        return nullptr;
    }

    static const Input::Cursor* ReleasedCursor()
    {
        auto& released = o2Input.GetReleasedCursors();
        return released.IsEmpty() ? nullptr : &released[0];
    }

    static Vec2F ActiveCursorPos()
    {
        if (auto* cursor = PressedCursor())
            return cursor->position;

        if (auto* cursor = ReleasedCursor())
            return cursor->position;

        return o2Input.GetCursorPos();
    }

    static Ref<Text> MakeText(const String& value, int height, bool heavy)
    {
        auto text = mmake<Text>();
        text->SetFontAsset(AssetRef<VectorFontAsset>(heavy ? kFontHeavy : kFontRegular));
        text->SetHeight(height);
        text->SetText((WString)value);
        text->SetHorAlign(HorAlign::Middle);
        text->SetVerAlign(VerAlign::Middle);
        return text;
    }

    // The project ships no ui_style asset, so labels and buttons are assembled from layers
    static Ref<Label> MakeLabel(const String& value, int height, bool heavy)
    {
        auto label = mmake<Label>();
        label->RemoveAllLayers();
        label->AddLayer("text", MakeText(value, height, heavy));
        label->SetText((WString)value);
        return label;
    }

    static Ref<Button> MakeButton(const String& image, const String& caption, int height)
    {
        auto button = mmake<Button>();
        button->AddLayer("regular", mmake<Sprite>(kSprites + image), Layout::BothStretch(), 1.0f);
        button->AddLayer("caption", MakeText(caption, height, true), Layout::BothStretch(0, 3, 0, 0), 5.0f);
        return button;
    }

    // A number tile: colored backs for positive/negative/zero values, a selection glow
    // around the tile and the value text on top. JS toggles the layers
    static Ref<Widget> MakeTile()
    {
        auto tile = mmake<Widget>();
        tile->SetName("Tile");
        // Explicit depths: a zero depth gets replaced by the layer count, which would put a
        // back enabled later above the text
        tile->AddLayer("glow", mmake<Sprite>(kSprites + "tile_glow.png"), Layout::BothStretch(-12, -12, -12, -12), -1.0f)->SetEnabled(false);
        tile->AddLayer("pos", mmake<Sprite>(kSprites + "tile_pos.png"), Layout::BothStretch(), 1.0f);
        tile->AddLayer("neg", mmake<Sprite>(kSprites + "tile_neg.png"), Layout::BothStretch(), 1.0f)->SetEnabled(false);
        tile->AddLayer("zero", mmake<Sprite>(kSprites + "tile_zero.png"), Layout::BothStretch(), 1.0f)->SetEnabled(false);
        tile->AddLayer("text", MakeText("", 44, true), Layout::BothStretch(0, 3, 0, 0), 5.0f);
        return tile;
    }

    static void SaveText(const String& name, const String& content)
    {
#if defined(__EMSCRIPTEN__)
        zl_storage_set(name.Data(), content.Data());
#else
        o2FileSystem.WriteFile(name, content);
#endif
    }

    static String LoadText(const String& name)
    {
#if defined(__EMSCRIPTEN__)
        char buffer[1024] = { 0 };
        if (zl_storage_get(name.Data(), buffer, sizeof(buffer)))
            return String(buffer);

        return String();
#else
        if (!o2FileSystem.IsFileExist(name))
            return String();

        return o2FileSystem.ReadFile(name);
#endif
    }

    void RegisterGameJsApi()
    {
        auto bridge = ScriptValue::EmptyObject();

        bridge.SetProperty("GetCursorX", Function<float()>([]() { return ActiveCursorPos().x; }));
        bridge.SetProperty("GetCursorY", Function<float()>([]() { return ActiveCursorPos().y; }));
        bridge.SetProperty("IsCursorDown", Function<bool()>([]() { return PressedCursor() != nullptr; }));
        bridge.SetProperty("IsCursorReleased", Function<bool()>([]() { return ReleasedCursor() != nullptr; }));

        bridge.SetProperty("IsCursorPressed", Function<bool()>([]()
        {
            auto* cursor = PressedCursor();
            return cursor && cursor->pressedTime < FLT_EPSILON;
        }));

        bridge.SetProperty("GetScreenWidth", Function<float()>([]() { return (float)o2Application.GetContentSize().x; }));
        bridge.SetProperty("GetScreenHeight", Function<float()>([]() { return (float)o2Application.GetContentSize().y; }));

        bridge.SetProperty("CreateLabel", Function<Ref<Label>(const String&, int, bool)>(
            [](const String& text, int height, bool heavy)
        {
            if (Integration::IsHeadless())
                return Ref<Label>();

            return MakeLabel(text, height, heavy);
        }));

        bridge.SetProperty("CreateButton", Function<Ref<Button>(const String&, const String&, int)>(
            [](const String& image, const String& caption, int height)
        {
            if (Integration::IsHeadless())
                return Ref<Button>();

            return MakeButton(image, caption, height);
        }));

        bridge.SetProperty("CreateTile", Function<Ref<Widget>()>([]()
        {
            if (Integration::IsHeadless())
                return Ref<Widget>();

            return MakeTile();
        }));

        bridge.SetProperty("SaveText", Function<void(const String&, const String&)>(
            [](const String& name, const String& content) { SaveText(name, content); }));

        bridge.SetProperty("LoadText", Function<String(const String&)>(
            [](const String& name) { return LoadText(name); }));

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
