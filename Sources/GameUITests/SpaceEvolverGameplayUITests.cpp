#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "SpaceEvolver/GameJsBridge.h"
#include "SpaceEvolver/SpaceEvolverBootstrap.h"
#include "o2/Application/Application.h"
#include "o2/Application/Input.h"
#include "o2/Scene/Actor.h"
#include "o2/Scene/Scene.h"
#include "o2/Scripts/ScriptEngine.h"
#include "o2/Scripts/ScriptValue.h"
#include "o2/Utils/FileSystem/FileSystem.h"
#include "o2/Utils/Test/AppTestDriver.h"

using namespace o2;

#if IS_SCRIPTING_SUPPORTED

// Gameplay played through the real renderer: every check is paired with a screenshot, so a
// mechanic that misbehaves on screen (sprites left hanging, entities never cleaned up) is
// visible in Work/ScreenShots as well as caught by the assert
namespace
{
	const String kShotsDir = "TestScreenshots/SpaceEvolver/";

	ScriptValue Eval(const String& code)
	{
		auto res = o2Scripts.Eval(code);
		EXPECT_NE(res.GetValueType(), ScriptValue::ValueType::Error) << res.GetError().Data();
		return res;
	}

	float Num(const String& code) { return Eval(code).ToNumber(); }
	bool Flag(const String& code) { return Eval(code).GetValue<bool>(); }
	String Str(const String& code) { return Eval(code).ToString(); }

	void Shot(const String& name)
	{
		o2FileSystem.FolderCreate(kShotsDir, true);
		EXPECT_TRUE(AppTestDriver::SaveScreenshot(kShotsDir + name));
	}

	// Views are destroyed on the next frame, so counting needs the destruction pass to run first
	int LiveViews(const String& namePart)
	{
		AppTestDriver::PumpFrames(2);
		return (int)Num("SE.run.CountViewsByName('" + namePart + "')");
	}
}

class SpaceEvolverGameplay: public ::testing::Test
{
protected:
	void SetUp() override
	{
		space_evolver::ResetPersistentSave();
		o2Application.SetWindowSize(Vec2I(space_evolver::kScreenWidth, space_evolver::kScreenHeight));
		space_evolver::RegisterGameJsApi();
		space_evolver::BuildBootstrapScene();
		AppTestDriver::PumpFrames(6);

		// These suites exercise the normal run; the tutorial has its own suite
		Eval("SE.meta.profile.tutorialDone = true;");
		Eval("SE.game.StartRun();");
		AppTestDriver::PumpFrames(3);
	}

	void TearDown() override
	{
		o2Scene.Clear(true);
		o2Scene.UpdateDestroyingEntities();
		AppTestDriver::PumpFrames(2);
		space_evolver::ResetPersistentSave();
	}

	// Steps the run itself, without waiting for real frame time to accumulate
	static void Simulate(int frames, float dt = 1.0f/60.0f)
	{
		Eval(String("for (let i = 0; i < ") + (String)frames + "; i++) SE.run.Update(" + (String)dt + ");");
		AppTestDriver::PumpFrames(2);
	}
};

TEST_F(SpaceEvolverGameplay, GatesLeaveNoSpritesBehindWhenTheyExitTheField)
{
	Eval("SE.run.gates = []; SE.run.gateStaticTimer = 1000; SE.run.gateTargetTimer = 1000;"
		 "for (let i = 0; i < 3; i++)"
		 "{"
		 "    let g = SE.run.SpawnStaticGate();"
		 "    g.x = 0; g.y = 300 - i*150;"
		 "}"
		 "SE.run.SpawnTargetGate().y = 100;");

	Simulate(1);
	EXPECT_EQ(LiveViews("gate"), 4) << "all four gates must be on screen at the start";
	Shot("g01_gates_on_field.png");

	Simulate(600); // ten seconds: every gate crosses the bottom edge

	EXPECT_EQ((int)Num("SE.run.gates.length"), 0) << "gates that left the field must leave the logic";
	EXPECT_EQ(LiveViews("gate"), 0) << "and must not leave their sprites hanging on screen";
	Shot("g02_gates_gone.png");
}

