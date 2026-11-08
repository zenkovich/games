#include "o2/stdafx.h"
#include "LongPressButton.h"

LongPressButton::LongPressButton(RefCounter* refCounter):
	Button(refCounter)
{}

LongPressButton::LongPressButton(RefCounter* refCounter, const LongPressButton& other):
	Button(refCounter, other), longPressTime(other.longPressTime)
{}

LongPressButton& LongPressButton::operator=(const LongPressButton& other)
{
	Button::operator=(other);
	longPressTime = other.longPressTime;
	return *this;
}

void LongPressButton::Update(float dt)
{
	Button::Update(dt);

	if (mHoldTime < 0.0f || mLongPressed)
		return;

	mHoldTime += dt;
	if (mHoldTime >= longPressTime)
	{
		mLongPressed = true;
		onLongPress();
	}
}

void LongPressButton::OnCursorPressed(const Input::Cursor& cursor)
{
	Button::OnCursorPressed(cursor);
	mHoldTime = 0.0f;
	mLongPressed = false;
}

void LongPressButton::OnCursorReleased(const Input::Cursor& cursor)
{
	mHoldTime = -1.0f;
	if (mLongPressed)
		Button::OnCursorPressBreak(cursor);
	else
		Button::OnCursorReleased(cursor);
}

void LongPressButton::OnCursorPressBreak(const Input::Cursor& cursor)
{
	mHoldTime = -1.0f;
	Button::OnCursorPressBreak(cursor);
}
// --- META ---

DECLARE_CLASS(LongPressButton, LongPressButton);
// --- END META ---
