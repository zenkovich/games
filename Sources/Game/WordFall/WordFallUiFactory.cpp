#include "o2/stdafx.h"
#include "WordFallUiFactory.h"

#include "o2/Animation/AnimationClip.h"
#include "o2/Animation/AnimationState.h"
#include "o2/Animation/Tracks/AnimationSubTrack.h"
#include "o2/Animation/Tracks/AnimationTrack.h"
#include "o2/Assets/Assets.h"
#include "o2/Assets/Types/AnimationAsset.h"
#include "o2/Assets/Types/ImageAsset.h"
#include "o2/Utils/FileSystem/FileSystem.h"
#include "o2/Render/Material.h"
#include "o2/Render/Particles/ParticlesEmitterShapes.h"
#include "o2/Scene/Components/AnimationComponent.h"
#include "o2/Scene/Components/FlightTrajectoryComponent.h"
#include "o2/Scene/Components/ParticlesEmitterComponent.h"
#include "o2/Render/Sprite.h"
#include "o2/Render/Text.h"
#include "o2/Scene/Actor.h"
#include "o2/Scene/UI/WidgetLayer.h"
#include "o2/Scene/UI/WidgetLayout.h"
#include "o2/Scene/UI/Widgets/Button.h"
#include "o2/Scene/UI/Widgets/HorizontalProgress.h"
#include "o2/Scene/UI/Widgets/Image.h"
#include "o2/Scene/UI/Widgets/Label.h"

static const String kSprites = "WordFall/Sprites/";
static const String kFont = "WordFall/game_font.ttf";
static const String kFontHeavy = "WordFall/game_font_heavy.ttf";

static const BorderI kPillSlice(26, 28, 26, 24);

const Color4 WordFallUiFactory::kDarkText(74, 48, 34);
const Color4 WordFallUiFactory::kPointsText(150, 108, 70);
const Color4 WordFallUiFactory::kCaption(255, 255, 255);
const Color4 WordFallUiFactory::kCreamText(255, 244, 220);
const Color4 WordFallUiFactory::kAccent(213, 232, 255);

// новая плитка обрезана точно по обводу — спрайт совпадает с виджетом
static const Layout kTileLayout = Layout::BothStretch(0, 0, 0, 0);

void WordFallUiFactory::SetAnchoredRect(const Ref<Widget>& widget, const Vec2F& anchor,
										const Vec2F& pos, const Vec2F& size)
{
	widget->layout->anchorMin = anchor;
	widget->layout->anchorMax = anchor;
	widget->layout->offsetMin = pos - size*0.5f;
	widget->layout->offsetMax = pos + size*0.5f;
}

void WordFallUiFactory::SetAnchors(const Ref<Widget>& widget, const Vec2F& anchorMin, const Vec2F& anchorMax,
								   const Vec2F& offsetMin, const Vec2F& offsetMax)
{
	widget->layout->anchorMin = anchorMin;
	widget->layout->anchorMax = anchorMax;
	widget->layout->offsetMin = offsetMin;
	widget->layout->offsetMax = offsetMax;
}

void WordFallUiFactory::SetDepth(const Ref<Widget>& widget, float depth)
{
	// равные глубины внутри слоя сортируются непредсказуемо — задаём явно
	widget->SetDrawingDepthInheritFromParent(false);
	widget->SetDrawingDepth(depth);
}

Ref<Sprite> WordFallUiFactory::MakeSliced(const String& image, const BorderI& slice)
{
	auto sprite = mmake<Sprite>(image);
	sprite->SetMode(SpriteMode::Sliced);
	sprite->SetSliceBorder(slice);
	return sprite;
}

Ref<Text> WordFallUiFactory::MakeText(int height, const Color4& color, bool heavy)
{
	auto text = mmake<Text>(heavy ? kFontHeavy : kFont);
	text->SetHeight(height);
	text->SetColor(color);
	text->SetHorAlign(HorAlign::Middle);
	text->SetVerAlign(VerAlign::Middle);
	return text;
}

