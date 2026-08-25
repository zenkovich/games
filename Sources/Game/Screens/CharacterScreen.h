#pragma once

#include "Screens/Screen.h"
#include "o2/Scene/UI/Widgets/Button.h"
#include "o2/Scene/UI/Widgets/Image.h"
#include "o2/Scene/UI/Widgets/Label.h"

// Affinity screen of one NPC with tabs for the others; gifts and dates are chosen right here
class CharacterScreen: public Screen
{
public:
	enum class Mode { None, Gift, Date };

	using Screen::Screen;

	void SetNpc(const String& npcId);
	const String& GetNpc() const;

	void SetMode(Mode mode);
	Mode GetMode() const;

	void Refresh() override;

	Ref<Button> GetGiftButton() const;
	Ref<Button> GetDateButton() const;
	Ref<Button> GetOptionButton(int index) const;
	Ref<Button> GetTabButton(int index) const;
	Ref<Button> GetBackButton() const;

protected:
	void Build() override;

private:
	String mNpc;
	Mode   mMode = Mode::None;

	Vector<Pair<String, Ref<Button>>> mTabs;
	Vector<Ref<Image>> mTabRings;

	Ref<Image>  mPortrait;
	Ref<Label>  mName;
	Ref<Label>  mTitle;
	Vector<Ref<Image>> mHearts;
	Ref<Label>  mAffinity;
	Ref<Widget> mAffinityBar;
	Ref<Label>  mBuff;

	Ref<Button> mGiftButton;
	Ref<Button> mDateButton;
	Ref<Label>  mOptionsTitle;
	Ref<Label>  mOptionsHint;
	Vector<Ref<Button>> mOptions;
	Ref<Button> mBackButton;

private:
	void RefreshOptions();
};
// --- META ---

PRE_ENUM_META(CharacterScreen::Mode);
// --- END META ---
