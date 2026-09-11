#include "o2/stdafx.h"
#include "WordFallVfx.h"
#include "WordFallUiFactory.h"

#include "o2/Assets/Assets.h"
#include "o2/Assets/Types/ImageAsset.h"
#include "o2/Render/Particles/ParticlesContainer.h"
#include "o2/Render/Particles/ParticlesEffects.h"
#include "o2/Render/Particles/ParticlesEmitterShapes.h"
#include "o2/Utils/Math/ColorGradient.h"
#include "o2/Utils/Math/Curve.h"
#include "o2/Scene/Actor.h"
#include "o2/Scene/Components/ParticlesEmitterComponent.h"

static const String kSparkImage = "WordFall/Sprites/vfx_spark.png";
static const String kGlowImage = "WordFall/Sprites/vfx_glow.png";
static const String kRingImage = "WordFall/Sprites/vfx_ring.png";
static const String kSmokeImage = "WordFall/Sprites/vfx_smoke.png";
static const String kStarImage = "WordFall/Sprites/vfx_star4.png";
static const String kCometImage = "WordFall/Sprites/vfx_comet.png";
static const String kSparkleImage = "WordFall/Sprites/vfx_sparkle.png";
static const String kConfettiImage = "WordFall/Sprites/vfx_confetti.png";
static const String kShardImage = "WordFall/Sprites/vfx_shard.png";

// цвета бонусов: искры и вспышки повторяют палитру иконки
static const Color4 kBombColor(255, 176, 64, 255);
static const Color4 kRocketColor(120, 214, 255, 255);
static const Color4 kFireworksColor(255, 120, 205, 255);

struct WordFallVfx::EmitterConfig
{
	String image = kSparkImage;
	int    count = 8;
	float  lifetime = 0.45f;
	float  speed = 180.0f;
	float  speedRange = 0.5f;   // доля от speed
	float  size = 0.35f;
	float  sizeRange = 0.4f;    // доля от size
	float  gravity = -600.0f;   // минус — вниз
	float  damping = 2.2f;
	float  spawnRadius = 10.0f;
	float  depth = 70.0f;
	bool   additive = false;    // светящиеся частицы складываются со сценой
	float  stretch = 0.0f;      // комета: вытягивание по скорости (0 — круглые)
	float  maxStretch = 3.5f;
	float  angleSpeed = 0.0f;   // вращение частицы, град/с
	float  angleSpeedRange = 0.0f;
	float  direction = 0.0f;    // направление разлёта, град (0 — вправо, 90 — вверх)
	float  directionRange = 360.0f; // веер разлёта
	Vector<Pair<float, Color4>> gradient; // цвет по времени жизни
	Vector<Pair<float, Color4>> gradientB; // если задан — цвет случайно между gradient и gradientB
	Vector<Pair<float, float>>  sizeCurve; // множитель размера по времени жизни
};

static Ref<ColorGradient> MakeGradient(const Vector<Pair<float, Color4>>& keys)
{
	auto gradient = mmake<ColorGradient>();
	gradient->RemoveAllKeys();
	for (auto& key : keys)
		gradient->InsertKey(key.first, key.second);
	return gradient;
}

// Пастельная палитра салюта: три цвета росчерков и конфетти между ними
static const Color4 kSalutePink(255, 110, 190, 255);
static const Color4 kSaluteYellow(255, 220, 90, 255);
static const Color4 kSaluteBlue(110, 210, 255, 255);

// Кометы салюта: короткие светящиеся искры с хвостом, разлетаются шаром и опадают
static WordFallVfx::EmitterConfig SaluteSparksConfig(const Color4& color, int count, float speed)
{
	WordFallVfx::EmitterConfig sparks;
	sparks.image = kCometImage;
	sparks.count = count;
	sparks.lifetime = 0.6f;
	sparks.speed = speed;
	sparks.speedRange = 0.5f;
	sparks.size = 0.22f;
	sparks.sizeRange = 0.35f;
	sparks.gravity = -520.0f;
	sparks.damping = 3.0f;
	sparks.additive = true;
	sparks.stretch = 0.0012f;
	sparks.maxStretch = 1.35f;
	Color4 tint((color.r + 255)/2, (color.g + 255)/2, (color.b + 255)/2, 255);
	sparks.gradient = { { 0.0f, tint }, { 0.25f, Color4(color.r, color.g, color.b, 240) },
						{ 0.7f, Color4(color.r, color.g, color.b, 200) }, { 1.0f, Color4(color.r, color.g, color.b, 0) } };
	sparks.sizeCurve = { { 0.0f, 0.7f }, { 0.15f, 1.0f }, { 0.7f, 0.9f }, { 1.0f, 0.0f } };
	return sparks;
}

