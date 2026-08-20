#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "SpaceEvolver/GameJsBridge.h"
#include "o2/EngineSettings.h"
#include "o2/Scripts/ScriptEngine.h"
#include "o2/Scripts/ScriptValue.h"
#include "o2/Utils/FileSystem/FileSystem.h"

using namespace o2;

#if IS_SCRIPTING_SUPPORTED

// Headless simulation of the whole game logic: the JS modules run without any view,
// so runs can be stepped frame by frame and the meta profile inspected directly
namespace
{
	class SpaceEvolverLogic: public ::testing::Test
	{
	protected:
		void SetUp() override
		{
			space_evolver::ResetPersistentSave();
			space_evolver::RegisterGameJsApi();

			Eval("Bridge.RunScript('SE_Core.js');"
				 "Bridge.RunScript('SE_Configs.js');"
				 "Bridge.RunScript('SE_Meta.js');"
				 "Bridge.RunScript('SE_Fx.js');"
				 "Bridge.RunScript('SE_Tutorial.js');"
				 "Bridge.RunScript('SE_Run.js');"
				 "Bridge.RunScript('SE_Hangar.js');"
				 "SE.LoadConfigs();"
				 "SE.meta = new SE.Meta();"
				 "SE.meta.Load();"
				 "SE.meta.profile.tutorialDone = true;"); // tutorial runs get it back to false
		}

		void TearDown() override
		{
			Eval("SE.run = null; SE.meta = null;");
			space_evolver::ResetPersistentSave();
		}

		static ScriptValue Eval(const String& code)
		{
			auto res = o2Scripts.Eval(code);
			EXPECT_NE(res.GetValueType(), ScriptValue::ValueType::Error) << res.GetError().Data();
			return res;
		}

		static float Num(const String& code) { return Eval(code).ToNumber(); }
		static bool Flag(const String& code) { return Eval(code).GetValue<bool>(); }
		static String Str(const String& code) { return Eval(code).ToString(); }

		// Creates a fresh run and steps it with a fixed delta
		static void StartRun() { Eval("SE.run = new SE.Run({ EndRunToHangar: function(){} }); SE.run.Start();"); }
		static void Step(int frames, float dt = 1.0f/60.0f)
		{
			Eval(String("for (let i = 0; i < ") + (String)frames + "; i++) SE.run.Update(" + (String)dt + ");");
		}
	};
}

TEST_F(SpaceEvolverLogic, ConfigsLoaded)
{
	EXPECT_TRUE(Flag("SE.cfg.player != null && SE.cfg.ships != null && SE.cfg.weapons != null &&"
					 "SE.cfg.gates != null && SE.cfg.equipment != null && SE.cfg.levels != null"));

	EXPECT_EQ((int)Num("SE.cfg.weapons.cannon.length"), 4);
	EXPECT_EQ((int)Num("SE.cfg.ships.ships.length"), 4);
	EXPECT_EQ(Str("SE.cfg.weapons.cannon[3].type"), "laser");
}

// A packaged build (WebAssembly, mobile) ships only the built asset tree. Reading configs or
// script modules from the source Assets folder works on a dev machine and silently fails there
TEST_F(SpaceEvolverLogic, ConfigsAndModulesLoadWithoutTheSourceAssetsFolder)
{
	SetAssetsPathOverride("no_source_assets_here/");

	Eval("SE.cfg = null;"
		 "Bridge.RunScript('SE_Configs.js');"
		 "SE.LoadConfigs();");

	EXPECT_TRUE(Flag("SE.cfg != null && SE.cfg.player != null && SE.cfg.levels != null"))
		<< "configs must come from the built assets, not from the source folder";
	EXPECT_TRUE(Flag("typeof SE.Fx === 'function' || typeof SE.Fx === 'object'"))
		<< "script modules must be loadable from the built assets too";

	SetAssetsPathOverride("");
}

