#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "o2/Assets/Assets.h"
#include "o2/Scripts/ScriptEngine.h"
#include "o2/Scripts/ScriptValue.h"
#include "o2/Utils/FileSystem/File.h"

using namespace o2;

#if IS_SCRIPTING_SUPPORTED

namespace
{
	ScriptValue EvalChecked(const char* code)
	{
		ScriptValue res = o2Scripts.Eval(code);
		EXPECT_NE(res.GetValueType(), ScriptValue::ValueType::Error) << res.GetError().Data();
		return res;
	}
}

// Headless tests of the Word Fall game model (WordModel from WordFallGame.js):
// bag, selection, dictionary, scoring, gravity, ice and boosters
class WordFallModel: public ::testing::Test
{
protected:
	void SetUp() override
	{
		if (o2Scripts.Eval("typeof WordModel !== 'undefined'").GetValue<bool>())
		{
			ResetModel();
			return;
		}

		InFile file(o2Assets.GetAssetsPath() + "Scripts/WordFallGame.js");
		ASSERT_TRUE(file.IsOpened()) << "Scripts/WordFallGame.js must exist in assets";

		auto parsed = o2Scripts.Parse(file.ReadFullData(), "WordFallGame.js");
		auto runResult = o2Scripts.Run(parsed);
		ASSERT_NE(runResult.GetValueType(), ScriptValue::ValueType::Error) << runResult.GetError().Data();

		ASSERT_TRUE(o2Scripts.Eval("typeof WordModel !== 'undefined'").GetValue<bool>());
		ResetModel();
	}

	void ResetModel()
	{
		EvalChecked("wfm = new WordModel(42); wfm.NewGame(WordFallConfig.level);");
	}

	// Fills the board with rare consonants so crafted cells can't collide with accidents
	void FillBoardWithStubs()
	{
		EvalChecked(
			"for (var c = 0; c < 7; c++)"
			"    for (var r = 0; r < 8; r++)"
			"        wfm.DebugSetTile(c, r, 'Щ');");
	}
};

TEST_F(WordFallModel, BagMatchesConfiguredProportions)
{
	EvalChecked("wfm._RefillBag();");
	EXPECT_EQ(EvalChecked("wfm._bag.length").GetValue<int>(), 100);

	// vowels: О9 А8 Е8 И7 У3 Я2 Ы2 Э1 Ю1 = 41
	EXPECT_EQ(EvalChecked("wfm._bag.filter(function(l) { return wfm.IsVowel(l); }).length").GetValue<int>(), 41);
}

TEST_F(WordFallModel, NewGameFillsGridAndIce)
{
	EXPECT_TRUE(EvalChecked(
		"var filled = true;"
		"for (var c = 0; c < 7; c++)"
		"    for (var r = 0; r < 8; r++)"
		"    {"
		"        var t = wfm.GetTile(c, r);"
		"        if (!t || !t.letter || !(t.value >= 0))"
		"            filled = false;"
		"    }"
		"filled").GetValue<bool>());

	EXPECT_EQ(EvalChecked(
		"var ice = 0;"
		"for (var c = 0; c < 7; c++)"
		"    for (var r = 0; r < 8; r++)"
		"        if (wfm.GetTile(c, r).ice > 0) ice++;"
		"ice").GetValue<int>(), 4);
}

TEST_F(WordFallModel, SameSeedGivesSameBoard)
{
	EXPECT_TRUE(EvalChecked(
		"var a = new WordModel(7); a.NewGame(WordFallConfig.level);"
		"var b = new WordModel(7); b.NewGame(WordFallConfig.level);"
		"var same = true;"
		"for (var c = 0; c < 7; c++)"
		"    for (var r = 0; r < 8; r++)"
		"        if (a.GetTile(c, r).letter != b.GetTile(c, r).letter) same = false;"
		"same").GetValue<bool>());
}