void WordFallUiFactory::AddPressedState(const Ref<Button>& button, const String& image,
										const BorderI& slice, const Layout& layout, bool shift)
{
	auto dim = slice != BorderI() ? MakeSliced(image, slice) : mmake<Sprite>(image);
	dim->SetColor(Color4(24, 30, 52));
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

Ref<Widget> WordFallUiFactory::CreateSection(const Ref<Actor>& parent, const String& name,
											 const Vec2F& anchor, const Vec2F& pos, const Vec2F& size)
{
	auto widget = mmake<Widget>();
	widget->SetName(name);
	if (parent)
		parent->AddChild(widget);

	widget->SetLayer("UI");
	SetAnchoredRect(widget, anchor, pos, size);
	return widget;
}

Ref<Image> WordFallUiFactory::CreateImage(const Ref<Actor>& parent, const String& name, const String& image,
										  const Vec2F& anchor, const Vec2F& pos, const Vec2F& size,
										  float depth, const BorderI& slice, const Color4& color)
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

	SetAnchoredRect(widget, anchor, pos, size);
	SetDepth(widget, depth);
	return widget;
}

Ref<Image> WordFallUiFactory::CreateStretchedImage(const Ref<Actor>& parent, const String& name, const String& image,
												   const BorderF& borders, float depth,
												   const BorderI& slice, const Color4& color)
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

	widget->layout->anchorMin = Vec2F(0, 0);
	widget->layout->anchorMax = Vec2F(1, 1);
	widget->layout->offsetMin = Vec2F(-borders.left, -borders.bottom);
	widget->layout->offsetMax = Vec2F(borders.right, borders.top);
	SetDepth(widget, depth);
	return widget;
}

Ref<Label> WordFallUiFactory::CreateLabel(const Ref<Actor>& parent, const String& name, const WString& text,
										  const Vec2F& anchor, const Vec2F& pos, const Vec2F& size,
										  int height, const Color4& color, HorAlign horAlign, float depth,
										  bool heavy)
{
	auto label = mmake<Label>();
	label->SetName(name);
	if (parent)
		parent->AddChild(label);

	label->SetLayer("UI");
	label->SetFontAsset(AssetRef<FontAsset>(heavy ? kFontHeavy : kFont));
	label->SetHeight(height);
	label->SetColor(color);
	label->SetHorAlign(horAlign);
	label->SetVerAlign(VerAlign::Middle);
	SetAnchoredRect(label, anchor, pos, size);
	label->SetText(text);
	SetDepth(label, depth);
	return label;
}

Ref<Actor> WordFallUiFactory::BuildIconButtonPrototype()
{
	auto root = mmake<Widget>();
	root->SetName("IconButton");
	root->SetLayer("UI");
	SetAnchoredRect(root, Vec2F(0.5f, 0.5f), Vec2F(0, 0), Vec2F(100, 108));

	auto button = mmake<Button>();
	button->SetName("Btn");
	root->AddChild(button);
	button->SetLayer("UI");
	button->AddLayer("back", mmake<Sprite>(kSprites + "ui_btn_accept.png"), Layout::BothStretch());
	SetAnchors(button, Vec2F(0, 0), Vec2F(1, 1), Vec2F(0, 0), Vec2F(0, 0));
	AddPressedState(button, kSprites + "ui_btn_accept.png", BorderI(), Layout::BothStretch(), true);

	return root;
}

Ref<Actor> WordFallUiFactory::BuildPillButtonPrototype()
{
	auto root = mmake<Widget>();
	root->SetName("PillButton");
	root->SetLayer("UI");
	SetAnchoredRect(root, Vec2F(0.5f, 0.5f), Vec2F(0, 0), Vec2F(220, 64));

	auto button = mmake<Button>();
	button->SetName("Btn");
	root->AddChild(button);
	button->SetLayer("UI");
	button->AddLayer("back", MakeSliced(kSprites + "ui_btn_orange.png", kPillSlice), Layout::BothStretch());

	// нижний обод пилюли — визуальный центр выше геометрического
	auto text = MakeText(22, kCaption);
	button->AddLayer("caption", text, Layout::BothStretch(0, 5, 0, 0));
	button->SetCaption("КНОПКА");

	SetAnchors(button, Vec2F(0, 0), Vec2F(1, 1), Vec2F(0, 0), Vec2F(0, 0));
	AddPressedState(button, kSprites + "ui_btn_orange.png", kPillSlice, Layout::BothStretch(), true);

	return root;
}