TEST_F(SpaceEvolverLogic, UpgradeCostGrowsGeometrically)
{
	float first = Num("SE.meta.UpgradeCost('mainAttack')");
	Eval("SE.meta.profile.coins = 100000; SE.meta.BuyUpgrade('mainAttack');");
	float second = Num("SE.meta.UpgradeCost('mainAttack')");

	EXPECT_FLOAT_EQ(first, 60.0f);
	EXPECT_EQ((int)second, (int)Math::Ceil(60.0f*1.4f));
	EXPECT_EQ((int)Num("SE.meta.profile.upgrades.mainAttack"), 1);
}

TEST_F(SpaceEvolverLogic, UpgradeRaisesVisibleDamage)
{
	float before = Num("SE.meta.Stats().damage");
	Eval("SE.meta.profile.coins = 100000;"
		 "for (let i = 0; i < 4; i++) SE.meta.BuyUpgrade('mainAttack');");
	float after = Num("SE.meta.Stats().damage");

	EXPECT_GT(after, before);
	EXPECT_FLOAT_EQ(after, 12.0f + 4*5.0f);
}

TEST_F(SpaceEvolverLogic, CannotBuyWithoutCoins)
{
	Eval("SE.meta.profile.coins = 0;");
	EXPECT_FALSE(Flag("SE.meta.BuyUpgrade('health')"));
	EXPECT_EQ((int)Num("SE.meta.profile.upgrades.health"), 0);
}

TEST_F(SpaceEvolverLogic, ShipUnlockConsumesBlueprints)
{
	EXPECT_FALSE(Flag("SE.meta.IsShipUnlocked('falcon')"));
	EXPECT_FALSE(Flag("SE.meta.UnlockShip('falcon')"));

	Eval("SE.meta.AddBlueprints('falcon', 10);");
	EXPECT_TRUE(Flag("SE.meta.UnlockShip('falcon')"));
	EXPECT_TRUE(Flag("SE.meta.IsShipUnlocked('falcon')"));
	EXPECT_EQ((int)Num("SE.meta.Blueprints('falcon')"), 0);

	EXPECT_TRUE(Flag("SE.meta.SelectShip('falcon')"));
	EXPECT_FLOAT_EQ(Num("SE.meta.Stats().rocketCooldownMult"), 0.8f);
}

TEST_F(SpaceEvolverLogic, DreadnoughtAndPlasmaModifiersApply)
{
	float baseHp = Num("SE.meta.Stats().hp");
	float baseDmg = Num("SE.meta.Stats().damage");

	Eval("SE.meta.AddBlueprints('dreadnought', 10); SE.meta.UnlockShip('dreadnought');"
		 "SE.meta.SelectShip('dreadnought');");
	EXPECT_FLOAT_EQ(Num("SE.meta.Stats().hp"), baseHp*1.5f);

	Eval("SE.meta.AddBlueprints('plasma_core', 15); SE.meta.UnlockShip('plasma_core');"
		 "SE.meta.SelectShip('plasma_core');");
	EXPECT_FLOAT_EQ(Num("SE.meta.Stats().damage"), baseDmg*1.3f);
}

TEST_F(SpaceEvolverLogic, MergeThreeItemsRaisesRarity)
{
	Eval("SE.meta.AddItem('engine', 'common');"
		 "SE.meta.AddItem('engine', 'common');");
	EXPECT_FALSE(Flag("SE.meta.CanMerge('engine', 'common')"));

	Eval("SE.meta.AddItem('engine', 'common');");
	EXPECT_TRUE(Flag("SE.meta.CanMerge('engine', 'common')"));
	EXPECT_TRUE(Flag("SE.meta.Merge('engine', 'common')"));

	EXPECT_EQ((int)Num("SE.meta.CountItems('engine', 'common')"), 0);
	EXPECT_EQ((int)Num("SE.meta.CountItems('engine', 'uncommon')"), 1);
	EXPECT_EQ(Str("SE.meta.profile.equipped.engine.rarity"), "uncommon");
}

