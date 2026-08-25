#include "o2/stdafx.h"
#include "Screens/WarehouseWindow.h"

#include "ColorTownGame.h"
#include "UI/UIKit.h"

using namespace UI;

namespace
{
	const Vec2F kPanelSize(1000, 1640);
	const Vec2F kCellSize(310, 180);
	const int kColumns = 3;
	const float kGridTop = 560.0f;
	const float kGridLeft = -320.0f;
}

void WarehouseWindow::Build()
{
	auto game = Game();
	auto model = Model();

	mUI->AddChildWidget(MakeDim("Dim", [game] { game->CloseWindow(); }));
	mUI->AddChildWidget(MakePanel("Panel", kCenter, Vec2F(0, -20), kPanelSize));

	mTitle = MakeLabel("Title", "Warehouse", kCenter, Vec2F(0, 730), Vec2F(800, 70), 52, kTextDark, true);
	if (mTitle)
		mUI->AddChildWidget(mTitle);

	mCloseButton = MakeButton("CloseButton", "X", "gray", kCenter, Vec2F(440, 740), Vec2F(90, 90), [game] { game->CloseWindow(); }, 40);
	mUI->AddChildWidget(mCloseButton);

	Vector<String> items = model->GetStrings("GetResourceIds");
	items.Add(model->GetStrings("GetGoodIds"));

	for (int i = 0; i < items.Count(); i++)
	{
		Cell cell;
		cell.item = items[i];
		bool good = model->GetBool("IsGood", cell.item);
		Vec2F pos(kGridLeft + (i % kColumns)*(kCellSize.x + 10), kGridTop - (i/kColumns)*(kCellSize.y + 6));

		cell.root = MakePanel("Cell_" + cell.item, kCenter, pos, kCellSize, "UI/card.png");
		mUI->AddChildWidget(cell.root);

		cell.icon = MakeImage("Icon", (good ? "Goods/" : "Balls/") + cell.item + ".png", kCenter, Vec2F(-100, 10), Vec2F(90, 90));
		cell.root->AddChildWidget(cell.icon);

		cell.name = MakeLabel("Name", (WString)model->GetString("GetItemName", cell.item), kCenter, Vec2F(45, 40), Vec2F(190, 40), 26, kTextDark, true);
		if (cell.name)
			cell.root->AddChildWidget(cell.name);

		cell.count = MakeLabel("Count", "0", kCenter, Vec2F(45, -5), Vec2F(190, 40), 28, kTextDark);
		if (cell.count)
			cell.root->AddChildWidget(cell.count);

		if (good)
		{
			cell.sell = MakeButton("Sell", "Sell", "blue", kCenter, Vec2F(0, -55), Vec2F(270, 60), [this, game, model, i] {
				auto& cell = mCells[i];
				int earned = model->Call<int>("Sell", cell.item, model->GetInt("GetItem", cell.item));
				if (earned > 0)
					game->Notify("Sold for " + (String)earned + " coins");
				game->RefreshAll();
			}, 24);
			cell.root->AddChildWidget(cell.sell);
		}

		mCells.Add(cell);
	}

	mUpgradeButton = MakeButton("UpgradeButton", "Upgrade storage", "orange", kCenter, Vec2F(0, -750), Vec2F(560, 100), [game, model] {
		if (model->Call<bool>("UpgradeStorage"))
		{
			game->Notify("Storage upgraded to " + (String)model->GetInt("GetStorageCap"));
			game->RefreshAll();
		}
	}, 34);
	mUI->AddChildWidget(mUpgradeButton);
}

void WarehouseWindow::Refresh()
{
	auto model = Model();
	int cap = model->GetInt("GetStorageCap");

	SetText(mTitle, "Warehouse  (cap " + (String)cap + " each)");

	for (auto& cell : mCells)
	{
		int have = model->GetInt("GetItem", cell.item);
		SetText(cell.count, (String)have + " / " + (String)cap);
		if (cell.count)
			cell.count->SetColor(have >= cap ? kTextBad : kTextDark);
		cell.icon->SetTransparency(have > 0 ? 1.0f : 0.35f);

		if (cell.sell)
		{
			SetCaption(cell.sell, (WString)("Sell " + (String)have + " for " + (String)(have*model->GetInt("GetSellPrice", cell.item))));
			SetEnabled(cell.sell, have > 0);
		}
	}

	if (model->GetInt("GetStorageLevel") + 1 >= 2)
	{
		SetCaption(mUpgradeButton, "Storage is maxed");
		SetEnabled(mUpgradeButton, false);
	}
	else
	{
		SetCaption(mUpgradeButton, (WString)("Upgrade storage: " + (String)model->GetInt("GetStorageUpgradeCost") + " coins"));
		SetEnabled(mUpgradeButton, model->GetBool("CanUpgradeStorage"));
	}
}

Ref<Button> WarehouseWindow::GetSellButton(const String& good) const
{
	for (auto& cell : mCells)
	{
		if (cell.item == good)
			return cell.sell;
	}

	return nullptr;
}

Ref<Button> WarehouseWindow::GetCloseButton() const
{
	return mCloseButton;
}

Ref<Button> WarehouseWindow::GetUpgradeButton() const
{
	return mUpgradeButton;
}
