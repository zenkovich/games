#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "WordFall/Core/PlayerProgress.h"
#include "WordFall/Core/WordBoard.h"
#include "WordFall/Core/WordDictionary.h"
#include "WordFall/Core/WordFallConfigs.h"
#include "WordFall/Core/WordFallLevels.h"
#include "WordFall/Core/WordLevel.h"
#include "o2/Utils/FileSystem/FileSystem.h"

using namespace o2;

// Тесты C++ ядра Word Fall: словарь, поле, очки, гравитация, пауэрапы,
// уровень с задачами и прогресс игрока. Без сцены и рендера
class WordFallCore: public ::testing::Test
{
protected:
	WordDictionary dictionary;
	WordBoardConfig boardConfig;
	WordLevelConfig sandboxLevel;
	WordLevel level;

	void SetUp() override
	{
		dictionary.LoadDefault();

		sandboxLevel.targetScore = 300;
		sandboxLevel.moves = 12;
		sandboxLevel.iceCells = { Vec2I(1, 6), Vec2I(5, 2), Vec2I(4, 7), Vec2I(0, 1) };
		sandboxLevel.tasks.Clear();

		level.Start(sandboxLevel, boardConfig, dictionary, 42);
	}

	WordBoard& Board() { return level.GetBoard(); }

	// Заполняет поле редкой согласной, чтобы тестовые слова не пересекались со случайными
	void FillBoardWithStubs()
	{
		for (int c = 0; c < boardConfig.columns; c++)
		{
			for (int r = 0; r < boardConfig.rows; r++)
				Board().DebugSetTile(Vec2I(c, r), WString("Щ"));
		}
	}

	void Plant(const char* word, int row = 0, int startColumn = 0)
	{
		WString wide((String(word)));
		for (int i = 0; i < wide.Length(); i++)
			Board().DebugSetTile(Vec2I(startColumn + i, row), wide.SubStr(i, i + 1));
	}

	void SelectRow(int count, int row = 0, int startColumn = 0)
	{
		for (int i = 0; i < count; i++)
			Board().ToggleSelect(Vec2I(startColumn + i, row));
	}
};

TEST_F(WordFallCore, DictionaryContainsWordsAndJokers)
{
	EXPECT_GT(dictionary.GetWordsCount(), 1000);
	EXPECT_TRUE(dictionary.Contains(WString("КОТ")));
	EXPECT_TRUE(dictionary.Contains(WString("СЛОН")));
	EXPECT_FALSE(dictionary.Contains(WString("ЙЦУ")));
	EXPECT_FALSE(dictionary.Contains(WString("К")));

	EXPECT_TRUE(dictionary.Contains(WString("К?Т")));
	EXPECT_TRUE(dictionary.Contains(WString("?ЛОН")));
	EXPECT_FALSE(dictionary.Contains(WString("Щ?Щ")));
}

TEST_F(WordFallCore, BagMatchesConfiguredProportions)
{
	int total = 0;
	for (auto& def : boardConfig.letters)
		total += def.bagCount;
	EXPECT_EQ(total, 100);

	// гласные: О9 А8 Е8 И7 У3 Я2 Ы2 Э1 Ю1 = 41
	int vowels = 0;
	WString vowelSet(boardConfig.vowels);
	for (auto& def : boardConfig.letters)
	{
		WString letter(def.letter);
		if (vowelSet.Find(letter[0]) >= 0)
			vowels += def.bagCount;
	}
	EXPECT_EQ(vowels, 41);
}

TEST_F(WordFallCore, StartFillsGridAndIce)
{
	for (int c = 0; c < boardConfig.columns; c++)
	{
		for (int r = 0; r < boardConfig.rows; r++)
		{
			auto& tile = Board().GetTile(Vec2I(c, r));
			EXPECT_FALSE(tile.letter.IsEmpty());
			EXPECT_GE(tile.value, 0);
		}
	}

	EXPECT_EQ(Board().CountIce(), 4);
}

TEST_F(WordFallCore, SameSeedGivesSameBoard)
{
	WordLevel other;
	other.Start(sandboxLevel, boardConfig, dictionary, 42);

	for (int c = 0; c < boardConfig.columns; c++)
	{
		for (int r = 0; r < boardConfig.rows; r++)
		{
			EXPECT_EQ(Board().GetTile(Vec2I(c, r)).letter,
					  other.GetBoard().GetTile(Vec2I(c, r)).letter);
		}
	}
}

