#pragma once

#include "Screens/Screen.h"
#include "o2/Scene/UI/Widgets/Button.h"
#include "o2/Scene/UI/Widgets/Label.h"

// The town map: four tier 1 buildings, eight construction slots and the bottom bar
class CityScreen: public Screen
{
public:
	using Screen::Screen;

	void Refresh() override;
	void Update(float dt) override;

	Ref<Button> GetTier1Button(const String& id) const;
	Ref<Button> GetSlotButton(int slot) const;

	static Vec2F GetTier1Position(const String& id);
	static Vec2F GetSlotPosition(int slot);

protected:
	void Build() override;

private:
	struct SlotView
	{
		Ref<Button> button;
		Ref<Label>  label;
		String      shownImage;
	};

	Vector<Pair<String, Ref<Button>>> mTier1Buttons;
	Vector<Pair<String, Ref<Label>>>  mTier1Levels;
	Vector<SlotView>                  mSlots;
	float                             mTimerRefresh = 0.0f;

private:
	void SetSlotImage(SlotView& slot, const String& imagePath, float transparency);
};