// Конфетти: крутящиеся бумажки, цвет каждой — случайный между двумя градиентами
static WordFallVfx::EmitterConfig ConfettiConfig(int count, float speed)
{
	WordFallVfx::EmitterConfig confetti;
	confetti.image = kConfettiImage;
	confetti.count = count;
	confetti.lifetime = 1.0f;
	confetti.speed = speed;
	confetti.speedRange = 0.6f;
	confetti.size = 0.26f;
	confetti.sizeRange = 0.4f;
	confetti.gravity = -420.0f;
	confetti.damping = 2.2f;
	confetti.angleSpeed = 360.0f;
	confetti.angleSpeedRange = 500.0f;
	confetti.gradient = { { 0.0f, kSalutePink }, { 0.8f, kSalutePink }, { 1.0f, Color4(kSalutePink.r, kSalutePink.g, kSalutePink.b, 0) } };
	confetti.gradientB = { { 0.0f, kSaluteBlue }, { 0.8f, kSaluteBlue }, { 1.0f, Color4(kSaluteBlue.r, kSaluteBlue.g, kSaluteBlue.b, 0) } };
	confetti.sizeCurve = { { 0.0f, 0.6f }, { 0.1f, 1.0f }, { 1.0f, 0.85f } };
	return confetti;
}

// Блики: мягкие круглые искры с мерцанием, живут дольше комет
static WordFallVfx::EmitterConfig SparkleConfig(int count, float speed)
{
	WordFallVfx::EmitterConfig sparkle;
	sparkle.image = kSparkleImage;
	sparkle.count = count;
	sparkle.lifetime = 0.75f;
	sparkle.speed = speed;
	sparkle.speedRange = 0.7f;
	sparkle.size = 0.24f;
	sparkle.sizeRange = 0.5f;
	sparkle.gravity = -240.0f;
	sparkle.damping = 2.4f;
	sparkle.spawnRadius = 24.0f;
	sparkle.additive = true;
	sparkle.gradient = { { 0.0f, Color4(255, 255, 255, 255) }, { 0.5f, Color4(255, 236, 170, 230) },
						 { 1.0f, Color4(255, 220, 140, 0) } };
	sparkle.sizeCurve = { { 0.0f, 0.4f }, { 0.2f, 1.0f }, { 0.45f, 0.5f }, { 0.7f, 1.0f }, { 1.0f, 0.0f } };
	return sparkle;
}

void WordFallVfx::OnStart()
{
	if (mBuilt)
		return;

	mBuilt = true;

	const Color4 kSparkWhite(255, 255, 255, 255);
	const Color4 kSparkBlue(170, 215, 255, 210);
	const Color4 kSparkFade(140, 190, 255, 0);
	const Vector<Pair<float, Color4>> sparkGradient = { { 0.0f, kSparkWhite }, { 0.35f, kSparkBlue },
													   { 1.0f, kSparkFade } };

	EmitterConfig burn;
	burn.size = burnParticleSize;
	burn.gradient = sparkGradient;
	for (int i = 0; i < kBurnPoolSize; i++)
		mBurnPool.Add(CreateEmitter(String::Format("Burn%i", i), burn));

	EmitterConfig explosion;
	explosion.size = explosionParticleSize;
	explosion.speed = 320.0f;
	explosion.lifetime = 0.6f;
	explosion.count = 24;
	explosion.gradient = sparkGradient;
	mExplosion = CreateEmitter("Explosion", explosion);

	EmitterConfig win = explosion;
	win.speed = 420.0f;
	win.lifetime = 1.2f;
	win.count = 70;
	mWin = CreateEmitter("Win", win);

	EmitterConfig scoreHit;
	scoreHit.size = burnParticleSize;
	scoreHit.speed = 280.0f;
	scoreHit.lifetime = 0.5f;
	scoreHit.count = 14;
	scoreHit.gradient = sparkGradient;
	mScoreHit = CreateEmitter("ScoreHit", scoreHit);

	// салюты бонусов: тройки розовый/жёлтый/голубой в одной точке
	const Color4 saluteColors[3] = { Color4(255, 110, 190, 235), Color4(255, 220, 90, 235),
									 Color4(110, 210, 255, 235) };
	for (int i = 0; i < 4; i++)
	{
		Vector<Ref<ParticlesEmitterComponent>> triple;
		for (int colorIndex = 0; colorIndex < 3; colorIndex++)
		{
			auto color = saluteColors[colorIndex];

			EmitterConfig firework;
			firework.size = explosionParticleSize;
			firework.speed = 300.0f;
			firework.lifetime = 0.55f;
			firework.count = 12;
			firework.gradient = { { 0.0f, kSparkWhite }, { 0.35f, Color4(color.r, color.g, color.b, 210) },
								  { 1.0f, Color4(color.r, color.g, color.b, 0) } };

			triple.Add(CreateEmitter(String::Format("Firework%i_%i", i, colorIndex), firework));
		}
		mFireworkPool.Add(triple);
	}

	BuildBlastEmitters();
	BuildBonusEmitters();
}