TEST_F(SpaceEvolverGameplay, KilledEnemiesLeaveNoGhostSprites)
{
	Eval("SE.run.enemies = []; SE.run.waveTimer = 1000;"
		 "for (let i = 0; i < 4; i++)"
		 "    SE.run.SpawnEnemy('drone', -150 + i*100, 250);");

	Simulate(1);
	EXPECT_EQ(LiveViews("enemy"), 4);
	Shot("g03_enemies_alive.png");

	Eval("for (let i = SE.run.enemies.length - 1; i >= 0; i--)"
		 "    SE.run.DamageEnemy(SE.run.enemies[i], 100000, true);");

	Simulate(2);
	EXPECT_EQ((int)Num("SE.run.enemies.length"), 0);
	EXPECT_EQ(LiveViews("enemy"), 0) << "killed enemies must take their sprites with them";
	Shot("g04_enemies_cleared.png");
}

TEST_F(SpaceEvolverGameplay, EnemiesFlyingPastThePlayerAreCleanedUp)
{
	Eval("SE.run.enemies = []; SE.run.waveTimer = 1000; SE.run.px = 250; SE.run.py = -300;"
		 "for (let i = 0; i < 5; i++)"
		 "    SE.run.SpawnEnemy('drone', -200 + i*40, -SE.H/2 + 40);"); // just above the bottom edge

	Simulate(120);

	EXPECT_EQ((int)Num("SE.run.enemies.length"), 0) << "enemies below the field must be dropped";
	EXPECT_EQ(LiveViews("enemy"), 0) << "and must not leave sprites at the bottom of the screen";
	Shot("g05_enemies_left_field.png");
}

TEST_F(SpaceEvolverGameplay, SplashKillDoesNotDoublePayOrLeaveSprites)
{
	Eval("SE.run.enemies = []; SE.run.waveTimer = 1000; SE.run.coins = 0;"
		 "SE.run.SpawnEnemy('drone', 0, 200);"
		 "SE.run.SpawnEnemy('drone', 30, 210);");

	float reward = Num("SE.cfg.levels.enemyTypes.drone.coins");
	Eval("SE.run.DamageEnemy(SE.run.enemies[0], 100000, true);"
		 "SE.run.SplashDamage(0, 200, 200, 100000, null);"); // the blast also covers the dead one

	Simulate(2);
	EXPECT_FLOAT_EQ(Num("SE.run.coins"), reward*2) << "each enemy pays exactly once";
	EXPECT_EQ(LiveViews("enemy"), 0);
	Shot("g06_splash_cleanup.png");
}

// A browser hands a touch whatever id it likes, and only a mouse is ever cursor zero: the ship
// must follow an active pointer regardless of its id, or dragging does nothing on a phone
TEST_F(SpaceEvolverGameplay, ShipFollowsATouchWithNonZeroCursorId)
{
	const CursorId touchId = 7;

	Eval("SE.run.px = 0; SE.run.py = -200; SE.run.enemies = []; SE.run.waveTimer = 1000;");
	AppTestDriver::PumpFrames(2);

	o2Input.OnCursorPressed(Vec2F(150, -300), touchId);
	AppTestDriver::PumpFrames(2);
	EXPECT_TRUE(Flag("Bridge.IsCursorDown()")) << "a touch must read as an active pointer";

	for (int i = 0; i < 10; i++)
	{
		o2Input.OnCursorMoved(Vec2F(150, -300), touchId);
		AppTestDriver::Wait(0.2f);
	}

	float px = Num("SE.run.px");
	float py = Num("SE.run.py");
	float touchLane = Num("SE.cfg.player.ship.touchShipY");

	o2Input.OnCursorReleased(touchId);
	AppTestDriver::PumpFrames(2);

	EXPECT_NEAR(px, 150.0f, 40.0f) << "the ship must follow the touch horizontally";
	EXPECT_NEAR(py, touchLane, 15.0f) << "a finger puts the ship in the lower lane, close to the touch";
	EXPECT_LT(touchLane, Num("SE.cfg.player.ship.cursorShipY")) << "the touch lane sits below the mouse one";
	EXPECT_FALSE(Flag("Bridge.IsCursorDown()")) << "releasing the touch must stop the drag";
	Shot("g20_touch_drag.png");
}

