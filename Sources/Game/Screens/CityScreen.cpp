#include "o2/stdafx.h"
#include "Screens/CityScreen.h"

#include "ColorTownGame.h"
#include "UI/UIKit.h"
#include "o2/Render/Render.h"
#include "o2/Scene/Components/ImageComponent.h"
#include "o2/Scene/UI/WidgetLayer.h"

using namespace UI;

namespace
{
	const Vector<String> kTier1 = { "farm", "mine", "sawmill", "orchard" };
	const Vec2F kTier1Positions[] = { Vec2F(-330, 620), Vec2F(330, 620), Vec2F(-330, 330), Vec2F(330, 330) };
	const Vec2F kSlotPositions[] = {
		Vec2F(-360, 40), Vec2F(0, 40), Vec2F(360, 40),
		Vec2F(-360, -240), Vec2F(0, -240), Vec2F(360, -240),
		Vec2F(-360, -520), Vec2F(360, -520)
	};
	const float kTier1Size = 280.0f;
	const float kSlotSize = 230.0f;
}

Vec2F CityScreen::GetTier1Position(const String& id)
{
	int index = kTier1.IndexOf(id);
	return index >= 0 ? kTier1Positions[index] : Vec2F();
}

Vec2F CityScreen::GetSlotPosition(int slot)
{
	return slot >= 0 && slot < 8 ? kSlotPositions[slot] : Vec2F();
}

void CityScreen::Build()
{
	auto model = Model();
	auto game = Game();

	auto back = mmake<Actor>(ActorCreateMode::InScene);
	back->SetName("Background");
	back->transform->SetSize2D(kDesignSize);
	if (Render::IsSingletonInitialzed())
		back->AddComponent(mmake<ImageComponent>(String("Backgrounds/city.png")));
	back->SetParent(mRoot, false);
	back->transform->SetPosition2D(Vec2F());
	back->SetIndexInSiblings(0);

	for (int i = 0; i < kTier1.Count(); i++)
	{
		String id = kTier1[i];
		Vec2F pos = kTier1Positions[i];

		auto button = MakeIconButton(id, "Buildings/" + id + ".png", kCenter, pos, Vec2F(kTier1Size, kTier1Size),
									 [game, id] { game->ShowGlass(id); });
		mUI->AddChildWidget(button);
		mTier1Buttons.Add({ id, button });

		if (auto name = MakeLabel(id + "Name", (WString)model->GetString("GetBuildingName", id), kCenter,
								  pos + Vec2F(0, -135), Vec2F(300, 50), 34, kTextLight, true))
			mUI->AddChildWidget(name);

		auto level = MakeLabel(id + "Level", "Lv.1", kCenter, pos + Vec2F(90, 110), Vec2F(120, 44), 28, kTextLight, true);
		if (level)
			mUI->AddChildWidget(level);
		mTier1Levels.Add({ id, level });
	}

	for (int i = 0; i < 8; i++)
	{
		SlotView slot;
		Vec2F pos = kSlotPositions[i];
		slot.button = MakeIconButton("Slot" + (String)i, "", kCenter, pos, Vec2F(kSlotSize, kSlotSize), [game, model, i] {
			String built = model->GetString("GetSlot", i);
			if (built.IsEmpty())
			{
				if (i < model->GetInt("GetUnlockedSlots") && !model->GetBool("IsSlotConstructing", i))
					game->OpenBuild(i);
			}
			else if (model->GetInt("GetBuildingTier", built) == 2)
				game->ShowWorkshop(built);
		});
		mUI->AddChildWidget(slot.button);

		slot.label = MakeLabel("Slot" + (String)i + "Label", "", kCenter, pos + Vec2F(0, -120), Vec2F(300, 44), 28,
							   kTextLight, true);
		if (slot.label)
			mUI->AddChildWidget(slot.label);

		mSlots.Add(slot);
	}

	mUI->AddChildWidget(MakePanel("BottomBar", Vec2F(0.5f, 0.0f), Vec2F(0, 90), Vec2F(kDesignSize.x + 40, 200), "UI/panel_dark.png"));

	mUI->AddChildWidget(MakeIconButton("WarehouseButton", "UI/icon_crate.png", Vec2F(0.5f, 0.0f), Vec2F(-220, 105),
									   Vec2F(130, 130), [game] { game->OpenWarehouse(); }));
	if (auto label = MakeLabel("WarehouseLabel", "Warehouse", Vec2F(0.5f, 0.0f), Vec2F(-220, 25), Vec2F(300, 40), 28, kTextLight, true))
		mUI->AddChildWidget(label);

	mUI->AddChildWidget(MakeIconButton("CharactersButton", "UI/icon_heart.png", Vec2F(0.5f, 0.0f), Vec2F(220, 105),
									   Vec2F(130, 130), [game] { game->ShowCharacter("tom"); }));
	if (auto label = MakeLabel("CharactersLabel", "Friends", Vec2F(0.5f, 0.0f), Vec2F(220, 25), Vec2F(300, 40), 28, kTextLight, true))
		mUI->AddChildWidget(label);
}

