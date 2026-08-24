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

    TEST_F(BrainFarmGameplay, FullLoop_Harvest_Sell_Unlock)
    {
        // 1: stand near the plantation until the stack fills up
        Teleport(0.0f, -170.0f);
        AppTestDriver::Wait(8.0f);

        float stack = EvalNumber("BF.game.player.StackCount()");
        EXPECT_GE(stack, 4);
        AppTestDriver::SaveScreenshot("../../Work/ScreenShots/03_harvested_stack.png");

        // 2: carry to the counter drop point, brains move to the stand
        Teleport(0.0f, 320.0f);
        AppTestDriver::Wait(3.0f);

        EXPECT_GT(EvalNumber("BF.game.counter.stock.length"), 0);

        auto state = o2Scripts.Eval(R"JS(
            let parts = [];
            for (let b of BF.game.counter.stock)
            {
                let p = BF.getWorldPos(b);
                parts.push("stock(" + p.x.toFixed(2) + "," + p.y.toFixed(2) + "," + p.z.toFixed(2) + ")");
            }
            parts.push("flights=" + BF.game.flights.length);
            parts.push("stack=" + BF.game.player.stack.length);
            let flightsRoot = Bridge.FindActor("Flights");
            for (let ch of flightsRoot.GetChildren())
            {
                let p = BF.getWorldPos(ch);
                parts.push("stray(" + p.x.toFixed(2) + "," + p.y.toFixed(2) + "," + p.z.toFixed(2) + ")");
            }
            parts.join(" ");
        )JS");
        printf("counter state: %s\n", ((String)state).Data());

        AppTestDriver::SaveScreenshot("../../Work/ScreenShots/04_counter_stocked.png");

        // 3: zombies buy everything they can; force one sale to catch the money spark mid-flight
        AppTestDriver::Wait(2.5f);
        if (EvalNumber("BF.game.counter.stock.length") > 0 && EvalNumber("BF.game.zombies.list.length") > 0)
        {
            Eval("BF.game.counter.SellTo(BF.game.zombies.list[0], BF.game)");
            AppTestDriver::Wait(0.5f);
            EXPECT_GE(EvalNumber("BF.game.hud.moneyFlies.length"), 1) << "money spark must fly to the HUD";
            AppTestDriver::SaveScreenshot("../../Work/ScreenShots/05a_money_fly.png");
        }
        AppTestDriver::Wait(3.5f);
        float money = EvalNumber("BF.game.money");
        EXPECT_GT(money, 0);
        AppTestDriver::SaveScreenshot("../../Work/ScreenShots/05_zombies_paid.png");

        // 4: cheat up some cash and buy plantation 1 by standing on its zone
        Eval("BF.game.AddMoney(300)");
        Teleport(-200.0f, -320.0f);
        AppTestDriver::Wait(0.4f);
        AppTestDriver::SaveScreenshot("../../Work/ScreenShots/06a_buy_zone.png");
        Teleport(-200.0f, -430.0f);
        AppTestDriver::Wait(2.5f);

        EXPECT_EQ(EvalNumber("BF.game.plantations[1].unlocked ? 1 : 0"), 1);
        EXPECT_EQ(EvalNumber("BF.game.buyZones[0].done ? 1 : 0"), 1);
        AppTestDriver::SaveScreenshot("../../Work/ScreenShots/06_plantation1_unlocked.png");

        // 5: look at the stand area: queue, pines and fences
        Teleport(0.0f, 650.0f);
        AppTestDriver::Wait(1.5f);
        AppTestDriver::SaveScreenshot("../../Work/ScreenShots/07_stand_area.png");
    }
}
