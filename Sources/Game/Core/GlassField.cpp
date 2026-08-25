#include "o2/stdafx.h"
#include "Core/GlassField.h"

#include "o2/Render/Render.h"
#include "o2/Scene/Actor.h"
#include "o2/Scene/Components/ImageComponent.h"
#include "o2/Scene/Physics/CircleCollider.h"
#include "o2/Scene/Physics/SplineCollider.h"
#include "o2/Scene/Scene.h"
#include "o2/Utils/Math/Math.h"

namespace
{
	const char* kBallsContainerName = "Balls";
	const char* kBorderName = "Border";
	const float kNeighbourDistanceCoef = 1.25f;
}

void GlassField::Setup(const Vector<String>& colors, int maxBalls, const Vec2F& size, float ballRadius)
{
	mColors = colors;
	mMaxBalls = maxBalls;
	mSize = size;
	mBallRadius = ballRadius;

	auto owner = mOwner.Lock();

	if (auto oldBorder = owner->FindChild(kBorderName))
		o2Scene.DestroyActor(oldBorder);

	if (auto oldBalls = owner->FindChild(kBallsContainerName))
		o2Scene.DestroyActor(oldBalls);

	BuildBorder();

	mBallsContainer = mmake<Actor>(ActorCreateMode::InScene);
	mBallsContainer->SetName(kBallsContainerName);
	mBallsContainer->SetParent(owner, false);
	mBallsContainer->transform->SetPosition2D(Vec2F());
}

void GlassField::BuildBorder()
{
	auto border = mmake<RigidBody>();
	border->SetName(kBorderName);
	border->SetBodyType(RigidBody::Type::Static);

	auto collider = mmake<SplineCollider>();
	border->AddComponent(collider);

	Vec2F half = mSize*0.5f;
	Vector<Vec2F> points = {
		Vec2F(-half.x, -half.y), Vec2F(half.x, -half.y),
		Vec2F(half.x, half.y + mSpawnHeight), Vec2F(-half.x, half.y + mSpawnHeight)
	};

	collider->spline->BeginKeysBatchChange();
	collider->spline->RemoveAllKeys();
	for (auto& point : points)
		collider->spline->AppendKey(point, 0.0f, Vec2F(), Vec2F());
	collider->spline->CompleteKeysBatchingChange();
	collider->spline->SetClosed(true);
	collider->SetIsLoop(true);

	border->SetParent(mOwner.Lock(), false);
	border->transform->SetPosition2D(Vec2F());
}

void GlassField::SetMaxBalls(int count)
{
	mMaxBalls = count;
}

int GlassField::GetMaxBalls() const
{
	return mMaxBalls;
}

const Vector<String>& GlassField::GetColors() const
{
	return mColors;
}

const Vec2F& GlassField::GetSize() const
{
	return mSize;
}

float GlassField::GetBallRadius() const
{
	return mBallRadius;
}

RectF GlassField::GetSpawnZone() const
{
	Vec2F half = mSize*0.5f;
	return RectF(-half.x + mBallRadius*1.5f, half.y + mBallRadius*1.5f,
				 half.x - mBallRadius*1.5f, half.y + mSpawnHeight - mBallRadius*1.5f);
}

Ref<ResourceBall> GlassField::SpawnBall(const String& type, const Vec2F& localPosition)
{
	if (!mBallsContainer)
		return nullptr;

	auto actor = mmake<RigidBody>();
	actor->SetName(type);
	actor->SetBodyType(RigidBody::Type::Dynamic);
	actor->transform->SetPivot2D(Vec2F(0.5f, 0.5f));
	actor->transform->SetSize2D(Vec2F(mBallRadius*2.0f, mBallRadius*2.0f));

	auto collider = mmake<CircleCollider>();
	collider->SetFitByActor(false);
	collider->SetRadius(mBallRadius);
	actor->AddComponent(collider);

	// Image assets touch the render device: visuals only when it exists
	if (Render::IsSingletonInitialzed())
		actor->AddComponent(mmake<ImageComponent>(String("Balls/") + type + ".png"));

	auto ball = mmake<ResourceBall>();
	ball->SetResourceType(type);
	ball->SetRadius(mBallRadius);
	ball->onTap = [this](const Ref<ResourceBall>& tapped) { PopGroup(tapped); };
	actor->AddComponent(ball);

	actor->SetParent(mBallsContainer, false);
	actor->transform->SetPosition2D(localPosition);

	return ball;
}

