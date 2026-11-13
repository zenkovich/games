#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "o2/Application/Application.h"
#include "o2/Assets/Assets.h"
#include "o2/Scene/Scene.h"
#include "o2/Scene/UI/Widget.h"
#include "o2/Scene/UI/WidgetLayout.h"
#include "o2/Scene/UI/Widgets/Label.h"
#include "o2/Scripts/ScriptEngine.h"
#include "o2/Utils/Bitmap/Bitmap.h"
#include "o2/Utils/FileSystem/FileSystem.h"
#include "o2/Utils/Test/AppTestDriver.h"
#include "DragonCrashers/DragonBridge.h"

using namespace o2;

// The ported main menu driven by real clicks: navigation, tabs, shop purchases, mail, inventory, settings
class DragonMenuFlow: public ::testing::Test
{
protected:
	void SetUp() override
	{
		o2FileSystem.FileDelete("DragonCrashersSave.json");
		o2Application.SetWindowSize(Vec2I(1920, 1080));
		dragon::RegisterDragonJsApi();
		o2Scene.Load(o2Assets.GetBuiltAssetsPath() + String("DragonCrashers/MainMenu.scn"));
		AppTestDriver::PumpFrames(5);
		AppTestDriver::Wait(0.5f);
	}

	void TearDown() override
	{
		o2Scene.Clear(true);
		o2Scene.UpdateDestroyingEntities();
		AppTestDriver::PumpFrames(2);
		o2FileSystem.FileDelete("DragonCrashersSave.json");
	}

	Ref<Widget> W(const String& name)
	{
		auto ui = o2Scene.FindActor("UI");
		auto res = ui ? DynamicCast<Widget>(ui->FindChild(name)) : nullptr;
		EXPECT_TRUE(res) << name.Data();
		return res;
	}

	// Screen position of a widget center: the fitted 1920x1080 camera maps design units to the window
	Vec2F ScreenPos(const Ref<Widget>& w)
	{
		Vec2F screen = (Vec2F)o2Application.GetContentSize();
		float k = Math::Min(screen.x/1920.0f, screen.y/1080.0f);
		return w->layout->GetWorldRect().Center()*k;
	}

	void ClickOn(const String& name, float wait = 0.6f)
	{
		auto w = W(name);
		if (!w)
			return;
		AppTestDriver::Click(ScreenPos(w));
		AppTestDriver::Wait(wait);
	}

	String Text(const String& name)
	{
		auto label = DynamicCast<Label>(W(name));
		return label ? String(label->GetText()) : String();
	}

	bool Visible(const String& name)
	{
		auto w = W(name);
		return w && w->IsEnabledInHierarchy();
	}

	String Js(const String& expr)
	{
		return o2Scripts.Eval(expr).ToString();
	}

	void Shot(const String& name)
	{
		o2FileSystem.FolderCreate("TestScreenshots/DragonMenuFlow", true);
		auto shot = AppTestDriver::TakeScreenshot();
		ASSERT_TRUE(shot);
		shot->Save("TestScreenshots/DragonMenuFlow/" + name + ".png", Bitmap::ImageType::Png);
	}
};

TEST_F(DragonMenuFlow, HomeShowsLevelAndCurrencies)
{
	AppTestDriver::Wait(1.0f);
	EXPECT_EQ(Text("home-play__level-number"), "Level 1");
	EXPECT_EQ(Text("home-play__level-name"), "The Dragon's Lair");
	EXPECT_EQ(Text("options-bar__gold-count"), "500");
	EXPECT_EQ(Text("options-bar__gem-count"), "50");
	EXPECT_EQ(Text("level-meter__number"), "21");
	EXPECT_TRUE(Visible("HomeScreen"));
	EXPECT_FALSE(Visible("CharScreen"));
	AppTestDriver::Wait(2.5f);
	Shot("menu_home");
}

