#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "WordFallUITestSupport.h"

TEST_F(WordFallUI, SceneBuildsScreenSectionsFromPrototypes)
{
	auto root = o2Scene.FindActor("WordFall");
	ASSERT_TRUE(root);

	for (int c = 0; c < 7; c++)
	{
		for (int r = 0; r < 8; r++)
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
	for (int c = 0; c < 7; c++)
	{
		for (int r = 0; r < 8; r++)
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

	const char* words[3] = { "КОТ", "ТОК", "КИТ" }; // слово принимается раз за уровень
	for (int word = 0; word < 3; word++)
	{
		WString letters((String(words[word])));
		for (int i = 0; i < 3; i++)
			mService->DebugSetTile(1 + i, 0, String(letters.SubStr(i, i + 1)));
		AppTestDriver::PumpFrames(2);
		ClickTile(1, 0);
		ClickTile(2, 0);
		ClickTile(3, 0);
		EXPECT_EQ(mService->GetCurrentWord(), String(words[word])) << "word " << word;

		Click(Vec2F(222, 331)); // ПРИНЯТЬ
		AppTestDriver::PumpFrames(2);
		EXPECT_TRUE(mService->GetLastMoveResult().ok) << "word " << word << ": " << mService->GetLastMoveResult().reason;

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

	Click(Vec2F(0, -180)); // ДАЛЬШЕ
	AppTestDriver::PumpFrames(3);

	// после победы стартует следующий уровень кампании
	EXPECT_FALSE(root->GetChild("Screen/Popup/Content")->IsEnabled());
	EXPECT_EQ(mService->GetLevelIndex(), 1);
	EXPECT_EQ(mService->GetScore(), 0);
	EXPECT_EQ(mService->GetGameState(), String("playing"));

	// прогресс сохранился на диск
	EXPECT_EQ(SavedCurrentLevel(mService->GetProgressPath()), 1);

	o2FileSystem.FileDelete(mService->GetProgressPath());
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
	auto burst = rocket->GetChild("BurstPink");
	ASSERT_TRUE(burst);
	auto burstEmitter = burst->GetComponent<ParticlesEmitterComponent>();
	ASSERT_TRUE(burstEmitter);
	for (float waited = 0.0f; waited < 1.5f && burstEmitter->GetParticlesCount() == 0; waited += 0.05f)
		AppTestDriver::Wait(0.05f);
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
	mService->DebugSetIce(2, 1, 1);
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

// Путь реального приложения: сцена игры загружается заново, как в GameApplication::Restart
TEST_F(WordFallUI, SceneReloadedFromAssetRespondsToClicks)
{
	mService = nullptr;
	o2Scene.Clear(true);
	o2Scene.UpdateDestroyingEntities();
	AppTestDriver::PumpFrames(2);

	LoadScene();
	ASSERT_TRUE(mService);
	AppTestDriver::PumpFrames(10);

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
	PlantWord("ТОК");
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
		PlantWord(NthWord(word));
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

// Искры летящих букв ведёт трек анимации: в игре они симулируются вперёд, как в релизной сборке.
// Редакторское запекание кадров перезапекало их с нуля каждый кадр перенацеливания на бар — лаг сбора слова
TEST_F(WordFallUI, LetterFlightSparksSimulateWithoutEditorBaking)
{
	PlantKot();
	ClickTile(1, 0);
	ClickTile(2, 0);
	ClickTile(3, 0);
	Click(Vec2F(222, 331)); // ПРИНЯТЬ
	AppTestDriver::Wait(0.45f);

	auto root = o2Scene.FindActor("WordFall");
	ASSERT_TRUE(root);
	auto sparks = root->GetChild("Screen/Fx/FxLetter0/Sparks");
	ASSERT_TRUE(sparks);
	auto emitter = sparks->GetComponent<ParticlesEmitterComponent>();
	ASSERT_TRUE(emitter);
	EXPECT_GT(emitter->GetParticlesCount(), 0);
#if IS_EDITOR
	EXPECT_EQ(emitter->GetBakedFramesCount(), 0);
#endif
	AppTestDriver::Wait(2.5f);
}
