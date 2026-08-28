#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "WordFall/WordFallUiFactory.h"
#include "o2/Animation/AnimationPlayer.h"
#include "o2/Animation/AnimationState.h"
#include "o2/Assets/Types/AnimationAsset.h"
#include "o2/Render/Render.h"
#include "o2/Scene/Components/AnimationComponent.h"
#include "o2/Scene/Components/FlightTrajectoryComponent.h"
#include "o2/Scene/Components/ParticlesEmitterComponent.h"
#include "o2/Utils/Bitmap/Bitmap.h"
#include "o2/Assets/Assets.h"
#include "o2/Assets/Types/ActorAsset.h"
#include "o2/Scene/Actor.h"
#include "o2/Scene/CameraActor.h"
#include "o2/Scene/Scene.h"
#include "o2/Scene/UI/WidgetLayer.h"
#include "o2/Scene/UI/WidgetLayout.h"
#include "o2/Scene/UI/Widgets/Button.h"
#include "o2/Scene/UI/Widgets/Image.h"
#include "o2/Utils/FileSystem/FileSystem.h"
#include "o2/Utils/Test/AppTestDriver.h"

using namespace o2;

namespace
{
	void ExpectTileAlive(const Ref<Actor>& tile, const char* stage)
	{
		ASSERT_TRUE(tile) << stage;

		auto button = DynamicCast<Button>(tile);
		ASSERT_TRUE(button) << stage;
		EXPECT_TRUE(button->GetLayer("back")) << stage;
		EXPECT_TRUE(button->GetLayer("letter")) << stage;
		EXPECT_TRUE(button->IsEnabledInHierarchy()) << stage;

		// «пустой» инстанс не имеет размера после лэйаута
		EXPECT_GT(button->layout->GetSize().x, 1.0f) << stage;
		EXPECT_GT(button->layout->GetSize().y, 1.0f) << stage;

		// инстанс обязан быть интерактивным
		bool clicked = false;
		button->onClick = [&]() { clicked = true; };
		AppTestDriver::Click(Vec2F(0, 0));
		AppTestDriver::PumpFrames(2);
		EXPECT_TRUE(clicked) << stage << ": click dead";
	}

	// Камера, рисующая слой UI: без неё виджеты не рисуются и не получают ввод
	Ref<Widget> PrepareUiScene()
	{
		o2Scene.AddLayer("UI");

		auto camera = mmake<CameraActor>();
		camera->SetName("ui camera");
		camera->SetFittedSize(Vec2F(768, 1376));
		camera->drawLayers.SetLayers({ String("UI") });

		auto screen = WordFallUiFactory::CreateSection(nullptr, "Screen", Vec2F(0.5f, 0.5f),
													   Vec2F(0, 0), Vec2F(768, 1376));
		return screen;
	}

	Ref<Actor> InstantiateTileScene(const Ref<ActorAsset>& asset)
	{
		auto prevMode = Actor::GetDefaultCreationMode();
		Actor::SetDefaultCreationMode(ActorCreateMode::InScene);

		auto screen = PrepareUiScene();

		auto tile = asset->Instantiate();
		screen->AddChild(tile);
		WordFallUiFactory::SetAnchoredRect(DynamicCast<Widget>(tile), Vec2F(0.5f, 0.5f),
										   Vec2F(0, 0), Vec2F(82, 82));

		Actor::SetDefaultCreationMode(prevMode);

		o2Scene.UpdateAddedEntities();
		AppTestDriver::PumpFrames(3);
		return tile;
	}
}

// Контроль харнесса: прямо собранная плитка в этой же обвязке кликабельна
TEST(WordFallProto, DirectTileRespondsToClicks)
{
	auto prevMode = Actor::GetDefaultCreationMode();
	Actor::SetDefaultCreationMode(ActorCreateMode::InScene);

	auto screen = PrepareUiScene();
	auto tile = WordFallUiFactory::BuildTilePrototype();
	screen->AddChild(tile);
	WordFallUiFactory::SetAnchoredRect(DynamicCast<Widget>(tile), Vec2F(0.5f, 0.5f),
									   Vec2F(0, 0), Vec2F(82, 82));

	Actor::SetDefaultCreationMode(prevMode);

	o2Scene.UpdateAddedEntities();
	AppTestDriver::PumpFrames(3);

	ExpectTileAlive(tile, "direct build");

	o2Scene.Clear(true);
	o2Scene.UpdateDestroyingEntities();
	AppTestDriver::PumpFrames(2);
}

