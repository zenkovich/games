#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include <cstdlib>

#include "o2/Assets/Assets.h"
#include "o2/Assets/Types/ActorAsset.h"
#include "o2/Assets/Types/FontStyleAsset.h"
#include "o2/Assets/Types/ImageAsset.h"
#include "o2/Assets/Types/VectorFontAsset.h"
#include "o2/Render/Sprite.h"
#include "o2/Render/Text.h"
#include "o2/Render/VectorFontEffects.h"
#include "o2/Scene/Components/ScissorClippingComponent.h"
#include "o2/Scene/Scene.h"
#include "o2/Scene/UI/Widget.h"
#include "o2/Scene/UI/WidgetLayer.h"
#include "o2/Scene/UI/WidgetLayout.h"
#include "o2/Scene/UI/Widgets/Button.h"
#include "o2/Scene/UI/Widgets/Label.h"
#include "o2/Scene/UI/Widgets/ScrollArea.h"
#include "o2/Utils/FileSystem/FileSystem.h"
#include "o2/Utils/Serialization/DataValue.h"

using namespace o2;

// Builds the Dragon Crashers UI prototypes from the plan made by Tools/UnityPort/make_ui_plan.py
// (layouts captured from the Unity original). A tool, not a test: runs only with DC_PORT_PLAN set.
namespace
{
	const float kFontScale = 72.0f/92.0f;

	float F(const DataValue& v, int i) { return (float)v.GetElement(i); }

	Color4 ColorOf(const DataValue& v)
	{
		if (!v.IsArray() || v.GetElementsCount() < 4)
			return Color4::White();
		return Color4(F(v, 0), F(v, 1), F(v, 2), F(v, 3));
	}

	Vec2F Vec2Of(const DataValue& v, int i = 0) { return Vec2F(F(v, i), F(v, i + 1)); }

	String StyleKey(const DataValue& text)
	{
		String key;
		if (auto outline = text.FindMember("outline"))
		{
			Color4 c = ColorOf((*outline)["color"]);
			key += String::Format("o%d_%02x%02x%02x%02x", (int)(float)(*outline)["width"], c.r, c.g, c.b, c.a);
		}
		if (auto shadow = text.FindMember("shadow"))
		{
			Color4 c = ColorOf((*shadow)["color"]);
			Vec2F off = Vec2Of((*shadow)["offset"]);
			key += String::Format("%ss%d_%d_b%d_%02x%02x%02x%02x", key.IsEmpty() ? "" : "_", (int)off.x, (int)off.y,
								  (int)(float)(*shadow)["blur"], c.r, c.g, c.b, c.a);
		}
		if (auto gradient = text.FindMember("gradient"))
		{
			Color4 a = ColorOf(gradient->GetElement(0)), b = ColorOf(gradient->GetElement(1));
			key += String::Format("%sg%02x%02x%02x_%02x%02x%02x", key.IsEmpty() ? "" : "_", a.r, a.g, a.b, b.r, b.g, b.b);
		}
		return key;
	}

	class PortUiBuilder
	{
	public:
		String stylesFolder = "DragonCrashers/UI/FontStyles/";
		int    widgets = 0;

		// Font styles for outlined and shadowed text: assets, made before the widgets that use them
		void MakeStyles(const DataValue& node)
		{
			if (auto text = node.FindMember("text"))
			{
				String key = StyleKey(*text);
				if (!key.IsEmpty() && !mStyles.Contains(key))
				{
					mStyles.Add(key);
					auto style = mmake<FontStyleAsset>();
					if (auto gradient = text->FindMember("gradient"))
						style->AddEffect<FontGradientEffect>(ColorOf(gradient->GetElement(1)), ColorOf(gradient->GetElement(0)), 90.0f);
					else
						style->AddEffect<FontColorEffect>(Color4::White());
					if (auto outline = text->FindMember("outline"))
						style->AddEffect<FontStrokeEffect>((float)(*outline)["width"], ColorOf((*outline)["color"]), 100);
					if (auto shadow = text->FindMember("shadow"))
					{
						Vec2F off = Vec2Of((*shadow)["offset"]);
						style->AddEffect<FontShadowEffect>(Math::Max(0.5f, (float)(*shadow)["blur"]), Vec2I((int)off.x, -(int)off.y),
														   ColorOf((*shadow)["color"]));
					}
					style->Save(stylesFolder + key + ".fntstyle");
				}
			}
			if (auto children = node.FindMember("children"))
			{
				for (auto& child : *children)
					MakeStyles(child);
			}
		}

