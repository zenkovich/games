#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "WordFallUITestSupport.h"

// Витрина кампании: уровни с новыми препятствиями рисуются и играются;
// по WORDFALL_CLIPS_DIR пишет скриншоты для отчёта
class WordFallLevelsShowcase: public WordFallUI
{
protected:
	bool UseCampaign() const override { return true; }

	static String ClipsDir()
	{
		auto dir = ::getenv("WORDFALL_CLIPS_DIR");
		return dir ? String(dir) : String();
	}

	void Shot(const String& name)
	{
		String dir = ClipsDir();
		if (dir.IsEmpty())
			return;
		o2FileSystem.FolderCreate(dir, true);
		EXPECT_TRUE(AppTestDriver::SaveScreenshot(dir + "/" + name + ".png"));
	}

	int CountTiles(const std::function<bool(const WordTile&)>& pred)
	{
		int count = 0;
		auto& board = mService->GetLevel().GetBoard();
		for (int c = 0; c < board.GetColumns(); c++)
			for (int r = 0; r < board.GetRows(); r++)
				count += pred(board.GetTile(Vec2I(c, r))) ? 1 : 0;
		return count;
	}
};

TEST_F(WordFallLevelsShowcase, CampaignLevelsRenderObstacles)
{
	int count = mService->GetLevelCount();
	ASSERT_GE(count, 100) << "кампания из campaign.json не загрузилась";

	// первый уровень кампании с препятствием каждого вида и последний с ящиками или камнями (кампанию генерирует
	// LevelLab — номера уровней не зашиты)
	auto first = [&](const char* list, bool last = false) {
		int found = -1;
		for (int i = 0; i < count && (last || found < 0); i++)
			if (mService->Call("GetLevelConfig", { ScriptValue(i) }).GetProperty(list).GetLength() > 0)
				found = i;
		return found;
	};
	struct Probe { int index; const char* name; std::function<bool(const WordTile&)> has; };
	Vector<Probe> probes = {
		{ first("holeCells"), "level_holes", [](const WordTile& t) { return t.hole; } },
		{ first("crateCells"), "level_crates", [](const WordTile& t) { return t.crate > 0; } },
		{ first("chainCells"), "level_chains", [](const WordTile& t) { return t.chained; } },
		{ first("snowCells"), "level_snow", [](const WordTile& t) { return t.snow; } },
		{ first("parcelCells"), "level_parcels", [](const WordTile& t) { return t.parcel; } },
		{ first("stoneCells", true), "level_late_stones", [](const WordTile& t) { return t.stone > 0; } },
	};
	for (auto& probe : probes)
	{
		ASSERT_GE(probe.index, 0) << probe.name;
		mService->StartLevel(probe.index);
		AppTestDriver::PumpFrames(4);
		EXPECT_EQ(mService->GetLevelIndex(), probe.index);
		EXPECT_GT(CountTiles(probe.has), 0) << probe.name;
		Shot(probe.name);
	}

	// дыры и пустые клетки не рисуются: кнопки таких клеток выключены
	mService->StartLevel(0);
	AppTestDriver::PumpFrames(3);
	auto& board = mService->GetLevel().GetBoard();
	int hiddenHoles = 0;
	for (int c = 0; c < board.GetColumns(); c++)
	{
		for (int r = 0; r < board.GetRows(); r++)
		{
			if (!board.IsHole(Vec2I(c, r)))
				continue;
			auto tile = FindScreen("WordFall")->GetChild(String::Format("Safe/Screen/Board/Tile_%i_%i", c, r));
			ASSERT_TRUE(tile);
			hiddenHoles += tile->IsEnabled() ? 0 : 1;
		}
	}
	EXPECT_GT(hiddenHoles, 0);
	EXPECT_EQ(hiddenHoles, CountTiles([](const WordTile& t) { return t.hole; }));
}