// Прототип плитки должен инстанцироваться повторно: после очистки сцены клон из
// того же ActorAsset обязан быть полноценным виджетом, а не пустым инстансом
TEST(WordFallProto, TileReinstantiatesAcrossScenes)
{
	auto asset = mmake<ActorAsset>(WordFallUiFactory::BuildTilePrototype());

	auto first = InstantiateTileScene(asset);
	ExpectTileAlive(first, "first scene");

	first = nullptr;
	o2Scene.Clear(true);
	o2Scene.UpdateDestroyingEntities();
	AppTestDriver::PumpFrames(2);

	auto second = InstantiateTileScene(asset);
	ExpectTileAlive(second, "second scene");

	o2Scene.Clear(true);
	o2Scene.UpdateDestroyingEntities();
	AppTestDriver::PumpFrames(2);
}

// Сохранение ассета не должно ломать шаблон: инстансы после Save обязаны быть
// полноценны и кликабельны в обеих сценах
TEST(WordFallProto, TileInstantiatesAfterAssetSave)
{
	const String assetPath = "WordFall/Prototypes/TestTileTmp.proto";

	auto asset = mmake<ActorAsset>(WordFallUiFactory::BuildTilePrototype());
	asset->Save(assetPath);

	auto first = InstantiateTileScene(asset);
	ExpectTileAlive(first, "after save, first scene");

	first = nullptr;
	o2Scene.Clear(true);
	o2Scene.UpdateDestroyingEntities();
	AppTestDriver::PumpFrames(2);

	auto second = InstantiateTileScene(asset);
	ExpectTileAlive(second, "after save, second scene");

	o2Scene.Clear(true);
	o2Scene.UpdateDestroyingEntities();
	AppTestDriver::PumpFrames(2);

	String fullPath = o2Assets.GetAssetsPath() + assetPath;
	o2FileSystem.FileDelete(fullPath);
	o2FileSystem.FileDelete(fullPath + ".meta");
}

// Кнопка-пилюля из прототипа кликабельна: клик по центру доходит до внутренней кнопки
TEST(WordFallProto, PillButtonPrototypeClickable)
{
	auto prevMode = Actor::GetDefaultCreationMode();
	Actor::SetDefaultCreationMode(ActorCreateMode::InScene);

	auto screen = PrepareUiScene();

	// путь игры: инстанс из ассета
	auto asset = mmake<ActorAsset>(WordFallUiFactory::BuildPillButtonPrototype());
	auto pill = asset->Instantiate();
	screen->AddChild(pill);
	WordFallUiFactory::SetAnchoredRect(DynamicCast<Widget>(pill), Vec2F(0.5f, 0.5f),
									   Vec2F(0, 0), Vec2F(220, 64));

	Actor::SetDefaultCreationMode(prevMode);

	o2Scene.UpdateAddedEntities();
	AppTestDriver::PumpFrames(3);

	auto button = DynamicCast<Button>(pill->GetChild("Btn"));
	ASSERT_TRUE(button);

	// кнопка обязана рисоваться: пиксель в центре — оранжевый фон пилюли
	{
		auto bitmap = AppTestDriver::TakeScreenshot();
		ASSERT_TRUE(bitmap);
		Vec2I size = bitmap->GetSize();
		const UInt8* p = &bitmap->GetData()[((size.y/2)*size.x + size.x/2)*4];
		EXPECT_GT((int)p[0], 150) << "pill not drawn";
	}

	bool clicked = false;
	button->onClick = [&]() { clicked = true; };
	AppTestDriver::Click(Vec2F(0, 0));
	AppTestDriver::PumpFrames(2);
	EXPECT_TRUE(clicked) << "pill button click dead";

	o2Scene.Clear(true);
	o2Scene.UpdateDestroyingEntities();
	AppTestDriver::PumpFrames(2);
}

