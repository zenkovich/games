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

	SERIALIZABLE(WordFallVfx);
	CLONEABLE_REF(WordFallVfx);

private:
	static constexpr int kBurnPoolSize = 10;

	Vector<Ref<ParticlesEmitterComponent>> mBurnPool;
	Vector<Vector<Ref<ParticlesEmitterComponent>>> mFireworkPool; // тройки цветных эмиттеров
	int mNextFirework = 0;
	Ref<ParticlesEmitterComponent> mExplosion;
	Ref<ParticlesEmitterComponent> mWin;
	Ref<ParticlesEmitterComponent> mScoreHit;
	int mNextBurn = 0;
	bool mBuilt = false;

	void OnStart() override;

	Ref<ParticlesEmitterComponent> CreateEmitter(const String& name, float size,
												 float speed, float lifetime, int burstCount);
	void PlayAt(const Ref<ParticlesEmitterComponent>& emitter, float x, float y);

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
    FUNCTION().PRIVATE().SIGNATURE(void, OnStart);
    FUNCTION().PRIVATE().SIGNATURE(Ref<ParticlesEmitterComponent>, CreateEmitter, const String&, float, float, float, int);
    FUNCTION().PRIVATE().SIGNATURE(void, PlayAt, const Ref<ParticlesEmitterComponent>&, float, float);
}
END_META;
// --- END META ---