TEST_F(SpaceEvolverLogic, EquipmentBonusAndPerksAffectStats)
{
	float baseDmg = Num("SE.meta.Stats().damage");

	Eval("SE.meta.AddItem('weapon_chip', 'epic'); SE.meta.AutoEquipBest();");
	EXPECT_FLOAT_EQ(Num("SE.meta.Stats().damage"), baseDmg*1.35f);
	EXPECT_TRUE(Flag("SE.meta.Stats().perks.crit != null"));

	Eval("SE.meta.AddItem('armor', 'legendary'); SE.meta.AutoEquipBest();");
	EXPECT_TRUE(Flag("SE.meta.Stats().perks.reflect != null"));
}

TEST_F(SpaceEvolverLogic, OfflineIncomeIsCapped)
{
	Eval("SE.meta.profile.coins = 0;"
		 "SE.meta.profile.upgrades.offlineIncome = 2;"          // 2 coins/sec
		 "SE.meta.profile.lastSeenTs = Bridge.GetTimeSec() - 100000;"); // way beyond the 8h cap

	float income = Num("SE.meta.CollectOfflineIncome()");
	EXPECT_FLOAT_EQ(income, 8*3600*2);
	EXPECT_FLOAT_EQ(Num("SE.meta.profile.coins"), income);

	// second call right away yields nothing
	EXPECT_LT(Num("SE.meta.CollectOfflineIncome()"), 5.0f);
}

TEST_F(SpaceEvolverLogic, ProfilePersistsBetweenSessions)
{
	Eval("SE.meta.profile.coins = 4321; SE.meta.AddBlueprints('falcon', 7); SE.meta.Save();"
		 "SE.meta = new SE.Meta(); SE.meta.Load();");

	EXPECT_GE((int)Num("SE.meta.profile.coins"), 4321);
	EXPECT_EQ((int)Num("SE.meta.Blueprints('falcon')"), 7);
}

TEST_F(SpaceEvolverLogic, WeaponEvolvesWithXpLevels)
{
	StartRun();
	EXPECT_EQ(Str("SE.run.CannonEvo().type"), "single");
	EXPECT_EQ((int)Num("SE.run.RocketEvo().count"), 1);

	Eval("SE.run.CheatSetLevel(2);");
	EXPECT_EQ(Str("SE.run.CannonEvo().type"), "double");

	Eval("SE.run.CheatSetLevel(3);");
	EXPECT_EQ((int)Num("SE.run.RocketEvo().count"), 3);
	EXPECT_GT(Num("SE.run.RocketEvo().splashRadius"), 0.0f);

	Eval("SE.run.CheatSetLevel(4);");
	EXPECT_EQ(Str("SE.run.CannonEvo().type"), "fan");

	Eval("SE.run.CheatSetLevel(6);");
	EXPECT_EQ(Str("SE.run.CannonEvo().type"), "laser");
	EXPECT_GT(Num("SE.run.CannonDamage()"), Num("SE.meta.Stats().damage"));
}

TEST_F(SpaceEvolverLogic, CollectingOrbsLevelsUp)
{
	StartRun();
	int needed = (int)Num("SE.run.orbsNeeded");
	Eval(String("for (let i = 0; i < ") + (String)needed + "; i++) SE.run.CollectOrb();");

	EXPECT_EQ((int)Num("SE.run.xpLevel"), 2);
	EXPECT_GT(Num("SE.run.orbsNeeded"), (float)needed);
}

TEST_F(SpaceEvolverLogic, WavesSpawnEnemiesAndBulletsKillThem)
{
	StartRun();
	Step(240); // 4 seconds: first wave starts spawning and the cannon fires

	EXPECT_GT((int)Num("SE.run.enemies.length + SE.run.kills"), 0)
		<< "waves must produce enemies";
	EXPECT_GT((int)Num("SE.run.bullets.length + SE.run.kills"), 0)
		<< "autofire must produce bullets";

	Step(1200);
	EXPECT_GT((int)Num("SE.run.kills"), 0) << "bullets must kill enemies over time";
	EXPECT_GT(Num("SE.run.coins"), 0.0f) << "kills must give coins";
}