		Ref<Widget> Build(const DataValue& node)
		{
			String type = node["type"].GetString();
			Ref<Widget> widget;
			Ref<Label> label;
			if (type == "Button")
				widget = mmake<Button>();
			else if (type == "Label")
				widget = label = mmake<Label>();
			else if (type == "ScrollArea")
			{
				auto area = mmake<ScrollArea>();
				area->SetClippingLayout(Layout::BothStretch());
				area->SetViewLayout(Layout::BothStretch());
				area->SetEnableScrollsHiding(true);
				widget = area;
			}
			else
				widget = mmake<Widget>();

			widgets++;
			widget->SetName(node["name"].GetString());

			Vec2F anchorMin, anchorMax;
			if (auto anchors = node.FindMember("anchors"))
			{
				anchorMin = Vec2Of(*anchors, 0);
				anchorMax = Vec2Of(*anchors, 2);
			}
			const DataValue& rect = node["rect"];
			widget->layout->anchorMin = anchorMin;
			widget->layout->anchorMax = anchorMax;
			widget->layout->offsetMin = Vec2Of(rect, 0);
			widget->layout->offsetMax = Vec2Of(rect, 2);

			if (auto pivot = node.FindMember("pivot"))
				widget->transform->SetPivot2D(Vec2Of(*pivot));
			if (auto angle = node.FindMember("angle"))
				widget->transform->angle = Math::Deg2rad((float)*angle);
			if (auto scale = node.FindMember("scale"))
				widget->transform->scale = Vec2Of(*scale);

			widget->SetDrawingDepthInheritFromParent(true);

			if (auto layers = node.FindMember("layers"))
			{
				// a label's own text layer is made first: its backgrounds go below it
				mLayerDepth = label ? -10.0f : 0.0f;
				for (auto& layer : *layers)
					AddLayer(widget, layer);
			}

			if (auto text = node.FindMember("text"))
				SetupText(widget, label, *text);

			if (auto opacity = node.FindMember("opacity"))
				widget->SetTransparency((float)*opacity);
			if (auto enabled = node.FindMember("enabled"))
				widget->SetEnabledForcible((bool)*enabled);
			if (node.FindMember("clip"))
				widget->AddComponent<ScissorClippingComponent>();

			if (auto children = node.FindMember("children"))
			{
				for (auto& child : *children)
					widget->AddChild(Build(child));
			}

			return widget;
		}

	private:
		Vector<String> mStyles;
		float          mLayerDepth = 0.0f;