TEST_F(WordFallCore, SelectionTogglesAndCutsTail)
{
	FillBoardWithStubs();
	SelectRow(3);
	EXPECT_EQ(Board().GetSelection().Count(), 3);

	// повторный клик по второй букве снимает её и хвост
	Board().ToggleSelect(Vec2I(1, 0));
	EXPECT_EQ(Board().GetSelection().Count(), 1);
	EXPECT_EQ(Board().GetSelection()[0], Vec2I(0, 0));
}

TEST_F(WordFallCore, IcedTileCanNotBeSelected)
{
	FillBoardWithStubs();
	Board().GetTileEditable(Vec2I(2, 2)).ice = 1;
	EXPECT_EQ(Board().ToggleSelect(Vec2I(2, 2)), WordBoard::SelectResult::Iced);
	EXPECT_EQ(Board().GetSelection().Count(), 0);
}

TEST_F(WordFallCore, AdjacentClusterMultipliesScore)
{
	FillBoardWithStubs();
	Plant("КОТ");
	SelectRow(3);

	int base;
	float lengthMult;
	int cluster;
	// К(2)+О(1)+Т(1) = 4, кластер 3 → 12
	EXPECT_EQ(Board().ComputeSelectionScore(base, lengthMult, cluster), 12);
	EXPECT_EQ(base, 4);
	EXPECT_EQ(cluster, 3);
}

TEST_F(WordFallCore, ScatteredLettersGetNoClusterBonus)
{
	FillBoardWithStubs();
	Board().DebugSetTile(Vec2I(0, 0), WString("К"));
	Board().DebugSetTile(Vec2I(3, 3), WString("О"));
	Board().DebugSetTile(Vec2I(6, 7), WString("Т"));
	Board().ToggleSelect(Vec2I(0, 0));
	Board().ToggleSelect(Vec2I(3, 3));
	Board().ToggleSelect(Vec2I(6, 7));

	int base;
	float lengthMult;
	int cluster;
	EXPECT_EQ(Board().ComputeSelectionScore(base, lengthMult, cluster), 4);
	EXPECT_EQ(cluster, 1);
}

TEST_F(WordFallCore, DiagonalCountsAsAdjacency)
{
	FillBoardWithStubs();
	Board().DebugSetTile(Vec2I(0, 0), WString("К"));
	Board().DebugSetTile(Vec2I(1, 1), WString("О"));
	Board().DebugSetTile(Vec2I(2, 2), WString("Т"));
	Board().ToggleSelect(Vec2I(0, 0));
	Board().ToggleSelect(Vec2I(1, 1));
	Board().ToggleSelect(Vec2I(2, 2));

	int base;
	float lengthMult;
	int cluster;
	Board().ComputeSelectionScore(base, lengthMult, cluster);
	EXPECT_EQ(cluster, 3);
}

TEST_F(WordFallCore, LengthMultiplier)
{
	EXPECT_FLOAT_EQ(WordBoard::LengthMultiplier(3), 1.0f);
	EXPECT_FLOAT_EQ(WordBoard::LengthMultiplier(5), 1.5f);
}

TEST_F(WordFallCore, AcceptWordBurnsFallsAndSpawns)
{
	FillBoardWithStubs();
	Plant("КОТ");
	SelectRow(3);

	auto result = level.AcceptWord(dictionary);
	EXPECT_TRUE(result.ok);
	EXPECT_EQ(result.gain, 12);
	EXPECT_EQ(level.GetScore(), 12);
	EXPECT_EQ(level.GetMovesLeft(), 11);
	EXPECT_EQ(Board().GetSelection().Count(), 0);

	EXPECT_TRUE(result.moved.Contains([](const WordTileMove& m) {
		return m.column == 0 && m.fromRow == 1 && m.toRow == 0; }));
	EXPECT_EQ(result.spawned.Count(), 3);

	for (int c = 0; c < boardConfig.columns; c++)
	{
		for (int r = 0; r < boardConfig.rows; r++)
			EXPECT_FALSE(Board().GetTile(Vec2I(c, r)).letter.IsEmpty());
	}
}

