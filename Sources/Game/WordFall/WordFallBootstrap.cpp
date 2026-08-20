#include "o2/stdafx.h"
#include "WordFallBootstrap.h"

#include "WordFallGameService.h"
#include "WordFallUiFactory.h"
#include "WordFallVfx.h"
#include "o2/Assets/Assets.h"
#include "o2/Assets/Types/ActorAsset.h"
#include "o2/Assets/Types/JavaScriptAsset.h"
#include "o2/Render/Material.h"
#include "o2/Render/Sprite.h"
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
#include "o2/Scene/UI/Widget.h"
#include "o2/Scripts/ScriptEngine.h"
#include "o2/Utils/FileSystem/FileSystem.h"

using F = WordFallUiFactory;

static const Vec2F kScreenSize(768, 1376);
static const String kSprites = "WordFall/Sprites/";
static const String kPrototypes = "WordFall/Prototypes/";
static const String kScreenProto = "WordFall/Prototypes/GameScreen.proto";

// шаг сетки 96 при плитке 82: зазор между плитками 14, столько же до бортов панели
static const float kCellSize = 96.0f;
static const Vec2F kBoardCenter(0, -121);

static const BorderI kBoardSlice(40, 40, 40, 40);
static const BorderI kTasksSlice(20, 16, 20, 36);

// Меняет спрайт инстанса кнопки-иконки: слои back и pressed внутренней кнопки
static void SetIconButtonImage(const Ref<Actor>& iconButton, const String& image)
{
	auto button = DynamicCast<Button>(iconButton->GetChild("Btn"));
	if (!button)
		return;

	if (auto back = button->GetLayer("back"))
		back->SetDrawable(mmake<Sprite>(image));
	if (auto pressed = button->GetLayer("pressed"))
	{
		auto dim = mmake<Sprite>(image);
		dim->SetColor(Color4(24, 30, 52));
		pressed->SetDrawable(dim);
	}
}

Ref<Actor> WordFallBootstrap::CreateBootstrapActor()
{
	// сервисная нода с конфигами — часть сцены, видна и редактируется в редакторе
	auto service = mmake<Actor>(ActorCreateMode::InScene);
	service->SetName("GameService");
	service->AddComponent<WordFallGameService>();

	auto actor = mmake<Actor>(ActorCreateMode::InScene);
	actor->SetName("Bootstrap");
	actor->AddComponent<WordFallBootstrap>();
	return actor;
}

void WordFallBootstrap::SaveBootstrapScene(const String& path)
{
	CreateBootstrapActor();
	o2Scene.UpdateAddedEntities(); // register actors in scene roots without starting them
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

	auto service = FindOrCreateService();
	auto root = InstantiateGameScreen();

	InjectViewDependencies(root, service);

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
	camera->fillColor = Color4(101, 148, 208);
	camera->drawLayers.SetLayers(layers);
}

Ref<Actor> WordFallBootstrap::FindOrCreateService()
{
	// в bootstrap-сцене сервис уже есть; в тестах и при прямом запуске — создаём
	auto actor = o2Scene.FindActor("GameService");
	if (!actor)
	{
		actor = mmake<Actor>(ActorCreateMode::InScene);
		actor->SetName("GameService");
		actor->AddComponent<WordFallGameService>();
	}
	return actor;
}

Ref<Actor> WordFallBootstrap::InstantiatePart(const String& assetPath, Ref<Actor>(*builder)())
{
	auto asset = o2Assets.GetAssetRefByType<ActorAsset>(assetPath);

	// ассета ещё нет (свежий чекаут): на десктопе собрать и сохранить прототип —
	// сохранённый ассет попадает в кэш и сразу пригоден для инстанцирования
#if defined PLATFORM_WINDOWS || defined PLATFORM_MAC || defined PLATFORM_LINUX
	if (!asset || !asset->GetActor())
	{
		String fullPath = o2Assets.GetAssetsPath() + assetPath;
		o2FileSystem.FolderCreate(o2FileSystem.GetParentPath(fullPath), false);
		if (!o2FileSystem.IsFileExist(fullPath))
		{
			auto prevMode = Actor::GetDefaultCreationMode();
			Actor::SetDefaultCreationMode(ActorCreateMode::NotInScene);
			auto protoActor = builder();
			Actor::SetDefaultCreationMode(prevMode);

			auto protoAsset = mmake<ActorAsset>(protoActor);
			protoAsset->Save(assetPath); // путь относительно Assets — базу подставит дерево ассетов

			asset = o2Assets.GetAssetRefByType<ActorAsset>(assetPath);
		}
	}
#endif

	if (asset && asset->GetActor())
	{
		if (auto instance = asset->Instantiate())
			return instance;
	}

	// файл есть, но в дереве ассетов его ещё нет (до пересборки ассетов) — прямая сборка
	return builder();
}