		void AddLayer(const Ref<Widget>& widget, const DataValue& layer)
		{
			String kind = layer["kind"].GetString();
			String name = layer["name"].GetString();
			Ref<WidgetLayer> added;
			if (kind == "color")
			{
				auto sprite = mmake<Sprite>(Color4::White());
				sprite->SetColor(ColorOf(layer["color"]));
				added = widget->AddLayer(name, sprite, Layout::BothStretch(), mLayerDepth);
			}
			else if (kind == "sprite")
			{
				auto sprite = mmake<Sprite>(AssetRef<ImageAsset>(String(layer["asset"].GetString())));
				if (auto color = layer.FindMember("color"))
					sprite->SetColor(ColorOf(*color));

				String mode = layer.FindMember("mode") ? String(layer["mode"].GetString()) : String("Default");
				if (mode == "Sliced")
				{
					const DataValue& slice = layer["slice"];
					sprite->SetMode(SpriteMode::Sliced);
					sprite->SetSliceBorder(BorderI((int)F(slice, 0), (int)F(slice, 1), (int)F(slice, 2), (int)F(slice, 3)));
				}
				else if (mode == "Tiled")
				{
					sprite->SetMode(SpriteMode::Tiled);
					if (auto tile = layer.FindMember("tileScale"))
						sprite->SetTileScale((float)*tile);
				}
				else if (mode == "Fill360CW")
				{
					sprite->SetMode(SpriteMode::Fill360CW);
					sprite->SetFill(1.0f);
				}
				else
					sprite->SetMode(SpriteMode::Default);

				if (auto crop = layer.FindMember("crop"))
				{
					RectI src = sprite->GetTextureSrcRect();
					float w = (float)(src.right - src.left), h = (float)(src.bottom - src.top);
					RectI sub = src;
					sub.left = (int)(src.left + w*F(*crop, 0));
					sub.right = (int)(src.left + w*F(*crop, 2));
					sub.top = (int)(src.top + h*F(*crop, 1));
					sub.bottom = (int)(src.top + h*F(*crop, 3));
					sprite->SetTextureSrcRect(sub);
				}

				Layout layout = Layout::BothStretch();
				if (auto r = layer.FindMember("rect"))
					layout = Layout(Vec2F(), Vec2F(), Vec2Of(*r, 0), Vec2Of(*r, 2));
				added = widget->AddLayer(name, sprite, layout, mLayerDepth);
			}
			else if (kind == "border")
			{
				const DataValue& w = layer["widths"];
				Color4 color = ColorOf(layer["color"]);
				float l = F(w, 0), b = F(w, 1), r = F(w, 2), t = F(w, 3);
				auto add = [&](const String& side, const Layout& layout)
				{
					auto sprite = mmake<Sprite>(Color4::White());
					sprite->SetColor(color);
					widget->AddLayer(name + "-" + side, sprite, layout, mLayerDepth);
				};
				if (l > 0) add("left", Layout(Vec2F(0, 0), Vec2F(0, 1), Vec2F(0, 0), Vec2F(l, 0)));
				if (r > 0) add("right", Layout(Vec2F(1, 0), Vec2F(1, 1), Vec2F(-r, 0), Vec2F(0, 0)));
				if (b > 0) add("bottom", Layout(Vec2F(0, 0), Vec2F(1, 0), Vec2F(0, 0), Vec2F(0, b)));
				if (t > 0) add("top", Layout(Vec2F(0, 1), Vec2F(1, 1), Vec2F(0, -t), Vec2F(0, 0)));
			}

			if (added)
			{
				if (auto alpha = layer.FindMember("alpha"))
					added->transparency = (float)*alpha;
			}
		}

		void SetupText(const Ref<Widget>& widget, const Ref<Label>& label, const DataValue& text)
		{
			AssetRef<VectorFontAsset> font(String(text["font"].GetString()));
			int height = Math::Max(1, (int)Math::Round((float)text["size"]*kFontScale));
			Color4 color = ColorOf(text["color"]);
			String halign = text["halign"].GetString(), valign = text["valign"].GetString();
			HorAlign hor = halign == "Left" ? HorAlign::Left : (halign == "Right" ? HorAlign::Right : HorAlign::Middle);
			VerAlign ver = valign == "Top" ? VerAlign::Top : (valign == "Bottom" ? VerAlign::Bottom : VerAlign::Middle);
			bool wrap = text["wrap"];
			bool dots = text["ellipsis"];
			const DataValue& pad = text["padding"];
			Layout padded = Layout::BothStretch(F(pad, 0), F(pad, 1), F(pad, 2), F(pad, 3));
			String styleKey = StyleKey(text);
			AssetRef<FontStyleAsset> style;
			if (!styleKey.IsEmpty())
				style = AssetRef<FontStyleAsset>(stylesFolder + styleKey + ".fntstyle");

			if (label)
			{
				label->SetFontAsset(font);
				if (style)
					label->SetFontStyleAsset(style);
				label->SetHeight(height);
				label->SetColor(color);
				label->SetHorAlign(hor);
				label->SetVerAlign(ver);
				label->SetHorOverflow(dots ? Label::HorOverflow::Dots : (wrap ? Label::HorOverflow::Wrap : Label::HorOverflow::None));
				label->SetVerOverflow(Label::VerOverflow::None);
				label->SetText(WString(text["text"].GetString()));
				if (auto layer = label->GetLayer("text"))
					layer->layout = padded;
				return;
			}

			auto caption = mmake<Text>(font);
			if (style)
				caption->SetFontStyleAsset(style);
			caption->SetHeight(height);
			caption->SetColor(color);
			caption->SetHorAlign(hor);
			caption->SetVerAlign(ver);
			caption->SetWordWrap(wrap);
			caption->SetDotsEngings(dots);
			caption->SetText(WString(text["text"].GetString()));
			widget->AddLayer("caption", caption, padded);
		}
	};
}

