#include "o2/stdafx.h"
#include "WordBoardMotion.h"

#include "o2/Utils/Math/Math.h"

void WordBoardMotion::Configure(int columns, int rows, float fallSpeedCells, float cascadeDelay, float spawnGap)
{
	mFallSpeed = fallSpeedCells;
	mCascadeDelay = cascadeDelay;
	mSpawnGap = spawnGap;

	// при тех же размерах текущее движение не сбрасывается — рестарт обвала
	// во время анимации продолжается от текущих офсетов
	if (mColumns == columns && mRows == rows)
		return;

	mColumns = columns;
	mRows = rows;

	mGrid.Clear();
	for (int c = 0; c < columns; c++)
	{
		Vector<Motion> column;
		for (int r = 0; r < rows; r++)
			column.Add(Motion());
		mGrid.Add(column);
	}
}

void WordBoardMotion::StartCollapse(const Vector<WordTileMove>& moved, const Vector<Vec2I>& spawned)
{
	// движение продолжается от текущих офсетов: плитка, ехавшая в fromRow,
	// продолжает путь к новой цели без телепорта
	Vector<Vector<Motion>> previous = mGrid;
	for (auto& column : mGrid)
	{
		for (auto& motion : column)
			motion = Motion();
	}

	for (auto& move : moved)
	{
		if (move.column < 0 || move.column >= mColumns || move.toRow < 0 || move.toRow >= mRows)
			continue;

		auto& motion = mGrid[move.column][move.toRow];
		motion.active = true;
		motion.offset = (float)(move.fromRow - move.toRow);
		if (move.fromRow >= 0 && move.fromRow < mRows && previous[move.column][move.fromRow].active)
			motion.offset += previous[move.column][move.fromRow].offset;
	}

	// спавны колонки выстраиваются из-за верхней границы стопкой: нижний спавн
	// стартует сразу над полем, каждый следующий на клетку выше
	Vector<int> lowestSpawnRow;
	for (int c = 0; c < mColumns; c++)
		lowestSpawnRow.Add(mRows);

	for (auto& cell : spawned)
	{
		if (IsValid(cell))
			lowestSpawnRow[cell.x] = Math::Min(lowestSpawnRow[cell.x], cell.y);
	}

	for (auto& cell : spawned)
	{
		if (!IsValid(cell))
			continue;

		auto& motion = mGrid[cell.x][cell.y];
		motion.active = true;
		motion.offset = (float)(mRows - lowestSpawnRow[cell.x]) + mSpawnGap;
	}

	// каскад: плитки колонки стартуют снизу вверх с общей паузой
	for (int c = 0; c < mColumns; c++)
	{
		int index = 0;
		for (int r = 0; r < mRows; r++)
		{
			if (mGrid[c][r].active)
				mGrid[c][r].delay = (float)index++*mCascadeDelay;
		}
	}

	// нормализация стартовых позиций: даже на неточных входных данных плитка
	// не может начать ниже плитки под собой
	for (int c = 0; c < mColumns; c++)
	{
		for (int r = 1; r < mRows; r++)
		{
			auto& motion = mGrid[c][r];
			if (motion.active)
				motion.offset = Math::Max(motion.offset, mGrid[c][r - 1].offset);
		}
	}
}

void WordBoardMotion::Update(float dt)
{
	for (int c = 0; c < mColumns; c++)
	{
		for (int r = 0; r < mRows; r++)
		{
			auto& motion = mGrid[c][r];
			if (!motion.active)
				continue;

			if (motion.delay > 0.0f)
			{
				motion.delay -= dt;
				if (motion.delay > 0.0f)
					continue;
			}

			motion.offset -= mFallSpeed*dt;

			// колонка — стек: не опускаться ниже плитки под собой
			if (r > 0 && mGrid[c][r - 1].active)
				motion.offset = Math::Max(motion.offset, mGrid[c][r - 1].offset);

			if (motion.offset <= 0.0f)
			{
				motion.offset = 0.0f;
				motion.active = false;
			}
		}
	}
}

void WordBoardMotion::Finish()
{
	for (auto& column : mGrid)
	{
		for (auto& motion : column)
			motion = Motion();
	}
}

bool WordBoardMotion::IsAnimating() const
{
	for (auto& column : mGrid)
	{
		for (auto& motion : column)
		{
			if (motion.active)
				return true;
		}
	}
	return false;
}

float WordBoardMotion::GetOffset(const Vec2I& cell) const
{
	if (!IsValid(cell))
		return 0.0f;

	return mGrid[cell.x][cell.y].offset;
}

bool WordBoardMotion::IsHidden(const Vec2I& cell) const
{
	if (!IsValid(cell))
		return false;

	auto& motion = mGrid[cell.x][cell.y];
	if (!motion.active)
		return false;

	// плитка за верхней границей поля (центр выше верхнего ряда)
	return (float)cell.y + motion.offset > (float)mRows - 0.5f;
}

bool WordBoardMotion::IsValid(const Vec2I& cell) const
{
	return cell.x >= 0 && cell.x < mColumns && cell.y >= 0 && cell.y < mRows;
}
