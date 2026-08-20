#include "o2/stdafx.h"
#include "WordLevel.h"

#include "WordDictionary.h"
#include "o2/Utils/Math/Math.h"

void WordLevel::Start(const WordLevelConfig& config, const WordBoardConfig& boardConfig,
					  const WordDictionary& dictionary, unsigned int seed)
{
	mConfig = config;
	mScore = 0;
	mMovesLeft = config.moves;
	mState = State::Playing;

	mCharges = config.boosterCharges;
	while (mCharges.Count() < 5)
		mCharges.Add(0);

	mTasks.Clear();
	for (auto& taskConfig : config.tasks)
	{
		WordTaskState task;
		task.config = taskConfig;
		mTasks.Add(task);
	}

	mBoard.Init(boardConfig, seed);

	// одно из слов заданий обязано оказаться на поле — игроку проще начать
	Vector<WString> taskWords;
	for (auto& task : mTasks)
	{
		if (task.config.taskType == WordTaskType::Word && !task.config.word.IsEmpty())
			taskWords.Add(WString(task.config.word));
	}

	WString seededWord;
	if (!taskWords.IsEmpty())
		seededWord = taskWords[0];

	mBoard.Fill(config.iceCells, config.stoneCells, seededWord);
	RefreshIceTasks();
	EnsureTasksAchievable(dictionary);
}

WordBoard& WordLevel::GetBoard() { return mBoard; }
const WordBoard& WordLevel::GetBoard() const { return mBoard; }

WordLevel::State WordLevel::GetState() const { return mState; }
int WordLevel::GetScore() const { return mScore; }
int WordLevel::GetTargetScore() const { return mConfig.targetScore; }
int WordLevel::GetMovesLeft() const { return mMovesLeft; }

int WordLevel::GetBoosterCharges(Booster booster) const
{
	return mCharges[(int)booster];
}

const Vector<WordTaskState>& WordLevel::GetTasks() const { return mTasks; }

WordMoveResult WordLevel::AcceptWord(const WordDictionary& dictionary)
{
	WordMoveResult result;
	if (mState != State::Playing)
	{
		result.reason = "blocked";
		return result;
	}

	WString pattern = mBoard.GetCurrentWord();
	result = mBoard.AcceptWord(dictionary);
	if (!result.ok)
		return result;

	mScore += result.gain;

	if (!result.powerupEarned.IsEmpty())
		OnPowerupEarned(result.powerupEarned);

	UpdateTasksAfterWord(pattern, result.wordScore);
	RefreshIceTasks();

	mMovesLeft--;

	CheckWin();
	if (mState == State::Playing && mMovesLeft <= 0)
		mState = State::Lost;

	result.repaired = EnsureTasksAchievable(dictionary);
	return result;
}

WordMoveResult WordLevel::UseHammer(const Vec2I& cell, const WordDictionary& dictionary)
{
	WordMoveResult result;
	if (mState != State::Playing || !TakeCharge(Booster::Hammer))
		return result;

	result = mBoard.RemoveTile(cell);

	// молоток мог снести последний лёд — задача закрывается и без хода
	RefreshIceTasks();
	CheckWin();
	result.repaired = EnsureTasksAchievable(dictionary);
	return result;
}

bool WordLevel::UseShuffle(const WordDictionary& dictionary)
{
	if (mState != State::Playing || !TakeCharge(Booster::Shuffle))
		return false;

	bool ok = mBoard.ShuffleLetters();
	EnsureTasksAchievable(dictionary);
	return ok;
}

bool WordLevel::UseHint(const WordDictionary& dictionary)
{
	if (mState != State::Playing || mCharges[(int)Booster::Hint] <= 0)
		return false;

	if (!mBoard.SelectBestWord(dictionary))
		return false;

	mCharges[(int)Booster::Hint]--;
	return true;
}

bool WordLevel::UseJoker(const Vec2I& cell)
{
	if (mState != State::Playing || mCharges[(int)Booster::Joker] <= 0)
		return false;

	if (!mBoard.MakeJoker(cell))
		return false;

	mCharges[(int)Booster::Joker]--;
	return true;
}

bool WordLevel::UseDoubler(const Vec2I& cell)
{
	if (mState != State::Playing || mCharges[(int)Booster::Doubler] <= 0)
		return false;

	if (!mBoard.MakeDoubled(cell))
		return false;

	mCharges[(int)Booster::Doubler]--;
	return true;
}

void WordLevel::DebugSetTargetScore(int target) { mConfig.targetScore = target; }
void WordLevel::DebugSetMovesLeft(int moves) { mMovesLeft = moves; }

void WordLevel::DebugCompleteTasks()
{
	for (auto& task : mTasks)
	{
		task.progress = task.config.count;
		task.done = true;
	}
}

