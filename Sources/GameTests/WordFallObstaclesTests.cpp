#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "WordFall/Core/WordBoard.h"
#include "WordFall/Core/WordDictionary.h"
#include "WordFall/Core/WordFallConfigs.h"
#include "WordFall/Core/WordLevel.h"

using namespace o2;

// Препятствия и предметы уровня: дыры, ящики, цепи, снежки, конверты,
// предустановленные бонусы, смещение мешка и задачи на них. Без сцены
class WordFallObstacles: public ::testing::Test
{
protected:
	WordDictionary dictionary;
	WordBoardConfig boardConfig;
	WordLevelConfig config;
	WordLevel level;

	void SetUp() override
	{
		dictionary.LoadDefault();
		config.targetScore = 100000; // очки не мешают проверять задачи
		config.moves = 20;
		config.tasks.Clear();
	}

	void StartLevel() { level.Start(config, boardConfig, dictionary, 7); }
	WordBoard& Board() { return level.GetBoard(); }

	void FillBoardWithStubs()
	{
		for (int c = 0; c < boardConfig.columns; c++)
		{
			for (int r = 0; r < boardConfig.rows; r++)
			{
				if (Board().IsPlayable(Vec2I(c, r)) && WordBoard::IsTileUsable(Board().GetTile(Vec2I(c, r))))
					Board().DebugSetTile(Vec2I(c, r), WString("Щ"));
			}
		}
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
};

TEST_F(WordFallObstacles, HolesAreNotPlayableAndColumnSpawnsBelowThem)
{
	config.holeCells = { Vec2I(0, 7), Vec2I(0, 6), Vec2I(6, 0) };
	StartLevel();

	EXPECT_TRUE(Board().IsHole(Vec2I(0, 7)));
	EXPECT_FALSE(Board().IsPlayable(Vec2I(0, 6)));
	EXPECT_TRUE(Board().GetTile(Vec2I(0, 7)).letter.IsEmpty());
	EXPECT_FALSE(WordBoard::IsTileUsable(Board().GetTile(Vec2I(0, 6))));
	EXPECT_TRUE(Board().IsPlayable(Vec2I(0, 5)));
	EXPECT_FALSE(Board().IsPlayable(Vec2I(6, 0)));
	EXPECT_TRUE(WordBoard::IsTileUsable(Board().GetTile(Vec2I(6, 1))));

	// снос плитки в колонке с дырами сверху: спавн приходит в верхнюю играбельную клетку
	auto result = Board().RemoveTile(Vec2I(0, 2));
	EXPECT_TRUE(result.spawned.Contains(Vec2I(0, 5)));
	EXPECT_FALSE(result.spawned.Contains(Vec2I(0, 7)));
	EXPECT_TRUE(Board().GetTile(Vec2I(0, 7)).letter.IsEmpty());
	EXPECT_FALSE(Board().GetTile(Vec2I(0, 5)).letter.IsEmpty());

	// у колонки с дырой внизу плитка не проваливается в дыру
	Board().RemoveTile(Vec2I(6, 1));
	EXPECT_TRUE(Board().GetTile(Vec2I(6, 0)).letter.IsEmpty());
	EXPECT_FALSE(Board().GetTile(Vec2I(6, 1)).letter.IsEmpty());
}

TEST_F(WordFallObstacles, CratesFallAndBreakByAdjacentWords)
{
	config.crateCells = { Vec2I(2, 3) };
	config.crateGrades = { 2 };
	config.tasks = { WordTaskConfig::MakeCrates() };
	StartLevel();
	FillBoardWithStubs();

	auto& crate = Board().GetTile(Vec2I(2, 3));
	EXPECT_EQ(crate.crate, 2);
	EXPECT_FALSE(WordBoard::IsTileUsable(crate));

	// слово под ящиком: прочность падает, ящик опускается в освободившуюся клетку
	auto first = AcceptRow("КОТ", 2, 1);
	ASSERT_TRUE(first.ok);
	EXPECT_TRUE(first.crateHit.Contains(Vec2I(2, 3)));
	EXPECT_TRUE(first.crateBroken.IsEmpty());
	EXPECT_EQ(Board().GetTile(Vec2I(2, 2)).crate, 1) << "ящик упал на клетку ниже";
	EXPECT_EQ(Board().CountCrates(), 1);
	EXPECT_FALSE(Task(0).done);

	// второе слово рядом: ящик ломается, задача закрыта
	auto second = AcceptRow("ТОК", 1, 1);
	ASSERT_TRUE(second.ok);
	EXPECT_TRUE(second.crateBroken.Contains(Vec2I(2, 2)));
	EXPECT_EQ(Board().CountCrates(), 0);
	EXPECT_TRUE(Task(0).done);
}

TEST_F(WordFallObstacles, ChainedTileStaysInPlaceUntilUsedInWord)
{
	config.chainCells = { Vec2I(1, 4) };
	StartLevel();
	FillBoardWithStubs();
	Board().DebugSetTile(Vec2I(1, 4), WString("О"));
	Board().DebugSetTile(Vec2I(1, 3), WString("Ж"));

	EXPECT_TRUE(Board().GetTile(Vec2I(1, 4)).chained);
	EXPECT_TRUE(WordBoard::IsTileUsable(Board().GetTile(Vec2I(1, 4)))) << "цепь не мешает собирать слово";

	// снос под цепью: цепная буква стоит, плитка между ними падает, клетка под цепью пустеет
	auto removed = Board().RemoveTile(Vec2I(1, 2));
	EXPECT_EQ(Board().GetTile(Vec2I(1, 4)).letter, WString("О"));
	EXPECT_EQ(Board().GetTile(Vec2I(1, 2)).letter, WString("Ж"));
	EXPECT_TRUE(Board().GetTile(Vec2I(1, 3)).letter.IsEmpty());
	EXPECT_FALSE(removed.spawned.Contains(Vec2I(1, 3)));

	// цепная буква в слове: цепь снимается вместе с буквой, колонка снова течёт
	Board().DebugSetTile(Vec2I(0, 4), WString("К"));
	Board().DebugSetTile(Vec2I(2, 4), WString("Т"));
	Board().ClearSelection();
	Board().ToggleSelect(Vec2I(0, 4));
	Board().ToggleSelect(Vec2I(1, 4));
	Board().ToggleSelect(Vec2I(2, 4));
	auto result = level.AcceptWord(dictionary);
	ASSERT_TRUE(result.ok);
	EXPECT_FALSE(Board().GetTile(Vec2I(1, 4)).chained);
	EXPECT_FALSE(Board().GetTile(Vec2I(1, 3)).letter.IsEmpty()) << "пустота под цепью заполнилась";
}

TEST_F(WordFallObstacles, SnowballsSpawnEachMoveAndMeltNextToWords)
{
	config.snowCells = { Vec2I(3, 7) };
	config.snowPerMove = 1;
	config.tasks = { WordTaskConfig::MakeMelt(2) };
	StartLevel();
	FillBoardWithStubs();

	EXPECT_TRUE(Board().GetTile(Vec2I(3, 7)).snow);
	EXPECT_FALSE(WordBoard::IsTileUsable(Board().GetTile(Vec2I(3, 7))));
	EXPECT_EQ(Board().CountSnow(), 1);

	auto far = AcceptRow("КОТ", 0, 0);
	ASSERT_TRUE(far.ok);
	EXPECT_TRUE(far.snowMelted.IsEmpty());
	EXPECT_EQ(Board().CountSnow(), 2) << "за ход сверху упал ещё один снежок";
	EXPECT_EQ(Task(0).progress, 0);

	auto near = AcceptRow("ТОК", 6, 2);
	ASSERT_TRUE(near.ok);
	EXPECT_TRUE(near.snowMelted.Contains(Vec2I(3, 7)));
	EXPECT_EQ(Task(0).progress, near.snowMelted.Count()); // новый снежок мог упасть рядом и растаять тоже
}

TEST_F(WordFallObstacles, ParcelsFallAndDeliverAtTheBottom)
{
	config.parcelCells = { Vec2I(0, 7) };
	config.parcelTotal = 2;
	config.parcelOnScreen = 1;
	config.tasks = { WordTaskConfig::MakeDeliver(2) };
	StartLevel();
	FillBoardWithStubs();

	EXPECT_TRUE(Board().GetTile(Vec2I(0, 7)).parcel);
	EXPECT_FALSE(WordBoard::IsTileUsable(Board().GetTile(Vec2I(0, 7))));
	EXPECT_EQ(Board().CountParcels(), 1);

	// конверт спускается вместе с колонкой; на дне — доставлен, колонка дозаполняется
	for (int i = 0; i < 6; i++)
		Board().RemoveTile(Vec2I(0, 0));
	EXPECT_TRUE(Board().GetTile(Vec2I(0, 1)).parcel);

	Board().ClearSelection();
	auto result = AcceptRow("КОТ", 0, 0);
	ASSERT_TRUE(result.ok);
	EXPECT_TRUE(result.delivered.Contains(Vec2I(0, 0)));
	EXPECT_FALSE(Board().GetTile(Vec2I(0, 0)).parcel);
	EXPECT_FALSE(Board().GetTile(Vec2I(0, 0)).letter.IsEmpty());
	EXPECT_EQ(Task(0).progress, 1);
	EXPECT_EQ(Board().CountParcels(), 0);
	EXPECT_FALSE(Task(0).done);

	// следующий ход: место освободилось — второй конверт выходит сверху
	auto next = AcceptRow("ТОК", 0, 3);
	ASSERT_TRUE(next.ok);
	EXPECT_EQ(Board().CountParcels(), 1) << "второй конверт вышел сверху после доставки первого";
}

TEST_F(WordFallObstacles, LetterTaskCountsLettersUsedInWords)
{
	config.tasks = { WordTaskConfig::MakeLetter("О", 3) };
	StartLevel();
	FillBoardWithStubs();

	AcceptRow("КОТ", 0, 0);
	EXPECT_EQ(Task(0).progress, 1);
	AcceptRow("ОКНО", 1, 0);
	EXPECT_EQ(Task(0).progress, 3);
	EXPECT_TRUE(Task(0).done);
}

TEST_F(WordFallObstacles, PreplacedPowerupsAndBagBias)
{
	config.powerupCells = { Vec2I(2, 2), Vec2I(4, 5) };
	config.powerupKinds = { "bomb", "rocket" };
	config.extraVowels = 12;
	config.extraRare = 4;
	StartLevel();

	EXPECT_EQ(Board().GetTile(Vec2I(2, 2)).powerup, WString("bomb"));
	EXPECT_EQ(Board().GetTile(Vec2I(4, 5)).powerup, WString("rocket"));

	int total = 0;
	for (auto& def : Board().GetConfig().letters)
		total += def.bagCount;
	EXPECT_EQ(total, 100 + 12 + 4);
}

TEST_F(WordFallObstacles, BombBreaksCratesAndMeltsSnowButSparesParcels)
{
	config.crateCells = { Vec2I(3, 3) };
	config.crateGrades = { 1 };
	config.snowCells = { Vec2I(2, 3) };
	config.parcelCells = { Vec2I(4, 3) };
	config.parcelTotal = 1;
	StartLevel();
	FillBoardWithStubs();

	Board().DebugSetPowerup(Vec2I(3, 2), "bomb");
	auto result = AcceptRow("КОТ", 1, 2); // буква под бомбой активирует её
	ASSERT_TRUE(result.ok);
	EXPECT_EQ(Board().GetTile(Vec2I(3, 3)).crate, 0);
	EXPECT_TRUE(result.crateBroken.Contains(Vec2I(3, 3)));
	EXPECT_TRUE(result.snowMelted.Contains(Vec2I(2, 3)));
	EXPECT_EQ(Board().CountParcels(), 1) << "конверт бомбой не уничтожается";
}

// Формат сериализации конфига уровня стабилен: генератор кампании пишет ровно его
TEST_F(WordFallObstacles, LevelConfigSerializationRoundTrip)
{
	WordLevelConfig source;
	source.targetScore = 420;
	source.moves = 14;
	source.holeCells = { Vec2I(0, 7) };
	source.crateCells = { Vec2I(2, 3) };
	source.crateGrades = { 2 };
	source.chainCells = { Vec2I(1, 4) };
	source.snowCells = { Vec2I(3, 7) };
	source.snowPerMove = 1;
	source.parcelCells = { Vec2I(0, 6) };
	source.parcelTotal = 3;
	source.parcelOnScreen = 2;
	source.powerupCells = { Vec2I(5, 5) };
	source.powerupKinds = { "rocket" };
	source.extraVowels = 6;
	source.tasks = { WordTaskConfig::MakeWord("КОТ"), WordTaskConfig::MakeLetter("О", 4),
					 WordTaskConfig::MakeDeliver(3), WordTaskConfig::MakeMelt(2), WordTaskConfig::MakeCrates() };

	DataDocument doc;
	doc.Set(source);
	String dumpPath = ::getenv("WORDFALL_CONFIG_DUMP") ? String(::getenv("WORDFALL_CONFIG_DUMP")) : String();
	if (!dumpPath.IsEmpty())
		doc.SaveToFile(dumpPath);

	WordLevelConfig restored;
	doc.Get(restored);
	EXPECT_EQ(restored, source);
}
