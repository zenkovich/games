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
#include "o2/Render/Render.h"
#include "o2/Render/Particles/ParticlesEffects.h"
#include "o2/Render/Particles/ParticlesEmitterShapes.h"
#include "o2/Utils/Math/ColorGradient.h"
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

// Сохранённый клип-ассет с защитой от «призрака» дерева ассетов (запись без данных)
static AssetRef<AnimationAsset> EnsureAnimAsset(const String& path, const Ref<AnimationClip>& clip)
{
	auto asset = o2Assets.GetAssetRefByType<AnimationAsset>(path);
	auto isValid = [&]() { return asset && asset->animation && !asset->animation->GetTracks().IsEmpty(); };

#if defined PLATFORM_WINDOWS || defined PLATFORM_MAC || defined PLATFORM_LINUX
	if (!isValid())
	{
		String fullPath = o2Assets.GetAssetsPath() + path;
		o2FileSystem.FolderCreate(o2FileSystem.GetParentPath(fullPath), false);
		mmake<AnimationAsset>(clip)->Save(path);
		asset = o2Assets.GetAssetRefByType<AnimationAsset>(path);
	}
#endif

	return isValid() ? asset : AssetRef<AnimationAsset>();
}

// Градиент затухания частиц от заданного цвета к прозрачному
Ref<Material> WordFallUiFactory::AdditiveMaterial()
{
	static Ref<Material> material;
	if (!material && Render::IsSingletonInitialzed() && o2Render.GetDefaultMaterial())
	{
		material = mmake<Material>(*o2Render.GetDefaultMaterial());
		material->SetBlendMode(BlendMode::Add);
	}
	return material;
}

static Ref<ParticlesColorEffect> MakeFadeGradient(const Color4& from, const Color4& mid)
{
	auto gradient = mmake<ColorGradient>();
	gradient->InsertKey(0.0f, from);
	gradient->InsertKey(0.35f, Color4(mid.r, mid.g, mid.b, 210));
	gradient->InsertKey(1.0f, Color4(mid.r, mid.g, mid.b, 0));
	auto colorEffect = mmake<ParticlesColorEffect>();
	colorEffect->colorGradient = gradient;
	return colorEffect;
}

// Дочерний актор с burst-эмиттером цветного салюта
// Дочерний эмиттер-вспышка бонуса: отдельный актор, саб-треком включается в момент прилёта
static Ref<ParticlesEmitterComponent> AddBurstEmitter(const Ref<Actor>& parent, const String& name,
													  const String& image, float depth, float spawnRadius = 10.0f)
{
	auto actor = mmake<Actor>(ActorCreateMode::NotInScene);
	actor->SetName(name);
	parent->AddChild(actor);
	actor->SetLayer("UI");
	actor->transform->SetSize2D(Vec2F(spawnRadius, spawnRadius));
	actor->SetDrawingDepthInheritFromParent(false);
	actor->SetDrawingDepth(depth);

	auto burst = actor->AddComponent<ParticlesEmitterComponent>();
	auto source = mmake<SingleSpriteParticleSource>();
	source->image = o2Assets.GetAssetRefByType<ImageAsset>(kSprites + image);
	burst->SetParticlesSource(source);
	burst->SetShape(mmake<CircleParticlesEmitterShape>());
	burst->SetDuration(0.1f);
	burst->SetInitialAngle(0.0f);
	burst->SetInitialAngleRange(360.0f);
	burst->SetEmitParticlesMoveDirectionRange(360.0f);
	burst->SetParticlesRelativity(false); // искры остаются в мире, не следуют за актором
	burst->SetMaterial(WordFallUiFactory::AdditiveMaterial());
	burst->SetLoop(Loop::None);
	burst->Stop();
	return burst;
}

static Ref<ParticlesSizeEffect> MakeSizeCurve(const Vector<Pair<float, float>>& keys)
{
	auto curve = mmake<Curve>();
	float prev = 0.0f;
	for (auto& key : keys)
	{
		curve->AppendKey(key.first - prev, key.second, 0.0f, 1.0f);
		prev = key.first;
	}
	auto effect = mmake<ParticlesSizeEffect>();
	effect->curve = curve;
	return effect;
}

