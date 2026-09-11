#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "WordFallUITestSupport.h"

#include "o2/Scene/Components/FlightTrajectoryComponent.h"
#include "o2/Utils/System/Time/Time.h"

#include <functional>

// Витрина эффектов бонусов: проверяет, что каждый этап действительно рождает частицы,
// и (когда задан WORDFALL_CLIPS_DIR) пишет покадровую нарезку для видео-отчёта
class WordFallVfxShowcase: public WordFallUI
{
protected:
	Ref<Actor> Vfx() const { return o2Scene.FindActor("WordFall")->GetChild("Vfx"); }

	// Живые частицы эмиттера эффекта по имени актора внутри Vfx
	int ParticlesOf(const String& emitterName) const
	{
		auto actor = Vfx()->GetChild(emitterName);
		if (!actor)
			return -1;

		auto emitter = actor->GetComponent<ParticlesEmitterComponent>();
		return emitter ? emitter->GetParticlesCount() : -1;
	}

	Ref<Button> Tile(int column, int row) const
	{
		return DynamicCast<Button>(o2Scene.FindActor("WordFall")->GetChild(
			String::Format("Screen/Board/Tile_%i_%i", column, row)));
	}

	// Кадры клипа пишутся только по запросу: путь снаружи репозитория, кадров сотни
	static String ClipsDir()
	{
		auto dir = ::getenv("WORDFALL_CLIPS_DIR");
		return dir ? String(dir) : String();
	}

	// Снимает клип длиной seconds игрового времени и на каждом кадре зовёт sampler:
	// эффекты живут доли секунды, поэтому проверяются прямо во время съёмки
	void CaptureClip(const String& name, float seconds, const std::function<void()>& sampler = {})
	{
		String dir = ClipsDir();
		String clipDir;
		if (!dir.IsEmpty())
		{
			clipDir = dir + "/" + name + "/";
			o2FileSystem.FolderCreate(clipDir, true);
		}

		float elapsed = 0.0f;
		int frames = 0;
		while (elapsed < seconds)
		{
			if (clipDir.IsEmpty())
				AppTestDriver::PumpFrames(1);
			else
				EXPECT_TRUE(AppTestDriver::SaveScreenshot(clipDir + String::Format("f%03i.png", frames)));

			if (sampler)
				sampler();

			elapsed += Math::Clamp(o2Time.GetDeltaTime(), 0.001f, 0.05f);
			frames++;
		}

		if (clipDir.IsEmpty())
			return;

		DataDocument info;
		info["frames"] = frames;
		info["seconds"] = elapsed;
		info.SaveToFile(clipDir + "clip.json");
	}

	// Слово КОТ рядом с бонусом: принятие слова активирует бонус
	void TriggerBonusWithWord(const String& kind, const char* word = "КОТ")
	{
		PlantWord(word); // слово принимается раз за уровень — повторный сбор берёт другое
		mService->DebugSetPowerup(1, 1, kind);
		AppTestDriver::PumpFrames(2);

		ClickTile(1, 0);
		ClickTile(2, 0);
		ClickTile(3, 0);

		Click(Vec2F(222, 331)); // ПРИНЯТЬ
	}
};

// Бонус на поле: золотая оправа с аурой, плитка «дышит» масштабом, сверху идут искры
TEST_F(WordFallVfxShowcase, BonusesIdleGlowPulseAndSparkle)
{
	mService->DebugSetPowerup(1, 5, "bomb");
	mService->DebugSetPowerup(3, 5, "rocket");
	mService->DebugSetPowerup(5, 5, "fireworks");
	AppTestDriver::PumpFrames(3);

	auto bomb = Tile(1, 5);
	ASSERT_TRUE(bomb);
	EXPECT_TRUE(bomb->GetLayer("bonusPlate")->IsEnabled());
	EXPECT_TRUE(bomb->GetLayer("bonusGlow")->IsEnabled());
	EXPECT_TRUE(bomb->GetLayer("bomb")->IsEnabled());
	EXPECT_FALSE(bomb->GetLayer("back")->IsEnabled()) << "у бонуса своя оправа вместо буквенной плашки";

	// «дыхание» и искры: за пару секунд плитка проходит масштаб, аура — яркость,
	// а искры успевают сыграть на каждом из трёх бонусов
	float minWidth = FLT_MAX, maxWidth = 0.0f;
	float minGlow = FLT_MAX, maxGlow = 0.0f;
	int sparkles[3] = { 0, 0, 0 };
	CaptureClip("idle", 2.8f, [&]()
	{
		float width = bomb->layout->GetWorldRect().Width();
		minWidth = Math::Min(minWidth, width);
		maxWidth = Math::Max(maxWidth, width);

		float glow = bomb->GetLayer("bonusGlow")->GetDrawable()->GetTransparency();
		minGlow = Math::Min(minGlow, glow);
		maxGlow = Math::Max(maxGlow, glow);

		for (int kind = 0; kind < 3; kind++)
			sparkles[kind] = Math::Max(sparkles[kind], ParticlesOf(String::Format("BonusSparkle%i", kind)));
	});

	EXPECT_GT(maxWidth - minWidth, 3.0f) << "плитка бонуса не пульсирует";
	EXPECT_GT(maxGlow - minGlow, 0.2f) << "аура бонуса не мерцает";
	EXPECT_GT(sparkles[0], 0) << "бомба не искрит";
	EXPECT_GT(sparkles[1], 0) << "ракета не искрит";
	EXPECT_GT(sparkles[2], 0) << "фейерверк не искрит";
}

