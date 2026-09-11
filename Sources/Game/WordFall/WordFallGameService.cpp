#include "o2/stdafx.h"
#include "WordFallGameService.h"

#include "o2/Assets/Types/DataAsset.h"

#include "Core/WordFallLevels.h"

#include "o2/Utils/Math/Math.h"

WordFallGameService::WordFallGameService()
{}

void WordFallGameService::OnStart()
{
	EnsureStarted();
}

void WordFallGameService::OnUpdate(float dt)
{
	mMotion.Update(dt);
}

void WordFallGameService::StartCollapseAnimation()
{
	EnsureStarted();
	mMotion.Configure(boardConfig.columns, boardConfig.rows, fallSpeedCells, fallCascadeDelay, 0.6f);
	mMotion.StartCollapse(mLastMove.moved, mLastMove.spawned);
}

bool WordFallGameService::IsCollapseAnimating()
{
	return mMotion.IsAnimating();
}

float WordFallGameService::GetTileFallOffset(int column, int row)
{
	return mMotion.GetOffset(Vec2I(column, row));
}

bool WordFallGameService::IsTileFallHidden(int column, int row)
{
	return mMotion.IsHidden(Vec2I(column, row));
}

void WordFallGameService::FinishCollapseAnimation()
{
	mMotion.Finish();
}

void WordFallGameService::EnsureStarted()
{
	if (mStarted)
		return;

	mStarted = true;
	mDictionary.LoadDefault();

	// ручная кампания в редакторе > data-ассет кампании > процедурная генерация
	if (levels.IsEmpty() && !campaignPath.IsEmpty())
	{
		if (auto asset = o2Assets.GetAssetRefByType<DataAsset>(campaignPath))
			asset->data.Get(mCampaign);
		if (mCampaign.IsEmpty())
			o2Debug.LogWarning("WordFall: campaign asset " + campaignPath + " is missing or empty, using the procedural campaign");
	}

	mProgress.Load(progressPath);
	StartLevel(mProgress.currentLevel);
}

void WordFallGameService::StartLevel(int index)
{
	EnsureStarted();

	mLevelIndex = Math::Clamp(index, 0, GetLevelCount() - 1);

	// ручная кампания в редакторе имеет приоритет; иначе — процедурная генерация
	WordLevelConfig config = !levels.IsEmpty() ? levels[mLevelIndex]
		: !mCampaign.IsEmpty() ? mCampaign[mLevelIndex]
		: WordFallLevels::Generate(mLevelIndex, mDictionary, boardConfig);

	mLevel.Start(config, boardConfig, mDictionary, (unsigned int)randomSeed);
	mLastMove = WordMoveResult();
	mRevision++;
}

void WordFallGameService::RestartLevel()
{
	StartLevel(mLevelIndex);
}

void WordFallGameService::AdvanceToNextLevel()
{
	EnsureStarted();

	mProgress.CompleteLevel(mLevelIndex, mLevel.GetScore(), GetLevelCount());
	if (!mProgress.Save(progressPath))
		o2Debug.LogWarning("WordFall: failed to save progress to " + progressPath);

	StartLevel(mProgress.currentLevel);
}

int WordFallGameService::GetLevelIndex() const { return mLevelIndex; }
int WordFallGameService::GetLevelCount() const
{
	return !levels.IsEmpty() ? levels.Count() : !mCampaign.IsEmpty() ? mCampaign.Count() : campaignLength;
}

int WordFallGameService::GetColumns() const { return boardConfig.columns; }
int WordFallGameService::GetRows() const { return boardConfig.rows; }

