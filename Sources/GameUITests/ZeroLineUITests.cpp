#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "ZeroLine/GameJsBridge.h"
#include "ZeroLine/ZeroLineBootstrap.h"
#include "o2/Application/Application.h"
#include "o2/Scene/Scene.h"
#include "o2/Scripts/ScriptEngine.h"
#include "o2/Utils/Bitmap/Bitmap.h"
#include "o2/Utils/FileSystem/FileSystem.h"
#include "o2/Utils/Math/Math.h"
#include "o2/Utils/Test/AppTestDriver.h"

using namespace o2;

// Rendered run: real window, cursor drags through the tiles, screenshots of every
// stage of the core loop into Work/ScreenShots
namespace
{
    const String kShots = "../../Work/ScreenShots/";
    const String kTestSave = "ZeroLineUITestSave.json";

    int CountDistinctColors(const Ref<Bitmap>& bitmap)
    {
        if (!bitmap)
            return 0;

        Vector<UInt32> seen;
        const UInt32* pixels = reinterpret_cast<const UInt32*>(bitmap->GetData());
        Vec2I size = bitmap->GetSize();
        for (int y = 0; y < size.y; y += 16)
        {
            for (int x = 0; x < size.x; x += 16)
            {
                UInt32 color = pixels[y*size.x + x];
                if (!seen.Contains(color))
                    seen.Add(color);
            }
        }

        return seen.Count();
    }

    class ZeroLineUI: public ::testing::Test
    {
    protected:
        void SetUp() override
        {
            o2FileSystem.FileDelete(kTestSave);
            o2Application.SetWindowSize(Vec2I(450, 800));
            zero_line::RegisterGameJsApi();
            zero_line::BuildBootstrapScene();
            AppTestDriver::PumpFrames(5);
            ASSERT_EQ(EvalString("ZL.game.state"), "playing");
            Eval(String("ZL.cfg.saveName = '") + kTestSave + "'; ZL.game.best = 0; ZL.game.hud.SetBest(0);");
        }

        void TearDown() override
        {
            o2Scene.Clear(true);
            o2Scene.UpdateDestroyingEntities();
            AppTestDriver::PumpFrames(2);
            o2FileSystem.FileDelete(kTestSave);
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

        String EvalString(const String& expression)
        {
            auto res = o2Scripts.Eval(expression);
            EXPECT_EQ(res.GetValueType(), ScriptValue::ValueType::String) << expression.Data();
            return res.GetValueType() == ScriptValue::ValueType::String ? (String)res : String("<error>");
        }

        // Design units (540x960, centre origin) -> window pixels of the fitted camera
        Vec2F ToScreen(float x, float y)
        {
            Vec2F size = (Vec2F)o2Application.GetContentSize();
            float scale = Math::Min(size.x/(float)zero_line::kScreenWidth, size.y/(float)zero_line::kScreenHeight);
            return Vec2F(x*scale, y*scale);
        }

        Vec2F Tile(int c, int r)
        {
            float x = EvalNumber(String("ZL.cellCenter(") + (String)c + ", " + (String)r + ").x");
            float y = EvalNumber(String("ZL.cellCenter(") + (String)c + ", " + (String)r + ").y");
            return ToScreen(x, y);
        }

        void LoadRows(const String& rows)
        {
            Eval(String("ZL.game.board.LoadRows(") + rows + "); ZL.game.view.Build(ZL.game.board);");
            AppTestDriver::PumpFrames(2);
        }

        // Pumps frames until the JS condition holds. Under load the game clamps its dt while
        // Wait() counts real time, so a fixed wait can end before an animation does
        bool WaitUntil(const String& condition, int maxFrames = 200)
        {
            for (int i = 0; i < maxFrames; i++)
            {
                if (EvalNumber(String("(") + condition + ") ? 1 : 0") == 1)
                    return true;

                AppTestDriver::PumpFrames(1);
            }

            return false;
        }
    };

    TEST_F(ZeroLineUI, BoardRendersAllTiles)
    {
        EXPECT_EQ(EvalNumber("ZL.game.view.CountTiles()"), 25);

        Ref<Bitmap> bitmap = AppTestDriver::TakeScreenshot();
        ASSERT_TRUE(bitmap);
        EXPECT_GT(CountDistinctColors(bitmap), 8);

        EXPECT_TRUE(AppTestDriver::SaveScreenshot(kShots + "01_board.png"));
    }

