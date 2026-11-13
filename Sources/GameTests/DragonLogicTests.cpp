#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "o2/Scripts/ScriptEngine.h"
#include "o2/Utils/FileSystem/FileSystem.h"
#include "DragonCrashers/DragonBridge.h"

using namespace o2;

// Game rules of the Dragon Crashers port (JS), checked against the values of the Unity original (Work/Unity/Spec_*.md)
class DragonLogic: public ::testing::Test
{
protected:
	void SetUp() override
	{
		o2FileSystem.FileDelete("DragonCrashersSave.json");
		dragon::RegisterDragonJsApi();
		auto res = o2Scripts.Eval("include('Scripts/DragonCrashers/Core/DC.js') && include('Scripts/DragonCrashers/Menu/MenuModel.js') && "
								  "include('Scripts/DragonCrashers/Game/BattleModel.js')");
		ASSERT_EQ(res.ToString(), "true");
		Js("DC.Events.Reset(); DC.Ticker.Reset(); DC.Audio.Play = function(n) { DC.Audio.lastPlayed = n; }; DC.Audio.lastPlayed = null;");
	}

	void TearDown() override
	{
		Js("DC.Events.Reset()");
		o2FileSystem.FileDelete("DragonCrashersSave.json");
	}

	String Js(const String& expr) { return o2Scripts.Eval(expr).ToString(); }
	float JsF(const String& expr) { return (float)Js(expr); }
};

TEST_F(DragonLogic, MenuStartsWithTheOriginalDefaults)
{
	Js("var m = new DC.MenuModel()");
	EXPECT_EQ(Js("[m.save.gold, m.save.gems, m.save.healthPotions, m.save.levelUpPotions].join()"), "500,50,6,200");
	EXPECT_EQ(Js("m.characters.map(function(c){ return c.name + ':' + c.level; }).join()"),
			  "Sir Jarek:3,Wolfman Oriz:2,Witch Giorgia:6,The Necromancer:10");
	EXPECT_EQ(Js("m.totalLevels"), "21");
	EXPECT_EQ(Js("DC.RankFromLevel(m.totalLevels)"), "Acolyte I");
	EXPECT_EQ(Js("m.characters.map(function(c){ return c.power; }).join()"), "452,362,527,2475");
	EXPECT_EQ(Js("m.characters.map(function(c){ return c.potionsForNextLevel; }).join()"), "30,20,60,100");
	EXPECT_EQ(Js("m.characters.map(function(c){ return c.skillTier + '/' + c.nextTierLevel; }).join()"), "1/5,1/5,2/10,3/15");
}

TEST_F(DragonLogic, DefaultGearIsHandedOutInRosterOrder)
{
	Js("var m = new DC.MenuModel(); var names = function(c){ return c.gear.map(function(g){ return g ? g.name : '-'; }).join('|'); }");
	EXPECT_EQ(Js("names(m.characters[0])"), "Sword + 8|Plate Armor|Viking Helmet|-");
	EXPECT_EQ(Js("names(m.characters[1])"), "Axe of Decapitation|Common Leather Boots|-|-");
	EXPECT_EQ(Js("names(m.characters[2])"), "Staff of Power|Hat of Wizardry|Common Boots|-");
	EXPECT_EQ(Js("names(m.characters[3])"), "Vorpal Sword|-|-|-");
	EXPECT_EQ(Js("m.unequipped.map(function(g){ return g.name; }).join('|')"),
			  "Common Axe|Common Dagger|Common Amulet|Chainmail Helmet|Knight Helmet|Armored Boots|Chainmail Gauntlets|"
			  "Sword + 10|Gloves of Sneaking|Armor of Invincibility");
}

TEST_F(DragonLogic, AutoEquipAndUnequip)
{
	Js("var m = new DC.MenuModel(); m.AutoEquip()");
	EXPECT_EQ(Js("m.characters[0].gear[3].name"), "Gloves of Sneaking");
	EXPECT_EQ(Js("m.unequipped.length"), "9");
	Js("m.UnequipAll()");
	EXPECT_EQ(Js("m.characters[0].gear.filter(function(g){ return g; }).length"), "0");
	EXPECT_EQ(Js("m.unequipped.length"), "13");
	EXPECT_EQ(Js("m.unequipped[0].rarity"), "Common");
}