Ref<Actor> WordFallBootstrap::InstantiateGameScreen()
{
	// прототип экрана — редактируемый ассет; внутри — инстансы прототипов частей
	// (плитки, слоты, кнопки, строки задач, эффекты) с прототип-линками
	return InstantiatePart(kScreenProto, &WordFallBootstrap::BuildGameScreen);
}

Ref<Actor> WordFallBootstrap::BuildGameScreen()
{
	auto root = mmake<Actor>();
	root->SetName("WordFall");
	root->transform->SetSize2D(Vec2F(0, 0));
	root->transform->SetPosition2D(Vec2F(0, 0));

	// фон вдвое шире экрана — закрывает поля на широких соотношениях сторон
	auto bg = mmake<Actor>();
	bg->SetName("BG");
	root->AddChild(bg);
	bg->SetLayer("BG");
	auto bgSprite = bg->AddComponent<ImageComponent>();
	bgSprite->LoadFromImage(kSprites + "background.png", false);
	bg->transform->SetSize2D(Vec2F(kScreenSize.x*2.0f, kScreenSize.y));
	bg->transform->SetPosition2D(Vec2F(0, 0));

	// якорная база UI: логическая канва экрана, секции растягиваются внутри неё
	auto screen = F::CreateSection(root, "Screen", Vec2F(0, 0), Vec2F(0, 0), kScreenSize);

	BuildBoard(screen);
	BuildHud(screen);
	BuildTasks(screen);
	BuildWordBar(screen);
	BuildBoosters(screen);
	BuildFx(screen);
	BuildPopup(screen);

	BuildVfx(root);

	return root;
}

void WordFallBootstrap::BuildVfx(const Ref<Actor>& root)
{
	auto vfx = mmake<Actor>();
	vfx->SetName("Vfx");
	root->AddChild(vfx);
	vfx->transform->SetSize2D(Vec2F(0, 0));
	vfx->transform->SetPosition2D(Vec2F(0, 0));
	vfx->AddComponent<WordFallVfx>();
}

void WordFallBootstrap::AttachView(const Ref<Actor>& sectionActor, const String& scriptPath)
{
	auto scriptable = sectionActor->AddComponent<ScriptableComponent>();
	scriptable->SetScript(o2Assets.GetAssetRefByType<JavaScriptAsset>(scriptPath));
}

void WordFallBootstrap::InjectViewDependencies(const Ref<Actor>& root, const Ref<Actor>& service)
{
	if (!root)
		return;

	auto vfx = root->GetChild("Vfx");

	const char* sections[] = { "Screen/Hud", "Screen/Tasks", "Screen/WordBar", "Screen/Board",
							   "Screen/Boosters", "Screen/Fx", "Screen/Popup" };
	for (auto path : sections)
	{
		auto sectionActor = root->GetChild(path);
		if (!sectionActor)
			continue;

		if (auto scriptable = sectionActor->GetComponent<ScriptableComponent>())
		{
			auto instance = scriptable->GetInstance();
			if (instance.IsObject())
			{
				instance.SetProperty("serviceActor", ScriptValue(service));
				instance.SetProperty("vfxActor", ScriptValue(vfx));
			}
		}
	}
}