// Кометы салюта одного цвета: короткие светящиеся искры с хвостом разлетаются шаром и опадают
static Ref<Actor> AddSaluteSparks(const Ref<Actor>& parent, const String& name,
								  const Color4& color, float depth)
{
	auto burst = AddBurstEmitter(parent, name, "vfx_comet.png", depth);
	burst->SetParticlesLifetime(0.6f);
	burst->SetParticlesPerSecond(100.0f);
	burst->SetMaxParticles(7);
	burst->SetInitialSpeed(360.0f);
	burst->SetInitialSpeedRange(180.0f);
	burst->SetInitialSize(0.2f);
	burst->SetInitialSizeRange(0.08f);
	Color4 tint((color.r + 255)/2, (color.g + 255)/2, (color.b + 255)/2, 255);
	burst->AddEffect(MakeFadeGradient(tint, color));
	burst->AddEffect(MakeSizeCurve({ { 0.0f, 0.7f }, { 0.15f, 1.0f }, { 0.7f, 0.9f }, { 1.0f, 0.0f } }));

	auto stretch = mmake<ParticlesVelocityStretchEffect>();
	stretch->SetStretch(0.0012f);
	stretch->SetMaxStretch(1.35f);
	burst->AddEffect(stretch);

	auto gravity = mmake<ParticlesGravityEffect>();
	gravity->SetGravity(Vec3F(0, -520, 0));
	burst->AddEffect(gravity);

	auto damping = mmake<ParticlesDampingEffect>();
	damping->SetDamping(3.0f);
	burst->AddEffect(damping);
	return burst->GetActor();
}

// Конфетти салюта: крутящиеся бумажки, цвет каждой случайный между розовым и голубым
static Ref<Actor> AddSaluteConfetti(const Ref<Actor>& parent, const String& name, float depth)
{
	auto confetti = AddBurstEmitter(parent, name, "vfx_confetti.png", depth);
	confetti->SetMaterial(nullptr);
	confetti->SetParticlesLifetime(1.0f);
	confetti->SetParticlesPerSecond(100.0f);
	confetti->SetMaxParticles(9);
	confetti->SetInitialSpeed(250.0f);
	confetti->SetInitialSpeedRange(150.0f);
	confetti->SetInitialSize(0.24f);
	confetti->SetInitialSizeRange(0.1f);
	confetti->SetInitialAngleSpeed(360.0f);
	confetti->SetInitialAngleSpeedRange(500.0f);

	auto makeGradient = [](const Color4& color)
	{
		auto gradient = mmake<ColorGradient>();
		gradient->RemoveAllKeys();
		gradient->InsertKey(0.0f, color);
		gradient->InsertKey(0.8f, color);
		gradient->InsertKey(1.0f, Color4(color.r, color.g, color.b, 0));
		return gradient;
	};
	auto colorEffect = mmake<ParticlesRandomColorEffect>();
	colorEffect->colorGradientA = makeGradient(Color4(255, 110, 190, 255));
	colorEffect->colorGradientB = makeGradient(Color4(110, 210, 255, 255));
	confetti->AddEffect(colorEffect);
	confetti->AddEffect(MakeSizeCurve({ { 0.0f, 0.6f }, { 0.1f, 1.0f }, { 1.0f, 0.85f } }));

	auto gravity = mmake<ParticlesGravityEffect>();
	gravity->SetGravity(Vec3F(0, -420, 0));
	confetti->AddEffect(gravity);

	auto damping = mmake<ParticlesDampingEffect>();
	damping->SetDamping(2.2f);
	confetti->AddEffect(damping);
	return confetti->GetActor();
}

