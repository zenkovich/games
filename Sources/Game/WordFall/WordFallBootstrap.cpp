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
static const int kFlyingLetters = 24; // буквы слова и буквы, выбитые бонусами
static const int kTutorialDimPieces = 48; // прямоугольники затемнения вокруг вырезов (сетка до 6 вырезов)
static const int kTutorialHoles = 8;      // светящиеся каймы вырезов
static const int kFramePieces = 24;       // кусков рамки поля каждого вида

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
	BuildTutorial(screen);
	BuildCheats(screen);

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
							   "Screen/Boosters", "Screen/Fx", "Screen/Popup", "Screen/Tutorial", "Screen/Cheats" };
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

	// подложка формы поля: квадратная заливка у каждой живой клетки и рамка,
	// собранная из кусочков (рёбра, внешние и внутренние углы) по контуру формы —
	// раскладку по уровню делает вьюха
	for (int c = 0; c < kColumns; c++)
	{
		for (int r = 0; r < kRows; r++)
		{
			Vec2F pos((c - 3)*kCellSize, (r - 3.5f)*kCellSize);
			F::CreateImage(board, String::Format("CellBack_%i_%i", c, r), kSprites + "white.png",
						   Vec2F(0.5f, 0.5f), pos, Vec2F(kCellSize + 2, kCellSize + 2), 1.0f, BorderI(),
						   Color4(38, 46, 83, 255));
		}
	}
	const char* frameKinds[12] = { "edge_top", "edge_right", "edge_bottom", "edge_left",
								   "corner_tl", "corner_tr", "corner_br", "corner_bl",
								   "inner_tl", "inner_tr", "inner_br", "inner_bl" };
	for (int k = 0; k < 12; k++)
	{
		// углы поверх рёбер: стык под ними
		float depth = k < 4 ? 2.0f : k < 8 ? 2.1f : 2.2f;
		for (int i = 0; i < kFramePieces; i++)
		{
			auto piece = F::CreateImage(board, String::Format("Frame_%s_%i", frameKinds[k], i),
										kSprites + "ui_frame_" + String(frameKinds[k]) + ".png",
										Vec2F(0.5f, 0.5f), Vec2F(0, 0), Vec2F(24, 24), depth);
			piece->SetEnabled(false);
		}
	}
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
	// сообщение под лотком: «слово уже было» и т.п.
	auto message = F::CreateLabel(tray, "Message", "", Vec2F(0.5f, 0.0f), Vec2F(0, -2), Vec2F(360, 26),
								  15, Color4(255, 200, 120, 255), HorAlign::Middle, 5.0f, true);
	message->SetEnabled(false);

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

	auto makePart = [&](const String& name, const String& proto, Ref<Actor>(*builder)(), float depth,
						const Vec2F& size = Vec2F(32, 32))
	{
		auto part = InstantiatePart(kPrototypes + proto, builder);
		part->SetName(name);
		fx->AddChild(part);

		auto widget = DynamicCast<Widget>(part);
		F::SetAnchoredRect(widget, Vec2F(0.5f, 0.5f), Vec2F(0, 0), size);
		F::SetDepth(widget, depth);
		widget->SetEnabled(false);
		return widget;
	};

	// буквы, летящие из лотка в прогресс-бар при принятии слова:
	// траектория и анимация полёта живут в прототипе FxFlyingLetter
	for (int i = 0; i < kFlyingLetters; i++)
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
		makePart(String::Format("FxRocket%i", i), "FxRocket.proto", &F::BuildFxRocketPrototype, 64.0f,
				 Vec2F(84, 84));

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
									   BorderI(), Color4(8, 16, 38, 255));
	dim->SetTransparency(200.0f/255.0f);

	// раскладка по концепту E (измерена по сетке): карточка 455×480, плашка-заголовок 410×80
	// на верхнем крае, тёмная внутренняя панель под звёздами и счётом, бейдж «+N», разделитель,
	// строка задач с галочкой, кнопка 275×66; вокруг — плитки-буквы с наклоном
	F::CreateImage(content, "Panel", kSprites + "ui_panel_board.png", Vec2F(0.5f, 0.5f), Vec2F(0, 28),
				   Vec2F(466, 490), 101.0f, kBoardSlice, Color4(150, 165, 205, 255));
	F::CreateImage(content, "Inner", kSprites + "ui_cell_back.png", Vec2F(0.5f, 0.5f), Vec2F(0, 74),
				   Vec2F(370, 196), 101.5f, BorderI(), Color4(22, 34, 70, 255));
	F::CreateImage(content, "Plate", kSprites + "ui_tile.png", Vec2F(0.5f, 0.5f), Vec2F(0, 262),
				   Vec2F(410, 88), 102.0f, BorderI(26, 26, 26, 26));
	F::CreateLabel(content, "Title", "ПОБЕДА!", Vec2F(0.5f, 0.5f), Vec2F(0, 266), Vec2F(400, 60),
				   44, F::kDarkText, HorAlign::Middle, 103.0f, true);
	for (int i = 0; i < 3; i++)
	{
		Vec2F pos(-100.0f + i*100.0f, 126.0f);
		F::CreateImage(content, String::Format("StarSlot%i", i), kSprites + "ui_star.png",
					   Vec2F(0.5f, 0.5f), pos, Vec2F(78, 78), 102.5f, BorderI(), Color4(34, 46, 84, 255));
		auto lit = F::CreateImage(content, String::Format("Star%i", i), kSprites + "ui_star.png",
								  Vec2F(0.5f, 0.5f), pos, Vec2F(84, 84), 102.6f);
		lit->SetEnabled(false);
	}
	F::CreateLabel(content, "ScoreLine", "", Vec2F(0.5f, 0.5f), Vec2F(-4, 36), Vec2F(300, 84),
				   60, F::kCaption, HorAlign::Middle, 102.0f, true);
	// бейдж — облачко с хвостиком (9-slice: хвостик в левом нижнем углу не тянется)
	auto badge = F::CreateImage(content, "Badge", kSprites + "ui_badge_bubble.png", Vec2F(0.5f, 0.5f),
								Vec2F(124, 66), Vec2F(112, 60), 102.4f, BorderI(44, 20, 32, 24));
	F::CreateLabel(badge, "BadgeText", "+0", Vec2F(0.5f, 0.5f), Vec2F(0, 6), Vec2F(104, 40),
				   22, Color4(255, 255, 255, 255), HorAlign::Middle, 102.5f, true);
	F::CreateImage(content, "Divider", kSprites + "white.png", Vec2F(0.5f, 0.5f), Vec2F(0, -14),
				   Vec2F(360, 2), 102.0f, BorderI(), Color4(58, 78, 128, 255));
	F::CreateLabel(content, "TasksLine", "", Vec2F(0.5f, 0.5f), Vec2F(-9, -62), Vec2F(300, 34),
				   24, F::kCaption, HorAlign::Middle, 102.0f, true);
	auto check = F::CreateImage(content, "TasksCheck", kSprites + "ui_check.png", Vec2F(0.5f, 0.5f), Vec2F(109, -62),
								Vec2F(30, 30), 102.5f);
	check->SetEnabled(false);
	F::CreateLabel(content, "Subtitle", "", Vec2F(0.5f, 0.5f), Vec2F(0, -104), Vec2F(420, 26),
				   15, Color4(150, 200, 255, 255), HorAlign::Middle, 102.0f, false);

	auto restart = InstantiatePart(kPrototypes + "PillButton.proto", &F::BuildPillButtonPrototype);
	restart->SetName("RestartBtn");
	content->AddChild(restart);
	auto restartWidget = DynamicCast<Widget>(restart);
	F::SetAnchoredRect(restartWidget, Vec2F(0.5f, 0.5f), Vec2F(0, -155), Vec2F(275, 70));
	F::SetDepth(restartWidget, 102.0f);
	if (auto button = DynamicCast<Button>(restart->GetChild("Btn")))
	{
		F::SetDepth(button, 102.5f);
		button->SetCaption("ЕЩЁ РАЗ");
	}

	// плитки-буквы вокруг карточки: наклон задан углом виджета (pivot по центру)
	const Vec2F spots[6] = { Vec2F(-209, 383), Vec2F(161, 393), Vec2F(-249, 138), Vec2F(256, 128), Vec2F(-234, -52), Vec2F(246, -72) };
	const float tilts[6] = { -18.0f, 14.0f, 20.0f, -16.0f, 12.0f, -22.0f };
	for (int i = 0; i < 6; i++)
	{
		auto tile = mmake<Widget>();
		tile->SetName(String::Format("Confetti%i", i));
		content->AddChild(tile);
		tile->SetLayer("UI");
		tile->AddLayer("back", mmake<Sprite>(kSprites + "ui_tile.png"), Layout::BothStretch());
		auto letter = F::MakeText(38, F::kDarkText, true);
		tile->AddLayer("letter", letter, Layout::BothStretch(0, 5, 0, 0));
		auto points = F::MakeText(13, F::kPointsText, true);
		points->SetHorAlign(HorAlign::Right);
		tile->AddLayer("points", points, Layout::Based(BaseCorner::RightBottom, Vec2F(26, 18), Vec2F(-12, 12)));
		F::SetAnchoredRect(tile, Vec2F(0.5f, 0.5f), spots[i], Vec2F(84, 84));
		tile->layout->SetPivot(Vec2F(0.5f, 0.5f));
		tile->transform->SetAngleDegrees(tilts[i]);
		F::SetDepth(tile, 103.5f);
		tile->SetEnabled(false);
	}

	content->SetEnabled(false);
	AttachView(popup, "Scripts/WordFall/WordFallPopupView.js");
}