TEST_F(DragonLogic, EquipReplacesTheSlotItem)
{
	Js("var m = new DC.MenuModel(); m.selectedSlot = 0; m.Equip(m.unequipped[0])");
	EXPECT_EQ(Js("m.characters[0].gear[0].name"), "Common Axe");
	EXPECT_TRUE(Js("m.unequipped.some(function(g){ return g.name == 'Sword + 8'; })") == "true");
}

TEST_F(DragonLogic, ShopPricesAndFunds)
{
	Js("var m = new DC.MenuModel(); var item = function(id){ return DC.Data().shopItems.find(function(i){ return i.id == id; }); }");
	// free gold: +50
	EXPECT_EQ(Js("m.Purchase(item('ShopItemCoupleOfGoldCoins'))"), "true");
	EXPECT_EQ(Js("m.save.gold"), "550");
	// 250 gold for 50 gems
	EXPECT_EQ(Js("m.Purchase(item('ShopItemPileOfGoldCoins'))"), "true");
	EXPECT_EQ(Js("[m.save.gold, m.save.gems].join()"), "800,0");
	// the 50% bag costs 75 gems: refused, nothing changes
	EXPECT_EQ(Js("m.Purchase(item('ShopItemBagOfGoldCoins'))"), "false");
	EXPECT_EQ(Js("DC.Audio.lastPlayed"), "Warning");
	EXPECT_EQ(Js("[m.save.gold, m.save.gems].join()"), "800,0");
	// gems are USD items: free in the demo
	EXPECT_EQ(Js("m.Purchase(item('ShopItemCoupleOfGems'))"), "true");
	EXPECT_EQ(Js("m.save.gems"), "10");
	// healing potions for gold
	EXPECT_EQ(Js("m.Purchase(item('ShopItemHealingPotion'))"), "true");
	EXPECT_EQ(Js("[m.save.gold, m.save.healthPotions].join()"), "550,11");
	EXPECT_EQ(Js("DC.Audio.lastPlayed"), "Transaction");
}

TEST_F(DragonLogic, LevelUpCostsTenPotionsPerLevel)
{
	Js("var m = new DC.MenuModel()");
	EXPECT_EQ(Js("m.LevelUp()"), "true");
	EXPECT_EQ(Js("[m.character.level, m.save.levelUpPotions, m.character.power, m.totalLevels].join()"), "4,170,602,22");
	Js("m.save.levelUpPotions = 39");
	EXPECT_EQ(Js("m.LevelUp()"), "false");
	EXPECT_EQ(Js("m.character.level"), "4");
	Js("m.ResetLevels()");
	EXPECT_EQ(Js("m.totalLevels"), "0");
	EXPECT_EQ(Js("DC.RankFromLevel(0)"), "Unranked");
	EXPECT_EQ(Js("m.character.potionsForNextLevel"), "10");
}

TEST_F(DragonLogic, MailIsSortedClaimedAndDeleted)
{
	Js("var m = new DC.MenuModel()");
	EXPECT_EQ(Js("m.inbox.map(function(x){ return x.id; }).join()"),
			  "MailMessage6Test,MailMessage7Test,MailMessage3Test,MailMessage1Test,MailMessage2Test,MailMessage5Test,MailMessage4Test");
	Js("m.ClaimMail(m.inbox[0])");
	EXPECT_EQ(Js("m.save.levelUpPotions"), "250");
	Js("m.ClaimMail(m.inbox[0])");
	EXPECT_EQ(Js("m.save.levelUpPotions"), "250");
	Js("m.DeleteMail(m.inbox[3])");
	EXPECT_EQ(Js("[m.inbox.length, m.deleted.length, m.deleted[0].id].join()"), "6,1,MailMessage1Test");
	Js("m.UndeleteMail(m.deleted[0])");
	EXPECT_EQ(Js("m.inbox.length"), "7");
}

TEST_F(DragonLogic, SettingsAreSaved)
{
	Js("var m = new DC.MenuModel(); m.save.musicVolume = 30; m.save.language = 'French'; m.ApplySettings()");
	EXPECT_EQ(Js("DC.Loc.code"), "fr");
	Js("var again = DC.Save.Load()");
	EXPECT_EQ(Js("[again.musicVolume, again.language].join()"), "30,French");
	Js("DC.Loc.SetLanguage('English')");
}