TEST_F(DragonMenuFlow, NavigatesAllScreens)
{
	ClickOn("menu__char-button");
	EXPECT_TRUE(Visible("CharScreen"));
	EXPECT_FALSE(Visible("HomeScreen"));
	EXPECT_EQ(Text("char__label"), "Sir Jarek");
	EXPECT_EQ(Text("char__power-label"), "452");
	EXPECT_EQ(Text("char__potion-to-advance"), "/30");
	Shot("menu_char_stats");

	ClickOn("char-data-skills-chartab");
	EXPECT_TRUE(Visible("char-data-skills-content"));
	EXPECT_FALSE(Visible("char-data-stats-content"));
	EXPECT_EQ(Text("char-skills__label"), "Sword Slash");
	Shot("menu_char_skills");

	ClickOn("char-data-bio-chartab");
	EXPECT_TRUE(Visible("char-data-bio-content"));
	Shot("menu_char_bio");

	ClickOn("char-data-stats-chartab");
	ClickOn("char__next-button");
	EXPECT_EQ(Text("char__label"), "Wolfman Oriz");
	EXPECT_EQ(Text("char__power-label"), "362");
	Shot("menu_char_next1");
	ClickOn("char__next-button");
	EXPECT_EQ(Text("char__label"), "Witch Giorgia");
	Shot("menu_char_next2");
	ClickOn("char__next-button");
	EXPECT_EQ(Text("char__label"), "The Necromancer");

	ClickOn("char-inventory__slot1");
	EXPECT_TRUE(Visible("InventoryScreen"));
	Shot("menu_inventory");
	ClickOn("inventory__back-button");
	EXPECT_FALSE(Visible("InventoryScreen"));

	ClickOn("menu__shop-button");
	EXPECT_TRUE(Visible("ShopScreen"));
	Shot("menu_shop");
	ClickOn("shop-gem-shoptab");
	Shot("menu_shop_gem");
	ClickOn("shop-potion-shoptab");
	Shot("menu_shop_potion");
	ClickOn("shop-gold-shoptab");

	ClickOn("menu__mail-button");
	EXPECT_TRUE(Visible("MailScreen"));
	EXPECT_EQ(Text("content__message-subject"), "Quis autem vel...");
	Shot("menu_mail");
	ClickOn("tabs__deleted-tab");
	EXPECT_TRUE(Visible("content__no-messages"));
	Shot("menu_mail_deleted");
	ClickOn("tabs__inbox-tab");

	ClickOn("menu__info-button");
	EXPECT_TRUE(Visible("InfoScreen"));
	Shot("menu_info");

	ClickOn("menu__home-button");
	ClickOn("options-bar__button");
	EXPECT_TRUE(Visible("SettingsScreen"));
	Shot("menu_settings");
	ClickOn("settings__panel-back-button");
	EXPECT_FALSE(Visible("SettingsScreen"));
}

TEST_F(DragonMenuFlow, ShopPurchaseSpendsGems)
{
	ClickOn("menu__shop-button");
	// second gold pack: 250 gold for 50 gems
	EXPECT_EQ(Js("DC.menu.shop.items.length"), "4");
	auto buy = Js("(function(){ var w = DC.menu.shop.items[1]; var b = w.FindChild('shop-item__buy-button'); var r = b.GetLayout().GetWorldRect(); return ((r.left+r.right)/2) + ',' + ((r.bottom+r.top)/2); })()");
	auto parts = buy.Split(",");
	ASSERT_EQ(parts.Count(), 2);
	AppTestDriver::Click(Vec2F((float)parts[0], (float)parts[1]));
	AppTestDriver::Wait(1.0f);
	EXPECT_EQ(Js("DC.menu.model.save.gems"), "0");
	EXPECT_EQ(Js("DC.menu.model.save.gold"), "750");
	EXPECT_EQ(Text("options-bar__gold-count"), "750");
	EXPECT_EQ(Text("options-bar__gem-count"), "0");

	// not enough gems now: nothing changes, the warning popup shows
	AppTestDriver::Click(Vec2F((float)parts[0], (float)parts[1]));
	AppTestDriver::Wait(0.5f);
	EXPECT_EQ(Js("DC.menu.model.save.gold"), "750");
	EXPECT_TRUE(Js("DC.menu.popup.lastText").Contains("Insufficient funds"));
}

TEST_F(DragonMenuFlow, LevelUpUsesPotions)
{
	ClickOn("menu__char-button");
	ClickOn("char__level-up-button", 1.0f);
	EXPECT_EQ(Js("DC.menu.model.character.level"), "4");
	EXPECT_EQ(Js("DC.menu.model.save.levelUpPotions"), "170");
	EXPECT_EQ(Text("char__potion-count"), "170");
	EXPECT_EQ(Text("char__power-label"), "602");
	EXPECT_EQ(Text("level-meter__number"), "22");
}

