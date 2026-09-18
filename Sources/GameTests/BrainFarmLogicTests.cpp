#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "BrainFarm/BrainFarmBootstrap.h"
#include "BrainFarm/GameJsBridge.h"
#include "Scene/SceneTestHelpers.h"
#include "o2/Scene/Scene.h"
#include "o2/Scripts/ScriptEngine.h"

using namespace o2;

namespace
{
    class BrainFarmLogic: public ::testing::Test
    {
    protected:
        SceneCleanGuard mSceneGuard;

        void SetUp() override
        {
            brain_farm::RegisterGameJsApi();
            brain_farm::BuildBootstrapScene();
            TickFrames(3, 0.016f);
        }

        void Eval(const String& code)
        {
            auto res = o2Scripts.Eval(code);
            ASSERT_NE(res.GetValueType(), ScriptValue::ValueType::Error) << (String)res.GetError();
        }

        float EvalNumber(const String& expression)
        {
            auto res = o2Scripts.Eval(expression);
            EXPECT_EQ(res.GetValueType(), ScriptValue::ValueType::Number) << expression.Data();
            return res.GetValueType() == ScriptValue::ValueType::Number ? (float)res : -99999.0f;
        }

        void Teleport(float x, float y)
        {
            Eval(String("BF.game.player.x = ") + (String)x + "; BF.game.player.y = " + (String)y + ";");
        }

        void Simulate(float seconds)
        {
            int frames = (int)(seconds/0.033f);
            TickFrames(frames, 0.033f);
        }
    };

    TEST_F(BrainFarmLogic, JoystickAnchorStaysAtPressUntilRelease)
    {
        Eval(R"JS(
            let originalCursor=BF.cursorUI,originalDown=Bridge.IsCursorDown;
            let cursor={x:0,y:-200},down=true,p=BF.game.player;
            try {
                BF.cursorUI=()=>cursor;Bridge.IsCursorDown=()=>down;
                p.UpdateJoystick(.1);
                cursor={x:240,y:-200};p.UpdateJoystick(.1);
                BF.joystickProbe=[p.joyOriginX,p.joyOriginY,p.joyDX];
                cursor={x:220,y:-200};
                for(let i=0;i<10;i++)p.UpdateJoystick(.1);
                BF.joystickProbe.push(Math.hypot(p.dirX,p.dirY));
                down=false;for(let i=0;i<10;i++)p.UpdateJoystick(.1);
                BF.joystickProbe.push(Math.hypot(p.dirX,p.dirY));
                down=true;cursor={x:-100,y:-180};p.UpdateJoystick(.1);
                BF.joystickProbe.push(p.joyOriginX,p.joyOriginY);
            } finally {BF.cursorUI=originalCursor;Bridge.IsCursorDown=originalDown;}
        )JS");
        EXPECT_FLOAT_EQ(EvalNumber("BF.joystickProbe[0]"), 0);
        EXPECT_FLOAT_EQ(EvalNumber("BF.joystickProbe[1]"), -200);
        EXPECT_FLOAT_EQ(EvalNumber("BF.joystickProbe[2]"), 74);
        EXPECT_NEAR(EvalNumber("BF.joystickProbe[3]"), 1, .001f);
        EXPECT_FLOAT_EQ(EvalNumber("BF.joystickProbe[4]"), 0);
        EXPECT_FLOAT_EQ(EvalNumber("BF.joystickProbe[5]"), -100);
        EXPECT_FLOAT_EQ(EvalNumber("BF.joystickProbe[6]"), -180);
    }

