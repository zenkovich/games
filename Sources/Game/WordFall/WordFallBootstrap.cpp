#include "o2/stdafx.h"
#include "WordFallBootstrap.h"

#include "o2/Assets/Assets.h"
#include "o2/Assets/Types/JavaScriptAsset.h"
#include "o2/Render/Sprite.h"
#include "o2/Render/Text.h"
#include "o2/Scene/Actor.h"
#include "o2/Scene/CameraActor.h"
#include "o2/Scene/Components/ImageComponent.h"
#include "o2/Scene/Components/ScriptableComponent.h"
#include "o2/Scene/Scene.h"
#include "o2/Scene/UI/WidgetLayer.h"
#include "o2/Scene/UI/WidgetLayout.h"
#include "o2/Scene/UI/Widgets/Button.h"
#include "o2/Scene/UI/Widgets/Image.h"
#include "o2/Scene/UI/Widgets/Label.h"
#include "o2/Scripts/ScriptEngine.h"
#include "o2/Utils/Math/Layout.h"

static const Vec2F kScreenSize(1280, 800);
static const String kSprites = "WordFall/Sprites/";
static const String kFont = "debugFont.ttf";

static const float kCellSize = 68.0f;
static const float kTileSize = 64.0f;
static const Vec2F kBoardCenter(0, -20);

static const Color4 kDarkTextColor(92, 57, 26);
static const Color4 kPointsTextColor(125, 82, 40);
static const Color4 kCaptionColor(255, 250, 240);
static const Color4 kAccentColor(190, 90, 25);

static const BorderI kPanelSlice(24, 24, 24, 24);
static const BorderI kButtonSlice(22, 22, 22, 22);

Ref<Actor> WordFallBootstrap::CreateBootstrapActor()
{
	auto actor = mmake<Actor>(ActorCreateMode::InScene);
	actor->SetName("Bootstrap");
	actor->AddComponent<WordFallBootstrap>();
	return actor;
}

void WordFallBootstrap::SaveBootstrapScene(const String& path)
{
	CreateBootstrapActor();
	o2Scene.UpdateAddedEntities(); // register the actor in scene roots without starting it
	o2Scene.Save(path);
}

Vec2F WordFallBootstrap::TilePosition(int column, int row)
{
	return Vec2F(kBoardCenter.x + (column - 3)*kCellSize,
				 kBoardCenter.y + (row - 3.5f)*kCellSize);
}

void WordFallBootstrap::OnStart()
{
	if (mBuilt)
		return;

	mBuilt = true;

	auto prevMode = Actor::GetDefaultCreationMode();
	Actor::SetDefaultCreationMode(ActorCreateMode::InScene);

	BuildLayersAndCamera();

	auto root = CreateContainer(nullptr, "WordFall");
	CreateSprite(root, "BG", kSprites + "background.png", "BG", Vec2F(0, 0), kScreenSize);

	BuildBoard(root);
	BuildHud(root);
	BuildWordPanel(root);
	BuildBoosters(root);
	BuildPopup(root);
	BuildGameController(root);

	Actor::SetDefaultCreationMode(prevMode);
}

void WordFallBootstrap::BuildLayersAndCamera()
{
	Vector<String> layers = { "BG", "UI" };
	for (auto& layer : layers)
		o2Scene.AddLayer(layer);

	auto camera = mmake<CameraActor>();
	camera->SetName("ui camera");
	camera->SetFittedSize(kScreenSize);
	camera->fillBackground = true;
	camera->fillColor = Color4(246, 235, 215);
	camera->drawLayers.SetLayers(layers);
}

Ref<Actor> WordFallBootstrap::CreateContainer(const Ref<Actor>& parent, const String& name)
{
	auto actor = mmake<Actor>(ActorCreateMode::InScene);
	actor->SetName(name);
	if (parent)
		parent->AddChild(actor);

	actor->transform->SetSize2D(Vec2F(0, 0));
	actor->transform->SetPosition2D(Vec2F(0, 0));
	return actor;
}

Ref<Actor> WordFallBootstrap::CreateSprite(const Ref<Actor>& parent, const String& name, const String& image,
										   const String& layer, const Vec2F& pos, const Vec2F& size,
										   const Color4& color)
{
	auto actor = mmake<Actor>(ActorCreateMode::InScene);
	actor->SetName(name);
	if (parent)
		parent->AddChild(actor);

	actor->SetLayer(layer);

	auto sprite = actor->AddComponent<ImageComponent>();
	sprite->LoadFromImage(image, false);
	if (color != Color4::White())
		sprite->SetColor(color);

	actor->transform->SetSize2D(size);
	actor->transform->SetPosition2D(pos);
	return actor;
}

void WordFallBootstrap::SetWidgetRect(const Ref<Widget>& widget, const Vec2F& pos, const Vec2F& size)
{
	widget->layout->anchorMin = Vec2F(0, 0);
	widget->layout->anchorMax = Vec2F(0, 0);
	widget->layout->offsetMin = pos - size*0.5f;
	widget->layout->offsetMax = pos + size*0.5f;
}