// Взрыв бомбы: разгорание фитиля, вспышка, ударная волна, осколки, дым и тряска поля
TEST_F(WordFallVfxShowcase, BombBlastShakesBoardAndThrowsDebris)
{
	auto cornerTile = Tile(6, 7); // дальний угол: обвал его не двигает, тряска — да
	ASSERT_TRUE(cornerTile);
	float restX = cornerTile->layout->GetWorldRect().Center().x;
	float chargeWidth = 0.0f;

	TriggerBonusWithWord("bomb");

	int debris = 0, smoke = 0, ring = 0, flash = 0;
	float maxShift = 0.0f;
	CaptureClip("bomb", 2.6f, [&]()
	{
		debris = Math::Max(debris, ParticlesOf("BombDebris"));
		smoke = Math::Max(smoke, ParticlesOf("BombSmoke"));
		ring = Math::Max(ring, ParticlesOf("BombRing"));
		flash = Math::Max(flash, ParticlesOf("BombFlash"));
		maxShift = Math::Max(maxShift, Math::Abs(cornerTile->layout->GetWorldRect().Center().x - restX));

		if (auto bombTile = Tile(1, 1))
			chargeWidth = Math::Max(chargeWidth, bombTile->layout->GetWorldRect().Width());
	});

	EXPECT_GT(chargeWidth, 96.0f) << "фитиль не раздувает бомбу перед взрывом";
	EXPECT_GT(debris, 0) << "нет осколков";
	EXPECT_GT(smoke, 0) << "нет дыма";
	EXPECT_GT(ring, 0) << "нет ударной волны";
	EXPECT_GT(flash, 0) << "нет вспышки";
	EXPECT_GT(maxShift, 1.0f) << "поле не трясёт на взрыве";

	AppTestDriver::Wait(2.0f);
}

// Ракета: хлопок старта, шлейф в полёте, кольцо и салют на попадании
TEST_F(WordFallVfxShowcase, RocketLaunchTrailAndImpactRing)
{
	TriggerBonusWithWord("rocket");

	auto rocket = o2Scene.FindActor("WordFall")->GetChild("Screen/Fx/FxRocket0");
	ASSERT_TRUE(rocket);
	auto trail = rocket->GetChild("Sparks")->GetComponent<ParticlesEmitterComponent>();
	auto smoke = rocket->GetChild("Smoke")->GetComponent<ParticlesEmitterComponent>();
	auto glitter = rocket->GetChild("Glitter")->GetComponent<ParticlesEmitterComponent>();
	ASSERT_TRUE(trail && smoke && glitter);

	int launchDust = 0, launchFlash = 0, launchEmbers = 0, trailSparks = 0, ring = 0, smokePuffs = 0, saluteGlitter = 0;
	bool flew = false, turned = false;
	float trailMinY = FLT_MAX, trailMaxY = -FLT_MAX; // шлейф ложится вдоль всего пути, не кучкой на старте
	CaptureClip("rocket", 3.4f, [&]()
	{
		launchDust = Math::Max(launchDust, ParticlesOf("LaunchDust"));
		launchFlash = Math::Max(launchFlash, ParticlesOf("LaunchFlash"));
		launchEmbers = Math::Max(launchEmbers, ParticlesOf("LaunchEmbers"));
		trailSparks = Math::Max(trailSparks, trail->GetParticlesCount());
		smokePuffs = Math::Max(smokePuffs, smoke->GetParticlesCount());
		saluteGlitter = Math::Max(saluteGlitter, glitter->GetParticlesCount());
		turned = turned || (rocket->IsEnabled() && Math::Abs(rocket->transform->GetAngleDegrees()) > 5.0f);

		for (auto& particle : trail->GetParticles())
		{
			if (!particle.alive)
				continue;

			trailMinY = Math::Min(trailMinY, particle.position.y);
			trailMaxY = Math::Max(trailMaxY, particle.position.y);
		}

		ring = Math::Max(ring, ParticlesOf("RocketRing"));
		flew = flew || rocket->IsEnabled();
	});

	EXPECT_GT(launchDust, 0) << "нет пыли на старте";
	EXPECT_GT(launchFlash, 0) << "нет вспышки зажигания";
	EXPECT_GT(launchEmbers, 0) << "нет углей на старте";
	EXPECT_TRUE(flew) << "ракета не взлетела";
	EXPECT_GT(trailSparks, 0) << "нет шлейфа";
	EXPECT_GT(smokePuffs, 0) << "нет дымного следа";
	EXPECT_GT(saluteGlitter, 0) << "нет глиттера салюта";
	EXPECT_TRUE(turned) << "ракета не разворачивается по курсу";
	EXPECT_GT(trailMaxY - trailMinY, 200.0f) << "шлейф не тянется за ракетой";
	EXPECT_GT(ring, 0) << "кольцо попадания не сыграло";

	AppTestDriver::Wait(2.0f);
}