    TEST_F(BrainFarmLogic, HarvestIsLocalAndReservesFlightSlots)
    {
        EXPECT_NEAR(EvalNumber("BF.game.plantations[0].spots[0].x"), 435, .01f);
        EXPECT_NEAR(EvalNumber("BF.game.plantations[0].spots[0].y"), -362, .01f);
        Teleport(435, -260);
        Simulate(.15f);
        EXPECT_GT(EvalNumber("BF.game.player.pending"), 0);
        Simulate(.8f);
        EXPECT_GT(EvalNumber("BF.game.harvested"), 0);
        EXPECT_LT(EvalNumber("BF.game.harvested"), 20);
        EXPECT_EQ(EvalNumber("BF.game.plantations[0].spots[79].state === 'ripe' ? 1 : 0"), 1);
        for (int row = 0; row < 10; row++)
        {
            Teleport(435 - row*70, -260);
            Simulate(.35f);
        }
        Simulate(1.0f);
        EXPECT_EQ(EvalNumber("BF.game.player.StackCount()"), 30);
        EXPECT_EQ(EvalNumber("BF.game.player.pending"), 0);
        EXPECT_EQ(EvalNumber("BF.game.player.StackFull() ? 1 : 0"), 1);
    }

    TEST_F(BrainFarmLogic, DenseHarvestSellsAtTwoDollarsEach)
    {
        for (int row = 0; row < 10; row++)
        {
            Teleport(435 - row*70, -260);
            Simulate(.35f);
        }
        Simulate(.5f);
        EXPECT_EQ(EvalNumber("BF.game.player.StackCount()"), 30);
        Teleport(655,-260);
        Simulate(.1f);
        EXPECT_GT(EvalNumber("BF.game.counter.pending"), 0);
        EXPECT_EQ(EvalNumber("BF.game.counter.SellTo({x:1030,y:-300,vip:false},BF.game) ? 1 : 0"), 0);
        Simulate(13.0f);
        EXPECT_EQ(EvalNumber("BF.game.sold"), 30);
        EXPECT_EQ(EvalNumber("BF.game.earned"), 60);
        EXPECT_EQ(EvalNumber("BF.game.counter.pending"), 0);
        EXPECT_EQ(EvalNumber("BF.game.counter.stock.length"), 0);
    }

    TEST_F(BrainFarmLogic, ProgressionUnlocksDenseFieldsAndLargerCargo)
    {
        Eval("BF.game.AddMoney(500)");
        Teleport(590,-840);
        Simulate(1);
        EXPECT_EQ(EvalNumber("BF.game.money"), 500);
        EXPECT_EQ(EvalNumber("BF.game.capacity"), 30);
        Teleport(570,160);
        Simulate(.6f);
        EXPECT_EQ(EvalNumber("BF.game.progression.index"), 1);
        EXPECT_EQ(EvalNumber("BF.game.plantations[1].spots.length"), 80);
        EXPECT_EQ(EvalNumber("BF.game.plantations[1].unlocked ? 1 : 0"), 1);
        Teleport(590,-840);
        Simulate(.9f);
        EXPECT_EQ(EvalNumber("BF.game.capacity"), 60);
        EXPECT_EQ(EvalNumber("BF.game.moveSpeed"), 580);
        Teleport(570,580);
        Simulate(1.3f);
        EXPECT_EQ(EvalNumber("BF.game.plantations[2].unlocked ? 1 : 0"), 1);
        Teleport(850,-600);
        Simulate(2.0f);
        EXPECT_EQ(EvalNumber("BF.game.victory ? 1 : 0"), 1);
        EXPECT_EQ(EvalNumber("BF.game.progression.index"), 4);
        EXPECT_NEAR(EvalNumber("BF.game.money"), 100, .01f);
        EXPECT_EQ(EvalNumber("BF.game.buyZones.filter(z => z.active).length"), 0);
    }

    TEST_F(BrainFarmLogic, CameraRelativeDirectionsAndGoldenVipPrice)
    {
        EXPECT_NEAR(EvalNumber("BF.screenToGround(1,0).x"), .81915f, .001f);
        EXPECT_NEAR(EvalNumber("BF.screenToGround(1,0).y"), .57358f, .001f);
        EXPECT_NEAR(EvalNumber("BF.screenToGround(0,1).x"), -.57358f, .001f);
        EXPECT_NEAR(EvalNumber("BF.screenToGround(0,1).y"), .81915f, .001f);
        Eval("BF.game.marketLevel=2;BF.game.RecordSale(BF.cfg.goldenPrice,{x:1030,y:-300,vip:true})");
        EXPECT_EQ(EvalNumber("BF.game.money"), 16);
        EXPECT_EQ(EvalNumber("BF.game.sold"), 1);
    }
}
