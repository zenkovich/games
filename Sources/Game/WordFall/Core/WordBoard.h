#pragma once

#include "WordFallConfigs.h"
#include "o2/Utils/Math/Vector2.h"
#include "o2/Utils/Types/Containers/Vector.h"
#include "o2/Utils/Types/String.h"

using namespace o2;

class WordDictionary;

// Плитка поля
struct WordTile
{
	WString letter;   // буква (одна)
	int value = 0;    // номинал
	int ice = 0;      // слоёв льда (буква видна, выбор запрещён)
	int stone = 0;    // камень (ломается только бонусами)
	bool doubled = false;
	bool joker = false;
	WString powerup;  // "" | "bomb" | "rocket" | "fireworks" — бонус занимает слот вместо буквы
};

// Сработавший пауэрап
struct WordPowerupUse
{
	String kind;
	Vec2I cell;
	Vector<Vec2I> targets; // цели ракет (rocket/fireworks) — для анимации полёта
};

// Перемещение плитки при гравитации
struct WordTileMove
{
	int column = 0;
	int fromRow = 0;
	int toRow = 0;
};

// Результат принятия слова — всё, что нужно вью для анимаций
struct WordMoveResult
{
	bool ok = false;
	String reason;            // invalid | blocked
	String word;              // паттерн слова (с '?')
	int baseScore = 0;
	float lengthMultiplier = 1.0f;
	int clusterSize = 1;
	int wordScore = 0;        // очки слова с множителями
	int extraScore = 0;       // очки от пауэрапов
	int gain = 0;             // всего за ход
	String powerupEarned;     // заработанный пауэрап ("" если нет)
	Vector<Vec2I> burned;     // сгоревшие клетки (слово + взрывы)
	Vector<Vec2I> destroyed;  // уничтоженные пауэрапами (сверх слова)
	Vector<WordPowerupUse> powerupsUsed; // сработавшие пауэрапы
	Vector<Vec2I> activated;  // активированные пауэрапами клетки (остались на поле)
	Vector<Vec2I> iceBroken;
	Vector<WordTileMove> moved;
	Vector<Vec2I> spawned;
	Vector<Vec2I> repaired;   // подсев страховки выполнимости
};

// Модель игрового поля: сетка, мешок, выбор, очки, гравитация, пауэрапы.
// Не знает о задачах, ходах и состоянии уровня — этим занимается WordLevel
class WordBoard
{
public:
	// Инициализация с конфигом и сидом (0 — случайный)
	void Init(const WordBoardConfig& config, unsigned int seed);

	// Новое поле: заполнение из мешка, сид слова, лёд
	void Fill(const Vector<Vec2I>& iceCells, const Vector<Vec2I>& stoneCells, const WString& seededWord);

	int GetColumns() const;
	int GetRows() const;
	bool IsValidCell(const Vec2I& cell) const;

	const WordTile& GetTile(const Vec2I& cell) const;
	WordTile& GetTileEditable(const Vec2I& cell);

	const Vector<Vec2I>& GetSelection() const;
	const Vector<Vec2I>& GetSeededCells() const;

	// Свободный выбор: клик добавляет букву, повторный — снимает её и хвост
	enum class SelectResult { Added, Removed, Iced, Blocked };
	SelectResult ToggleSelect(const Vec2I& cell);
	void ClearSelection();

	// Текущий паттерн слова ('?' для джокеров)
	WString GetCurrentWord() const;

	// Очки текущего выбора: base × множитель длины × размер кластера (8-соседство)
	int ComputeSelectionScore(int& base, float& lengthMult, int& cluster) const;

	// Принятие слова: валидация, пауэрапы, лёд, гравитация, спавн, заработок пауэрапа
	WordMoveResult AcceptWord(const WordDictionary& dictionary);

	// Бустеры (без зарядов — заряды считает WordLevel)
	WordMoveResult RemoveTile(const Vec2I& cell);              // молоток
	bool ShuffleLetters();                                     // перемешивание не-ледяных
	bool MakeJoker(const Vec2I& cell);
	bool MakeDoubled(const Vec2I& cell);

	// Самое дорогое слово из букв поля; заполняет selection при успехе
	bool SelectBestWord(const WordDictionary& dictionary);

	// Самое дорогое собираемое слово (опц. точной длины): быстрый отсев по
	// счётчикам букв, затем жадный подбор плиток. outValue — очки без кластера
	bool FindBestWord(const WordDictionary& dictionary, int requiredLength,
					  WString& outWord, Vector<Vec2I>& outCells, float& outValue) const;

	// --- выполнимость заданий: примитивы для страховки уровня ---

	// Собираемо ли слово из букв поля (лёд/камень/бонусы исключены, джокеры добирают дефицит)
	bool CanAssembleWord(const WString& word) const;

	// Существует ли собираемое слово словаря (опц. точной длины)
	bool AnyWordExists(const WordDictionary& dictionary, int requiredLength = 0) const;

	// Случайное слово словаря данной длины
	WString RandomDictWord(const WordDictionary& dictionary, int length);

	// Дорогое слово для ремонта wordScore-задачи (максимум базы по выборке)
	WString ExpensiveDictWord(const WordDictionary& dictionary);

	// Подсев недостающих для слова букв (замена случайных плиток без льда и
	// пауэрапов); дополняет repaired
	void PlantMissingLetters(const WString& word, Vector<Vec2I>& repaired);

	int CountIce() const;

	static float LengthMultiplier(int length);

	// Плитка пригодна для сбора слов: есть буква, нет льда, камня и бонуса
	static bool IsTileUsable(const WordTile& tile);

	// Плитка занимает клетку (буква или бонус) — для гравитации
	static bool IsTileOccupied(const WordTile& tile);

	// Для тестов
	void DebugSetTile(const Vec2I& cell, const WString& letter);
	void DebugSetPowerup(const Vec2I& cell, const String& kind);
	void DebugSetStone(const Vec2I& cell);

private:
	WordBoardConfig mConfig;
	Vector<Vector<WordTile>> mGrid;   // [column][row], row 0 — низ
	Vector<WString> mBag;
	Vector<Vec2I> mSelection;
	Vector<Vec2I> mSeededCells;
	unsigned int mSeed = 1;

	float Random01();
	int RandomInt(int maxExclusive);

	bool IsVowel(const WString& letter) const;
	void RefillBag();
	WString DrawLetter(bool forceVowel);
	bool NeedVowelAt(int column, int row) const;
	WordTile MakeTile(const WString& letter) const;
	int LetterValue(const WString& letter) const;
	int TileValue(const WordTile& tile) const;

	String PowerupForLength(int length) const;

	struct PowerupActivation
	{
		int extraScore = 0;
		Vector<Vec2I> destroyed;
		Vector<Vec2I> activated;
		Vector<Vec2I> iceBroken;
		Vector<WordPowerupUse> used;
	};
	PowerupActivation ActivatePowerups(const Vector<Vec2I>& cells);
	void ActivateTile(const Vec2I& cell, Vector<Vec2I>& destroyedKeys, PowerupActivation& result);
	void FireRocket(const Vec2I& from, Vector<Vec2I>& destroyedKeys, PowerupActivation& result,
					WordPowerupUse& use);

	Vector<Vec2I> DamageIceAround(const Vector<Vec2I>& cells, const Vector<Vec2I>& skipCells);
	void CollapseAndSpawn(const Vector<Vec2I>& removed, Vector<WordTileMove>& moved, Vector<Vec2I>& spawned);
	void SeedWord(const WString& word);
};
// --- META ---

PRE_ENUM_META(WordBoard::SelectResult);
// --- END META ---