Ref<Actor> WordFallUiFactory::BuildTaskRowPrototype()
{
	auto root = mmake<Widget>();
	root->SetName("TaskRow");
	root->SetLayer("UI");
	SetAnchoredRect(root, Vec2F(0.5f, 0.5f), Vec2F(0, 0), Vec2F(320, 30));

	auto label = CreateLabel(root, "Text", "", Vec2F(0.5f, 0.5f), Vec2F(0, 0), Vec2F(320, 30),
							 16, kCaption, HorAlign::Left, 20.0f);
	SetAnchors(label, Vec2F(0, 0), Vec2F(1, 1), Vec2F(0, 0), Vec2F(0, 0));

	return root;
}

// Виджет эффекта: один слой img с нужным спрайтом; позицию и размер ведёт FxView
static Ref<Actor> BuildFxImage(const String& name, const String& image, const Color4& color)
{
	auto widget = mmake<Widget>();
	widget->SetName(name);
	widget->SetLayer("UI");

	auto sprite = mmake<Sprite>(kSprites + image);
	if (color != Color4::White())
		sprite->SetColor(color);
	widget->AddLayer("img", sprite, Layout::BothStretch());

	WordFallUiFactory::SetAnchoredRect(widget, Vec2F(0.5f, 0.5f), Vec2F(0, 0), Vec2F(32, 32));
	return widget;
}

