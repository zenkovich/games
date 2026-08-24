#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "BrainFarm/BrainFarmBootstrap.h"
#include "BrainFarm/GameJsBridge.h"
#include "o2/Application/Application.h"
#include "o2/Scene/Actor.h"
#include "o2/Scene/CameraActor.h"
#include "o2/Scene/Scene.h"
#include "o2/Scripts/ScriptEngine.h"
#include "o2/Utils/Bitmap/Bitmap.h"
#include "o2/Utils/Test/AppTestDriver.h"

using namespace o2;

namespace
{
    class BrainFarmScene: public ::testing::Test
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

        float EvalNumber(const String& expression)
        {
            auto res = o2Scripts.Eval(expression);
            return res.GetValueType() == ScriptValue::ValueType::Number ? (float)res : -99999.0f;
        }
    };

    TEST_F(BrainFarmScene, SceneBuildsAndRenders)
    {
        EXPECT_NE(o2Scene.FindActor("camera3d"), nullptr);
        EXPECT_NE(o2Scene.FindActor("Player"), nullptr);
        EXPECT_NE(o2Scene.FindActor("Plantations/Plantation0"), nullptr);
        EXPECT_NE(o2Scene.FindActor("Location/Stand"), nullptr);
        EXPECT_NE(o2Scene.FindActor("Zombies/ZombieTemplate"), nullptr);

        AppTestDriver::Wait(1.0f);

        auto screenshot = AppTestDriver::TakeScreenshot();
        ASSERT_NE(screenshot, nullptr);

        // The frame must not be a solid fill: count distinct-ish pixels
        Vec2I size = screenshot->GetSize();
        const UInt8* data = screenshot->GetData();
        const UInt8* first = data;
        int different = 0;
        for (int y = 0; y < size.y; y += 8)
        {
            for (int x = 0; x < size.x; x += 8)
            {
                const UInt8* p = data + (y*size.x + x)*4;
                if (Math::Abs((int)p[0] - first[0]) + Math::Abs((int)p[1] - first[1]) +
                    Math::Abs((int)p[2] - first[2]) > 40)
                {
                    different++;
                }
            }
        }
        EXPECT_GT(different, 100);

        AppTestDriver::SaveScreenshot("../../Work/ScreenShots/01_scene_first_build.png");
    }

    TEST_F(BrainFarmScene, JoystickDragMovesAndAnimatesPlayer)
    {
        AppTestDriver::Wait(0.5f);

        float startY = EvalNumber("BF.game.player.y");

        // drag up-left from the lower screen area and hold
        AppTestDriver::PressCursor(Vec2F(0, -200));
        for (int i = 0; i < 30; i++)
        {
            AppTestDriver::MoveCursor(Vec2F(-40, -120), 2);
            AppTestDriver::PumpFrames(1);
        }

        float movedY = EvalNumber("BF.game.player.y");
        EXPECT_GT(movedY, startY + 30.0f);

        AppTestDriver::SaveScreenshot("../../Work/ScreenShots/02_joystick_run.png");
        AppTestDriver::ReleaseCursor();
        AppTestDriver::PumpFrames(5);
    }
}
