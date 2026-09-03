#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "WordFall/WordFallBootstrap.h"
#include "WordFall/WordFallGameService.h"
#include "o2/Application/Application.h"
#include "o2/Assets/Assets.h"
#include "o2/Assets/Types/SceneAsset.h"
#include "o2/Scene/Actor.h"
#include "o2/Scene/Components/AnimationComponent.h"
#include "o2/Scene/Components/FlightTrajectoryComponent.h"
#include "o2/Scene/Components/ParticlesEmitterComponent.h"
#include "o2/Scene/Scene.h"
#include "o2/Render/Render.h"
#include "o2/Scene/UI/Widgets/Button.h"
#include "o2/Scene/UI/Widget.h"
#include "o2/Scene/UI/WidgetLayer.h"
#include "o2/Scene/UI/WidgetLayout.h"
#include "o2/Scene/UI/Widgets/HorizontalProgress.h"
#include "o2/Scene/UI/Widgets/Label.h"
#include "o2/Utils/FileSystem/FileSystem.h"
#include "o2/Utils/Test/AppTestDriver.h"

using namespace o2;

namespace
{
	const String kScreenshotsDir = "../../Work/ScreenShots/";

	// Портретное окно 768x1376 система может ужать по высоте экрана; fitted-камера
	// масштабирует картинку, ввод конвертируется через камеру — кликаем в оконных
	// координатах: мировые * масштаб камеры
	Vec2F ToWindow(const Vec2F& worldPos)
	{
		Vec2F resolution = (Vec2F)o2Render.GetResolution();
		float scale = Math::Min(resolution.x/768.0f, resolution.y/1376.0f);
		return worldPos*scale;
	}

	void Click(const Vec2F& worldPos)
	{
		AppTestDriver::Click(ToWindow(worldPos));
	}

	void ClickTile(int column, int row)
	{
		Click(WordFallBootstrap::TilePosition(column, row));
		AppTestDriver::PumpFrames(2);
	}

	// Число перед "/" в подписи счёта "N/M"
	int ShownScore(const Ref<Label>& label)
	{
		String text = label->GetText();
		int value = 0;
		for (int i = 0; i < text.Length() && text[i] >= '0' && text[i] <= '9'; i++)
			value = value*10 + (text[i] - '0');
		return value;
	}
}

// Гоняет реальный экран Word Fall: bootstrap строит сцену из прототипов,
// JS-вьюхи цепляются к C++ сервису, тест кликает настоящими кнопками
class WordFallUI: public ::testing::Test
{
protected:
	Ref<WordFallGameService> mService;

	void SetUp() override
	{
		o2Application.SetWindowSize(Vec2I(768, 1376));
		o2FileSystem.FileDelete("wordfall_progress.json"); // чистый прогресс для каждого теста

		WordFallBootstrap::CreateBootstrapActor();
		o2Scene.UpdateAddedEntities(); // зарегистрировать акторы, не стартуя их

		// фиксированный сид до старта сервиса
		auto serviceActor = o2Scene.FindActor("GameService");
		ASSERT_TRUE(serviceActor);
		mService = serviceActor->GetComponent<WordFallGameService>();
		ASSERT_TRUE(mService);
		mService->randomSeed = 42;

		AppTestDriver::PumpFrames(10); // bootstrap OnStart + вьюхи OnStart + лэйауты
	}

	void TearDown() override
	{
		mService = nullptr;
		o2Scene.Clear(true);
		o2Scene.UpdateDestroyingEntities();
		AppTestDriver::PumpFrames(2);
	}

	// Выкладывает КОТ в нижний ряд в колонки 1..3
	void PlantKot()
	{
		mService->DebugSetTile(1, 0, "К");
		mService->DebugSetTile(2, 0, "О");
		mService->DebugSetTile(3, 0, "Т");
		AppTestDriver::PumpFrames(2);
	}
};