TEST_F(WordFallCore, InvalidWordIsRejected)
{
	FillBoardWithStubs();
	SelectRow(2);

	auto result = level.AcceptWord(dictionary);
	EXPECT_FALSE(result.ok);
	EXPECT_EQ(result.reason, String("invalid"));
	EXPECT_EQ(level.GetMovesLeft(), 12);
}

TEST_F(WordFallCore, BurningWordBreaksAdjacentIce)
{
	FillBoardWithStubs();
	Plant("КОТ");
	Board().GetTileEditable(Vec2I(1, 1)).ice = 1;  // диагональный сосед сгорающего ряда
	Board().GetTileEditable(Vec2I(5, 5)).ice = 1;  // далеко — должен остаться
	SelectRow(3);

	auto result = level.AcceptWord(dictionary);
	EXPECT_EQ(result.iceBroken.Count(), 1);
	EXPECT_EQ(Board().CountIce(), 1);
}

TEST_F(WordFallCore, WinRequiresTasksAndScore)
{
	WordLevelConfig config;
	config.targetScore = 10;
	config.moves = 10;
	config.tasks = { WordTaskConfig::MakeWord("КОТ") };
	level.Start(config, boardConfig, dictionary, 42);

	// очков хватает, но задание не закрыто — победы нет
	Plant("ДОМ");
	SelectRow(3);
	level.AcceptWord(dictionary);
	EXPECT_GE(level.GetScore(), 10);
	EXPECT_EQ(level.GetState(), WordLevel::State::Playing);

	Plant("КОТ");
	SelectRow(3);
	level.AcceptWord(dictionary);
	EXPECT_EQ(level.GetState(), WordLevel::State::Won);
}

TEST_F(WordFallCore, RunningOutOfMovesLoses)
{
	FillBoardWithStubs();
	level.DebugSetMovesLeft(1);
	Plant("КОТ");
	SelectRow(3);

	level.AcceptWord(dictionary);
	EXPECT_EQ(level.GetState(), WordLevel::State::Lost);
}

TEST_F(WordFallCore, HammerDestroysTileWithoutMoveCost)
{
	FillBoardWithStubs();
	Board().GetTileEditable(Vec2I(3, 0)).ice = 1;

	auto result = level.UseHammer(Vec2I(3, 0), dictionary);
	EXPECT_TRUE(result.ok);
	EXPECT_EQ(level.GetBoosterCharges(WordLevel::Booster::Hammer), 2);
	EXPECT_EQ(level.GetMovesLeft(), 12);
	EXPECT_EQ(Board().GetTile(Vec2I(3, 0)).ice, 0);
	EXPECT_EQ(result.spawned.Count(), 1);
}

TEST_F(WordFallCore, ShufflePreservesLettersAndSkipsIce)
{
	FillBoardWithStubs();
	Board().DebugSetTile(Vec2I(4, 4), WString("Ю"));
	Board().GetTileEditable(Vec2I(4, 4)).ice = 1;

	EXPECT_TRUE(level.UseShuffle(dictionary));
	EXPECT_EQ(Board().GetTile(Vec2I(4, 4)).letter, WString("Ю"));
	EXPECT_EQ(level.GetBoosterCharges(WordLevel::Booster::Shuffle), 2);
}

TEST_F(WordFallCore, HintFindsMostExpensiveWord)
{
	FillBoardWithStubs();
	Plant("КОТ", 0);
	Plant("ФАКТ", 2);

	EXPECT_TRUE(level.UseHint(dictionary));
	EXPECT_GE(Board().GetSelection().Count(), 3);
	EXPECT_EQ(level.GetBoosterCharges(WordLevel::Booster::Hint), 2);

	// подсказанное слово принимается
	EXPECT_TRUE(level.AcceptWord(dictionary).ok);
}