Vector<Ref<ResourceBall>> GlassField::GetBalls() const
{
	Vector<Ref<ResourceBall>> result;
	if (!mBallsContainer)
		return result;

	for (auto& child : mBallsContainer->GetChildren())
	{
		if (auto ball = child->GetComponent<ResourceBall>())
			result.Add(ball);
	}

	return result;
}

int GlassField::GetBallCount() const
{
	return mBallsContainer ? mBallsContainer->GetChildren().Count() : 0;
}

Vector<Ref<ResourceBall>> GlassField::CollectGroup(const Ref<ResourceBall>& ball) const
{
	Vector<Ref<ResourceBall>> group;
	if (!ball)
		return group;

	auto balls = GetBalls();
	float maxDistance = mBallRadius*2.0f*kNeighbourDistanceCoef;
	float maxDistanceSqr = maxDistance*maxDistance;

	Vector<Ref<ResourceBall>> wave = { ball };
	group.Add(ball);

	while (!wave.IsEmpty())
	{
		Vector<Ref<ResourceBall>> nextWave;
		for (auto& current : wave)
		{
			Vec2F currentPos = current->GetActor()->transform->GetWorldPosition2D();
			for (auto& other : balls)
			{
				if (other->GetResourceType() != ball->GetResourceType() || group.Contains(other))
					continue;

				Vec2F otherPos = other->GetActor()->transform->GetWorldPosition2D();
				if ((otherPos - currentPos).SqrLength() > maxDistanceSqr)
					continue;

				group.Add(other);
				nextWave.Add(other);
			}
		}

		wave = nextWave;
	}

	return group;
}

bool GlassField::PopGroup(const Ref<ResourceBall>& ball)
{
	auto group = CollectGroup(ball);
	if (group.Count() < 2)
		return false;

	String type = ball->GetResourceType();
	for (auto& member : group)
		o2Scene.DestroyActor(member->GetActor());

	onGroupPopped(type, group.Count());
	return true;
}

void GlassField::OnUpdate(float dt)
{
	mSpawnTimer += dt;
	if (mSpawnTimer < mSpawnDelay)
		return;

	mSpawnTimer = 0.0f;
	for (int i = 0; i < mSpawnPerTick; i++)
		TrySpawn();
}

void GlassField::TrySpawn()
{
	if (!mBallsContainer || mColors.IsEmpty() || GetBallCount() >= mMaxBalls)
		return;

	Vec2F position;
	if (!FindFreeSpawnPosition(position))
		return;

	SpawnBall(mColors[Math::Random(0, mColors.Count() - 1)], position);
}

bool GlassField::FindFreeSpawnPosition(Vec2F& result) const
{
	RectF zone = GetSpawnZone();
	float clearance = mBallRadius*2.2f;
	float clearanceSqr = clearance*clearance;

	Vector<Vec2F> occupied;
	for (auto& child : mBallsContainer->GetChildren())
		occupied.Add(child->transform->GetPosition2D());

	for (int attempt = 0; attempt < 8; attempt++)
	{
		Vec2F candidate(Math::Random(zone.left, zone.right), Math::Random(zone.bottom, zone.top));

		bool free = true;
		for (auto& point : occupied)
		{
			if ((point - candidate).SqrLength() < clearanceSqr)
			{
				free = false;
				break;
			}
		}

		if (free)
		{
			result = candidate;
			return true;
		}
	}

	return false;
}

DECLARE_TEMPLATE_CLASS(o2::LinkRef<GlassField>);
// --- META ---

DECLARE_CLASS(GlassField, GlassField);
// --- END META ---