void WordFallBootstrap::BuildBoard(const Ref<Widget>& screen)
{
	// поле — сетка фиксированного размера, центрируется на экране
	auto board = F::CreateSection(screen, "Board", Vec2F(0.5f, 0.5f), kBoardCenter,
								  Vec2F(kCellSize*kColumns, kCellSize*kRows));

	// секция — габарит ячеек: край плитки в 7px от края секции, борт панели ещё в 7px
	F::CreateStretchedImage(board, "Panel", kSprites + "ui_panel_board.png",
							BorderF(7, 7, 7, 7), 1.0f, kBoardSlice);

	for (int c = 0; c < kColumns; c++)
	{
		for (int r = 0; r < kRows; r++)
		{
			auto tile = InstantiatePart(kPrototypes + "Tile.proto", &F::BuildTilePrototype);
			tile->SetName(String::Format("Tile_%i_%i", c, r));
			board->AddChild(tile);

			auto widget = DynamicCast<Widget>(tile);
			F::SetAnchoredRect(widget, Vec2F(0.5f, 0.5f),
							   Vec2F((c - 3)*kCellSize, (r - 3.5f)*kCellSize),
							   Vec2F(F::kTileSize, F::kTileSize));

			// верхние ряды рисуются позже — их кромка ложится на плитки ниже
			F::SetDepth(widget, 10.0f + r*0.1f);
		}
	}

	AttachView(board, "Scripts/WordFall/WordFallBoardView.js");
}

void WordFallBootstrap::BuildHud(const Ref<Widget>& screen)
{
	// верхний ряд растянут вдоль верхней кромки экрана
	auto hud = mmake<Widget>();
	hud->SetName("Hud");
	screen->AddChild(hud);
	hud->SetLayer("UI");
	F::SetAnchors(hud, Vec2F(0, 1), Vec2F(1, 1), Vec2F(0, -160), Vec2F(0, -10));

	// бокс уровня прижат к левому краю; подпись и число — его дети
	auto levelBox = F::CreateImage(hud, "LevelBox", kSprites + "ui_level_box.png",
								   Vec2F(0, 0.5f), Vec2F(0, 0), Vec2F(137, 116), 2.0f);
	F::SetAnchors(levelBox, Vec2F(0, 0.5f), Vec2F(0, 0.5f), Vec2F(26, -58), Vec2F(163, 58));
	F::CreateLabel(levelBox, "Caption", "УРОВЕНЬ", Vec2F(0.5f, 1.0f), Vec2F(0, -24), Vec2F(130, 30),
				   15, F::kCaption, HorAlign::Middle, 3.0f, true);
	F::CreateLabel(levelBox, "Value", "1", Vec2F(0.5f, 0.5f), Vec2F(0, -14), Vec2F(130, 56),
				   34, F::kCaption, HorAlign::Middle, 3.0f, true);

	// панель очков по центру: подпись, прогресс и счёт — дети панели
	auto scorePanel = F::CreateImage(hud, "ScorePanel", kSprites + "ui_score_panel.png",
									 Vec2F(0.5f, 0.5f), Vec2F(0, 0), Vec2F(375, 113), 2.0f);
	F::CreateLabel(scorePanel, "Caption", "ОЧКИ", Vec2F(0.5f, 1.0f), Vec2F(0, -20), Vec2F(200, 28),
				   16, F::kCaption, HorAlign::Middle, 3.0f, true);
	F::CreateProgressBar(scorePanel, "Bar", kSprites + "ui_bar_fill.png",
						 Vec2F(0.5f, 0.5f), Vec2F(0, -5), Vec2F(325, 34), 3.5f);
	F::CreateLabel(scorePanel, "ScoreLabel", "0/250", Vec2F(0.5f, 0.5f), Vec2F(0, -5), Vec2F(310, 34),
				   20, F::kCaption, HorAlign::Middle, 4.0f, true);

	// бокс ходов прижат к правому краю
	auto movesBox = F::CreateImage(hud, "MovesBox", kSprites + "ui_moves_box.png",
								   Vec2F(1, 0.5f), Vec2F(0, 0), Vec2F(133, 114), 2.0f);
	F::SetAnchors(movesBox, Vec2F(1, 0.5f), Vec2F(1, 0.5f), Vec2F(-159, -57), Vec2F(-26, 57));
	F::CreateLabel(movesBox, "Caption", "ХОДЫ", Vec2F(0.5f, 1.0f), Vec2F(0, -24), Vec2F(130, 30),
				   15, F::kCaption, HorAlign::Middle, 3.0f, true);
	F::CreateLabel(movesBox, "Value", "12", Vec2F(0.5f, 0.5f), Vec2F(0, -14), Vec2F(130, 56),
				   34, F::kCaption, HorAlign::Middle, 3.0f, true);

	AttachView(hud, "Scripts/WordFall/WordFallHudView.js");
}

