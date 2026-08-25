#pragma once

#include "o2/Events/CursorAreaEventsListener.h"
#include "o2/Scene/Component.h"
#include "o2/Utils/Function/Function.h"

using namespace o2;

// One colored ball inside a glass field: carries its resource type and reports taps
class ResourceBall: public Component, public CursorAreaEventsListener
{
public:
	Function<void(const Ref<ResourceBall>&)> onTap;

public:
	void SetResourceType(const String& type);
	const String& GetResourceType() const;

	void SetRadius(float radius);
	float GetRadius() const;

	bool IsUnderPoint(const Vec2F& point) override;

	void OnStart() override;

	SERIALIZABLE(ResourceBall);
	CLONEABLE_REF(ResourceBall);

private:
	String mType;           // @SERIALIZABLE
	float  mRadius = 45.0f; // @SERIALIZABLE

private:
	void OnCursorReleased(const Input::Cursor& cursor) override;

	REF_COUNTERABLE_IMPL(Component);
};
// --- META ---

CLASS_BASES_META(ResourceBall)
{
    BASE_CLASS(Component);
    BASE_CLASS(CursorAreaEventsListener);
}
END_META;
CLASS_FIELDS_META(ResourceBall)
{
    FIELD().PUBLIC().NAME(onTap);
    FIELD().PRIVATE().SERIALIZABLE_ATTRIBUTE().NAME(mType);
    FIELD().PRIVATE().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(45.0f).NAME(mRadius);
}
END_META;
CLASS_METHODS_META(ResourceBall)
{

    FUNCTION().PUBLIC().SIGNATURE(void, SetResourceType, const String&);
    FUNCTION().PUBLIC().SIGNATURE(const String&, GetResourceType);
    FUNCTION().PUBLIC().SIGNATURE(void, SetRadius, float);
    FUNCTION().PUBLIC().SIGNATURE(float, GetRadius);
    FUNCTION().PUBLIC().SIGNATURE(bool, IsUnderPoint, const Vec2F&);
    FUNCTION().PUBLIC().SIGNATURE(void, OnStart);
    FUNCTION().PRIVATE().SIGNATURE(void, OnCursorReleased, const Input::Cursor&);
}
END_META;
// --- END META ---