// Туториал: затемнение-кнопка (тап — дальше), плашка с текстом и рука-указатель;
// шаги и условия ведёт вьюха
void WordFallBootstrap::BuildTutorial(const Ref<Widget>& screen)
{
	auto tutorial = mmake<Widget>();
	tutorial->SetName("Tutorial");
	screen->AddChild(tutorial);
	tutorial->SetLayer("UI");
	F::SetAnchors(tutorial, Vec2F(0, 0), Vec2F(1, 1), Vec2F(0, 0), Vec2F(0, 0));

	// затемнение с вырезами: экран режется на прямоугольники вокруг подсвеченных
	// целей, каждый кусок — кнопка (тап вне выреза ведёт дальше), в вырезах тапы
	// доходят до игры; кайма выреза — светящаяся рамка
	auto dim = mmake<Widget>();
	dim->SetName("Dim");
	tutorial->AddChild(dim);
	dim->SetLayer("UI");
	F::SetAnchors(dim, Vec2F(0, 0), Vec2F(1, 1), Vec2F(0, 0), Vec2F(0, 0));
	for (int i = 0; i < kTutorialDimPieces; i++)
	{
		auto piece = mmake<Button>();
		piece->SetName(String::Format("Piece%i", i));
		dim->AddChild(piece);
		piece->SetLayer("UI");
		auto sprite = mmake<Sprite>(kSprites + "white.png");
		sprite->SetColor(Color4(10, 20, 44, 255));
		piece->AddLayer("back", sprite, Layout::BothStretch());
		F::SetAnchoredRect(piece, Vec2F(0.5f, 0.5f), Vec2F(0, 0), Vec2F(10, 10));
		F::SetDepth(piece, 90.0f);
		piece->SetTransparency(150.0f/255.0f);
		piece->SetEnabled(false);
	}
	// кайма выреза — 9-slice рамка: углы держат радиус при любом размере выреза
	for (int i = 0; i < kTutorialHoles; i++)
	{
		auto glow = F::CreateImage(dim, String::Format("Glow%i", i), kSprites + "ui_focus.png",
								   Vec2F(0.5f, 0.5f), Vec2F(0, 0), Vec2F(100, 100), 90.5f,
								   BorderI(22, 22, 22, 22), Color4(255, 214, 120, 255));
		glow->SetTransparency(0.0f);
		glow->SetEnabled(false);
	}
	dim->SetEnabled(false);

	// текст без подложки: тень под основным лейблом читается на любом фоне
	auto caption = mmake<Widget>();
	caption->SetName("Caption");
	tutorial->AddChild(caption);
	caption->SetLayer("UI");
	F::SetAnchors(caption, Vec2F(0.5f, 0.5f), Vec2F(0.5f, 0.5f), Vec2F(-350, -74), Vec2F(350, 74));
	auto shadow = F::CreateLabel(caption, "Shadow", "", Vec2F(0.5f, 0.5f), Vec2F(3, -3), Vec2F(690, 112),
								 22, Color4(6, 14, 32, 220), HorAlign::Middle, 91.0f, true);
	shadow->SetHorOverflow(Label::HorOverflow::Wrap);
	auto text = F::CreateLabel(caption, "Text", "", Vec2F(0.5f, 0.5f), Vec2F(0, 0), Vec2F(690, 112),
							   22, Color4(255, 255, 255, 255), HorAlign::Middle, 92.0f, true);
	text->SetHorOverflow(Label::HorOverflow::Wrap);
	F::CreateLabel(caption, "Tap", "нажми, чтобы продолжить", Vec2F(0.5f, 0.0f), Vec2F(0, -10), Vec2F(690, 26),
				   14, Color4(160, 205, 255, 255), HorAlign::Middle, 92.0f, false);
	caption->SetEnabled(false);

	auto hand = F::CreateImage(tutorial, "Hand", kSprites + "ui_hand.png", Vec2F(0.5f, 0.5f), Vec2F(0, 0),
							   Vec2F(96, 96), 93.0f);
	hand->SetEnabled(false);

	AttachView(tutorial, "Scripts/WordFall/WordFallTutorialView.js");
}