void WordFallBootstrap::SetWidgetDepth(const Ref<Widget>& widget, float depth)
{
	// equal depths are ordered unpredictably inside a layer — set explicit ones
	widget->SetDrawingDepthInheritFromParent(false);
	widget->SetDrawingDepth(depth);
}

Ref<Sprite> WordFallBootstrap::MakeSliced(const String& image, const BorderI& slice)
{
	auto sprite = mmake<Sprite>(image);
	sprite->SetMode(SpriteMode::Sliced);
	sprite->SetSliceBorder(slice);
	return sprite;
}

Ref<Text> WordFallBootstrap::MakeText(int height, const Color4& color)
{
	auto text = mmake<Text>(kFont);
	text->SetHeight(height);
	text->SetColor(color);
	text->SetHorAlign(HorAlign::Middle);
	text->SetVerAlign(VerAlign::Middle);
	return text;
}

Ref<Image> WordFallBootstrap::CreateImageWidget(const Ref<Actor>& parent, const String& name, const String& image,
												const Vec2F& pos, const Vec2F& size, const Color4& color,
												float depth, const BorderI& slice)
{
	auto widget = mmake<Image>();
	widget->SetName(name);
	if (parent)
		parent->AddChild(widget);

	widget->SetLayer("UI");

	auto sprite = slice != BorderI() ? MakeSliced(image, slice) : mmake<Sprite>(image);
	if (color != Color4::White())
		sprite->SetColor(color);
	widget->SetImage(sprite);

	SetWidgetRect(widget, pos, size);
	SetWidgetDepth(widget, depth);
	return widget;
}

Ref<Button> WordFallBootstrap::CreateButton(const Ref<Actor>& parent, const String& name, const Vec2F& pos,
											const Vec2F& size, const WString& caption, int captionHeight,
											const String& icon, const Vec2F& iconSize, float depth)
{
	auto button = mmake<Button>();
	button->SetName(name);
	if (parent)
		parent->AddChild(button);

	button->SetLayer("UI");

	if (!icon.IsEmpty())
		button->AddLayer("icon", mmake<Sprite>(icon), Layout::Based(BaseCorner::Center, iconSize));
	else
		button->AddLayer("back", MakeSliced(kSprites + "button_orange.png", kButtonSlice), Layout::BothStretch());

	if (!caption.IsEmpty())
	{
		auto text = MakeText(captionHeight, kCaptionColor);
		button->AddLayer("caption", text, Layout::BothStretch());
		button->SetCaption(caption);
	}

	SetWidgetRect(button, pos, size);
	SetWidgetDepth(button, depth);
	return button;
}

Ref<Button> WordFallBootstrap::CreateTileButton(const Ref<Actor>& parent, int column, int row)
{
	auto button = mmake<Button>();
	button->SetName(String::Format("Tile_%i_%i", column, row));
	parent->AddChild(button);
	button->SetLayer("UI");

	button->AddLayer("back", mmake<Sprite>(kSprites + "tile.png"), Layout::BothStretch());

	auto sel = button->AddLayer("sel", mmake<Sprite>(kSprites + "tile_selected.png"),
								Layout::BothStretch(-4, -4, -4, -4));
	sel->SetEnabled(false);

	auto letter = MakeText(30, kDarkTextColor);
	button->AddLayer("letter", letter, Layout::BothStretch(0, 4, 0, 0));

	auto points = MakeText(12, kPointsTextColor);
	points->SetHorAlign(HorAlign::Right);
	button->AddLayer("points", points, Layout::Based(BaseCorner::RightBottom, Vec2F(26, 18), Vec2F(-15, 12)));

	auto ice = button->AddLayer("ice", mmake<Sprite>(kSprites + "ice.png"), Layout::BothStretch(-2, -2, -2, -2));
	ice->SetEnabled(false);

	SetWidgetRect(button, TilePosition(column, row), Vec2F(kTileSize, kTileSize));
	SetWidgetDepth(button, 10.0f);
	return button;
}

Ref<Label> WordFallBootstrap::CreateLabel(const Ref<Actor>& parent, const String& name, const WString& text,
										  const Vec2F& rectMin, const Vec2F& rectMax, int height,
										  const Color4& color, HorAlign horAlign)
{
	auto label = mmake<Label>();
	label->SetName(name);
	if (parent)
		parent->AddChild(label);

	label->SetLayer("UI");
	label->SetFontAsset(AssetRef<FontAsset>(kFont));
	label->SetHeight(height);
	label->SetColor(color);
	label->SetHorAlign(horAlign);
	label->SetVerAlign(VerAlign::Middle);
	label->layout->anchorMin = Vec2F(0, 0);
	label->layout->anchorMax = Vec2F(0, 0);
	label->layout->offsetMin = rectMin;
	label->layout->offsetMax = rectMax;
	label->SetText(text);
	SetWidgetDepth(label, 20.0f);
	return label;
}

