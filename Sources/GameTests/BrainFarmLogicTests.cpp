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

    TEST_F(BrainFarmLogic, BrainsGrowAndHarvestIntoLimitedStack)
    {
        Teleport(0.0f, -170.0f);
        Simulate(2.0f);
        EXPECT_EQ(EvalNumber("BF.game.player.StackCount()"), 0) << "nothing is ripe yet";

        Simulate(30.0f);
        EXPECT_EQ(EvalNumber("BF.game.player.StackCount()"), 8) << "stack must fill up to the limit";
        EXPECT_EQ(EvalNumber("BF.game.player.StackFull() ? 1 : 0"), 1);
    }

    TEST_F(BrainFarmLogic, FullSellCycleBringsMoney)
    {
        Teleport(0.0f, -170.0f);
        Simulate(10.0f);
        float stack = EvalNumber("BF.game.player.StackCount()");
        ASSERT_GT(stack, 0);

        Teleport(0.0f, 330.0f);
        Simulate(2.0f);
        EXPECT_GT(EvalNumber("BF.game.counter.stock.length"), 0) << "brains move to the counter";
        EXPECT_LT(EvalNumber("BF.game.player.StackCount()"), stack);

        Simulate(12.0f);
        EXPECT_GT(EvalNumber("BF.game.money"), 0) << "zombies must buy and pay";
        EXPECT_GT(EvalNumber("BF.game.zombies.list.length"), 0);
    }

    TEST_F(BrainFarmLogic, BuyZoneDrainsMoneyAndUnlocksPlantation)
    {
        EXPECT_EQ(EvalNumber("BF.game.plantations[1].unlocked ? 1 : 0"), 0);

        Eval("BF.game.AddMoney(300)");
        Teleport(-200.0f, -430.0f);
        Simulate(2.5f);

        EXPECT_EQ(EvalNumber("BF.game.plantations[1].unlocked ? 1 : 0"), 1);
        EXPECT_EQ(EvalNumber("BF.game.buyZones[0].done ? 1 : 0"), 1);
        EXPECT_NEAR(EvalNumber("BF.game.money"), 200.0f, 1.0f) << "exactly the plantation cost is drained";

        // the second zone stays locked and keeps its price
        EXPECT_EQ(EvalNumber("BF.game.plantations[2].unlocked ? 1 : 0"), 0);
        EXPECT_NEAR(EvalNumber("BF.game.buyZones[1].Remaining()"), 250.0f, 1.0f);
    }
}