// Ракета прилетает ровно в центр целевой клетки — и корпус, и салют из её детей
TEST_F(WordFallVfxShowcase, RocketArrivesAtTargetTileCenter)
{
	Map<Pair<int, int>, Vec2F> centers;
	for (int c = 0; c < 7; c++)
		for (int r = 0; r < 8; r++)
			if (auto tile = Tile(c, r))
				centers[{ c, r }] = tile->layout->GetWorldRect().Center();

	TriggerBonusWithWord("rocket");

	auto rocket = o2Scene.FindActor("WordFall")->GetChild("Screen/Fx/FxRocket0");
	ASSERT_TRUE(rocket);
	auto trajectory = rocket->GetComponent<FlightTrajectoryComponent>();
	ASSERT_TRUE(trajectory);

	Vec2F arrival, arrivalRect, glitterAt;
	bool arrived = false;
	Vector<Pair<float, float>> flight; // (время, позиция) — профиль скорости полёта
	float flightTime = 0.0f;
	CaptureClip("rocket_arrival", 2.0f, [&]()
	{
		if (!arrived && rocket->IsEnabled())
		{
			flight.Add({ flightTime, trajectory->GetPosition() });
			flightTime += Math::Clamp(o2Time.GetDeltaTime(), 0.001f, 0.05f);
		}

		if (arrived || !rocket->IsEnabled() || trajectory->GetPosition() < 0.999f)
			return;

		arrived = true;
		arrival = rocket->transform->GetWorldPosition().XY();
		arrivalRect = DynamicCast<Widget>(rocket)->layout->GetWorldRect().Center();
		glitterAt = rocket->GetChild("Glitter")->transform->GetWorldPosition().XY();
	});
	ASSERT_TRUE(arrived) << "ракета не долетела до конца траектории";

	auto& move = mService->GetLastMoveResult();
	ASSERT_EQ(move.powerupsUsed.Count(), 1);
	ASSERT_GE(move.powerupsUsed[0].targets.Count(), 1);
	auto target = move.powerupsUsed[0].targets[0];
	Vec2F center = centers[{ target.x, target.y }];

	EXPECT_LT((arrivalRect - center).Length(), 4.0f) << "прямоугольник ракеты мимо клетки";
	EXPECT_LT((arrival - center).Length(), 4.0f) << "позиция (pivot) ракеты мимо клетки";
	EXPECT_LT((glitterAt - center).Length(), 4.0f) << "салют рождается не в клетке";

	// скорость: разгон в начале, дальше ровно — без замедления перед целью
	auto speedIn = [&](float from, float to)
	{
		float sum = 0.0f; int n = 0;
		for (int i = 1; i < flight.Count(); i++)
		{
			float u = flight[i].second, dt = flight[i].first - flight[i - 1].first;
			if (u >= from && u < to && dt > 0.0f)
			{
				sum += (flight[i].second - flight[i - 1].second)/dt;
				n++;
			}
		}
		return n > 0 ? sum/n : 0.0f;
	};
	float startSpeed = speedIn(0.0f, 0.12f), midSpeed = speedIn(0.4f, 0.6f), endSpeed = speedIn(0.8f, 1.0f);
	EXPECT_GT(midSpeed, 0.0f);
	EXPECT_LT(startSpeed, midSpeed*0.7f) << "нет разгона на старте";
	EXPECT_GT(endSpeed, midSpeed*0.85f) << "ракета замедляется перед целью";
	EXPECT_GE(flight.Last().first, 0.4f) << "полёт короче минимального"; // длительность считается по дистанции
}

