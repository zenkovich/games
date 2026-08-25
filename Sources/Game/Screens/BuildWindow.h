#pragma once

#include "Screens/Screen.h"
#include "o2/Scene/UI/Widgets/Button.h"
#include "o2/Scene/UI/Widgets/Image.h"
#include "o2/Scene/UI/Widgets/Label.h"

// Construction menu for one empty slot
class BuildWindow: public Screen
{
public:
	using Screen::Screen;

	void SetSlot(int slot);
	int GetSlot() const;

	void Refresh() override;

	Ref<Button> GetBuildButton(const String& id) const;
	Ref<Button> GetCloseButton() const;

protected:
	void Build() override;

private:
	struct Card
	{
		String      id;
		Ref<Widget> root;
		Ref<Image>  icon;
		Ref<Label>  name;
		Ref<Label>  cost;
		Ref<Label>  effect;
		Ref<Label>  blocker;
		Ref<Button> build;
	};

	int          mSlot = 0;
	Vector<Card> mCards;
	Ref<Label>   mTitle;
	Ref<Button>  mCloseButton;
};