Ref<Actor> WordFallUiFactory::BuildFlyingLetterPrototype()
{
	// плашка буквы, летящая в прогресс-бар: траекторию ведёт FlightTrajectory,
	// анимация "flight" гонит его position, скейл и наклон, саб-треком — искры
	auto widget = mmake<Widget>();
	widget->SetName("FxFlyingLetter");
	widget->SetLayer("UI");

	widget->AddLayer("back", mmake<Sprite>(kSprites + "ui_tile.png"), kTileLayout);

	auto letter = MakeText(36, kDarkText, true);
	widget->AddLayer("letter", letter, Layout::BothStretch(0, 5, 0, 0));

	auto points = MakeText(12, kPointsText, true);
	points->SetHorAlign(HorAlign::Right);
	widget->AddLayer("points", points, Layout::Based(BaseCorner::RightBottom, Vec2F(22, 15), Vec2F(-11, 11)));

	// звезда, в которую плашка превращается по пути: чуть крупнее плашки, скрыта до полёта
	auto star = widget->AddLayer("star", mmake<Sprite>(kSprites + "ui_fx_star.png"),
								 Layout::BothStretch(-14, -14, -14, -14));
	star->SetTransparency(0.0f);

	SetAnchoredRect(widget, Vec2F(0.5f, 0.5f), Vec2F(0, 0), Vec2F(kSlotSize, kSlotSize));

	auto animation = widget->AddComponent<AnimationComponent>();

	auto trajectory = widget->AddComponent<FlightTrajectoryComponent>();
	trajectory->spline = mmake<Spline>();
	trajectory->spline->AppendKey(Vec2F(0, 0), 0.0f);
	trajectory->spline->AppendKey(Vec2F(170, 120), 90.0f);
	trajectory->spline->AppendKey(Vec2F(400, 0), 0.0f);

	// эмиттер на дочернем акторе: ParticlesEmitterComponent прямо на виджете
	// падает при клонировании (OnTransformUpdated на недостроенном WidgetLayout)
	auto sparks = mmake<Actor>(ActorCreateMode::NotInScene);
	sparks->SetName("Sparks");
	widget->AddChild(sparks);
	sparks->SetLayer("UI");
	sparks->transform->SetSize2D(Vec2F(10, 10));

	auto emitter = sparks->AddComponent<ParticlesEmitterComponent>();
	auto source = mmake<SingleSpriteParticleSource>();
	source->image = o2Assets.GetAssetRefByType<ImageAsset>(kSprites + "vfx_spark.png");
	emitter->SetParticlesSource(source);
	emitter->SetShape(mmake<CircleParticlesEmitterShape>());
	emitter->SetDuration(kFlightDuration);
	emitter->SetParticlesLifetime(0.4f);
	emitter->SetParticlesPerSecond(90.0f);
	emitter->SetMaxParticles(60);
	emitter->SetInitialSpeed(80.0f);
	emitter->SetInitialSpeedRange(40.0f);
	emitter->SetInitialSize(0.35f);
	emitter->SetInitialSizeRange(0.15f);
	emitter->SetInitialAngle(0.0f);
	emitter->SetInitialAngleRange(360.0f);
	emitter->SetLoop(Loop::None);
	emitter->Stop();

	// пучок искр в стороны при влёте звезды в прогресс-бар
	auto burstActor = mmake<Actor>(ActorCreateMode::NotInScene);
	burstActor->SetName("Burst");
	widget->AddChild(burstActor);
	burstActor->SetLayer("UI");
	burstActor->transform->SetSize2D(Vec2F(10, 10));

	auto burst = burstActor->AddComponent<ParticlesEmitterComponent>();
	auto burstSource = mmake<SingleSpriteParticleSource>();
	burstSource->image = o2Assets.GetAssetRefByType<ImageAsset>(kSprites + "vfx_spark.png");
	burst->SetParticlesSource(burstSource);
	burst->SetShape(mmake<CircleParticlesEmitterShape>());
	burst->SetDuration(0.1f);
	burst->SetParticlesLifetime(0.35f);
	burst->SetParticlesPerSecond(300.0f);
	burst->SetMaxParticles(30);
	burst->SetInitialSpeed(260.0f);
	burst->SetInitialSpeedRange(120.0f);
	burst->SetInitialSize(0.35f);
	burst->SetInitialSizeRange(0.15f);
	burst->SetInitialAngle(0.0f);
	burst->SetInitialAngleRange(360.0f);
	burst->SetLoop(Loop::None);
	burst->Stop();

	auto clip = mmake<AnimationClip>();

	*clip->AddTrack<float>("component/o2::FlightTrajectoryComponent/position") =
		AnimationTrack<float>::EaseInOut(0.0f, 1.0f, kFlightDuration);

	// Vec2F-трек: сплайн значений (вспухание в середине пути) + кривая времени
	auto scale = clip->AddTrack<Vec2F>("transform/scale2D");
	scale->spline->AppendKey(Vec2F(1.0f, 1.0f));
	scale->spline->AppendKey(Vec2F(1.18f, 1.18f));
	scale->spline->AppendKey(Vec2F(0.42f, 0.42f));
	*scale->timeCurve = Curve::EaseInOut(0.0f, 1.0f, kFlightDuration);

	// лёгкий крен по дуге
	auto angle = clip->AddTrack<float>("transform/angleDegrees");
	angle->AddKey(0.0f, 0.0f);
	angle->AddKey(kFlightDuration*0.4f, 10.0f);
	angle->AddKey(kFlightDuration, -6.0f);

	// вторая половина пути: плашка растворяется, звезда проявляется и влетает в бар
	const char* tileLayers[3] = { "back", "letter", "points" };
	for (auto layerName : tileLayers)
	{
		auto fade = clip->AddTrack<float>(String("layer/") + layerName + "/transparency");
		fade->AddKey(0.0f, 1.0f);
		fade->AddKey(kFlightDuration*0.5f, 1.0f);
		fade->AddKey(kFlightDuration*0.8f, 0.0f);
	}

	auto starFade = clip->AddTrack<float>("layer/star/transparency");
	starFade->AddKey(0.0f, 0.0f);
	starFade->AddKey(kFlightDuration*0.45f, 0.0f);
	starFade->AddKey(kFlightDuration*0.7f, 1.0f);
	starFade->AddKey(kFlightDuration, 1.0f);
	starFade->AddKey(kFlightDuration + 0.08f, 0.0f); // звезда влетела в бар и погасла

	clip->AddTrack("child/Sparks/component/o2::ParticlesEmitterComponent", TypeOf(ParticlesEmitterComponent));

	// пучок искр в момент влёта
	auto burstTrack = DynamicCast<AnimationSubTrack>(
		clip->AddTrack("child/Burst/component/o2::ParticlesEmitterComponent", TypeOf(ParticlesEmitterComponent)));
	burstTrack->SetBeginTime(kFlightDuration);

	// стейт сериализует анимацию ссылкой на ассет — встроенный в память клип
	// потерялся бы при загрузке прототипа с диска, поэтому клип сохраняется .anim-ом
	static const String kFlightAnim = "WordFall/Prototypes/FxFlyingLetterFlight.anim";
	auto animAsset = o2Assets.GetAssetRefByType<AnimationAsset>(kFlightAnim);
#if defined PLATFORM_WINDOWS || defined PLATFORM_MAC || defined PLATFORM_LINUX
	if (!animAsset)
	{
		String fullPath = o2Assets.GetAssetsPath() + kFlightAnim;
		o2FileSystem.FolderCreate(o2FileSystem.GetParentPath(fullPath), false);
		if (!o2FileSystem.IsFileExist(fullPath))
		{
			mmake<AnimationAsset>(clip)->Save(kFlightAnim);
			animAsset = o2Assets.GetAssetRefByType<AnimationAsset>(kFlightAnim);
		}
	}
#endif

	Ref<IAnimationState> state;
	if (animAsset)
	{
		auto assetState = mmake<AnimationState>("flight");
		assetState->SetAnimation(animAsset);
		state = animation->AddState(assetState);
	}
	else // ассет недоступен (headless-тесты) — клип из памяти
		state = animation->AddState("flight", clip, AnimationMask(), 1.0f);

	state->autoPlay = false;

	widget->SetEnabled(false);
	return widget;
}

