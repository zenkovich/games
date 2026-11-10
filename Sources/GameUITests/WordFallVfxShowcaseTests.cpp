#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "WordFallUITestSupport.h"

#include "o2/Scene/Components/FlightTrajectoryComponent.h"
#include "o2/Integration.h"
#include "o2/Render/Sprite.h"
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

	// Больше всего живых частиц среди эмиттеров пула варианта S_<name>_<i>
	int PoolParticles(const char* name) const
	{
		int most = 0;
		for (int i = 0; i < 10; i++)
			most = Math::Max(most, ParticlesOf(String::Format("S_%s_%i", name, i)));
		return most;
	}

	// Вспышка эффекта картинкой: включённый FxFlash с этой картинкой
	bool FlashShows(const char* image) const
	{
		auto fx = o2Scene.FindActor("WordFall")->GetChild("Screen/Fx");
		for (int i = 0; i < 10; i++)
		{
			auto flash = DynamicCast<Widget>(fx->GetChild(String::Format("FxFlash%i", i)));
			auto sprite = flash ? DynamicCast<Sprite>(flash->GetLayer("img")->GetDrawable()) : nullptr;
			if (flash && flash->IsEnabled() && sprite && sprite->GetImageName() == image)
				return true;
		}
		return false;
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

		// кадр клипа — ровно 1/60 секунды игры, сколько бы ни снимался скриншот
		struct FrameStep
		{
			FrameStep(bool on) { Integration::forcedFrameDeltaTime = on ? 1.0f/60.0f : 0.0f; }
			~FrameStep() { Integration::forcedFrameDeltaTime = 0.0f; }
		} frameStep(!clipDir.IsEmpty());

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

		Click(AcceptPosition()); // ПРИНЯТЬ
	}
};

// Варианты эффектов бонусов на выбор: у каждого стиля бомбы, ракеты и фейерверка играют свои эмиттеры.
// Поле и цели одни и те же (уровень перезапускается с тем же сидом); с WORDFALL_CLIPS_DIR пишется клип каждого
TEST_F(WordFallVfxShowcase, EveryBonusStylePlaysItsParticles)
{
	struct Kind { const char* kind; const char* property; float seconds; const char* pools[6]; };
	const Kind kinds[3] = {
		{ "bomb", "bombStyle", 2.4f, { "", "B1_Chips", "B2_Stars", "B3_Confetti", "B4_Sparks", "B5_Puffs" } },
		{ "rocket", "rocketStyle", 2.6f, { "", "R1_Trail", "R2_Trail", "R3_Trail", "R4_Trail", "R5_Trail" } },
		{ "fireworks", "fireworksStyle", 3.4f, { "", "F1_Burst", "F2_Burst", "F3_Willow", "F4_Confetti", "F5_RingA" } } };

	// WORDFALL_FX_STYLES="2" или "2,4" — только эти варианты (переснять один эффект, не все)
	auto only = ::getenv("WORDFALL_FX_STYLES");
	for (auto& kind : kinds)
	{
		for (int style = 0; style <= 5; style++)
		{
			if (only && !String(only).Contains(String::Format("%i", style)))
				continue;
			mService->StartLevel(0);
			AppTestDriver::Wait(0.6f);
			o2Scripts.Eval(String::Format("WordFallViews.fx.%s = %i", kind.property, style));
			if (String(kind.kind) == "rocket")
				mService->DebugSetStone(6, 7); // цель в дальнем углу: полёт через всё поле
			TriggerBonusWithWord(kind.kind);

			String pool = kind.pools[style];
			int particles = 0;
			CaptureClip(String::Format("%s_s%i", kind.kind, style), kind.seconds, [&]()
			{
				for (int i = 0; !pool.IsEmpty() && i < 10; i++)
					particles = Math::Max(particles, ParticlesOf(String::Format("S_%s_%i", pool.Data(), i)));
			});
			if (!pool.IsEmpty())
				EXPECT_GT(particles, 0) << kind.kind << " " << style << ": " << pool.Data();

			AppTestDriver::Wait(1.2f);
		}
		o2Scripts.Eval(String::Format("WordFallViews.fx.%s = 0", kind.property));
	}
}

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