void WordFallBootstrap::BuildTasks(const Ref<Widget>& screen)
{
	// панель задач растянута по ширине с полями, прижата под HUD
	auto tasks = mmake<Widget>();
	tasks->SetName("Tasks");
	screen->AddChild(tasks);
	tasks->SetLayer("UI");
	F::SetAnchors(tasks, Vec2F(0, 1), Vec2F(1, 1), Vec2F(28, -296), Vec2F(-28, -168));

	F::CreateStretchedImage(tasks, "Panel", kSprites + "ui_tasks_panel.png", BorderF(), 2.0f, kTasksSlice);
	F::CreateLabel(tasks, "Title", "ЗАДАЧИ", Vec2F(0.5f, 1.0f), Vec2F(0, -13), Vec2F(320, 24),
				   14, F::kCaption, HorAlign::Middle, 20.0f, true);

	// строки задач (прототип TaskRow) в две колонки: левая — левая половина панели,
	// правая — правая; вертикальную раскладку ведёт вьюха по своим полям
	for (int i = 0; i < kMaxTasks; i++)
	{
		bool left = i % 2 == 0;
		float rowY = -44.0f - (i/2)*32.0f;

		auto row = InstantiatePart(kPrototypes + "TaskRow.proto", &F::BuildTaskRowPrototype);
		row->SetName(String::Format("Task%i", i));
		tasks->AddChild(row);

		auto rowWidget = DynamicCast<Widget>(row);
		F::SetAnchors(rowWidget, Vec2F(left ? 0.0f : 0.5f, 1.0f), Vec2F(left ? 0.5f : 1.0f, 1.0f),
					  Vec2F(left ? 28.0f : 12.0f, rowY - 15.0f),
					  Vec2F(left ? -12.0f : -28.0f, rowY + 15.0f));
		F::SetDepth(rowWidget, 20.0f);
	}

	AttachView(tasks, "Scripts/WordFall/WordFallTasksView.js");
}

void WordFallBootstrap::BuildWordBar(const Ref<Widget>& screen)
{
	// панель слова растянута по ширине: лоток тянется, кнопки прижаты к правому краю
	auto wordBar = mmake<Widget>();
	wordBar->SetName("WordBar");
	screen->AddChild(wordBar);
	wordBar->SetLayer("UI");
	F::SetAnchors(wordBar, Vec2F(0, 1), Vec2F(1, 1), Vec2F(0, -410), Vec2F(0, -304));

	// слоты набираемого слова и счётчик «+N» — дети лотка
	auto tray = F::CreateImage(wordBar, "Tray", kSprites + "ui_input_tray.png",
							   Vec2F(0.5f, 0.5f), Vec2F(0, 0), Vec2F(490, 100), 5.0f);
	F::SetAnchors(tray, Vec2F(0, 0.5f), Vec2F(1, 0.5f), Vec2F(26, -50), Vec2F(-218, 50));

	for (int i = 0; i < kWordSlots; i++)
	{
		auto slot = InstantiatePart(kPrototypes + "WordSlot.proto", &F::BuildWordSlotPrototype);
		slot->SetName(String::Format("Slot%i", i));
		tray->AddChild(slot);
		F::SetDepth(DynamicCast<Widget>(slot), 25.0f);
	}

	F::CreateLabel(tray, "GainLabel", "", Vec2F(0.5f, 1.0f), Vec2F(0, 24), Vec2F(240, 40),
				   24, Color4(255, 232, 120), HorAlign::Middle, 20.0f, true);

	// флаеры перелёта букв живут в Screen — летят в экранных координатах над всем UI
	for (int i = 0; i < kFlyers; i++)
	{
		auto flyer = InstantiatePart(kPrototypes + "WordSlot.proto", &F::BuildWordSlotPrototype);
		flyer->SetName(String::Format("Flyer%i", i));
		screen->AddChild(flyer);
		F::SetDepth(DynamicCast<Widget>(flyer), 45.0f);
	}

	auto accept = InstantiatePart(kPrototypes + "IconButton.proto", &F::BuildIconButtonPrototype);
	accept->SetName("AcceptBtn");
	wordBar->AddChild(accept);
	auto acceptWidget = DynamicCast<Widget>(accept);
	F::SetAnchors(acceptWidget, Vec2F(1, 0.5f), Vec2F(1, 0.5f), Vec2F(-206, -48), Vec2F(-118, 47));
	F::SetDepth(acceptWidget, 21.0f);
	if (auto button = DynamicCast<Button>(accept->GetChild("Btn")))
		F::SetDepth(button, 21.5f);

	auto clear = InstantiatePart(kPrototypes + "IconButton.proto", &F::BuildIconButtonPrototype);
	clear->SetName("ClearBtn");
	wordBar->AddChild(clear);
	auto clearWidget = DynamicCast<Widget>(clear);
	F::SetAnchors(clearWidget, Vec2F(1, 0.5f), Vec2F(1, 0.5f), Vec2F(-104, -46), Vec2F(-12, 46));
	F::SetDepth(clearWidget, 21.0f);
	if (auto button = DynamicCast<Button>(clear->GetChild("Btn")))
		F::SetDepth(button, 21.5f);
	SetIconButtonImage(clear, kSprites + "ui_btn_cancel.png");

	AttachView(wordBar, "Scripts/WordFall/WordFallWordPanelView.js");
}