TEST_F(WordFallUI, SceneBuildsScreenSectionsFromPrototypes)
{
	auto root = o2Scene.FindActor("WordFall");
	ASSERT_TRUE(root);

	for (int c = 0; c < WordFallBootstrap::kColumns; c++)
	{
		for (int r = 0; r < WordFallBootstrap::kRows; r++)
		{
			auto tile = root->GetChild(String::Format("Screen/Board/Tile_%i_%i", c, r));
			ASSERT_TRUE(tile) << "tile " << c << " " << r;
			EXPECT_TRUE(DynamicCast<Button>(tile));
		}
	}

	EXPECT_TRUE(root->GetChild("Screen/Hud/ScorePanel/ScoreLabel"));
	EXPECT_TRUE(root->GetChild("Screen/Hud/ScorePanel/Bar"));
	EXPECT_TRUE(root->GetChild("Screen/Tasks/Task0"));
	EXPECT_TRUE(root->GetChild("Screen/WordBar/AcceptBtn"));
	EXPECT_TRUE(root->GetChild("Screen/WordBar/Tray/Slot0"));
	EXPECT_TRUE(root->GetChild("Screen/Boosters/Booster4/Btn"));
	EXPECT_TRUE(root->GetChild("Vfx"));
	EXPECT_FALSE(root->GetChild("Screen/Popup/Content")->IsEnabled());

	// сервис заполнил каждую плитку буквой
	for (int c = 0; c < WordFallBootstrap::kColumns; c++)
	{
		for (int r = 0; r < WordFallBootstrap::kRows; r++)
			EXPECT_FALSE(mService->GetLevel().GetBoard().GetTile(Vec2I(c, r)).letter.IsEmpty());
	}

	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "01_board.png"));
}

TEST_F(WordFallUI, ClickingTilesSelectsWordAndSlotsFly)
{
	PlantKot();

	ClickTile(1, 0);
	ClickTile(2, 0);
	ClickTile(3, 0);

	EXPECT_EQ(mService->GetCurrentWord(), String("КОТ"));

	AppTestDriver::Wait(0.5f); // буквы долетают до панели слова
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "02_selection.png"));

	auto root = o2Scene.FindActor("WordFall");
	ASSERT_TRUE(root);
	EXPECT_TRUE(root->GetChild("Screen/WordBar/Tray/Slot0")->IsEnabled());
	EXPECT_TRUE(root->GetChild("Screen/WordBar/Tray/Slot2")->IsEnabled());
	EXPECT_FALSE(root->GetChild("Screen/WordBar/Tray/Slot3")->IsEnabled());

	// выбранные плитки улетели с поля — их ячейки пустые
	EXPECT_FALSE(root->GetChild("Screen/Board/Tile_1_0")->IsEnabled());
	EXPECT_FALSE(root->GetChild("Screen/Board/Tile_3_0")->IsEnabled());

	// клик по первому слоту лотка снимает выбор с буквы и хвоста — весь выбор
	Click(Vec2F(-166, 331));
	AppTestDriver::PumpFrames(2);
	EXPECT_EQ(mService->GetLevel().GetBoard().GetSelection().Count(), 0);
	EXPECT_TRUE(root->GetChild("Screen/Board/Tile_1_0")->IsEnabled());
}

TEST_F(WordFallUI, AcceptButtonBurnsWordAndScores)
{
	PlantKot();
	ClickTile(1, 0);
	ClickTile(2, 0);
	ClickTile(3, 0);

	Click(Vec2F(222, 331)); // ПРИНЯТЬ
	AppTestDriver::PumpFrames(3);

	// скрин подтверждения: буквы ещё на месте, играют вспышки и цифры
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "03_falling.png"));

	// КОТ подряд: base 4 × кластер 3 = 12 (модель обновляется сразу)
	EXPECT_EQ(mService->GetScore(), 12);
	EXPECT_EQ(mService->GetMovesLeft(), 11);

	// середина полёта: плашка видима и едет по траектории компонента
	AppTestDriver::Wait(0.22f);
	auto root = o2Scene.FindActor("WordFall");
	ASSERT_TRUE(root);
	auto flyer = root->GetChild("Screen/Fx/FxLetter0");
	ASSERT_TRUE(flyer);
	EXPECT_TRUE(flyer->IsEnabled());
	auto trajectory = flyer->GetComponent<FlightTrajectoryComponent>();
	ASSERT_TRUE(trajectory);
	EXPECT_GT(trajectory->position, 0.0f);

	// саб-трек анимации завёл искровый след (время двигает трек, не Play —
	// признак работы: частицы родились)
	auto sparks = flyer->GetChild("Sparks");
	ASSERT_TRUE(sparks);
	auto emitter = sparks->GetComponent<ParticlesEmitterComponent>();
	ASSERT_TRUE(emitter);
	EXPECT_GT(emitter->GetParticlesCount(), 0);

	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "03b_letter_flight.png"));

	// прилёт первой буквы: звезда влетела, пучок искр выпущен
	AppTestDriver::Wait(0.3f);
	EXPECT_TRUE(DynamicCast<Widget>(flyer)->GetLayer("star"));
	auto burst = flyer->GetChild("Burst");
	ASSERT_TRUE(burst);
	auto burstEmitter = burst->GetComponent<ParticlesEmitterComponent>();
	ASSERT_TRUE(burstEmitter);
	EXPECT_GT(burstEmitter->GetParticlesCount(), 0);
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "03c_star_burst.png"));

	AppTestDriver::Wait(3.0f); // хореография и падение доигрываются
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "04_after_word.png"));
}