TEST_F(SpaceEvolverLogic, TargetGateDropsOrbsWhenDestroyed)
{
	StartRun();
	Eval("SE.run.gates = []; var seGate = SE.run.SpawnTargetGate(); SE.run.orbEntities = [];"
		 "SE.run.DamageEnemy(seGate, seGate.hp + 1, false);");

	int orbs = (int)Num("SE.run.orbEntities.length");
	EXPECT_GE(orbs, 5);
	EXPECT_LE(orbs, 10);
	EXPECT_EQ((int)Num("SE.run.gates.length"), 0);
}

TEST_F(SpaceEvolverLogic, StaticGateAppliesBuffOnce)
{
	StartRun();
	Eval("SE.run.gates = [];"
		 "var seSg = SE.run.SpawnStaticGate();"
		 "seSg.buff = { type: 'damage_boost', pct: 10 };"
		 "seSg.x = SE.run.px; seSg.y = SE.run.py; seSg.speed = 0;");

	float before = Num("SE.run.CannonDamage()");
	Step(2);
	float after = Num("SE.run.CannonDamage()");

	EXPECT_NEAR(after, before*1.1f, 0.001f);
	EXPECT_TRUE(Flag("seSg.used"));

	Step(10);
	EXPECT_NEAR(Num("SE.run.CannonDamage()"), after, 0.001f) << "buff must apply only once";
}

TEST_F(SpaceEvolverLogic, EliteEnemyGetsHpLabel)
{
	StartRun();
	Eval("SE.run.enemies = []; var seDrone = SE.run.SpawnEnemy('drone', 0, 300);"
		 "var seTank = SE.run.SpawnEnemy('tank', 0, 300);");

	EXPECT_FALSE(Flag("seDrone.hpLabel === true")) << "weak enemies must stay clean";
	EXPECT_TRUE(Flag("seTank.hpLabel === true")) << "elite enemies show HP";
	EXPECT_TRUE(Flag("SE.run.IsElite(100000)"));
}

TEST_F(SpaceEvolverLogic, BossSpawnsAfterWavesAndGrantsLoot)
{
	StartRun();
	Eval("SE.run.CheatSkipToBoss();");
	Step(2);

	EXPECT_TRUE(Flag("SE.run.boss != null"));
	EXPECT_FLOAT_EQ(Num("SE.run.boss.maxHp"), 2500.0f);

	Step(240); // boss shoots volleys at the player
	EXPECT_GT((int)Num("SE.run.enemyBullets.length"), 0);

	float coinsBefore = Num("SE.meta.profile.coins");
	Eval("SE.run.CheatKillBoss();");

	EXPECT_TRUE(Flag("SE.run.over"));
	EXPECT_EQ(Str("SE.run.result"), "win");
	EXPECT_GT(Num("SE.meta.profile.coins"), coinsBefore);
	EXPECT_GT((int)Num("SE.meta.Blueprints(SE.run.blueprintShip)"), 0);
}

TEST_F(SpaceEvolverLogic, PlayerDeathEndsRunAndKeepsCoins)
{
	StartRun();
	Eval("SE.run.coins = 500;");
	float metaBefore = Num("SE.meta.profile.coins");

	Eval("SE.run.DamagePlayer(SE.run.maxHp + 1);");

	EXPECT_TRUE(Flag("SE.run.over"));
	EXPECT_EQ(Str("SE.run.result"), "lose");
	EXPECT_FLOAT_EQ(Num("SE.meta.profile.coins"), metaBefore + 500);
}

TEST_F(SpaceEvolverLogic, MagnetPullsOrbsToPlayer)
{
	StartRun();
	Eval("SE.run.orbEntities = []; SE.run.px = 0; SE.run.py = 0;"
		 "SE.run.SpawnOrb(0, SE.meta.Stats().magnetRadius - 10, 0);");

	float before = Num("SE.run.orbEntities[0].y");
	Step(10);
	EXPECT_TRUE(Flag("SE.run.orbEntities.length == 0 || SE.run.orbEntities[0].y < " + (String)before))
		<< "orb must be pulled toward the ship";
}