TEST_F(DragonMenuFlow, MailClaimAddsReward)
{
	ClickOn("menu__mail-button");
	EXPECT_EQ(Js("DC.menu.model.save.levelUpPotions"), "200");
	ClickOn("content__gift-button", 0.8f);
	EXPECT_EQ(Js("DC.menu.model.save.levelUpPotions"), "250");
	EXPECT_FALSE(Visible("content__gift-button"));
	ClickOn("content__delete-button", 0.8f);
	EXPECT_EQ(Js("DC.menu.model.inbox.length"), "6");
	EXPECT_EQ(Js("DC.menu.model.deleted.length"), "1");
}

TEST_F(DragonMenuFlow, InventoryEquipsSelectedGear)
{
	ClickOn("menu__char-button");
	ClickOn("char-inventory__slot4");
	EXPECT_EQ(Js("DC.menu.inventory.items.length"), "10");
	auto pos = Js("(function(){ var w = DC.menu.inventory.items[0].widget.FindChild('gear-item__icon'); var r = w.GetLayout().GetWorldRect(); return ((r.left+r.right)/2) + ',' + ((r.bottom+r.top)/2); })()").Split(",");
	AppTestDriver::Click(Vec2F((float)pos[0], (float)pos[1]));
	AppTestDriver::Wait(0.3f);
	ClickOn("inventory__back-button");
	EXPECT_EQ(Js("DC.menu.model.character.gear[3].name"), "Common Axe");
	EXPECT_EQ(Js("DC.menu.model.unequipped.length"), "9");
}

TEST_F(DragonMenuFlow, DISABLED_Debug)
{
	ClickOn("menu__char-button");
	ClickOn("char__next-button");
	std::printf("DBG %s\n", Js("(function(){ var r = DC.menu.screens.char; var out=[]; var walk=function(w,d){ var n=String(w.GetName()); if(n.indexOf('attack')>=0) out.push(d+':'+n+':'+(w.GetText?w.GetText():'-')); var ch=w.GetChildren(); for(var i=0;i<ch.length;i++) walk(ch[i],d+1);}; walk(DC.menu._actor,0); return out.join(' | '); })()").Data());
	std::printf("DBG2 %s\n", Js("(function(){ var w = DC.menu.screens.mail.FindChild('content__message-text'); var r=w.GetLayout().GetWorldRect(); return w.GetText() + ' rect ' + r.left+','+r.bottom+','+r.right+','+r.top + ' en ' + w.IsEnabledInHierarchy() + ' tr ' + w.GetResTransparency(); })()").Data());
}

TEST_F(DragonMenuFlow, PlayStartsTheBattleAndAbandonReturnsToTheMenu)
{
	ClickOn("home-play__level-button", 1.0f);
	ASSERT_TRUE(o2Scene.FindActor("World/Unit_Dragon_Rustum"));
	EXPECT_EQ(Js("DC.battle.model.Unit('Dragon').hp"), "1600");
	auto ui = o2Scene.FindActor("UI");
	auto click = [&](const String& name, float wait)
	{
		auto w = DynamicCast<Widget>(ui->FindChild(name));
		ASSERT_TRUE(w) << name.Data();
		AppTestDriver::Click(ScreenPos(w));
		AppTestDriver::Wait(wait);
	};
	click("pause__button", 1.2f);
	click("pause__quit-button", 1.0f);
	EXPECT_FALSE(o2Scene.FindActor("World/Unit_Dragon_Rustum"));
	ASSERT_TRUE(o2Scene.FindActor("UI"));
	EXPECT_TRUE(Visible("HomeScreen"));
	EXPECT_EQ(Text("options-bar__gold-count"), "500");
}

// Tool for the lighting bake: the menu world of the character screen, without UI and baked light
TEST_F(DragonMenuFlow, DISABLED_RenderWorldForLightBake)
{
	Js("DC.menu.ShowScreen('char')");
	for (auto name : { "UI", "Lighting" })
	{
		if (auto actor = o2Scene.FindActor(name))
			actor->SetEnabled(false);
	}
	for (int i = 0; i < 4; i++)
	{
		AppTestDriver::Wait(0.5f);
		Shot(String::Format("menu_char_world%d", i));
		Js("DC.menu.model.SelectCharacter(1)");
	}
}