// Повторный запуск ракеты начинается с чистого листа: ни шлейфа, ни салюта прошлого полёта
TEST_F(WordFallVfxShowcase, SecondLaunchStartsWithoutStaleParticles)
{
	TriggerBonusWithWord("rocket");
	AppTestDriver::Wait(3.0f); // полёт, салют с конфетти, ракета выключена

	auto rocket = o2Scene.FindActor("WordFall")->GetChild("Screen/Fx/FxRocket0");
	ASSERT_TRUE(rocket);
	ASSERT_FALSE(rocket->IsEnabled());

	const char* names[5] = { "Sparks", "Smoke", "BurstPink", "Glitter", "Confetti" };
	for (auto name : names)
		EXPECT_GT(rocket->GetChild(name)->GetComponent<ParticlesEmitterComponent>()->GetParticles().Count(), 0)
			<< name << ": прошлый полёт оставил буфер частиц — есть что проверять";

	// вторая ракета: в первые кадры после включения старых частиц быть не должно
	TriggerBonusWithWord("rocket", "ТОК");
	int stale = 0;
	bool launched = false;
	CaptureClip("rocket_relaunch", 1.2f, [&]()
	{
		if (!rocket->IsEnabled())
			return;
		launched = true;
		for (auto name : names)
		{
			if (name == String("Sparks") || name == String("Smoke"))
				continue; // шлейф стартует сразу — это новые частицы
			stale += rocket->GetChild(name)->GetComponent<ParticlesEmitterComponent>()->GetParticlesCount();
		}
	});
	EXPECT_TRUE(launched);
	EXPECT_EQ(stale, 0) << "салют прошлого полёта показался при новом запуске";

	AppTestDriver::Wait(2.5f);
}

// Скорость ракеты не зависит от дистанции, а близкую цель она облетает по дуге
TEST_F(WordFallVfxShowcase, RocketKeepsSpeedAndArcsAroundCloseTargets)
{
	// цель у самого бонуса: лёд рядом — задача уровня, ракета летит именно в него
	mService->DebugSetTile(2, 6, "Щ");
	AppTestDriver::PumpFrames(2);
	TriggerBonusWithWord("rocket");

	auto rocket = o2Scene.FindActor("WordFall")->GetChild("Screen/Fx/FxRocket0");
	ASSERT_TRUE(rocket);
	auto trajectory = rocket->GetComponent<FlightTrajectoryComponent>();
	ASSERT_TRUE(trajectory);

	Vec2F start, finish, previous;
	float path = 0.0f, flightTime = 0.0f;
	bool flying = false;
	CaptureClip("rocket_arc", 2.4f, [&]()
	{
		if (!rocket->IsEnabled() || trajectory->GetPosition() >= 1.0f)
			return;

		Vec2F position = rocket->transform->GetWorldPosition().XY();
		if (!flying)
		{
			flying = true;
			start = position;
		}
		else
			path += (position - previous).Length();

		previous = position;
		finish = position;
		flightTime += Math::Clamp(o2Time.GetDeltaTime(), 0.001f, 0.05f);
	});

	ASSERT_TRUE(flying);
	float chord = (finish - start).Length();
	EXPECT_GT(chord, 40.0f) << "ракета вообще не сдвинулась";
	EXPECT_GT(path/Math::Max(chord, 1.0f), 1.25f) << "близкая цель: ракета не описала дугу";
	EXPECT_GT(path/Math::Max(flightTime, 0.01f), 380.0f) << "ракета ползёт вместо полёта";
	EXPECT_LT(flightTime, 1.3f) << "полёт затянут";

	AppTestDriver::Wait(2.0f);
}

