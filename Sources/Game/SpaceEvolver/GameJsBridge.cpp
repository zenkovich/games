#include "o2/stdafx.h"
#include "GameJsBridge.h"

#include <ctime>

#include "o2/Application/Application.h"
#include "o2/Application/Input.h"
#include "o2/Assets/Assets.h"
#include "o2/Assets/Types/VectorFontAsset.h"
#include "o2/Integration.h"
#include "o2/Render/Sprite.h"
#include "o2/Render/Text.h"
#include "o2/Scene/UI/WidgetLayer.h"
#include "o2/Scene/UI/Widgets/Button.h"
#include "o2/Scene/UI/Widgets/Label.h"
#include "o2/Scripts/ScriptEngine.h"
#include "o2/Utils/Debug/Debug.h"
#include "o2/Utils/FileSystem/FileSystem.h"

using namespace o2;

namespace space_evolver
{
	static const String kSaveFileName = "space_evolver_save.json";
	static const String kFontPath = "debugFont.ttf";

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

		auto background = mmake<Sprite>(Color4(48, 118, 92, 255));
		button->AddLayer("regular", background);
		button->AddLayer("caption", MakeText(caption, height));

		return button;
	}

	void ResetPersistentSave()
	{
		if (o2FileSystem.IsFileExist(kSaveFileName))
			o2FileSystem.FileDelete(kSaveFileName);
	}

	void RegisterGameJsApi()
	{
		auto bridge = ScriptValue::EmptyObject();

		bridge.SetProperty("GetCursorX", Function<float()>([]() { return o2Input.GetCursorPos().x; }));
		bridge.SetProperty("GetCursorY", Function<float()>([]() { return o2Input.GetCursorPos().y; }));
		bridge.SetProperty("IsCursorDown", Function<bool()>([]() { return o2Input.IsCursorDown(); }));
		bridge.SetProperty("IsCursorPressed", Function<bool()>([]() { return o2Input.IsCursorPressed(); }));

		bridge.SetProperty("GetScreenWidth", Function<float()>([]() { return (float)o2Application.GetContentSize().x; }));
		bridge.SetProperty("GetScreenHeight", Function<float()>([]() { return (float)o2Application.GetContentSize().y; }));

		bridge.SetProperty("LoadConfig", Function<String(const String&)>([](const String& name)
		{
			return o2FileSystem.ReadFile(o2Assets.GetAssetsPath() + "Configs/" + name);
		}));

		bridge.SetProperty("LoadPersistent", Function<String()>([]()
		{
			return o2FileSystem.ReadFile(kSaveFileName);
		}));

		bridge.SetProperty("SavePersistent", Function<void(const String&)>([](const String& data)
		{
			o2FileSystem.WriteFile(kSaveFileName, data);
		}));

		bridge.SetProperty("GetTimeSec", Function<float()>([]() { return (float)time(nullptr); }));

		bridge.SetProperty("CreateButton", Function<Ref<Button>(const String&, int)>([](const String& caption, int height)
		{
			if (Integration::IsHeadless())
				return Ref<Button>();

			return MakeButton(caption, height);
		}));

		bridge.SetProperty("CreateLabel", Function<Ref<Label>(const String&, int)>([](const String& text, int height)
		{
			if (Integration::IsHeadless())
				return Ref<Label>();

			return MakeLabel(text, height);
		}));

		bridge.SetProperty("Log", Function<void(const String&)>([](const String& text)
		{
			o2Debug.Log(text);
		}));

		bridge.SetProperty("RunScript", Function<void(const String&)>([](const String& name)
		{
			auto res = o2Scripts.Eval(o2FileSystem.ReadFile(o2Assets.GetAssetsPath() + "Scripts/" + name), name);
			if (res.GetValueType() == ScriptValue::ValueType::Error)
				o2Debug.LogError("RunScript " + name + ": " + res.GetError());
		}));

		o2Scripts.GetGlobal().SetProperty("Bridge", bridge);
	}
}
