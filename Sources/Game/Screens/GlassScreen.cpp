#include "o2/stdafx.h"
#include "Screens/GlassScreen.h"

#include "ColorTownGame.h"
#include "UI/UIKit.h"
#include "o2/Render/Render.h"
#include "o2/Scene/Components/ImageComponent.h"
#include "o2/Scene/Scene.h"
#include "o2/Scene/UI/WidgetLayout.h"

using namespace UI;

namespace
{
	const Vec2F kFieldPosition(0, -150);
	const Vec2F kFieldSize(600, 780);
	const float kBallRadius = 38.0f;
	const Vec2F kJarSize(760, 1020);
	const Vec2F kJarPosition(0, -110);
}

Vec2F GlassScreen::GetFieldPosition()
{
	return kFieldPosition;
}

void GlassScreen::Build()
{
	auto game = Game();

	auto back = mmake<Actor>(ActorCreateMode::InScene);
	back->SetName("Background");
	back->transform->SetSize2D(kDesignSize);
	if (Render::IsSingletonInitialzed())
		back->AddComponent(mmake<ImageComponent>(String("Backgrounds/glass.png")));
	back->SetParent(mRoot, false);
	back->transform->SetPosition2D(Vec2F());
	back->SetIndexInSiblings(0);

	auto jar = mmake<Actor>(ActorCreateMode::InScene);
	jar->SetName("Jar");
	jar->transform->SetSize2D(kJarSize);
	if (Render::IsSingletonInitialzed())
		jar->AddComponent(mmake<ImageComponent>(String("UI/jar.png")));
	jar->SetParent(mRoot, false);
	jar->transform->SetPosition2D(kJarPosition);
	jar->SetIndexInSiblings(1);

	mUI->AddChildWidget(MakePanel("Header", kCenter, Vec2F(0, 680), Vec2F(1000, 230)));
	mPortrait = MakeImage("Portrait", "", kCenter, Vec2F(-380, 680), Vec2F(200, 200));
	mUI->AddChildWidget(mPortrait);

	mNpcName = MakeLabel("NpcName", "", kCenter, Vec2F(-60, 745), Vec2F(380, 60), 46, kTextDark, true, HorAlign::Left);
	if (mNpcName)
		mUI->AddChildWidget(mNpcName);
	mNpcTitle = MakeLabel("NpcTitle", "", kCenter, Vec2F(-60, 695), Vec2F(380, 40), 28, kTextDark, false, HorAlign::Left);
	if (mNpcTitle)
		mUI->AddChildWidget(mNpcTitle);

	for (int i = 0; i < 5; i++)
	{
		auto heart = MakeImage("Heart" + (String)i, "UI/icon_heart.png", kCenter, Vec2F(-230 + i*66, 635), Vec2F(58, 58));
		mUI->AddChildWidget(heart);
		mHearts.Add(heart);
	}

	mBuildingLabel = MakeLabel("Building", "", kCenter, Vec2F(300, 725), Vec2F(300, 60), 40, kTextDark, true);
	if (mBuildingLabel)
		mUI->AddChildWidget(mBuildingLabel);
	mUpgradeHint = MakeLabel("UpgradeHint", "", kCenter, Vec2F(300, 660), Vec2F(320, 80), 24, kTextDark);
	if (mUpgradeHint)
		mUI->AddChildWidget(mUpgradeHint);

	mUI->AddChildWidget(MakePanel("CountersPanel", kCenter, Vec2F(-130, -790), Vec2F(640, 120)));
	for (int i = 0; i < 3; i++)
	{
		Counter counter;
		Vec2F pos(-360 + i*220, -790);
		counter.icon = MakeImage("CounterIcon" + (String)i, "", kCenter, pos + Vec2F(-55, 0), Vec2F(80, 80));
		mUI->AddChildWidget(counter.icon);
		counter.label = MakeLabel("Counter" + (String)i, "0", kCenter, pos + Vec2F(55, 0), Vec2F(120, 60), 34, kTextDark, true);
		if (counter.label)
			mUI->AddChildWidget(counter.label);
		mCounters.Add(counter);
	}

	mUpgradeButton = MakeButton("UpgradeButton", "Upgrade", "orange", kCenter, Vec2F(340, -790), Vec2F(280, 100), [this, game] {
		if (Model()->Call<bool>("UpgradeTier1", mBuilding))
		{
			game->Notify(Model()->GetString("GetBuildingName", mBuilding) + " upgraded!");
			mField->SetMaxBalls(Model()->GetInt("GetGlassMaxBalls", mBuilding));
			game->RefreshAll();
		}
	}, 34);
	mUI->AddChildWidget(mUpgradeButton);

	mBackButton = MakeIconButton("BackButton", "UI/btn_back.png", Vec2F(0.0f, 0.0f), Vec2F(90, 90), Vec2F(120, 120),
								 [game] { game->ShowCity(); });
	mUI->AddChildWidget(mBackButton);
}

void GlassScreen::SetBuilding(const String& buildingId)
{
	mBuilding = buildingId;
}

