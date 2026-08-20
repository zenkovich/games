#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "SpaceEvolver/GameJsBridge.h"
#include "SpaceEvolver/SpaceEvolverBootstrap.h"
#include "o2/Application/Application.h"
#include "o2/Render/Render.h"
#include "o2/Scene/Actor.h"
#include "o2/Scene/CameraActor.h"
#include "o2/Scene/Components/ScriptableComponent.h"
#include "o2/Scene/Scene.h"
#include "o2/Scripts/ScriptEngine.h"
#include "o2/Scripts/ScriptValue.h"
#include "o2/Utils/Bitmap/Bitmap.h"
#include "o2/Utils/FileSystem/FileSystem.h"
#include "o2/Utils/Test/AppTestDriver.h"

using namespace o2;

#if IS_SCRIPTING_SUPPORTED

namespace
{
	const String kScreenshotsDir = "TestScreenshots/SpaceEvolver/";

	int CountDistinctColors(const Ref<Bitmap>& bitmap)
	{
		if (!bitmap)
			return 0;

		Vector<UInt32> seen;
		const UInt32* pixels = reinterpret_cast<const UInt32*>(bitmap->GetData());
		Vec2I size = bitmap->GetSize();
		for (int y = 0; y < size.y; y += 8)
		{
			for (int x = 0; x < size.x; x += 8)
			{
				UInt32 color = pixels[y*size.x + x];
				if (!seen.Contains(color))
					seen.Add(color);
			}
		}

		return seen.Count();
	}

	ScriptValue Eval(const String& code)
	{
		auto res = o2Scripts.Eval(code);
		EXPECT_NE(res.GetValueType(), ScriptValue::ValueType::Error) << res.GetError().Data();
		return res;
	}

	float Num(const String& code) { return Eval(code).ToNumber(); }
	String Str(const String& code) { return Eval(code).ToString(); }
	bool Flag(const String& code) { return Eval(code).GetValue<bool>(); }

	void Shot(const String& name)
	{
		o2FileSystem.FolderCreate(kScreenshotsDir, true);
		EXPECT_TRUE(AppTestDriver::SaveScreenshot(kScreenshotsDir + name));
	}
}

class SpaceEvolverUI: public ::testing::Test
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
	}

	void TearDown() override
	{
		o2Scene.Clear(true);
		o2Scene.UpdateDestroyingEntities();
		AppTestDriver::PumpFrames(2);
		space_evolver::ResetPersistentSave();
	}
};

TEST_F(SpaceEvolverUI, BootstrapSceneStartsInHangar)
{
	ASSERT_TRUE(o2Scene.FindActor("Game")) << "bootstrap scene must hold the Game actor";
	EXPECT_EQ(Str("SE.game.state"), "hangar");
	EXPECT_TRUE(Flag("SE.game.hangar.root != null"));

	Ref<Bitmap> bitmap = AppTestDriver::TakeScreenshot();
	ASSERT_TRUE(bitmap);
	EXPECT_GT(CountDistinctColors(bitmap), 8) << "hangar must render a rich frame";
	Shot("01_hangar.png");
}

// The same scene the editor opens: loading the saved asset must bring the game up
TEST_F(SpaceEvolverUI, SavedBootstrapSceneAssetRunsTheGame)
{
	o2Scene.Clear(true);
	o2Scene.UpdateDestroyingEntities();
	AppTestDriver::PumpFrames(2);

	o2Scene.Load(o2Assets.GetBuiltAssetsPath() + String("Bootstrap.scn"));
	AppTestDriver::PumpFrames(6);

	EXPECT_EQ(Str("SE.game.state"), "hangar");
	EXPECT_TRUE(o2Scene.FindActor("Game"));

	Ref<Bitmap> bitmap = AppTestDriver::TakeScreenshot();
	ASSERT_TRUE(bitmap);
	EXPECT_GT(CountDistinctColors(bitmap), 8) << "the scene asset must render the hangar";
}

