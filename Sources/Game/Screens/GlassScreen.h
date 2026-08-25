#pragma once

#include "Core/GlassField.h"
#include "Screens/Screen.h"
#include "o2/Scene/UI/Widgets/Button.h"
#include "o2/Scene/UI/Widgets/Image.h"
#include "o2/Scene/UI/Widgets/Label.h"

// Tier 1 building: the NPC header, the physics glass with the resource balls and the counters
class GlassScreen: public Screen
{
public:
	using Screen::Screen;

	void SetBuilding(const String& buildingId);
	const String& GetBuilding() const;

	Ref<GlassField> GetField() const;
	Ref<Button> GetBackButton() const;
	Ref<Button> GetUpgradeButton() const;

	// Local field position inside the screen
	static Vec2F GetFieldPosition();

	void Refresh() override;
	void Update(float dt) override;

protected:
	void Build() override;
	void OnShown() override;
	void OnHidden() override;

private:
	String mBuilding;

	Ref<Actor>      mFieldActor;
	Ref<GlassField> mField;

	Ref<Image>  mPortrait;
	Ref<Label>  mNpcName;
	Ref<Label>  mNpcTitle;
	Ref<Label>  mBuildingLabel;
	Ref<Label>  mUpgradeHint;
	Ref<Button> mUpgradeButton;
	Ref<Button> mBackButton;
	Vector<Ref<Image>> mHearts;

	struct Counter
	{
		Ref<Image> icon;
		Ref<Label> label;
		String     type;
	};
	Vector<Counter> mCounters;

	Vector<Pair<Ref<Label>, float>> mPopups;

private:
	void RebuildField();
	void OnGroupPopped(const String& type, int count);
};