void WordFallBootstrap::BuildBoosters(const Ref<Widget>& screen)
{
	// нижний ряд растянут вдоль нижней кромки экрана, кнопки центрированы внутри
	auto boosters = mmake<Widget>();
	boosters->SetName("Boosters");
	screen->AddChild(boosters);
	boosters->SetLayer("UI");
	F::SetAnchors(boosters, Vec2F(0, 0), Vec2F(1, 0), Vec2F(0, 13), Vec2F(0, 163));

	const char* keys[5] = { "hammer", "shuffle", "hint", "joker", "x2" };
	for (int i = 0; i < 5; i++)
	{
		auto booster = InstantiatePart(kPrototypes + "Booster.proto", &F::BuildBoosterPrototype);
		booster->SetName(String::Format("Booster%i", i));
		boosters->AddChild(booster);

		auto widget = DynamicCast<Widget>(booster);
		F::SetAnchoredRect(widget, Vec2F(0.5f, 0.5f), Vec2F(-264.0f + i*132.0f, 0), Vec2F(120, 114));
		F::SetDepth(widget, 10.0f + i);

		// иконка бустера — свой спрайт для каждого инстанса прототипа
		if (auto button = DynamicCast<Button>(booster->GetChild("Btn")))
		{
			String image = kSprites + "ui_booster_" + keys[i] + ".png";
			if (auto icon = button->GetLayer("icon"))
				icon->SetDrawable(mmake<Sprite>(image));
			if (auto pressed = button->GetLayer("pressed"))
			{
				auto dim = mmake<Sprite>(image);
				dim->SetColor(Color4(24, 30, 52));
				pressed->SetDrawable(dim);
			}
		}
	}

	F::CreateLabel(boosters, "ModeLabel", "", Vec2F(0.5f, 1.0f), Vec2F(0, 6), Vec2F(500, 36),
				   17, F::kCaption, HorAlign::Middle, 20.0f, true);

	AttachView(boosters, "Scripts/WordFall/WordFallBoostersView.js");
}