// Повторные сборы: хвост прошлой анимации полёта не должен гасить свежую
// плашку (мигание) — на старте каждого сбора буква полностью видима
TEST_F(WordFallUI, ConsecutiveWordsKeepFlyingLettersVisible)
{
	auto root = o2Scene.FindActor("WordFall");
	ASSERT_TRUE(root);
	auto flyer = DynamicCast<Widget>(root->GetChild("Screen/Fx/FxLetter0"));
	ASSERT_TRUE(flyer);

	for (int word = 0; word < 3; word++)
	{
		PlantKot();
		ClickTile(1, 0);
		ClickTile(2, 0);
		ClickTile(3, 0);

		Click(Vec2F(222, 331)); // ПРИНЯТЬ
		AppTestDriver::PumpFrames(2);

		// плашка встала на место слота: видима, звезда скрыта
		EXPECT_TRUE(flyer->IsEnabled()) << "word " << word;
		EXPECT_GT(flyer->GetLayer("back")->GetTransparency(), 0.9f) << "word " << word;
		EXPECT_LT(flyer->GetLayer("star")->GetTransparency(), 0.1f) << "word " << word;

		// первая половина полёта: буква всё ещё видима
		AppTestDriver::Wait(0.15f);
		EXPECT_GT(flyer->GetLayer("back")->GetTransparency(), 0.5f) << "word " << word;

		if (word == 2)
		{
			// серия кадров третьего сбора для визуальной проверки динамики
			EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "10_multi_word_a.png"));
			AppTestDriver::Wait(0.15f);
			EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "10_multi_word_b.png"));
			AppTestDriver::Wait(0.15f);
			EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "10_multi_word_c.png"));
			AppTestDriver::Wait(0.15f);
			EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "10_multi_word_d.png"));
		}

		AppTestDriver::Wait(2.0f); // хореография и падение доигрываются
	}
}

TEST_F(WordFallUI, ClearButtonDropsSelection)
{
	PlantKot();
	ClickTile(1, 0);
	ClickTile(2, 0);

	Click(Vec2F(326, 331)); // крестик сброса
	AppTestDriver::PumpFrames(2);

	EXPECT_EQ(mService->GetLevel().GetBoard().GetSelection().Count(), 0);
}

TEST_F(WordFallUI, HammerBoosterRemovesTileWithoutMove)
{
	Click(Vec2F(-264, -600)); // молоток — режим прицела
	AppTestDriver::PumpFrames(2);
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "05_hammer_aim.png"));

	ClickTile(0, 0);
	AppTestDriver::PumpFrames(2);

	EXPECT_EQ(mService->GetBoosterCharges(0), 2);
	EXPECT_EQ(mService->GetMovesLeft(), 12);
}

