#include "o2/stdafx.h"
#include "Core/ResourceBall.h"

#include "o2/Scene/Actor.h"
#include "o2/Scene/Components/ImageComponent.h"

void ResourceBall::SetResourceType(const String& type)
{
	mType = type;
}

const String& ResourceBall::GetResourceType() const
{
	return mType;
}

void ResourceBall::SetRadius(float radius)
{
	mRadius = radius;
}

float ResourceBall::GetRadius() const
{
	return mRadius;
}

bool ResourceBall::IsUnderPoint(const Vec2F& point)
{
	auto owner = mOwner.Lock();
	if (!owner)
		return false;

	return (owner->transform->GetWorldPosition2D() - point).SqrLength() <= mRadius*mRadius;
}

void ResourceBall::OnStart()
{
	// The listener is registered for cursor events on each draw; no image means no taps (headless)
	if (auto image = mOwner.Lock()->GetComponent<ImageComponent>())
		image->onDraw = [this] { OnDrawn(); };
}

void ResourceBall::OnCursorReleased(const Input::Cursor& cursor)
{
	if (!IsUnderPoint(cursor.position))
		return;

	onTap(Ref(this));
}

DECLARE_TEMPLATE_CLASS(o2::LinkRef<ResourceBall>);
// --- META ---

DECLARE_CLASS(ResourceBall, ResourceBall);
// --- END META ---
