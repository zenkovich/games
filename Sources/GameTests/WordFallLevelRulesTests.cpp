#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "WordFall/Core/PlayerProgress.h"
#include "WordFall/Core/WordBoard.h"
#include "WordFall/Core/WordDictionary.h"
#include "WordFall/Core/WordFallConfigs.h"
#include "WordFall/Core/WordLevel.h"
#include "o2/Utils/FileSystem/FileSystem.h"

using namespace o2;

// Правила уровня: слово один раз за уровень, подсказка по целям, ракеты по целям,
// падающие ящики, память туториалов
class WordFallLevelRules: public ::testing::Test
{
protected:
	WordDictionary dictionary;
	WordBoardConfig boardConfig;
	WordLevelConfig config;
	WordLevel level;

	void SetUp() override
	{
		dictionary.LoadDefault();
		config.targetScore = 100000;
		config.moves = 20;
		config.boosterCharges = { 3, 3, 30, 3, 3 };
		config.tasks.Clear();
	}

	void StartLevel() { level.Start(config, boardConfig, dictionary, 5); }
	WordBoard& Board() { return level.GetBoard(); }

	void FillBoardWithStubs()
	{
		for (int c = 0; c < boardConfig.columns; c++)
			for (int r = 0; r < boardConfig.rows; r++)
				if (Board().IsPlayable(Vec2I(c, r)) && WordBoard::IsTileUsable(Board().GetTile(Vec2I(c, r))))
					Board().DebugSetTile(Vec2I(c, r), WString("Щ"));
	}

	void Plant(const char* word, int row, int startColumn)
	{
		WString wide((String(word)));
		for (int i = 0; i < wide.Length(); i++)
			Board().DebugSetTile(Vec2I(startColumn + i, row), wide.SubStr(i, i + 1));
	}

	WordMoveResult AcceptRow(const char* word, int row, int startColumn)
	{
		Plant(word, row, startColumn);
		Board().ClearSelection();
		int length = WString((String(word))).Length();
		for (int i = 0; i < length; i++)
			Board().ToggleSelect(Vec2I(startColumn + i, row));
		return level.AcceptWord(dictionary);
	}

	const WordTaskState& Task(int index) { return level.GetTasks()[index]; }

	WString Selected()
	{
		return Board().GetCurrentWord();
	}
};

TEST_F(WordFallLevelRules, SameWordIsAcceptedOnlyOncePerLevel)
{
	StartLevel();
	FillBoardWithStubs();

	ASSERT_TRUE(AcceptRow("КОТ", 0, 0).ok);
	int moves = level.GetMovesLeft();
	auto again = AcceptRow("КОТ", 1, 0);
	EXPECT_FALSE(again.ok);
	EXPECT_EQ(again.reason, String("duplicate"));
	EXPECT_EQ(level.GetMovesLeft(), moves) << "отказ не тратит ход";
	EXPECT_TRUE(level.IsWordUsed(WString("КОТ")));
	EXPECT_TRUE(AcceptRow("ТОК", 2, 0).ok) << "другое слово из тех же букв — можно";

	// новый уровень — история чистая
	StartLevel();
	FillBoardWithStubs();
	EXPECT_TRUE(AcceptRow("КОТ", 0, 0).ok);
}

TEST_F(WordFallLevelRules, HintPrefersTaskWordOverExpensiveWord)
{
	config.tasks = { WordTaskConfig::MakeWord("ТАПКА") };
	StartLevel();
	FillBoardWithStubs();
	Plant("ТАПКА", 0, 0);
	Plant("ФАКТ", 3, 0); // дороже, но не по заданию

	ASSERT_TRUE(level.UseHint(dictionary));
	EXPECT_EQ(Selected(), WString("ТАПКА"));
}

TEST_F(WordFallLevelRules, HintPrefersLengthTaskAndSkipsUsedWords)
{
	config.tasks = { WordTaskConfig::MakeLength(4, 1) };
	StartLevel();
	FillBoardWithStubs();
	Plant("КОТ", 0, 0);
	Plant("ОКНО", 2, 0);

	ASSERT_TRUE(level.UseHint(dictionary));
	EXPECT_EQ(Selected().Length(), 4) << "задание на 4 буквы — подсказка ведёт к нему";

	// использованное слово подсказка больше не предлагает
	Board().ClearSelection();
	ASSERT_TRUE(AcceptRow("ОКНО", 2, 0).ok);
	FillBoardWithStubs();
	Plant("ОКНО", 2, 0);
	Plant("КОТ", 0, 0);
	ASSERT_TRUE(level.UseHint(dictionary));
	EXPECT_NE(Selected(), WString("ОКНО"));
}

