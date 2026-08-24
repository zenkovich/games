#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "BrainFarm/BrainFarmBootstrap.h"
#include "BrainFarm/GameJsBridge.h"
#include "o2/Application/Application.h"
#include "o2/Scene/Actor.h"
#include "o2/Scene/Components/Mesh3DComponent.h"
#include "o2/Scene/Scene.h"
#include "o2/Scripts/ScriptEngine.h"
#include "o2/Utils/Test/AppTestDriver.h"

using namespace o2;

namespace
{
    // Regression for the JS marshaling traps: SetScale takes a Vec3F (a JS Vec2 argument
    // used to zero the scale and collapse the mesh), world positions go through the
    // bridge float getters, and BF.faceDir turns the model to the walk direction
    TEST(BrainFarmJsBridge, SpawnedBrainScalesAndPlayerFaces)
    {
        o2Application.SetWindowSize(Vec2I(450, 800));
        brain_farm::RegisterGameJsApi();
        brain_farm::BuildBootstrapScene();
        AppTestDriver::PumpFrames(5);

        auto res = o2Scripts.Eval(R"JS(
            let b = Bridge.SpawnBrain();
            b.SetName("ProbeBrain");
            b.SetEnabled(true);
            BF.game.flightsRoot.AddChild(b);
            BF.setPos(b, 0, -100, 60);
            BF.setScale(b, 2.0);
            let spot = Bridge.FindActor("Location/CounterSpots/Spot0");
            let wp = BF.getWorldPos(spot);
            [b.GetTransform().GetScaleX(), wp.x, wp.y, wp.z];
        )JS");
        ASSERT_NE(res.GetValueType(), ScriptValue::ValueType::Error) << (String)res.GetError();
        EXPECT_NEAR((float)res.GetElement(0), 2.0f, 0.001f);
        EXPECT_NEAR((float)res.GetElement(1), -62.0f, 1.0f);
        EXPECT_NEAR((float)res.GetElement(2), 425.0f, 1.0f);
        EXPECT_NEAR((float)res.GetElement(3), 95.0f, 1.0f);

        AppTestDriver::Wait(0.3f);

        // the scaled brain mesh must carry real geometry around its origin, not a collapsed point
        auto probeActor = o2Scene.FindActor("Flights/ProbeBrain");
        ASSERT_NE(probeActor, nullptr);
        auto mesh = probeActor->GetComponent<Mesh3DComponent>();
        ASSERT_NE(mesh, nullptr);
        AABB bounds;
        ASSERT_TRUE(mesh->Get3DDrawableBounds(bounds));
        EXPECT_GT(bounds.GetSize().x, 50.0f);

        o2Scripts.Eval("BF.faceDir(BF.game.player.actor, 0, -1)");
        AppTestDriver::PumpFrames(3);
        AppTestDriver::SaveScreenshot("../../Work/ScreenShots/probe_face_down.png");

        o2Scripts.Eval("BF.faceDir(BF.game.player.actor, 0, 1)");
        AppTestDriver::PumpFrames(3);
        AppTestDriver::SaveScreenshot("../../Work/ScreenShots/probe_face_up.png");

        o2Scene.Clear(true);
        o2Scene.UpdateDestroyingEntities();
        AppTestDriver::PumpFrames(2);
    }
}
