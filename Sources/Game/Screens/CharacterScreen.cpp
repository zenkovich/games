#include "o2/stdafx.h"
#include "Screens/CharacterScreen.h"

#include "ColorTownGame.h"
#include "UI/UIKit.h"
#include "o2/Render/Render.h"
#include "o2/Scene/Components/ImageComponent.h"

using namespace UI;

namespace
{
	const int kMaxOptions = 8;
	const Vec2F kOptionSize(470, 90);
	const float kOptionsTop = -230.0f;
	const float kOptionsStep = 105.0f;
}

void CharacterScreen::Build()
{
	auto game = Game();
	auto model = Model();

	auto back = mmake<Actor>(ActorCreateMode::InScene);
	back->SetName("Background");
	back->transform->SetSize2D(kDesignSize);
	if (Render::IsSingletonInitialzed())
	{
		auto image = mmake<ImageComponent>(String("Backgrounds/glass.png"));
		image->SetColor(Color4(255, 225, 235));
		back->AddComponent(image);
	}
	back->SetParent(mRoot, false);
	back->transform->SetPosition2D(Vec2F());
	back->SetIndexInSiblings(0);

	auto npcs = model->GetStrings("GetNpcIds");
	for (int i = 0; i < npcs.Count(); i++)
	{
		String id = npcs[i];
		Vec2F pos(-390 + i*260, 700);

		auto ring = MakeImage("TabRing" + (String)i, "UI/slot_ring.png", kCenter, pos, Vec2F(170, 170));
		mUI->AddChildWidget(ring);
		mTabRings.Add(ring);

		auto tab = MakeIconButton("Tab_" + id, "Npc/" + id + ".png", kCenter, pos, Vec2F(150, 150), [this, id] {
			SetNpc(id);
			SetMode(Mode::None);
			Refresh();
		});
		mUI->AddChildWidget(tab);
		mTabs.Add({ id, tab });
	}

	mUI->AddChildWidget(MakePanel("InfoPanel", kCenter, Vec2F(0, 300), Vec2F(1000, 600)));
	mPortrait = MakeImage("Portrait", "", kCenter, Vec2F(-250, 300), Vec2F(460, 460));
	mUI->AddChildWidget(mPortrait);

	mName = MakeLabel("Name", "", kCenter, Vec2F(230, 490), Vec2F(440, 70), 56, kTextDark, true, HorAlign::Left);
	if (mName)
		mUI->AddChildWidget(mName);
	mTitle = MakeLabel("Title", "", kCenter, Vec2F(230, 430), Vec2F(440, 44), 30, kTextDark, false, HorAlign::Left);
	if (mTitle)
		mUI->AddChildWidget(mTitle);

	for (int i = 0; i < 5; i++)
	{
		auto heart = MakeImage("Heart" + (String)i, "UI/icon_heart.png", kCenter, Vec2F(45 + i*76, 350), Vec2F(66, 66));
		mUI->AddChildWidget(heart);
		mHearts.Add(heart);
	}

	mAffinity = MakeLabel("Affinity", "", kCenter, Vec2F(230, 280), Vec2F(440, 44), 30, kTextDark, false, HorAlign::Left);
	if (mAffinity)
		mUI->AddChildWidget(mAffinity);
	mAffinityBar = MakeProgress("AffinityBar", kCenter, Vec2F(230, 225), Vec2F(420, 40));
	mUI->AddChildWidget(mAffinityBar);
	mBuff = MakeLabel("Buff", "", kCenter, Vec2F(230, 140), Vec2F(440, 80), 24, kTextGood, false, HorAlign::Left);
	if (mBuff)
		mUI->AddChildWidget(mBuff);

	mGiftButton = MakeButton("GiftButton", "Give a gift", "green", kCenter, Vec2F(-250, -60), Vec2F(440, 110),
							 [this] { SetMode(mMode == Mode::Gift ? Mode::None : Mode::Gift); Refresh(); }, 38);
	mUI->AddChildWidget(mGiftButton);
	mDateButton = MakeButton("DateButton", "Go on a date", "pink", kCenter, Vec2F(250, -60), Vec2F(440, 110),
							 [this] { SetMode(mMode == Mode::Date ? Mode::None : Mode::Date); Refresh(); }, 38);
	mUI->AddChildWidget(mDateButton);

	mOptionsTitle = MakeLabel("OptionsTitle", "", kCenter, Vec2F(0, -160), Vec2F(900, 50), 36, kTextLight, true);
	if (mOptionsTitle)
		mUI->AddChildWidget(mOptionsTitle);
	mOptionsHint = MakeLabel("OptionsHint", "", kCenter, Vec2F(0, -300), Vec2F(900, 120), 30, kTextLight);
	if (mOptionsHint)
		mUI->AddChildWidget(mOptionsHint);

	for (int i = 0; i < kMaxOptions; i++)
	{
		Vec2F pos((i % 2 == 0 ? -250.0f : 250.0f), kOptionsTop - (i/2)*kOptionsStep);
		auto option = MakeButton("Option" + (String)i, "", "blue", kCenter, pos, kOptionSize, [] {}, 28);
		mUI->AddChildWidget(option);
		mOptions.Add(option);
	}

	mBackButton = MakeIconButton("BackButton", "UI/btn_back.png", Vec2F(0.0f, 0.0f), Vec2F(90, 90), Vec2F(120, 120),
								 [game] { game->ShowCity(); });
	mUI->AddChildWidget(mBackButton);
}

void CharacterScreen::SetNpc(const String& npcId)
{
	mNpc = npcId;
}

