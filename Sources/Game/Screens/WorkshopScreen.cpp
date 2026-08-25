#include "o2/stdafx.h"
#include "Screens/WorkshopScreen.h"

#include "ColorTownGame.h"
#include "UI/UIKit.h"
#include "o2/Render/Render.h"
#include "o2/Scene/Components/ImageComponent.h"

using namespace UI;

namespace
{
	const int kMaxCards = 3;
	const Vec2F kCardSize(980, 300);
	const float kCardsTop = 330.0f;
	const float kCardsStep = 330.0f;
}

void WorkshopScreen::Build()
{
	auto game = Game();

	auto back = mmake<Actor>(ActorCreateMode::InScene);
	back->SetName("Background");
	back->transform->SetSize2D(kDesignSize);
	if (Render::IsSingletonInitialzed())
	{
		auto image = mmake<ImageComponent>(String("Backgrounds/glass.png"));
		image->SetColor(Color4(200, 210, 230));
		back->AddComponent(image);
	}
	back->SetParent(mRoot, false);
	back->transform->SetPosition2D(Vec2F());
	back->SetIndexInSiblings(0);

	mBuildingImage = MakeImage("BuildingImage", "", kCenter, Vec2F(-340, 660), Vec2F(300, 300));
	mUI->AddChildWidget(mBuildingImage);
	mTitle = MakeLabel("Title", "", kCenter, Vec2F(150, 700), Vec2F(600, 80), 64, kTextLight, true);
	if (mTitle)
		mUI->AddChildWidget(mTitle);
	if (auto subtitle = MakeLabel("Subtitle", "Orders", kCenter, Vec2F(150, 620), Vec2F(600, 50), 36, kTextLight, true))
		mUI->AddChildWidget(subtitle);

	for (int i = 0; i < kMaxCards; i++)
	{
		OrderCard card;
		Vec2F pos(0, kCardsTop - i*kCardsStep);

		card.root = MakePanel("Card" + (String)i, kCenter, pos, kCardSize, "UI/card.png");
		mUI->AddChildWidget(card.root);

		card.icon = MakeImage("Icon", "", kCenter, Vec2F(-380, 0), Vec2F(170, 170));
		card.root->AddChildWidget(card.icon);

		card.name = MakeLabel("Name", "", kCenter, Vec2F(-10, 100), Vec2F(560, 50), 36, kTextDark, true, HorAlign::Left);
		if (card.name)
			card.root->AddChildWidget(card.name);

		card.inputs = MakeLabel("Inputs", "", kCenter, Vec2F(-50, 40), Vec2F(480, 44), 26, kTextDark, false, HorAlign::Left);
		if (card.inputs)
			card.root->AddChildWidget(card.inputs);

		card.price = MakeLabel("Price", "", kCenter, Vec2F(-10, -10), Vec2F(560, 44), 26, kTextGood, false, HorAlign::Left);
		if (card.price)
			card.root->AddChildWidget(card.price);

		card.craft = MakeButton("Craft", "Craft", "green", kCenter, Vec2F(340, 45), Vec2F(240, 90), [this, i, game] {
			auto& card = mCards[i];
			if (Model()->Call<bool>("StartCraft", card.good))
				game->RefreshAll();
		}, 34);
		card.root->AddChildWidget(card.craft);

		card.sell = MakeButton("Sell", "Sell", "blue", kCenter, Vec2F(340, -60), Vec2F(240, 80), [this, i, game] {
			auto& card = mCards[i];
			auto model = Model();
			int earned = model->Call<int>("Sell", card.good, model->GetInt("GetItem", card.good));
			if (earned > 0)
				game->Notify("Sold for " + (String)earned + " coins");
			game->RefreshAll();
		}, 30);
		card.root->AddChildWidget(card.sell);

		mCards.Add(card);
	}

	mBackButton = MakeIconButton("BackButton", "UI/btn_back.png", Vec2F(0.0f, 0.0f), Vec2F(90, 90), Vec2F(120, 120),
								 [game] { game->ShowCity(); });
	mUI->AddChildWidget(mBackButton);
}

void WorkshopScreen::SetBuilding(const String& buildingId)
{
	mBuilding = buildingId;
}

const String& WorkshopScreen::GetBuilding() const
{
	return mBuilding;
}

void WorkshopScreen::Refresh()
{
	auto model = Model();

	SetImage(mBuildingImage, "Buildings/" + mBuilding + ".png");
	SetText(mTitle, model->GetString("GetBuildingName", mBuilding));

	auto recipes = model->GetStrings("GetRecipes", mBuilding);
	String crafting = model->GetString("GetCraftGood", mBuilding);
	float mult = model->GetFloat("GetMultiplier");

	for (int i = 0; i < mCards.Count(); i++)
	{
		auto& card = mCards[i];
		if (i >= recipes.Count())
		{
			card.root->SetEnabledForcible(false);
			continue;
		}

		card.root->SetEnabledForcible(true);
		if (card.good != recipes[i])
		{
			card.good = recipes[i];
			SetImage(card.icon, "Goods/" + card.good + ".png");
		}

		SetText(card.name, model->GetString("GetGoodName", card.good));

		String inputs;
		bool enough = true;
		for (auto& res : model->GetStrings("GetGoodInputIds", card.good))
		{
			int need = model->GetInt("GetGoodInputCount", card.good, res);
			int have = model->GetInt("GetItem", res);
			if (have < need)
				enough = false;
			if (!inputs.IsEmpty())
				inputs += "   ";
			inputs += model->GetString("GetItemName", res) + " " + (String)have + "/" + (String)need;
		}
		SetText(card.inputs, inputs);
		if (card.inputs)
			card.inputs->SetColor(enough ? kTextDark : kTextBad);

		int stock = model->GetInt("GetItem", card.good);
		SetText(card.price, "Price " + (String)model->GetInt("GetSellPrice", card.good) +
				(mult > 1.01f ? " (x" + Decimal(mult) + ")" : String("")) + "  Stock " + (String)stock +
				(model->GetBool("IsGoodPremium", card.good) ? String("  Premium gift") : String("")));

		if (crafting == card.good)
		{
			SetCaption(card.craft, (WString)Seconds(model->GetFloat("GetCraftTimeLeft", mBuilding)));
			SetEnabled(card.craft, false);
		}
		else
		{
			SetCaption(card.craft, (WString)("Craft " + Seconds((float)model->GetInt("GetGoodTime", card.good))));
			SetEnabled(card.craft, model->GetBool("CanCraft", card.good));
		}

		SetCaption(card.sell, (WString)("Sell " + (String)stock));
		SetEnabled(card.sell, stock > 0);
	}
}

void WorkshopScreen::Update(float dt)
{
	mTimerRefresh += dt;
	if (mTimerRefresh < 0.5f)
		return;

	mTimerRefresh = 0.0f;
	if (Model()->GetBool("IsCrafting", mBuilding))
		Refresh();
}

Ref<Button> WorkshopScreen::GetCraftButton(int index) const
{
	return index >= 0 && index < mCards.Count() ? mCards[index].craft : nullptr;
}

Ref<Button> WorkshopScreen::GetSellButton(int index) const
{
	return index >= 0 && index < mCards.Count() ? mCards[index].sell : nullptr;
}

Ref<Button> WorkshopScreen::GetBackButton() const
{
	return mBackButton;
}