TEST_F(WordFallCore, JokerActsAsAnyLetter)
{
	FillBoardWithStubs();
	Plant("КЩТ");
	EXPECT_TRUE(level.UseJoker(Vec2I(1, 0)));
	SelectRow(3);

	EXPECT_EQ(Board().GetCurrentWord(), WString("К?Т"));
	EXPECT_EQ(level.GetBoosterCharges(WordLevel::Booster::Joker), 2);

	// джокер даёт 0 очков: К(2)+Т(1) = 3, кластер 3 → 9
	int base;
	float lengthMult;
	int cluster;
	EXPECT_EQ(Board().ComputeSelectionScore(base, lengthMult, cluster), 9);
	EXPECT_TRUE(level.AcceptWord(dictionary).ok);
}

TEST_F(WordFallCore, DoublerDoublesLetterValue)
{
	FillBoardWithStubs();
	Plant("КОТ");
	EXPECT_TRUE(level.UseDoubler(Vec2I(0, 0)));
	SelectRow(3);

	// К(2×2)+О(1)+Т(1) = 6, кластер 3 → 18
	int base;
	float lengthMult;
	int cluster;
	EXPECT_EQ(Board().ComputeSelectionScore(base, lengthMult, cluster), 18);
}

TEST_F(WordFallCore, FiveLetterWordEarnsBombOnLastCell)
{
	FillBoardWithStubs();
	Plant("ЧАШКА");
	SelectRow(5);

	auto result = level.AcceptWord(dictionary);
	EXPECT_TRUE(result.ok);
	EXPECT_EQ(result.powerupEarned, String("bomb"));
	EXPECT_EQ(Board().GetTile(Vec2I(4, 0)).powerup, WString("bomb"));
}

TEST_F(WordFallCore, LongerWordsEarnRocketAndWand)
{
	FillBoardWithStubs();
	Plant("РАКЕТА");
	SelectRow(6);

	auto result = level.AcceptWord(dictionary);
	EXPECT_EQ(result.powerupEarned, String("rocket"));
	EXPECT_EQ(Board().GetTile(Vec2I(5, 0)).powerup, WString("rocket"));
}

TEST_F(WordFallCore, BombDestroysAreaAndAddsPoints)
{
	FillBoardWithStubs();
	Plant("КОТ", 0, 1);
	Board().DebugSetPowerup(Vec2I(2, 0), "bomb");
	SelectRow(3, 0, 1);

	auto result = level.AcceptWord(dictionary);
	// слово 12 + три взорванные Щ ряда выше по 5
	EXPECT_EQ(result.gain, 27);
	EXPECT_EQ(level.GetScore(), 27);
	EXPECT_EQ(result.spawned.Count(), 6);
}

TEST_F(WordFallCore, RocketActivatesCrossAndKeepsLetters)
{
	FillBoardWithStubs();
	Plant("КОТ", 0, 1);
	Board().DebugSetPowerup(Vec2I(2, 0), "rocket");
	Board().GetTileEditable(Vec2I(2, 5)).ice = 1;
	SelectRow(3, 0, 1);

	auto result = level.AcceptWord(dictionary);
	// крест: 4 плитки ряда + 7 колонки, все Щ по 5
	EXPECT_EQ(result.activated.Count(), 11);
	EXPECT_EQ(result.gain, 12 + 55);
	EXPECT_EQ(result.spawned.Count(), 3);
	EXPECT_TRUE(result.iceBroken.Contains(Vec2I(2, 5)));
}

TEST_F(WordFallCore, WandActivatesAllSameLetters)
{
	FillBoardWithStubs();
	Plant("КОТ");
	Board().DebugSetTile(Vec2I(4, 4), WString("К"));
	Board().DebugSetTile(Vec2I(6, 7), WString("К"));
	Board().DebugSetPowerup(Vec2I(0, 0), "wand");
	Board().GetTileEditable(Vec2I(6, 7)).ice = 1;
	SelectRow(3);

	auto result = level.AcceptWord(dictionary);
	EXPECT_EQ(result.activated.Count(), 2);
	EXPECT_EQ(result.gain, 12 + 4);
	EXPECT_EQ(result.spawned.Count(), 3);
	EXPECT_EQ(Board().GetTile(Vec2I(4, 4)).letter, WString("К"));
	EXPECT_EQ(Board().GetTile(Vec2I(6, 7)).ice, 0);
}