void WordFallVfx::BuildBlastEmitters()
{
	// вспышка: белое ядро мгновенно раскрывается и гаснет
	EmitterConfig flash;
	flash.image = kGlowImage;
	flash.count = 1;
	flash.lifetime = 0.24f;
	flash.speed = 0.0f;
	flash.speedRange = 0.0f;
	flash.size = 1.0f;
	flash.sizeRange = 0.0f;
	flash.gravity = 0.0f;
	flash.damping = 0.0f;
	flash.spawnRadius = 1.0f;
	flash.gradient = { { 0.0f, Color4(255, 245, 225, 255) }, { 0.35f, Color4(255, 205, 140, 190) },
					   { 1.0f, Color4(255, 170, 90, 0) } };
	flash.sizeCurve = { { 0.0f, 0.2f }, { 0.25f, 1.0f }, { 1.0f, 1.25f } };
	mBombFlash = CreateEmitter("BombFlash", flash);

	// ударная волна: тонкое кольцо разбегается на всю зону 3x3
	EmitterConfig ring = flash;
	ring.image = kRingImage;
	ring.lifetime = 0.45f;
	ring.size = 1.3f;
	ring.gradient = { { 0.0f, Color4(255, 255, 245, 255) }, { 0.4f, Color4(255, 190, 110, 220) },
					  { 1.0f, Color4(255, 140, 60, 0) } };
	ring.sizeCurve = { { 0.0f, 0.12f }, { 1.0f, 1.0f } };
	mBombRing = CreateEmitter("BombRing", ring);

	// огненное ядро: три жарких клуба, короткие и яркие
	EmitterConfig core = flash;
	core.count = 3;
	core.lifetime = 0.42f;
	core.speed = 60.0f;
	core.speedRange = 0.5f;
	core.size = 0.9f;
	core.sizeRange = 0.3f;
	core.spawnRadius = 18.0f;
	core.additive = true;
	core.gradient = { { 0.0f, Color4(255, 240, 200, 255) }, { 0.3f, Color4(255, 150, 60, 230) },
					  { 1.0f, Color4(220, 60, 30, 0) } };
	core.sizeCurve = { { 0.0f, 0.5f }, { 0.35f, 1.0f }, { 1.0f, 1.3f } };
	mBombCore = CreateEmitter("BombCore", core);

	// осколки: обломки корпуса разлетаются, крутятся и падают
	EmitterConfig debris;
	debris.image = kShardImage;
	debris.count = 7;
	debris.lifetime = 0.85f;
	debris.speed = 520.0f;
	debris.speedRange = 0.5f;
	debris.size = 0.34f;
	debris.sizeRange = 0.5f;
	debris.gravity = -1300.0f;
	debris.damping = 1.6f;
	debris.angleSpeed = 480.0f;
	debris.angleSpeedRange = 600.0f;
	debris.gradient = { { 0.0f, Color4(255, 255, 255, 255) }, { 0.8f, Color4(255, 255, 255, 255) },
						{ 1.0f, Color4(255, 255, 255, 0) } };
	debris.sizeCurve = { { 0.0f, 0.7f }, { 0.1f, 1.0f }, { 1.0f, 0.75f } };
	mBombDebris = CreateEmitter("BombDebris", debris);

	// угли: огненные кометы разлетаются шаром и опадают
	EmitterConfig embers = SaluteSparksConfig(Color4(255, 150, 50, 255), 14, 430.0f);
	embers.lifetime = 0.7f;
	embers.gravity = -700.0f;
	embers.damping = 2.4f;
	embers.gradient = { { 0.0f, Color4(255, 240, 200, 255) }, { 0.3f, Color4(255, 170, 60, 240) },
						{ 0.7f, Color4(255, 110, 40, 200) }, { 1.0f, Color4(200, 60, 30, 0) } };
	mBombEmbers = CreateEmitter("BombEmbers", embers);

	// дым: клубы поднимаются, растут и тают
	EmitterConfig smoke;
	smoke.image = kSmokeImage;
	smoke.count = 6;
	smoke.lifetime = 0.9f;
	smoke.speed = 160.0f;
	smoke.speedRange = 0.7f;
	smoke.size = 0.55f;
	smoke.sizeRange = 0.3f;
	smoke.gravity = 90.0f; // дым всплывает
	smoke.damping = 2.8f;
	smoke.spawnRadius = 26.0f;
	smoke.gradient = { { 0.0f, Color4(255, 214, 170, 0) }, { 0.12f, Color4(250, 226, 205, 120) },
					   { 0.75f, Color4(206, 214, 226, 60) }, { 1.0f, Color4(186, 198, 214, 0) } };
	smoke.sizeCurve = { { 0.0f, 0.45f }, { 1.0f, 1.0f } };
	mBombSmoke = CreateEmitter("BombSmoke", smoke);

	// попадание ракеты: кольцо поменьше и холоднее
	EmitterConfig rocketRing = ring;
	rocketRing.lifetime = 0.4f;
	rocketRing.size = 1.15f;
	rocketRing.gradient = { { 0.0f, Color4(255, 255, 255, 255) }, { 0.4f, Color4(150, 225, 255, 210) },
							{ 1.0f, Color4(110, 190, 255, 0) } };
	mRocketRing = CreateEmitter("RocketRing", rocketRing);

	// взлёт: тёплая вспышка зажигания под соплом
	EmitterConfig launchFlash = flash;
	launchFlash.lifetime = 0.22f;
	launchFlash.size = 0.7f;
	launchFlash.additive = true;
	launchFlash.gradient = { { 0.0f, Color4(255, 250, 230, 255) }, { 0.4f, Color4(255, 190, 90, 180) },
							 { 1.0f, Color4(255, 140, 60, 0) } };
	launchFlash.sizeCurve = { { 0.0f, 0.3f }, { 0.3f, 1.0f }, { 1.0f, 1.15f } };
	mLaunchFlash = CreateEmitter("LaunchFlash", launchFlash);

	// взлёт: небольшое горячее кольцо по земле
	EmitterConfig launchRing = ring;
	launchRing.lifetime = 0.32f;
	launchRing.size = 0.7f;
	launchRing.gradient = { { 0.0f, Color4(255, 240, 210, 230) }, { 0.5f, Color4(255, 180, 90, 160) },
							{ 1.0f, Color4(255, 140, 60, 0) } };
	launchRing.sizeCurve = { { 0.0f, 0.15f }, { 1.0f, 1.0f } };
	mLaunchRing = CreateEmitter("LaunchRing", launchRing);

	// взлёт: клубы пыли расходятся кольцом по земле, растут и тают
	EmitterConfig dust;
	dust.image = kSmokeImage;
	dust.count = 7;
	dust.lifetime = 0.5f;
	dust.speed = 200.0f;
	dust.speedRange = 0.4f;
	dust.size = 0.2f;
	dust.sizeRange = 0.4f;
	dust.gravity = 0.0f;
	dust.damping = 3.4f;
	dust.spawnRadius = 14.0f;
	dust.angleSpeed = 0.0f;
	dust.angleSpeedRange = 180.0f;
	dust.gradient = { { 0.0f, Color4(255, 236, 210, 0) }, { 0.1f, Color4(255, 232, 205, 110) },
					  { 0.6f, Color4(232, 226, 220, 60) }, { 1.0f, Color4(220, 220, 225, 0) } };
	dust.sizeCurve = { { 0.0f, 0.5f }, { 0.3f, 1.0f }, { 1.0f, 1.5f } };
	mLaunchDust = CreateEmitter("LaunchDust", dust);

	// взлёт: угли из сопла разлетаются веером и падают
	EmitterConfig launchEmbers = SaluteSparksConfig(Color4(255, 160, 60, 255), 9, 280.0f);
	launchEmbers.lifetime = 0.5f;
	launchEmbers.gravity = -520.0f;
	launchEmbers.damping = 2.6f;
	launchEmbers.gradient = { { 0.0f, Color4(255, 240, 200, 255) }, { 0.3f, Color4(255, 170, 60, 240) },
							  { 1.0f, Color4(220, 80, 30, 0) } };
	mLaunchEmbers = CreateEmitter("LaunchEmbers", launchEmbers);

	// ящик: щепки — обломки, тонированные в дерево, и пыльное облачко
	EmitterConfig chips;
	chips.image = kShardImage;
	chips.count = 8;
	chips.lifetime = 0.7f;
	chips.speed = 380.0f;
	chips.speedRange = 0.5f;
	chips.size = 0.22f;
	chips.sizeRange = 0.5f;
	chips.gravity = -1100.0f;
	chips.damping = 1.8f;
	chips.angleSpeed = 420.0f;
	chips.angleSpeedRange = 500.0f;
	chips.gradient = { { 0.0f, Color4(230, 170, 100, 255) }, { 0.8f, Color4(210, 150, 90, 255) },
					   { 1.0f, Color4(200, 140, 80, 0) } };
	chips.sizeCurve = { { 0.0f, 0.8f }, { 0.1f, 1.0f }, { 1.0f, 0.7f } };
	mCrateChips = CreateEmitter("CrateChips", chips);

	EmitterConfig crateDust = dust;
	crateDust.count = 5;
	crateDust.speed = 120.0f;
	crateDust.gradient = { { 0.0f, Color4(220, 190, 150, 0) }, { 0.1f, Color4(220, 190, 150, 120) },
						   { 1.0f, Color4(200, 180, 150, 0) } };
	mCrateDust = CreateEmitter("CrateDust", crateDust);

	// снежок: белое облачко и голубые капли
	EmitterConfig puff = dust;
	puff.count = 6;
	puff.speed = 140.0f;
	puff.size = 0.24f;
	puff.gradient = { { 0.0f, Color4(240, 250, 255, 0) }, { 0.1f, Color4(240, 250, 255, 170) },
					  { 1.0f, Color4(220, 240, 255, 0) } };
	mSnowPuff = CreateEmitter("SnowPuff", puff);

	EmitterConfig drops = SparkleConfig(8, 240.0f);
	drops.gravity = -900.0f;
	drops.lifetime = 0.55f;
	drops.size = 0.16f;
	drops.gradient = { { 0.0f, Color4(220, 245, 255, 255) }, { 0.7f, Color4(150, 215, 255, 220) },
					   { 1.0f, Color4(120, 200, 255, 0) } };
	mSnowDrops = CreateEmitter("SnowDrops", drops);

	// конверт доставлен: золотое кольцо и блики
	EmitterConfig deliveredRing = ring;
	deliveredRing.lifetime = 0.4f;
	deliveredRing.size = 0.9f;
	deliveredRing.gradient = { { 0.0f, Color4(255, 245, 200, 240) }, { 0.5f, Color4(255, 210, 90, 180) },
							   { 1.0f, Color4(255, 190, 60, 0) } };
	deliveredRing.sizeCurve = { { 0.0f, 0.2f }, { 1.0f, 1.0f } };
	mDeliveredRing = CreateEmitter("DeliveredRing", deliveredRing);
	mDeliveredSparkle = CreateEmitter("DeliveredSparkle", SparkleConfig(12, 260.0f));

	// победа: кремовые плитки игры разлетаются веером вверх, крутятся и падают
	EmitterConfig tiles;
	tiles.image = "WordFall/Sprites/ui_tile.png";
	tiles.count = 16;
	tiles.lifetime = 1.8f;
	tiles.speed = 620.0f;
	tiles.speedRange = 0.45f;
	tiles.size = 0.42f;
	tiles.sizeRange = 0.4f;
	tiles.gravity = -900.0f;
	tiles.damping = 0.9f;
	tiles.angleSpeed = 240.0f;
	tiles.angleSpeedRange = 400.0f;
	tiles.spawnRadius = 120.0f;
	tiles.depth = 104.0f;
	tiles.direction = 90.0f;
	tiles.directionRange = 110.0f;
	tiles.gradient = { { 0.0f, Color4(255, 255, 255, 255) }, { 0.85f, Color4(255, 255, 255, 255) },
					   { 1.0f, Color4(255, 255, 255, 0) } };
	mWinTiles = CreateEmitter("WinTiles", tiles);

	EmitterConfig winSparkle = SparkleConfig(28, 420.0f);
	winSparkle.lifetime = 1.3f;
	winSparkle.spawnRadius = 140.0f;
	winSparkle.depth = 104.5f;
	mWinSparkle = CreateEmitter("WinSparkle", winSparkle);


	BuildFireworkEmitters();
}