TEST_F(WordFallUI, WinShowsPopupAndNextLevelStarts)
{
	// очки — обязательное условие; задачи уровня закрываем читом
	mService->DebugSetTargetScore(10);
	mService->DebugCompleteTasks();

	PlantKot();
	ClickTile(1, 0);
	ClickTile(2, 0);
	ClickTile(3, 0);

	Click(Vec2F(222, 331)); // ПРИНЯТЬ
	AppTestDriver::PumpFrames(3);

	// победа зафиксирована сразу, попап ждёт окончания начисления очков
	auto root = o2Scene.FindActor("WordFall");
	ASSERT_TRUE(root);
	EXPECT_EQ(mService->GetGameState(), String("won"));
	EXPECT_FALSE(root->GetChild("Screen/Popup/Content")->IsEnabled());

	AppTestDriver::Wait(3.0f); // хореография доигрывается
	EXPECT_TRUE(root->GetChild("Screen/Popup/Content")->IsEnabled());
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "06_win_popup.png"));

	Click(Vec2F(0, -80)); // ДАЛЬШЕ
	AppTestDriver::PumpFrames(3);

	// после победы стартует следующий уровень кампании
	EXPECT_FALSE(root->GetChild("Screen/Popup/Content")->IsEnabled());
	EXPECT_EQ(mService->GetLevelIndex(), 1);
	EXPECT_EQ(mService->GetScore(), 0);
	EXPECT_EQ(mService->GetGameState(), String("playing"));

	// прогресс сохранился на диск
	PlayerProgress saved;
	EXPECT_TRUE(saved.Load(mService->progressPath));
	EXPECT_EQ(saved.currentLevel, 1);

	o2FileSystem.FileDelete(mService->progressPath);
}

TEST_F(WordFallUI, TasksPanelShowsLevelTasks)
{
	auto root = o2Scene.FindActor("WordFall");
	ASSERT_TRUE(root);

	// уровень 1 содержит 3 задачи — первые три строки заполнены, остальные пустые
	auto task0 = DynamicCast<Label>(root->GetChild("Screen/Tasks/Task0/Text"));
	auto task2 = DynamicCast<Label>(root->GetChild("Screen/Tasks/Task2/Text"));
	auto task3 = DynamicCast<Label>(root->GetChild("Screen/Tasks/Task3/Text"));
	ASSERT_TRUE(task0 && task2 && task3);
	EXPECT_FALSE(task0->GetText().IsEmpty());
	EXPECT_FALSE(task2->GetText().IsEmpty());
	EXPECT_TRUE(task3->GetText().IsEmpty());

	auto levelLabel = DynamicCast<Label>(root->GetChild("Screen/Hud/LevelBox/Value"));
	ASSERT_TRUE(levelLabel);
	EXPECT_EQ(levelLabel->GetText(), WString("1"));

	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "07_tasks_panel.png"));
}

TEST_F(WordFallUI, FiveLetterWordSpawnsBombPowerup)
{
	mService->DebugSetTile(1, 0, "Ч");
	mService->DebugSetTile(2, 0, "А");
	mService->DebugSetTile(3, 0, "Ш");
	mService->DebugSetTile(4, 0, "К");
	mService->DebugSetTile(5, 0, "А");
	AppTestDriver::PumpFrames(2);

	for (int i = 1; i <= 5; i++)
		ClickTile(i, 0);

	Click(Vec2F(222, 331)); // ПРИНЯТЬ
	AppTestDriver::PumpFrames(3);

	// бомба в модели — сразу, занимает слот вместо буквы
	auto& bonusTile = mService->GetLevel().GetBoard().GetTile(Vec2I(5, 0));
	EXPECT_EQ(bonusTile.powerup, WString("bomb"));
	EXPECT_TRUE(bonusTile.letter.IsEmpty());

	// кадры обвала: каскад колонок, спавны входят из-за верха без наложений
	AppTestDriver::Wait(0.45f);
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "13_fall_a.png"));
	AppTestDriver::Wait(0.15f);
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "13_fall_b.png"));
	AppTestDriver::Wait(0.15f);
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "13_fall_c.png"));

	AppTestDriver::Wait(1.8f); // подтверждение слова и обвал доигрываются

	auto root = o2Scene.FindActor("WordFall");
	ASSERT_TRUE(root);
	auto tile = DynamicCast<Button>(root->GetChild("Screen/Board/Tile_5_0"));
	ASSERT_TRUE(tile);
	EXPECT_TRUE(tile->GetLayer("bomb")->IsEnabled());
	EXPECT_FALSE(tile->GetLayer("rocket")->IsEnabled());

	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "08_bomb_powerup.png"));
}

