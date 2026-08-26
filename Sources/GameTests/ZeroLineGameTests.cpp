#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "Scene/SceneTestHelpers.h"
#include "ZeroLine/GameJsBridge.h"
#include "ZeroLine/ZeroLineBootstrap.h"
#include "o2/Scene/Scene.h"
#include "o2/Scripts/ScriptEngine.h"
#include "o2/Utils/FileSystem/FileSystem.h"

using namespace o2;

// The whole game headless through the bootstrap scene: pointer flow, timer, game over,
// restart and best score persistence
namespace
{
    const String kTestSave = "ZeroLineTestSave.json";

    class ZeroLineGame: public ::testing::Test
    {
    protected:
        SceneCleanGuard mSceneGuard;

        void SetUp() override
        {
            o2FileSystem.FileDelete(kTestSave);

            zero_line::RegisterGameJsApi();
            zero_line::BuildBootstrapScene();
            TickFrames(3, 0.016f);

            ASSERT_EQ(EvalString("ZL.game.state"), "playing");
            Eval(String("ZL.cfg.saveName = '") + kTestSave + "'; ZL.game.best = 0; ZL.game.hud.SetBest(0);");
        }

        void TearDown() override
        {
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

        void LoadRows(const String& rows)
        {
            Eval(String("ZL.game.board.LoadRows(") + rows + "); ZL.game.view.Build(ZL.game.board);");
        }

        void PointerDown(int c, int r) { Eval(String("ZL.game.PointerDown(ZL.cellCenter(") + (String)c + ", " + (String)r + "));"); }
        void PointerMove(int c, int r) { Eval(String("ZL.game.PointerMove(ZL.cellCenter(") + (String)c + ", " + (String)r + "));"); }
        void PointerUp() { Eval("ZL.game.PointerUp();"); }
    };

    TEST_F(ZeroLineGame, DragBuildsTheLineAndCommitsOnRelease)
    {
        LoadRows("[[1,1,1,1,1],[1,1,1,1,1],[1,1,1,1,1],[1,1,1,1,1],[1,-1,1,1,1]]");

        PointerDown(0, 0);
        EXPECT_EQ(EvalNumber("ZL.game.board.selection.length"), 1);
        EXPECT_EQ(EvalString("ZL.game.hud.status"), "SUM: +1");

        PointerMove(1, 0);
        EXPECT_EQ(EvalNumber("ZL.game.board.selection.length"), 2);
        EXPECT_EQ(EvalString("ZL.game.hud.status"), "READY");
        EXPECT_EQ(EvalString("ZL.game.hud.expr"), "1 + -1 = 0");

        PointerUp();
        EXPECT_EQ(EvalNumber("ZL.game.score"), 20);
        EXPECT_EQ(EvalNumber("ZL.game.moves"), 1);
        EXPECT_EQ(EvalNumber("ZL.game.board.selection.length"), 0);
        EXPECT_EQ(EvalNumber("ZL.game.hud.floats.length"), 1) << "the +20 float is shown";
        EXPECT_EQ(EvalString("ZL.game.hud.status"), "");
        EXPECT_EQ(EvalNumber("ZL.game.board.IsFull() ? 1 : 0"), 1);
        EXPECT_EQ(EvalNumber("ZL.game.view.CountTiles()"), 25);

        TickFrames(40, 0.033f);
        EXPECT_EQ(EvalNumber("ZL.game.view.IsAnimating() ? 1 : 0"), 0) << "the refill animation finishes";
        EXPECT_EQ(EvalNumber("ZL.game.hud.floats.length"), 0);
    }

    TEST_F(ZeroLineGame, ReleaseWithNonZeroSumKeepsTheBoard)
    {
        LoadRows("[[1,1,1,1,1],[1,1,1,1,1],[1,1,1,1,1],[1,1,1,1,1],[5,-3,1,1,1]]");

        PointerDown(0, 0);
        PointerMove(1, 0);
        EXPECT_EQ(EvalString("ZL.game.hud.status"), "SUM: +2");
        EXPECT_EQ(EvalString("ZL.game.hud.expr"), "5 + -3");
        PointerUp();

        EXPECT_EQ(EvalNumber("ZL.game.score"), 0);
        EXPECT_EQ(EvalNumber("ZL.game.board.Get(0, 0)"), 5);
        EXPECT_EQ(EvalNumber("ZL.game.board.Get(1, 0)"), -3);
        EXPECT_EQ(EvalNumber("ZL.game.board.selection.length"), 0);
    }

    TEST_F(ZeroLineGame, FastSwipePicksUpSkippedTiles)
    {
        PointerDown(0, 0);
        PointerMove(3, 0); // one event across three cells
        EXPECT_EQ(EvalNumber("ZL.game.board.selection.length"), 4);
        EXPECT_EQ(EvalNumber("ZL.game.board.selection[3].c"), 3);

        // the diagonal jump adds nothing: (4,1) is no neighbour of (3,0)
        PointerMove(4, 1);
        EXPECT_LE(EvalNumber("ZL.game.board.selection.length"), 5);
        PointerUp();
    }

