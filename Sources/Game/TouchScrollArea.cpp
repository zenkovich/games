#include "o2/stdafx.h"
#include "TouchScrollArea.h"

#include "o2/Scene/UI/WidgetLayout.h"
#include "o2/Utils/System/Time/Time.h"

TouchScrollArea::TouchScrollArea(RefCounter* refCounter):
	ScrollArea(refCounter)
{}

TouchScrollArea::TouchScrollArea(RefCounter* refCounter, const TouchScrollArea& other):
	ScrollArea(refCounter, other), dragThreshold(other.dragThreshold), horizontal(other.horizontal),
	vertical(other.vertical)
{}

TouchScrollArea& TouchScrollArea::operator=(const TouchScrollArea& other)
{
	ScrollArea::operator=(other);
	dragThreshold = other.dragThreshold;
	horizontal = other.horizontal;
	vertical = other.vertical;
	return *this;
}

bool TouchScrollArea::IsDragging() const
{
	return mDragging;
}

void TouchScrollArea::ScrollToStart()
{
	mScrollSpeed = Vec2F();
	ResetScroll();
}

void TouchScrollArea::ScrollBy(float x, float y)
{
	mScrollSpeed = Vec2F();
	SetScroll(mScrollPos + Vec2F(x, y));
}

String TouchScrollArea::GetScrollDebug() const
{
	String res = "scroll " + (String)mScrollPos + " range " + (String)mScrollRange + " area " + (String)mScrollArea +
		" view " + (String)mAbsoluteViewArea;
	for (auto& child : mChildWidgets)
		res += " | " + child->GetName() + " world " + (String)child->layout->GetWorldRect();
	return res;
}

bool TouchScrollArea::IsInputTransparent() const
{
	// the events layer breaks the presses under a non-transparent listener: the dragged button won't click
	return !mDragging && ScrollArea::IsInputTransparent();
}

void TouchScrollArea::OnCursorPressed(const Input::Cursor& cursor)
{
	mPressedCursor = true;
	mPressedCursorPos = cursor.position;
	mDragging = false;
	mDragSpeed = Vec2F();
	mScrollSpeed = Vec2F();
}

void TouchScrollArea::OnCursorStillDown(const Input::Cursor& cursor)
{
	if (!mDragging)
	{
		if ((cursor.position - mPressedCursorPos).Length() < dragThreshold)
			return;

		mDragging = true;
	}

	// content follows the cursor: scroll grows to the right and down
	Vec2F delta(horizontal ? -cursor.delta.x : 0.0f, vertical ? cursor.delta.y : 0.0f);
	if (delta != Vec2F())
		SetScroll(mScrollPos + delta);

	float dt = o2Time.GetDeltaTime();
	if (dt > FLT_EPSILON)
		mDragSpeed = mDragSpeed*0.5f + delta/dt*0.5f;
}

void TouchScrollArea::OnCursorReleased(const Input::Cursor& cursor)
{
	mPressedCursor = false;
	if (mDragging)
		mScrollSpeed = mDragSpeed;

	mDragging = false;
}

void TouchScrollArea::OnCursorPressBreak(const Input::Cursor& cursor)
{
	mPressedCursor = false;
	mDragging = false;
}

void TouchScrollArea::CalculateScrollArea()
{
	// the base sums the children boxes minus the scroll and keeps stale boxes of the clipped ones:
	// the range shrank while scrolling and the far end was unreachable
	Vec2F offset;
	InitializeScrollAreaRectCalculation(offset);

	Vec2F view = mAbsoluteViewArea.Size();
	for (auto& child : mChildWidgets)
	{
		if (!child->IsEnabledInHierarchy())
			continue;

		auto childLayout = child->layout;
		RectF rect;
		rect.left = childLayout->GetAnchorMin().x*view.x + childLayout->GetOffsetMin().x;
		rect.right = childLayout->GetAnchorMax().x*view.x + childLayout->GetOffsetMax().x;
		rect.bottom = childLayout->GetAnchorMin().y*view.y + childLayout->GetOffsetMin().y;
		rect.top = childLayout->GetAnchorMax().y*view.y + childLayout->GetOffsetMax().y;
		RecalculateScrollAreaRect(rect, Vec2F());
	}
}

void TouchScrollArea::OnScrolled(float scroll)
{
	mScrollSpeed = Vec2F();
	if (vertical)
		SetScroll(mScrollPos + Vec2F(0.0f, -scroll));
	else if (horizontal)
		SetScroll(mScrollPos + Vec2F(-scroll, 0.0f));
}
// --- META ---

DECLARE_CLASS(TouchScrollArea, TouchScrollArea);
// --- END META ---