ScriptValue WordFallGameService::GetTile(int column, int row)
{
	EnsureStarted();

	auto& tile = mLevel.GetBoard().GetTile(Vec2I(column, row));
	auto result = ScriptValue::EmptyObject();
	result.SetProperty("letter", ScriptValue(String(tile.letter)));
	result.SetProperty("value", ScriptValue(tile.value*(tile.doubled ? 2 : 1)));
	result.SetProperty("ice", ScriptValue(tile.ice));
	result.SetProperty("stone", ScriptValue(tile.stone));
	result.SetProperty("doubled", ScriptValue(tile.doubled));
	result.SetProperty("joker", ScriptValue(tile.joker));
	result.SetProperty("powerup", ScriptValue(String(tile.powerup)));
	result.SetProperty("hole", ScriptValue(tile.hole));
	result.SetProperty("crate", ScriptValue(tile.crate));
	result.SetProperty("chained", ScriptValue(tile.chained));
	result.SetProperty("snow", ScriptValue(tile.snow));
	result.SetProperty("parcel", ScriptValue(tile.parcel));
	result.SetProperty("empty", ScriptValue(!WordBoard::IsTileOccupied(tile) && !WordBoard::IsTileStatic(tile)));
	return result;
}

ScriptValue WordFallGameService::GetSelection()
{
	EnsureStarted();
	return CellsToScript(mLevel.GetBoard().GetSelection());
}

ScriptValue WordFallGameService::GetTasks()
{
	EnsureStarted();

	auto result = ScriptValue::EmptyArray();
	for (auto& task : mLevel.GetTasks())
	{
		auto item = ScriptValue::EmptyObject();

		String type = "word";
		if (task.config.taskType == WordTaskType::Length)
			type = "length";
		else if (task.config.taskType == WordTaskType::Powerup)
			type = "powerup";
		else if (task.config.taskType == WordTaskType::ClearIce)
			type = "clearIce";
		else if (task.config.taskType == WordTaskType::AnyWords)
			type = "anyWords";
		else if (task.config.taskType == WordTaskType::WordScore)
			type = "wordScore";
		else if (task.config.taskType == WordTaskType::Letter)
			type = "letter";
		else if (task.config.taskType == WordTaskType::Deliver)
			type = "deliver";
		else if (task.config.taskType == WordTaskType::Melt)
			type = "melt";
		else if (task.config.taskType == WordTaskType::Crates)
			type = "crates";

		item.SetProperty("type", ScriptValue(type));
		item.SetProperty("word", ScriptValue(task.config.word));
		item.SetProperty("length", ScriptValue(task.config.length));
		item.SetProperty("kind", ScriptValue(task.config.powerupKind));
		item.SetProperty("count", ScriptValue(task.config.count));
		item.SetProperty("score", ScriptValue(task.config.scoreThreshold));
		item.SetProperty("letter", ScriptValue(task.config.letter));
		item.SetProperty("progress", ScriptValue(task.progress));
		item.SetProperty("done", ScriptValue(task.done));
		result.AddElement(item);
	}
	return result;
}

int WordFallGameService::GetScore() const { return mLevel.GetScore(); }
int WordFallGameService::GetTargetScore() const { return mLevel.GetTargetScore(); }
int WordFallGameService::GetMovesLeft() const { return mLevel.GetMovesLeft(); }

String WordFallGameService::GetGameState() const
{
	switch (mLevel.GetState())
	{
		case WordLevel::State::Won: return "won";
		case WordLevel::State::Lost: return "lost";
		default: return "playing";
	}
}

int WordFallGameService::GetBoosterCharges(int booster) const
{
	return mLevel.GetBoosterCharges((WordLevel::Booster)booster);
}

String WordFallGameService::GetCurrentWord() const
{
	return String(mLevel.GetBoard().GetCurrentWord());
}

bool WordFallGameService::IsCurrentWordValid() const
{
	return mDictionary.Contains(mLevel.GetBoard().GetCurrentWord());
}

int WordFallGameService::GetRevision() const { return mRevision; }

ScriptValue WordFallGameService::GetLastMove()
{
	EnsureStarted();
	return MoveResultToScript(mLastMove);
}

String WordFallGameService::ToggleSelect(int column, int row)
{
	EnsureStarted();

	if (mLevel.GetState() != WordLevel::State::Playing)
		return "blocked";

	auto result = mLevel.GetBoard().ToggleSelect(Vec2I(column, row));
	mRevision++;

	switch (result)
	{
		case WordBoard::SelectResult::Added: return "added";
		case WordBoard::SelectResult::Removed: return "removed";
		case WordBoard::SelectResult::Blocked: return "blocked";
		default: return "iced";
	}
}

