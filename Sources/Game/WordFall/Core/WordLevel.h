#pragma once

#include "WordBoard.h"
#include "WordFallConfigs.h"

using namespace o2;

class WordDictionary;

// Задача уровня с прогрессом
struct WordTaskState
{
	WordTaskConfig config;
	int progress = 0;
	bool done = false;
};

// Состояние уровня: задачи, ходы, счёт, заряды бустеров, win/lose.
// Очки — обязательное финальное условие: победа при закрытых задачах И score >= target
class WordLevel
{
public:
	enum class State { Playing, Won, Lost };
	enum class Booster { Hammer = 0, Shuffle, Hint, Joker, Doubler };

	// Стартует уровень: поле, сид слова из заданий, задачи
	void Start(const WordLevelConfig& config, const WordBoardConfig& boardConfig,
			   const WordDictionary& dictionary, unsigned int seed);

	WordBoard& GetBoard();
	const WordBoard& GetBoard() const;

	State GetState() const;
	int GetScore() const;
	int GetTargetScore() const;
	int GetMovesLeft() const;
	int GetBoosterCharges(Booster booster) const;
	const Vector<WordTaskState>& GetTasks() const;

	// Принятие текущего слова; двигает задачи, счёт, ходы, состояние
	WordMoveResult AcceptWord(const WordDictionary& dictionary);

	// Бустеры: расходуют заряд, ход не тратят
	WordMoveResult UseHammer(const Vec2I& cell, const WordDictionary& dictionary);
	bool UseShuffle(const WordDictionary& dictionary);
	bool UseHint(const WordDictionary& dictionary);
	bool UseJoker(const Vec2I& cell);
	bool UseDoubler(const Vec2I& cell);

	// Слово уже принималось на этом уровне
	bool IsWordUsed(const WString& word) const;
	// Ключи заданий для вьюх: чего хочет уровень (для подсказки и ракет)
	WordBoard::RocketPriorities MakeRocketPriorities() const;

	// Для тестов
	void DebugSetTargetScore(int target);
	void DebugSetMovesLeft(int moves);
	void DebugAddMoves(int moves);
	void DebugAddCharges(int charges);
	void DebugLose();
	void DebugCompleteTasks();
	void DebugAddScore(int score);

private:
	WordLevelConfig mConfig;
	WordBoard mBoard;
	Vector<WordTaskState> mTasks;
	Vector<int> mCharges;
	int mMoveIndex = 0;
	Vector<WString> mUsedWords;
	int mParcelsSpawned = 0; // выпущено конвертов, включая стартовые
	int mScore = 0;
	int mMovesLeft = 0;
	State mState = State::Playing;

	bool AreTasksDone() const;
	void BumpTask(WordTaskState& task);
	void UpdateTasksAfterWord(const WString& pattern, int wordScore);
	// Прогресс задач по результату хода: конверты, снежки, ящики
	void UpdateTasksAfterMove(const WordMoveResult& result);
	// Очередь спавна на ход: конверты по лимиту на поле, снежки по норме уровня
	void QueueSpawns();

	// Страховка выполнимости: каждое незакрытое задание достижимо, иначе
	// подсеваются недостающие буквы. Возвращает подсеянные клетки
	Vector<Vec2I> EnsureTasksAchievable(const WordDictionary& dictionary);
	void OnPowerupEarned(const String& kind);
	void RefreshIceTasks();
	void RefreshObstacleTasks();
	void CheckWin();

	bool TakeCharge(Booster booster);
};
// --- META ---

PRE_ENUM_META(WordLevel::State);

PRE_ENUM_META(WordLevel::Booster);
// --- END META ---