void WordFallVfx::BuildFireworkEmitters()
{
	EmitterConfig flash;
	flash.image = kGlowImage;
	flash.count = 1;
	flash.lifetime = 0.24f;
	flash.speed = 0.0f;
	flash.speedRange = 0.0f;
	flash.size = 0.8f;
	flash.sizeRange = 0.0f;
	flash.gravity = 0.0f;
	flash.damping = 0.0f;
	flash.spawnRadius = 1.0f;
	flash.additive = true;
	flash.gradient = { { 0.0f, Color4(255, 240, 250, 200) }, { 0.35f, Color4(255, 170, 235, 150) },
					   { 1.0f, Color4(255, 140, 220, 0) } };
	flash.sizeCurve = { { 0.0f, 0.2f }, { 0.3f, 1.0f }, { 1.0f, 1.2f } };
	mFireworkFlash = CreateEmitter("FireworkFlash", flash);

	const Color4 colors[3] = { kSalutePink, kSaluteYellow, kSaluteBlue };
	for (int i = 0; i < 3; i++)
		mFireworkSparks.Add(CreateEmitter(String::Format("FireworkSparks%i", i), SaluteSparksConfig(colors[i], 8, 470.0f)));

	mFireworkConfetti = CreateEmitter("FireworkConfetti", ConfettiConfig(12, 330.0f));
	mFireworkGlitter = CreateEmitter("FireworkGlitter", SparkleConfig(10, 230.0f));
}