Ref<Actor> WordFallUiFactory::BuildFxFlashPrototype()
{
	return BuildFxImage("FxFlash", "ui_fx_flash.png", Color4::White());
}

Ref<Actor> WordFallUiFactory::BuildFxStarPrototype()
{
	return BuildFxImage("FxStar", "ui_fx_star.png", Color4::White());
}

Ref<Actor> WordFallUiFactory::BuildFxGlowPrototype()
{
	// бело-голубое аддитивное свечение летящих очков
	auto widget = BuildFxImage("FxGlow", "ui_fx_flash.png", Color4(190, 225, 255));

	if (auto layer = DynamicCast<Widget>(widget)->GetLayer("img"))
	{
		auto additive = Material::CreateFromBuiltinShaders("Default");
		if (additive)
		{
			additive->SetBlendMode(BlendMode::Add);
			additive->Build();
			layer->GetDrawable()->SetMaterial(additive);
		}
	}

	return widget;
}

Ref<Actor> WordFallUiFactory::BuildFxBeamPrototype()
{
	return BuildFxImage("FxBeam", "ui_bar_fill.png", Color4(255, 190, 70));
}

Ref<HorizontalProgress> WordFallUiFactory::CreateProgressBar(const Ref<Actor>& parent, const String& name,
															 const String& fillImage, const Vec2F& anchor,
															 const Vec2F& pos, const Vec2F& size, float depth)
{
	auto progress = mmake<HorizontalProgress>();
	progress->SetName(name);
	if (parent)
		parent->AddChild(progress);

	progress->SetLayer("UI");
	// 9-slice: скруглённые торцы заливки не тянутся, растягивается середина
	progress->AddLayer("bar", MakeSliced(fillImage, BorderI(17, 0, 17, 0)), Layout::BothStretch());

	SetAnchoredRect(progress, anchor, pos, size);
	SetDepth(progress, depth);
	progress->SetValueRange(0, 1);
	progress->SetValueForcible(0);
	return progress;
}

