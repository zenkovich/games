#pragma once

#include "o2/Scene/Component.h"
#include "o2/Scene/Components/ParticlesEmitterComponent.h"

using namespace o2;

// Партикловые эффекты игры: вспышки на сгорании букв, взрывы пауэрапов,
// салют победы. Пул эмиттеров строится на дочерних акторах в OnStart;
// JS-вьюхи зовут SCRIPTABLE-методы с экранными координатами
class WordFallVfx: public Component
{
public:
	struct EmitterConfig; // настройки burst-эмиттера, собираются в .cpp

	float burnParticleSize = 0.35f;      // масштаб искры сгорания (от спрайта) @SERIALIZABLE @EDITOR_PROPERTY
	float explosionParticleSize = 0.55f; // масштаб искры взрыва (от спрайта) @SERIALIZABLE @EDITOR_PROPERTY

	// Вспышка сгорания буквы @SCRIPTABLE
	void PlayBurn(float x, float y);

	// Взрыв пауэрапа @SCRIPTABLE
	void PlayExplosion(float x, float y);

	// Салют победы по центру экрана @SCRIPTABLE
	void PlayWin();

	// Бело-голубые искры прилёта очков в прогресс-бар @SCRIPTABLE
	void PlayScoreHit(float x, float y);

	// Разноцветный салют-фейерверк @SCRIPTABLE
	void PlayFirework(float x, float y);

	// Взрыв бомбы: вспышка, ударная волна, осколки и дым @SCRIPTABLE
	void PlayBombBlast(float x, float y);

	// Попадание ракеты: кольцо и искры @SCRIPTABLE
	void PlayRocketImpact(float x, float y);

	// Взлёт ракеты: вспышка зажигания, пыльное кольцо и угли @SCRIPTABLE
	void PlayRocketLaunch(float x, float y);

	// Ящик сломан: щепки и пыль @SCRIPTABLE
	void PlayCrateBreak(float x, float y);

	// Ящик треснул от удара: пара щепок @SCRIPTABLE
	void PlayCrateHit(float x, float y);

	// Снежок растаял: облачко и капли @SCRIPTABLE
	void PlaySnowMelt(float x, float y);

	// Конверт доставлен: золотые блики и кольцо @SCRIPTABLE
	void PlayDelivered(float x, float y);

	// Победа: плитки-конфетти и золотые блики над карточкой @SCRIPTABLE
	void PlayWinTiles(float x, float y);

	// Искра бонуса, ждущего на поле; kind — bomb/rocket/fireworks @SCRIPTABLE
	void PlayBonusSparkle(float x, float y, const String& kind);

	// Появление бонуса на поле @SCRIPTABLE
	void PlayBonusSpawn(float x, float y, const String& kind);

	// Центральный взрыв фейерверка: вспышка, кольцо, три цвета росчерков и глиттер @SCRIPTABLE
	void PlayFireworkBurst(float x, float y);

	SERIALIZABLE(WordFallVfx);
	CLONEABLE_REF(WordFallVfx);

private:
	static constexpr int kBurnPoolSize = 10;
	static constexpr int kBonusKinds = 3; // bomb, rocket, fireworks


	Vector<Ref<ParticlesEmitterComponent>> mBurnPool;
	Vector<Vector<Ref<ParticlesEmitterComponent>>> mFireworkPool; // тройки цветных эмиттеров
	int mNextFirework = 0;
	Ref<ParticlesEmitterComponent> mExplosion;
	Ref<ParticlesEmitterComponent> mWin;
	Ref<ParticlesEmitterComponent> mScoreHit;

	Ref<ParticlesEmitterComponent> mBombFlash;
	Ref<ParticlesEmitterComponent> mBombRing;
	Ref<ParticlesEmitterComponent> mBombDebris;
	Ref<ParticlesEmitterComponent> mBombSmoke;
	Ref<ParticlesEmitterComponent> mBombCore;
	Ref<ParticlesEmitterComponent> mBombEmbers;
	Ref<ParticlesEmitterComponent> mRocketRing;
	Ref<ParticlesEmitterComponent> mLaunchFlash;
	Ref<ParticlesEmitterComponent> mLaunchRing;
	Ref<ParticlesEmitterComponent> mLaunchDust;
	Ref<ParticlesEmitterComponent> mLaunchEmbers;
	Ref<ParticlesEmitterComponent> mCrateChips;
	Ref<ParticlesEmitterComponent> mCrateDust;
	Ref<ParticlesEmitterComponent> mSnowPuff;
	Ref<ParticlesEmitterComponent> mSnowDrops;
	Ref<ParticlesEmitterComponent> mDeliveredRing;
	Ref<ParticlesEmitterComponent> mDeliveredSparkle;
	Ref<ParticlesEmitterComponent> mWinTiles;
	Ref<ParticlesEmitterComponent> mWinSparkle;
	Ref<ParticlesEmitterComponent> mFireworkFlash;
	Ref<ParticlesEmitterComponent> mFireworkGlitter;
	Vector<Ref<ParticlesEmitterComponent>> mFireworkSparks; // кометы по цвету салюта
	Ref<ParticlesEmitterComponent> mFireworkConfetti;