// Длинное слово выдаёт фейерверк, и он собирается: сработавший бонус запускает залп ракет
TEST_F(WordFallVfxShowcase, LongWordGivesFireworksAndItLaunchesSalvo)
{
	const char* word = "КАРТИНА";
	WString letters((String(word)));
	for (int i = 0; i < letters.Length(); i++)
		mService->DebugSetTile(i, 0, String(letters.SubStr(i, i + 1)));
	AppTestDriver::PumpFrames(2);

	for (int i = 0; i < letters.Length(); i++)
		ClickTile(i, 0);
	Click(Vec2F(222, 331)); // ПРИНЯТЬ
	AppTestDriver::Wait(3.0f);

	auto& earned = mService->GetLastMoveResult();
	ASSERT_EQ(earned.powerupEarned, String("fireworks")) << "слово из 7 букв даёт фейерверк";

	// бонус лежит на поле и виден игроку
	auto& board = mService->GetLevel().GetBoard();
	Vec2I bonusCell(-1, -1);
	for (int c = 0; c < board.GetColumns(); c++)
		for (int r = 0; r < board.GetRows(); r++)
			if (board.GetTile(Vec2I(c, r)).powerup == WString("fireworks"))
				bonusCell = Vec2I(c, r);
	ASSERT_NE(bonusCell, Vec2I(-1, -1)) << "заработанный фейерверк не появился на поле";

	auto tile = Tile(bonusCell.x, bonusCell.y);
	ASSERT_TRUE(tile);
	EXPECT_TRUE(tile->GetLayer("fireworks")->IsEnabled()) << "иконка фейерверка не показана";

	// слово рядом с бонусом (ряд выше, чтобы не затереть саму клетку бонуса)
	int row = bonusCell.y + 1 < board.GetRows() ? bonusCell.y + 1 : bonusCell.y - 1;
	int column = Math::Clamp(bonusCell.x - 1, 0, board.GetColumns() - 3);
	mService->DebugSetTile(column, row, "К");
	mService->DebugSetTile(column + 1, row, "О");
	mService->DebugSetTile(column + 2, row, "Т");
	AppTestDriver::PumpFrames(2);
	ClickTile(column, row);
	ClickTile(column + 1, row);
	ClickTile(column + 2, row);
	Click(Vec2F(222, 331));

	int maxFlying = 0;
	CaptureClip("fireworks_salvo", 3.4f, [&]()
	{
		auto fx = o2Scene.FindActor("WordFall")->GetChild("Screen/Fx");
		int flying = 0;
		for (int i = 0; i < 10; i++)
		{
			auto rocket = fx->GetChild(String::Format("FxRocket%i", i));
			if (rocket && rocket->IsEnabled())
				flying++;
		}
		maxFlying = Math::Max(maxFlying, flying);
	});

	auto& used = mService->GetLastMoveResult();
	ASSERT_EQ(used.powerupsUsed.Count(), 1) << "фейерверк не сработал";
	EXPECT_EQ(used.powerupsUsed[0].kind, String("fireworks"));
	EXPECT_GE(used.powerupsUsed[0].targets.Count(), 8);
	EXPECT_GT(maxFlying, 1) << "залп идёт по одной ракете";

	AppTestDriver::Wait(2.0f);
}

// Фейерверк: залп ракет по нескольким целям, каждая со своим салютом
TEST_F(WordFallVfxShowcase, FireworksSalvoLaunchesSeveralRockets)
{
	TriggerBonusWithWord("fireworks");

	auto fx = o2Scene.FindActor("WordFall")->GetChild("Screen/Fx");
	ASSERT_TRUE(fx);

	int maxFlying = 0, ring = 0, glitter = 0, streaks = 0;
	CaptureClip("fireworks", 3.6f, [&]()
	{
		glitter = Math::Max(glitter, ParticlesOf("FireworkGlitter"));
		streaks = Math::Max(streaks, ParticlesOf("FireworkSparks0"));
		int flying = 0;
		for (int i = 0; i < 10; i++)
		{
			auto rocket = fx->GetChild(String::Format("FxRocket%i", i));
			if (rocket && rocket->IsEnabled())
				flying++;
		}
		maxFlying = Math::Max(maxFlying, flying);
		ring = Math::Max(ring, ParticlesOf("RocketRing"));
	});

	auto& move = mService->GetLastMoveResult();
	ASSERT_EQ(move.powerupsUsed.Count(), 1);
	EXPECT_GT(move.powerupsUsed[0].targets.Count(), 1) << "фейерверк бьёт по нескольким клеткам";
	EXPECT_GT(maxFlying, 1) << "залп идёт по одной ракете";
	EXPECT_GT(ring, 0) << "нет колец попаданий";
	EXPECT_GT(streaks, 0) << "нет центрального взрыва фейерверка";
	EXPECT_GT(glitter, 0) << "нет глиттера";

	AppTestDriver::Wait(2.0f);
}