// Как в попапе: кнопка в изначально выключенном контейнере кликабельна после включения
TEST(WordFallProto, PillButtonClickableAfterContainerEnabled)
{
	auto prevMode = Actor::GetDefaultCreationMode();
	Actor::SetDefaultCreationMode(ActorCreateMode::InScene);

	auto screen = PrepareUiScene();

	auto content = WordFallUiFactory::CreateSection(screen, "Content", Vec2F(0.5f, 0.5f),
													Vec2F(0, 0), Vec2F(768, 1376));

	// как в попапе: затемнение и панель под кнопкой
	auto dim = WordFallUiFactory::CreateStretchedImage(content, "Dim", "WordFall/Sprites/white.png",
													   BorderF(), 100.0f, BorderI(), Color4(14, 26, 52, 255));
	dim->SetTransparency(170.0f/255.0f);
	WordFallUiFactory::CreateImage(content, "Panel", "WordFall/Sprites/ui_panel_board.png",
								   Vec2F(0.5f, 0.5f), Vec2F(0, 10), Vec2F(520, 400), 101.0f,
								   BorderI(40, 40, 40, 40));

	auto pill = WordFallUiFactory::BuildPillButtonPrototype();
	content->AddChild(pill);
	WordFallUiFactory::SetAnchoredRect(DynamicCast<Widget>(pill), Vec2F(0.5f, 0.5f),
									   Vec2F(0, 0), Vec2F(220, 64));
	WordFallUiFactory::SetDepth(DynamicCast<Widget>(pill), 102.0f);

	content->SetEnabled(false);

	Actor::SetDefaultCreationMode(prevMode);

	o2Scene.UpdateAddedEntities();
	AppTestDriver::PumpFrames(3);

	content->SetEnabled(true);
	AppTestDriver::PumpFrames(3);

	auto button = DynamicCast<Button>(pill->GetChild("Btn"));
	ASSERT_TRUE(button);

	bool clicked = false;
	button->onClick = [&]() { clicked = true; };
	AppTestDriver::Click(Vec2F(0, 0));
	AppTestDriver::PumpFrames(2);
	EXPECT_TRUE(clicked) << "pill in re-enabled container: click dead";

	o2Scene.Clear(true);
	o2Scene.UpdateDestroyingEntities();
	AppTestDriver::PumpFrames(2);
}

// Вложенный прототип: инстанс пилюли внутри внешнего прототипа обязан рисоваться
// и кликаться после инстанцирования внешнего
TEST(WordFallProto, NestedPrototypeInstanceSurvivesOuterInstantiation)
{
	auto pillAsset = mmake<ActorAsset>(WordFallUiFactory::BuildPillButtonPrototype());

	auto prevMode = Actor::GetDefaultCreationMode();
	Actor::SetDefaultCreationMode(ActorCreateMode::NotInScene);

	auto outerRoot = WordFallUiFactory::CreateSection(nullptr, "Outer", Vec2F(0.5f, 0.5f),
													  Vec2F(0, 0), Vec2F(768, 1376));

	// как попап: изначально выключенный контейнер с кнопкой-инстансом внутри
	auto content = WordFallUiFactory::CreateSection(outerRoot, "Content", Vec2F(0.5f, 0.5f),
													Vec2F(0, 0), Vec2F(768, 1376));

	auto pillTemplate = pillAsset->Instantiate();
	pillTemplate->SetName("RestartBtn");
	content->AddChild(pillTemplate);
	auto pillWidget = DynamicCast<Widget>(pillTemplate);
	WordFallUiFactory::SetAnchoredRect(pillWidget, Vec2F(0.5f, 0.5f), Vec2F(0, 0), Vec2F(220, 64));
	WordFallUiFactory::SetDepth(pillWidget, 102.0f);
	if (auto btn = DynamicCast<Button>(pillTemplate->GetChild("Btn")))
		btn->SetCaption("ЕЩЁ РАЗ");

	content->SetEnabled(false);

	Actor::SetDefaultCreationMode(prevMode);

	auto outerAsset = mmake<ActorAsset>(DynamicCast<Actor>(outerRoot));

	// путь игры: внешний прототип сохраняется на диск перед инстанцированием
	const String outerPath = "WordFall/Prototypes/TestOuterTmp.proto";
	outerAsset->Save(outerPath);

	Actor::SetDefaultCreationMode(ActorCreateMode::InScene);
	auto screen = PrepareUiScene();
	auto outer = outerAsset->Instantiate();
	screen->AddChild(outer);
	WordFallUiFactory::SetAnchors(DynamicCast<Widget>(outer), Vec2F(0, 0), Vec2F(1, 1),
								  Vec2F(0, 0), Vec2F(0, 0));
	Actor::SetDefaultCreationMode(prevMode);

	o2Scene.UpdateAddedEntities();
	AppTestDriver::PumpFrames(3);

	// включение контейнера, как при показе попапа
	outer->GetChild("Content")->SetEnabled(true);
	AppTestDriver::PumpFrames(3);

	auto button = DynamicCast<Button>(outer->GetChild("Content/RestartBtn/Btn"));
	ASSERT_TRUE(button);

	// пилюля должна рисоваться в центре
	{
		auto bitmap = AppTestDriver::TakeScreenshot();
		ASSERT_TRUE(bitmap);
		Vec2I size = bitmap->GetSize();
		const UInt8* p = &bitmap->GetData()[((size.y/2)*size.x + size.x/2)*4];
		EXPECT_GT((int)p[0], 150) << "nested pill not drawn";
	}

	bool clicked = false;
	button->onClick = [&]() { clicked = true; };
	AppTestDriver::Click(Vec2F(0, 0));
	AppTestDriver::PumpFrames(2);
	EXPECT_TRUE(clicked) << "nested pill click dead";

	o2Scene.Clear(true);
	o2Scene.UpdateDestroyingEntities();
	AppTestDriver::PumpFrames(2);

	String fullPath = o2Assets.GetAssetsPath() + outerPath;
	o2FileSystem.FileDelete(fullPath);
	o2FileSystem.FileDelete(fullPath + ".meta");
}

