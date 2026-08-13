#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "SpaceEvolver/GameJsBridge.h"
#include "SpaceEvolver/SpaceEvolverBootstrap.h"
#include "o2/Application/Application.h"
#include "o2/Scene/Actor.h"
#include "o2/Scene/Scene.h"
#include "o2/Scripts/ScriptEngine.h"
#include "o2/Scripts/ScriptValue.h"
#include "o2/Utils/FileSystem/FileSystem.h"
#include "o2/Utils/Test/AppTestDriver.h"

using namespace o2;

#if IS_SCRIPTING_SUPPORTED

// The first-run tutorial as a player sees it: a fresh profile, a real run, and a screenshot
// of every step so the wording and the placement can be reviewed
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
}

class SpaceEvolverTutorial: public ::testing::Test
{
protected:
	void SetUp() override
	{
		space_evolver::ResetPersistentSave();
		o2Application.SetWindowSize(Vec2I(space_evolver::kScreenWidth, space_evolver::kScreenHeight));
		space_evolver::RegisterGameJsApi();
		space_evolver::BuildBootstrapScene();
		AppTestDriver::PumpFrames(6);
	}

	void TearDown() override
	{
		o2Scene.Clear(true);
		o2Scene.UpdateDestroyingEntities();
		AppTestDriver::PumpFrames(2);
		space_evolver::ResetPersistentSave();
	}

	static void Simulate(int frames, float dt = 1.0f/60.0f)
	{
		Eval(String("for (let i = 0; i < ") + (String)frames + "; i++) SE.run.Update(" + (String)dt + ");");
		AppTestDriver::PumpFrames(2);
	}
};

TEST_F(SpaceEvolverTutorial, FirstRunTeachesEveryStepAndThenGetsOutOfTheWay)
{
	ASSERT_FALSE(Flag("SE.meta.profile.tutorialDone")) << "a fresh profile starts untaught";

	Eval("SE.game.StartRun();");
	AppTestDriver::PumpFrames(3);
	ASSERT_TRUE(Flag("SE.run.tutorial != null"));

	// Step 1: drag the ship
	EXPECT_EQ(Str("SE.run.tutorial.CurrentStep().id"), "drag");
	EXPECT_TRUE(Flag("SE.run.tutorial.label != null")) << "the hint must be on screen";
	Shot("t01_step_drag.png");

	AppTestDriver::PressCursor(Vec2F(0, -300));
	AppTestDriver::MoveCursor(Vec2F(140, -300), 8);
	AppTestDriver::Wait(1.5f);
	AppTestDriver::ReleaseCursor();

	// Step 2: the tutorial hands the player a target. Autofire may already have shot it
	// down during the drag, so the check is that the step moved on and a target was given
	EXPECT_NE(Str("SE.run.tutorial.CurrentStep().id"), "drag") << "dragging must advance the step";
	EXPECT_GE((int)Num("SE.run.enemies.length + SE.run.kills"), 1) << "a target must be provided";
	Shot("t02_step_shoot.png");

	Simulate(600); // autofire takes the drone down
	EXPECT_GT((int)Num("SE.run.kills"), 0);

	// Step 3: a gate is placed for the player to fly through
	EXPECT_EQ(Str("SE.run.tutorial.CurrentStep().id"), "gate");
	ASSERT_EQ((int)Num("SE.run.gates.length"), 1);
	Shot("t03_step_gate.png");

	// Fly the ship into the gate. The step keeps handing out gates while the player misses,
	// so more than one may end up collected — what matters is that passing registers
	Eval("SE.run.px = SE.run.gates[0].x;");
	Simulate(600);
	EXPECT_GE((int)Num("SE.run.gateBuffsTaken"), 1);

	// Step 4: a target gate to break for orbs
	EXPECT_EQ(Str("SE.run.tutorial.CurrentStep().id"), "orbs");
	ASSERT_GE((int)Num("SE.run.gates.filter(function(g) { return g.gateType == 'target'; }).length"), 1)
		<< "the orbs step must put a target gate on the field";
	Shot("t04_step_orbs.png");

	Eval("for (let i = 0; i < 40; i++) SE.run.CollectOrb();");
	Simulate(2);

	EXPECT_TRUE(Flag("SE.run.tutorial.done"));
	EXPECT_TRUE(Flag("SE.meta.profile.tutorialDone")) << "the profile must remember it";
	Shot("t05_tutorial_done.png");

	Simulate(240); // the panel hides itself and normal waves take over
	EXPECT_TRUE(Flag("SE.run.tutorial.label === null")) << "the hint panel must go away";
	EXPECT_GT((int)Num("SE.run.enemies.length + SE.run.kills"), 1) << "waves must resume";
	Shot("t06_waves_after_tutorial.png");
}

TEST_F(SpaceEvolverTutorial, SecondRunSkipsTheTutorialEntirely)
{
	Eval("SE.meta.profile.tutorialDone = true; SE.meta.Save();"
		 "SE.game.StartRun();");
	AppTestDriver::PumpFrames(3);

	EXPECT_TRUE(Flag("SE.run.tutorial === undefined || SE.run.tutorial === null"));

	Simulate(300);
	EXPECT_GT((int)Num("SE.run.enemies.length + SE.run.kills"), 0) << "waves start right away";
	Shot("t07_no_tutorial_second_run.png");
}

#endif // IS_SCRIPTING_SUPPORTED