TEST(DragonPortBuild, BuildPrototypes)
{
	const char* planPath = std::getenv("DC_PORT_PLAN");
	if (!planPath)
		GTEST_SKIP() << "tool: set DC_PORT_PLAN=<ui_plan.json> to build the ported UI prototypes";

	DataDocument plan;
	ASSERT_TRUE(plan.LoadFromFile(planPath)) << planPath;

	auto prevMode = Actor::GetDefaultCreationMode();
	Actor::SetDefaultCreationMode(ActorCreateMode::NotInScene);

	PortUiBuilder builder;
	o2FileSystem.FolderCreate(o2Assets.GetAssetsPath() + builder.stylesFolder, true);
	for (auto& proto : plan["prototypes"])
		builder.MakeStyles(proto["root"]);
	o2Assets.RebuildAssets();

	for (auto& proto : plan["prototypes"])
	{
		String path = proto["path"].GetString();
		auto root = builder.Build(proto["root"]);
		root->UpdateSelfTransform();
		root->UpdateChildrenTransforms();

		o2FileSystem.FolderCreate(o2Assets.GetAssetsPath() + o2FileSystem.GetParentPath(path), true);
		if (o2Assets.IsAssetExist(path))
		{
			AssetRef<ActorAsset> existing(path);
			existing->SetActor(root);
			existing->Save();
		}
		else
		{
			auto asset = mmake<ActorAsset>(root);
			asset->Save(path);
		}
	}

	Actor::SetDefaultCreationMode(prevMode);
	o2Assets.RebuildAssets();
	std::printf("DragonPortBuild: %d widgets\n", builder.widgets);
}

// ------------------------------------------------------------------ scenes

#include "o2/Assets/Types/JavaScriptAsset.h"
#include "o2/Assets/Types/Spine/SpineAsset.h"
#include "o2/Scene/CameraActor.h"
#include "o2/Scene/Components/ImageComponent.h"
#include "o2/Assets/Types/MaterialAsset.h"
#include "o2/Scene/Components/ScriptableComponent.h"
#include "o2/Scene/Components/SpineComponent.h"
#include "DragonCrashers/DragonBridge.h"
#include "DragonCrashers/DragonSpineComponent.h"

namespace
{
	Ref<Actor> MakeActor(const String& name, const Ref<Actor>& parent = nullptr)
	{
		auto actor = mmake<Actor>(ActorCreateMode::InScene);
		actor->SetName(name);
		if (parent)
			parent->AddChild(actor);
		return actor;
	}

	void AddScript(const Ref<Actor>& actor, const String& scriptPath)
	{
		if (!o2Assets.IsAssetExist(scriptPath))
		{
			std::printf("DragonPortBuild: no script %s yet\n", scriptPath.Data());
			return;
		}
		actor->AddComponent<ScriptableComponent>()->SetScript(AssetRef<JavaScriptAsset>(scriptPath));
	}