// Полупрозрачность виджета (конвенционный способ затемнения) не должна теряться
// при инстанцировании из ассета
TEST(WordFallProto, WidgetTransparencySurvivesInstantiation)
{
	auto buildDim = []()
	{
		auto prevMode = Actor::GetDefaultCreationMode();
		Actor::SetDefaultCreationMode(ActorCreateMode::NotInScene);
		auto dim = WordFallUiFactory::CreateStretchedImage(nullptr, "DimTest",
			"WordFall/Sprites/white.png", BorderF(), 50.0f, BorderI(), Color4(0, 0, 255, 255));
		dim->SetTransparency(0.5f);
		Actor::SetDefaultCreationMode(prevMode);
		return DynamicCast<Actor>(dim);
	};

	auto samplePixel = [](const char* stage) -> Color4
	{
		AppTestDriver::PumpFrames(3);
		auto bitmap = AppTestDriver::TakeScreenshot();
		EXPECT_TRUE(bitmap) << stage;
		Vec2I size = bitmap->GetSize();
		const UInt8* data = bitmap->GetData();
		const UInt8* p = &data[((size.y/2)*size.x + size.x/2)*4];
		return Color4((int)p[0], (int)p[1], (int)p[2], (int)p[3]);
	};

	auto prepare = [&]()
	{
		o2Scene.AddLayer("UI");
		auto camera = mmake<CameraActor>();
		camera->SetFittedSize(Vec2F(768, 1376));
		camera->fillBackground = true;
		camera->fillColor = Color4(255, 255, 255);
		camera->drawLayers.SetLayers({ String("UI") });

		return WordFallUiFactory::CreateSection(nullptr, "Screen", Vec2F(0.5f, 0.5f),
												Vec2F(0, 0), Vec2F(768, 1376));
	};

	auto prevMode = Actor::GetDefaultCreationMode();
	Actor::SetDefaultCreationMode(ActorCreateMode::InScene);

	// прямой билд: полупрозрачный синий поверх белой заливки — светло-синий
	{
		auto screen = prepare();
		screen->AddChild(buildDim());
		o2Scene.UpdateAddedEntities();
		Color4 direct = samplePixel("direct");
		EXPECT_GT(direct.r, 80) << "direct: dim непрозрачный";
		EXPECT_GT(direct.g, 80);

		o2Scene.Clear(true);
		o2Scene.UpdateDestroyingEntities();
		AppTestDriver::PumpFrames(2);
	}

	// инстанс из ассета: та же полупрозрачность
	{
		auto asset = mmake<ActorAsset>(buildDim());
		auto screen = prepare();
		screen->AddChild(asset->Instantiate());
		o2Scene.UpdateAddedEntities();
		Color4 cloned = samplePixel("instantiated");
		EXPECT_GT(cloned.r, 80) << "instantiated: dim непрозрачный — альфа цвета потеряна";
		EXPECT_GT(cloned.g, 80);

		o2Scene.Clear(true);
		o2Scene.UpdateDestroyingEntities();
		AppTestDriver::PumpFrames(2);
	}

	Actor::SetDefaultCreationMode(prevMode);
}