TEST_F(SpaceEvolverGameplay, EliteEnemyShowsItsHpPlateAndTakesItAway)
{
	Eval("SE.run.enemies = []; SE.run.waveTimer = 1000;"
		 "var seElite = SE.run.SpawnEnemy('tank', 0, 200);");

	Simulate(2);
	ASSERT_TRUE(Flag("seElite.hpLabel != null")) << "an elite enemy must get an HP plate";
	EXPECT_TRUE(Flag("seElite.hpLabel.GetText().indexOf('HP') >= 0"));
	Shot("g10_elite_hp_plate.png");

	Eval("SE.run.DamageEnemy(seElite, 100000, true);");
	Simulate(2);

	EXPECT_EQ(LiveViews("enemy"), 0);
	EXPECT_EQ((int)Num("SE.run.enemies.length"), 0);
	Shot("g11_elite_killed.png");
}

TEST_F(SpaceEvolverGameplay, OrbsAreCollectedAndEvolveTheWeapon)
{
	// Silence the waves so the only orbs on the field are the ones dropped here,
	// and drop them just outside the magnet radius so the pull is what collects them
	Eval("SE.run.orbEntities = []; SE.run.enemies = []; SE.run.gates = [];"
		 "SE.run.waveTimer = 1000; SE.run.gateStaticTimer = 1000; SE.run.gateTargetTimer = 1000;"
		 "SE.run.px = 0; SE.run.py = -200;"
		 "for (let i = 0; i < 40; i++) SE.run.SpawnOrb(0, -80, 30);");

	Simulate(2);
	EXPECT_GT(LiveViews("orb"), 0) << "dropped orbs must be visible";
	Shot("g12_orbs_dropped.png");

	Simulate(180); // three seconds under the magnet

	EXPECT_EQ((int)Num("SE.run.orbEntities.length"), 0) << "orbs near the ship must be collected";
	EXPECT_EQ(LiveViews("orb"), 0) << "collected orbs must take their sprites with them";
	EXPECT_GT((int)Num("SE.run.xpLevel"), 1) << "collecting orbs must raise the in-run level";
	EXPECT_TRUE(Flag("SE.run.CannonEvo().type != 'single'")) << "and evolve the cannon";
	Shot("g13_orbs_collected.png");
}

TEST_F(SpaceEvolverGameplay, PassingAGateConfirmsItOnScreenAndTakesItAway)
{
	// Waves are silenced so the only effects on screen come from the gate itself
	Eval("SE.run.gates = []; SE.run.enemies = []; SE.run.fx.items = [];"
		 "SE.run.waveTimer = 1000; SE.run.gateStaticTimer = 1000; SE.run.gateTargetTimer = 1000;"
		 "SE.run.px = 0; SE.run.py = -200;"
		 "var seGate = SE.run.SpawnStaticGate();"
		 "seGate.buff = { type: 'damage_boost', pct: 10, label: '+10% DMG' };"
		 "seGate.x = 0; seGate.y = 100; seGate.speed = 200;");

	Simulate(2);
	float before = Num("SE.run.CannonDamage()");
	EXPECT_EQ(LiveViews("gate"), 1);
	Shot("g14_gate_incoming.png");

	// Step until the ship passes the gate, so the screenshot catches the confirmation burst
	for (int i = 0; i < 200 && !Flag("seGate.used"); i++)
		Eval("SE.run.Update(1/60);");
	AppTestDriver::PumpFrames(2);

	EXPECT_TRUE(Flag("seGate.used")) << "the ship must pass through the gate";
	EXPECT_NEAR(Num("SE.run.CannonDamage()"), before*1.1f, 0.01f) << "the buff must raise the damage number";
	EXPECT_GT((int)Num("SE.run.fx.Count()"), 0) << "the pass must be confirmed with sparks and a caption";
	Shot("g15_gate_buff_applied.png");

	EXPECT_EQ((int)Num("SE.run.gates.length"), 0) << "a passed gate must be spent";
	EXPECT_EQ(LiveViews("gate"), 0) << "and must vanish from the screen right away";

	Simulate(150); // the confirmation is short-lived
	EXPECT_EQ((int)Num("SE.run.fx.Count()"), 0);
	EXPECT_EQ(LiveViews("particle"), 0) << "spark sprites must be cleaned up";
	Shot("g18_gate_gone.png");
}