void CityScreen::SetSlotImage(SlotView& slot, const String& imagePath, float transparency)
{
	if (slot.shownImage != imagePath)
	{
		slot.shownImage = imagePath;
		if (Render::IsSingletonInitialzed())
		{
			slot.button->RemoveLayer("regular");
			if (!imagePath.IsEmpty())
				slot.button->AddLayer("regular", mmake<Sprite>(imagePath), Layout::BothStretch());
		}
	}

	slot.button->SetTransparency(transparency);
}

void CityScreen::Refresh()
{
	auto model = Model();

	for (auto& level : mTier1Levels)
		SetText(level.second, "Lv." + (String)model->GetInt("GetTier1Level", level.first));

	int unlocked = model->GetInt("GetUnlockedSlots");
	for (int i = 0; i < mSlots.Count(); i++)
	{
		auto& slot = mSlots[i];
		String built = model->GetString("GetSlot", i);

		if (!built.IsEmpty())
		{
			SetSlotImage(slot, "Buildings/" + built + ".png", 1.0f);
			SetText(slot.label, model->GetString("GetBuildingName", built));
		}
		else if (model->GetBool("IsSlotConstructing", i))
		{
			String id = model->GetString("GetSlotConstructionId", i);
			SetSlotImage(slot, "Buildings/" + id + ".png", 0.5f);
			SetText(slot.label, Seconds(model->GetFloat("GetSlotConstructionTimeLeft", i)));
		}
		else if (i < unlocked)
		{
			SetSlotImage(slot, "Buildings/lot.png", 1.0f);
			SetText(slot.label, "Build");
		}
		else
		{
			SetSlotImage(slot, "UI/icon_lock.png", 0.7f);
			static const int kSlotsPerLevel[] = { 3, 5, 7, 8, 8 };
			int level = 0;
			while (level < 4 && i >= kSlotsPerLevel[level])
				level++;
			SetText(slot.label, "City Lv." + (String)(level + 1));
		}
	}
}

void CityScreen::Update(float dt)
{
	mTimerRefresh += dt;
	if (mTimerRefresh < 0.5f)
		return;

	mTimerRefresh = 0.0f;
	for (int i = 0; i < mSlots.Count(); i++)
	{
		if (Model()->GetBool("IsSlotConstructing", i))
		{
			Refresh();
			return;
		}
	}
}

Ref<Button> CityScreen::GetTier1Button(const String& id) const
{
	for (auto& pair : mTier1Buttons)
	{
		if (pair.first == id)
			return pair.second;
	}

	return nullptr;
}

Ref<Button> CityScreen::GetSlotButton(int slot) const
{
	return slot >= 0 && slot < mSlots.Count() ? mSlots[slot].button : nullptr;
}