// Глиттер салюта: медленные мерцающие звёздочки, живут дольше росчерков
static Ref<Actor> AddSaluteGlitter(const Ref<Actor>& parent, const String& name, float depth)
{
	auto glitter = AddBurstEmitter(parent, name, "vfx_sparkle.png", depth, 24.0f);
	glitter->SetParticlesLifetime(0.65f);
	glitter->SetParticlesPerSecond(100.0f);
	glitter->SetMaxParticles(7);
	glitter->SetInitialSpeed(140.0f);
	glitter->SetInitialSpeedRange(90.0f);
	glitter->SetInitialSize(0.16f);
	glitter->SetInitialSizeRange(0.08f);

	auto gradient = mmake<ColorGradient>();
	gradient->RemoveAllKeys();
	gradient->InsertKey(0.0f, Color4(255, 255, 255, 255));
	gradient->InsertKey(0.5f, Color4(255, 236, 170, 230));
	gradient->InsertKey(1.0f, Color4(255, 220, 140, 0));
	auto colorEffect = mmake<ParticlesColorEffect>();
	colorEffect->colorGradient = gradient;
	glitter->AddEffect(colorEffect);

	// мерцание: размер «дышит» с разбросом по частице
	auto twinkle = mmake<Curve>();
	twinkle->AppendKey(0.0f, 0.4f, 0.0f, 1.0f);
	twinkle->AppendKey(0.2f, 1.0f, 0.6f, 1.0f);
	twinkle->AppendKey(0.25f, 0.5f, 0.5f, 1.0f);
	twinkle->AppendKey(0.25f, 1.0f, 0.6f, 1.0f);
	twinkle->AppendKey(0.3f, 0.0f, 0.0f, 1.0f);
	auto sizeEffect = mmake<ParticlesSizeEffect>();
	sizeEffect->curve = twinkle;
	glitter->AddEffect(sizeEffect);

	auto gravity = mmake<ParticlesGravityEffect>();
	gravity->SetGravity(Vec3F(0, -260, 0));
	glitter->AddEffect(gravity);

	auto damping = mmake<ParticlesDampingEffect>();
	damping->SetDamping(2.2f);
	glitter->AddEffect(damping);
	return glitter->GetActor();
}