TEST_F(WordFallCore, WordTaskSeedsWordAndTracksProgress)
{
	WordLevelConfig config;
	config.targetScore = 100;
	config.moves = 10;
	config.tasks = { WordTaskConfig::MakeWord("КОТ") };
	level.Start(config, boardConfig, dictionary, 42);

	// слово из задания выложено на поле
	auto& seeded = Board().GetSeededCells();
	ASSERT_EQ(seeded.Count(), 3);
	WString word;
	for (auto& cell : seeded)
		word += Board().GetTile(cell).letter;
	EXPECT_EQ(word, WString("КОТ"));

	Plant("КОТ");
	SelectRow(3);
	level.AcceptWord(dictionary);
	EXPECT_TRUE(level.GetTasks()[0].done);
}

TEST_F(WordFallCore, LengthTaskCountsWordsOfExactLength)
{
	WordLevelConfig config;
	config.targetScore = 100000;
	config.moves = 10;
	config.tasks = { WordTaskConfig::MakeLength(4, 2) };
	level.Start(config, boardConfig, dictionary, 42);

	Plant("АТОМ");
	SelectRow(4);
	level.AcceptWord(dictionary);
	EXPECT_EQ(level.GetTasks()[0].progress, 1);
	EXPECT_FALSE(level.GetTasks()[0].done);

	Plant("АТОМ");
	SelectRow(4);
	level.AcceptWord(dictionary);
	EXPECT_TRUE(level.GetTasks()[0].done);
}

TEST_F(WordFallCore, PowerupTaskCountsEarnedPowerups)
{
	WordLevelConfig config;
	config.targetScore = 100000;
	config.moves = 10;
	config.tasks = { WordTaskConfig::MakePowerup("bomb", 1) };
	level.Start(config, boardConfig, dictionary, 42);

	Plant("ЧАШКА");
	SelectRow(5);
	level.AcceptWord(dictionary);
	EXPECT_TRUE(level.GetTasks()[0].done);
}

TEST_F(WordFallCore, ClearIceTaskCompletedByHammerWins)
{
	WordLevelConfig config;
	config.targetScore = 0;
	config.moves = 5;
	config.iceCells = { Vec2I(3, 3) };
	config.tasks = { WordTaskConfig::MakeClearIce() };
	level.Start(config, boardConfig, dictionary, 42);

	EXPECT_FALSE(level.GetTasks()[0].done);
	EXPECT_EQ(level.GetState(), WordLevel::State::Playing);

	level.UseHammer(Vec2I(3, 3), dictionary);
	EXPECT_TRUE(level.GetTasks()[0].done);
	EXPECT_EQ(level.GetState(), WordLevel::State::Won);
}

TEST_F(WordFallCore, SeededWordCellsNeverGetIce)
{
	WordLevelConfig config;
	config.targetScore = 100;
	config.moves = 5;
	config.tasks = { WordTaskConfig::MakeWord("РАКЕТА") };
	for (int c = 0; c < boardConfig.columns; c++)
	{
		for (int r = 0; r < boardConfig.rows; r++)
			config.iceCells.Add(Vec2I(c, r));
	}
	level.Start(config, boardConfig, dictionary, 42);

	EXPECT_EQ(Board().GetSeededCells().Count(), 6);
	for (auto& cell : Board().GetSeededCells())
		EXPECT_EQ(Board().GetTile(cell).ice, 0);

	EXPECT_EQ(Board().CountIce(), 50);
}

TEST_F(WordFallCore, GeneratedCampaignIsValidAndDeterministic)
{
	for (int index = 0; index < 100; index++)
	{
		auto config = WordFallLevels::Generate(index, dictionary, boardConfig);

		EXPECT_GT(config.targetScore, 0);
		EXPECT_GE(config.moves, 12);
		EXPECT_LE(config.moves, 16);
		EXPECT_GE(config.tasks.Count(), 3);
		EXPECT_LE(config.tasks.Count(), 5);
		EXPECT_EQ(config.boosterCharges[2], 30); // подсказок много — помощь в тупиках

		// первое задание — точечное слово, слова заданий в словаре
		EXPECT_EQ(config.tasks[0].taskType, WordTaskType::Word);
		for (auto& task : config.tasks)
		{
			if (task.taskType == WordTaskType::Word)
				EXPECT_TRUE(dictionary.Contains(WString(task.word))) << task.word.Data();
		}

		// «разбить весь лёд» ограничивает количество льда
		bool hasClearIce = config.tasks.Contains([](const WordTaskConfig& t) {
			return t.taskType == WordTaskType::ClearIce; });
		if (hasClearIce)
			EXPECT_LE(config.iceCells.Count(), 6);
	}

	// генерация детерминирована по индексу
	auto a = WordFallLevels::Generate(7, dictionary, boardConfig);
	auto b = WordFallLevels::Generate(7, dictionary, boardConfig);
	EXPECT_TRUE(a == b);
}