void WordFallVfx::BuildBonusEmitters()
{
	const Color4 kindColors[kBonusKinds] = { kBombColor, kRocketColor, kFireworksColor };

	for (int kind = 0; kind < kBonusKinds; kind++)
	{
		auto color = kindColors[kind];

		// холостая искра: звёздочка вспыхивает над бонусом и всплывает
		EmitterConfig sparkle;
		sparkle.image = kStarImage;
		sparkle.count = 2;
		sparkle.lifetime = 0.9f;
		sparkle.speed = 34.0f;
		sparkle.speedRange = 0.8f;
		sparkle.size = 0.3f;
		sparkle.sizeRange = 0.35f;
		sparkle.gravity = 26.0f;
		sparkle.damping = 1.2f;
		sparkle.spawnRadius = 44.0f;
		sparkle.gradient = { { 0.0f, Color4(255, 255, 255, 0) },
							 { 0.3f, Color4(255, 255, 255, 255) },
							 { 0.6f, Color4(color.r, color.g, color.b, 220) },
							 { 1.0f, Color4(color.r, color.g, color.b, 0) } };
		sparkle.sizeCurve = { { 0.0f, 0.25f }, { 0.35f, 1.0f }, { 1.0f, 0.15f } };
		mBonusSparkle.Add(CreateEmitter(String::Format("BonusSparkle%i", kind), sparkle));

		// появление: звёзды разлетаются в стороны, кольцо схлопывается внутрь
		EmitterConfig spawn;
		spawn.image = kStarImage;
		spawn.count = 7;
		spawn.lifetime = 0.55f;
		spawn.speed = 330.0f;
		spawn.speedRange = 0.5f;
		spawn.size = 0.32f;
		spawn.gravity = -180.0f;
		spawn.damping = 3.4f;
		spawn.spawnRadius = 6.0f;
		spawn.gradient = { { 0.0f, Color4(255, 255, 255, 255) },
						   { 0.45f, Color4(color.r, color.g, color.b, 230) },
						   { 1.0f, Color4(color.r, color.g, color.b, 0) } };
		spawn.sizeCurve = { { 0.0f, 1.0f }, { 1.0f, 0.2f } };
		mBonusSpawn.Add(CreateEmitter(String::Format("BonusSpawn%i", kind), spawn));
	}
}

