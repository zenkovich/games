#include "o2/stdafx.h"
#include "UI/Hud.h"

#include "UI/UIKit.h"

using namespace UI;

Ref<Widget> Hud::Build()
{
	mRoot = MakeContainer("Hud", Vec2F(0.5f, 1.0f), Vec2F(0, -70), Vec2F(kDesignSize.x, 140));

	auto coinsPanel = MakePanel("CoinsPanel", kCenter, Vec2F(-330, 0), Vec2F(340, 90));
	mRoot->AddChildWidget(coinsPanel);
	mRoot->AddChildWidget(MakeImage("CoinIcon", "UI/icon_coin.png", kCenter, Vec2F(-460, 0), Vec2F(80, 80)));
	mCoins = MakeLabel("Coins", "0", kCenter, Vec2F(-290, 0), Vec2F(230, 80), 46, kTextDark, true);
	if (mCoins)
		mRoot->AddChildWidget(mCoins);

	auto peoplePanel = MakePanel("PeoplePanel", kCenter, Vec2F(40, 0), Vec2F(340, 90));
	mRoot->AddChildWidget(peoplePanel);
	mRoot->AddChildWidget(MakeImage("PeopleIcon", "UI/icon_people.png", kCenter, Vec2F(-90, 0), Vec2F(80, 80)));
	mPopulation = MakeLabel("Population", "0", kCenter, Vec2F(40, 12), Vec2F(200, 60), 40, kTextDark, true);
	if (mPopulation)
		mRoot->AddChildWidget(mPopulation);
	mMultiplier = MakeLabel("Multiplier", "x1.0", kCenter, Vec2F(40, -26), Vec2F(200, 40), 26, kTextGood);
	if (mMultiplier)
		mRoot->AddChildWidget(mMultiplier);

	auto levelPanel = MakePanel("LevelPanel", kCenter, Vec2F(380, 0), Vec2F(300, 90));
	mRoot->AddChildWidget(levelPanel);
	mRoot->AddChildWidget(MakeImage("StarIcon", "UI/icon_star.png", kCenter, Vec2F(270, 0), Vec2F(80, 80)));
	mLevel = MakeLabel("Level", "1", kCenter, Vec2F(270, -2), Vec2F(80, 60), 30, kTextDark, true);
	if (mLevel)
		mRoot->AddChildWidget(mLevel);
	mXpBar = MakeProgress("XpBar", kCenter, Vec2F(400, 0), Vec2F(180, 34), "UI/bar_fill_green.png");
	mRoot->AddChildWidget(mXpBar);

	return mRoot;
}

void Hud::Refresh(const Ref<GameModel>& model)
{
	SetText(mCoins, (String)model->GetInt("GetCoins"));
	SetText(mPopulation, (String)model->GetInt("GetPopulation"));

	float mult = model->GetFloat("GetMultiplier");
	SetText(mMultiplier, "x" + Decimal(mult));

	int level = model->GetInt("GetCityLevel");
	SetText(mLevel, (String)(level + 1));

	int xp = model->GetInt("GetXp");
	int next = model->GetInt("GetNextLevelXp");
	float progress = next > 0 ? (float)xp/(float)next : 1.0f;
	SetProgress(mXpBar, progress);
}

const Ref<Widget>& Hud::GetRoot() const
{
	return mRoot;
}