	Ref<Actor> AddWorldSprite(const DataValue& s, const Ref<Actor>& parent)
	{
		auto actor = MakeActor(s["name"].GetString(), parent);
		auto image = actor->AddComponent<ImageComponent>();
		image->LoadFromImage(String(s["asset"].GetString()));
		String mode = s["mode"].GetString();
		if (mode == "Tiled")
		{
			image->SetMode(SpriteMode::Tiled);
			image->SetTileScale((float)s["tileScale"]);
		}
		Color4 color = ColorOf(s["color"]);
		image->SetColor(Color4(color.r, color.g, color.b, 255));
		image->SetTransparency(color.a/255.0f);

		actor->transform->size = Vec2Of(s["size"]);
		actor->transform->pivot = Vec2Of(s["pivot"]);
		actor->transform->position = Vec2Of(s["pos"]);
		actor->transform->angle = Math::Deg2rad((float)s["angle"]);
		actor->transform->scale = Vec2Of(s["scale"]);
		actor->SetDrawingDepth((float)s["depth"]);
		return actor;
	}

	Ref<Actor> AddSpine(const String& name, const String& skeleton, const DataValue& root, const Ref<Actor>& parent, float depth)
	{
		auto actor = MakeActor(name, parent);
		actor->transform->position = Vec2Of(root["pos"]);
		actor->transform->scale = Vec2Of(root["scale"]);
		auto spine = actor->AddComponent<dragon::DragonSpineComponent>();
		spine->SetSpineAsset(AssetRef<SpineAsset>("DragonCrashers/Characters/" + skeleton + ".spine-json"));
		actor->SetDrawingDepth(depth);
		return actor;
	}

	Ref<Widget> AddUiRoot(const Vector<String>& prototypes, float depth)
	{
		auto root = mmake<Widget>(ActorCreateMode::InScene);
		root->SetName("UI");
		root->layout->anchorMin = Vec2F(0.5f, 0.5f);
		root->layout->anchorMax = Vec2F(0.5f, 0.5f);
		root->layout->offsetMin = Vec2F(-960, -540);
		root->layout->offsetMax = Vec2F(960, 540);
		root->SetDrawingDepth(depth);
		for (auto& path : prototypes)
		{
			AssetRef<ActorAsset> asset(path);
			if (!asset)
			{
				std::printf("DragonPortBuild: no prototype %s\n", path.Data());
				continue;
			}
			auto view = asset->Instantiate();
			if (auto widget = DynamicCast<Widget>(view))
				widget->SetDrawingDepthInheritFromParent(true);
			root->AddChild(view);
		}
		return root;
	}

	// Unity's 2D lights and post-processing baked by bake_lighting.py: a darkening and an additive screen overlay
	void AddLighting(const String& scene, float depth)
	{
		String darken = "DragonCrashers/Sprites/Game/Baked/LightDarken_" + scene + ".png";
		String add = "DragonCrashers/Sprites/Game/Baked/LightAdd_" + scene + ".png";
		if (!o2Assets.IsAssetExist(darken) || !o2Assets.IsAssetExist(add))
			return;

		auto lighting = MakeActor("Lighting");
		auto make = [&](const String& name, const String& image, bool additive, float d)
		{
			auto actor = MakeActor(name, lighting);
			auto sprite = actor->AddComponent<ImageComponent>();
			sprite->LoadFromImage(image);
			if (additive)
				sprite->SetMaterialAsset(AssetRef<MaterialAsset>("DragonCrashers/Materials/Additive.mat"));
			actor->transform->size = Vec2F(1920, 1080);
			actor->transform->pivot = Vec2F(0.5f, 0.5f);
			actor->transform->position = Vec2F();
			actor->SetDrawingDepth(d);
		};
		make("Darken", darken, false, depth);
		make("Add", add, true, depth + 1);
	}

	void SaveScene(const String& path)
	{
		o2Scene.UpdateAddedEntities();
		o2Scene.Save(o2Assets.GetAssetsPath() + path);
		o2Scene.Clear(true);
		o2Scene.UpdateDestroyingEntities();
	}