TEST_F(WordFallModel, SpawnForcesVowelAfterConsonantRun)
{
	FillBoardWithStubs();
	EXPECT_TRUE(EvalChecked("wfm._NeedVowelAt(3, 4)").GetValue<bool>());

	// letters drawn under the anti-clog rule must be vowels while the bag has them
	EXPECT_TRUE(EvalChecked(
		"var allVowels = true;"
		"for (var i = 0; i < 10; i++)"
		"    if (!wfm.IsVowel(wfm._DrawLetter(true))) allVowels = false;"
		"allVowels").GetValue<bool>());
}

TEST_F(WordFallModel, SelectionTogglesAndCutsTail)
{
	FillBoardWithStubs();
	EvalChecked(
		"wfm.ToggleSelect(0, 0); wfm.ToggleSelect(1, 0); wfm.ToggleSelect(2, 0);");
	EXPECT_EQ(EvalChecked("wfm.GetSelected().length").GetValue<int>(), 3);

	// re-clicking the second letter removes it and the tail after it
	EvalChecked("wfm.ToggleSelect(1, 0);");
	EXPECT_EQ(EvalChecked("wfm.GetSelected().length").GetValue<int>(), 1);
	EXPECT_EQ(EvalChecked("wfm.GetSelected()[0].c").GetValue<int>(), 0);
}

TEST_F(WordFallModel, IcedTileCanNotBeSelected)
{
	FillBoardWithStubs();
	EvalChecked("wfm._grid[2][2].ice = 1;");
	EXPECT_EQ(EvalChecked("wfm.ToggleSelect(2, 2)").GetValue<String>(), String("ice"));
	EXPECT_EQ(EvalChecked("wfm.GetSelected().length").GetValue<int>(), 0);
}

TEST_F(WordFallModel, DictionaryAndJokerMatching)
{
	EXPECT_TRUE(EvalChecked("wfm.IsWordInDict('КОТ')").GetValue<bool>());
	EXPECT_TRUE(EvalChecked("wfm.IsWordInDict('СЛОН')").GetValue<bool>());
	EXPECT_FALSE(EvalChecked("wfm.IsWordInDict('ЙЦУ')").GetValue<bool>());
	EXPECT_FALSE(EvalChecked("wfm.IsWordInDict('К')").GetValue<bool>());

	EXPECT_TRUE(EvalChecked("wfm.IsWordInDict('К?Т')").GetValue<bool>());
	EXPECT_TRUE(EvalChecked("wfm.IsWordInDict('?ЛОН')").GetValue<bool>());
	EXPECT_FALSE(EvalChecked("wfm.IsWordInDict('Щ?Щ')").GetValue<bool>());
}

TEST_F(WordFallModel, AdjacentClusterMultipliesScore)
{
	FillBoardWithStubs();
	EvalChecked(
		"wfm.DebugSetTile(0, 0, 'К');"  // К=2
		"wfm.DebugSetTile(1, 0, 'О');"  // О=1
		"wfm.DebugSetTile(2, 0, 'Т');"  // Т=1
		"wfm.ToggleSelect(0, 0); wfm.ToggleSelect(1, 0); wfm.ToggleSelect(2, 0);");

	// contiguous cluster of 3 → base 4 × cluster 3
	EXPECT_EQ(EvalChecked("wfm.ComputeScore(wfm.GetSelected()).total").GetValue<int>(), 12);
	EXPECT_EQ(EvalChecked("wfm.ComputeScore(wfm.GetSelected()).cluster").GetValue<int>(), 3);
}

TEST_F(WordFallModel, ScatteredLettersGetNoClusterBonus)
{
	FillBoardWithStubs();
	EvalChecked(
		"wfm.DebugSetTile(0, 0, 'К');"
		"wfm.DebugSetTile(3, 3, 'О');"
		"wfm.DebugSetTile(6, 7, 'Т');"
		"wfm.ToggleSelect(0, 0); wfm.ToggleSelect(3, 3); wfm.ToggleSelect(6, 7);");

	EXPECT_EQ(EvalChecked("wfm.ComputeScore(wfm.GetSelected()).cluster").GetValue<int>(), 1);
	EXPECT_EQ(EvalChecked("wfm.ComputeScore(wfm.GetSelected()).total").GetValue<int>(), 4);
}

