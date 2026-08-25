#pragma once

#include "Screens/Screen.h"
#include "o2/Scene/UI/Widgets/Button.h"
#include "o2/Scene/UI/Widgets/Image.h"
#include "o2/Scene/UI/Widgets/Label.h"

// Storage window: every resource and good with its count; goods sell from here
class WarehouseWindow: public Screen
{
public:
	using Screen::Screen;

	void Refresh() override;

	Ref<Button> GetSellButton(const String& good) const;
	Ref<Button> GetCloseButton() const;
	Ref<Button> GetUpgradeButton() const;

protected:
	void Build() override;

private:
	struct Cell
	{
		String      item;
		Ref<Widget> root;
		Ref<Image>  icon;
		Ref<Label>  name;
		Ref<Label>  count;
		Ref<Button> sell;
	};

	Vector<Cell> mCells;
	Ref<Label>   mTitle;
	Ref<Button>  mUpgradeButton;
	Ref<Button>  mCloseButton;
};
