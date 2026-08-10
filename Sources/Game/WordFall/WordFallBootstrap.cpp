#include "o2/stdafx.h"
#include "WordFallBootstrap.h"

#include "o2/Animation/AnimationClip.h"
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

static const Vec2F kScreenSize(1280, 800);
static const String kSprites = "WordFall/Sprites/";
static const String kFont = "WordFall/game_font.ttf";

static const float kCellSize = 68.0f;
static const float kTileSize = 64.0f;
static const Vec2F kBoardCenter(0, -20);

static const Color4 kDarkTextColor(107, 66, 24);
static const Color4 kPointsTextColor(138, 90, 42);
static const Color4 kCaptionColor(255, 250, 240);
static const Color4 kCreamTextColor(255, 240, 214);
static const Color4 kAccentColor(198, 106, 31);

static const BorderI kCreamSlice(28, 30, 28, 26);
static const BorderI kBoardSlice(36, 36, 36, 36);
static const BorderI kPillSlice(26, 28, 26, 24);
static const BorderI kBarTrackSlice(18, 17, 18, 17);
static const BorderI kBarFillSlice(15, 14, 15, 14);

// плитка с запечённой тенью занимает ~91% канвы спрайта — слой расширен,
// чтобы тень не сжималась в узкую полоску
static const Layout kTileLayout = Layout::BothStretch(-5, -5, -5, -5);

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
	BuildTasks(root);
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

// Вдавливание: тот же спрайт кнопки, тонированный тёмным, проявляется поверх
// (затемнение по силуэту), плюс анимация сдвига виджета вниз. Звать после
// SetWidgetRect — офсеты кнопки попадают в треки анимации. Для плиток сдвиг
// отключён: их layout анимирует JS при падении.
void WordFallBootstrap::AddPressedState(const Ref<Button>& button, const String& image,
										const BorderI& slice, const Layout& layout, bool shift)
{
	auto dim = slice != BorderI() ? MakeSliced(image, slice) : mmake<Sprite>(image);
	dim->SetColor(Color4(58, 34, 12));
	button->AddLayer("pressed", dim, layout);

	auto clip = mmake<AnimationClip>();
	*clip->AddTrack<float>("layer/pressed/transparency") = AnimationTrack<float>::EaseInOut(0.0f, 0.35f, 0.06f);

	if (shift)
	{
		Vec2F offMin = button->layout->GetOffsetMin();
		Vec2F offMax = button->layout->GetOffsetMax();
		Vec2F pressShift(0, -4);
		*clip->AddTrack<Vec2F>("layout/offsetMin") = AnimationTrack<Vec2F>::EaseInOut(offMin, offMin + pressShift, 0.06f);
		*clip->AddTrack<Vec2F>("layout/offsetMax") = AnimationTrack<Vec2F>::EaseInOut(offMax, offMax + pressShift, 0.06f);
	}

	button->AddState("pressed", clip);
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
											float depth)
{
	auto button = mmake<Button>();
	button->SetName(name);
	if (parent)
		parent->AddChild(button);

	button->SetLayer("UI");

	button->AddLayer("back", MakeSliced(kSprites + "ui_btn_orange.png", kPillSlice), Layout::BothStretch());

	if (!caption.IsEmpty())
	{
		auto text = MakeText(captionHeight, kCaptionColor);
		// нижний обод пилюли — визуальный центр выше геометрического
		button->AddLayer("caption", text, Layout::BothStretch(0, 5, 0, 0));
		button->SetCaption(caption);
	}

	SetWidgetRect(button, pos, size);
	SetWidgetDepth(button, depth);
	AddPressedState(button, kSprites + "ui_btn_orange.png", kPillSlice, Layout::BothStretch(), true);
	return button;
}

Ref<Button> WordFallBootstrap::CreateBoosterButton(const Ref<Actor>& parent, const String& name, const String& key,
												   const Vec2F& pos, const Vec2F& size, float depth)
{
	auto button = mmake<Button>();
	button->SetName(name);
	if (parent)
		parent->AddChild(button);

	button->SetLayer("UI");
	button->AddLayer("icon", mmake<Sprite>(kSprites + "ui_booster_" + key + ".png"), Layout::BothStretch());

	SetWidgetRect(button, pos, size);
	SetWidgetDepth(button, depth);
	AddPressedState(button, kSprites + "ui_booster_" + key + ".png", BorderI(), Layout::BothStretch(), true);
	return button;
}