Ref<ParticlesEmitterComponent> WordFallVfx::CreateEmitter(const String& name, const EmitterConfig& config)
{
	auto actor = mmake<Actor>(ActorCreateMode::InScene);
	actor->SetName(name);
	GetActor()->AddChild(actor);
	actor->SetLayer("UI");
	actor->transform->SetSize2D(Vec2F(config.spawnRadius, config.spawnRadius));
	// поверх HUD и поля (бар ~3.5, плашки эффектов 61-63), под попапом (100+)
	actor->SetDrawingDepthInheritFromParent(false);
	actor->SetDrawingDepth(config.depth);

	auto emitter = actor->AddComponent<ParticlesEmitterComponent>();

	auto source = mmake<SingleSpriteParticleSource>();
	source->image = o2Assets.GetAssetRefByType<ImageAsset>(config.image);
	emitter->SetParticlesSource(source);

	emitter->SetShape(mmake<CircleParticlesEmitterShape>());

	// короткий burst: вся пачка частиц за первые кадры
	emitter->SetDuration(0.1f);
	emitter->SetParticlesLifetime(config.lifetime);
	emitter->SetParticlesPerSecond((float)config.count/0.1f);
	emitter->SetMaxParticles(config.count);
	emitter->SetInitialSpeed(config.speed);
	emitter->SetInitialSpeedRange(config.speed*config.speedRange);
	emitter->SetInitialSize(config.size);
	emitter->SetInitialSizeRange(config.size*config.sizeRange);
	emitter->SetInitialAngle(0.0f);
	emitter->SetInitialAngleRange(360.0f);
	emitter->SetInitialAngleSpeed(config.angleSpeed);
	emitter->SetInitialAngleSpeedRange(config.angleSpeedRange);
	emitter->SetEmitParticlesMoveDirection(config.direction);
	emitter->SetEmitParticlesMoveDirectionRange(config.directionRange); // по умолчанию во все стороны

	// частицы живут в мире: перенос эмиттера пулом не телепортирует прошлую вспышку
	emitter->SetParticlesRelativity(false);

	if (!Math::Equals(config.gravity, 0.0f))
	{
		auto gravity = mmake<ParticlesGravityEffect>();
		gravity->SetGravity(Vec3F(0, config.gravity, 0));
		emitter->AddEffect(gravity);
	}

	if (!Math::Equals(config.damping, 0.0f))
	{
		auto damping = mmake<ParticlesDampingEffect>();
		damping->SetDamping(config.damping);
		emitter->AddEffect(damping);
	}

	if (!config.gradient.IsEmpty() && !config.gradientB.IsEmpty())
	{
		auto colorEffect = mmake<ParticlesRandomColorEffect>();
		colorEffect->colorGradientA = MakeGradient(config.gradient);
		colorEffect->colorGradientB = MakeGradient(config.gradientB);
		emitter->AddEffect(colorEffect);
	}
	else if (!config.gradient.IsEmpty())
	{
		auto colorEffect = mmake<ParticlesColorEffect>();
		colorEffect->colorGradient = MakeGradient(config.gradient);
		emitter->AddEffect(colorEffect);
	}

	if (!config.sizeCurve.IsEmpty())
	{
		auto curve = mmake<Curve>();
		float prevPosition = 0.0f;
		for (auto& key : config.sizeCurve)
		{
			curve->AppendKey(key.first - prevPosition, key.second, 0.0f, 1.0f);
			prevPosition = key.first;
		}

		auto sizeEffect = mmake<ParticlesSizeEffect>();
		sizeEffect->curve = curve;
		emitter->AddEffect(sizeEffect);
	}

	if (!Math::Equals(config.stretch, 0.0f))
	{
		auto stretch = mmake<ParticlesVelocityStretchEffect>();
		stretch->SetStretch(config.stretch);
		stretch->SetMaxStretch(config.maxStretch);
		emitter->AddEffect(stretch);
	}

	if (config.additive)
		emitter->SetMaterial(WordFallUiFactory::AdditiveMaterial());

	emitter->SetLoop(Loop::None);
	emitter->Stop();

	return emitter;
}

