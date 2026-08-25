#pragma once

#include "Screens/Screen.h"
#include "o2/Scene/UI/Widgets/Button.h"
#include "o2/Scene/UI/Widgets/Image.h"
#include "o2/Scene/UI/Widgets/Label.h"

// Tier 2 workshop: the active order list of the building
class WorkshopScreen: public Screen
{
public:
	using Screen::Screen;

	void SetBuilding(const String& buildingId);
	const String& GetBuilding() const;

	void Refresh() override;
	void Update(float dt) override;

	Ref<Button> GetCraftButton(int index) const;
	Ref<Button> GetSellButton(int index) const;
	Ref<Button> GetBackButton() const;

protected:
	void Build() override;

private:
	struct OrderCard
	{
		Ref<Widget> root;
		Ref<Image>  icon;
		Ref<Label>  name;
		Ref<Label>  inputs;
		Ref<Label>  price;
		Ref<Button> craft;
		Ref<Button> sell;
		String      good;
	};

	String mBuilding;

	Ref<Image>  mBuildingImage;
	Ref<Label>  mTitle;
	Ref<Button> mBackButton;
	Vector<OrderCard> mCards;
	float mTimerRefresh = 0.0f;
};
