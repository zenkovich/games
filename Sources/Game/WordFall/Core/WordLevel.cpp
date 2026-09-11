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
	mMoveIndex = 0;
	mParcelsSpawned = 0;
	mUsedWords.Clear();
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

	// смещение мешка уровня: гласные делают поле сговорчивее, редкие согласные — жёстче
	WordBoardConfig levelBoard = boardConfig;
	if (config.extraVowels > 0 || config.extraRare > 0)
	{
		Vector<int> vowelIndices, rareIndices;
		for (int i = 0; i < levelBoard.letters.Count(); i++)
		{
			auto& def = levelBoard.letters[i];
			if (levelBoard.vowels.Contains(def.letter))
				vowelIndices.Add(i);
			else if (def.value >= 5)
				rareIndices.Add(i);
		}
		for (int i = 0; i < config.extraVowels && !vowelIndices.IsEmpty(); i++)
			levelBoard.letters[vowelIndices[i % vowelIndices.Count()]].bagCount++;
		for (int i = 0; i < config.extraRare && !rareIndices.IsEmpty(); i++)
			levelBoard.letters[rareIndices[i % rareIndices.Count()]].bagCount++;
	}
	mBoard.Init(levelBoard, seed);

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

	mBoard.Fill(config, seededWord);
	mParcelsSpawned = mBoard.CountParcels();
	RefreshIceTasks();
	RefreshObstacleTasks();
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
	if (IsWordUsed(pattern))
	{
		result.reason = "duplicate";
		result.word = pattern;
		return result;
	}

	QueueSpawns();
	mBoard.SetRocketPriorities(MakeRocketPriorities());
	result = mBoard.AcceptWord(dictionary);
	if (!result.ok)
	{
		mBoard.SetSpawnQueue(0, 0);
		return result;
	}

	mScore += result.gain;
	mMoveIndex++;
	mUsedWords.Add(pattern);

	if (!result.powerupEarned.IsEmpty())
		OnPowerupEarned(result.powerupEarned);

	UpdateTasksAfterWord(pattern, result.wordScore);
	UpdateTasksAfterMove(result);
	RefreshIceTasks();
	RefreshObstacleTasks();

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
	UpdateTasksAfterMove(result);
	RefreshObstacleTasks();

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

	// подсказка ведёт к целям уровня и не предлагает ни использованных, ни громоздких слов
	WString taskWord;
	int lengthWanted = 0, powerupLength = 0, scoreWanted = 0;
	WString letterWanted;
	for (auto& task : mTasks)
	{
		if (task.done)
			continue;
		switch (task.config.taskType)
		{
			case WordTaskType::Word: if (taskWord.IsEmpty()) taskWord = WString(task.config.word); break;
			case WordTaskType::Length: lengthWanted = task.config.length; break;
			case WordTaskType::Letter: letterWanted = WString(task.config.letter); break;
			case WordTaskType::WordScore: scoreWanted = task.config.scoreThreshold; break;
			case WordTaskType::Powerup:
				powerupLength = task.config.powerupKind == "rocket" ? 6 : task.config.powerupKind == "fireworks" ? 7 : 5;
				break;
			default: break;
		}
	}

	WString word;
	Vector<Vec2I> cells;
	bool found = mBoard.FindBestWordBy(dictionary, [&](const WString& candidate, float value)
	{
		if (IsWordUsed(candidate))
			return 0.0f;
		if (!taskWord.IsEmpty() && candidate == taskWord)
			return 100000.0f;

		float weight = value;
		int length = candidate.Length();
		if (lengthWanted > 0 && length == lengthWanted)
			weight *= 2.2f;
		if (powerupLength > 0 && length == powerupLength)
			weight *= 1.8f;
		if (scoreWanted > 0 && value >= (float)scoreWanted)
			weight *= 2.0f;
		if (!letterWanted.IsEmpty())
		{
			int hits = 0;
			for (int i = 0; i < length; i++)
				hits += candidate.SubStr(i, i + 1) == letterWanted ? 1 : 0;
			weight *= 1.0f + 0.5f*hits;
		}
		// не самые большие слова: 4–6 букв — комфортный размер
		if (length <= 3)
			weight *= 0.8f;
		else if (length == 7)
			weight *= 0.5f;
		else if (length >= 8)
			weight *= 0.3f;
		return weight;
	}, word, cells);
	if (!found)
		return false;

	mBoard.ClearSelection();
	for (auto& cell : cells)
		mBoard.ToggleSelect(cell);

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
void WordLevel::DebugAddMoves(int moves)
{
	mMovesLeft = Math::Max(0, mMovesLeft + moves);
	if (mState == State::Lost && mMovesLeft > 0)
		mState = State::Playing;
}