	Vector<Ref<ParticlesEmitterComponent>> mBonusSparkle; // по эмиттеру на вид бонуса
	Vector<Ref<ParticlesEmitterComponent>> mBonusSpawn;

	int mNextBurn = 0;
	bool mBuilt = false;

	void OnStart() override;

	void BuildBlastEmitters();
	void BuildBonusEmitters();
	void BuildFireworkEmitters();

	Ref<ParticlesEmitterComponent> CreateEmitter(const String& name, const EmitterConfig& config);
	void PlayAt(const Ref<ParticlesEmitterComponent>& emitter, float x, float y);

	static int KindIndex(const String& kind);

	REF_COUNTERABLE_IMPL(Component);
};
// --- META ---

CLASS_BASES_META(WordFallVfx)
{
    BASE_CLASS(Component);
}
END_META;
CLASS_FIELDS_META(WordFallVfx)
{
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(0.35f).NAME(burnParticleSize);
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(0.55f).NAME(explosionParticleSize);
    FIELD().PRIVATE().NAME(mBurnPool);
    FIELD().PRIVATE().NAME(mFireworkPool);
    FIELD().PRIVATE().DEFAULT_VALUE(0).NAME(mNextFirework);
    FIELD().PRIVATE().NAME(mExplosion);
    FIELD().PRIVATE().NAME(mWin);
    FIELD().PRIVATE().NAME(mScoreHit);
    FIELD().PRIVATE().NAME(mBombFlash);
    FIELD().PRIVATE().NAME(mBombRing);
    FIELD().PRIVATE().NAME(mBombDebris);
    FIELD().PRIVATE().NAME(mBombSmoke);
    FIELD().PRIVATE().NAME(mBombCore);
    FIELD().PRIVATE().NAME(mBombEmbers);
    FIELD().PRIVATE().NAME(mRocketRing);
    FIELD().PRIVATE().NAME(mLaunchFlash);
    FIELD().PRIVATE().NAME(mLaunchRing);
    FIELD().PRIVATE().NAME(mLaunchDust);
    FIELD().PRIVATE().NAME(mLaunchEmbers);
    FIELD().PRIVATE().NAME(mCrateChips);
    FIELD().PRIVATE().NAME(mCrateDust);
    FIELD().PRIVATE().NAME(mSnowPuff);
    FIELD().PRIVATE().NAME(mSnowDrops);
    FIELD().PRIVATE().NAME(mDeliveredRing);
    FIELD().PRIVATE().NAME(mDeliveredSparkle);
    FIELD().PRIVATE().NAME(mWinTiles);
    FIELD().PRIVATE().NAME(mWinSparkle);
    FIELD().PRIVATE().NAME(mFireworkFlash);
    FIELD().PRIVATE().NAME(mFireworkGlitter);
    FIELD().PRIVATE().NAME(mFireworkSparks);
    FIELD().PRIVATE().NAME(mFireworkConfetti);
    FIELD().PRIVATE().NAME(mBonusSparkle);
    FIELD().PRIVATE().NAME(mBonusSpawn);
    FIELD().PRIVATE().DEFAULT_VALUE(0).NAME(mNextBurn);
    FIELD().PRIVATE().DEFAULT_VALUE(false).NAME(mBuilt);
}
END_META;
CLASS_METHODS_META(WordFallVfx)
{

    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(void, PlayBurn, float, float);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(void, PlayExplosion, float, float);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(void, PlayWin);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(void, PlayScoreHit, float, float);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(void, PlayFirework, float, float);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(void, PlayBombBlast, float, float);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(void, PlayRocketImpact, float, float);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(void, PlayRocketLaunch, float, float);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(void, PlayCrateBreak, float, float);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(void, PlayCrateHit, float, float);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(void, PlaySnowMelt, float, float);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(void, PlayDelivered, float, float);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(void, PlayWinTiles, float, float);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(void, PlayBonusSparkle, float, float, const String&);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(void, PlayBonusSpawn, float, float, const String&);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(void, PlayFireworkBurst, float, float);
    FUNCTION().PRIVATE().SIGNATURE(void, OnStart);
    FUNCTION().PRIVATE().SIGNATURE(void, BuildBlastEmitters);
    FUNCTION().PRIVATE().SIGNATURE(void, BuildBonusEmitters);
    FUNCTION().PRIVATE().SIGNATURE(void, BuildFireworkEmitters);
    FUNCTION().PRIVATE().SIGNATURE(Ref<ParticlesEmitterComponent>, CreateEmitter, const String&, const EmitterConfig&);
    FUNCTION().PRIVATE().SIGNATURE(void, PlayAt, const Ref<ParticlesEmitterComponent>&, float, float);
    FUNCTION().PRIVATE().SIGNATURE_STATIC(int, KindIndex, const String&);
}
END_META;
// --- END META ---
