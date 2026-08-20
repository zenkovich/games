#pragma once

#include "WordBoard.h"
#include "o2/Utils/Math/Vector2.h"
#include "o2/Utils/Types/Containers/Vector.h"

using namespace o2;

// Логическая модель движения плиток при обвале: у каждой клетки вертикальный
// офсет в клетках (0 — на месте, положительный — выше цели). Колонка — стек:
// плитка никогда не опускается ниже плитки под ней, поэтому наложения
// исключены при любых каскадных задержках. Спавны входят из-за верхней
// границы и скрыты (hidden), пока не покажутся в поле. Отображение только
// читает офсеты и видимость
class WordBoardMotion
{
public:
	// Геометрия и темп: скорость в клетках/с, каскад — пауза между стартами
	// плиток одной колонки (снизу вверх), spawnGap — зазор входа спавнов
	void Configure(int columns, int rows, float fallSpeedCells, float cascadeDelay, float spawnGap);

	// Запускает движение по результату хода; повторный старт во время
	// анимации продолжает от текущих офсетов без телепортов
	void StartCollapse(const Vector<WordTileMove>& moved, const Vector<Vec2I>& spawned);

	// Продвигает падение: скорость с клампом по плитке ниже
	void Update(float dt);

	// Мгновенно доставляет все плитки на места
	void Finish();

	bool IsAnimating() const;

	// Офсет клетки в клетках (0 — на месте)
	float GetOffset(const Vec2I& cell) const;

	// Плитка ещё за верхней границей поля — отображение её прячет
	bool IsHidden(const Vec2I& cell) const;

private:
	struct Motion
	{
		float offset = 0.0f; // в клетках, вверх от цели
		float delay = 0.0f;  // каскадная пауза до старта
		bool active = false;
	};

	int mColumns = 0;
	int mRows = 0;
	float mFallSpeed = 9.5f;    // клетках/с
	float mCascadeDelay = 0.05f;
	float mSpawnGap = 0.6f;     // зазор над полем перед первой спавн-плиткой

	Vector<Vector<Motion>> mGrid; // [column][row]

	bool IsValid(const Vec2I& cell) const;
};