// Путь реального приложения: прототип десериализуется с диска (сериализация в
// DataDocument и обратно), инстансы должны быть полноценны в обеих сценах
TEST(WordFallProto, DeserializedTileReinstantiatesAcrossScenes)
{
	auto source = mmake<ActorAsset>(WordFallUiFactory::BuildTilePrototype());

	DataDocument data;
	source->Serialize(data);

	auto prevMode = Actor::GetDefaultCreationMode();
	Actor::SetDefaultCreationMode(ActorCreateMode::NotInScene);
	auto asset = mmake<ActorAsset>();
	asset->Deserialize(data);
	Actor::SetDefaultCreationMode(prevMode);

	ASSERT_TRUE(asset->GetActor());

	auto first = InstantiateTileScene(asset);
	ExpectTileAlive(first, "first scene");

	first = nullptr;
	o2Scene.Clear(true);
	o2Scene.UpdateDestroyingEntities();
	AppTestDriver::PumpFrames(2);

	auto second = InstantiateTileScene(asset);
	ExpectTileAlive(second, "second scene");

	o2Scene.Clear(true);
	o2Scene.UpdateDestroyingEntities();
	AppTestDriver::PumpFrames(2);
}

// Редакторский сценарий: клон прототипа в сцене, свой плеер окна анимации скраббит клип
// без апдейта сцены — слои плашки и звезда должны меняться и в значениях, и в кадре
TEST(WordFallProto, FlyingLetterScrubWithoutSceneUpdateFadesLayers)
{
	const String kScreenshotsDir = "../../Work/ScreenShots/";

	auto asset = o2Assets.GetAssetRefByType<ActorAsset>("WordFall/Prototypes/FxFlyingLetter.proto");
	ASSERT_TRUE(asset && asset->GetActor());

	auto prevMode = Actor::GetDefaultCreationMode();
	Actor::SetDefaultCreationMode(ActorCreateMode::InScene);
	auto screen = PrepareUiScene();
	auto clone = asset->GetActor()->CloneAsRef<Actor>();
	screen->AddChild(clone);
	Actor::SetDefaultCreationMode(prevMode);

	auto widget = DynamicCast<Widget>(clone);
	ASSERT_TRUE(widget);
	widget->SetEnabled(true);

	o2Scene.UpdateAddedEntities();
	AppTestDriver::PumpFrames(2);

	auto animation = clone->GetComponent<AnimationComponent>();
	ASSERT_TRUE(animation);
	auto state = DynamicCast<AnimationState>(animation->GetState("flight"));
	ASSERT_TRUE(state && state->GetAnimation() && state->GetAnimation()->animation);
	auto clip = state->GetAnimation()->animation;
	float duration = clip->GetDuration();
	ASSERT_GT(duration, 0.1f);

	auto back = widget->GetLayer("back");
	auto star = widget->GetLayer("star");
	auto trajectory = clone->GetComponent<FlightTrajectoryComponent>();
	ASSERT_TRUE(back && star && trajectory);

	auto player = mmake<AnimationPlayer>(clone.Get(), clip);

	auto scrub = [&](float time, const String& shot)
	{
		player->Stop();
		player->SetTime(time);
		clone->UpdateTransform();

		Ref<Bitmap> bitmap;
		o2Render.CaptureNextFrame([&](const Ref<Bitmap>& captured) { bitmap = captured; });
		o2Scene.UpdateTransforms();
		o2Render.Begin();
		o2Render.Clear(Color4(40, 40, 40));
		o2Scene.Draw();
		o2Render.End();

		if (bitmap)
			bitmap->Save(kScreenshotsDir + shot, Bitmap::ImageType::Png);
		EXPECT_TRUE(bitmap) << shot;
	};

	scrub(0.0f, "20_scrub_start.png");
	EXPECT_NEAR(back->GetTransparency(), 1.0f, 0.01f);
	EXPECT_NEAR(star->GetTransparency(), 0.0f, 0.01f);
	EXPECT_NEAR(trajectory->GetPosition(), 0.0f, 0.01f);

	// первая половина: плашка ещё видна, звезда уже проявляется
	scrub(duration*0.28f, "20_scrub_mid.png");
	EXPECT_GT(back->GetTransparency(), 0.2f);
	EXPECT_GT(star->GetTransparency(), 0.2f);
	EXPECT_GT(trajectory->GetPosition(), 0.3f);

	// конец полёта: звезда полностью, плашка погасла
	scrub(duration*0.5f, "20_scrub_star.png");
	EXPECT_NEAR(back->GetTransparency(), 0.0f, 0.02f);
	EXPECT_NEAR(star->GetTransparency(), 1.0f, 0.02f);
	EXPECT_NEAR(star->GetDrawable()->GetTransparency(), 1.0f, 0.02f);
	EXPECT_NEAR(trajectory->GetPosition(), 1.0f, 0.02f);

	// клип длиннее треков слоёв (саб-трек Burst): за последним ключом значения держатся,
	// а не экстраполируются в отрицательные
	scrub(duration*0.8f, "20_scrub_after.png");
	EXPECT_GE(back->GetTransparency(), -0.001f);
	EXPECT_GE(star->GetTransparency(), -0.001f);
	EXPECT_NEAR(star->GetTransparency(), 0.0f, 0.02f);
	EXPECT_NEAR(trajectory->GetPosition(), 1.0f, 0.02f);
}