void WordFallVfx::PlayAt(const Ref<ParticlesEmitterComponent>& emitter, float x, float y)
{
	if (!emitter)
		return;

	emitter->GetActor()->transform->SetPosition2D(Vec2F(x, y));
	emitter->RewindAndPlay();
}

int WordFallVfx::KindIndex(const String& kind)
{
	if (kind == "rocket")
		return 1;

	if (kind == "fireworks")
		return 2;

	return 0;
}

void WordFallVfx::PlayBurn(float x, float y)
{
	if (mBurnPool.IsEmpty())
		return;

	PlayAt(mBurnPool[mNextBurn], x, y);
	mNextBurn = (mNextBurn + 1)%mBurnPool.Count();
}

void WordFallVfx::PlayExplosion(float x, float y)
{
	PlayAt(mExplosion, x, y);
}

void WordFallVfx::PlayWin()
{
	PlayAt(mWin, 0.0f, 100.0f);
}

void WordFallVfx::PlayScoreHit(float x, float y)
{
	PlayAt(mScoreHit, x, y);
}

void WordFallVfx::PlayFirework(float x, float y)
{
	if (mFireworkPool.IsEmpty())
		return;

	for (auto& emitter : mFireworkPool[mNextFirework])
		PlayAt(emitter, x, y);
	mNextFirework = (mNextFirework + 1)%mFireworkPool.Count();
}