void WordFallBootstrap::BuildBoard(const Ref<Actor>& root)
{
	auto board = CreateContainer(root, "Board");
	for (int c = 0; c < kColumns; c++)
	{
		for (int r = 0; r < kRows; r++)
			CreateTileButton(board, c, r);
	}
}

void WordFallBootstrap::BuildHud(const Ref<Actor>& root)
{
	auto hud = CreateContainer(root, "Hud");

	CreateImageWidget(hud, "ScorePanel", kSprites + "panel_cream.png", Vec2F(-440, 360), Vec2F(330, 60),
					  Color4::White(), 2.0f, kPanelSlice);
	CreateLabel(hud, "ScoreLabel", "Очки: 0 / 300", Vec2F(-590, 340), Vec2F(-290, 380), 22, kDarkTextColor, HorAlign::Middle);

	CreateImageWidget(hud, "MovesPanel", kSprites + "panel_cream.png", Vec2F(440, 360), Vec2F(240, 60),
					  Color4::White(), 2.0f, kPanelSlice);
	CreateLabel(hud, "MovesLabel", "Ходы: 12", Vec2F(330, 340), Vec2F(550, 380), 22, kDarkTextColor, HorAlign::Middle);
}

void WordFallBootstrap::BuildWordPanel(const Ref<Actor>& root)
{
	auto wordPanel = CreateContainer(root, "WordPanel");

	CreateImageWidget(wordPanel, "Panel", kSprites + "panel_cream.png", Vec2F(-90, 295), Vec2F(560, 64),
					  Color4::White(), 5.0f, kPanelSlice);
	CreateLabel(wordPanel, "WordLabel", "", Vec2F(-360, 275), Vec2F(180, 315), 30, kDarkTextColor, HorAlign::Middle);
	CreateLabel(wordPanel, "GainLabel", "", Vec2F(140, 275), Vec2F(260, 315), 24, Color4(60, 150, 60), HorAlign::Middle);

	CreateButton(wordPanel, "AcceptBtn", Vec2F(285, 295), Vec2F(170, 56), "ПРИНЯТЬ", 20, "", Vec2F(), 21.0f);
	CreateButton(wordPanel, "ClearBtn", Vec2F(435, 295), Vec2F(110, 56), "СБРОС", 17, "", Vec2F(), 21.0f);
}

void WordFallBootstrap::BuildBoosters(const Ref<Actor>& root)
{
	auto boosters = CreateContainer(root, "Boosters");

	const char* icons[5] = { "booster_hammer.png", "booster_shuffle.png", "booster_hint.png",
							 "booster_joker.png", "booster_x2.png" };
	for (int i = 0; i < 5; i++)
	{
		Vec2F pos(-160.0f + i*80.0f, -350.0f);
		CreateButton(boosters, String::Format("Booster%i", i), pos, Vec2F(72, 72),
					 "", 0, kSprites + icons[i], Vec2F(72, 72));
		CreateLabel(boosters, String::Format("Charge%i", i), "x3",
					Vec2F(pos.x + 10, -396), Vec2F(pos.x + 44, -368), 16, kAccentColor, HorAlign::Middle);
	}

	CreateLabel(boosters, "ModeLabel", "", Vec2F(-620, -372), Vec2F(-240, -330), 16, kAccentColor, HorAlign::Left);
}

void WordFallBootstrap::BuildPopup(const Ref<Actor>& root)
{
	auto popup = CreateContainer(root, "Popup");

	CreateImageWidget(popup, "Dim", kSprites + "white.png", Vec2F(0, 0), Vec2F(1300, 820),
					  Color4(40, 25, 10, 170), 100.0f);
	CreateImageWidget(popup, "Panel", kSprites + "popup_panel.png", Vec2F(0, 10), Vec2F(520, 390),
					  Color4::White(), 101.0f);

	auto title = CreateLabel(popup, "Title", "ПОБЕДА!", Vec2F(-220, 90), Vec2F(220, 150), 40, kAccentColor, HorAlign::Middle);
	SetWidgetDepth(title, 102.0f);

	auto scoreLine = CreateLabel(popup, "ScoreLine", "", Vec2F(-220, 20), Vec2F(220, 70), 24, kDarkTextColor, HorAlign::Middle);
	SetWidgetDepth(scoreLine, 102.0f);

	CreateButton(popup, "RestartBtn", Vec2F(0, -80), Vec2F(220, 64), "ЕЩЁ РАЗ", 22, "", Vec2F(), 102.0f);

	popup->SetEnabled(false);
}

void WordFallBootstrap::BuildGameController(const Ref<Actor>& root)
{
	auto game = CreateContainer(root, "Game");

	auto scriptable = game->AddComponent<ScriptableComponent>();
	scriptable->SetScript(o2Assets.GetAssetRefByType<JavaScriptAsset>(String("Scripts/WordFallGame.js")));
}
// --- META ---

DECLARE_CLASS(WordFallBootstrap, WordFallBootstrap);
// --- END META ---