// Entity lifetime invariants: nothing may be skipped or paid for twice when several
// objects leave the field or die in the same frame
TEST_F(SpaceEvolverLogic, GatesLeavingTheFieldDoNotSkipTheirNeighbours)
{
	StartRun();
	Eval("SE.run.gates = [];"
		 "var seG0 = SE.run.SpawnStaticGate(); seG0.y = -SE.H/2 - 100; seG0.speed = 0;"
		 "var seG1 = SE.run.SpawnStaticGate(); seG1.y = 0; seG1.speed = 0;"
		 "var seG2 = SE.run.SpawnStaticGate(); seG2.y = -SE.H/2 - 100; seG2.speed = 0;"
		 "SE.run.gateStaticTimer = 1000; SE.run.gateTargetTimer = 1000;");

	Step(1);

	EXPECT_EQ((int)Num("SE.run.gates.length"), 1) << "only the on-screen gate may survive";
	EXPECT_TRUE(Flag("SE.run.gates[0] === seG1")) << "the surviving gate must be the on-screen one";
}

TEST_F(SpaceEvolverLogic, EnemiesLeavingTheFieldDoNotSkipTheirNeighbours)
{
	StartRun();
	Eval("SE.run.enemies = [];"
		 "var seE0 = SE.run.SpawnEnemy('drone', -100, -SE.H/2 - 100);"
		 "var seE1 = SE.run.SpawnEnemy('drone', 100, SE.H/2 - 100);"
		 "var seE2 = SE.run.SpawnEnemy('drone', 0, -SE.H/2 - 100);"
		 "SE.run.waveTimer = 1000;");

	Step(1);

	EXPECT_EQ((int)Num("SE.run.enemies.length"), 1) << "only the on-screen enemy may survive";
	EXPECT_TRUE(Flag("SE.run.enemies[0] === seE1")) << "the surviving enemy must be the on-screen one";
}

TEST_F(SpaceEvolverLogic, EnemyKilledTwiceInOneFrameIsPaidOnce)
{
	StartRun();
	Eval("SE.run.enemies = []; SE.run.coins = 0;"
		 "var seVictim = SE.run.SpawnEnemy('drone', 0, 200);");

	float reward = Num("SE.cfg.levels.enemyTypes.drone.coins");
	Eval("SE.run.DamageEnemy(seVictim, seVictim.hp + 1, false);"
		 "SE.run.DamageEnemy(seVictim, 1000, false);"); // splash from the same volley

	EXPECT_FLOAT_EQ(Num("SE.run.coins"), reward) << "a dead enemy must not pay its loot twice";
	EXPECT_EQ((int)Num("SE.run.enemies.length"), 0);
}

TEST_F(SpaceEvolverLogic, DeadEnemiesAreNoLongerTargetable)
{
	StartRun();
	Eval("SE.run.enemies = []; SE.run.px = 0; SE.run.py = 0;"
		 "var seDead = SE.run.SpawnEnemy('drone', 0, 100);"
		 "SE.run.DamageEnemy(seDead, seDead.hp + 1, false);");

	EXPECT_TRUE(Flag("SE.run.NearestEnemy() === null")) << "rockets must not home onto a dead enemy";
	EXPECT_TRUE(Flag("SE.run.FindHitTarget(0, 100, 8) === null")) << "bullets must not hit a dead enemy";
}

TEST_F(SpaceEvolverLogic, DestroyedTargetGateStopsBeingHittable)
{
	StartRun();
	Eval("SE.run.gates = []; SE.run.orbEntities = [];"
		 "var seTg = SE.run.SpawnTargetGate(); seTg.x = 0; seTg.y = 100;"
		 "SE.run.DamageEnemy(seTg, seTg.hp + 1, false);");

	EXPECT_EQ((int)Num("SE.run.gates.length"), 0);
	EXPECT_TRUE(Flag("SE.run.FindHitTarget(0, 100, 8) === null")) << "a destroyed gate must stop absorbing bullets";
}