Ref<Button> WordFallBootstrap::CreateTileButton(const Ref<Actor>& parent, int column, int row)
{
	auto button = mmake<Button>();
	button->SetName(String::Format("Tile_%i_%i", column, row));
	parent->AddChild(button);
	button->SetLayer("UI");

	button->AddLayer("back", mmake<Sprite>(kSprites + "ui_tile.png"), kTileLayout);

	auto sel = button->AddLayer("sel", mmake<Sprite>(kSprites + "ui_tile_sel.png"), kTileLayout);
	sel->SetEnabled(false);

	// лёд под буквой: буква остаётся читаемой поверх кристалла (синеет цветом)
	auto ice = button->AddLayer("ice", mmake<Sprite>(kSprites + "ui_ice.png"), kTileLayout);
	ice->SetEnabled(false);

	auto letter = MakeText(30, kDarkTextColor);
	button->AddLayer("letter", letter, Layout::BothStretch(0, 4, 0, 0));

	auto points = MakeText(13, kPointsTextColor);
	points->SetHorAlign(HorAlign::Right);
	button->AddLayer("points", points, Layout::Based(BaseCorner::RightBottom, Vec2F(26, 18), Vec2F(-13, 13)));

	const char* powerups[3] = { "bomb", "rocket", "wand" };
	for (auto name : powerups)
	{
		auto powerup = button->AddLayer(name, mmake<Sprite>(kSprites + "powerup_" + String(name) + ".png"),
										Layout::Based(BaseCorner::LeftTop, Vec2F(28, 28), Vec2F(14, -12)));
		powerup->SetEnabled(false);
	}

	SetWidgetRect(button, TilePosition(column, row), Vec2F(kTileSize, kTileSize));

	// верхние ряды рисуются позже — их запечённая тень ложится на плитки ниже
	SetWidgetDepth(button, 10.0f + row*0.1f);
	AddPressedState(button, kSprites + "ui_tile.png", BorderI(), kTileLayout, false);
	return button;
}

Ref<Widget> WordFallBootstrap::CreateWordTile(const Ref<Actor>& parent, const String& name, float depth)
{
	auto widget = mmake<Widget>();
	widget->SetName(name);
	parent->AddChild(widget);
	widget->SetLayer("UI");

	widget->AddLayer("back", mmake<Sprite>(kSprites + "ui_tile.png"), kTileLayout);

	auto letter = MakeText(24, kDarkTextColor);
	widget->AddLayer("letter", letter, Layout::BothStretch(0, 3, 0, 0));

	auto points = MakeText(10, kPointsTextColor);
	points->SetHorAlign(HorAlign::Right);
	widget->AddLayer("points", points, Layout::Based(BaseCorner::RightBottom, Vec2F(18, 13), Vec2F(-9, 9)));

	SetWidgetRect(widget, Vec2F(0, 295), Vec2F(48, 48));
	SetWidgetDepth(widget, depth);
	widget->SetEnabled(false);
	return widget;
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

	// низ длиннее: в нижней границе слайса лежит запечённая тень — иначе видимый
	// край панели подрезает нижний ряд плиток
	CreateImageWidget(board, "Panel", kSprites + "ui_panel_board.png", Vec2F(0, -30), Vec2F(500, 576),
					  Color4::White(), 1.0f, kBoardSlice);

	for (int c = 0; c < kColumns; c++)
	{
		for (int r = 0; r < kRows; r++)
			CreateTileButton(board, c, r);
	}
}

void WordFallBootstrap::BuildHud(const Ref<Actor>& root)
{
	auto hud = CreateContainer(root, "Hud");

	CreateImageWidget(hud, "TopPanel", kSprites + "ui_panel_cream.png", Vec2F(0, 364), Vec2F(780, 64),
					  Color4::White(), 2.0f, kCreamSlice);

	CreateLabel(hud, "LevelLabel", "Уровень 1", Vec2F(-375, 343), Vec2F(-245, 383), 20, kAccentColor, HorAlign::Middle);

	CreateImageWidget(hud, "BarTrack", kSprites + "ui_bar_track.png", Vec2F(-100, 363), Vec2F(280, 36),
					  Color4::White(), 3.0f, kBarTrackSlice);
	CreateImageWidget(hud, "BarFill", kSprites + "ui_bar_fill.png", Vec2F(-100, 363), Vec2F(274, 30),
					  Color4::White(), 4.0f, kBarFillSlice);
	CreateLabel(hud, "ScoreLabel", "0/250", Vec2F(-240, 345), Vec2F(40, 381), 18, kCaptionColor, HorAlign::Middle);

	CreateImageWidget(hud, "MovesBox", kSprites + "ui_bar_track.png", Vec2F(160, 363), Vec2F(150, 36),
					  Color4::White(), 3.0f, kBarTrackSlice);
	CreateLabel(hud, "MovesLabel", "Ходы: 12", Vec2F(85, 345), Vec2F(235, 381), 18, kCreamTextColor, HorAlign::Middle);
}

