#pragma once

#include "Core/ResourceBall.h"
#include "o2/Scene/Component.h"
#include "o2/Scene/Physics/RigidBody.h"
#include "o2/Utils/Function/Function.h"

using namespace o2;

// ---------------------------------------------------------------------------
// The "glass" of a tier 1 building: a physics cup (static spline border) that
// keeps filling itself with colored balls from above. Tapping a ball pops the
// whole touching group of the same color (2+ balls) and reports it through
// onGroupPopped; the balls come from the prototype-free spawn in SpawnBall.
// ---------------------------------------------------------------------------
class GlassField: public Component
{
public:
	Function<void(const String& type, int count)> onGroupPopped;

public:
	// Builds the border and the balls container; size is the visible cup area
	void Setup(const Vector<String>& colors, int maxBalls, const Vec2F& size, float ballRadius);

	void SetMaxBalls(int count);
	int GetMaxBalls() const;

	const Vector<String>& GetColors() const;
	const Vec2F& GetSize() const;
	float GetBallRadius() const;

	// Spawns a ball of the type at a local position; falls under physics
	Ref<ResourceBall> SpawnBall(const String& type, const Vec2F& localPosition);

	Vector<Ref<ResourceBall>> GetBalls() const;
	int GetBallCount() const;

	// Same-typed balls reachable through touching neighbours, including the ball itself
	Vector<Ref<ResourceBall>> CollectGroup(const Ref<ResourceBall>& ball) const;

	// Pops the ball's group when it has at least two balls; returns true when popped
	bool PopGroup(const Ref<ResourceBall>& ball);

	// Spawn zone above the visible cup, in local space
	RectF GetSpawnZone() const;

	void OnUpdate(float dt) override;

	SERIALIZABLE(GlassField);
	CLONEABLE_REF(GlassField);

private:
	Vector<String> mColors;                  // @SERIALIZABLE
	int            mMaxBalls = 24;           // @SERIALIZABLE
	Vec2F          mSize = Vec2F(760, 900);  // @SERIALIZABLE
	float          mBallRadius = 45.0f;      // @SERIALIZABLE
	float          mSpawnDelay = 0.06f;      // @SERIALIZABLE
	int            mSpawnPerTick = 2;        // @SERIALIZABLE
	float          mSpawnHeight = 320.0f;    // Height of the hidden spawn shaft above the cup @SERIALIZABLE

	float mSpawnTimer = 0.0f;

	Ref<Actor> mBallsContainer;

private:
	void BuildBorder();
	void TrySpawn();
	bool FindFreeSpawnPosition(Vec2F& result) const;
};
// --- META ---

CLASS_BASES_META(GlassField)
{
    BASE_CLASS(Component);
}
END_META;
CLASS_FIELDS_META(GlassField)
{
    FIELD().PUBLIC().NAME(onGroupPopped);
    FIELD().PRIVATE().SERIALIZABLE_ATTRIBUTE().NAME(mColors);
    FIELD().PRIVATE().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(24).NAME(mMaxBalls);
    FIELD().PRIVATE().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(Vec2F(760, 900)).NAME(mSize);
    FIELD().PRIVATE().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(45.0f).NAME(mBallRadius);
    FIELD().PRIVATE().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(0.06f).NAME(mSpawnDelay);
    FIELD().PRIVATE().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(2).NAME(mSpawnPerTick);
    FIELD().PRIVATE().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(320.0f).NAME(mSpawnHeight);
    FIELD().PRIVATE().DEFAULT_VALUE(0.0f).NAME(mSpawnTimer);
    FIELD().PRIVATE().NAME(mBallsContainer);
}
END_META;
CLASS_METHODS_META(GlassField)
{

    FUNCTION().PUBLIC().SIGNATURE(void, Setup, const Vector<String>&, int, const Vec2F&, float);
    FUNCTION().PUBLIC().SIGNATURE(void, SetMaxBalls, int);
    FUNCTION().PUBLIC().SIGNATURE(int, GetMaxBalls);
    FUNCTION().PUBLIC().SIGNATURE(const Vector<String>&, GetColors);
    FUNCTION().PUBLIC().SIGNATURE(const Vec2F&, GetSize);
    FUNCTION().PUBLIC().SIGNATURE(float, GetBallRadius);
    FUNCTION().PUBLIC().SIGNATURE(Ref<ResourceBall>, SpawnBall, const String&, const Vec2F&);
    FUNCTION().PUBLIC().SIGNATURE(Vector<Ref<ResourceBall>>, GetBalls);
    FUNCTION().PUBLIC().SIGNATURE(int, GetBallCount);
    FUNCTION().PUBLIC().SIGNATURE(Vector<Ref<ResourceBall>>, CollectGroup, const Ref<ResourceBall>&);
    FUNCTION().PUBLIC().SIGNATURE(bool, PopGroup, const Ref<ResourceBall>&);
    FUNCTION().PUBLIC().SIGNATURE(RectF, GetSpawnZone);
    FUNCTION().PUBLIC().SIGNATURE(void, OnUpdate, float);
    FUNCTION().PRIVATE().SIGNATURE(void, BuildBorder);
    FUNCTION().PRIVATE().SIGNATURE(void, TrySpawn);
    FUNCTION().PRIVATE().SIGNATURE(bool, FindFreeSpawnPosition, Vec2F&);
}
END_META;
// --- END META ---