TEST_F(WordFallModel, DiagonalCountsAsAdjacency)
{
	FillBoardWithStubs();
	EvalChecked(
		"wfm.DebugSetTile(0, 0, 'К');"
		"wfm.DebugSetTile(1, 1, 'О');"
		"wfm.DebugSetTile(2, 2, 'Т');"
		"wfm.ToggleSelect(0, 0); wfm.ToggleSelect(1, 1); wfm.ToggleSelect(2, 2);");

	EXPECT_EQ(EvalChecked("wfm.ComputeScore(wfm.GetSelected()).cluster").GetValue<int>(), 3);
}

TEST_F(WordFallModel, LongWordGetsLengthMultiplier)
{
	// 5 letters → ×1.5
	EXPECT_FLOAT_EQ(EvalChecked("wfm.LengthMultiplier(5)").ToNumber(), 1.5f);
	EXPECT_FLOAT_EQ(EvalChecked("wfm.LengthMultiplier(3)").ToNumber(), 1.0f);
}

TEST_F(WordFallModel, AcceptWordBurnsFallsAndSpawns)
{
	FillBoardWithStubs();
	EvalChecked(
		"wfm.DebugSetTile(0, 0, 'К');"
		"wfm.DebugSetTile(1, 0, 'О');"
		"wfm.DebugSetTile(2, 0, 'Т');"
		"wfm.ToggleSelect(0, 0); wfm.ToggleSelect(1, 0); wfm.ToggleSelect(2, 0);"
		"wfa = wfm.AcceptWord();");

	EXPECT_TRUE(EvalChecked("wfa.ok").GetValue<bool>());
	EXPECT_EQ(EvalChecked("wfa.score.total").GetValue<int>(), 12);
	EXPECT_EQ(EvalChecked("wfm.GetScore()").GetValue<int>(), 12);
	EXPECT_EQ(EvalChecked("wfm.GetMovesLeft()").GetValue<int>(), 11);
	EXPECT_EQ(EvalChecked("wfm.GetSelected().length").GetValue<int>(), 0);

	// a tile burned at the bottom of each of 3 columns: everything above fell one row
	EXPECT_TRUE(EvalChecked("wfa.moved.some(function(m) { return m.c == 0 && m.fromR == 1 && m.toR == 0; })").GetValue<bool>());
	EXPECT_EQ(EvalChecked("wfa.spawned.length").GetValue<int>(), 3);
	EXPECT_TRUE(EvalChecked("wfa.spawned.every(function(s) { return s.r == 7; })").GetValue<bool>());

	// no holes left
	EXPECT_TRUE(EvalChecked(
		"var filled = true;"
		"for (var c = 0; c < 7; c++)"
		"    for (var r = 0; r < 8; r++)"
		"        if (!wfm.GetTile(c, r)) filled = false;"
		"filled").GetValue<bool>());
}

TEST_F(WordFallModel, InvalidWordIsRejected)
{
	FillBoardWithStubs();
	EvalChecked(
		"wfm.ToggleSelect(0, 0); wfm.ToggleSelect(1, 0);"
		"wfa = wfm.AcceptWord();");

	EXPECT_FALSE(EvalChecked("wfa.ok").GetValue<bool>());
	EXPECT_EQ(EvalChecked("wfm.GetMovesLeft()").GetValue<int>(), 12);
}

TEST_F(WordFallModel, BurningWordBreaksAdjacentIce)
{
	FillBoardWithStubs();
	EvalChecked(
		"wfm.DebugSetTile(0, 0, 'К');"
		"wfm.DebugSetTile(1, 0, 'О');"
		"wfm.DebugSetTile(2, 0, 'Т');"
		"wfm._grid[1][1].ice = 1;"   // diagonal neighbour of the burned row
		"wfm._grid[5][5].ice = 1;"   // far away — must stay frozen
		"wfm.ToggleSelect(0, 0); wfm.ToggleSelect(1, 0); wfm.ToggleSelect(2, 0);"
		"wfa = wfm.AcceptWord();");

	EXPECT_EQ(EvalChecked("wfa.iceBroken.length").GetValue<int>(), 1);

	// the far ice tile survived the collapse (it fell but kept its ice flag)
	EXPECT_EQ(EvalChecked(
		"var ice = 0;"
		"for (var c = 0; c < 7; c++)"
		"    for (var r = 0; r < 8; r++)"
		"        if (wfm.GetTile(c, r).ice > 0) ice++;"
		"ice").GetValue<int>(), 1);
}

