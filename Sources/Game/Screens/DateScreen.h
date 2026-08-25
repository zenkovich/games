#pragma once

#include "Screens/Screen.h"
#include "o2/Scene/UI/Widgets/Button.h"
#include "o2/Scene/UI/Widgets/Image.h"
#include "o2/Scene/UI/Widgets/Label.h"

// Date scene: the location art, the NPC and the story lines shown one tap at a time
class DateScreen: public Screen
{
public:
	using Screen::Screen;

	void SetScene(const String& npcId, const String& spotId, const Vector<String>& lines);

	const String& GetNpc() const;
	int GetLineIndex() const;
	Ref<Button> GetNextButton() const;

	void Refresh() override;

protected:
	void Build() override;

private:
	String         mNpc;
	String         mSpot;
	Vector<String> mLines;
	int            mLineIndex = 0;

	Ref<Image>  mBackground;
	Ref<Image>  mPortrait;
	Ref<Label>  mTitle;
	Ref<Label>  mText;
	Ref<Button> mNextButton;

private:
	void Next();
};
