#include "o2/stdafx.h"
#include "WordFallVfx.h"

#include "o2/Assets/Assets.h"
#include "o2/Assets/Types/ImageAsset.h"
#include "o2/Render/Particles/ParticlesContainer.h"
#include "o2/Render/Particles/ParticlesEffects.h"
#include "o2/Render/Particles/ParticlesEmitterShapes.h"
#include "o2/Utils/Math/ColorGradient.h"
#include "o2/Scene/Actor.h"
#include "o2/Scene/Components/ParticlesEmitterComponent.h"

static const String kSparkImage = "WordFall/Sprites/vfx_spark.png";

void WordFallVfx::OnStart()
{
	if (mBuilt)
		return;

	mBuilt = true;

	for (int i = 0; i < kBurnPoolSize; i++)
		mBurnPool.Add(CreateEmitter(String::Format("Burn%i", i), burnParticleSize, 180.0f, 0.45f, 14));

	mExplosion = CreateEmitter("Explosion", explosionParticleSize, 320.0f, 0.6f, 40);
	mWin = CreateEmitter("Win", explosionParticleSize, 420.0f, 1.2f, 120);

	// искры прилёта очков: бело-голубые, гаснут к концу жизни
	mScoreHit = CreateEmitter("ScoreHit", burnParticleSize, 280.0f, 0.5f, 26);
	auto gradient = mmake<ColorGradient>();
	gradient->InsertKey(0.0f, Color4(255, 255, 255, 255));
	gradient->InsertKey(0.45f, Color4(170, 215, 255, 235));
	gradient->InsertKey(1.0f, Color4(140, 190, 255, 0));
	auto colorEffect = mmake<ParticlesColorEffect>();
	colorEffect->colorGradient = gradient;
	mScoreHit->AddEffect(colorEffect);
}

Ref<ParticlesEmitterComponent> WordFallVfx::CreateEmitter(const String& name, float size,
														  float speed, float lifetime, int burstCount)
{
	auto actor = mmake<Actor>(ActorCreateMode::InScene);
	actor->SetName(name);
	GetActor()->AddChild(actor);
	actor->SetLayer("UI");
	actor->transform->SetSize2D(Vec2F(10, 10));

	auto emitter = actor->AddComponent<ParticlesEmitterComponent>();

	auto source = mmake<SingleSpriteParticleSource>();
	source->image = o2Assets.GetAssetRefByType<ImageAsset>(kSparkImage);
	emitter->SetParticlesSource(source);

	emitter->SetShape(mmake<CircleParticlesEmitterShape>());

	// короткий burst: вся пачка частиц за первые кадры
	emitter->SetDuration(0.1f);
	emitter->SetParticlesLifetime(lifetime);
	emitter->SetParticlesPerSecond((float)burstCount/0.1f);
	emitter->SetMaxParticles(burstCount);
	emitter->SetInitialSpeed(speed);
	emitter->SetInitialSpeedRange(speed*0.5f);
	emitter->SetInitialSize(size);
	emitter->SetInitialSizeRange(size*0.4f);
	emitter->SetInitialAngle(0.0f);
	emitter->SetInitialAngleRange(360.0f);
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
// --- META ---

DECLARE_CLASS(WordFallVfx, WordFallVfx);
// --- END META ---
