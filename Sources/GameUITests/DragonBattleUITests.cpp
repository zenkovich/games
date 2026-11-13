#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "o2/Application/Application.h"
#include "o2/Assets/Assets.h"
#include "o2/Scene/Scene.h"
#include "o2/Scene/UI/Widget.h"
#include "o2/Scene/UI/WidgetLayout.h"
#include "o2/Scripts/ScriptEngine.h"
#include "o2/Utils/Bitmap/Bitmap.h"
#include "o2/Utils/FileSystem/FileSystem.h"
#include "o2/Utils/Test/AppTestDriver.h"
#include "DragonCrashers/DragonBridge.h"

using namespace o2;

// The ported battle in the real Game scene: HUD, units, abilities on their cooldowns, potions, pause, end screens
class DragonBattle: public ::testing::Test
{
protected:
	void SetUp() override
	{
		o2Application.SetWindowSize(Vec2I(1920, 1080));
		dragon::RegisterDragonJsApi();
		o2Scene.Load(o2Assets.GetBuiltAssetsPath() + String("DragonCrashers/Game.scn"));
		AppTestDriver::PumpFrames(3);
	}

	void TearDown() override
	{
		o2Scene.Clear(true);
		o2Scene.UpdateDestroyingEntities();
		AppTestDriver::PumpFrames(2);
	}

	String Js(const String& expr) { return o2Scripts.Eval(expr).ToString(); }
	float JsF(const String& expr) { return (float)Js(expr); }

	Ref<Widget> W(const String& name)
	{
		auto ui = o2Scene.FindActor("UI");
		return ui ? DynamicCast<Widget>(ui->FindChild(name)) : nullptr;
	}

	Vec2F ScreenPos(const Ref<Widget>& w)
	{
		Vec2F screen = (Vec2F)o2Application.GetContentSize();
		float k = Math::Min(screen.x/1920.0f, screen.y/1080.0f);
		return w->layout->GetWorldRect().Center()*k;
	}

	void Shot(const String& name)
	{
		o2FileSystem.FolderCreate("TestScreenshots/DragonBattle", true);
		auto shot = AppTestDriver::TakeScreenshot();
		ASSERT_TRUE(shot);
		shot->Save("TestScreenshots/DragonBattle/" + name + ".png", Bitmap::ImageType::Png);
	}
};

TEST_F(DragonBattle, StartsWithFullHealthAndSixPotions)
{
	EXPECT_EQ(Js("DC.battle.model.Unit('Knight').hp"), "200");
	EXPECT_EQ(Js("DC.battle.model.Unit('Witch').hp"), "180");
	EXPECT_EQ(Js("DC.battle.model.Unit('Wolfman').hp"), "225");
	EXPECT_EQ(Js("DC.battle.model.Unit('Dragon').hp"), "1600");
	EXPECT_EQ(Js("DC.battle.model.potions"), "6");
	AppTestDriver::Wait(1.3f);
	Shot("game_t01.5");
}

TEST_F(DragonBattle, AbilitiesDamageTheDragon)
{
	AppTestDriver::Wait(5.0f);
	Shot("game_t05.0");
	// the Wolfman's Axe Sparks is ready at 3 s and hits at +1.25 s
	EXPECT_LT(JsF("DC.battle.model.Unit('Dragon').hp"), 1600.0f);
	AppTestDriver::Wait(7.0f);
	Shot("game_t12.0");
	EXPECT_LT(JsF("DC.battle.model.Unit('Dragon').hp"), 1560.0f);
}

TEST_F(DragonBattle, PotionDragHealsHero)
{
	Js("DC.battle.model.Unit('Knight').hp = 50; DC.battle.view._UpdateBar(DC.battle.view.units.Knight.bar)");
	auto potion = W("healing-potion__space");
	ASSERT_TRUE(potion);
	auto knightSlot = Js("(function(){ var s = DC.battle.view.slots.find(function(s){ return s.unit.id == 'Knight'; }); return s.center.x + ',' + s.center.y; })()").Split(",");
	Vec2F to((float)knightSlot[0], (float)knightSlot[1]);
	AppTestDriver::Drag(ScreenPos(potion), to);
	AppTestDriver::PumpFrames(3);
	EXPECT_EQ(Js("DC.battle.model.potions"), "5");
	EXPECT_GE(JsF("DC.battle.model.Unit('Knight').hp"), 150.0f);
}