TEST_F(WordFallModel, ReachingTargetWins)
{
	FillBoardWithStubs();
	EvalChecked(
		"wfm._target = 10;"
		"wfm.DebugSetTile(0, 0, 'К');"
		"wfm.DebugSetTile(1, 0, 'О');"
		"wfm.DebugSetTile(2, 0, 'Т');"
		"wfm.ToggleSelect(0, 0); wfm.ToggleSelect(1, 0); wfm.ToggleSelect(2, 0);"
		"wfa = wfm.AcceptWord();");

	EXPECT_EQ(EvalChecked("wfm.GetState()").GetValue<String>(), String("win"));
	EXPECT_EQ(EvalChecked("wfm.ToggleSelect(3, 3)").GetValue<String>(), String("blocked"));
}

TEST_F(WordFallModel, RunningOutOfMovesLoses)
{
	FillBoardWithStubs();
	EvalChecked(
		"wfm._movesLeft = 1;"
		"wfm.DebugSetTile(0, 0, 'К');"
		"wfm.DebugSetTile(1, 0, 'О');"
		"wfm.DebugSetTile(2, 0, 'Т');"
		"wfm.ToggleSelect(0, 0); wfm.ToggleSelect(1, 0); wfm.ToggleSelect(2, 0);"
		"wfa = wfm.AcceptWord();");

	EXPECT_EQ(EvalChecked("wfm.GetState()").GetValue<String>(), String("lose"));
}

TEST_F(WordFallModel, HammerDestroysTileWithoutMoveCost)
{
	FillBoardWithStubs();
	EvalChecked(
		"wfm._grid[3][0].ice = 1;"
		"wfa = wfm.UseHammer(3, 0);");

	EXPECT_TRUE(EvalChecked("wfa.ok").GetValue<bool>());
	EXPECT_EQ(EvalChecked("wfm.GetCharges(0)").GetValue<int>(), 2);
	EXPECT_EQ(EvalChecked("wfm.GetMovesLeft()").GetValue<int>(), 12);

	// the iced tile is gone, a new tile spawned on top of the column
	EXPECT_EQ(EvalChecked("wfm.GetTile(3, 0).ice").GetValue<int>(), 0);
	EXPECT_EQ(EvalChecked("wfa.spawned.length").GetValue<int>(), 1);

	EvalChecked("wfm._charges[0] = 0;");
	EXPECT_FALSE(EvalChecked("wfm.UseHammer(0, 0).ok").GetValue<bool>());
}

TEST_F(WordFallModel, ShufflePreservesLettersAndSkipsIce)
{
	FillBoardWithStubs();
	EvalChecked(
		"wfm.DebugSetTile(0, 0, 'А'); wfm.DebugSetTile(1, 0, 'Б'); wfm.DebugSetTile(2, 0, 'В');"
		"wfm.DebugSetTile(4, 4, 'Ю');"
		"wfm._grid[4][4].ice = 1;"
		"var before = [];"
		"for (var c = 0; c < 7; c++)"
		"    for (var r = 0; r < 8; r++)"
		"        before.push(wfm.GetTile(c, r).letter);"
		"before.sort();"
		"wfs = wfm.UseShuffle();"
		"var after = [];"
		"for (var c = 0; c < 7; c++)"
		"    for (var r = 0; r < 8; r++)"
		"        after.push(wfm.GetTile(c, r).letter);"
		"after.sort();"
		"wfSame = before.join('') == after.join('');");

	EXPECT_TRUE(EvalChecked("wfs.ok").GetValue<bool>());
	EXPECT_TRUE(EvalChecked("wfSame").GetValue<bool>());
	EXPECT_EQ(EvalChecked("wfm.GetTile(4, 4).letter").GetValue<String>(), String("Ю"));
	EXPECT_EQ(EvalChecked("wfm.GetCharges(1)").GetValue<int>(), 2);
}