void WordFallGameService::ClearSelection()
{
	EnsureStarted();
	mLevel.GetBoard().ClearSelection();
	mRevision++;
}

ScriptValue WordFallGameService::AcceptWord()
{
	EnsureStarted();
	mLastMove = mLevel.AcceptWord(mDictionary);
	if (mLastMove.ok)
		mRevision++;
	return MoveResultToScript(mLastMove);
}

ScriptValue WordFallGameService::UseHammer(int column, int row)
{
	EnsureStarted();
	auto result = mLevel.UseHammer(Vec2I(column, row), mDictionary);
	if (result.ok)
	{
		mLastMove = result;
		mRevision++;
	}
	return MoveResultToScript(result);
}

bool WordFallGameService::UseShuffle()
{
	EnsureStarted();
	bool ok = mLevel.UseShuffle(mDictionary);
	if (ok)
		mRevision++;
	return ok;
}

bool WordFallGameService::UseHint()
{
	EnsureStarted();
	bool ok = mLevel.UseHint(mDictionary);
	if (ok)
		mRevision++;
	return ok;
}

bool WordFallGameService::UseJoker(int column, int row)
{
	EnsureStarted();
	bool ok = mLevel.UseJoker(Vec2I(column, row));
	if (ok)
		mRevision++;
	return ok;
}

bool WordFallGameService::UseDoubler(int column, int row)
{
	EnsureStarted();
	bool ok = mLevel.UseDoubler(Vec2I(column, row));
	if (ok)
		mRevision++;
	return ok;
}

void WordFallGameService::DebugSetTile(int column, int row, const String& letter)
{
	EnsureStarted();
	mLevel.GetBoard().DebugSetTile(Vec2I(column, row), WString(letter));
	mRevision++;
}

void WordFallGameService::DebugSetStone(int column, int row)
{
	EnsureStarted();
	mLevel.GetBoard().DebugSetStone(Vec2I(column, row));
	mRevision++;
}

void WordFallGameService::DebugSetPowerup(int column, int row, const String& kind)
{
	EnsureStarted();
	mLevel.GetBoard().DebugSetPowerup(Vec2I(column, row), kind);
	mRevision++;
}

void WordFallGameService::DebugSetTargetScore(int target)
{
	EnsureStarted();
	mLevel.DebugSetTargetScore(target);
	mRevision++;
}

void WordFallGameService::DebugCompleteTasks()
{
	EnsureStarted();
	mLevel.DebugCompleteTasks();
	mRevision++;
}

void WordFallGameService::DebugAddMoves(int moves)
{
	EnsureStarted();
	mLevel.DebugAddMoves(moves);
	mRevision++;
}

void WordFallGameService::DebugAddScore(int score)
{
	EnsureStarted();
	mLevel.DebugAddScore(score);
	mRevision++;
}

void WordFallGameService::DebugAddCharges(int charges)
{
	EnsureStarted();
	mLevel.DebugAddCharges(charges);
	mRevision++;
}

void WordFallGameService::DebugLoseLevel()
{
	EnsureStarted();
	mLevel.DebugLose();
	mRevision++;
}

void WordFallGameService::DebugSpawnRandomPowerup()
{
	EnsureStarted();
	auto& board = mLevel.GetBoard();
	Vector<Vec2I> cells;
	for (int c = 0; c < board.GetColumns(); c++)
		for (int r = 0; r < board.GetRows(); r++)
			if (WordBoard::IsTileUsable(board.GetTile(Vec2I(c, r))) && !board.GetSeededCells().Contains(Vec2I(c, r)))
				cells.Add(Vec2I(c, r));
	if (cells.IsEmpty())
		return;

	const char* kinds[3] = { "bomb", "rocket", "fireworks" };
	board.DebugSetPowerup(cells[Math::Random(0, cells.Count() - 1)], kinds[Math::Random(0, 2)]);
	mRevision++;
}

bool WordFallGameService::IsTutorialSeen(const String& key)
{
	EnsureStarted();
	return mProgress.IsTutorialSeen(key);
}

void WordFallGameService::MarkTutorialSeen(const String& key)
{
	EnsureStarted();
	mProgress.MarkTutorialSeen(key);
	mProgress.Save(progressPath);
}