TEST_F(DragonBattle, PauseStopsTheBattle)
{
	AppTestDriver::Wait(0.5f);
	AppTestDriver::Click(ScreenPos(W("pause__button")));
	AppTestDriver::Wait(1.5f);
	EXPECT_EQ(Js("DC.battle.view.timeScale"), "0");
	EXPECT_TRUE(W("PauseScreen")->IsEnabledInHierarchy());
	float t = JsF("DC.battle.model.time");
	AppTestDriver::Wait(1.0f);
	EXPECT_FLOAT_EQ(JsF("DC.battle.model.time"), t);
	Shot("game_pause");
	AppTestDriver::Click(ScreenPos(W("pause__resume-button")));
	AppTestDriver::Wait(0.5f);
	EXPECT_EQ(Js("DC.battle.view.timeScale"), "1");
	EXPECT_FALSE(W("PauseScreen")->IsEnabledInHierarchy());
}

TEST_F(DragonBattle, KillingTheDragonShowsVictory)
{
	AppTestDriver::Wait(0.5f);
	Js("DC.battle.model.ReceiveValue(DC.battle.model.Unit('Dragon'), -5000)");
	EXPECT_EQ(Js("DC.battle.model.over"), "victory");
	AppTestDriver::Wait(1.5f);
	Shot("game_win_t1.5");
	AppTestDriver::Wait(3.5f);
	EXPECT_TRUE(W("GameWinScreen")->IsEnabledInHierarchy());
	Shot("game_end_GameWinScreen");
}

TEST_F(DragonBattle, LosingAllHeroesShowsDefeat)
{
	AppTestDriver::Wait(0.5f);
	Js("['Knight','Witch','Wolfman'].forEach(function(id){ DC.battle.model.ReceiveValue(DC.battle.model.Unit(id), -5000); })");
	EXPECT_EQ(Js("DC.battle.model.over"), "defeat");
	AppTestDriver::Wait(2.8f);
	EXPECT_TRUE(W("GameLoseScreen")->IsEnabledInHierarchy());
	Shot("game_end_GameLoseScreen");
}

// Tool for the lighting bake: the battle world without UI, effects and baked light, as the Unity world capture
TEST_F(DragonBattle, DISABLED_RenderWorldForLightBake)
{
	for (auto name : { "UI", "FX", "Lighting" })
	{
		if (auto actor = o2Scene.FindActor(name))
			actor->SetEnabled(false);
	}
	for (float t : { 0.5f, 2.0f })
	{
		AppTestDriver::Wait(t - Math::Min(t, 0.5f) + (t == 0.5f ? 0.45f : 0.0f));
		Shot(String::Format("world_t%04.1f", t));
	}
}

// Tool: every ability effect at its peak, for a visual check
TEST_F(DragonBattle, DISABLED_AbilityFxGallery)
{
	struct Shot_ { const char* unit; int ability; float at; const char* name; };
	for (auto s : { Shot_{ "Knight", 0, 0.9f, "fx_knight_windslash" }, Shot_{ "Knight", 1, 1.2f, "fx_knight_tornado" },
					Shot_{ "Witch", 0, 1.0f, "fx_witch_thunderbolt" }, Shot_{ "Witch", 1, 1.3f, "fx_witch_energyball" },
					Shot_{ "Wolfman", 0, 1.1f, "fx_wolfman_axesparks" }, Shot_{ "Wolfman", 1, 2.6f, "fx_wolfman_earthshatter" },
					Shot_{ "Dragon", 1, 1.4f, "fx_dragon_firebreath" } })
	{
		Js(String::Format("(function(){ var b = DC.battle.model; b.units.forEach(function(u){ u.abilities.forEach(function(a){ a.active = false; }); u.queue = []; });"
						  "var u = b.Unit('%s'); u.current = null; u.queue.push(u.abilities[%d]); })()", s.unit, s.ability));
		AppTestDriver::Wait(s.at);
		Shot(s.name);
		AppTestDriver::Wait(2.5f);
	}
}