void WordLevel::DebugAddScore(int score) { mScore += score; }

bool WordLevel::AreTasksDone() const
{
	for (auto& task : mTasks)
	{
		if (!task.done)
			return false;
	}
	return true;
}

void WordLevel::BumpTask(WordTaskState& task)
{
	task.progress++;
	if (task.progress >= task.config.count)
		task.done = true;
}

void WordLevel::UpdateTasksAfterWord(const WString& pattern, int wordScore)
{
	for (auto& task : mTasks)
	{
		if (task.done)
			continue;

		if (task.config.taskType == WordTaskType::Word &&
			WordDictionary::MatchPattern(pattern, WString(task.config.word)))
		{
			BumpTask(task);
		}
		else if (task.config.taskType == WordTaskType::Length && pattern.Length() == task.config.length)
			BumpTask(task);
		else if (task.config.taskType == WordTaskType::AnyWords)
			BumpTask(task);
		else if (task.config.taskType == WordTaskType::WordScore && wordScore >= task.config.scoreThreshold)
			BumpTask(task);
	}
}

Vector<Vec2I> WordLevel::EnsureTasksAchievable(const WordDictionary& dictionary)
{
	Vector<Vec2I> repaired;
	if (mState != State::Playing)
		return repaired;

	// на поле вообще нет ни одного слова — подсеять случайное короткое
	if (!mBoard.AnyWordExists(dictionary))
		mBoard.PlantMissingLetters(mBoard.RandomDictWord(dictionary, 4), repaired);

	// полный перебор словаря дорогой — лучшее слово считаем не более одного раза
	bool bestComputed = false;
	bool bestFound = false;
	float bestValue = 0.0f;

	for (auto& task : mTasks)
	{
		if (task.done)
			continue;

		auto type = task.config.taskType;
		if (type == WordTaskType::Word && !mBoard.CanAssembleWord(WString(task.config.word)))
			mBoard.PlantMissingLetters(WString(task.config.word), repaired);
		else if (type == WordTaskType::Length && !mBoard.AnyWordExists(dictionary, task.config.length))
			mBoard.PlantMissingLetters(mBoard.RandomDictWord(dictionary, task.config.length), repaired);
		else if (type == WordTaskType::Powerup)
		{
			int length = task.config.powerupKind == "rocket" ? 6 : task.config.powerupKind == "fireworks" ? 7 : 5;
			bool achievable = mBoard.AnyWordExists(dictionary, length) ||
				(task.config.powerupKind == "fireworks" && mBoard.AnyWordExists(dictionary, 8));
			if (!achievable)
				mBoard.PlantMissingLetters(mBoard.RandomDictWord(dictionary, length), repaired);
		}
		else if (type == WordTaskType::WordScore)
		{
			if (!bestComputed)
			{
				WString word;
				Vector<Vec2I> cells;
				bestFound = mBoard.FindBestWord(dictionary, 0, word, cells, bestValue);
				bestComputed = true;
			}
			if (!bestFound || (int)Math::Ceil(bestValue) < task.config.scoreThreshold)
				mBoard.PlantMissingLetters(mBoard.ExpensiveDictWord(dictionary), repaired);
		}
	}
	return repaired;
}

void WordLevel::OnPowerupEarned(const String& kind)
{
	for (auto& task : mTasks)
	{
		if (!task.done && task.config.taskType == WordTaskType::Powerup &&
			(task.config.powerupKind == kind || task.config.powerupKind.IsEmpty()))
		{
			BumpTask(task);
		}
	}
}

void WordLevel::RefreshIceTasks()
{
	if (mBoard.CountIce() > 0)
		return;

	for (auto& task : mTasks)
	{
		if (task.config.taskType == WordTaskType::ClearIce)
			task.done = true;
	}
}

// Очки — обязательное финальное условие: победа только с закрытыми задачами
void WordLevel::CheckWin()
{
	if (mState == State::Playing && mScore >= mConfig.targetScore && AreTasksDone())
		mState = State::Won;
}

bool WordLevel::TakeCharge(Booster booster)
{
	if (mCharges[(int)booster] <= 0)
		return false;

	mCharges[(int)booster]--;
	return true;
}
// --- META ---

ENUM_META(WordLevel::State, WordLevel__State)
{
    ENUM_ENTRY(Lost);
    ENUM_ENTRY(Playing);
    ENUM_ENTRY(Won);
}
END_ENUM_META;

ENUM_META(WordLevel::Booster, WordLevel__Booster)
{
    ENUM_ENTRY(Doubler);
    ENUM_ENTRY(Hammer);
    ENUM_ENTRY(Hint);
    ENUM_ENTRY(Joker);
    ENUM_ENTRY(Shuffle);
}
END_ENUM_META;
// --- END META ---