    TEST_F(ZeroLineUI, DragThroughAZeroSumLineRemovesTiles)
    {
        LoadRows("[[3,-2,5,-1,4],[-1,-1,-3,2,-7],[2,-5,0,1,-2],[-4,3,7,-8,1],[1,-1,-6,4,3]]");

        AppTestDriver::PressCursor(Tile(0, 4)); // 3
        AppTestDriver::MoveCursor(Tile(1, 4));  // -2
        EXPECT_EQ(EvalNumber("ZL.game.board.selection.length"), 2);
        EXPECT_EQ(EvalString("ZL.game.hud.status"), "SUM: +1");
        AppTestDriver::PumpFrames(6); // let the tiles scale up
        EXPECT_TRUE(AppTestDriver::SaveScreenshot(kShots + "02_drag_incomplete.png"));

        AppTestDriver::MoveCursor(Tile(1, 3));  // -1
        EXPECT_EQ(EvalNumber("ZL.game.board.selection.length"), 3);
        EXPECT_EQ(EvalString("ZL.game.hud.status"), "READY");
        AppTestDriver::PumpFrames(6);
        EXPECT_TRUE(AppTestDriver::SaveScreenshot(kShots + "03_drag_ready.png"));

        AppTestDriver::ReleaseCursor();
        EXPECT_EQ(EvalNumber("ZL.game.score"), 60);
        EXPECT_EQ(EvalNumber("ZL.game.board.selection.length"), 0);
        AppTestDriver::PumpFrames(4);
        EXPECT_TRUE(AppTestDriver::SaveScreenshot(kShots + "04_removal_flash.png"));

        AppTestDriver::Wait(0.25f);
        EXPECT_TRUE(AppTestDriver::SaveScreenshot(kShots + "05_falling.png"));

        EXPECT_TRUE(WaitUntil("!ZL.game.view.IsAnimating()")) << "the refill animation must finish";
        EXPECT_EQ(EvalNumber("ZL.game.view.CountTiles()"), 25);
        EXPECT_EQ(EvalNumber("ZL.game.board.IsFull() ? 1 : 0"), 1);
        EXPECT_EQ(EvalNumber("ZL.game.board.Get(0, 4) == 3 ? 1 : 0"), 0) << "the removed 3 is gone from its cell";
        EXPECT_TRUE(AppTestDriver::SaveScreenshot(kShots + "06_refilled.png"));
    }

    TEST_F(ZeroLineUI, DragWithNonZeroSumLeavesTheBoard)
    {
        LoadRows("[[5,-3,5,-1,4],[-1,6,-3,2,-7],[2,-5,0,1,-2],[-4,3,7,-8,1],[1,-1,-6,4,3]]");

        AppTestDriver::Drag(Tile(0, 4), Tile(1, 4));
        AppTestDriver::PumpFrames(2);

        EXPECT_EQ(EvalNumber("ZL.game.score"), 0);
        EXPECT_EQ(EvalNumber("ZL.game.board.Get(0, 4)"), 5);
        EXPECT_EQ(EvalNumber("ZL.game.board.Get(1, 4)"), -3);
        EXPECT_EQ(EvalNumber("ZL.game.board.selection.length"), 0);
        EXPECT_EQ(EvalNumber("ZL.game.view.CountTiles()"), 25);
    }

    TEST_F(ZeroLineUI, TimeUpShowsGameOverAndPlayAgainRestarts)
    {
        Eval("ZL.game.score = 1240; ZL.game.hud.SetScore(1240, false); ZL.game.timeLeft = 0.1;");
        EXPECT_TRUE(WaitUntil("ZL.game.state == 'gameover'"));
        AppTestDriver::PumpFrames(3);

        EXPECT_EQ(EvalString("ZL.game.state"), "gameover");
        EXPECT_EQ(EvalNumber("ZL.game.popup.visible ? 1 : 0"), 1);
        EXPECT_EQ(EvalNumber("ZL.game.best"), 1240);
        EXPECT_TRUE(AppTestDriver::SaveScreenshot(kShots + "07_game_over.png"));

        // the board is dead now
        AppTestDriver::Drag(Tile(0, 0), Tile(1, 0));
        EXPECT_EQ(EvalNumber("ZL.game.board.selection.length"), 0);

        AppTestDriver::Click(ToScreen(0, -90)); // PLAY AGAIN
        AppTestDriver::PumpFrames(3);

        EXPECT_EQ(EvalString("ZL.game.state"), "playing");
        EXPECT_EQ(EvalNumber("ZL.game.score"), 0);
        EXPECT_EQ(EvalNumber("ZL.game.popup.visible ? 1 : 0"), 0);
        EXPECT_GT(EvalNumber("ZL.game.timeLeft"), 59.0f);
        EXPECT_EQ(EvalNumber("ZL.game.view.CountTiles()"), 25);
        EXPECT_TRUE(AppTestDriver::SaveScreenshot(kShots + "08_restarted.png"));
    }
}