// Редакторский сценарий: правка параметров Burst (саб-трек с поздним началом) должна
// применяться на текущей позиции скраба без повторного скраба, как и для Sparks
TEST(WordFallProto, FlyingLetterLateBurstEditAppliesWithoutScrub)
{
	auto asset = o2Assets.GetAssetRefByType<ActorAsset>("WordFall/Prototypes/FxFlyingLetter.proto");
	ASSERT_TRUE(asset && asset->GetActor());

	auto prevMode = Actor::GetDefaultCreationMode();
	Actor::SetDefaultCreationMode(ActorCreateMode::InScene);
	auto screen = PrepareUiScene();
	auto clone = asset->GetActor()->CloneAsRef<Actor>();
	screen->AddChild(clone);
	Actor::SetDefaultCreationMode(prevMode);

	auto widget = DynamicCast<Widget>(clone);
	ASSERT_TRUE(widget);
	widget->SetEnabled(true);

	o2Scene.UpdateAddedEntities();
	AppTestDriver::PumpFrames(2);

	auto animation = clone->GetComponent<AnimationComponent>();
	ASSERT_TRUE(animation);
	auto state = DynamicCast<AnimationState>(animation->GetState("flight"));
	ASSERT_TRUE(state && state->GetAnimation() && state->GetAnimation()->animation);
	auto clip = state->GetAnimation()->animation;

	auto sparks = clone->FindChild("Sparks")->GetComponent<ParticlesEmitterComponent>();
	auto burst = clone->FindChild("Burst")->GetComponent<ParticlesEmitterComponent>();
	ASSERT_TRUE(sparks && burst);

	auto alive = [](const Ref<ParticlesEmitterComponent>& emitter)
	{
		int count = 0;
		for (auto& particle : emitter->GetParticles())
			if (particle.alive)
				count++;
		return count;
	};
	// the asset is live content: make the checks independent of its current caps
	burst->SetMaxParticles(1000);

	auto player = state->player;
	player->Stop();
	player->SetTime(0.2f);
	ASSERT_GT(alive(sparks), 0);

	player->SetTime(0.65f);
	ASSERT_GT(alive(burst), 0);
	int burstBefore = alive(burst);

	float sizeBefore = 0.0f;
	for (auto& particle : burst->GetParticles())
		if (particle.alive) { sizeBefore = particle.size.x; break; }

	burst->SetInitialSize(burst->GetInitialSize()*3.0f);
	burst->SetInitialSizeRange(0.0f);

	int larger = 0;
	for (auto& particle : burst->GetParticles())
		if (particle.alive && particle.size.x > sizeBefore*1.5f)
			larger++;
	EXPECT_GT(larger, 0) << "burst particles must be rebaked with the new size without scrubbing";
	EXPECT_EQ(alive(burst), burstBefore);

	burst->SetParticlesPerSecond(burst->GetParticlesPerSecond()*3.0f);
	EXPECT_GT(alive(burst), burstBefore) << "burst must show more particles right after raising the emission";

	o2Scene.Clear(true);
	o2Scene.UpdateDestroyingEntities();
	AppTestDriver::PumpFrames(2);
}