void WordLevel::DebugAddCharges(int charges)
{
	for (auto& charge : mCharges)
		charge = Math::Max(0, charge + charges);
}

void WordLevel::DebugLose()
{
	if (mState == State::Playing)
	{
		mMovesLeft = 0;
		mState = State::Lost;
	}
}

void WordLevel::DebugSetMovesLeft(int moves) { mMovesLeft = moves; }

void WordLevel::DebugCompleteTasks()
{
	for (auto& task : mTasks)
	{
		task.progress = task.config.count;
		task.done = true;
	}
	CheckWin();
}

void WordLevel::DebugAddScore(int score)
{
	mScore += score;
	CheckWin();
}

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
		else if (task.config.taskType == WordTaskType::Letter && !task.config.letter.IsEmpty())
		{
			WString letter(task.config.letter);
			for (int i = 0; i < pattern.Length() && !task.done; i++)
			{
				if (pattern.SubStr(i, i + 1) == letter)
					BumpTask(task);
			}
		}
	}
}

void WordLevel::UpdateTasksAfterMove(const WordMoveResult& result)
{
	for (auto& task : mTasks)
	{
		if (task.done)
			continue;

		int hits = task.config.taskType == WordTaskType::Deliver ? result.delivered.Count()
			: task.config.taskType == WordTaskType::Melt ? result.snowMelted.Count() : 0;
		for (int i = 0; i < hits && !task.done; i++)
			BumpTask(task);
	}
}

void WordLevel::QueueSpawns()
{
	int parcels = 0;
	if (mConfig.parcelTotal > 0)
	{
		int remaining = mConfig.parcelTotal - mParcelsSpawned;
		int room = Math::Max(1, mConfig.parcelOnScreen) - mBoard.CountParcels();
		parcels = Math::Clamp(Math::Min(remaining, room), 0, mBoard.GetColumns());
	}

	int snow = 0;
	if (mConfig.snowPerMove > 0 && mBoard.CountSnow() < 8)
		snow = Math::Min(mConfig.snowPerMove, 8 - mBoard.CountSnow());

	mParcelsSpawned += parcels;
	mBoard.SetSpawnQueue(parcels, snow);
}

void WordLevel::RefreshObstacleTasks()
{
	if (mBoard.CountCrates() > 0)
		return;

	for (auto& task : mTasks)
	{
		if (task.config.taskType == WordTaskType::Crates)
			task.done = true;
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
		else if (type == WordTaskType::Letter && !task.config.letter.IsEmpty() &&
				 !mBoard.CanAssembleWord(WString(task.config.letter)))
			mBoard.PlantMissingLetters(WString(task.config.letter), repaired);
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

bool WordLevel::IsWordUsed(const WString& word) const
{
	return mUsedWords.Contains(word);
}

WordBoard::RocketPriorities WordLevel::MakeRocketPriorities() const
{
	WordBoard::RocketPriorities priorities;
	for (auto& task : mTasks)
	{
		if (task.done)
			continue;
		switch (task.config.taskType)
		{
			case WordTaskType::ClearIce: priorities.ice = true; break;
			case WordTaskType::Crates: priorities.crates = true; break;
			case WordTaskType::Melt: priorities.snow = true; break;
			case WordTaskType::Letter: priorities.keepLetter = WString(task.config.letter); break;
			case WordTaskType::Word:
				// буквы засеянного слова-задания стоят на поле, пока задание не закрыто
				for (auto& cell : mBoard.GetSeededCells())
					priorities.keepCells.Add(cell);
				break;
			default: break;
		}
	}
	return priorities;
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