const String& GlassScreen::GetBuilding() const
{
	return mBuilding;
}

Ref<GlassField> GlassScreen::GetField() const
{
	return mField;
}

Ref<Button> GlassScreen::GetBackButton() const
{
	return mBackButton;
}

Ref<Button> GlassScreen::GetUpgradeButton() const
{
	return mUpgradeButton;
}

void GlassScreen::RebuildField()
{
	if (mFieldActor)
		o2Scene.DestroyActor(mFieldActor);

	mFieldActor = mmake<Actor>(ActorCreateMode::InScene);
	mFieldActor->SetName("Field");
	mFieldActor->SetParent(mRoot, false);
	mFieldActor->transform->SetPosition2D(kFieldPosition);
	mFieldActor->SetIndexInSiblings(2);

	auto model = Model();
	mField = mFieldActor->AddComponent<GlassField>();
	mField->Setup(model->GetStrings("GetGlassColors", mBuilding), model->GetInt("GetGlassMaxBalls", mBuilding),
				  kFieldSize, kBallRadius);
	mField->onGroupPopped = [this](const String& type, int count) { OnGroupPopped(type, count); };
}

void GlassScreen::OnShown()
{
	RebuildField();
}

void GlassScreen::OnHidden()
{
	if (mFieldActor)
	{
		o2Scene.DestroyActor(mFieldActor);
		mFieldActor = nullptr;
		mField = nullptr;
	}
}

void GlassScreen::OnGroupPopped(const String& type, int count)
{
	auto model = Model();
	int gained = model->Call<int>("Harvest", mBuilding, type, count);

	if (auto popup = MakeLabel("Popup", "+" + (String)gained + " " + model->GetString("GetItemName", type), kCenter,
							   Vec2F(0, -50), Vec2F(600, 80), count >= 5 ? 56 : 44, kTextLight, true))
	{
		mUI->AddChildWidget(popup);
		mPopups.Add({ popup, 0.0f });
	}

	Game()->RefreshAll();
}

void GlassScreen::Refresh()
{
	auto model = Model();
	String npc = model->GetString("GetBuildingNpc", mBuilding);

	SetImage(mPortrait, "Npc/" + npc + ".png");
	SetText(mNpcName, model->GetString("GetNpcName", npc));
	SetText(mNpcTitle, model->GetString("GetNpcTitle", npc));

	int affinityLevel = model->GetInt("GetAffinityLevel", npc);
	for (int i = 0; i < mHearts.Count(); i++)
		mHearts[i]->SetTransparency(i < affinityLevel ? 1.0f : 0.25f);

	int level = model->GetInt("GetTier1Level", mBuilding);
	SetText(mBuildingLabel, model->GetString("GetBuildingName", mBuilding) + "  Lv." + (String)level);

	if (model->GetBool("IsTier1MaxLevel", mBuilding))
	{
		SetText(mUpgradeHint, "Max level");
		SetCaption(mUpgradeButton, "Max");
		SetEnabled(mUpgradeButton, false);
	}
	else
	{
		int cost = model->GetInt("GetTier1UpgradeCost", mBuilding);
		int affinity = model->GetInt("GetTier1UpgradeAffinity", mBuilding);
		SetText(mUpgradeHint, "Upgrade: " + (String)cost + " coins, " + (String)affinity + " hearts");
		SetCaption(mUpgradeButton, (WString)("Upgrade " + (String)cost));
		SetEnabled(mUpgradeButton, model->GetBool("CanUpgradeTier1", mBuilding));
	}

	auto colors = model->GetStrings("GetGlassColors", mBuilding);
	int cap = model->GetInt("GetStorageCap");
	for (int i = 0; i < mCounters.Count(); i++)
	{
		auto& counter = mCounters[i];
		if (i >= colors.Count())
		{
			counter.icon->SetEnabledForcible(false);
			if (counter.label)
				counter.label->SetEnabledForcible(false);
			continue;
		}

		if (counter.type != colors[i])
		{
			counter.type = colors[i];
			SetImage(counter.icon, "Balls/" + counter.type + ".png");
		}

		counter.icon->SetEnabledForcible(true);
		int have = model->GetInt("GetItem", counter.type);
		SetText(counter.label, (String)have + "/" + (String)cap);
		if (counter.label)
		{
			counter.label->SetEnabledForcible(true);
			counter.label->SetColor(have >= cap ? kTextBad : kTextDark);
		}
	}
}

void GlassScreen::Update(float dt)
{
	for (int i = mPopups.Count() - 1; i >= 0; i--)
	{
		auto& popup = mPopups[i];
		popup.second += dt;
		float t = popup.second;
		if (t > 1.2f)
		{
			o2Scene.DestroyActor(popup.first);
			mPopups.RemoveAt(i);
			continue;
		}

		popup.first->layout->offsetMin = Vec2F(-300, -90 + t*120);
		popup.first->layout->offsetMax = Vec2F(300, -10 + t*120);
		popup.first->SetTransparency(t < 0.8f ? 1.0f : 1.0f - (t - 0.8f)/0.4f);
	}
}