TEST_F(SpaceEvolverLogic, LongRunKeepsEntityCountsBounded)
{
	StartRun();
	Step(3600); // a minute of play

	EXPECT_LE((int)Num("SE.run.gates.length"), 4) << "gates must leave the field";
	EXPECT_LE((int)Num("SE.run.bullets.length"), 60);
	EXPECT_LE((int)Num("SE.run.orbEntities.length"), 200);
	EXPECT_LE((int)Num("SE.run.enemies.length"), 30);
}

// Tutorial: four steps that only advance when the player actually performs them
TEST_F(SpaceEvolverLogic, TutorialWalksThroughItsStepsAndFinishes)
{
	Eval("SE.meta.profile.tutorialDone = false;");
	StartRun();

	ASSERT_TRUE(Flag("SE.run.tutorial != null")) << "a fresh profile must get the tutorial";
	EXPECT_EQ(Str("SE.run.tutorial.CurrentStep().id"), "drag");

	Step(30);
	EXPECT_EQ(Str("SE.run.tutorial.CurrentStep().id"), "drag") << "the step waits for the player";
	EXPECT_EQ((int)Num("SE.run.enemies.length"), 0) << "waves are held back during the tutorial";

	Eval("SE.run.px += 120;"); // the player drags the ship
	Step(1);
	EXPECT_EQ(Str("SE.run.tutorial.CurrentStep().id"), "shoot");
	EXPECT_EQ((int)Num("SE.run.enemies.length"), 1) << "the shooting step must provide a target";

	Eval("SE.run.DamageEnemy(SE.run.enemies[0], 100000, false);");
	Step(1);
	EXPECT_EQ(Str("SE.run.tutorial.CurrentStep().id"), "gate");
	EXPECT_EQ((int)Num("SE.run.gates.length"), 1) << "the gate step must provide a gate";

	Eval("var seTutGate = SE.run.gates[0];"
		 "seTutGate.x = SE.run.px; seTutGate.y = SE.run.py; seTutGate.speed = 0;");
	Step(2);
	EXPECT_EQ(Str("SE.run.tutorial.CurrentStep().id"), "orbs");

	Eval("for (let i = 0; i < 40; i++) SE.run.CollectOrb();");
	Step(1);

	EXPECT_TRUE(Flag("SE.run.tutorial.done"));
	EXPECT_TRUE(Flag("SE.meta.profile.tutorialDone")) << "finishing must be remembered in the profile";
}

TEST_F(SpaceEvolverLogic, TutorialIsSkippedOnceItIsDone)
{
	Eval("SE.meta.profile.tutorialDone = true;");
	StartRun();

	EXPECT_TRUE(Flag("SE.run.tutorial === undefined || SE.run.tutorial === null"));

	Step(240);
	EXPECT_GT((int)Num("SE.run.enemies.length + SE.run.kills"), 0) << "waves must run normally";
}

// Flying through a gate must confirm itself and take the gate away
TEST_F(SpaceEvolverLogic, PassingAGateConfirmsItAndRemovesIt)
{
	StartRun();
	// Silence the waves: a kill during the wait would add explosion effects of its own
	Eval("SE.run.gates = []; SE.run.enemies = []; SE.run.fx.items = [];"
		 "SE.run.waveTimer = 1000; SE.run.gateStaticTimer = 1000; SE.run.gateTargetTimer = 1000;"
		 "var sePg = SE.run.SpawnStaticGate();"
		 "sePg.buff = { type: 'damage_boost', pct: 10, label: '+10% DMG' };"
		 "sePg.x = SE.run.px; sePg.y = SE.run.py; sePg.speed = 0;");

	float before = Num("SE.run.CannonDamage()");
	Step(2);

	EXPECT_NEAR(Num("SE.run.CannonDamage()"), before*1.1f, 0.001f);
	EXPECT_EQ((int)Num("SE.run.gates.length"), 0) << "a spent gate must disappear";
	EXPECT_EQ((int)Num("SE.run.gateBuffsTaken"), 1);
	EXPECT_GT((int)Num("SE.run.fx.Count()"), 0) << "passing must play a visual confirmation";

	Step(120);
	EXPECT_EQ((int)Num("SE.run.fx.Count()"), 0) << "effects must expire and not accumulate";
}