// The editor opens the scene without the game's C++ entry point ever running. The scene must
// still load and hold its actors, and the script must go quiet instead of erroring every frame
TEST_F(SpaceEvolverUI, BootstrapSceneSurvivesWithoutTheBridge)
{
	o2Scene.Clear(true);
	o2Scene.UpdateDestroyingEntities();
	Eval("delete globalThis.Bridge; SE = undefined;");
	AppTestDriver::PumpFrames(2);

	o2Scene.Load(o2Assets.GetBuiltAssetsPath() + String("Bootstrap.scn"));
	AppTestDriver::PumpFrames(8);

	auto gameActor = o2Scene.FindActor("Game");
	ASSERT_TRUE(gameActor) << "the scene hierarchy must still hold its actors";
	EXPECT_TRUE(o2Scene.FindActor("camera"));
	EXPECT_TRUE(Flag("typeof SE === 'undefined' || SE === undefined || SE.game === undefined"))
		<< "no bridge means no game, but also no crash";

	// The component must not consider itself started: a started one calls into the missing
	// game every frame, and the editor drowns in script errors
	auto scriptable = gameActor->GetComponent<ScriptableComponent>();
	ASSERT_TRUE(scriptable);
	EXPECT_FALSE(scriptable->GetInstance().GetProperty("_started").GetValue<bool>())
		<< "the script must stay idle instead of failing every frame";

	// registering the bridge is what the editor entry point does, and then the game comes up
	space_evolver::RegisterGameJsApi();
	o2Scene.Clear(true);
	o2Scene.UpdateDestroyingEntities();
	AppTestDriver::PumpFrames(2);

	o2Scene.Load(o2Assets.GetBuiltAssetsPath() + String("Bootstrap.scn"));
	AppTestDriver::PumpFrames(8);

	EXPECT_EQ(Str("SE.game.state"), "hangar") << "with the bridge the scene builds the game";
}

// The editor's Game window draws the scene into an offscreen target. If the scene left the render
// state changed, everything drawn after it — the editor's own UI — would come out wrong
TEST_F(SpaceEvolverUI, DrawingTheSceneIntoARenderTargetLeavesTheRenderStateClean)
{
	AppTestDriver::PumpFrames(3);

	Camera cameraBefore = o2Render.GetCamera();
	Vec2I resolutionBefore = o2Render.GetResolution();

	TextureRef target(Vec2I(256, 256), TextureFormat::R8G8B8A8, Texture::Usage::RenderTarget);
	o2Render.BindRenderTexture(target);
	o2Scene.Draw();
	o2Render.UnbindRenderTexture();

	EXPECT_EQ(o2Render.GetResolution(), resolutionBefore) << "the target must be released";
	EXPECT_NEAR(o2Render.GetCamera().GetSize2D().x, cameraBefore.GetSize2D().x, 1.0f)
		<< "the scene must restore the camera it found";

	Ref<Bitmap> bitmap = AppTestDriver::TakeScreenshot();
	ASSERT_TRUE(bitmap);
	EXPECT_GT(CountDistinctColors(bitmap), 8) << "the next frame must still render normally";
	Shot("12_after_offscreen_draw.png");
}

TEST_F(SpaceEvolverUI, HangarUpgradeRaisesDamageNumber)
{
	Eval("SE.meta.profile.coins = 100000; SE.game.hangar.Refresh();");
	AppTestDriver::PumpFrames(2);

	float before = Num("SE.meta.Stats().damage");
	Eval("SE.game.hangar.OnBuyUpgrade('mainAttack');"
		 "SE.game.hangar.OnBuyUpgrade('mainAttack');"
		 "SE.game.hangar.OnBuyUpgrade('health');");
	AppTestDriver::PumpFrames(3);

	EXPECT_GT(Num("SE.meta.Stats().damage"), before);
	EXPECT_EQ((int)Num("SE.meta.profile.upgrades.mainAttack"), 2);
	Shot("02_hangar_upgraded.png");
}

TEST_F(SpaceEvolverUI, MergeInHangarProducesHigherRarity)
{
	Eval("SE.meta.profile.coins = 100000;"
		 "SE.game.hangar.OnEquipCard('engine');"
		 "SE.game.hangar.OnEquipCard('engine');"
		 "SE.game.hangar.OnEquipCard('engine');");
	AppTestDriver::PumpFrames(2);
	EXPECT_EQ((int)Num("SE.meta.CountItems('engine', 'common')"), 3);

	Eval("SE.game.hangar.OnEquipCard('engine');"); // the same button merges when three are owned
	AppTestDriver::PumpFrames(2);

	EXPECT_EQ((int)Num("SE.meta.CountItems('engine', 'uncommon')"), 1);
	Shot("03_hangar_merge.png");
}