TEST_F(WordFallModel, HintFindsMostExpensiveWord)
{
	FillBoardWithStubs();
	// only letters for КОТ (4 points base) and ФАКТ (11 points base × 1.25) are available
	EvalChecked(
		"wfm.DebugSetTile(0, 0, 'К');"
		"wfm.DebugSetTile(1, 0, 'О');"
		"wfm.DebugSetTile(2, 0, 'Т');"
		"wfm.DebugSetTile(0, 2, 'Ф');"
		"wfm.DebugSetTile(1, 2, 'А');"
		"wfm.DebugSetTile(2, 2, 'К');"
		"wfm.DebugSetTile(3, 2, 'Т');"
		"wfh = wfm.UseHint();");

	EXPECT_TRUE(EvalChecked("wfh.ok").GetValue<bool>());
	EXPECT_EQ(EvalChecked("wfh.word").GetValue<String>(), String("ФАКТ"));
	EXPECT_EQ(EvalChecked("wfm.GetSelected().length").GetValue<int>(), 4);
	EXPECT_EQ(EvalChecked("wfm.GetCharges(2)").GetValue<int>(), 2);

	// the hinted selection must be accepted as a valid word
	EXPECT_TRUE(EvalChecked("wfm.AcceptWord().ok").GetValue<bool>());
}

TEST_F(WordFallModel, JokerActsAsAnyLetter)
{
	FillBoardWithStubs();
	EvalChecked(
		"wfm.DebugSetTile(0, 0, 'К');"
		"wfm.DebugSetTile(1, 0, 'Щ');"
		"wfm.DebugSetTile(2, 0, 'Т');"
		"wfj = wfm.UseJoker(1, 0);"
		"wfm.ToggleSelect(0, 0); wfm.ToggleSelect(1, 0); wfm.ToggleSelect(2, 0);");

	EXPECT_TRUE(EvalChecked("wfj.ok").GetValue<bool>());
	EXPECT_EQ(EvalChecked("wfm.CurrentWord()").GetValue<String>(), String("К?Т"));
	EXPECT_EQ(EvalChecked("wfm.GetCharges(3)").GetValue<int>(), 2);

	// joker contributes 0 points: base = К(2) + Т(1) = 3, cluster 3 → 9
	EXPECT_EQ(EvalChecked("wfm.ComputeScore(wfm.GetSelected()).total").GetValue<int>(), 9);
	EXPECT_TRUE(EvalChecked("wfm.AcceptWord().ok").GetValue<bool>());
}

TEST_F(WordFallModel, JokerNotAllowedOnIce)
{
	FillBoardWithStubs();
	EvalChecked("wfm._grid[1][1].ice = 1;");
	EXPECT_FALSE(EvalChecked("wfm.UseJoker(1, 1).ok").GetValue<bool>());
	EXPECT_EQ(EvalChecked("wfm.GetCharges(3)").GetValue<int>(), 3);
}

TEST_F(WordFallModel, DoublerDoublesLetterValue)
{
	FillBoardWithStubs();
	EvalChecked(
		"wfm.DebugSetTile(0, 0, 'К');"
		"wfm.DebugSetTile(1, 0, 'О');"
		"wfm.DebugSetTile(2, 0, 'Т');"
		"wfd = wfm.UseDoubler(0, 0);"
		"wfm.ToggleSelect(0, 0); wfm.ToggleSelect(1, 0); wfm.ToggleSelect(2, 0);");

	EXPECT_TRUE(EvalChecked("wfd.ok").GetValue<bool>());
	EXPECT_EQ(EvalChecked("wfm.GetCharges(4)").GetValue<int>(), 2);

	// base = К(2×2) + О(1) + Т(1) = 6, cluster 3 → 18
	EXPECT_EQ(EvalChecked("wfm.ComputeScore(wfm.GetSelected()).total").GetValue<int>(), 18);
}

#endif // IS_SCRIPTING_SUPPORTED