// Радужная бомба: заряд раздувает её и перед хлопком сжимает, хлопает звездой полосы очков, два кольца
// радужных звёзд с блёстками, поле трясёт, соседние плитки за зоной взрыва отталкивает волной
TEST_F(WordFallVfxShowcase, RainbowBombPopsIntoStarsAndPushesNeighbours)
{
	auto corner = Tile(6, 7);  // дальний угол: волна до него не доходит, тряска — да
	auto neighbour = Tile(3, 2); // за зоной 3×3 вокруг (1,1), в соседнем столбце: не падает, волну ловит
	ASSERT_TRUE(corner && neighbour);
	Vec2F cornerRest = corner->layout->GetWorldRect().Center(), neighbourRest = neighbour->layout->GetWorldRect().Center();

	TriggerBonusWithWord("bomb");

	float maxWidth = 0.0f, lastWidth = 0.0f, maxShift = 0.0f, push = 0.0f;
	int stars = 0, slowStars = 0, twinkles = 0;
	bool starPop = false;
	CaptureClip("bomb", 2.4f, [&]()
	{
		auto bomb = Tile(1, 1);
		if (bomb && bomb->IsEnabled())
		{
			lastWidth = bomb->layout->GetWorldRect().Width();
			maxWidth = Math::Max(maxWidth, lastWidth);
		}
		stars = Math::Max(stars, PoolParticles("B2_Stars"));
		slowStars = Math::Max(slowStars, PoolParticles("B2_Stars2"));
		twinkles = Math::Max(twinkles, PoolParticles("B2_Twinkle"));
		starPop = starPop || FlashShows("Generated/UI/Screen_Resources/Sprites/icon_rainbow_star.png");

		Vec2F shake = corner->layout->GetWorldRect().Center() - cornerRest;
		maxShift = Math::Max(maxShift, shake.Length());
		push = Math::Max(push, (neighbour->layout->GetWorldRect().Center() - neighbourRest - shake).Length());
	});

	EXPECT_GT(maxWidth, 100.0f) << "заряд не раздувает бомбу";
	EXPECT_LT(lastWidth, maxWidth - 3.0f) << "перед хлопком бомба не сжимается";
	EXPECT_TRUE(starPop) << "нет хлопка радужной звездой";
	EXPECT_GT(stars, 0) << "нет разлёта звёзд";
	EXPECT_GT(slowStars, 0) << "нет медленного кольца звёзд";
	EXPECT_GT(twinkles, 0) << "нет блёсток";
	EXPECT_GT(maxShift, 1.0f) << "поле не трясёт";
	EXPECT_GT(push, 3.0f) << "соседние плитки не отталкивает волной";

	AppTestDriver::Wait(2.0f);
}