void WordFallBootstrap::BuildTasks(const Ref<Actor>& root)
{
	auto tasks = CreateContainer(root, "Tasks");

	CreateImageWidget(tasks, "Panel", kSprites + "ui_panel_cream.png", Vec2F(-450, 90), Vec2F(350, 310),
					  Color4::White(), 2.0f, kCreamSlice);
	CreateLabel(tasks, "Title", "ЗАДАЧИ", Vec2F(-610, 200), Vec2F(-290, 240), 24, kAccentColor, HorAlign::Middle);

	for (int i = 0; i < kMaxTasks; i++)
	{
		float top = 175.0f - i*44.0f;
		CreateLabel(tasks, String::Format("Task%i", i), "", Vec2F(-595, top - 36), Vec2F(-305, top), 16,
					kDarkTextColor, HorAlign::Left);
	}
}

void WordFallBootstrap::BuildWordPanel(const Ref<Actor>& root)
{
	auto wordPanel = CreateContainer(root, "WordPanel");

	// единый задник по ширине поля с выемкой-лотком под плашки (из концепта);
	// кнопки ПРИНЯТЬ и крестик — поверх правой части
	CreateImageWidget(wordPanel, "Panel", kSprites + "ui_wordbar.png", Vec2F(0, 295), Vec2F(500, 72),
					  Color4::White(), 5.0f);

	for (int i = 0; i < kWordSlots; i++)
		CreateWordTile(wordPanel, String::Format("Slot%i", i), 25.0f);

	for (int i = 0; i < kFlyers; i++)
		CreateWordTile(wordPanel, String::Format("Flyer%i", i), 45.0f);

	CreateLabel(wordPanel, "GainLabel", "", Vec2F(275, 271), Vec2F(420, 319), 24, Color4(60, 150, 60), HorAlign::Left);

	CreateButton(wordPanel, "AcceptBtn", Vec2F(128, 295), Vec2F(120, 52), "ПРИНЯТЬ", 17, 21.0f);

	// сброс — круглая кнопка-крестик в стиле «Принять»
	auto clear = mmake<Button>();
	clear->SetName("ClearBtn");
	wordPanel->AddChild(clear);
	clear->SetLayer("UI");
	clear->AddLayer("back", mmake<Sprite>(kSprites + "ui_btn_cross.png"), Layout::BothStretch());
	SetWidgetRect(clear, Vec2F(218, 295), Vec2F(46, 46));
	SetWidgetDepth(clear, 21.0f);
	AddPressedState(clear, kSprites + "ui_btn_cross.png", BorderI(), Layout::BothStretch(), true);
}

void WordFallBootstrap::BuildBoosters(const Ref<Actor>& root)
{
	auto boosters = CreateContainer(root, "Boosters");

	CreateImageWidget(boosters, "Panel", kSprites + "ui_panel_cream.png", Vec2F(0, -368), Vec2F(660, 64),
					  Color4::White(), 2.0f, kCreamSlice);

	const char* keys[5] = { "hammer", "shuffle", "hint", "joker", "x2" };
	for (int i = 0; i < 5; i++)
	{
		Vec2F pos(-180.0f + i*90.0f, -350.0f);
		CreateBoosterButton(boosters, String::Format("Booster%i", i), keys[i], pos, Vec2F(78, 78), 10.0f);

		CreateImageWidget(boosters, String::Format("Badge%i", i), kSprites + "ui_badge.png",
						  pos + Vec2F(26, 26), Vec2F(32, 32), Color4::White(), 12.0f);
		auto charge = CreateLabel(boosters, String::Format("Charge%i", i), "3",
								  pos + Vec2F(10, 9), pos + Vec2F(42, 43), 15, kCreamTextColor, HorAlign::Middle);
		SetWidgetDepth(charge, 13.0f);
	}

	CreateLabel(boosters, "ModeLabel", "", Vec2F(-610, -120), Vec2F(-290, -80), 16, kAccentColor, HorAlign::Left);
}

void WordFallBootstrap::BuildPopup(const Ref<Actor>& root)
{
	auto popup = CreateContainer(root, "Popup");

	CreateImageWidget(popup, "Dim", kSprites + "white.png", Vec2F(0, 0), Vec2F(1300, 820),
					  Color4(40, 25, 10, 170), 100.0f);
	CreateImageWidget(popup, "Panel", kSprites + "popup_panel.png", Vec2F(0, 10), Vec2F(520, 390),
					  Color4::White(), 101.0f);

	auto title = CreateLabel(popup, "Title", "ПОБЕДА!", Vec2F(-220, 90), Vec2F(220, 150), 30, kAccentColor, HorAlign::Middle);
	SetWidgetDepth(title, 102.0f);

	auto scoreLine = CreateLabel(popup, "ScoreLine", "", Vec2F(-220, 20), Vec2F(220, 70), 24, kDarkTextColor, HorAlign::Middle);
	SetWidgetDepth(scoreLine, 102.0f);

	CreateButton(popup, "RestartBtn", Vec2F(0, -80), Vec2F(220, 64), "ЕЩЁ РАЗ", 22, 102.0f);

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