// Ракета-бонус активируется соседней буквой: ракета летит в цель по компоненту
// траектории, разбитый выбором лёд искрит, камень остаётся до бонуса
TEST_F(WordFallUI, RocketBonusFliesToTarget)
{
	PlantKot();
	mService->DebugSetPowerup(1, 1, "rocket"); // сосед буквы «К»
	mService->DebugSetStone(5, 5);
	AppTestDriver::PumpFrames(2);

	auto root = o2Scene.FindActor("WordFall");
	ASSERT_TRUE(root);

	// каменная плитка видима слоем и не выбирается кликом
	auto stoneTile = DynamicCast<Button>(root->GetChild("Screen/Board/Tile_5_5"));
	ASSERT_TRUE(stoneTile);
	EXPECT_TRUE(stoneTile->GetLayer("stone")->IsEnabled());
	ClickTile(5, 5);
	EXPECT_EQ(mService->GetLevel().GetBoard().GetSelection().Count(), 0);

	ClickTile(1, 0);
	ClickTile(2, 0);
	ClickTile(3, 0);

	Click(Vec2F(222, 331)); // ПРИНЯТЬ
	AppTestDriver::PumpFrames(3);

	auto& move = mService->GetLastMoveResult();
	ASSERT_EQ(move.powerupsUsed.Count(), 1);
	EXPECT_EQ(move.powerupsUsed[0].kind, String("rocket"));
	ASSERT_EQ(move.powerupsUsed[0].targets.Count(), 1);

	// ракета в полёте (после паузы этапа): виджет включён и едет по траектории
	AppTestDriver::Wait(0.65f);
	auto rocket = root->GetChild("Screen/Fx/FxRocket0");
	ASSERT_TRUE(rocket);
	EXPECT_TRUE(rocket->IsEnabled());
	auto trajectory = rocket->GetComponent<FlightTrajectoryComponent>();
	ASSERT_TRUE(trajectory);
	EXPECT_GT(trajectory->position, 0.0f);
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "11_rocket_flight.png"));

	// прилёт: салют выпущен; серия кадров — искры разлетаются, тормозят и опадают
	AppTestDriver::Wait(0.55f);
	auto burst = rocket->GetChild("BurstPink");
	ASSERT_TRUE(burst);
	auto burstEmitter = burst->GetComponent<ParticlesEmitterComponent>();
	ASSERT_TRUE(burstEmitter);
	EXPECT_GT(burstEmitter->GetParticlesCount(), 0);
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "11b_rocket_burst.png"));
	AppTestDriver::Wait(0.12f);
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "11c_burst_fall.png"));
	AppTestDriver::Wait(0.15f);
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "11d_burst_settle.png"));

	AppTestDriver::Wait(2.0f);
}

// Выбор буквы рядом со льдом и камнем ничего не разбивает — лёд скалывается
// только принятым словом, камень остаётся до бонуса
TEST_F(WordFallUI, SelectionDoesNotBreakIceOrStone)
{
	PlantKot();
	mService->GetLevel().GetBoard().GetTileEditable(Vec2I(2, 1)).ice = 1;
	mService->DebugSetStone(0, 1);
	AppTestDriver::PumpFrames(2);

	auto root = o2Scene.FindActor("WordFall");
	ASSERT_TRUE(root);

	ClickTile(1, 0); // сосед льда и камня — оба на месте
	EXPECT_EQ(mService->GetLevel().GetBoard().GetTile(Vec2I(2, 1)).ice, 1);
	EXPECT_EQ(mService->GetLevel().GetBoard().GetTile(Vec2I(0, 1)).stone, 1);

	auto iceTile = DynamicCast<Button>(root->GetChild("Screen/Board/Tile_2_1"));
	ASSERT_TRUE(iceTile);
	EXPECT_TRUE(iceTile->GetLayer("ice")->IsEnabled());
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "12_ice_survives_select.png"));

	// лёд скалывается только после принятия слова
	ClickTile(2, 0);
	ClickTile(3, 0);
	Click(Vec2F(222, 331)); // ПРИНЯТЬ
	AppTestDriver::PumpFrames(3);
	EXPECT_EQ(mService->GetLevel().GetBoard().GetTile(Vec2I(2, 1)).ice, 0);
	EXPECT_EQ(mService->GetLevel().GetBoard().GetTile(Vec2I(0, 1)).stone, 1);

	AppTestDriver::Wait(2.0f);
}

