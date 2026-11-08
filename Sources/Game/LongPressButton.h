#pragma once

#include "o2/Scene/UI/Widgets/Button.h"

using namespace o2;

// Button that tells a long press from a click: held for longPressTime seconds it calls
// onLongPress, and the release after it is not a click (hidden debug entries, hold-to-confirm)
class LongPressButton: public Button
{
public:
	float longPressTime = 0.7f; // Holding time in seconds that counts as a long press @SERIALIZABLE @EDITOR_PROPERTY

	Function<void()> onLongPress; // Long press event @SCRIPTABLE @EDITOR_IGNORE

public:
	// Default constructor @SCRIPTABLE
	LongPressButton(RefCounter* refCounter);

	// Copy-constructor
	LongPressButton(RefCounter* refCounter, const LongPressButton& other);

	// Assign operator
	LongPressButton& operator=(const LongPressButton& other);

	// Counts the holding time and fires onLongPress
	void Update(float dt) override;

	SERIALIZABLE(LongPressButton);
	CLONEABLE_REF(LongPressButton);

protected:
	float mHoldTime = -1.0f;    // Time the current press is held, negative when not pressed
	bool  mLongPressed = false; // The current press has already fired onLongPress

protected:
	// Called when cursor pressed on this; starts counting the holding time
	void OnCursorPressed(const Input::Cursor& cursor) override;

	// Called when cursor released; a release after a long press is not a click
	void OnCursorReleased(const Input::Cursor& cursor) override;

	// Called when cursor pressing was broken; stops counting
	void OnCursorPressBreak(const Input::Cursor& cursor) override;

	REF_COUNTERABLE_IMPL(Widget);
};
// --- META ---

CLASS_BASES_META(LongPressButton)
{
    BASE_CLASS(Button);
}
END_META;
CLASS_FIELDS_META(LongPressButton)
{
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(0.7f).NAME(longPressTime);
    FIELD().PUBLIC().EDITOR_IGNORE_ATTRIBUTE().SCRIPTABLE_ATTRIBUTE().NAME(onLongPress);
    FIELD().PROTECTED().DEFAULT_VALUE(-1.0f).NAME(mHoldTime);
    FIELD().PROTECTED().DEFAULT_VALUE(false).NAME(mLongPressed);
}
END_META;
CLASS_METHODS_META(LongPressButton)
{

    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().CONSTRUCTOR(RefCounter*);
    FUNCTION().PUBLIC().CONSTRUCTOR(RefCounter*, const LongPressButton&);
    FUNCTION().PUBLIC().SIGNATURE(void, Update, float);
    FUNCTION().PROTECTED().SIGNATURE(void, OnCursorPressed, const Input::Cursor&);
    FUNCTION().PROTECTED().SIGNATURE(void, OnCursorReleased, const Input::Cursor&);
    FUNCTION().PROTECTED().SIGNATURE(void, OnCursorPressBreak, const Input::Cursor&);
}
END_META;
// --- END META ---
