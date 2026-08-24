#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include <chrono>
#include <mach/mach.h>

#include "BrainFarm/BrainFarmBootstrap.h"
#include "BrainFarm/GameJsBridge.h"
#include "o2/Application/Application.h"
#include "o2/Render/Render.h"
#include "o2/Scene/Scene.h"
#include "o2/Scripts/ScriptEngine.h"
#include "o2/Utils/Test/AppTestDriver.h"

using namespace o2;

namespace
{
    size_t ResidentMemoryBytes()
    {
        mach_task_basic_info info;
        mach_msg_type_number_t count = MACH_TASK_BASIC_INFO_COUNT;
        if (task_info(mach_task_self(), MACH_TASK_BASIC_INFO, (task_info_t)&info, &count) != KERN_SUCCESS)
            return 0;

        return info.resident_size;
    }

    struct PerfSample
    {
        float frameMs = 0;
        size_t rssMb = 0;
        int jsKb = 0;
        int actors = 0;
        int drawables3d = 0;
        int drawCalls = 0;
        int primitives = 0;
    };

    class BrainFarmPerf: public ::testing::Test
    {
    protected:
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

        PerfSample Sample(int frames)
        {
            auto start = std::chrono::steady_clock::now();
            AppTestDriver::PumpFrames(frames);
            auto elapsed = std::chrono::duration<float, std::milli>(std::chrono::steady_clock::now() - start);

            PerfSample sample;
            sample.frameMs = elapsed.count()/frames;
            sample.rssMb = ResidentMemoryBytes()/(1024*1024);
            sample.jsKb = o2Scripts.GetUsedMemory()/1024;
            sample.actors = o2Scene.GetAllActors().Count();
            sample.drawables3d = o2Scene.GetDrawable3DComponents().Count();
            sample.drawCalls = o2Render.GetDrawCallsCount();
            sample.primitives = o2Render.GetDrawnPrimitives();
            return sample;
        }
    };

    // Soak of continuous play (all plantations unlocked, harvest <-> sell loop, zombies
    // cycling). The assertions encode the targets: flat memory after warm-up, bounded
    // entities and a frame cheap enough for 60 FPS
    TEST_F(BrainFarmPerf, SoakMemoryFlatAndFrameFast)
    {
        o2Application.SetWindowSize(Vec2I(450, 800));
        brain_farm::RegisterGameJsApi();
        brain_farm::BuildBootstrapScene();
        AppTestDriver::PumpFrames(5);

        Eval("BF.game.AddMoney(400); for (let z of BF.game.buyZones) z.paid = z.cost;");
        AppTestDriver::PumpFrames(10);

        const int chunks = 16;
        const int framesPerChunk = 300;
        Vector<PerfSample> samples;

        for (int i = 0; i < chunks; i++)
        {
            // alternate between the plantation cluster and the counter to keep the economy churning
            bool atCounter = (i % 2) == 1;
            Eval(atCounter ? String("BF.game.player.x = 0; BF.game.player.y = 330;")
                           : String("BF.game.player.x = ") + (String)((i % 4 == 0) ? 0.0f : -200.0f) +
                             "; BF.game.player.y = " + (String)((i % 4 == 0) ? -170.0f : -430.0f) + ";");

            samples.Add(Sample(framesPerChunk));
            auto& s = samples.Last();
            printf("chunk %2d: frame %6.2f ms | rss %4zu MB | js %6d KB | actors %4d | drw3d %3d | dc %3d | prims %6d\n",
                   i, s.frameMs, s.rssMb, s.jsKb, s.actors, s.drawables3d, s.drawCalls, s.primitives);
            fflush(stdout);

            if (s.rssMb > 4000)
            {
                ADD_FAILURE() << "runaway memory, aborting the soak at " << s.rssMb << " MB";
                break;
            }
        }

        // the economy reaches its steady state (full stack, counter and queue) by chunk 8;
        // from there memory must stay flat and entities bounded
        auto& warm = samples[8];
        auto& last = samples.Last();

        // the bare engine under the test harness drifts ~4 KB/frame (present-path logging,
        // Metal caches), the budget tolerates that noise but not a real leak
        EXPECT_LE((int)last.rssMb - (int)warm.rssMb, 48)
            << "resident memory keeps growing during play";
        EXPECT_LE(last.actors - warm.actors, 20)
            << "scene actors accumulate";
        EXPECT_LE(last.drawables3d - warm.drawables3d, 20)
            << "3D drawable components accumulate";
        EXPECT_LE(last.jsKb - warm.jsKb, 4096)
            << "JS heap keeps growing";

        float warmMs = Math::Min(warm.frameMs, samples[9].frameMs);
        float lastMs = Math::Min(last.frameMs, samples[samples.Count() - 2].frameMs);
        EXPECT_LE(lastMs, warmMs*1.6f + 2.0f) << "frame time degrades over the soak";
        EXPECT_LE(lastMs, 16.6f) << "frame budget for 60 FPS is exceeded";
    }
}