Ref<Actor> WordFallUiFactory::BuildTilePrototype()
{
	auto button = mmake<Button>();
	button->SetName("Tile");
	button->SetLayer("UI");

	button->AddLayer("back", mmake<Sprite>(kSprites + "ui_tile.png"), kTileLayout);

	auto sel = button->AddLayer("sel", mmake<Sprite>(kSprites + "ui_tile_sel.png"), kTileLayout);
	sel->SetEnabled(false);

	// лёд под буквой: буква поверх кристалла синеет цветом
	auto ice = button->AddLayer("ice", mmake<Sprite>(kSprites + "ui_ice.png"), kTileLayout);
	ice->SetEnabled(false);

	auto letter = MakeText(44, kDarkText, true);
	button->AddLayer("letter", letter, Layout::BothStretch(0, 6, 0, 0));

	auto points = MakeText(15, kPointsText, true);
	points->SetHorAlign(HorAlign::Right);
	button->AddLayer("points", points, Layout::Based(BaseCorner::RightBottom, Vec2F(30, 20), Vec2F(-16, 16)));

	const char* powerups[3] = { "bomb", "rocket", "wand" };
	for (auto name : powerups)
	{
		auto powerup = button->AddLayer(name, mmake<Sprite>(kSprites + "powerup_" + String(name) + ".png"),
										Layout::Based(BaseCorner::LeftTop, Vec2F(32, 32), Vec2F(17, -15)));
		powerup->SetEnabled(false);
	}

	SetAnchoredRect(button, Vec2F(0.5f, 0.5f), Vec2F(0, 0), Vec2F(kTileSize, kTileSize));
	AddPressedState(button, kSprites + "ui_tile.png", BorderI(), kTileLayout, false);
	return button;
}

Ref<Actor> WordFallUiFactory::BuildWordSlotPrototype()
{
	// кнопка: клик по слоту в лотке снимает выбор с буквы (и хвоста после неё)
	auto widget = mmake<Button>();
	widget->SetName("WordSlot");
	widget->SetLayer("UI");

	widget->AddLayer("back", mmake<Sprite>(kSprites + "ui_tile.png"), kTileLayout);

	auto letter = MakeText(36, kDarkText, true);
	widget->AddLayer("letter", letter, Layout::BothStretch(0, 5, 0, 0));

	auto points = MakeText(12, kPointsText, true);
	points->SetHorAlign(HorAlign::Right);
	widget->AddLayer("points", points, Layout::Based(BaseCorner::RightBottom, Vec2F(22, 15), Vec2F(-11, 11)));

	SetAnchoredRect(widget, Vec2F(0.5f, 0.5f), Vec2F(0, 0), Vec2F(kSlotSize, kSlotSize));
	widget->SetEnabled(false);
	return widget;
}

Ref<Actor> WordFallUiFactory::BuildBoosterPrototype()
{
	auto root = mmake<Widget>();
	root->SetName("Booster");
	root->SetLayer("UI");
	SetAnchoredRect(root, Vec2F(0.5f, 0.5f), Vec2F(0, 0), Vec2F(120, 114));

	auto button = mmake<Button>();
	button->SetName("Btn");
	root->AddChild(button);
	button->SetLayer("UI");
	button->AddLayer("icon", mmake<Sprite>(kSprites + "ui_booster_hammer.png"), Layout::BothStretch());
	button->layout->anchorMin = Vec2F(0, 0);
	button->layout->anchorMax = Vec2F(1, 1);
	button->layout->offsetMin = Vec2F(0, 0);
	button->layout->offsetMax = Vec2F(0, 0);
	SetDepth(button, 10.0f);
	AddPressedState(button, kSprites + "ui_booster_hammer.png", BorderI(), Layout::BothStretch(), true);

	auto badge = mmake<Image>();
	badge->SetName("Badge");
	root->AddChild(badge);
	badge->SetLayer("UI");
	badge->SetImage(mmake<Sprite>(kSprites + "ui_badge.png"));
	SetAnchoredRect(badge, Vec2F(1, 1), Vec2F(-14, -16), Vec2F(36, 36));
	SetDepth(badge, 12.0f);

	auto charge = mmake<Label>();
	charge->SetName("Charge");
	root->AddChild(charge);
	charge->SetLayer("UI");
	charge->SetFontAsset(AssetRef<FontAsset>(kFontHeavy));
	charge->SetHeight(16);
	charge->SetColor(kCreamText);
	charge->SetHorAlign(HorAlign::Middle);
	charge->SetVerAlign(VerAlign::Middle);
	SetAnchoredRect(charge, Vec2F(1, 1), Vec2F(-14, -15), Vec2F(34, 34));
	charge->SetText("3");
	SetDepth(charge, 13.0f);

	return root;
}