// Ядро салюта: одна раскрывающаяся вспышка
static Ref<Actor> AddSaluteFlash(const Ref<Actor>& parent, const String& name, const Color4& color, float depth)
{
	auto flash = AddBurstEmitter(parent, name, "vfx_glow.png", depth, 1.0f);
	flash->SetParticlesLifetime(0.18f);
	flash->SetParticlesPerSecond(10.0f);
	flash->SetMaxParticles(1);
	flash->SetInitialSpeed(0.0f);
	flash->SetInitialSpeedRange(0.0f);
	flash->SetInitialSize(0.42f);
	flash->SetInitialSizeRange(0.0f);

	auto gradient = mmake<ColorGradient>();
	gradient->RemoveAllKeys();
	gradient->InsertKey(0.0f, Color4(255, 255, 255, 200));
	gradient->InsertKey(0.3f, Color4(color.r, color.g, color.b, 160));
	gradient->InsertKey(1.0f, Color4(color.r, color.g, color.b, 0));
	auto colorEffect = mmake<ParticlesColorEffect>();
	colorEffect->colorGradient = gradient;
	flash->AddEffect(colorEffect);
	flash->AddEffect(MakeSizeCurve({ { 0.0f, 0.25f }, { 0.3f, 1.0f }, { 1.0f, 1.2f } }));
	return flash->GetActor();
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
	widget->layout->SetPivot(Vec2F(0.5f, 0.5f)); // скейл и крен полёта — вокруг центра плашки

	auto animation = widget->AddComponent<AnimationComponent>();

	auto trajectory = widget->AddComponent<FlightTrajectoryComponent>();
	trajectory->spline = mmake<Spline>();
	trajectory->spline->AppendKey(Vec2F(0, 0), 0.0f);
	trajectory->spline->AppendKey(Vec2F(170, 120), 90.0f);
	trajectory->spline->AppendKey(Vec2F(400, 0), 0.0f);
	// стартовые точки для редактора: в игре их задаёт FxView перед каждым полётом
	trajectory->SetPoints(-160, -80, 160, 80);

	// бело-голубое затухание искр к концу жизни
	auto makeSparkGradient = []()
	{
		auto gradient = mmake<ColorGradient>();
		gradient->InsertKey(0.0f, Color4(255, 255, 255, 255));
		gradient->InsertKey(0.45f, Color4(170, 215, 255, 235));
		gradient->InsertKey(1.0f, Color4(140, 190, 255, 0));
		auto colorEffect = mmake<ParticlesColorEffect>();
		colorEffect->colorGradient = gradient;
		return colorEffect;
	};

	// эмиттер на дочернем акторе: ParticlesEmitterComponent прямо на виджете
	// падает при клонировании (OnTransformUpdated на недостроенном WidgetLayout)
	auto sparks = mmake<Actor>(ActorCreateMode::NotInScene);
	sparks->SetName("Sparks");
	widget->AddChild(sparks);
	sparks->SetLayer("UI");
	sparks->transform->SetSize2D(Vec2F(10, 10));
	// частицы — самостоятельный drawable слоя: без явной глубины они рисуются
	// под виджетами HUD (прогресс-баром)
	sparks->SetDrawingDepthInheritFromParent(false);
	sparks->SetDrawingDepth(62.0f);

	auto emitter = sparks->AddComponent<ParticlesEmitterComponent>();
	auto source = mmake<SingleSpriteParticleSource>();
	source->image = o2Assets.GetAssetRefByType<ImageAsset>(kSprites + "vfx_spark.png");
	emitter->SetParticlesSource(source);
	emitter->SetShape(mmake<CircleParticlesEmitterShape>());
	emitter->SetEmissionDuration(kFlightDuration);
	emitter->SetParticlesLifetime(0.4f);
	emitter->SetParticlesPerSecond(50.0f);
	emitter->SetMaxParticles(30);
	emitter->SetInitialSpeed(80.0f);
	emitter->SetInitialSpeedRange(40.0f);
	emitter->SetInitialSize(0.35f);
	emitter->SetInitialSizeRange(0.15f);
	emitter->SetInitialAngle(0.0f);
	emitter->SetInitialAngleRange(360.0f);
	emitter->SetEmitParticlesMoveDirectionRange(360.0f); // разлёт во все стороны, не вправо
	emitter->SetParticlesRelativity(false); // след тянется за плашкой, а не летит с ней
	emitter->AddEffect(makeSparkGradient());

	auto trailGravity = mmake<ParticlesGravityEffect>();
	trailGravity->SetGravity(Vec3F(0, -350, 0));
	emitter->AddEffect(trailGravity);

	auto trailDamping = mmake<ParticlesDampingEffect>();
	trailDamping->SetDamping(1.8f);
	emitter->AddEffect(trailDamping);

	emitter->SetLoop(Loop::None);
	emitter->Stop();

	// пучок искр в стороны при влёте звезды в прогресс-бар
	auto burstActor = mmake<Actor>(ActorCreateMode::NotInScene);
	burstActor->SetName("Burst");
	widget->AddChild(burstActor);
	burstActor->SetLayer("UI");
	burstActor->transform->SetSize2D(Vec2F(10, 10));
	burstActor->SetDrawingDepthInheritFromParent(false);
	burstActor->SetDrawingDepth(62.5f);

	auto burst = burstActor->AddComponent<ParticlesEmitterComponent>();
	auto burstSource = mmake<SingleSpriteParticleSource>();
	burstSource->image = o2Assets.GetAssetRefByType<ImageAsset>(kSprites + "vfx_spark.png");
	burst->SetParticlesSource(burstSource);
	burst->SetShape(mmake<CircleParticlesEmitterShape>());
	burst->SetDuration(0.1f);
	burst->SetParticlesLifetime(0.35f);
	burst->SetParticlesPerSecond(180.0f);
	burst->SetMaxParticles(16);
	burst->SetInitialSpeed(260.0f);
	burst->SetInitialSpeedRange(120.0f);
	burst->SetInitialSize(0.35f);
	burst->SetInitialSizeRange(0.15f);
	burst->SetInitialAngle(0.0f);
	burst->SetInitialAngleRange(360.0f);
	burst->SetEmitParticlesMoveDirectionRange(360.0f);
	burst->SetParticlesRelativity(false);
	burst->AddEffect(makeSparkGradient());

	auto burstGravity = mmake<ParticlesGravityEffect>();
	burstGravity->SetGravity(Vec3F(0, -600, 0));
	burst->AddEffect(burstGravity);

	auto burstDamping = mmake<ParticlesDampingEffect>();
	burstDamping->SetDamping(2.4f);
	burst->AddEffect(burstDamping);

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
	// потерялся бы при загрузке прототипа с диска, поэтому клип сохраняется .anim-ом.
	// валидность обязательна: дерево ассетов не удаляет записи, и по старому id
	// может вернуться «призрак» без данных
	static const String kFlightAnim = "WordFall/Prototypes/FxFlyingLetterFlight.anim";
	auto animAsset = o2Assets.GetAssetRefByType<AnimationAsset>(kFlightAnim);
	auto animAssetValid = [&]() {
		return animAsset && animAsset->animation && !animAsset->animation->GetTracks().IsEmpty();
	};
#if defined PLATFORM_WINDOWS || defined PLATFORM_MAC || defined PLATFORM_LINUX
	if (!animAssetValid())
	{
		String fullPath = o2Assets.GetAssetsPath() + kFlightAnim;
		o2FileSystem.FolderCreate(o2FileSystem.GetParentPath(fullPath), false);
		mmake<AnimationAsset>(clip)->Save(kFlightAnim);
		animAsset = o2Assets.GetAssetRefByType<AnimationAsset>(kFlightAnim);
	}
#endif

	Ref<IAnimationState> state;
	if (animAssetValid())
	{
		auto assetState = mmake<AnimationState>("flight");
		assetState->SetAnimation(animAsset);
		state = animation->AddState(assetState);
	}
	else // ассет недоступен (headless-тесты) — клип из памяти
		state = animation->AddState("flight", clip, AnimationMask(), 1.0f);

	state->autoPlay = false;

	return widget;
}

