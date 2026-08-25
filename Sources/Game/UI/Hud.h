#pragma once

#include "Core/GameModel.h"
#include "o2/Scene/UI/Widget.h"
#include "o2/Scene/UI/Widgets/Label.h"

using namespace o2;

// Top bar shared by the screens: coins, population with the sell multiplier, city level and XP
class Hud: public RefCounterable
{
public:
	Ref<Widget> Build();
	void Refresh(const Ref<GameModel>& model);

	const Ref<Widget>& GetRoot() const;

private:
	Ref<Widget> mRoot;
	Ref<Label>  mCoins;
	Ref<Label>  mPopulation;
	Ref<Label>  mMultiplier;
	Ref<Label>  mLevel;
	Ref<Widget> mXpBar;
};