TEST_F(WordFallLevelRules, HintAvoidsOverlongWords)
{
	StartLevel();
	FillBoardWithStubs();
	Plant("КОРАБЛЬ", 0, 0);
	Plant("ЛУНА", 3, 0);

	ASSERT_TRUE(level.UseHint(dictionary));
	EXPECT_LE(Selected().Length(), 6) << "подсказка не тянет самые длинные слова";
}

TEST_F(WordFallLevelRules, RocketsAimAtLevelGoalsAndNeverRepeatATarget)
{
	config.iceCells = { Vec2I(5, 6), Vec2I(6, 6) };
	config.tasks = { WordTaskConfig::MakeClearIce() };
	StartLevel();
	FillBoardWithStubs();

	Board().DebugSetPowerup(Vec2I(3, 3), "rocket");
	auto result = AcceptRow("КОТ", 2, 2); // буква под бонусом активирует ракету
	ASSERT_TRUE(result.ok);
	ASSERT_EQ(result.powerupsUsed.Count(), 1);
	ASSERT_EQ(result.powerupsUsed[0].targets.Count(), 1);
	auto target = result.powerupsUsed[0].targets[0];
	EXPECT_TRUE(target == Vec2I(5, 6) || target == Vec2I(6, 6)) << "цель уровня — лёд, ракета летит в него";

	// залп фейерверка: десять целей, все разные
	FillBoardWithStubs();
	Board().DebugSetPowerup(Vec2I(3, 5), "fireworks");
	auto salvo = AcceptRow("ТОК", 4, 2);
	ASSERT_TRUE(salvo.ok);
	ASSERT_EQ(salvo.powerupsUsed.Count(), 1);
	auto& targets = salvo.powerupsUsed[0].targets;
	EXPECT_GE(targets.Count(), 8);
	for (int i = 0; i < targets.Count(); i++)
		for (int j = i + 1; j < targets.Count(); j++)
			EXPECT_NE(targets[i], targets[j]) << "две ракеты в одну плитку";
}

TEST_F(WordFallLevelRules, RocketsKeepTaskWordLettersAndTaskLetter)
{
	config.tasks = { WordTaskConfig::MakeWord("ЛУНА"), WordTaskConfig::MakeLetter("О", 3) };
	StartLevel();
	FillBoardWithStubs();
	// засеянное слово задания и буквы задания — не цели; остальное поле — дешёвые заглушки
	auto seeded = Board().GetSeededCells();
	ASSERT_EQ(seeded.Count(), 4);
	Board().DebugSetTile(Vec2I(6, 7), WString("О"));

	Board().DebugSetPowerup(Vec2I(3, 3), "rocket");
	auto result = AcceptRow("КОТ", 2, 2);
	ASSERT_TRUE(result.ok);
	ASSERT_EQ(result.powerupsUsed.Count(), 1);
	auto target = result.powerupsUsed[0].targets[0];
	EXPECT_FALSE(seeded.Contains(target)) << "ракета выбила букву слова-задания";
	EXPECT_NE(target, Vec2I(6, 7)) << "ракета выбила букву задания";
}

TEST_F(WordFallLevelRules, CratesFallWithGravity)
{
	config.crateCells = { Vec2I(2, 3) };
	config.crateGrades = { 2 };
	StartLevel();
	FillBoardWithStubs();
	Board().DebugSetTile(Vec2I(2, 4), WString("Ж"));

	Board().RemoveTile(Vec2I(2, 1));
	EXPECT_EQ(Board().GetTile(Vec2I(2, 2)).crate, 2) << "ящик опустился на клетку";
	EXPECT_EQ(Board().GetTile(Vec2I(2, 3)).letter, WString("Ж")) << "буква над ящиком упала следом";
	EXPECT_FALSE(Board().GetTile(Vec2I(2, 7)).letter.IsEmpty()) << "колонка дозаполнилась сверху";
}