TEST_F(WordFallCore, AnyWordsTaskCountsEveryWord)
{
	WordLevelConfig config;
	config.targetScore = 100000;
	config.moves = 10;
	config.tasks = { WordTaskConfig::MakeAnyWords(2) };
	level.Start(config, boardConfig, dictionary, 42);

	Plant("КОТ");
	SelectRow(3);
	level.AcceptWord(dictionary);
	EXPECT_EQ(level.GetTasks()[0].progress, 1);

	Plant("ДОМ");
	SelectRow(3);
	level.AcceptWord(dictionary);
	EXPECT_TRUE(level.GetTasks()[0].done);
}

TEST_F(WordFallCore, WordScoreTaskRequiresExpensiveWord)
{
	WordLevelConfig config;
	config.targetScore = 100000;
	config.moves = 10;
	config.tasks = { WordTaskConfig::MakeWordScore(20) };
	level.Start(config, boardConfig, dictionary, 42);

	// КОТ подряд = 12 < 20 — задача не двигается
	Plant("КОТ");
	SelectRow(3);
	level.AcceptWord(dictionary);
	EXPECT_FALSE(level.GetTasks()[0].done);

	// ЧАШКА подряд: 14 × 1.5 × 5 = 105 >= 20
	Plant("ЧАШКА");
	SelectRow(5);
	level.AcceptWord(dictionary);
	EXPECT_TRUE(level.GetTasks()[0].done);
}

TEST_F(WordFallCore, EnsureTasksAchievablePlantsMissingLetters)
{
	WordLevelConfig config;
	config.targetScore = 100000;
	config.moves = 10;
	config.tasks = { WordTaskConfig::MakeWord("ФЛОТ") };
	level.Start(config, boardConfig, dictionary, 42);

	// поле из одних Щ — слово задания несобираемо; перемешивание чинит поле
	FillBoardWithStubs();
	EXPECT_FALSE(Board().CanAssembleWord(WString("ФЛОТ")));

	level.UseShuffle(dictionary);
	EXPECT_TRUE(Board().CanAssembleWord(WString("ФЛОТ")));
}

TEST_F(WordFallCore, SeededWordIsScatteredButAssemblable)
{
	WordLevelConfig config;
	config.targetScore = 100;
	config.moves = 10;
	config.tasks = { WordTaskConfig::MakeWord("РАКЕТА") };
	level.Start(config, boardConfig, dictionary, 42);

	auto& seeded = Board().GetSeededCells();
	ASSERT_EQ(seeded.Count(), 6);

	// буквы слова лежат в порядке сида и слово собираемо
	WString word;
	for (auto& cell : seeded)
		word += Board().GetTile(cell).letter;
	EXPECT_EQ(word, WString("РАКЕТА"));
	EXPECT_TRUE(Board().CanAssembleWord(WString("РАКЕТА")));
}

TEST_F(WordFallCore, PlayerProgressSavesAndLoads)
{
	String path = "test_wordfall_progress.json";

	PlayerProgress progress;
	progress.CompleteLevel(0, 123, 3);
	EXPECT_EQ(progress.currentLevel, 1);
	EXPECT_EQ(progress.GetBestScore(0), 123);
	EXPECT_TRUE(progress.Save(path));

	PlayerProgress loaded;
	EXPECT_TRUE(loaded.Load(path));
	EXPECT_EQ(loaded.currentLevel, 1);
	EXPECT_EQ(loaded.GetBestScore(0), 123);

	// финал кампании возвращает на первый уровень
	loaded.CompleteLevel(2, 50, 3);
	EXPECT_EQ(loaded.currentLevel, 0);

	o2FileSystem.FileDelete(path);
}