const String& CharacterScreen::GetNpc() const
{
	return mNpc;
}

void CharacterScreen::SetMode(Mode mode)
{
	mMode = mode;
}

CharacterScreen::Mode CharacterScreen::GetMode() const
{
	return mMode;
}

void CharacterScreen::Refresh()
{
	auto model = Model();

	for (int i = 0; i < mTabs.Count(); i++)
		mTabRings[i]->SetEnabledForcible(mTabs[i].first == mNpc);

	SetImage(mPortrait, "Npc/" + mNpc + ".png");
	SetText(mName, model->GetString("GetNpcName", mNpc));
	SetText(mTitle, model->GetString("GetNpcTitle", mNpc) + " of the " + model->GetString("GetBuildingName", model->GetString("GetNpcBuilding", mNpc)));

	int level = model->GetInt("GetAffinityLevel", mNpc);
	int points = model->GetInt("GetAffinity", mNpc);
	int next = model->GetInt("GetNextAffinityPoints", mNpc);
	int start = model->GetInt("GetAffinityLevelStart", level);
	int maxLevel = model->GetInt("GetMaxAffinityLevel");

	for (int i = 0; i < mHearts.Count(); i++)
		mHearts[i]->SetTransparency(i < level ? 1.0f : 0.25f);

	if (level >= maxLevel)
	{
		SetText(mAffinity, "Affinity " + (String)points + "  (max)");
		SetProgress(mAffinityBar, 1.0f);
	}
	else
	{
		SetText(mAffinity, "Affinity " + (String)points + " / " + (String)next);
		SetProgress(mAffinityBar, (float)(points - start)/(float)Math::Max(1, next - start));
	}

	String buff = model->GetString("GetNpcBuffText", mNpc);
	SetText(mBuff, buff.IsEmpty() ? String("Buffs: 3 hearts +15% yield, 5 hearts +10% price") : "Active buffs: " + buff);

	RefreshOptions();
}

void CharacterScreen::RefreshOptions()
{
	auto model = Model();
	auto game = Game();

	for (auto& option : mOptions)
		option->SetEnabledForcible(false);

	if (mMode == Mode::None)
	{
		SetText(mOptionsTitle, "");
		SetText(mOptionsHint, "Gifts raise affinity. Dates need a premium gift and a Park or a Cafe in town.");
		return;
	}

	if (mMode == Mode::Gift)
	{
		SetText(mOptionsTitle, "Choose a gift");
		auto goods = model->GetStrings("GetGoodIds");
		int shown = 0;
		for (auto& good : goods)
		{
			int stock = model->GetInt("GetItem", good);
			if (stock <= 0 || shown >= mOptions.Count())
				continue;

			auto& option = mOptions[shown++];
			option->SetEnabledForcible(true);
			SetCaption(option, (WString)(model->GetString("GetGoodName", good) + " x" + (String)stock + "   +" +
										 (String)model->GetInt("GetGiftPoints", mNpc, good)));
			option->onClick = [this, game, model, good] {
				int gained = model->Call<int>("Gift", mNpc, good);
				if (gained > 0)
					game->Notify(model->GetString("GetNpcName", mNpc) + " loves it! +" + (String)gained + " affinity");
				game->RefreshAll();
			};
		}

		SetText(mOptionsHint, shown == 0 ? String("No goods in stock. Craft something in a workshop first.") : String(""));
		return;
	}

	SetText(mOptionsTitle, "Choose a place");
	auto spots = model->GetStrings("GetDateSpots");
	auto premium = model->GetStrings("GetPremiumGoodsInStock");
	String gift = premium.IsEmpty() ? String() : premium[0];

	int shown = 0;
	for (auto& spot : spots)
	{
		if (shown >= mOptions.Count())
			break;

		auto& option = mOptions[shown++];
		option->SetEnabledForcible(true);
		String caption = model->GetString("GetBuildingName", spot);
		if (!gift.IsEmpty())
			caption += "  (gift: " + model->GetString("GetGoodName", gift) + ")";
		SetCaption(option, (WString)caption);
		SetEnabled(option, !gift.IsEmpty());
		option->onClick = [this, game, model, spot, gift] {
			auto lines = model->Call<Vector<String>>("Date", mNpc, spot, gift);
			if (!lines.IsEmpty())
				game->ShowDate(mNpc, spot, lines);
		};
	}

	if (spots.IsEmpty())
		SetText(mOptionsHint, "Build a Park or a Cafe to go on dates.");
	else if (gift.IsEmpty())
		SetText(mOptionsHint, "A date needs a premium gift: Honey Cake, Dress, Gold Ring or Necklace.");
	else
		SetText(mOptionsHint, "");
}

Ref<Button> CharacterScreen::GetGiftButton() const
{
	return mGiftButton;
}

Ref<Button> CharacterScreen::GetDateButton() const
{
	return mDateButton;
}

Ref<Button> CharacterScreen::GetOptionButton(int index) const
{
	return index >= 0 && index < mOptions.Count() ? mOptions[index] : nullptr;
}

Ref<Button> CharacterScreen::GetTabButton(int index) const
{
	return index >= 0 && index < mTabs.Count() ? mTabs[index].second : nullptr;
}

Ref<Button> CharacterScreen::GetBackButton() const
{
	return mBackButton;
}
// --- META ---

ENUM_META(CharacterScreen::Mode, CharacterScreen__Mode)
{
    ENUM_ENTRY(Date);
    ENUM_ENTRY(Gift);
    ENUM_ENTRY(None);
}
END_ENUM_META;
// --- END META ---