	void AddCamera()
	{
		auto camera = mmake<CameraActor>();
		camera->SetName("Camera");
		camera->SetFittedSize(Vec2F(1920, 1080));
		camera->fillColor = Color4(0, 0, 0, 255);
	}
}

TEST(DragonPortBuild, BuildScenes)
{
	const char* planPath = std::getenv("DC_PORT_SCENES");
	if (!planPath)
		GTEST_SKIP() << "tool: set DC_PORT_SCENES=<scene_plan.json> to build the ported scenes";

	DataDocument plan;
	ASSERT_TRUE(plan.LoadFromFile(planPath)) << planPath;
	dragon::RegisterDragonJsApi();

	o2Scene.Clear(true);
	o2Scene.UpdateDestroyingEntities();

	// Main menu
	{
		MakeActor("Bootstrap")->AddComponent<dragon::DragonBootstrapComponent>();
		AddCamera();
		auto world = MakeActor("World");
		world->SetDrawingDepth(-100);
		for (auto& s : plan["MainMenu"]["sprites"])
			AddWorldSprite(s, world);
		struct PreviewDef { const char* id; const char* skeleton; };
		for (auto def : { PreviewDef{ "SirJarek", "Knight" }, PreviewDef{ "WolfmanOriz", "Wolfman" },
						  PreviewDef{ "WitchGiorgia", "Witch" }, PreviewDef{ "TheNecromancer", "Skeleton_B" } })
		{
			auto preview = AddSpine(String("CharPreview_") + def.id, def.skeleton, plan["MainMenu"]["preview"], world, -50);
			preview->SetEnabled(false);
		}
		String ui = "DragonCrashers/UI/MainMenu/";
		auto uiRoot = AddUiRoot({ ui + "Background.proto", ui + "HomeScreen.proto", ui + "CharScreen.proto", ui + "InfoScreen.proto",
								  ui + "MailScreen.proto", ui + "ShopScreen.proto", ui + "MenuBar.proto", ui + "OptionsBar.proto",
								  ui + "InventoryScreen.proto", ui + "SettingsScreen.proto", ui + "PopUpText.proto" }, 1000);
		AddScript(uiRoot, "Scripts/DragonCrashers/MainMenu.js");
		AddLighting("Menu", -10);
		SaveScene("DragonCrashers/MainMenu.scn");
	}

	// Battle
	{
		MakeActor("Bootstrap")->AddComponent<dragon::DragonBootstrapComponent>();
		AddCamera();
		auto world = MakeActor("World");
		world->SetDrawingDepth(-100);
		for (auto& s : plan["Game"]["sprites"])
			AddWorldSprite(s, world);

		struct UnitDef { const char* unit; const char* skeleton; };
		for (auto def : { UnitDef{ "Unit_Knight_Jarek", "Knight" }, UnitDef{ "Unit_Witch_Giorgia", "Witch" },
						  UnitDef{ "Unit_Wolfman_Oriz", "Wolfman" }, UnitDef{ "Unit_Dragon_Rustum", "Dragon" } })
		{
			const DataValue& u = plan["Game"]["units"][def.unit];
			Vec2F pos = Vec2Of(u["spineRoot"]["pos"]);
			auto unit = AddSpine(def.unit, def.skeleton, u["spineRoot"], world, 10000 - pos.y*0.01f);
			unit->transform->position = pos;
		}

		AddLighting("Game", 30000);
		auto fxRoot = AddUiRoot({}, 50000);
		fxRoot->SetName("FX");
		String ui = "DragonCrashers/UI/Game/";
		auto uiRoot = AddUiRoot({ ui + "BossHealthBar.proto", ui + "GameHUD.proto", ui + "PauseScreen.proto",
								  ui + "GameWinScreen.proto", ui + "GameLoseScreen.proto" }, 100000);
		AddScript(uiRoot, "Scripts/DragonCrashers/Battle.js");
		SaveScene("DragonCrashers/Game.scn");
	}

	o2Assets.RebuildAssets();
}