TEST_F(WordFallLevelRules, ProgressRemembersSeenTutorials)
{
	String path = "wordfall_test_tutorials.json";
	PlayerProgress progress;
	EXPECT_FALSE(progress.IsTutorialSeen("basics"));
	progress.MarkTutorialSeen("basics");
	progress.MarkTutorialSeen("basics");
	EXPECT_TRUE(progress.IsTutorialSeen("basics"));
	EXPECT_EQ(progress.seenTutorials.Count(), 1);
	ASSERT_TRUE(progress.Save(path));

	PlayerProgress loaded;
	ASSERT_TRUE(loaded.Load(path));
	EXPECT_TRUE(loaded.IsTutorialSeen("basics"));
	EXPECT_FALSE(loaded.IsTutorialSeen("crate"));
	o2FileSystem.FileDelete(path);
}

TEST_F(WordFallLevelRules, LongWordEarnsFireworksAndItFiresASalvo)
{
	StartLevel();
	FillBoardWithStubs();

	// слово из 7 букв кладёт фейерверк в клетку последней буквы
	auto earned = AcceptRow("КАРТИНА", 0, 0);
	ASSERT_TRUE(earned.ok) << "слово 7 букв принято";
	EXPECT_EQ(earned.powerupEarned, String("fireworks"));
	EXPECT_EQ(Board().GetTile(Vec2I(6, 0)).powerup, WString("fireworks"));

	// бонус на месте после обвала: колонки под ним не двигались
	EXPECT_TRUE(WordBoard::IsTileOccupied(Board().GetTile(Vec2I(6, 0))));

	// слово рядом активирует его: залп по многим клеткам
	FillBoardWithStubs();
	auto salvo = AcceptRow("КОТ", 1, 4);
	ASSERT_TRUE(salvo.ok);
	ASSERT_EQ(salvo.powerupsUsed.Count(), 1);
	EXPECT_EQ(salvo.powerupsUsed[0].kind, String("fireworks"));
	EXPECT_GE(salvo.powerupsUsed[0].targets.Count(), 8) << "залп фейерверка бьёт по многим клеткам";
}

TEST_F(WordFallLevelRules, EarnedBonusNeverLandsInAHole)
{
	config.holeCells = { Vec2I(6, 0), Vec2I(5, 0) };
	StartLevel();
	FillBoardWithStubs();

	// слово заканчивается над дырой: бонус должен встать в живую клетку слова
	auto result = AcceptRow("КАРТИНА", 0, 0);
	ASSERT_TRUE(result.ok);
	EXPECT_EQ(result.powerupEarned, String("fireworks"));

	Vec2I bonusCell(-1, -1);
	for (int c = 0; c < boardConfig.columns; c++)
		for (int r = 0; r < boardConfig.rows; r++)
			if (!Board().GetTile(Vec2I(c, r)).powerup.IsEmpty())
				bonusCell = Vec2I(c, r);

	EXPECT_NE(bonusCell, Vec2I(-1, -1)) << "бонус пропал";
	EXPECT_TRUE(Board().IsPlayable(bonusCell));
	EXPECT_EQ(Board().GetTile(bonusCell).powerup, WString("fireworks"));
}

TEST_F(WordFallLevelRules, BombBreaksCratesCompletely)
{
	config.crateCells = { Vec2I(3, 3), Vec2I(4, 3) };
	config.crateGrades = { 2, 1 };
	config.tasks = { WordTaskConfig::MakeCrates() };
	StartLevel();
	FillBoardWithStubs();

	Board().DebugSetPowerup(Vec2I(3, 2), "bomb");
	auto result = AcceptRow("КОТ", 1, 2); // буква под бомбой активирует её
	ASSERT_TRUE(result.ok);
	EXPECT_TRUE(result.crateBroken.Contains(Vec2I(3, 3))) << "бомба ломает ящик прочности 2 сразу";
	EXPECT_TRUE(result.crateBroken.Contains(Vec2I(4, 3)));
	EXPECT_EQ(Board().CountCrates(), 0);
	EXPECT_TRUE(Task(0).done);
}
