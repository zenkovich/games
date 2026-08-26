#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "ZeroLine/GameJsBridge.h"
#include "o2/Scripts/ScriptEngine.h"

using namespace o2;

// Board model rules through the JS engine directly, no scene: selection, sums, removal,
// gravity, refill, scoring and generation
namespace
{
    // rows[0] is the top row; column 0 is the left one
    const char* kRows = R"JS([
        [ 3, -2,  5, -1,  4],
        [-1,  6, -3,  2, -7],
        [ 2, -5,  0,  1, -2],
        [-4,  3,  7, -8,  1],
        [ 1, -1, -6,  4,  3]])JS";

    class ZeroLineBoard: public ::testing::Test
    {
    protected:
        static void SetUpTestSuite()
        {
            zero_line::RegisterGameJsApi();
            auto res = o2Scripts.Eval("Bridge.RunScript('ZL_Core.js'); Bridge.RunScript('ZL_Board.js');");
            ASSERT_NE(res.GetValueType(), ScriptValue::ValueType::Error) << (String)res.GetError();
        }

        void SetUp() override
        {
            Eval("ZL.tb = new ZL.Board(ZL.makeRng(7));");
            Eval(String("ZL.tb.LoadRows(") + kRows + ");");
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

        String Select(int c, int r)
        {
            return EvalString(String("ZL.tb.Select(") + (String)c + ", " + (String)r + ")");
        }

        int Value(int c, int r)
        {
            return (int)EvalNumber(String("ZL.tb.Get(") + (String)c + ", " + (String)r + ")");
        }
    };

    TEST_F(ZeroLineBoard, OnePlusMinusOneRemoves)
    {
        EXPECT_EQ(Select(0, 0), "added"); // 1
        EXPECT_EQ(Select(1, 0), "added"); // -1
        EXPECT_EQ(EvalNumber("ZL.tb.Sum()"), 0);
        EXPECT_EQ(EvalNumber("ZL.tb.IsReady() ? 1 : 0"), 1);

        Eval("ZL.res = ZL.tb.Commit();");
        EXPECT_EQ(EvalNumber("ZL.res.ok ? 1 : 0"), 1);
        EXPECT_EQ(EvalNumber("ZL.res.removed.length"), 2);
        EXPECT_EQ(EvalNumber("ZL.res.score"), 20);
        EXPECT_EQ(EvalNumber("ZL.tb.selection.length"), 0);

        // the tiles above dropped into the freed cells
        EXPECT_EQ(Value(0, 0), -4);
        EXPECT_EQ(Value(1, 0), 3);
        EXPECT_EQ(EvalNumber("ZL.tb.IsFull() ? 1 : 0"), 1);
    }

    TEST_F(ZeroLineBoard, ThreeMinusTwoMinusOneRemoves)
    {
        Eval("ZL.tb.LoadRows([[3, -2, -1, 5, 5], [4, 4, 4, 4, 4], [4, 4, 4, 4, 4], [4, 4, 4, 4, 4], [4, 4, 4, 4, 4]]);");
        EXPECT_EQ(Select(0, 4), "added");
        EXPECT_EQ(Select(1, 4), "added");
        EXPECT_EQ(EvalNumber("ZL.tb.IsReady() ? 1 : 0"), 0) << "3 + -2 is not zero yet";
        EXPECT_EQ(Select(2, 4), "added");
        EXPECT_EQ(EvalNumber("ZL.tb.IsReady() ? 1 : 0"), 1);

        Eval("ZL.res = ZL.tb.Commit();");
        EXPECT_EQ(EvalNumber("ZL.res.ok ? 1 : 0"), 1);
        EXPECT_EQ(EvalNumber("ZL.res.removed.length"), 3);
        EXPECT_EQ(EvalNumber("ZL.res.score"), 60);
        EXPECT_EQ(EvalNumber("ZL.res.spawns.length"), 3);
        EXPECT_EQ(EvalNumber("ZL.tb.IsFull() ? 1 : 0"), 1);
    }

    TEST_F(ZeroLineBoard, FiveMinusThreeStays)
    {
        Eval("ZL.tb.LoadRows([[5, -3, 1, 1, 1], [1, 1, 1, 1, 1], [1, 1, 1, 1, 1], [1, 1, 1, 1, 1], [1, 1, 1, 1, 1]]);");
        Select(0, 4);
        Select(1, 4);
        EXPECT_EQ(EvalNumber("ZL.tb.Sum()"), 2);
        EXPECT_EQ(EvalNumber("ZL.tb.IsReady() ? 1 : 0"), 0);

        Eval("ZL.res = ZL.tb.Commit();");
        EXPECT_EQ(EvalNumber("ZL.res.ok ? 1 : 0"), 0);
        EXPECT_EQ(Value(0, 4), 5);
        EXPECT_EQ(Value(1, 4), -3);

        Eval("ZL.tb.ClearSelection();");
        EXPECT_EQ(EvalNumber("ZL.tb.selection.length"), 0);
    }

    TEST_F(ZeroLineBoard, TileCannotBeSelectedTwice)
    {
        Select(0, 0);
        Select(1, 0);
        Select(2, 0);
        EXPECT_EQ(Select(0, 0), "ignored") << "a tile already in the line can't be added again";
        EXPECT_EQ(EvalNumber("ZL.tb.selection.length"), 3);

        // stepping back onto the previous tile removes the last one, still no duplicates
        EXPECT_EQ(Select(1, 0), "undo");
        EXPECT_EQ(EvalNumber("ZL.tb.selection.length"), 2);
        EXPECT_EQ(Select(1, 0), "ignored");
        EXPECT_EQ(EvalNumber("ZL.tb.selection.length"), 2);
    }

    TEST_F(ZeroLineBoard, DiagonalMoveIgnored)
    {
        Select(0, 0);
        EXPECT_EQ(Select(1, 1), "ignored");
        EXPECT_EQ(EvalNumber("ZL.tb.selection.length"), 1);
        EXPECT_EQ(Select(0, 1), "added");
        EXPECT_EQ(Select(2, 1), "ignored") << "two cells away is not a neighbour";
        EXPECT_EQ(EvalNumber("ZL.tb.selection.length"), 2);
    }

    TEST_F(ZeroLineBoard, SingleTileIsNeverReady)
    {
        Select(2, 2); // the zero tile
        EXPECT_EQ(EvalNumber("ZL.tb.Sum()"), 0);
        EXPECT_EQ(EvalNumber("ZL.tb.IsReady() ? 1 : 0"), 0);
    }

    TEST_F(ZeroLineBoard, CollapseDropsColumnAndSpawnsOnTop)
    {
        Eval(R"JS(ZL.tb.LoadRows([
            [ 1,  9,  1,  1,  1],
            [ 1,  8,  1,  1,  1],
            [ 1, -4,  1,  1,  1],
            [ 1,  4,  1,  1,  1],
            [ 1,  7,  1,  1,  1]]);)JS");

        Select(1, 1); // 4
        Select(1, 2); // -4
        Eval("ZL.res = ZL.tb.Commit();");
        EXPECT_EQ(EvalNumber("ZL.res.ok ? 1 : 0"), 1);
        EXPECT_EQ(EvalNumber("ZL.res.score"), 80);

        EXPECT_EQ(Value(1, 0), 7) << "the tile below stays";
        EXPECT_EQ(Value(1, 1), 8) << "8 fell two rows";
        EXPECT_EQ(Value(1, 2), 9) << "9 fell two rows";

        EXPECT_EQ(EvalNumber("ZL.res.falls.length"), 2);
        EXPECT_EQ(EvalNumber("ZL.res.falls[0].fromR"), 3);
        EXPECT_EQ(EvalNumber("ZL.res.falls[0].toR"), 1);
        EXPECT_EQ(EvalNumber("ZL.res.falls[1].fromR"), 4);
        EXPECT_EQ(EvalNumber("ZL.res.falls[1].toR"), 2);

        EXPECT_EQ(EvalNumber("ZL.res.spawns.length"), 2);
        EXPECT_EQ(EvalNumber("ZL.res.spawns[0].r"), 3);
        EXPECT_EQ(EvalNumber("ZL.res.spawns[1].r"), 4);
        EXPECT_EQ(EvalNumber("ZL.res.spawns[0].value == ZL.tb.Get(1, 3) ? 1 : 0"), 1);

        // other columns untouched, board full again
        for (int c : { 0, 2, 3, 4 })
        {
            for (int r = 0; r < 5; r++)
                EXPECT_EQ(Value(c, r), 1) << c << " " << r;
        }
        EXPECT_EQ(EvalNumber("ZL.tb.IsFull() ? 1 : 0"), 1);
    }

    TEST_F(ZeroLineBoard, ScoreIsSumOfAbsTimesTenPlusZeroBonus)
    {
        EXPECT_EQ(EvalNumber("ZL.Board.ScoreFor([5, -3, -2])"), 100);
        EXPECT_EQ(EvalNumber("ZL.Board.ScoreFor([4, -4])"), 80);
        EXPECT_EQ(EvalNumber("ZL.Board.ScoreFor([3, 0, -3])"), 160);
        EXPECT_EQ(EvalNumber("ZL.Board.ScoreFor([0, 0])"), 200);
    }

    TEST_F(ZeroLineBoard, SumFormatting)
    {
        EXPECT_EQ(EvalString("ZL.fmtExpr([3, -2, -1])"), "3 + -2 + -1");
        EXPECT_EQ(EvalString("ZL.fmtSigned(3)"), "+3");
        EXPECT_EQ(EvalString("ZL.fmtSigned(-2)"), "-2");
        EXPECT_EQ(EvalString("ZL.fmtSigned(0)"), "0");
    }

    TEST_F(ZeroLineBoard, GeneratorFollowsTheWeightedDistribution)
    {
        Eval(R"JS(
            ZL.gen = new ZL.Board(ZL.makeRng(3));
            ZL.counts = new Array(10).fill(0);
            ZL.outOfRange = 0;
            for (let i = 0; i < 20000; i++)
            {
                let v = ZL.gen.GenerateValue();
                if (v < -9 || v > 9 || Math.floor(v) != v) ZL.outOfRange++;
                else ZL.counts[Math.abs(v)]++;
            }
        )JS");

        EXPECT_EQ(EvalNumber("ZL.outOfRange"), 0);
        // weights 0.25, 15, 8, 5, 3, 2, 1.5, 1, 0.8, 0.5 normalise to a total of 37.05
        EXPECT_NEAR(EvalNumber("ZL.counts[1]/20000"), 15.0f/37.05f, 0.03f);
        EXPECT_NEAR(EvalNumber("ZL.counts[2]/20000"), 8.0f/37.05f, 0.03f);
        EXPECT_NEAR(EvalNumber("ZL.counts[9]/20000"), 0.5f/37.05f, 0.008f);
        EXPECT_LT(EvalNumber("ZL.counts[0]/20000"), 0.015f) << "zero must stay rare";
        EXPECT_GT(EvalNumber("ZL.counts[0]"), 0) << "but not impossible";
        EXPECT_GT(EvalNumber("ZL.counts[1]"), EvalNumber("ZL.counts[2]"));
        EXPECT_GT(EvalNumber("ZL.counts[5]"), EvalNumber("ZL.counts[8]"));
    }

    TEST_F(ZeroLineBoard, SignsStayBalanced)
    {
        Eval("ZL.gen = new ZL.Board(ZL.makeRng(11)); ZL.gen.LoadRows([[5,5,5,5,5],[5,5,5,5,5],[5,5,5,5,5],[5,5,5,5,5],[5,5,5,5,5]]);");
        EXPECT_NEAR(EvalNumber("ZL.gen.PositiveChance()"), 0.2f, 0.001f) << "an all-positive board leans towards negatives";
        Eval("ZL.gen.LoadRows([[-5,-5,-5,-5,-5],[-5,-5,-5,-5,-5],[-5,-5,-5,-5,-5],[-5,-5,-5,-5,-5],[-5,-5,-5,-5,-5]]);");
        EXPECT_NEAR(EvalNumber("ZL.gen.PositiveChance()"), 0.8f, 0.001f);
        Eval("ZL.gen.LoadRows([[1,-1,1,-1,1],[-1,1,-1,1,-1],[1,-1,1,-1,1],[-1,1,-1,1,-1],[1,-1,1,-1,1]]);");
        EXPECT_NEAR(EvalNumber("ZL.gen.PositiveChance()"), 0.5f, 0.05f);
    }

    TEST_F(ZeroLineBoard, EveryBoardHasAMoveAndStaysFullThroughPlay)
    {
        Eval(R"JS(
            ZL.unsolvable = 0;
            ZL.notFull = 0;
            for (let seed = 1; seed <= 60; seed++)
            {
                let b = new ZL.Board(ZL.makeRng(seed));
                if (!b.FindMove()) ZL.unsolvable++;
                if (!b.IsFull()) ZL.notFull++;
            }

            ZL.play = new ZL.Board(ZL.makeRng(99));
            ZL.movesPlayed = 0;
            for (let i = 0; i < 80; i++)
            {
                let path = ZL.play.FindMove();
                if (!path) { ZL.unsolvable++; break; }
                for (let cell of path) ZL.play.Select(cell.c, cell.r);
                if (!ZL.play.IsReady()) { ZL.unsolvable++; break; }
                let res = ZL.play.Commit();
                if (!res.ok) { ZL.unsolvable++; break; }
                ZL.movesPlayed++;
                if (!ZL.play.IsFull()) ZL.notFull++;
                if (!ZL.play.FindMove()) ZL.unsolvable++;
            }
        )JS");

        EXPECT_EQ(EvalNumber("ZL.unsolvable"), 0);
        EXPECT_EQ(EvalNumber("ZL.notFull"), 0);
        EXPECT_EQ(EvalNumber("ZL.movesPlayed"), 80);
    }

    TEST_F(ZeroLineBoard, UnsolvableRefillIsRepaired)
    {
        // every fresh cell rerolls into the same hopeless value: the repair step must kick in
        Eval(R"JS(
            ZL.rep = new ZL.Board(ZL.makeRng(5));
            ZL.rep.LoadRows([[9,9,9,9,9],[9,9,9,9,9],[9,9,9,9,9],[9,9,9,9,9],[9,9,9,9,9]]);
            ZL.rep.GenerateValue = function() { return 9; };
            ZL.rep.EnsureSolvable([{ c: 2, r: 2 }]);
        )JS");
        EXPECT_EQ(EvalNumber("ZL.rep.FindMove() ? 1 : 0"), 1);
        EXPECT_EQ(EvalNumber("ZL.rep.Get(2, 2)"), -9);
        EXPECT_EQ(Value(2, 2), 0) << "the fixture board is untouched";
    }
}
