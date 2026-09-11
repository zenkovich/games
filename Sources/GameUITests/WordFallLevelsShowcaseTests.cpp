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
	ASSERT_GE(mService->GetLevelCount(), 130) << "кампания из campaign.json не загрузилась";

	struct Probe { int index; const char* name; std::function<bool(const WordTile&)> has; };
	Vector<Probe> probes = {
		{ 0, "level_01_holes", [](const WordTile& t) { return t.hole; } },
		{ 1, "level_02_crates", [](const WordTile& t) { return t.crate > 0; } },
		{ 11, "level_12_chains", [](const WordTile& t) { return t.chained; } },
		{ 15, "level_16_snow", [](const WordTile& t) { return t.snow; } },
		{ 22, "level_23_parcels", [](const WordTile& t) { return t.parcel; } },
		{ 128, "level_129_late", [](const WordTile& t) { return t.crate > 0 || t.stone > 0; } },
	};
	for (auto& probe : probes)
	{
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
			auto tile = o2Scene.FindActor("WordFall")->GetChild(String::Format("Screen/Board/Tile_%i_%i", c, r));
			ASSERT_TRUE(tile);
			hiddenHoles += tile->IsEnabled() ? 0 : 1;
		}
	}
	EXPECT_GT(hiddenHoles, 0);
	EXPECT_EQ(hiddenHoles, CountTiles([](const WordTile& t) { return t.hole; }));
}