void WordFallVfx::PlayBombBlast(float x, float y)
{
	PlayAt(mBombFlash, x, y);
	PlayAt(mBombCore, x, y);
	PlayAt(mBombRing, x, y);
	PlayAt(mBombDebris, x, y);
	PlayAt(mBombEmbers, x, y);
	PlayAt(mBombSmoke, x, y);
}

void WordFallVfx::PlayRocketImpact(float x, float y)
{
	PlayAt(mRocketRing, x, y); // росчерки и глиттер выпускает салют самой ракеты
}

void WordFallVfx::PlayRocketLaunch(float x, float y)
{
	PlayAt(mLaunchFlash, x, y);
	PlayAt(mLaunchRing, x, y);
	PlayAt(mLaunchDust, x, y);
	PlayAt(mLaunchEmbers, x, y);
}

void WordFallVfx::PlayCrateBreak(float x, float y)
{
	PlayAt(mCrateChips, x, y);
	PlayAt(mCrateDust, x, y);
}

void WordFallVfx::PlayCrateHit(float x, float y)
{
	PlayAt(mCrateDust, x, y);
}

void WordFallVfx::PlaySnowMelt(float x, float y)
{
	PlayAt(mSnowPuff, x, y);
	PlayAt(mSnowDrops, x, y);
}

void WordFallVfx::PlayDelivered(float x, float y)
{
	PlayAt(mDeliveredRing, x, y);
	PlayAt(mDeliveredSparkle, x, y);
}

void WordFallVfx::PlayWinTiles(float x, float y)
{
	PlayAt(mWinTiles, x, y);
	PlayAt(mWinSparkle, x, y);
}

void WordFallVfx::PlayFireworkBurst(float x, float y)
{
	PlayAt(mFireworkFlash, x, y);
	for (auto& sparks : mFireworkSparks)
		PlayAt(sparks, x, y);
	PlayAt(mFireworkConfetti, x, y);
	PlayAt(mFireworkGlitter, x, y);
}

void WordFallVfx::PlayBonusSparkle(float x, float y, const String& kind)
{
	if (mBonusSparkle.IsEmpty())
		return;

	PlayAt(mBonusSparkle[KindIndex(kind)], x, y);
}

void WordFallVfx::PlayBonusSpawn(float x, float y, const String& kind)
{
	if (mBonusSpawn.IsEmpty())
		return;

	PlayAt(mBonusSpawn[KindIndex(kind)], x, y);
}
// --- META ---

DECLARE_CLASS(WordFallVfx, WordFallVfx);
// --- END META ---
