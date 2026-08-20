#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "WordFall/Core/WordBoardMotion.h"

using namespace o2;

// Кейсы модели движения плиток при обвале:
//  1. Простое слово в ряду: сдвиг колонок + спавны, все доезжают до целей.
//  2. Никакого наложения: занятые плитки одной колонки всегда на >= 1 клетку
//     друг от друга в любой момент анимации.
//  3. Каскад: нижняя плитка колонки стартует раньше верхней.
//  4. Спавны скрыты (hidden), пока не вошли в поле, и показываются внутри.
//  5. Несколько дыр в одной колонке (вертикальное слово).
//  6. Массовое удаление (бомба 3×3) — несколько колонок одновременно.
//  7. Повторный обвал во время анимации продолжает без телепортов.
//  8. Finish мгновенно доставляет всё на места.
class WordBoardMotionCase: public ::testing::Test
{
protected:
	static constexpr int kColumns = 7;
	static constexpr int kRows = 8;

	WordBoardMotion motion;

	void SetUp() override
	{
		motion.Configure(kColumns, kRows, 9.5f, 0.05f, 0.6f);
	}

	// Реальная вертикальная позиция плитки в клетках
	float TileY(int c, int r) { return (float)r + motion.GetOffset(Vec2I(c, r)); }

	// Проверка отсутствия наложений: в каждой колонке позиции по возрастанию
	// с зазором не меньше клетки (с малым допуском)
	void ExpectNoOverlaps()
	{
		for (int c = 0; c < kColumns; c++)
		{
			for (int r = 1; r < kRows; r++)
				EXPECT_GE(TileY(c, r) - TileY(c, r - 1), 1.0f - 0.001f) << "column " << c << " row " << r;
		}
	}

	void SimulateAndCheck(float duration, float step = 1.0f/60.0f)
	{
		for (float t = 0.0f; t < duration; t += step)
		{
			motion.Update(step);
			ExpectNoOverlaps();
		}
	}
};

TEST_F(WordBoardMotionCase, RowWordCollapseArrivesWithoutOverlaps)
{
	// слово в ряду 2: колонки 1..3 теряют по плитке, сверху по спавну
	Vector<WordTileMove> moved;
	Vector<Vec2I> spawned;
	for (int c = 1; c <= 3; c++)
	{
		for (int r = 2; r < kRows - 1; r++)
			moved.Add({ c, r + 1, r });
		spawned.Add(Vec2I(c, kRows - 1));
	}

	motion.StartCollapse(moved, spawned);
	EXPECT_TRUE(motion.IsAnimating());

	SimulateAndCheck(3.0f);

	EXPECT_FALSE(motion.IsAnimating());
	for (int c = 0; c < kColumns; c++)
	{
		for (int r = 0; r < kRows; r++)
			EXPECT_FLOAT_EQ(motion.GetOffset(Vec2I(c, r)), 0.0f);
	}
}

TEST_F(WordBoardMotionCase, LowerTileStartsBeforeUpper)
{
	Vector<WordTileMove> moved = { { 2, 3, 2 }, { 2, 4, 3 }, { 2, 5, 4 } };
	motion.StartCollapse(moved, {});

	// один маленький шаг: нижняя уже сдвинулась, верхняя ещё ждёт каскад
	motion.Update(0.03f);
	EXPECT_LT(motion.GetOffset(Vec2I(2, 2)), 1.0f);
	EXPECT_FLOAT_EQ(motion.GetOffset(Vec2I(2, 4)), 1.0f);
}

TEST_F(WordBoardMotionCase, SpawnsHiddenAboveFieldThenAppear)
{
	// колонка потеряла четыре нижних плитки — четыре спавна
	Vector<WordTileMove> moved;
	Vector<Vec2I> spawned;
	for (int r = 0; r < 4; r++)
		spawned.Add(Vec2I(0, kRows - 4 + r));
	for (int r = 0; r < kRows - 4; r++)
		moved.Add({ 0, r + 4, r });

	motion.StartCollapse(moved, spawned);

	// на старте спавны за полем и скрыты
	for (auto& cell : spawned)
		EXPECT_TRUE(motion.IsHidden(cell));

	// к концу все видимы и на местах
	SimulateAndCheck(3.5f);
	for (auto& cell : spawned)
	{
		EXPECT_FALSE(motion.IsHidden(cell));
		EXPECT_FLOAT_EQ(motion.GetOffset(cell), 0.0f);
	}
}

TEST_F(WordBoardMotionCase, VerticalWordMakesLongFallsWithoutOverlaps)
{
	// вертикальное слово: колонка 4 теряет ряды 2..5 — верхние падают на 4 клетки
	Vector<WordTileMove> moved = { { 4, 6, 2 }, { 4, 7, 3 } };
	Vector<Vec2I> spawned = { Vec2I(4, 4), Vec2I(4, 5), Vec2I(4, 6), Vec2I(4, 7) };

	motion.StartCollapse(moved, spawned);
	SimulateAndCheck(3.5f);
	EXPECT_FALSE(motion.IsAnimating());
}

TEST_F(WordBoardMotionCase, BombAreaCollapsesSeveralColumns)
{
	// 3×3 вокруг (3, 3): колонки 2..4 теряют по три плитки
	Vector<WordTileMove> moved;
	Vector<Vec2I> spawned;
	for (int c = 2; c <= 4; c++)
	{
		for (int r = 2; r < kRows - 3; r++)
			moved.Add({ c, r + 3, r });
		for (int i = 0; i < 3; i++)
			spawned.Add(Vec2I(c, kRows - 3 + i));
	}

	motion.StartCollapse(moved, spawned);
	SimulateAndCheck(3.5f);
	EXPECT_FALSE(motion.IsAnimating());
}

TEST_F(WordBoardMotionCase, RestartDuringAnimationContinuesFromCurrentOffsets)
{
	Vector<WordTileMove> moved = { { 1, 5, 4 }, { 1, 6, 5 }, { 1, 7, 6 } };
	Vector<Vec2I> spawned = { Vec2I(1, 7) };
	motion.StartCollapse(moved, spawned);
	motion.Update(0.02f);

	float midOffset = motion.GetOffset(Vec2I(1, 4));
	EXPECT_GT(midOffset, 0.0f);

	// молоток во время падения: вся колонка сверху съезжает ещё на клетку,
	// летевшая плитка продолжает путь без телепорта
	Vector<WordTileMove> secondMoved = { { 1, 4, 3 }, { 1, 5, 4 }, { 1, 6, 5 }, { 1, 7, 6 } };
	Vector<Vec2I> secondSpawned = { Vec2I(1, 7) };
	motion.StartCollapse(secondMoved, secondSpawned);

	// стартовый офсет = остаток пути + новая клетка, без телепорта наверх
	EXPECT_NEAR(motion.GetOffset(Vec2I(1, 3)), midOffset + 1.0f, 0.001f);
	SimulateAndCheck(2.5f);
	EXPECT_FALSE(motion.IsAnimating());
}

TEST_F(WordBoardMotionCase, FinishSnapsEverythingInPlace)
{
	Vector<WordTileMove> moved = { { 0, 7, 0 } };
	Vector<Vec2I> spawned = { Vec2I(0, 7) };
	motion.StartCollapse(moved, spawned);
	motion.Update(0.05f);

	motion.Finish();
	EXPECT_FALSE(motion.IsAnimating());
	EXPECT_FLOAT_EQ(motion.GetOffset(Vec2I(0, 0)), 0.0f);
	EXPECT_FALSE(motion.IsHidden(Vec2I(0, 7)));
}