TEST_F(WordFallUI, PressedButtonShowsPressIn)
{
	// зажатая кнопка ПРИНЯТЬ — снимок вдавленного состояния
	AppTestDriver::MoveCursor(ToWindow(Vec2F(222, 331)));
	AppTestDriver::PumpFrames(2);
	AppTestDriver::PressCursor(ToWindow(Vec2F(222, 331)));
	AppTestDriver::PumpFrames(4);
	EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + "09_pressed.png"));
	AppTestDriver::ReleaseCursor();
	AppTestDriver::PumpFrames(2);

	// пустое слово не принимается — состояние игры не изменилось
	EXPECT_EQ(mService->GetMovesLeft(), 12);
}

// Путь реального приложения: сцена загружается из WordFall.scn, как в
// GameApplication::OnStarted, а не через CreateBootstrapActor
TEST_F(WordFallUI, SceneLoadedFromAssetRespondsToClicks)
{
	mService = nullptr;
	o2Scene.Clear(true);
	o2Scene.UpdateDestroyingEntities();
	AppTestDriver::PumpFrames(2);

	auto sceneAsset = o2Assets.GetAssetRefByType<SceneAsset>(String("WordFall.scn"));
	ASSERT_TRUE(sceneAsset);
	sceneAsset->Load();
	AppTestDriver::PumpFrames(10);

	auto serviceActor = o2Scene.FindActor("GameService");
	ASSERT_TRUE(serviceActor);
	mService = serviceActor->GetComponent<WordFallGameService>();
	ASSERT_TRUE(mService);

	PlantKot();
	ClickTile(1, 0);
	ClickTile(2, 0);

	EXPECT_EQ(mService->GetLevel().GetBoard().GetSelection().Count(), 2);
}
// Буквы нацелены в якорь-слой кончика заливки бара (не в угол), а бар получает очки по
// буквам: пока летит последняя, показанный счёт уже сдвинулся, но ещё не полный
TEST_F(WordFallUI, FlyingLettersAimAtBarTipAndFillItGradually)
{
	PlantKot();
	ClickTile(1, 0);
	ClickTile(2, 0);
	ClickTile(3, 0);

	Click(Vec2F(222, 331)); // ПРИНЯТЬ
	AppTestDriver::PumpFrames(3);

	auto root = o2Scene.FindActor("WordFall");
	ASSERT_TRUE(root);
	auto bar = DynamicCast<Widget>(root->GetChild("Screen/Hud/ScorePanel/Bar"));
	ASSERT_TRUE(bar);
	auto tip = bar->FindLayer("tip");
	ASSERT_TRUE(tip);

	// буква ведётся на текущий кончик заливки каждый кадр: цель на оси бара, не в углу
	RectF barRect = bar->layout->GetWorldRect();
	auto flyer = root->GetChild("Screen/Fx/FxLetter0");
	ASSERT_TRUE(flyer);
	auto trajectory = flyer->GetComponent<FlightTrajectoryComponent>();
	ASSERT_TRUE(trajectory);
	float minFill = 0.12f;
	float target = (float)mService->GetTargetScore();
	auto fillX = [&](float score) { return barRect.left + barRect.Width()*(minFill + (1.0f - minFill)*score/target) - 12.0f; };
	Vec2F tipNow = tip->GetRect().Center();
	EXPECT_NEAR(trajectory->finishPoint.y, barRect.Center().y, 2.0f) << "the aim sits on the bar axis, not at a corner";
	EXPECT_NEAR(trajectory->finishPoint.x, Math::Max(tipNow.x, barRect.left + 12.0f), 2.0f) << "the aim is the current fill tip";

	auto label = DynamicCast<Label>(root->GetChild("Screen/Hud/ScorePanel/ScoreLabel"));
	ASSERT_TRUE(label);
	EXPECT_EQ(ShownScore(label), 0);

	// первые буквы прилетели, последняя ещё летит: счёт и заливка растут по долям,
	// каждая буква сдвигает бар (выше минимума заливка линейна по очкам)
	auto progress = DynamicCast<HorizontalProgress>(bar);
	ASSERT_TRUE(progress);
	AppTestDriver::Wait(0.6f);
	int shown = ShownScore(label);
	EXPECT_GT(shown, 0);
	EXPECT_LT(shown, 12);
	// буква физически приземлилась на кончик, каким он был в момент её прилёта: бар был
	// пуст — это начало бара; после удара заливка уходит вперёд уже без неё
	auto flyerWidget = DynamicCast<Widget>(flyer);
	ASSERT_TRUE(flyerWidget);
	Vec2F landed = flyerWidget->layout->GetWorldRect().Center();
	EXPECT_NEAR(landed.x, barRect.left + 12.0f, 3.0f);
	EXPECT_NEAR(landed.y, barRect.Center().y, 3.0f);
	EXPECT_GT(tip->GetRect().Center().x, landed.x + 5.0f) << "the fill has moved on past the landing point";

	// и видимая звезда садится туда же: финальный скейл сжимает плашку вокруг центра,
	// а не к углу (пивот по центру)
	auto starDrawable = flyerWidget->GetLayer("star")->GetDrawable();
	ASSERT_TRUE(starDrawable);
	Basis starBasis = starDrawable->GetBasis();
	Vec2F starCenter = starBasis.origin + starBasis.xv*0.5f + starBasis.yv*0.5f;
	EXPECT_NEAR(starCenter.x, trajectory->finishPoint.x, 4.0f);
	EXPECT_NEAR(starCenter.y, trajectory->finishPoint.y, 4.0f);
	float finalFill = minFill + (1.0f - minFill)*12.0f/mService->GetTargetScore();
	EXPECT_GT(progress->GetValue(), minFill + 0.001f);
	EXPECT_LT(progress->GetValue(), finalFill - 0.001f);

	AppTestDriver::Wait(1.2f);
	EXPECT_EQ(ShownScore(label), 12);
	EXPECT_NEAR(progress->GetValue(), finalFill, 0.001f);
	AppTestDriver::Wait(1.5f); // хореография и падение доигрываются

	// бар заполнен: следующее слово целится в кончик текущей заливки (12 очков)
	PlantKot();
	ClickTile(1, 0);
	ClickTile(2, 0);
	ClickTile(3, 0);
	Click(Vec2F(222, 331));
	AppTestDriver::PumpFrames(3);

	Vec2F tipCenter = tip->GetRect().Center();
	EXPECT_NEAR(tipCenter.x, fillX(12.0f) + 2.0f, 3.0f);
	EXPECT_NEAR(trajectory->finishPoint.x, tipCenter.x, 3.0f) << "the aim is the current fill tip";
	AppTestDriver::Wait(2.5f);
}