TEST_F(SpaceEvolverUI, StartRunSpawnsGameplay)
{
	Eval("SE.game.StartRun();");
	AppTestDriver::PumpFrames(3);
	EXPECT_EQ(Str("SE.game.state"), "run");

	AppTestDriver::Wait(4.0f);
	EXPECT_GT((int)Num("SE.run.enemies.length + SE.run.kills"), 0);
	EXPECT_TRUE(Flag("SE.run.playerView != null"));
	EXPECT_EQ((int)Num("SE.game.root.GetChildren().length"), 3)
		<< "starting a run must leave only bgRoot, run and hud under the game actor: "
		<< Str("SE.game.root.GetChildren().map(function(c) { return c.GetName(); }).join(',')").Data();

	Ref<Bitmap> bitmap = AppTestDriver::TakeScreenshot();
	ASSERT_TRUE(bitmap);
	EXPECT_GT(CountDistinctColors(bitmap), 8);
	Shot("04_run_start.png");
}

TEST_F(SpaceEvolverUI, DragSteersTheShipHorizontallyOnly)
{
	Eval("SE.game.StartRun();");
	AppTestDriver::PumpFrames(3);
	AppTestDriver::Wait(1.0f);

	float laneY = Num("SE.cfg.player.ship.cursorShipY");

	// drag diagonally: the ship must track the horizontal move and ignore the vertical one.
	// The follow is a lerp, so give it game time to converge, not just frames
	AppTestDriver::PressCursor(Vec2F(-120, -420));
	AppTestDriver::MoveCursor(Vec2F(40, -120), 8);
	AppTestDriver::Wait(2.0f);

	float px = Num("SE.run.px");
	float py = Num("SE.run.py");
	AppTestDriver::ReleaseCursor();

	EXPECT_NEAR(px, 40.0f, 30.0f) << "ship must follow the cursor to the right";
	EXPECT_NEAR(py, laneY, 10.0f) << "ship must stay in its lane, whatever the cursor does";
	Shot("05_run_drag.png");
}

TEST_F(SpaceEvolverUI, WeaponEvolutionChangesVisuals)
{
	Eval("SE.game.StartRun();");
	AppTestDriver::PumpFrames(3);

	Eval("SE.run.CheatSetLevel(4);"); // fan
	AppTestDriver::Wait(1.5f);
	EXPECT_EQ(Str("SE.run.CannonEvo().type"), "fan");
	Shot("06_run_fan.png");

	Eval("SE.run.CheatSetLevel(6);"); // laser
	AppTestDriver::Wait(1.5f);
	EXPECT_EQ(Str("SE.run.CannonEvo().type"), "laser");
	EXPECT_TRUE(Flag("SE.run.laserView.actor.IsEnabled()"));
	Shot("07_run_laser.png");
}

TEST_F(SpaceEvolverUI, BossFightShowsHpBarAndVictoryScreen)
{
	Eval("SE.game.StartRun(); SE.run.CheatSkipToBoss();");
	AppTestDriver::Wait(3.0f);

	ASSERT_TRUE(Flag("SE.run.boss != null"));
	EXPECT_TRUE(Flag("SE.run.bossBarBg.actor.IsEnabled()"));
	Shot("08_boss_fight.png");

	Eval("SE.run.CheatKillBoss();");
	AppTestDriver::PumpFrames(4);

	EXPECT_EQ(Str("SE.run.result"), "win");
	EXPECT_TRUE(Flag("SE.run.resultPanel != null"));
	Shot("09_victory.png");

	Eval("SE.game.EndRunToHangar();");
	AppTestDriver::PumpFrames(4);
	EXPECT_EQ(Str("SE.game.state"), "hangar");
	Shot("10_back_to_hangar.png");
}

TEST_F(SpaceEvolverUI, DefeatScreenKeepsCollectedCoins)
{
	Eval("SE.game.StartRun(); SE.run.coins = 777;");
	AppTestDriver::PumpFrames(3);

	float before = Num("SE.meta.profile.coins");
	Eval("SE.run.DamagePlayer(SE.run.maxHp + 1);");
	AppTestDriver::PumpFrames(4);

	EXPECT_EQ(Str("SE.run.result"), "lose");
	EXPECT_FLOAT_EQ(Num("SE.meta.profile.coins"), before + 777);
	Shot("11_defeat.png");
}

#endif // IS_SCRIPTING_SUPPORTED