TEST_F(SpaceEvolverLogic, EffectsDoNotAccumulateOverALongRun)
{
	StartRun();
	Step(3600);

	EXPECT_LE((int)Num("SE.run.fx.Count()"), 80) << "short-lived effects must expire";
}

TEST_F(SpaceEvolverLogic, ShipSettlesIntoItsLaneAndStaysThere)
{
	StartRun();
	Step(120); // no cursor input in headless: the ship just settles into its lane

	EXPECT_LE(Math::Abs(Num("SE.run.px")), 540.0f/2);
	EXPECT_NEAR(Num("SE.run.py"), Num("SE.cfg.player.ship.cursorShipY"), 1.0f);

	Eval("SE.run.py = 0;"); // nothing may leave the ship off its lane
	Step(120);
	EXPECT_NEAR(Num("SE.run.py"), Num("SE.cfg.player.ship.cursorShipY"), 1.0f);
}

TEST_F(SpaceEvolverLogic, OrbsScrollWithTheStarfieldSlightlySlower)
{
	StartRun();
	// far above and away from the ship, so only the scroll moves it
	Eval("SE.run.orbEntities = []; SE.run.px = -200; SE.run.py = -300;"
		 "SE.run.SpawnOrb(200, 400, 0);");

	float startY = Num("SE.run.orbEntities[0].y");
	Step(60); // one second

	float travelled = startY - Num("SE.run.orbEntities[0].y");
	float scroll = Num("SE.cfg.player.world.runScrollSpeed");
	float expected = scroll * Num("SE.cfg.player.orbs.scrollFactor");

	EXPECT_NEAR(travelled, expected, 12.0f) << "orbs must drift down at the parallax speed";
	EXPECT_LT(travelled, scroll) << "and stay a touch slower than the background";
	EXPECT_GT(travelled, scroll*0.6f) << "but close enough to read as the same flow";
}

TEST_F(SpaceEvolverLogic, OrbsDriftTowardsThePlayerAndAreEasyToCollect)
{
	StartRun();
	Eval("SE.run.orbEntities = []; SE.run.px = 0; SE.run.py = -300;"
		 "SE.run.SpawnOrb(200, 100, 200);"); // dropped far up and to the right

	float startDist = Num("Math.sqrt(Math.pow(SE.run.orbEntities[0].x - SE.run.px, 2) +"
						  "          Math.pow(SE.run.orbEntities[0].y - SE.run.py, 2))");
	Step(6);

	EXPECT_TRUE(Flag("SE.run.orbEntities.length == 0 ||"
					 "Math.sqrt(Math.pow(SE.run.orbEntities[0].x - SE.run.px, 2) +"
					 "          Math.pow(SE.run.orbEntities[0].y - SE.run.py, 2)) < " + (String)startDist))
		<< "a fresh orb must already be heading for the ship";

	// A drop landing inside the magnet radius is collected quickly
	Eval("SE.run.orbEntities = []; SE.run.orbs = 0;"
		 "SE.run.SpawnOrb(SE.run.px + 120, SE.run.py + 60, 0);");
	Step(60);

	EXPECT_EQ((int)Num("SE.run.orbEntities.length"), 0) << "the magnet must pull it in within a second";
	EXPECT_GT(Num("SE.run.orbs + SE.run.xpLevel"), 1.0f);
}

#endif // IS_SCRIPTING_SUPPORTED