void WordFallGameService::ResetTutorials()
{
	EnsureStarted();
	mProgress.seenTutorials.Clear();
	mProgress.Save(progressPath);
	mRevision++;
}

ScriptValue WordFallGameService::GetSeededCells()
{
	EnsureStarted();
	return CellsToScript(mLevel.GetBoard().GetSeededCells());
}

bool WordFallGameService::IsWordUsed(const String& word)
{
	EnsureStarted();
	return mLevel.IsWordUsed(WString(word));
}

int WordFallGameService::GetBestScore()
{
	EnsureStarted();
	return mProgress.GetBestScore(mLevelIndex);
}

WordLevel& WordFallGameService::GetLevel()
{
	EnsureStarted();
	return mLevel;
}

const WordDictionary& WordFallGameService::GetDictionary() const { return mDictionary; }
PlayerProgress& WordFallGameService::GetProgress() { return mProgress; }

ScriptValue WordFallGameService::MoveResultToScript(const WordMoveResult& result) const
{
	auto script = ScriptValue::EmptyObject();
	script.SetProperty("ok", ScriptValue(result.ok));
	script.SetProperty("reason", ScriptValue(result.reason));
	script.SetProperty("word", ScriptValue(result.word));
	script.SetProperty("wordScore", ScriptValue(result.wordScore));
	script.SetProperty("extraScore", ScriptValue(result.extraScore));
	script.SetProperty("gain", ScriptValue(result.gain));
	script.SetProperty("powerupEarned", ScriptValue(result.powerupEarned));
	script.SetProperty("burned", CellsToScript(result.burned));
	script.SetProperty("activated", CellsToScript(result.activated));
	script.SetProperty("iceBroken", CellsToScript(result.iceBroken));
	script.SetProperty("spawned", CellsToScript(result.spawned));
	script.SetProperty("repaired", CellsToScript(result.repaired));
	script.SetProperty("destroyed", CellsToScript(result.destroyed));
	script.SetProperty("crateHit", CellsToScript(result.crateHit));
	script.SetProperty("crateBroken", CellsToScript(result.crateBroken));
	script.SetProperty("snowMelted", CellsToScript(result.snowMelted));
	script.SetProperty("delivered", CellsToScript(result.delivered));

	auto used = ScriptValue::EmptyArray();
	for (auto& use : result.powerupsUsed)
	{
		auto item = ScriptValue::EmptyObject();
		item.SetProperty("kind", ScriptValue(use.kind));
		item.SetProperty("c", ScriptValue(use.cell.x));
		item.SetProperty("r", ScriptValue(use.cell.y));

		auto targets = ScriptValue::EmptyArray();
		for (auto& target : use.targets)
		{
			auto cell = ScriptValue::EmptyObject();
			cell.SetProperty("c", ScriptValue(target.x));
			cell.SetProperty("r", ScriptValue(target.y));
			targets.AddElement(cell);
		}
		item.SetProperty("targets", targets);
		used.AddElement(item);
	}
	script.SetProperty("powerupsUsed", used);
	script.SetProperty("state", ScriptValue(GetGameState()));

	auto moved = ScriptValue::EmptyArray();
	for (auto& move : result.moved)
	{
		auto item = ScriptValue::EmptyObject();
		item.SetProperty("c", ScriptValue(move.column));
		item.SetProperty("fromR", ScriptValue(move.fromRow));
		item.SetProperty("toR", ScriptValue(move.toRow));
		moved.AddElement(item);
	}
	script.SetProperty("moved", moved);
	return script;
}

ScriptValue WordFallGameService::CellsToScript(const Vector<Vec2I>& cells)
{
	auto result = ScriptValue::EmptyArray();
	for (auto& cell : cells)
	{
		auto item = ScriptValue::EmptyObject();
		item.SetProperty("c", ScriptValue(cell.x));
		item.SetProperty("r", ScriptValue(cell.y));
		result.AddElement(item);
	}
	return result;
}
// --- META ---

DECLARE_CLASS(WordFallGameService, WordFallGameService);
// --- END META ---
