#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "BrainFarm/BrainFarmBootstrap.h"
#include "BrainFarm/FarmLightingPass.h"
#include "BrainFarm/GameJsBridge.h"
#include "o2/Application/Application.h"
#include "o2/Scene/Actor.h"
#include "o2/Scene/CameraActor.h"
#include "o2/Scene/Scene.h"
#include "o2/Scripts/ScriptEngine.h"
#include "o2/Utils/Bitmap/Bitmap.h"
#include "o2/Utils/Test/AppTestDriver.h"
#include "o2/Assets/Assets.h"
#include "o2/Render/Render.h"

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

        AppTestDriver::SaveScreenshot("../../Work/ScreenShots/40_wide_scene.png");
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

        AppTestDriver::SaveScreenshot("../../Work/ScreenShots/46_wide_joystick.png");
        AppTestDriver::ReleaseCursor();
        AppTestDriver::PumpFrames(5);
    }

    TEST_F(BrainFarmScene, ColorCorrectionCompilesAndChangesTheWorld)
    {
        auto camera = DynamicCast<CameraActor>(o2Scene.FindActor("camera3d"));
        auto pass = camera->GetRenderPipeline()->GetPass<brain_farm::FarmLightingPass>();
        ASSERT_TRUE(pass);
        ASSERT_TRUE(pass->IsColorCorrectionReady());
        pass->SetColorCorrectionEnabled(false);
        AppTestDriver::PumpFrames(3);
        auto before = AppTestDriver::TakeScreenshot();
        AppTestDriver::SaveScreenshot("../../Work/ScreenShots/41_wide_ungraded.png");
        pass->SetColorCorrectionEnabled(true);
        AppTestDriver::PumpFrames(3);
        auto after = AppTestDriver::TakeScreenshot();
        AppTestDriver::SaveScreenshot("../../Work/ScreenShots/42_wide_graded.png");
        double difference = 0;
        int pixels = before->GetSize().x*before->GetSize().y;
        for (int i=0;i<pixels;i++)
            for (int c=0;c<3;c++)
                difference += Math::Abs((int)before->GetData()[i*4+c]-(int)after->GetData()[i*4+c]);
        EXPECT_GT(difference/(pixels*3), .4);
    }

    TEST_F(BrainFarmScene, SahurPortraitAndSavedScene)
    {
        auto camera = o2Scene.FindActor("camera3d");
        ASSERT_NE(camera, nullptr);
        o2Scripts.Eval("BF.game.player.x=0;BF.game.player.y=0;BF.game.UpdateCamera = function() {}; BF.game.hud.root.SetEnabled(false); BF.game.guide.SetEnabled(false); BF.faceDir(BF.game.player.actor, 0, -1);");
        camera->transform->SetPosition(Vec3F(0, -380, 235));
        camera->transform->SetEulerAngles(Vec3F(Math::Deg2rad(73.0f), 0, 0));
        AppTestDriver::PumpFrames(10);
        AppTestDriver::SaveScreenshot("../../Work/ScreenShots/08_sahur_portrait.png");

        o2Scripts.Eval("BF.game.player.UpdateMovement = function() {}; BF.game.player.SetAnim('Run')");
        AppTestDriver::PumpFrames(10);
        AppTestDriver::SaveScreenshot("../../Work/ScreenShots/09_sahur_run.png");
        printf("Sahur scene: %d draw calls, %d rendered primitives\n",
               o2Render.GetDrawCallsCount(), o2Render.GetDrawnPrimitives());

        o2Scene.Clear(true);
        o2Scene.UpdateDestroyingEntities();
        brain_farm::BuildBootstrapScene();
        o2Scene.UpdateAddedEntities();
        o2Scene.Save(o2Assets.GetAssetsPath() + "Bootstrap.scn");
    }
}