// Радужная ракета: корпус остаётся ракетой с пламенем, на старте хлопок звёзд, за ней по всему пути тянется
// шлейф радужных звёзд, в цели — радужный хлопок; свои искры и салют прототипа молчат
TEST_F(WordFallVfxShowcase, RainbowRocketKeepsItsBodyAndTrailsStars)
{
	mService->DebugSetStone(6, 7); // цель в дальнем углу: полёт через всё поле
	TriggerBonusWithWord("rocket");

	auto rocket = DynamicCast<Widget>(o2Scene.FindActor("WordFall")->GetChild("Screen/Fx/FxRocket0"));
	ASSERT_TRUE(rocket);
	auto ownSparks = rocket->GetChild("Sparks")->GetComponent<ParticlesEmitterComponent>();
	ASSERT_TRUE(ownSparks);

	int launch = 0, trailStars = 0, hit = 0, ownParticles = 0;
	bool flew = false, turned = false, starBody = false, flameOff = false;
	float trailMinY = FLT_MAX, trailMaxY = -FLT_MAX;
	CaptureClip("rocket", 2.6f, [&]()
	{
		launch = Math::Max(launch, PoolParticles("R2_Launch"));
		hit = Math::Max(hit, PoolParticles("R2_Hit"));
		ownParticles = Math::Max(ownParticles, ownSparks->GetParticlesCount());
		for (int i = 0; i < 10; i++)
		{
			auto actor = Vfx()->GetChild(String::Format("S_R2_Trail_%i", i));
			auto trail = actor ? actor->GetComponent<ParticlesEmitterComponent>() : nullptr;
			if (!trail)
				continue;
			trailStars = Math::Max(trailStars, trail->GetParticlesCount());
			for (auto& particle : trail->GetParticles())
			{
				if (!particle.alive)
					continue;
				trailMinY = Math::Min(trailMinY, particle.position.y);
				trailMaxY = Math::Max(trailMaxY, particle.position.y);
			}
		}

		if (rocket->IsEnabled())
		{
			flew = true;
			turned = turned || Math::Abs(rocket->transform->GetAngleDegrees()) > 5.0f;
			auto body = DynamicCast<Sprite>(rocket->GetLayer("img")->GetDrawable());
			starBody = starBody || (body && body->GetImageName().Contains("rainbow_star"));
			flameOff = flameOff || !rocket->GetLayer("flame")->IsEnabled();
		}
	});

	EXPECT_TRUE(flew) << "ракета не взлетела";
	EXPECT_FALSE(starBody) << "корпус — ракета, а не звезда";
	EXPECT_FALSE(flameOff) << "пламя ракеты на месте";
	EXPECT_TRUE(turned) << "ракета не разворачивается по курсу";
	EXPECT_GT(launch, 0) << "нет хлопка звёзд на старте";
	EXPECT_GT(trailStars, 0) << "нет шлейфа радужных звёзд";
	EXPECT_GT(trailMaxY - trailMinY, 200.0f) << "шлейф не тянется за ракетой";
	EXPECT_GT(hit, 0) << "нет радужного хлопка в цели";
	EXPECT_EQ(ownParticles, 0) << "свои искры прототипа не должны играть";

	AppTestDriver::Wait(2.0f);
}