// Каждый полёт берёт новое смещение в коридоре сплайна: запекание искр не должно
// сбрасывать глобальный генератор, из которого оно берётся
TEST_F(WordFallUI, ConsecutiveFlightsUseDifferentTrajectories)
{
	auto root = o2Scene.FindActor("WordFall");
	ASSERT_TRUE(root);
	auto flyer = root->GetChild("Screen/Fx/FxLetter0");
	ASSERT_TRUE(flyer);
	auto trajectory = flyer->GetComponent<FlightTrajectoryComponent>();
	ASSERT_TRUE(trajectory);

	Vector<float> offsets;
	for (int word = 0; word < 3; word++)
	{
		PlantKot();
		ClickTile(1, 0);
		ClickTile(2, 0);
		ClickTile(3, 0);

		Click(Vec2F(222, 331)); // ПРИНЯТЬ
		AppTestDriver::PumpFrames(2);
		offsets.Add(trajectory->GetRandomOffset());

		// и буквы одного слова летят по разным траекториям
		auto second = root->GetChild("Screen/Fx/FxLetter1")->GetComponent<FlightTrajectoryComponent>();
		auto third = root->GetChild("Screen/Fx/FxLetter2")->GetComponent<FlightTrajectoryComponent>();
		ASSERT_TRUE(second && third);
		EXPECT_TRUE(trajectory->GetRandomOffset() != second->GetRandomOffset() ||
					second->GetRandomOffset() != third->GetRandomOffset()) << "letters of one word repeat the trajectory";

		AppTestDriver::Wait(2.0f);
	}

	for (float offset : offsets)
	{
		EXPECT_GE(offset, 0.0f);
		EXPECT_LE(offset, 1.0f);
	}
	EXPECT_TRUE(offsets[0] != offsets[1] || offsets[1] != offsets[2]) << "flights repeat the same trajectory";
}