// Читы: кнопка в правом верхнем углу открывает список действий
void WordFallBootstrap::BuildCheats(const Ref<Widget>& screen)
{
	auto cheats = mmake<Widget>();
	cheats->SetName("Cheats");
	screen->AddChild(cheats);
	cheats->SetLayer("UI");
	F::SetAnchors(cheats, Vec2F(0, 0), Vec2F(1, 1), Vec2F(0, 0), Vec2F(0, 0));

	auto toggle = mmake<Button>();
	toggle->SetName("Toggle");
	cheats->AddChild(toggle);
	toggle->SetLayer("UI");
	toggle->AddLayer("icon", mmake<Sprite>(kSprites + "ui_cheat_btn.png"), Layout::BothStretch());
	auto pressed = mmake<Sprite>(kSprites + "ui_cheat_btn.png");
	pressed->SetColor(Color4(180, 150, 220, 255));
	auto pressedLayer = toggle->AddLayer("pressed", pressed, Layout::BothStretch());
	pressedLayer->SetEnabled(false);
	F::SetAnchors(toggle, Vec2F(1, 1), Vec2F(1, 1), Vec2F(-50, -50), Vec2F(-6, -6));
	F::SetDepth(toggle, 95.0f);

	auto panel = F::CreateStretchedImage(cheats, "Panel", kSprites + "ui_tasks_panel.png", BorderF(), 96.0f, kTasksSlice);
	F::SetAnchors(panel, Vec2F(1, 1), Vec2F(1, 1), Vec2F(-330, -560), Vec2F(-6, -54));
	F::CreateLabel(panel, "Title", "ЧИТЫ", Vec2F(0.5f, 1.0f), Vec2F(0, -12), Vec2F(300, 26),
				   15, F::kCaption, HorAlign::Middle, 97.0f, true);
	const char* captions[8] = { "ВЫИГРАТЬ УРОВЕНЬ", "ПРОИГРАТЬ", "+5 ХОДОВ", "+100 ОЧКОВ",
								"БОНУС НА ПОЛЕ", "ЗАРЯДЫ +3", "СЛЕДУЮЩИЙ УРОВЕНЬ", "СБРОС ТУТОРИАЛОВ" };
	for (int i = 0; i < 8; i++)
	{
		auto item = InstantiatePart(kPrototypes + "PillButton.proto", &F::BuildPillButtonPrototype);
		item->SetName(String::Format("Cheat%i", i));
		panel->AddChild(item);
		auto widget = DynamicCast<Widget>(item);
		F::SetAnchoredRect(widget, Vec2F(0.5f, 1.0f), Vec2F(0, -62.0f - i*58.0f), Vec2F(280, 50));
		F::SetDepth(widget, 97.0f);
		if (auto button = DynamicCast<Button>(item->GetChild("Btn")))
		{
			F::SetDepth(button, 97.5f);
			button->SetCaption(captions[i]);
		}
	}
	panel->SetEnabled(false);

	AttachView(cheats, "Scripts/WordFall/WordFallCheatsView.js");
}
// --- META ---

DECLARE_CLASS(WordFallBootstrap, WordFallBootstrap);
// --- END META ---
