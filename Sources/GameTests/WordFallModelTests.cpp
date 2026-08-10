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
		"wfm.DebugSetTile(0, 0, 'К');"
		"wfm.DebugSetTile(1, 0, 'О');"
		"wfm.DebugSetTile(2, 0, 'Т');"
		"wfm.ToggleSelect(0, 0); wfm.ToggleSelect(1, 0); wfm.ToggleSelect(2, 0);");

	// компактная тройка: base 4 × кластер 3
	EXPECT_EQ(EvalChecked("wfm.ComputeScore(wfm.GetSelected()).total").GetValue<int>(), 12);
	EXPECT_EQ(EvalChecked("wfm.ComputeScore(wfm.GetSelected()).cluster").GetValue<int>(), 3);
}

TEST_F(WordFallModel, ScatteredSelectionAllowedWithoutClusterBonus)
{
	FillBoardWithStubs();
	EvalChecked(
		"wfm.DebugSetTile(0, 0, 'К');"
		"wfm.DebugSetTile(3, 3, 'О');"
		"wfm.DebugSetTile(6, 7, 'Т');"
		"wfmRes = wfm.ToggleSelect(0, 0); wfmRes = wfm.ToggleSelect(3, 3); wfmRes = wfm.ToggleSelect(6, 7);");

	// выбор свободный — разбросанные буквы допустимы, но без кластерного бонуса
	EXPECT_EQ(EvalChecked("wfmRes").GetValue<String>(), String("added"));
	EXPECT_EQ(EvalChecked("wfm.GetSelected().length").GetValue<int>(), 3);
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
	// на поле должно быть собираемое слово, иначе страховка выполнимости
	// подсеет буквы и изменит мультинабор
	EvalChecked(
		"wfm.DebugSetTile(0, 0, 'К'); wfm.DebugSetTile(1, 0, 'О'); wfm.DebugSetTile(2, 0, 'Т');"
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
	// буквы для КОТ (база 4) и ФАКТ (база 9 × 1.25) точно на поле; словарь большой —
	// подсказка может найти и дороже (например КОФТА), проверяем нижнюю границу
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
	EXPECT_GE(EvalChecked("wfh.value").ToNumber(), 9.0f * 1.25f); // не хуже ФАКТ (база 9, ×1.25)
	EXPECT_GE(EvalChecked("wfm.GetSelected().length").GetValue<int>(), 4);
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

	// joker contributes 0 points: base = К(2) + Т(1) = 3, кластер 3 → 9
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

TEST_F(WordFallModel, FiveLetterWordEarnsBombOnLastCell)
{
	FillBoardWithStubs();
	EvalChecked(
		"wfm.DebugSetTile(0, 0, 'Ч'); wfm.DebugSetTile(1, 0, 'А'); wfm.DebugSetTile(2, 0, 'Ш');"
		"wfm.DebugSetTile(3, 0, 'К'); wfm.DebugSetTile(4, 0, 'А');"
		"for (var i = 0; i < 5; i++) wfm.ToggleSelect(i, 0);"
		"wfa = wfm.AcceptWord();");

	EXPECT_TRUE(EvalChecked("wfa.ok").GetValue<bool>());
	EXPECT_EQ(EvalChecked("wfa.powerupEarned").GetValue<String>(), String("bomb"));

	// бонус прикрепился к плитке, занявшей клетку последней буквы слова
	EXPECT_EQ(EvalChecked("wfm.GetTile(4, 0).powerup").GetValue<String>(), String("bomb"));
}

TEST_F(WordFallModel, LongerWordsEarnRocketAndWand)
{
	FillBoardWithStubs();
	EvalChecked(
		"var w = 'РАКЕТА';"
		"for (var i = 0; i < 6; i++) { wfm.DebugSetTile(i, 0, w[i]); wfm.ToggleSelect(i, 0); }"
		"wfa = wfm.AcceptWord();");

	EXPECT_EQ(EvalChecked("wfa.powerupEarned").GetValue<String>(), String("rocket"));
	EXPECT_EQ(EvalChecked("wfm.GetTile(5, 0).powerup").GetValue<String>(), String("rocket"));

	EXPECT_EQ(EvalChecked("wfm.PowerupForLength(7)").GetValue<String>(), String("wand"));
	EXPECT_EQ(EvalChecked("wfm.PowerupForLength(9)").GetValue<String>(), String("wand"));
	EXPECT_TRUE(EvalChecked("wfm.PowerupForLength(4) === null").GetValue<bool>());
}

TEST_F(WordFallModel, BombDestroysAreaAndAddsPoints)
{
	FillBoardWithStubs();
	EvalChecked(
		"wfm.DebugSetTile(1, 0, 'К'); wfm.DebugSetTile(2, 0, 'О'); wfm.DebugSetTile(3, 0, 'Т');"
		"wfm._grid[2][0].powerup = 'bomb';"
		"wfm.ToggleSelect(1, 0); wfm.ToggleSelect(2, 0); wfm.ToggleSelect(3, 0);"
		"wfa = wfm.AcceptWord();");

	// слово 12 + три взорванные Щ ряда выше по 5
	EXPECT_EQ(EvalChecked("wfa.gain").GetValue<int>(), 27);
	EXPECT_EQ(EvalChecked("wfm.GetScore()").GetValue<int>(), 27);
	EXPECT_EQ(EvalChecked("wfa.powerupsUsed.length").GetValue<int>(), 1);

	// сгорели 3 буквы слова и 3 клетки взрыва
	EXPECT_EQ(EvalChecked("wfa.spawned.length").GetValue<int>(), 6);
}

TEST_F(WordFallModel, RocketActivatesCrossAndKeepsLetters)
{
	FillBoardWithStubs();
	EvalChecked(
		"wfm.DebugSetTile(1, 0, 'К'); wfm.DebugSetTile(2, 0, 'О'); wfm.DebugSetTile(3, 0, 'Т');"
		"wfm._grid[2][0].powerup = 'rocket';"
		"wfm._grid[2][5].ice = 1;"
		"wfm.ToggleSelect(1, 0); wfm.ToggleSelect(2, 0); wfm.ToggleSelect(3, 0);"
		"wfa = wfm.AcceptWord();");

	// крест: 4 плитки ряда (без букв слова) + 7 плиток колонки, все Щ по 5
	EXPECT_EQ(EvalChecked("wfa.activated.length").GetValue<int>(), 11);
	EXPECT_EQ(EvalChecked("wfa.gain").GetValue<int>(), 12 + 55);

	// активированные буквы остаются на поле — сгорело только слово
	EXPECT_EQ(EvalChecked("wfa.spawned.length").GetValue<int>(), 3);

	// ракета сняла лёд с задетой плитки
	EXPECT_TRUE(EvalChecked("wfa.iceBroken.some(function(b) { return b.c == 2 && b.r == 5; })").GetValue<bool>());
	EXPECT_EQ(EvalChecked("wfm.GetTile(2, 5).ice").GetValue<int>(), 0);
}

TEST_F(WordFallModel, WandActivatesAllSameLetters)
{
	FillBoardWithStubs();
	EvalChecked(
		"wfm.DebugSetTile(0, 0, 'К'); wfm.DebugSetTile(1, 0, 'О'); wfm.DebugSetTile(2, 0, 'Т');"
		"wfm.DebugSetTile(4, 4, 'К'); wfm.DebugSetTile(6, 7, 'К');"
		"wfm._grid[0][0].powerup = 'wand';"
		"wfm._grid[6][7].ice = 1;"
		"wfm.ToggleSelect(0, 0); wfm.ToggleSelect(1, 0); wfm.ToggleSelect(2, 0);"
		"wfa = wfm.AcceptWord();");

	// активированы обе другие «К» (по 2 очка), сами остались на поле без льда
	EXPECT_EQ(EvalChecked("wfa.activated.length").GetValue<int>(), 2);
	EXPECT_EQ(EvalChecked("wfa.gain").GetValue<int>(), 12 + 4);
	EXPECT_EQ(EvalChecked("wfa.spawned.length").GetValue<int>(), 3);
	EXPECT_EQ(EvalChecked("wfm.GetTile(4, 4).letter").GetValue<String>(), String("К"));
	EXPECT_EQ(EvalChecked("wfm.GetTile(6, 7).ice").GetValue<int>(), 0);
}

TEST_F(WordFallModel, WordTaskSeedsWordAndTracksProgress)
{
	EvalChecked(
		"wfm.NewGame({ target: 100, moves: 10, ice: [], charges: [3, 3, 3, 3, 3],"
		"              tasks: [{ type: 'word', word: 'КОТ' }] });");

	// слово из задания обязательно выложено на поле
	EXPECT_EQ(EvalChecked("wfm.GetSeededCells().length").GetValue<int>(), 3);
	EXPECT_EQ(EvalChecked(
		"wfm.GetSeededCells().map(function(s) { return wfm.GetTile(s.c, s.r).letter; }).join('')").GetValue<String>(),
		String("КОТ"));

	EvalChecked(
		"wfm.DebugSetTile(0, 0, 'К'); wfm.DebugSetTile(1, 0, 'О'); wfm.DebugSetTile(2, 0, 'Т');"
		"wfm.ToggleSelect(0, 0); wfm.ToggleSelect(1, 0); wfm.ToggleSelect(2, 0);"
		"wfm.AcceptWord();");

	EXPECT_TRUE(EvalChecked("wfm.GetTasks()[0].done").GetValue<bool>());
}

TEST_F(WordFallModel, LengthTaskCountsWordsOfExactLength)
{
	EvalChecked(
		"wfm.NewGame({ target: 1000, moves: 10, ice: [], charges: [3, 3, 3, 3, 3],"
		"              tasks: [{ type: 'length', len: 4, count: 2 }] });"
		"var w = 'АТОМ';"
		"for (var i = 0; i < 4; i++) { wfm.DebugSetTile(i, 0, w[i]); wfm.ToggleSelect(i, 0); }"
		"wfm.AcceptWord();");

	EXPECT_EQ(EvalChecked("wfm.GetTasks()[0].progress").GetValue<int>(), 1);
	EXPECT_FALSE(EvalChecked("wfm.GetTasks()[0].done").GetValue<bool>());

	EvalChecked(
		"var w = 'АТОМ';"
		"for (var i = 0; i < 4; i++) { wfm.DebugSetTile(i, 0, w[i]); wfm.ToggleSelect(i, 0); }"
		"wfm.AcceptWord();");

	EXPECT_TRUE(EvalChecked("wfm.GetTasks()[0].done").GetValue<bool>());
}

TEST_F(WordFallModel, PowerupTaskCountsEarnedPowerups)
{
	EvalChecked(
		"wfm.NewGame({ target: 1000, moves: 10, ice: [], charges: [3, 3, 3, 3, 3],"
		"              tasks: [{ type: 'powerup', kind: 'bomb', count: 1 }] });"
		"var w = 'ЧАШКА';"
		"for (var i = 0; i < 5; i++) { wfm.DebugSetTile(i, 0, w[i]); wfm.ToggleSelect(i, 0); }"
		"wfm.AcceptWord();");

	EXPECT_TRUE(EvalChecked("wfm.GetTasks()[0].done").GetValue<bool>());
}

TEST_F(WordFallModel, ClearIceTaskCompletedByHammerWinsLevel)
{
	EvalChecked(
		"wfm.NewGame({ target: 0, moves: 5, ice: [[3, 3]], charges: [3, 3, 3, 3, 3],"
		"              tasks: [{ type: 'clearIce' }] });");

	EXPECT_FALSE(EvalChecked("wfm.GetTasks()[0].done").GetValue<bool>());
	EXPECT_EQ(EvalChecked("wfm.GetState()").GetValue<String>(), String("playing"));

	EvalChecked("wfm.UseHammer(3, 3);");

	EXPECT_TRUE(EvalChecked("wfm.GetTasks()[0].done").GetValue<bool>());
	EXPECT_EQ(EvalChecked("wfm.GetState()").GetValue<String>(), String("win"));
}

TEST_F(WordFallModel, WinRequiresBothTasksAndScore)
{
	EvalChecked(
		"wfm.NewGame({ target: 10, moves: 10, ice: [], charges: [3, 3, 3, 3, 3],"
		"              tasks: [{ type: 'word', word: 'КОТ' }] });"
		"wfm.DebugSetTile(0, 0, 'Д'); wfm.DebugSetTile(1, 0, 'О'); wfm.DebugSetTile(2, 0, 'М');"
		"wfm.ToggleSelect(0, 0); wfm.ToggleSelect(1, 0); wfm.ToggleSelect(2, 0);"
		"wfm.AcceptWord();");

	// очков хватает, но задание не закрыто — победы нет
	EXPECT_GE(EvalChecked("wfm.GetScore()").GetValue<int>(), 10);
	EXPECT_EQ(EvalChecked("wfm.GetState()").GetValue<String>(), String("playing"));

	EvalChecked(
		"wfm.DebugSetTile(0, 0, 'К'); wfm.DebugSetTile(1, 0, 'О'); wfm.DebugSetTile(2, 0, 'Т');"
		"wfm.ToggleSelect(0, 0); wfm.ToggleSelect(1, 0); wfm.ToggleSelect(2, 0);"
		"wfm.AcceptWord();");

	EXPECT_EQ(EvalChecked("wfm.GetState()").GetValue<String>(), String("win"));
}

TEST_F(WordFallModel, SeededWordCellsNeverGetIce)
{
	EvalChecked(
		"var allIce = [];"
		"for (var c = 0; c < 7; c++)"
		"    for (var r = 0; r < 8; r++)"
		"        allIce.push([c, r]);"
		"wfm.NewGame({ target: 100, moves: 5, ice: allIce, charges: [0, 0, 0, 0, 0],"
		"              tasks: [{ type: 'word', word: 'РАКЕТА' }] });");

	EXPECT_EQ(EvalChecked("wfm.GetSeededCells().length").GetValue<int>(), 6);
	EXPECT_TRUE(EvalChecked(
		"wfm.GetSeededCells().every(function(s) { return wfm.GetTile(s.c, s.r).ice == 0; })").GetValue<bool>());

	EXPECT_EQ(EvalChecked(
		"var ice = 0;"
		"for (var c = 0; c < 7; c++)"
		"    for (var r = 0; r < 8; r++)"
		"        if (wfm.GetTile(c, r).ice > 0) ice++;"
		"ice").GetValue<int>(), 50);
}

// Бот-проверка выигрываемости сгенерированных уровней. Стратегия: молотки —
// добивание льда (когда льдин не больше зарядов или ходы на исходе), затем
// приоритет незакрытых заданий: слово напрямую → пауэрап словом точной длины →
// length-задача → слово, задевающее лёд → самое дорогое слово.
TEST_F(WordFallModel, BotCanWinGeneratedLevels)
{
	EvalChecked(
		"function wfIceCells(m)"
		"{"
		"    var out = [];"
		"    for (var c = 0; c < 7; c++)"
		"        for (var r = 0; r < 8; r++)"
		"            if (m.GetTile(c, r).ice > 0) out.push({ c: c, r: r });"
		"    return out;"
		"}"
		"function wfCellsForWord(m, word)"
		"{"
		"    var used = [];"
		"    for (var i = 0; i < word.length; i++)"
		"    {"
		"        var cell = null;"
		"        for (var c = 0; c < 7 && !cell; c++)"
		"            for (var r = 0; r < 8 && !cell; r++)"
		"            {"
		"                var t = m.GetTile(c, r);"
		"                if (t.ice == 0 && !t.joker && t.letter == word[i] &&"
		"                    !used.some(function(u) { return u.c == c && u.r == r; }))"
		"                    cell = { c: c, r: r };"
		"            }"
		"        for (var c = 0; c < 7 && !cell; c++)"
		"            for (var r = 0; r < 8 && !cell; r++)"
		"            {"
		"                var t = m.GetTile(c, r);"
		"                if (t.ice == 0 && t.joker &&"
		"                    !used.some(function(u) { return u.c == c && u.r == r; }))"
		"                    cell = { c: c, r: r };"
		"            }"
		"        if (!cell) return null;"
		"        used.push(cell);"
		"    }"
		"    return used;"
		"}"
		"function wfTouchesIce(m, cells)"
		"{"
		"    for (var i = 0; i < cells.length; i++)"
		"        for (var dc = -1; dc <= 1; dc++)"
		"            for (var dr = -1; dr <= 1; dr++)"
		"            {"
		"                var c = cells[i].c + dc;"
		"                var r = cells[i].r + dr;"
		"                if (c >= 0 && c < 7 && r >= 0 && r < 8 && m.GetTile(c, r).ice > 0)"
		"                    return true;"
		"            }"
		"    return false;"
		"}"
		"function wfPickMove(m)"
		"{"
		"    var tasks = m.GetTasks();"
		"    for (var i = 0; i < tasks.length; i++)"
		"    {"
		"        var t = tasks[i];"
		"        if (t.done) continue;"
		"        if (t.type == 'word')"
		"        {"
		"            var cells = wfCellsForWord(m, t.word);"
		"            if (cells) return cells;"
		"        }"
		"    }"
		"    for (var i = 0; i < tasks.length; i++)"
		"    {"
		"        var t = tasks[i];"
		"        if (t.done || t.type != 'powerup') continue;"
		"        var len = WordFallConfig.powerupLengths[t.kind] || 5;"
		"        var best = m.FindBestWord(len) || (t.kind == 'wand' ? m.FindBestWord(8) : null);"
		"        if (best) return best.cells;"
		"    }"
		"    for (var i = 0; i < tasks.length; i++)"
		"    {"
		"        var t = tasks[i];"
		"        if (t.done || t.type != 'length') continue;"
		"        var best = m.FindBestWord(t.len);"
		"        if (best) return best.cells;"
		"    }"
		"    var best = m.FindBestWord();"
		"    var needIce = tasks.some(function(t) { return !t.done && t.type == 'clearIce'; });"
		"    if (needIce && wfIceCells(m).length > 0)"
		"    {"
		"        var cands = [best, m.FindBestWord(4), m.FindBestWord(5), m.FindBestWord(6), m.FindBestWord(3)];"
		"        for (var i = 0; i < cands.length; i++)"
		"            if (cands[i] && wfTouchesIce(m, cands[i].cells)) return cands[i].cells;"
		"    }"
		"    return best ? best.cells : null;"
		"}"
		"function wfBot(levelIndex, seed)"
		"{"
		"    var m = new WordModel(seed);"
		"    m.NewGame(WordFallLevels.Get(levelIndex));"
		"    var seeded = m.GetSeededCells();"
		"    if (seeded.length > 0)"
		"    {"
		"        for (var i = 0; i < seeded.length; i++) m.ToggleSelect(seeded[i].c, seeded[i].r);"
		"        if (!m.AcceptWord().ok) m.ClearSelection();"
		"    }"
		"    var guard = 0;"
		"    while (m.GetState() == 'playing' && guard++ < 90)"
		"    {"
		"        var ice = wfIceCells(m);"
		"        if (m.GetCharges(0) > 0 && ice.length > 0 &&"
		"            (ice.length <= m.GetCharges(0) || m.GetMovesLeft() <= 3))"
		"        {"
		"            m.UseHammer(ice[0].c, ice[0].r);"
		"            continue;"
		"        }"
		"        var cells = wfPickMove(m);"
		"        if (!cells)"
		"        {"
		"            if (m.GetCharges(1) > 0) { m.UseShuffle(); continue; }"
		"            break;"
		"        }"
		"        m.ClearSelection();"
		"        for (var i = 0; i < cells.length; i++) m.ToggleSelect(cells[i].c, cells[i].r);"
		"        if (!m.AcceptWord().ok) break;"
		"    }"
		"    return m.GetState();"
		"}");

	// срез кампании: начало, середина, финал (все 100 в headless слишком долго;
	// полный охват — node-прогоном, см. worklog)
	const int levels[3] = { 0, 49, 99 };
	for (int level : levels)
	{
		auto code = String::Format("wfBot(%i, %i)", level, 1000 + level*3);
		EXPECT_EQ(EvalChecked(code.Data()).GetValue<String>(), String("win")) << "level " << level + 1;
	}
}

TEST_F(WordFallModel, GeneratedLevelsAreValidAndDeterministic)
{
	EXPECT_TRUE(EvalChecked(
		"var ok = true;"
		"for (var i = 0; i < WordFallConfig.levelCount; i++)"
		"{"
		"    var l = WordFallLevels.Get(i);"
		"    if (!(l.target > 0 && l.moves >= 12 && l.charges.length == 5)) ok = false;"
		"    if (l.tasks.length < 3 || l.tasks.length > 5) ok = false;"
		"    if (l.tasks[0].type != 'word') ok = false;"
		"    for (var t = 0; t < l.tasks.length; t++)"
		"        if (l.tasks[t].type == 'word' && !wfm.IsWordInDict(l.tasks[t].word)) ok = false;"
		"    var hasClear = l.tasks.some(function(t) { return t.type == 'clearIce'; });"
		"    if (hasClear && l.ice.length > 6) ok = false;"
		"}"
		"ok").GetValue<bool>());

	// генерация детерминирована по индексу
	EXPECT_TRUE(EvalChecked(
		"JSON.stringify(WordFallLevels.Get(33)) == JSON.stringify(WordFallLevels.Get(33))").GetValue<bool>());
}

TEST_F(WordFallModel, AnyWordsTaskCountsEveryWord)
{
	EvalChecked(
		"wfm.NewGame({ target: 1000, moves: 10, ice: [], charges: [3, 3, 3, 3, 3],"
		"              tasks: [{ type: 'anyWords', count: 2 }] });"
		"wfm.DebugSetTile(0, 0, 'К'); wfm.DebugSetTile(1, 0, 'О'); wfm.DebugSetTile(2, 0, 'Т');"
		"wfm.ToggleSelect(0, 0); wfm.ToggleSelect(1, 0); wfm.ToggleSelect(2, 0);"
		"wfm.AcceptWord();");

	EXPECT_EQ(EvalChecked("wfm.GetTasks()[0].progress").GetValue<int>(), 1);
	EXPECT_FALSE(EvalChecked("wfm.GetTasks()[0].done").GetValue<bool>());

	EvalChecked(
		"wfm.DebugSetTile(0, 0, 'Д'); wfm.DebugSetTile(1, 0, 'О'); wfm.DebugSetTile(2, 0, 'М');"
		"wfm.ToggleSelect(0, 0); wfm.ToggleSelect(1, 0); wfm.ToggleSelect(2, 0);"
		"wfm.AcceptWord();");

	EXPECT_TRUE(EvalChecked("wfm.GetTasks()[0].done").GetValue<bool>());
}

TEST_F(WordFallModel, WordScoreTaskNeedsExpensiveWord)
{
	EvalChecked(
		"wfm.NewGame({ target: 1000, moves: 10, ice: [], charges: [3, 3, 3, 3, 3],"
		"              tasks: [{ type: 'wordScore', score: 50 }] });"
		"wfm.DebugSetTile(0, 0, 'К'); wfm.DebugSetTile(1, 0, 'О'); wfm.DebugSetTile(2, 0, 'Т');"
		"wfm.ToggleSelect(0, 0); wfm.ToggleSelect(1, 0); wfm.ToggleSelect(2, 0);"
		"wfm.AcceptWord();");

	// КОТ дал 12 — порог 50 не взят
	EXPECT_FALSE(EvalChecked("wfm.GetTasks()[0].done").GetValue<bool>());

	// ЧАШКА подряд: base 14 × 1.5 × кластер 5 = 105 ≥ 50
	EvalChecked(
		"var w = 'ЧАШКА';"
		"for (var i = 0; i < 5; i++) { wfm.DebugSetTile(i, 0, w[i]); wfm.ToggleSelect(i, 0); }"
		"wfm.AcceptWord();");

	EXPECT_TRUE(EvalChecked("wfm.GetTasks()[0].done").GetValue<bool>());
}

TEST_F(WordFallModel, RepairPlantsMissingTaskLetters)
{
	EvalChecked(
		"wfm.NewGame({ target: 1000, moves: 10, ice: [], charges: [3, 3, 3, 3, 3],"
		"              tasks: [{ type: 'word', word: 'ФЛЯГА' }] });");

	// ломаем поле: одних Щ — задание «ФЛЯГА» несобираемо
	FillBoardWithStubs();
	EXPECT_FALSE(EvalChecked("wfm._CanAssembleWord('ФЛЯГА')").GetValue<bool>());

	// страховка подсевает недостающие буквы
	EvalChecked("wfrep = wfm._EnsureTasksAchievable();");
	EXPECT_TRUE(EvalChecked("wfm._CanAssembleWord('ФЛЯГА')").GetValue<bool>());
	EXPECT_GE(EvalChecked("wfrep.length").GetValue<int>(), 5);
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

	// base = К(2×2) + О(1) + Т(1) = 6, кластер 3 → 18
	EXPECT_EQ(EvalChecked("wfm.ComputeScore(wfm.GetSelected()).total").GetValue<int>(), 18);
}

#endif // IS_SCRIPTING_SUPPORTED
