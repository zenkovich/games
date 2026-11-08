#pragma once

#include "o2/Scene/UI/Widgets/ScrollArea.h"

using namespace o2;

// Scroll area dragged by a finger or the mouse. A press passes to the buttons inside until the
// cursor travels dragThreshold: then the content follows the cursor and the press of the button
// under it is broken (no click); released, the content keeps its speed and slows down
class TouchScrollArea: public ScrollArea
{
public:
	float dragThreshold = 14.0f; // Cursor travel that turns a press into a drag @SERIALIZABLE @EDITOR_PROPERTY
	bool  horizontal = false;    // Drags scroll horizontally @SERIALIZABLE @EDITOR_PROPERTY
	bool  vertical = true;       // Drags scroll vertically @SERIALIZABLE @EDITOR_PROPERTY

public:
	// Default constructor @SCRIPTABLE
	TouchScrollArea(RefCounter* refCounter);

	// Copy-constructor
	TouchScrollArea(RefCounter* refCounter, const TouchScrollArea& other);

	// Assign operator
	TouchScrollArea& operator=(const TouchScrollArea& other);

	// Returns true while the content follows the cursor @SCRIPTABLE
	bool IsDragging() const;

	// Scrolls back to the left top corner and stops the content @SCRIPTABLE
	void ScrollToStart();

	// Scrolls by the offset: x to the right, y down @SCRIPTABLE
	void ScrollBy(float x, float y);

	// Returns the scroll position, the range and the view area as text, for checks @SCRIPTABLE
	String GetScrollDebug() const;

	// Input passes to the content until the press becomes a drag
	bool IsInputTransparent() const override;

	SERIALIZABLE(TouchScrollArea);
	CLONEABLE_REF(TouchScrollArea);

protected:
	bool  mDragging = false; // The current press drags the content
	Vec2F mDragSpeed;        // Smoothed drag speed, the content keeps it on release

protected:
	// Called when cursor pressed on this or on the content; stops the content
	void OnCursorPressed(const Input::Cursor& cursor) override;

	// Called when cursor stays down; past the threshold scrolls by the cursor movement
	void OnCursorStillDown(const Input::Cursor& cursor) override;

	// Called when cursor released; the content keeps the drag speed
	void OnCursorReleased(const Input::Cursor& cursor) override;

	// Called when cursor pressing was broken
	void OnCursorPressBreak(const Input::Cursor& cursor) override;

	// Calculates the content extents from the children layouts, not from their scrolled boxes
	void CalculateScrollArea() override;

	using ScrollArea::OnScrolled;

	// Called on the mouse wheel; scrolls the content without scroll bars
	void OnScrolled(float scroll) override;

	REF_COUNTERABLE_IMPL(Widget);
};
// --- META ---

CLASS_BASES_META(TouchScrollArea)
{
    BASE_CLASS(ScrollArea);
}
END_META;
CLASS_FIELDS_META(TouchScrollArea)
{
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(14.0f).NAME(dragThreshold);
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(false).NAME(horizontal);
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(true).NAME(vertical);
    FIELD().PROTECTED().DEFAULT_VALUE(false).NAME(mDragging);
    FIELD().PROTECTED().NAME(mDragSpeed);
}
END_META;
CLASS_METHODS_META(TouchScrollArea)
{

    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().CONSTRUCTOR(RefCounter*);
    FUNCTION().PUBLIC().CONSTRUCTOR(RefCounter*, const TouchScrollArea&);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(bool, IsDragging);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(void, ScrollToStart);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(void, ScrollBy, float, float);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(String, GetScrollDebug);
    FUNCTION().PUBLIC().SIGNATURE(bool, IsInputTransparent);
    FUNCTION().PROTECTED().SIGNATURE(void, OnCursorPressed, const Input::Cursor&);
    FUNCTION().PROTECTED().SIGNATURE(void, OnCursorStillDown, const Input::Cursor&);
    FUNCTION().PROTECTED().SIGNATURE(void, OnCursorReleased, const Input::Cursor&);
    FUNCTION().PROTECTED().SIGNATURE(void, OnCursorPressBreak, const Input::Cursor&);
    FUNCTION().PROTECTED().SIGNATURE(void, CalculateScrollArea);
    FUNCTION().PROTECTED().SIGNATURE(void, OnScrolled, float);
}
END_META;
// --- END META ---