    TEST_F(ZeroLineGame, GapsBetweenTilesAreNotHits)
    {
        Eval("ZL.gap = ZL.cellAt(ZL.cfg.cell/2, ZL.cfg.boardY); ZL.gapHit = ZL.gap ? 1 : 0;");
        EXPECT_EQ(EvalNumber("ZL.gapHit"), 0);
        Eval("ZL.out = ZL.cellAt(ZL.cfg.cell*3, 0); ZL.outHit = ZL.out ? 1 : 0;");
        EXPECT_EQ(EvalNumber("ZL.outHit"), 0);
        EXPECT_EQ(EvalNumber("ZL.cellAt(0, ZL.cfg.boardY).c"), 2);
        EXPECT_EQ(EvalNumber("ZL.cellAt(0, ZL.cfg.boardY).r"), 2);
    }

    TEST_F(ZeroLineGame, TimerEndsTheRoundAndBlocksInput)
    {
        EXPECT_EQ(EvalNumber("ZL.game.timeLeft"), 60.0f - 3*0.016f);
        EXPECT_EQ(EvalNumber("ZL.game.hud.time"), 60);

        Eval("ZL.game.timeLeft = 0.05;");
        TickFrames(5, 0.033f);

        EXPECT_EQ(EvalString("ZL.game.state"), "gameover");
        EXPECT_EQ(EvalNumber("ZL.game.popup.visible ? 1 : 0"), 1);
        EXPECT_EQ(EvalNumber("ZL.game.hud.time"), 0);
        EXPECT_EQ(EvalNumber("ZL.game.timeLeft"), 0);

        PointerDown(0, 0);
        PointerMove(1, 0);
        EXPECT_EQ(EvalNumber("ZL.game.board.selection.length"), 0) << "the board ignores input after game over";
        PointerUp();
        EXPECT_EQ(EvalNumber("ZL.game.score"), 0);
    }

    TEST_F(ZeroLineGame, TimeoutCancelsTheCurrentLine)
    {
        PointerDown(0, 0);
        PointerMove(1, 0);
        ASSERT_EQ(EvalNumber("ZL.game.board.selection.length"), 2);

        Eval("ZL.game.timeLeft = 0.001;");
        TickFrame(0.033f);

        EXPECT_EQ(EvalString("ZL.game.state"), "gameover");
        EXPECT_EQ(EvalNumber("ZL.game.board.selection.length"), 0);
        EXPECT_EQ(EvalNumber("ZL.game.dragging ? 1 : 0"), 0);
    }

    TEST_F(ZeroLineGame, PlayAgainResetsTheRound)
    {
        Eval("ZL.game.score = 500; ZL.game.timeLeft = 0.001;");
        TickFrame(0.033f);
        ASSERT_EQ(EvalString("ZL.game.state"), "gameover");
        EXPECT_EQ(EvalNumber("ZL.game.best"), 500);

        Eval("ZL.game.Restart();");
        EXPECT_EQ(EvalString("ZL.game.state"), "playing");
        EXPECT_EQ(EvalNumber("ZL.game.score"), 0);
        EXPECT_EQ(EvalNumber("ZL.game.moves"), 0);
        EXPECT_EQ(EvalNumber("ZL.game.timeLeft"), 60);
        EXPECT_EQ(EvalNumber("ZL.game.popup.visible ? 1 : 0"), 0);
        EXPECT_EQ(EvalNumber("ZL.game.board.selection.length"), 0);
        EXPECT_EQ(EvalNumber("ZL.game.board.IsFull() ? 1 : 0"), 1);
        EXPECT_EQ(EvalNumber("ZL.game.board.FindMove() ? 1 : 0"), 1);
        EXPECT_EQ(EvalNumber("ZL.game.view.CountTiles()"), 25);
        EXPECT_EQ(EvalNumber("ZL.game.best"), 500) << "the best score survives the restart";

        TickFrames(10, 0.033f);
        EXPECT_NEAR(EvalNumber("ZL.game.timeLeft"), 60.0f - 10*0.033f, 0.01f) << "the timer runs again";
    }

    TEST_F(ZeroLineGame, BestScoreIsSavedAndLoaded)
    {
        Eval("ZL.game.score = 777; ZL.game.timeLeft = 0.001;");
        TickFrame(0.033f);
        EXPECT_EQ(EvalNumber("ZL.game.best"), 777);
        EXPECT_EQ(EvalNumber("ZL.game.popup.isNewBest ? 1 : 0"), 1);
        EXPECT_TRUE(o2FileSystem.IsFileExist(kTestSave));

        // a lower score doesn't overwrite it
        Eval("ZL.game.Restart(); ZL.game.score = 5; ZL.game.timeLeft = 0.001;");
        TickFrame(0.033f);
        EXPECT_EQ(EvalNumber("ZL.game.best"), 777);
        EXPECT_EQ(EvalNumber("ZL.game.popup.isNewBest ? 1 : 0"), 0);

        // a fresh game instance reads it back, like a relaunched app
        Eval("ZL.game2 = new ZL.Game(ZL.game.root); ZL.game2.Start();");
        EXPECT_EQ(EvalNumber("ZL.game2.best"), 777);
    }
}