TEST_F(SpaceEvolverGameplay, KillingAnEnemyPlaysAnExplosion)
{
	Eval("SE.run.enemies = []; SE.run.waveTimer = 1000; SE.run.fx.items = [];"
		 "var seBoom = SE.run.SpawnEnemy('drone', 0, 150);"
		 "SE.run.DamageEnemy(seBoom, 100000, true);");

	Simulate(2);
	EXPECT_GT((int)Num("SE.run.fx.Count()"), 0) << "a kill must throw sparks";
	EXPECT_GT(LiveViews("particle"), 0) << "and they must be visible";
	Shot("g19_enemy_explosion.png");

	Simulate(120);
	EXPECT_EQ((int)Num("SE.run.fx.Count()"), 0) << "sparks must expire";
	EXPECT_EQ(LiveViews("particle"), 0);
}

TEST_F(SpaceEvolverGameplay, SecondRunStartsFromACleanField)
{
	Simulate(600);
	Eval("SE.run.DamagePlayer(SE.run.maxHp + 1);"); // lose, then go back and start again
	AppTestDriver::PumpFrames(3);
	ASSERT_EQ(Str("SE.run.result"), "lose");
	Shot("g16_defeat.png");

	Eval("SE.game.EndRunToHangar();");
	AppTestDriver::PumpFrames(4);
	Eval("SE.game.StartRun();");
	AppTestDriver::PumpFrames(3);

	EXPECT_EQ((int)Num("SE.run.enemies.length"), 0);
	EXPECT_EQ((int)Num("SE.run.gates.length"), 0);
	EXPECT_EQ(LiveViews("enemy"), 0) << "the new run must not inherit sprites from the old one";
	EXPECT_EQ(LiveViews("gate"), 0);
	EXPECT_EQ((int)Num("SE.game.root.GetChildren().length"), 3)
		<< "only bgRoot, run and hud may live under the game actor";
	Shot("g17_second_run_clean.png");
}

// A real playthrough: the ship is dragged around while waves, gates and orbs come and go
TEST_F(SpaceEvolverGameplay, LongPlaythroughKeepsTheSceneClean)
{
	AppTestDriver::PressCursor(Vec2F(0, -300));
	AppTestDriver::MoveCursor(Vec2F(-150, -320), 6);
	Simulate(300);
	Shot("g07_playthrough_5s.png");

	AppTestDriver::MoveCursor(Vec2F(160, -280), 8);
	Simulate(900);
	Shot("g08_playthrough_20s.png");

	AppTestDriver::MoveCursor(Vec2F(-40, -360), 8);
	Simulate(1200);
	AppTestDriver::ReleaseCursor();
	Shot("g09_playthrough_40s.png");

	EXPECT_FALSE(Flag("SE.run.over")) << "the run must survive 40 seconds of normal play";
	EXPECT_GT((int)Num("SE.run.kills"), 0) << "autofire must be killing enemies";

	// Every sprite on screen belongs to a live entity: no orphans accumulate over a long run
	int gateViews = LiveViews("gate");
	int enemyViews = LiveViews("enemy");
	EXPECT_EQ(gateViews, (int)Num("SE.run.gates.length")) << "gate sprites must match live gates";
	EXPECT_EQ(enemyViews, (int)Num("SE.run.enemies.length")) << "enemy sprites must match live enemies";
	EXPECT_LT((int)Num("SE.run.root.GetChildren().length"), 120) << "actor count must stay bounded";
}

#endif // IS_SCRIPTING_SUPPORTED
