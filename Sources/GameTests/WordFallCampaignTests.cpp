#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "WordFall/Core/WordBoard.h"
#include "WordFall/Core/WordDictionary.h"
#include "WordFall/Core/WordFallConfigs.h"
#include "WordFall/Core/WordLevel.h"
#include "o2/Assets/Assets.h"
#include "o2/Utils/FileSystem/FileSystem.h"
#include "o2/Utils/Serialization/DataValue.h"

using namespace o2;

// Кампания из Assets/WordFall/campaign.json: грузится, каждый уровень стартует и
// играбелен, кривая сложности растёт от обучения к основной линии
class WordFallCampaign: public ::testing::Test
{
protected:
	WordDictionary dictionary;
	WordBoardConfig boardConfig;
	Vector<WordLevelConfig> campaign;

	void SetUp() override
	{
		dictionary.LoadDefault();
		// путь ассетов относителен каталогу бинарника; из корня репозитория — прямой
		String path = o2Assets.GetAssetsPath() + "WordFall/campaign.json";
		if (!o2FileSystem.IsFileExist(path))
			path = "Assets/WordFall/campaign.json";
		DataDocument doc;
		ASSERT_TRUE(doc.LoadFromFile(path));
		doc.Get(campaign);
	}

	int UsableTiles(const WordBoard& board)
	{
		int count = 0;
		for (int c = 0; c < board.GetColumns(); c++)
			for (int r = 0; r < board.GetRows(); r++)
				count += WordBoard::IsTileUsable(board.GetTile(Vec2I(c, r))) ? 1 : 0;
		return count;
	}
};

TEST_F(WordFallCampaign, LoadsAllLevelsWithSaneLimits)
{
	ASSERT_EQ(campaign.Count(), 130);
	for (int i = 0; i < campaign.Count(); i++)
	{
		auto& level = campaign[i];
		EXPECT_GE(level.moves, 9) << "уровень " << i + 1;
		EXPECT_LE(level.moves, 18) << "уровень " << i + 1;
		EXPECT_GE(level.tasks.Count(), 2) << "уровень " << i + 1;
		EXPECT_LE(level.tasks.Count(), 5) << "уровень " << i + 1;
		EXPECT_EQ(level.tasks[0].taskType, WordTaskType::Word) << "первое задание — слово, оно же сидится";
		EXPECT_TRUE(dictionary.Contains(WString(level.tasks[0].word))) << "уровень " << i + 1 << ": " << level.tasks[0].word;
	}
}

TEST_F(WordFallCampaign, EveryLevelStartsPlayable)
{
	for (int i = 0; i < campaign.Count(); i++)
	{
		WordLevel level;
		level.Start(campaign[i], boardConfig, dictionary, 11 + i);
		auto& board = level.GetBoard();
		EXPECT_GE(UsableTiles(board), 24) << "уровень " << i + 1 << " слишком забит препятствиями";
		EXPECT_TRUE(board.AnyWordExists(dictionary)) << "уровень " << i + 1;
		EXPECT_EQ(level.GetState(), WordLevel::State::Playing) << "уровень " << i + 1;
		for (auto& task : level.GetTasks())
			EXPECT_FALSE(task.done) << "уровень " << i + 1 << ": задание закрыто на старте";
	}
}

TEST_F(WordFallCampaign, DifficultyCurveRisesFromOnboardingToMainLine)
{
	auto averagePerMove = [&](int from, int to)
	{
		float sum = 0.0f;
		for (int i = from; i < to; i++)
			sum += (float)campaign[i].targetScore/(float)campaign[i].moves;
		return sum/(float)(to - from);
	};
	float onboarding = averagePerMove(0, 31);
	float early = averagePerMove(31, 60);
	float lateGame = averagePerMove(100, 130);
	EXPECT_LT(onboarding, early);
	EXPECT_LE(early, lateGame*1.05f);
	EXPECT_LT(campaign[0].targetScore, campaign[129].targetScore);

	// в обучении механики появляются по очереди, а не все сразу
	auto firstWith = [&](const std::function<bool(const WordLevelConfig&)>& pred)
	{
		for (int i = 0; i < campaign.Count(); i++)
			if (pred(campaign[i]))
				return i;
		return -1;
	};
	int crates = firstWith([](const WordLevelConfig& l) { return !l.crateCells.IsEmpty(); });
	int snow = firstWith([](const WordLevelConfig& l) { return !l.snowCells.IsEmpty(); });
	int parcels = firstWith([](const WordLevelConfig& l) { return l.parcelTotal > 0; });
	int chains = firstWith([](const WordLevelConfig& l) { return !l.chainCells.IsEmpty(); });
	EXPECT_GE(crates, 0);
	EXPECT_GT(snow, crates);
	EXPECT_GT(parcels, snow);
	EXPECT_GE(chains, 0);
	EXPECT_LT(parcels, 31) << "конверты вводятся ещё в обучении";
}
