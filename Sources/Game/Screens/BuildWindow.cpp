#include "o2/stdafx.h"
#include "Screens/BuildWindow.h"

#include "ColorTownGame.h"
#include "UI/UIKit.h"

using namespace UI;

namespace
{
	const int kMaxCards = 10;
	const Vec2F kPanelSize(1000, 1700);
	const Vec2F kCardSize(470, 290);
	const float kGridTop = 560.0f;
}

void BuildWindow::Build()
{
	auto game = Game();

	mUI->AddChildWidget(MakeDim("Dim", [game] { game->CloseWindow(); }));
	mUI->AddChildWidget(MakePanel("Panel", kCenter, Vec2F(0, -20), kPanelSize));

	mTitle = MakeLabel("Title", "Build", kCenter, Vec2F(0, 760), Vec2F(800, 70), 52, kTextDark, true);
	if (mTitle)
		mUI->AddChildWidget(mTitle);

	mCloseButton = MakeButton("CloseButton", "X", "gray", kCenter, Vec2F(440, 770), Vec2F(90, 90), [game] { game->CloseWindow(); }, 40);
	mUI->AddChildWidget(mCloseButton);

	for (int i = 0; i < kMaxCards; i++)
	{
		Card card;
		Vec2F pos((i % 2 == 0 ? -245.0f : 245.0f), kGridTop - (i/2)*(kCardSize.y + 8));

		card.root = MakePanel("Card" + (String)i, kCenter, pos, kCardSize, "UI/card.png");
		mUI->AddChildWidget(card.root);

		card.icon = MakeImage("Icon", "", kCenter, Vec2F(-165, 45), Vec2F(120, 120));
		card.root->AddChildWidget(card.icon);

		card.name = MakeLabel("Name", "", kCenter, Vec2F(60, 108), Vec2F(330, 40), 30, kTextDark, true, HorAlign::Left);
		if (card.name)
			card.root->AddChildWidget(card.name);
		card.cost = MakeLabel("Cost", "", kCenter, Vec2F(60, 62), Vec2F(330, 56), 22, kTextDark, false, HorAlign::Left);
		if (card.cost)
			card.root->AddChildWidget(card.cost);
		card.effect = MakeLabel("Effect", "", kCenter, Vec2F(60, 8), Vec2F(330, 50), 22, kTextGood, false, HorAlign::Left);
		if (card.effect)
			card.root->AddChildWidget(card.effect);
		card.blocker = MakeLabel("Blocker", "", kCenter, Vec2F(0, -95), Vec2F(440, 40), 24, kTextBad);
		if (card.blocker)
			card.root->AddChildWidget(card.blocker);

		card.build = MakeButton("Build", "Build", "green", kCenter, Vec2F(0, -95), Vec2F(300, 70), [this, game, i] {
			auto& card = mCards[i];
			if (Model()->Call<bool>("Build", mSlot, card.id))
			{
				game->Notify("Building " + Model()->GetString("GetBuildingName", card.id));
				game->CloseWindow();
				game->RefreshAll();
			}
		}, 30);
		card.root->AddChildWidget(card.build);

		mCards.Add(card);
	}
}

void BuildWindow::SetSlot(int slot)
{
	mSlot = slot;
}

int BuildWindow::GetSlot() const
{
	return mSlot;
}

void BuildWindow::Refresh()
{
	auto model = Model();
	auto ids = model->GetStrings("GetBuildableIds");

	SetText(mTitle, "Build on lot " + (String)(mSlot + 1));

	for (int i = 0; i < mCards.Count(); i++)
	{
		auto& card = mCards[i];
		if (i >= ids.Count())
		{
			card.root->SetEnabledForcible(false);
			continue;
		}

		card.root->SetEnabledForcible(true);
		if (card.id != ids[i])
		{
			card.id = ids[i];
			SetImage(card.icon, "Buildings/" + card.id + ".png");
		}

		SetText(card.name, model->GetString("GetBuildingName", card.id));

		String cost = (String)model->GetInt("GetBuildCost", card.id) + " coins";
		for (auto& item : model->GetStrings("GetBuildItemIds", card.id))
			cost += " + " + (String)model->GetInt("GetBuildItemCount", card.id, item) + " " + model->GetString("GetItemName", item);
		SetText(card.cost, cost);

		String effect;
		int tier = model->GetInt("GetBuildingTier", card.id);
		if (tier == 2)
			effect = "Crafts goods";
		else if (tier == 3)
			effect = "+" + (String)model->GetInt("GetBuildingPopulation", card.id) + " population";
		else
			effect = "+" + (String)model->GetInt("GetBuildingBeauty", card.id) + " beauty" + (model->GetBool("IsDateSpot", card.id) ? ", date spot" : "");
		int needBeauty = model->GetInt("GetBuildingNeedBeauty", card.id);
		if (needBeauty > 0)
			effect += ", needs beauty " + (String)needBeauty;
		SetText(card.effect, effect);

		String blocker = model->GetString("GetBuildBlocker", card.id);
		SetText(card.blocker, blocker);
		if (card.blocker)
			card.blocker->SetEnabledForcible(!blocker.IsEmpty());
		card.build->SetEnabledForcible(blocker.IsEmpty());
		SetCaption(card.build, (WString)("Build " + Seconds((float)model->GetInt("GetBuildTime", card.id))));
	}
}

Ref<Button> BuildWindow::GetBuildButton(const String& id) const
{
	for (auto& card : mCards)
	{
		if (card.id == id && card.root->IsEnabled())
			return card.build;
	}

	return nullptr;
}

Ref<Button> BuildWindow::GetCloseButton() const
{
	return mCloseButton;
}