TEST_F(DragonLogic, BattleUnitsMatchTheOriginal)
{
	Js("var b = new DC.BattleModel(1)");
	EXPECT_EQ(Js("b.units.map(function(u){ return u.name + ':' + u.maxHp; }).join()"),
			  "Sir Jarek:200,Witch Giorgia:180,Wolfman Oriz:225,Dragon Rustum:1600");
	EXPECT_EQ(Js("b.units.map(function(u){ return u.abilities.map(function(a){ return a.name + '/' + a.cooldown; }).join('+'); }).join()"),
			  "Wind Slash/6+Tornado Spin/22,Thunderbolt/5+Energy Ball/15,Axe Sparks/3+Earth Shatter/25,Bite/10+Flamethrower/20");
	EXPECT_EQ(Js("b.potions"), "6");
}

TEST_F(DragonLogic, AbilitiesStartOnTheirCooldowns)
{
	Js("var b = new DC.BattleModel(7); var starts = []; DC.Events.On('AbilityStarted', function(e){ starts.push(e.unit.id + ':' + e.ability.index + '@' + b.time.toFixed(2)); });"
	   "b.Start(); for (var i = 0; i < 60*21; i++) b.Update(1/60);");
	// cooldowns run from 0, a unit casts one ability at a time
	EXPECT_EQ(Js("starts.slice(0, 5).join()"), "Wolfman:0@3.00,Witch:0@5.00,Knight:0@6.00,Wolfman:0@8.17,Dragon:0@10.00");
	EXPECT_TRUE(Js("starts.indexOf('Dragon:1@20.00') >= 0").operator==("true"));
}

TEST_F(DragonLogic, DamageRollsStayInTheRanges)
{
	Js("var b = new DC.BattleModel(11); var hits = []; DC.Events.On('HealthChanged', function(e){ hits.push(e.unit.id + ':' + e.value); });"
	   "b.Start(); for (var i = 0; i < 60*30; i++) b.Update(1/60);");
	EXPECT_EQ(Js("hits.every(function(h){ var p = h.split(':'), v = -p[1]; return v >= 10 && v <= 87; })"), "true");
	EXPECT_EQ(Js("hits.filter(function(h){ return h.indexOf('Dragon') == 0; }).length > 3"), "true");
	EXPECT_EQ(Js("b.Unit('Dragon').hp < 1600"), "true");
}

TEST_F(DragonLogic, BattleEndsAndStopsTheWinners)
{
	Js("var b = new DC.BattleModel(3); b.Start(); for (var i = 0; i < 60*200 && !b.over; i++) b.Update(1/60);");
	auto over = Js("b.over");
	ASSERT_TRUE(over == "victory" || over == "defeat") << over.Data();
	if (over == "victory")
		EXPECT_EQ(Js("b.Unit('Dragon').hp"), "0");
	else
		EXPECT_EQ(Js("b.heroes.filter(function(h){ return h.alive; }).length"), "0");
	EXPECT_EQ(Js("b.units.every(function(u){ return !u.castAllowed || !u.alive || b.over == 'victory' && u.team == 'enemy'; })"), "true");
}

TEST_F(DragonLogic, PotionsHealHalfTheMaxHealth)
{
	Js("var b = new DC.BattleModel(5); b.Start(); var k = b.Unit('Knight'); k.hp = 20;");
	EXPECT_EQ(Js("b.UsePotion('Knight')"), "true");
	EXPECT_EQ(Js("[k.hp, b.potions].join()"), "120,5");
	Js("k.hp = 190; b.UsePotion('Knight')");
	EXPECT_EQ(Js("k.hp"), "200");
	Js("var w = b.Unit('Wolfman'); b.ReceiveValue(w, -1000)");
	EXPECT_EQ(Js("b.UsePotion('Wolfman')"), "false");
	EXPECT_EQ(Js("b.potions"), "4");
	EXPECT_EQ(Js("b.Unit('Dragon').targets.map(function(t){ return t.id; }).join()"), "Knight,Witch");
}

TEST_F(DragonLogic, KillingBlowEndsTheBattle)
{
	Js("var b = new DC.BattleModel(5); var won = false; DC.Events.On('BattleWon', function(){ won = true; }); b.Start(); b.ReceiveValue(b.Unit('Dragon'), -2000);");
	EXPECT_EQ(Js("[b.over, won, b.Unit('Dragon').alive].join()"), "victory,true,false");
}