// Пулы виджетов хореографии начисления очков и эффектов пауэрапов из прототипов:
// вспышки, звёзды, свечение итога, лучи ракеты
void WordFallBootstrap::BuildFx(const Ref<Widget>& screen)
{
	auto fx = mmake<Widget>();
	fx->SetName("Fx");
	screen->AddChild(fx);
	fx->SetLayer("UI");
	F::SetAnchors(fx, Vec2F(0, 0), Vec2F(1, 1), Vec2F(0, 0), Vec2F(0, 0));

	auto makePart = [&](const String& name, const String& proto, Ref<Actor>(*builder)(), float depth)
	{
		auto part = InstantiatePart(kPrototypes + proto, builder);
		part->SetName(name);
		fx->AddChild(part);

		auto widget = DynamicCast<Widget>(part);
		F::SetAnchoredRect(widget, Vec2F(0.5f, 0.5f), Vec2F(0, 0), Vec2F(32, 32));
		F::SetDepth(widget, depth);
		widget->SetEnabled(false);
		return widget;
	};

	// буквы, летящие из лотка в прогресс-бар при принятии слова:
	// траектория и анимация полёта живут в прототипе FxFlyingLetter
	for (int i = 0; i < kWordSlots; i++)
	{
		auto letter = InstantiatePart(kPrototypes + "FxFlyingLetter.proto", &F::BuildFlyingLetterPrototype);
		letter->SetName(String::Format("FxLetter%i", i));
		fx->AddChild(letter);

		auto widget = DynamicCast<Widget>(letter);
		F::SetAnchoredRect(widget, Vec2F(0.5f, 0.5f), Vec2F(0, 0), Vec2F(64, 64));
		F::SetDepth(widget, 61.0f);
		widget->SetEnabled(false);
	}

	// всплывающий «+N» у бара
	auto total = F::CreateLabel(fx, "FxTotal", "", Vec2F(0.5f, 0.5f), Vec2F(0, 0), Vec2F(90, 44),
								26, F::kCaption, HorAlign::Middle, 63.0f, true);
	total->SetEnabled(false);

	for (int i = 0; i < 10; i++)
		makePart(String::Format("FxFlash%i", i), "FxFlash.proto", &F::BuildFxFlashPrototype, 60.0f);

	// ракеты бонусов: одиночная и залп фейерверка (до 10 одновременно)
	for (int i = 0; i < 10; i++)
		makePart(String::Format("FxRocket%i", i), "FxRocket.proto", &F::BuildFxRocketPrototype, 64.0f);

	makePart("FxBeamH", "FxBeam.proto", &F::BuildFxBeamPrototype, 59.0f);
	makePart("FxBeamV", "FxBeam.proto", &F::BuildFxBeamPrototype, 59.0f);

	AttachView(fx, "Scripts/WordFall/WordFallFxView.js");
}

void WordFallBootstrap::BuildPopup(const Ref<Widget>& screen)
{
	auto popup = mmake<Widget>();
	popup->SetName("Popup");
	screen->AddChild(popup);
	popup->SetLayer("UI");
	F::SetAnchors(popup, Vec2F(0, 0), Vec2F(1, 1), Vec2F(0, 0), Vec2F(0, 0));

	// контент выключается отдельно — вьюха на всегда-активном Popup
	auto content = mmake<Widget>();
	content->SetName("Content");
	popup->AddChild(content);
	content->SetLayer("UI");
	F::SetAnchors(content, Vec2F(0, 0), Vec2F(1, 1), Vec2F(-10, -10), Vec2F(10, 10));

	// полупрозрачность — прозрачностью виджета: альфу цвета спрайта затирает
	// апдейт прозрачности слоёв, а прозрачность виджета сериализуется и клонируется
	auto dim = F::CreateStretchedImage(content, "Dim", kSprites + "white.png", BorderF(), 100.0f,
									   BorderI(), Color4(14, 26, 52, 255));
	dim->SetTransparency(170.0f/255.0f);

	F::CreateImage(content, "Panel", kSprites + "ui_panel_board.png", Vec2F(0.5f, 0.5f), Vec2F(0, 10),
				   Vec2F(520, 400), 101.0f, kBoardSlice);

	F::CreateLabel(content, "Title", "ПОБЕДА!", Vec2F(0.5f, 0.5f), Vec2F(0, 125), Vec2F(460, 60),
				   32, F::kCaption, HorAlign::Middle, 102.0f, true);
	F::CreateLabel(content, "ScoreLine", "", Vec2F(0.5f, 0.5f), Vec2F(0, 55), Vec2F(440, 50),
				   24, F::kAccent, HorAlign::Middle, 102.0f, true);

	auto restart = InstantiatePart(kPrototypes + "PillButton.proto", &F::BuildPillButtonPrototype);
	restart->SetName("RestartBtn");
	content->AddChild(restart);
	auto restartWidget = DynamicCast<Widget>(restart);
	F::SetAnchoredRect(restartWidget, Vec2F(0.5f, 0.5f), Vec2F(0, -80), Vec2F(220, 64));
	F::SetDepth(restartWidget, 102.0f);
	if (auto button = DynamicCast<Button>(restart->GetChild("Btn")))
	{
		F::SetDepth(button, 102.5f);
		button->SetCaption("ЕЩЁ РАЗ");
	}

	content->SetEnabled(false);

	AttachView(popup, "Scripts/WordFall/WordFallPopupView.js");
}
// --- META ---

DECLARE_CLASS(WordFallBootstrap, WordFallBootstrap);
// --- END META ---
