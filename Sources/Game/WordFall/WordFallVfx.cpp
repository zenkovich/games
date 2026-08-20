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
		mBurnPool.Add(CreateEmitter(String::Format("Burn%i", i), burnParticleSize, 180.0f, 0.45f, 8));

	mExplosion = CreateEmitter("Explosion", explosionParticleSize, 320.0f, 0.6f, 24);
	mWin = CreateEmitter("Win", explosionParticleSize, 420.0f, 1.2f, 70);

	mScoreHit = CreateEmitter("ScoreHit", burnParticleSize, 280.0f, 0.5f, 14);

	// салюты бонусов: тройки розовый/жёлтый/голубой в одной точке
	const Color4 saluteColors[3] = { Color4(255, 110, 190, 235), Color4(255, 220, 90, 235),
									 Color4(110, 210, 255, 235) };
	for (int i = 0; i < 4; i++)
	{
		Vector<Ref<ParticlesEmitterComponent>> triple;
		for (int colorIndex = 0; colorIndex < 3; colorIndex++)
		{
			auto emitter = CreateEmitter(String::Format("Firework%i_%i", i, colorIndex),
										 explosionParticleSize, 300.0f, 0.55f, 12);

			auto gradient = mmake<ColorGradient>();
			auto color = saluteColors[colorIndex];
			gradient->InsertKey(0.0f, Color4(255, 255, 255, 255));
			gradient->InsertKey(0.35f, Color4(color.r, color.g, color.b, 210));
			gradient->InsertKey(1.0f, Color4(color.r, color.g, color.b, 0));
			auto colorEffect = mmake<ParticlesColorEffect>();
			colorEffect->colorGradient = gradient;
			emitter->AddEffect(colorEffect);

			triple.Add(emitter);
		}
		mFireworkPool.Add(triple);
	}
}

Ref<ParticlesEmitterComponent> WordFallVfx::CreateEmitter(const String& name, float size,
														  float speed, float lifetime, int burstCount)
{
	auto actor = mmake<Actor>(ActorCreateMode::InScene);
	actor->SetName(name);
	GetActor()->AddChild(actor);
	actor->SetLayer("UI");
	actor->transform->SetSize2D(Vec2F(10, 10));
	// поверх HUD и поля (бар ~3.5, плашки эффектов 61-63), под попапом (100+)
	actor->SetDrawingDepthInheritFromParent(false);
	actor->SetDrawingDepth(70.0f);

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
	emitter->SetEmitParticlesMoveDirectionRange(360.0f); // разлёт во все стороны, не вправо

	// частицы живут в мире: перенос эмиттера пулом не телепортирует прошлую вспышку
	emitter->SetParticlesRelativity(false);

	// салютная физика: искры опадают и тормозят как в воздухе
	auto gravity = mmake<ParticlesGravityEffect>();
	gravity->SetGravity(Vec3F(0, -600, 0));
	emitter->AddEffect(gravity);

	auto damping = mmake<ParticlesDampingEffect>();
	damping->SetDamping(2.2f);
	emitter->AddEffect(damping);

	// бело-голубые искры, гаснут к концу жизни
	auto gradient = mmake<ColorGradient>();
	gradient->InsertKey(0.0f, Color4(255, 255, 255, 255));
	gradient->InsertKey(0.35f, Color4(170, 215, 255, 210));
	gradient->InsertKey(1.0f, Color4(140, 190, 255, 0));
	auto colorEffect = mmake<ParticlesColorEffect>();
	colorEffect->colorGradient = gradient;
	emitter->AddEffect(colorEffect);

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

void WordFallVfx::PlayFirework(float x, float y)
{
	if (mFireworkPool.IsEmpty())
		return;

	for (auto& emitter : mFireworkPool[mNextFirework])
		PlayAt(emitter, x, y);
	mNextFirework = (mNextFirework + 1)%mFireworkPool.Count();
}
// --- META ---

DECLARE_CLASS(WordFallVfx, WordFallVfx);
// --- END META ---
