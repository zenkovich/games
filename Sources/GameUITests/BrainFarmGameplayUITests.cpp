#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "BrainFarm/BrainFarmBootstrap.h"
#include "BrainFarm/GameJsBridge.h"
#include "o2/Application/Application.h"
#include "o2/Scene/Scene.h"
#include "o2/Scripts/ScriptEngine.h"
#include "o2/Utils/Test/AppTestDriver.h"

using namespace o2;

namespace
{
    class BrainFarmGameplay: public ::testing::Test
    {
    protected:
        void SetUp() override
        {
            o2Application.SetWindowSize(Vec2I(450, 800));
            brain_farm::RegisterGameJsApi();
            brain_farm::BuildBootstrapScene();
            AppTestDriver::PumpFrames(5);
        }

        void TearDown() override
        {
            o2Scene.Clear(true);
            o2Scene.UpdateDestroyingEntities();
            AppTestDriver::PumpFrames(2);
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
    };

    TEST_F(BrainFarmGameplay, SweepRowsSellAndUpgrade)
    {
        for (int row = 0; row < 10; row++)
        {
            Teleport(435 - row*70, -260);
            AppTestDriver::Wait(.3f);
        }
        AppTestDriver::Wait(.5f);
        EXPECT_EQ(EvalNumber("BF.game.player.StackCount()"), 30);
        AppTestDriver::SaveScreenshot("../../Work/ScreenShots/43_wide_harvest.png");
        Teleport(655,-260);
        AppTestDriver::Wait(1.3f);
        AppTestDriver::SaveScreenshot("../../Work/ScreenShots/44_wide_market.png");
        AppTestDriver::Wait(10.7f);
        EXPECT_EQ(EvalNumber("BF.game.sold"), 30);
        EXPECT_EQ(EvalNumber("BF.game.money"), 60);
        Teleport(570,160);
        AppTestDriver::Wait(.8f);
        EXPECT_EQ(EvalNumber("BF.game.progression.index"), 1);
        EXPECT_EQ(EvalNumber("BF.game.money"), 20);
        Eval("BF.game.AddMoney(400)");
        Teleport(590,-840);
        AppTestDriver::Wait(.9f);
        EXPECT_EQ(EvalNumber("BF.game.capacity"), 60);
        Teleport(570,580);
        AppTestDriver::Wait(1.4f);
        Teleport(850,-600);
        AppTestDriver::Wait(2.0f);
        EXPECT_EQ(EvalNumber("BF.game.progression.index"), 4);
        AppTestDriver::SaveScreenshot("../../Work/ScreenShots/45_wide_victory.png");
        AppTestDriver::Click(Vec2F(0, -104.0f*800.0f/960.0f));
        AppTestDriver::PumpFrames(5);
        EXPECT_EQ(EvalNumber("BF.game.victoryOpen ? 1 : 0"), 0);
    }
}