// Ракета прилетает ровно в центр целевой клетки — и корпус, и салют из её детей
TEST_F(WordFallVfxShowcase, RocketArrivesAtTargetTileCenter)
{
	o2Scripts.Eval("WordFallViews.fx.rocketStyle = 0"); // исходная ракета: полёт клипом прототипа
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

// Ракета летит «вертолётиком»: взлетает почти вертикально и растёт к камере, в середине дуги быстрее, чем
// на старте и перед целью, садится в центр клетки и сплющивается на ударе
TEST_F(WordFallVfxShowcase, RainbowRocketFliesLikeAPropeller)
{
	mService->DebugSetStone(6, 7); // цель в дальнем углу
	Vec2F target = TilePosition(6, 7);
	TriggerBonusWithWord("rocket");

	auto rocket = DynamicCast<Widget>(o2Scene.FindActor("WordFall")->GetChild("Screen/Fx/FxRocket0"));
	ASSERT_TRUE(rocket);

	struct Sample { float time; Vec2F at; Vec2F scale; };
	Vector<Sample> samples;
	float time = 0.0f;
	bool hidden = false;
	CaptureClip("rocket_propeller", 2.4f, [&]()
	{
		// центр — в координатах траектории (TileWorldPos), куда её ставит FlightTrajectoryComponent
		if (rocket->IsEnabled() && !hidden)
			samples.Add({ time, (rocket->layout->GetOffsetMin() + rocket->layout->GetOffsetMax())*0.5f, rocket->transform->GetScale2D() });
		else if (!samples.IsEmpty())
			hidden = true;
		if (!samples.IsEmpty())
			time += Math::Clamp(o2Time.GetDeltaTime(), 0.001f, 0.05f);
	});
	ASSERT_GT(samples.Count(), 20);

	const Sample& start = samples[0];
	float maxScale = 0.0f;
	const Sample* lifted = nullptr;
	for (auto& sample : samples)
	{
		maxScale = Math::Max(maxScale, sample.scale.x);
		if (!lifted && sample.time >= 0.22f)
			lifted = &sample;
	}
	ASSERT_TRUE(lifted);
	EXPECT_GT(maxScale, 1.3f) << "на взлёте ракета не растёт к камере";
	EXPECT_GT(lifted->at.y - start.at.y, 40.0f) << "ракета не взлетает вверх";
	EXPECT_LT(Math::Abs(lifted->at.x - start.at.x), 10.0f) << "взлёт не вертикальный";

	// скорость на дуге: старт, середина и последние кадры перед целью
	float flightStart = 0.36f, flightEnd = samples.Last().time;
	auto speedAt = [&](float from, float to)
	{
		const Sample* a = nullptr;
		const Sample* b = nullptr;
		for (auto& sample : samples)
		{
			if (!a && sample.time >= from)
				a = &sample;
			if (sample.time <= to)
				b = &sample;
		}
		return a && b && b->time > a->time ? (b->at - a->at).Length()/(b->time - a->time) : 0.0f;
	};
	float span = flightEnd - flightStart;
	float early = speedAt(flightStart, flightStart + span*0.15f);
	float middle = speedAt(flightStart + span*0.4f, flightStart + span*0.6f);
	float late = speedAt(flightEnd - span*0.15f, flightEnd);
	EXPECT_GT(middle, early*1.4f) << "нет разгона на дуге";
	EXPECT_GT(middle, late*1.4f) << "нет торможения перед целью";

	const Sample& landed = samples.Last();
	EXPECT_LT((landed.at - target).Length(), 6.0f) << "ракета садится мимо клетки";
	EXPECT_GT(landed.scale.x, landed.scale.y + 0.2f) << "на ударе ракета не сплющивается";

	AppTestDriver::Wait(1.5f);
}

// Повторный запуск ракеты начинается с чистого листа: ни шлейфа, ни салюта прошлого полёта
// (исходный облик ракеты — у него свои эмиттеры в прототипе)
TEST_F(WordFallVfxShowcase, SecondLaunchStartsWithoutStaleParticles)
{
	o2Scripts.Eval("WordFallViews.fx.rocketStyle = 0");
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
	o2Scripts.Eval("WordFallViews.fx.rocketStyle = 0"); // исходная ракета: ровная скорость и облёт близких целей
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
	Click(AcceptPosition()); // ПРИНЯТЬ
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
	Click(AcceptPosition());

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

// Радужный фейерверк: звезда-хлопок и шар радужных звёзд, затем плотный залп ракет с радужными шлейфами
// и хлопками в целях
TEST_F(WordFallVfxShowcase, RainbowFireworksBurstAndSalvo)
{
	TriggerBonusWithWord("fireworks");

	auto fx = o2Scene.FindActor("WordFall")->GetChild("Screen/Fx");
	ASSERT_TRUE(fx);

	int maxFlying = 0, burst = 0, inner = 0, trails = 0, hits = 0;
	bool starPop = false;
	CaptureClip("fireworks", 3.2f, [&]()
	{
		burst = Math::Max(burst, PoolParticles("F2_Burst"));
		inner = Math::Max(inner, PoolParticles("F2_Inner"));
		trails = Math::Max(trails, PoolParticles("R2_Trail"));
		hits = Math::Max(hits, PoolParticles("R2_Hit"));
		starPop = starPop || FlashShows("Generated/UI/Screen_Resources/Sprites/icon_rainbow_star.png");
		int flying = 0;
		for (int i = 0; i < 10; i++)
		{
			auto rocket = fx->GetChild(String::Format("FxRocket%i", i));
			if (rocket && rocket->IsEnabled())
				flying++;
		}
		maxFlying = Math::Max(maxFlying, flying);
	});

	auto& move = mService->GetLastMoveResult();
	ASSERT_EQ(move.powerupsUsed.Count(), 1);
	EXPECT_GT(move.powerupsUsed[0].targets.Count(), 1) << "фейерверк бьёт по нескольким клеткам";
	EXPECT_TRUE(starPop) << "нет хлопка радужной звездой";
	EXPECT_GT(burst, 0) << "нет шара звёзд";
	EXPECT_GT(inner, 0) << "нет медленных звёзд внутри";
	EXPECT_GT(maxFlying, 3) << "залп недостаточно плотный";
	EXPECT_GT(trails, 0) << "у ракет залпа нет радужных шлейфов";
	EXPECT_GT(hits, 0) << "нет хлопков в целях";

	AppTestDriver::Wait(2.0f);
}