Ref<Actor> WordFallUiFactory::BuildFxFlashPrototype()
{
	return BuildFxImage("FxFlash", "ui_fx_flash.png", Color4::White());
}

Ref<Actor> WordFallUiFactory::BuildFxRocketPrototype()
{
	// ракета бонуса: летит по FlightTrajectoryComponent носом по курсу, за ней дымный
	// шлейф с искрами; на прилёте — вспышка, росчерки трёх цветов и глиттер
	auto widget = mmake<Widget>();
	widget->SetName("FxRocket");
	widget->SetLayer("UI");

	// пламя сопла — аддитивное свечение позади корпуса, мерцает треком прозрачности
	auto flameSprite = mmake<Sprite>(kSprites + "vfx_glow.png");
	flameSprite->SetColor(Color4(255, 170, 70, 200));
	flameSprite->SetMaterial(AdditiveMaterial());
	widget->AddLayer("flame", flameSprite, Layout::Based(BaseCorner::Bottom, Vec2F(38, 38), Vec2F(0, -8)));

	widget->AddLayer("img", mmake<Sprite>(kSprites + "powerup_rocket.png"), Layout::BothStretch());
	SetAnchoredRect(widget, Vec2F(0.5f, 0.5f), Vec2F(0, 0), Vec2F(84, 84));
	widget->layout->SetPivot(Vec2F(0.5f, 0.5f)); // поворот по курсу — вокруг центра

	auto animation = widget->AddComponent<AnimationComponent>();

	auto trajectory = widget->AddComponent<FlightTrajectoryComponent>();
	trajectory->spline = mmake<Spline>();
	trajectory->spline->AppendKey(Vec2F(0, 0), 0.0f);
	trajectory->spline->AppendKey(Vec2F(140, 180), 120.0f);
	trajectory->spline->AppendKey(Vec2F(400, 0), 0.0f);
	trajectory->alignToDirection = true;
	trajectory->directionAngleOffset = -90.0f; // спрайт нарисован носом вверх

	// дымный шлейф: клубы растут и тают позади ракеты
	auto smoke = AddBurstEmitter(widget, "Smoke", "vfx_smoke.png", 62.5f, 8.0f);
	smoke->SetMaterial(nullptr);
	smoke->SetEmissionDuration(kRocketFlightDuration - 0.2f); // последние клубы не ложатся на клетку
	smoke->SetParticlesLifetime(0.3f);
	smoke->SetParticlesPerSecond(28.0f);
	smoke->SetMaxParticles(20);
	smoke->SetInitialSpeed(24.0f);
	smoke->SetInitialSpeedRange(16.0f);
	smoke->SetInitialSize(0.09f);
	smoke->SetInitialSizeRange(0.03f);
	smoke->AddEffect(MakeFadeGradient(Color4(255, 245, 235, 70), Color4(226, 232, 242, 36)));
	smoke->AddEffect(MakeSizeCurve({ { 0.0f, 0.6f }, { 1.0f, 1.5f } }));
	auto smokeDamping = mmake<ParticlesDampingEffect>();
	smokeDamping->SetDamping(3.0f);
	smoke->AddEffect(smokeDamping);

	// искры выхлопа поверх дыма: обычное смешивание — аддитивные над светлыми плитками не видны
	auto trail = AddBurstEmitter(widget, "Sparks", "vfx_spark.png", 63.0f, 8.0f);
	trail->SetMaterial(nullptr);
	trail->SetEmissionDuration(kRocketFlightDuration);
	trail->SetParticlesLifetime(0.42f);
	trail->SetParticlesPerSecond(110.0f);
	trail->SetMaxParticles(60);
	trail->SetInitialSpeed(90.0f);
	trail->SetInitialSpeedRange(60.0f);
	trail->SetInitialSize(0.46f);
	trail->SetInitialSizeRange(0.16f);
	trail->AddEffect(MakeFadeGradient(Color4(255, 236, 150, 255), Color4(255, 120, 40, 240)));
	trail->AddEffect(MakeSizeCurve({ { 0.0f, 1.0f }, { 0.5f, 0.7f }, { 1.0f, 0.15f } }));

	auto trailGravity = mmake<ParticlesGravityEffect>();
	trailGravity->SetGravity(Vec3F(0, -300, 0));
	trail->AddEffect(trailGravity);

	auto trailDamping = mmake<ParticlesDampingEffect>();
	trailDamping->SetDamping(2.0f);
	trail->AddEffect(trailDamping);

	// салют на прилёте: вспышка, кометы трёх цветов, конфетти, глиттер
	AddSaluteFlash(widget, "BurstFlash", Color4(255, 200, 235, 255), 63.4f);
	AddSaluteSparks(widget, "BurstPink", Color4(255, 110, 190, 255), 63.5f);
	AddSaluteSparks(widget, "BurstYellow", Color4(255, 220, 90, 255), 63.5f);
	AddSaluteSparks(widget, "BurstBlue", Color4(110, 210, 255, 255), 63.5f);
	AddSaluteConfetti(widget, "Confetti", 63.55f);
	AddSaluteGlitter(widget, "Glitter", 63.6f);

	auto clip = mmake<AnimationClip>();

	// разгон первую треть пути, дальше постоянная скорость до самой цели
	auto position = clip->AddTrack<float>("component/o2::FlightTrajectoryComponent/position");
	const float accel = 0.32f, cruise = 1.0f/(1.0f - accel*0.5f);
	const int samples = 16;
	for (int i = 0; i <= samples; i++)
	{
		float u = (float)i/samples;
		float p = u < accel ? cruise*u*u/(2.0f*accel) : cruise*(u - accel*0.5f);
		position->AddKey(u*kRocketFlightDuration, Math::Clamp01(p), 0.0f);
	}

	// старт: корпус приседает и вытягивается вдоль оси, к концу разгона выравнивается
	auto scaleX = clip->AddTrack<float>("transform/scaleX");
	auto scaleY = clip->AddTrack<float>("transform/scaleY");
	scaleX->AddKey(0.0f, 1.15f);   scaleY->AddKey(0.0f, 0.8f);
	scaleX->AddKey(0.1f, 0.88f);   scaleY->AddKey(0.1f, 1.22f);
	scaleX->AddKey(0.26f, 1.0f);   scaleY->AddKey(0.26f, 1.0f);
	scaleX->AddKey(kRocketFlightDuration, 1.0f);
	scaleY->AddKey(kRocketFlightDuration, 1.0f);

	// пламя мерцает и гаснет с корпусом в кадре прилёта: дальше играет только салют
	auto flame = clip->AddTrack<float>("layer/flame/transparency");
	for (int i = 0; i*0.06f < kRocketFlightDuration - 0.05f; i++)
		flame->AddKey(i*0.06f, (i%2 == 0) ? 1.0f : 0.55f);
	flame->AddKey(kRocketFlightDuration, 0.0f);

	auto body = clip->AddTrack<float>("layer/img/transparency");
	body->AddKey(0.0f, 1.0f);
	body->AddKey(kRocketFlightDuration - 0.04f, 1.0f);
	body->AddKey(kRocketFlightDuration, 0.0f);

	clip->AddTrack("child/Smoke/component/o2::ParticlesEmitterComponent", TypeOf(ParticlesEmitterComponent));
	clip->AddTrack("child/Sparks/component/o2::ParticlesEmitterComponent", TypeOf(ParticlesEmitterComponent));

	const char* burstNames[6] = { "BurstFlash", "BurstPink", "BurstYellow", "BurstBlue", "Confetti", "Glitter" };
	for (auto burstName : burstNames)
	{
		auto burstTrack = DynamicCast<AnimationSubTrack>(
			clip->AddTrack(String("child/") + burstName + "/component/o2::ParticlesEmitterComponent",
						   TypeOf(ParticlesEmitterComponent)));
		burstTrack->SetBeginTime(kRocketFlightDuration);
	}

	Ref<IAnimationState> state;
	if (auto animAsset = EnsureAnimAsset("WordFall/Prototypes/FxRocketFlight.anim", clip))
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
	return BuildFxImage("FxBeam", "ui_bar_fill.png", Color4(170, 215, 255));
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
	// 9-slice: скруглённые торцы пилюли (14px) не тянутся, растягивается середина
	auto bar = progress->AddLayer("bar", MakeSliced(fillImage, BorderI(14, 0, 14, 0)), Layout::BothStretch());

	// якоря для полёта букв (не рисуются): tip — кончик заливки, track — весь бар
	auto tip = bar->AddChildLayer("tip", mmake<Sprite>(), Layout(Vec2F(1, 0.5f), Vec2F(1, 0.5f), Vec2F(-11, -1), Vec2F(-9, 1)));
	tip->SetEnabled(false);
	auto track = progress->AddLayer("track", mmake<Sprite>(), Layout::BothStretch());
	track->SetEnabled(false);

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

	// ледяная и каменная плашки закрывают обычную; буква рисуется поверх своим стилем
	auto ice = button->AddLayer("ice", mmake<Sprite>(kSprites + "ui_ice.png"), kTileLayout);
	ice->SetEnabled(false);

	auto stone = button->AddLayer("stone", mmake<Sprite>(kSprites + "ui_stone.png"), kTileLayout);
	stone->SetEnabled(false);

	// препятствия занимают клетку вместо буквы: ящик (целый/треснувший), снежок, конверт
	auto crate = button->AddLayer("crate", mmake<Sprite>(kSprites + "ui_crate.png"),
								  Layout::Based(BaseCorner::Center, Vec2F(92, 92), Vec2F(0, 0)));
	crate->SetEnabled(false);
	auto crateHit = button->AddLayer("crateHit", mmake<Sprite>(kSprites + "ui_crate_cracked.png"),
									 Layout::Based(BaseCorner::Center, Vec2F(92, 92), Vec2F(0, 0)));
	crateHit->SetEnabled(false);
	auto snow = button->AddLayer("snow", mmake<Sprite>(kSprites + "ui_snowball.png"),
								 Layout::Based(BaseCorner::Center, Vec2F(90, 90), Vec2F(0, 2)));
	snow->SetEnabled(false);
	auto parcel = button->AddLayer("parcel", mmake<Sprite>(kSprites + "ui_envelope.png"),
								   Layout::Based(BaseCorner::Center, Vec2F(84, 84), Vec2F(0, 0)));
	parcel->SetEnabled(false);

	auto letter = MakeText(44, kDarkText, true);
	button->AddLayer("letter", letter, Layout::BothStretch(0, 6, 0, 0));

	auto points = MakeText(15, kPointsText, true);
	points->SetHorAlign(HorAlign::Right);
	button->AddLayer("points", points, Layout::Based(BaseCorner::RightBottom, Vec2F(30, 20), Vec2F(-16, 16)));

	// цепь лежит поверх буквы: замок держит плитку на месте
	auto chain = button->AddLayer("chain", mmake<Sprite>(kSprites + "ui_chain.png"),
								  Layout::Based(BaseCorner::Center, Vec2F(96, 96), Vec2F(0, 0)));
	chain->SetEnabled(false);

	// бонус занимает слот вместо буквы: аура, золотая оправа и крупная иконка.
	// вьюха качает масштаб плитки и прозрачность ауры — бонус «дышит» на поле
	auto bonusGlow = button->AddLayer("bonusGlow", mmake<Sprite>(kSprites + "vfx_glow.png"),
									  Layout::Based(BaseCorner::Center, Vec2F(150, 150), Vec2F(0, 0)));
	bonusGlow->SetEnabled(false);

	auto bonusPlate = button->AddLayer("bonusPlate", mmake<Sprite>(kSprites + "powerup_socket.png"),
									   Layout::Based(BaseCorner::Center, Vec2F(86, 86), Vec2F(0, 0)));
	bonusPlate->SetEnabled(false);

	const char* powerups[3] = { "bomb", "rocket", "fireworks" };
	for (auto name : powerups)
	{
		auto powerup = button->AddLayer(name, mmake<Sprite>(kSprites + "powerup_" + String(name) + ".png"),
										Layout::Based(BaseCorner::Center, Vec2F(72, 72), Vec2F(0, 0)));
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
