#include "o2/stdafx.h"
#include "WordBoard.h"

#include "WordDictionary.h"
#include "o2/Utils/Math/Math.h"

void WordBoard::Init(const WordBoardConfig& config, unsigned int seed)
{
	mConfig = config;
	mSeed = seed != 0 ? seed : (unsigned int)(intptr_t)this;
	if (mSeed == 0)
		mSeed = 1;
}

void WordBoard::Fill(const WordLevelConfig& level, const WString& seededWord)
{
	mSelection.Clear();
	mSeededCells.Clear();
	mPendingParcels = 0;
	mPendingSnow = 0;
	RefillBag();

	mGrid.Clear();
	for (int c = 0; c < mConfig.columns; c++)
	{
		Vector<WordTile> column;
		for (int r = 0; r < mConfig.rows; r++)
			column.Add(WordTile());
		mGrid.Add(column);
	}

	for (auto& cell : level.holeCells)
	{
		if (IsValidCell(cell))
			mGrid[cell.x][cell.y].hole = true;
	}

	for (int c = 0; c < mConfig.columns; c++)
	{
		for (int r = 0; r < mConfig.rows; r++)
		{
			if (!mGrid[c][r].hole)
				mGrid[c][r] = MakeTile(DrawLetter(NeedVowelAt(c, r)));
		}
	}

	if (!seededWord.IsEmpty())
		SeedWord(seededWord);

	auto freeCell = [&](const Vec2I& cell)
	{
		return IsPlayable(cell) && !mSeededCells.Contains(cell) && IsTileUsable(mGrid[cell.x][cell.y]);
	};

	for (auto& cell : level.iceCells)
	{
		if (freeCell(cell))
			mGrid[cell.x][cell.y].ice = 1;
	}

	for (auto& cell : level.stoneCells)
	{
		if (freeCell(cell))
			mGrid[cell.x][cell.y].stone = 1;
	}

	for (int i = 0; i < level.crateCells.Count(); i++)
	{
		auto& cell = level.crateCells[i];
		if (!freeCell(cell))
			continue;

		mGrid[cell.x][cell.y] = WordTile();
		mGrid[cell.x][cell.y].crate = Math::Clamp(i < level.crateGrades.Count() ? level.crateGrades[i] : 1, 1, 3);
	}

	for (auto& cell : level.chainCells)
	{
		if (freeCell(cell))
			mGrid[cell.x][cell.y].chained = true;
	}

	for (auto& cell : level.snowCells)
	{
		if (freeCell(cell))
		{
			mGrid[cell.x][cell.y] = WordTile();
			mGrid[cell.x][cell.y].snow = true;
		}
	}

	for (auto& cell : level.parcelCells)
	{
		if (freeCell(cell))
		{
			mGrid[cell.x][cell.y] = WordTile();
			mGrid[cell.x][cell.y].parcel = true;
		}
	}

	for (int i = 0; i < level.powerupCells.Count() && i < level.powerupKinds.Count(); i++)
	{
		auto& cell = level.powerupCells[i];
		if (!freeCell(cell))
			continue;

		mGrid[cell.x][cell.y] = WordTile();
		mGrid[cell.x][cell.y].powerup = WString(level.powerupKinds[i]);
	}
}

const WordBoardConfig& WordBoard::GetConfig() const { return mConfig; }

bool WordBoard::IsHole(const Vec2I& cell) const
{
	return IsValidCell(cell) && mGrid[cell.x][cell.y].hole;
}

bool WordBoard::IsPlayable(const Vec2I& cell) const
{
	return IsValidCell(cell) && !mGrid[cell.x][cell.y].hole;
}

void WordBoard::SetSpawnQueue(int parcels, int snow)
{
	mPendingParcels = parcels;
	mPendingSnow = snow;
}

int WordBoard::CountCrates() const
{
	int count = 0;
	for (auto& column : mGrid)
		for (auto& tile : column)
			count += tile.crate > 0 ? 1 : 0;
	return count;
}

int WordBoard::CountSnow() const
{
	int count = 0;
	for (auto& column : mGrid)
		for (auto& tile : column)
			count += tile.snow ? 1 : 0;
	return count;
}

int WordBoard::CountParcels() const
{
	int count = 0;
	for (auto& column : mGrid)
		for (auto& tile : column)
			count += tile.parcel ? 1 : 0;
	return count;
}

bool WordBoard::IsTileUsable(const WordTile& tile)
{
	return tile.ice == 0 && tile.stone == 0 && tile.powerup.IsEmpty() && !tile.letter.IsEmpty() &&
		!tile.hole && tile.crate == 0 && !tile.snow && !tile.parcel;
}

bool WordBoard::IsTileOccupied(const WordTile& tile)
{
	return (!tile.letter.IsEmpty() || !tile.powerup.IsEmpty() || tile.snow || tile.parcel || tile.crate > 0) && !IsTileStatic(tile);
}

bool WordBoard::IsTileStatic(const WordTile& tile)
{
	return tile.hole || tile.chained;
}

void WordBoard::SetRocketPriorities(const RocketPriorities& priorities)
{
	mRocketPriorities = priorities;
}

float WordBoard::RocketTargetScore(const Vec2I& cell) const
{
	auto& tile = mGrid[cell.x][cell.y];
	auto& p = mRocketPriorities;
	if (tile.crate > 0)
		return p.crates ? 100.0f + tile.crate : 30.0f;
	if (tile.snow)
		return p.snow ? 90.0f : 25.0f;
	if (tile.ice > 0)
		return p.ice ? 80.0f : 35.0f;
	if (tile.stone > 0)
		return 60.0f;
	if (!tile.powerup.IsEmpty())
		return 5.0f;

	float score = 10.0f + (float)TileValue(tile)*3.0f;
	if (p.keepCells.Contains(cell))
		score -= 200.0f;
	if (!p.keepLetter.IsEmpty() && tile.letter == p.keepLetter)
		score -= 40.0f;
	return score;
}

int WordBoard::GetColumns() const { return mConfig.columns; }
int WordBoard::GetRows() const { return mConfig.rows; }

bool WordBoard::IsValidCell(const Vec2I& cell) const
{
	return cell.x >= 0 && cell.x < mConfig.columns && cell.y >= 0 && cell.y < mConfig.rows;
}

const WordTile& WordBoard::GetTile(const Vec2I& cell) const { return mGrid[cell.x][cell.y]; }
WordTile& WordBoard::GetTileEditable(const Vec2I& cell) { return mGrid[cell.x][cell.y]; }

const Vector<Vec2I>& WordBoard::GetSelection() const { return mSelection; }
const Vector<Vec2I>& WordBoard::GetSeededCells() const { return mSeededCells; }

WordBoard::SelectResult WordBoard::ToggleSelect(const Vec2I& cell)
{
	auto& tile = mGrid[cell.x][cell.y];
	if (tile.ice > 0)
		return SelectResult::Iced;

	if (tile.stone > 0 || !tile.powerup.IsEmpty())
		return SelectResult::Blocked;

	int index = mSelection.IndexOf(cell);
	if (index >= 0)
	{
		// снять эту букву и весь хвост после неё
		mSelection.Resize(index);
		return SelectResult::Removed;
	}

	mSelection.Add(cell);
	return SelectResult::Added;
}

// Принятое слово скалывает слой льда у соседей сгоревших букв (камень не задевает)
void WordBoard::DamageAround(const Vector<Vec2I>& cells, const Vector<Vec2I>& skipCells, WordMoveResult& result)
{
	Vector<Vec2I> hit;
	for (auto& cell : cells)
	{
		for (int dc = -1; dc <= 1; dc++)
		{
			for (int dr = -1; dr <= 1; dr++)
			{
				Vec2I target(cell.x + dc, cell.y + dr);
				if (!IsPlayable(target) || target == cell || skipCells.Contains(target) || hit.Contains(target))
					continue;

				auto& tile = mGrid[target.x][target.y];
				if (tile.ice > 0)
				{
					tile.ice--;
					if (tile.ice == 0)
						result.iceBroken.Add(target);
				}
				else if (tile.crate > 0)
				{
					tile.crate--;
					if (tile.crate == 0)
						result.crateBroken.Add(target);
					else
						result.crateHit.Add(target);
				}
				else if (tile.snow)
				{
					tile.snow = false;
					result.snowMelted.Add(target);
				}
				else
					continue;

				hit.Add(target); // одно слово бьёт каждую клетку один раз
			}
		}
	}
}

void WordBoard::ClearSelection()
{
	mSelection.Clear();
}

WString WordBoard::GetCurrentWord() const
{
	WString word;
	for (auto& cell : mSelection)
	{
		auto& tile = mGrid[cell.x][cell.y];
		word += tile.joker ? WString("?") : tile.letter;
	}
	return word;
}

int WordBoard::ComputeSelectionScore(int& base, float& lengthMult, int& cluster) const
{
	base = 0;
	for (auto& cell : mSelection)
		base += TileValue(mGrid[cell.x][cell.y]);

	// максимальная связная компонента выбора по 8-соседству
	cluster = 1;
	Vector<int> visited;
	for (int i = 0; i < mSelection.Count(); i++)
	{
		if (visited.Contains(i))
			continue;

		Vector<int> queue = { i };
		visited.Add(i);
		int size = 0;
		while (!queue.IsEmpty())
		{
			int current = queue.PopBack();
			size++;
			for (int j = 0; j < mSelection.Count(); j++)
			{
				if (visited.Contains(j))
					continue;

				if (Math::Abs(mSelection[j].x - mSelection[current].x) <= 1 &&
					Math::Abs(mSelection[j].y - mSelection[current].y) <= 1)
				{
					visited.Add(j);
					queue.Add(j);
				}
			}
		}
		cluster = Math::Max(cluster, size);
	}

	lengthMult = LengthMultiplier(mSelection.Count());
	int clusterMult = cluster >= 2 ? cluster : 1;
	return (int)Math::Ceil((float)base*lengthMult*(float)clusterMult);
}

WordMoveResult WordBoard::AcceptWord(const WordDictionary& dictionary)
{
	WordMoveResult result;
	result.word = GetCurrentWord();

	if (!dictionary.Contains(GetCurrentWord()))
	{
		result.reason = "invalid";
		return result;
	}

	Vector<Vec2I> cells = mSelection;
	result.wordScore = ComputeSelectionScore(result.baseScore, result.lengthMultiplier, result.clusterSize);

	auto powerups = ActivatePowerups(cells);
	result.extraScore = powerups.extraScore;
	result.gain = result.wordScore + result.extraScore;
	result.activated = powerups.activated;
	result.destroyed = powerups.destroyed;
	result.powerupsUsed = powerups.used;

	Vector<Vec2I> destroyed = cells + powerups.destroyed;
	result.iceBroken = powerups.iceBroken;
	result.crateHit = powerups.crateHit;
	result.crateBroken = powerups.crateBroken;
	result.snowMelted = powerups.snowMelted;
	DamageAround(cells, destroyed, result);
	result.burned = destroyed;

	CollapseAndSpawn(destroyed + result.crateBroken + result.snowMelted, result);

	// длинное слово — бонус-плитка в клетке последней буквы (занимает слот вместо буквы)
	result.powerupEarned = PowerupForLength(cells.Count());
	if (!result.powerupEarned.IsEmpty())
	{
		auto last = cells.Last();
		auto& bonusTile = mGrid[last.x][last.y];
		bonusTile = WordTile();
		bonusTile.powerup = WString(result.powerupEarned);
	}

	mSelection.Clear();
	result.ok = true;
	return result;
}

WordMoveResult WordBoard::RemoveTile(const Vec2I& cell)
{
	WordMoveResult result;
	if (!IsValidCell(cell))
		return result;

	mSelection.Clear();
	auto& tile = mGrid[cell.x][cell.y];
	if (tile.hole || tile.parcel)
		return result;

	// молоток снимает слой препятствия, а не клетку целиком
	if (tile.crate > 1)
	{
		tile.crate--;
		result.crateHit.Add(cell);
		result.ok = true;
		return result;
	}
	if (tile.crate == 1)
		result.crateBroken.Add(cell);
	else if (tile.snow)
		result.snowMelted.Add(cell);
	else
		result.burned.Add(cell);

	tile.crate = 0;
	tile.snow = false;
	tile.chained = false;
	CollapseAndSpawn({ cell }, result);
	result.ok = true;
	return result;
}

bool WordBoard::ShuffleLetters()
{
	Vector<Vec2I> cells;
	for (int c = 0; c < mConfig.columns; c++)
	{
		for (int r = 0; r < mConfig.rows; r++)
		{
			if (IsTileUsable(mGrid[c][r]))
				cells.Add(Vec2I(c, r));
		}
	}

	Vector<WordTile> tiles;
	for (auto& cell : cells)
		tiles.Add(mGrid[cell.x][cell.y]);

	for (int i = tiles.Count() - 1; i > 0; i--)
	{
		int j = RandomInt(i + 1);
		auto tmp = tiles[i];
		tiles[i] = tiles[j];
		tiles[j] = tmp;
	}

	for (int i = 0; i < cells.Count(); i++)
		mGrid[cells[i].x][cells[i].y] = tiles[i];

	mSelection.Clear();
	return true;
}

bool WordBoard::MakeJoker(const Vec2I& cell)
{
	auto& tile = mGrid[cell.x][cell.y];
	if (!IsTileUsable(tile) || tile.joker)
		return false;

	tile.joker = true;
	tile.value = 0;
	return true;
}

bool WordBoard::MakeDoubled(const Vec2I& cell)
{
	auto& tile = mGrid[cell.x][cell.y];
	if (!IsTileUsable(tile) || tile.joker || tile.doubled)
		return false;

	tile.doubled = true;
	return true;
}

bool WordBoard::SelectBestWord(const WordDictionary& dictionary)
{
	WString word;
	Vector<Vec2I> cells;
	float value;
	if (!FindBestWord(dictionary, 0, word, cells, value))
		return false;

	mSelection = cells;
	return true;
}

// счётчики букв поля без льда; возвращает число джокеров
static int CountBoardLetters(const WordBoard& board, int columns, int rows,
							 Map<wchar_t, int>& counts)
{
	int jokers = 0;
	for (int c = 0; c < columns; c++)
	{
		for (int r = 0; r < rows; r++)
		{
			auto& tile = board.GetTile(Vec2I(c, r));
			if (!WordBoard::IsTileUsable(tile))
				continue;

			if (tile.joker)
				jokers++;
			else if (!tile.letter.IsEmpty())
				counts[tile.letter[0]]++;
		}
	}
	return jokers;
}

static int WordDeficit(const WString& word, const Map<wchar_t, int>& counts)
{
	int deficit = 0;
	Map<wchar_t, int> local;
	for (int i = 0; i < word.Length(); i++)
	{
		local[word[i]]++;
		auto found = counts.find(word[i]);
		if (local[word[i]] > (found != counts.end() ? found->second : 0))
			deficit++;
	}
	return deficit;
}

bool WordBoard::FindBestWord(const WordDictionary& dictionary, int requiredLength,
							 WString& outWord, Vector<Vec2I>& outCells, float& outValue) const
{
	float bestValue = -1.0f;
	bool found = FindBestWordBy(dictionary, [&](const WString& word, float value)
	{
		if (requiredLength > 0 && word.Length() != requiredLength)
			return 0.0f;
		return value;
	}, outWord, outCells);
	if (found)
	{
		// очки найденного слова без кластера — как и раньше
		int sum = 0;
		for (auto& cell : outCells)
		{
			auto& tile = mGrid[cell.x][cell.y];
			sum += tile.joker ? 0 : TileValue(tile);
		}
		bestValue = (float)sum*LengthMultiplier(outWord.Length());
	}
	outValue = bestValue;
	return found;
}

bool WordBoard::FindBestWordBy(const WordDictionary& dictionary, const WordScorer& scorer,
							   WString& outWord, Vector<Vec2I>& outCells) const
{
	const int requiredLength = 0;
	float outValue = -1.0f;
	struct PoolTile { Vec2I cell; wchar_t letter; int value; bool joker; };
	Vector<PoolTile> pool;
	for (int c = 0; c < mConfig.columns; c++)
	{
		for (int r = 0; r < mConfig.rows; r++)
		{
			auto& tile = mGrid[c][r];
			if (IsTileUsable(tile))
				pool.Add({ Vec2I(c, r), tile.letter[0], TileValue(tile), tile.joker });
		}
	}

	// дорогие плитки первыми — жадный подбор максимизирует очки
	pool.Sort([](const PoolTile& a, const PoolTile& b) { return a.value > b.value; });

	Map<wchar_t, int> poolCounts;
	int poolJokers = CountBoardLetters(*this, mConfig.columns, mConfig.rows, poolCounts);

	auto& words = requiredLength > 0 ? dictionary.GetWordsOfLength(requiredLength)
									 : dictionary.GetAllWords();

	bool foundAny = false;
	outValue = -1.0f;

	for (auto& word : words)
	{
		// быстрый отсев по счётчикам букв
		if (WordDeficit(word, poolCounts) > poolJokers)
			continue;

		Vector<int> used;
		bool okWord = true;
		for (int li = 0; li < word.Length() && okWord; li++)
		{
			int found = -1;
			for (int p = 0; p < pool.Count(); p++)
			{
				if (!used.Contains(p) && !pool[p].joker && pool[p].letter == word[li])
				{
					found = p;
					break;
				}
			}
			if (found < 0)
			{
				for (int p = 0; p < pool.Count(); p++)
				{
					if (!used.Contains(p) && pool[p].joker)
					{
						found = p;
						break;
					}
				}
			}
			if (found < 0)
				okWord = false;
			else
				used.Add(found);
		}

		if (!okWord)
			continue;

		int sum = 0;
		for (int u : used)
			sum += pool[u].joker ? 0 : pool[u].value;

		float value = scorer(word, (float)sum*LengthMultiplier(word.Length()));
		if (value > 0.0f && value > outValue)
		{
			foundAny = true;
			outValue = value;
			outWord = word;
			outCells.Clear();
			for (int u : used)
				outCells.Add(pool[u].cell);
		}
	}
	return foundAny;
}

bool WordBoard::CanAssembleWord(const WString& word) const
{
	Map<wchar_t, int> counts;
	int jokers = CountBoardLetters(*this, mConfig.columns, mConfig.rows, counts);
	return WordDeficit(word, counts) <= jokers;
}

bool WordBoard::AnyWordExists(const WordDictionary& dictionary, int requiredLength) const
{
	Map<wchar_t, int> counts;
	int jokers = CountBoardLetters(*this, mConfig.columns, mConfig.rows, counts);

	auto& words = requiredLength > 0 ? dictionary.GetWordsOfLength(requiredLength)
									 : dictionary.GetAllWords();
	for (auto& word : words)
	{
		// при свободном выборе счётчики букв — точный критерий собираемости
		if (WordDeficit(word, counts) <= jokers)
			return true;
	}
	return false;
}

WString WordBoard::RandomDictWord(const WordDictionary& dictionary, int length)
{
	auto& bucket = dictionary.GetWordsOfLength(length);
	return bucket.IsEmpty() ? WString() : bucket[RandomInt(bucket.Count())];
}

WString WordBoard::ExpensiveDictWord(const WordDictionary& dictionary)
{
	auto& bucket = !dictionary.GetWordsOfLength(7).IsEmpty() ? dictionary.GetWordsOfLength(7)
															 : dictionary.GetWordsOfLength(6);
	if (bucket.IsEmpty())
		return WString();

	WString best;
	int bestBase = -1;
	for (int i = 0; i < 40; i++)
	{
		auto& word = bucket[RandomInt(bucket.Count())];
		int base = 0;
		for (int li = 0; li < word.Length(); li++)
			base += LetterValue(word.SubStr(li, li + 1));
		if (base > bestBase)
		{
			bestBase = base;
			best = word;
		}
	}
	return best;
}

static WString LetterToString(wchar_t letter)
{
	wchar_t buffer[2] = { letter, 0 };
	return WString(buffer);
}

void WordBoard::PlantMissingLetters(const WString& word, Vector<Vec2I>& repaired)
{
	if (word.IsEmpty())
		return;

	Map<wchar_t, int> counts;
	for (int c = 0; c < mConfig.columns; c++)
	{
		for (int r = 0; r < mConfig.rows; r++)
		{
			auto& tile = mGrid[c][r];
			if (IsTileUsable(tile) && !tile.joker)
				counts[tile.letter[0]]++;
		}
	}

	Map<wchar_t, int> need;
	for (int i = 0; i < word.Length(); i++)
		need[word[i]]++;

	for (auto& pair : need)
	{
		auto found = counts.find(pair.first);
		int lack = pair.second - (found != counts.end() ? found->second : 0);
		for (int k = 0; k < lack; k++)
		{
			// замена случайной плитки без льда и пауэрапа
			Vec2I cell(-1, -1);
			for (int attempt = 0; attempt < 60 && cell.x < 0; attempt++)
			{
				Vec2I candidate(RandomInt(mConfig.columns), RandomInt(mConfig.rows));
				auto& tile = mGrid[candidate.x][candidate.y];
				if (!IsTileUsable(tile) || repaired.Contains(candidate))
					continue;
				cell = candidate;
			}
			if (cell.x < 0)
				return;

			mGrid[cell.x][cell.y] = MakeTile(LetterToString(pair.first));
			repaired.Add(cell);
		}
	}
}

int WordBoard::CountIce() const
{
	int count = 0;
	for (int c = 0; c < mConfig.columns; c++)
	{
		for (int r = 0; r < mConfig.rows; r++)
		{
			if (mGrid[c][r].ice > 0)
				count++;
		}
	}
	return count;
}

float WordBoard::LengthMultiplier(int length)
{
	return length > 3 ? 1.0f + 0.25f*(float)(length - 3) : 1.0f;
}

void WordBoard::DebugSetTile(const Vec2I& cell, const WString& letter)
{
	bool chained = mGrid[cell.x][cell.y].chained;
	mGrid[cell.x][cell.y] = MakeTile(letter);
	mGrid[cell.x][cell.y].chained = chained;
}

void WordBoard::DebugSetPowerup(const Vec2I& cell, const String& kind)
{
	auto& tile = mGrid[cell.x][cell.y];
	tile = WordTile();
	tile.powerup = WString(kind);
}

void WordBoard::DebugSetStone(const Vec2I& cell)
{
	mGrid[cell.x][cell.y].stone = 1;
}

float WordBoard::Random01()
{
	mSeed = mSeed*1664525u + 1013904223u;
	return (float)((double)mSeed/4294967296.0);
}

int WordBoard::RandomInt(int maxExclusive)
{
	return Math::Min((int)(Random01()*(float)maxExclusive), maxExclusive - 1);
}

bool WordBoard::IsVowel(const WString& letter) const
{
	WString vowels(mConfig.vowels);
	return letter.Length() > 0 && vowels.Find(letter[0]) >= 0;
}

void WordBoard::RefillBag()
{
	mBag.Clear();
	for (auto& def : mConfig.letters)
	{
		WString letter(def.letter);
		for (int i = 0; i < def.bagCount; i++)
			mBag.Add(letter);
	}
}

WString WordBoard::DrawLetter(bool forceVowel)
{
	if (mBag.IsEmpty())
		RefillBag();

	int index = RandomInt(mBag.Count());
	if (forceVowel && !IsVowel(mBag[index]))
	{
		Vector<int> vowelIndexes;
		for (int i = 0; i < mBag.Count(); i++)
		{
			if (IsVowel(mBag[i]))
				vowelIndexes.Add(i);
		}
		if (!vowelIndexes.IsEmpty())
			index = vowelIndexes[RandomInt(vowelIndexes.Count())];
	}

	WString letter = mBag[index];
	mBag.RemoveAt(index);
	return letter;
}

// Анти-клин под механику цепочек: у каждой буквы должна быть гласная в
// 8-соседстве. Если среди уже заполненных соседей клетки спавна две и более
// букв и ни одной гласной — спавним гласную
bool WordBoard::NeedVowelAt(int column, int row) const
{
	int filled = 0;
	int vowels = 0;
	for (int dc = -1; dc <= 1; dc++)
	{
		for (int dr = -1; dr <= 1; dr++)
		{
			if (dc == 0 && dr == 0)
				continue;

			Vec2I cell(column + dc, row + dr);
			if (!IsValidCell(cell))
				continue;

			auto& tile = mGrid[cell.x][cell.y];
			if (tile.letter.IsEmpty())
				continue;

			filled++;
			if (IsVowel(tile.letter) || tile.joker)
				vowels++;
		}
	}
	return filled >= 2 && vowels == 0;
}

WordTile WordBoard::MakeTile(const WString& letter) const
{
	WordTile tile;
	tile.letter = letter;
	tile.value = LetterValue(letter);
	return tile;
}

int WordBoard::LetterValue(const WString& letter) const
{
	String utf8(letter);
	for (auto& def : mConfig.letters)
	{
		if (def.letter == utf8)
			return def.value;
	}
	return 1;
}

int WordBoard::TileValue(const WordTile& tile) const
{
	return tile.joker ? 0 : tile.value*(tile.doubled ? 2 : 1);
}

String WordBoard::PowerupForLength(int length) const
{
	if (length >= mConfig.fireworksWordLength)
		return "fireworks";
	if (length >= mConfig.rocketWordLength)
		return "rocket";
	if (length >= mConfig.bombWordLength)
		return "bomb";
	return "";
}

WordBoard::PowerupActivation WordBoard::ActivatePowerups(const Vector<Vec2I>& cells)
{
	PowerupActivation result;
	Vector<Vec2I> destroyedKeys = cells;

	// бонусы активируются буквой слова по соседству (8 клеток)
	Vector<Vec2I> bonusCells;
	for (auto& cell : cells)
	{
		for (int dc = -1; dc <= 1; dc++)
		{
			for (int dr = -1; dr <= 1; dr++)
			{
				Vec2I target(cell.x + dc, cell.y + dr);
				if (!IsValidCell(target) || bonusCells.Contains(target))
					continue;

				if (!mGrid[target.x][target.y].powerup.IsEmpty())
					bonusCells.Add(target);
			}
		}
	}

	for (auto& cell : bonusCells)
	{
		WString kind = mGrid[cell.x][cell.y].powerup;
		WordPowerupUse use{ String(kind), cell };

		// бонус-плитка сгорает вместе с активацией
		if (!destroyedKeys.Contains(cell))
		{
			destroyedKeys.Add(cell);
			result.destroyed.Add(cell);
		}

		if (kind == WString("bomb"))
		{
			// 3×3: буквы взрываются, камни разбиваются (плитка остаётся)
			for (int dc = -1; dc <= 1; dc++)
			{
				for (int dr = -1; dr <= 1; dr++)
				{
					Vec2I target(cell.x + dc, cell.y + dr);
					if (!IsValidCell(target) || destroyedKeys.Contains(target))
						continue;

					auto& tile = mGrid[target.x][target.y];
					if (HitObstacle(target, result))
						continue;

					if (tile.letter.IsEmpty() && tile.powerup.IsEmpty())
						continue;

					result.extraScore += TileValue(tile);

					if (tile.stone > 0)
					{
						tile.stone = 0;
						if (!result.activated.Contains(target))
							result.activated.Add(target);
						continue;
					}

					if (tile.ice > 0)
					{
						tile.ice = 0;
						result.iceBroken.Add(target);
					}

					destroyedKeys.Add(target);
					result.destroyed.Add(target);
				}
			}
		}
		else if (kind == WString("rocket"))
		{
			FireRocket(cell, destroyedKeys, result, use);
		}
		else if (kind == WString("fireworks"))
		{
			// залп из десяти ракет по случайным плиткам
			for (int i = 0; i < 10; i++)
				FireRocket(cell, destroyedKeys, result, use);
		}

		result.used.Add(use);
	}

	return result;
}

// Ракета летит в случайную плитку: буква сгорает, камень или лёд разбивается
void WordBoard::FireRocket(const Vec2I& from, Vector<Vec2I>& destroyedKeys, PowerupActivation& result,
						   WordPowerupUse& use)
{
	Vector<Vec2I> candidates;
	for (int c = 0; c < mConfig.columns; c++)
	{
		for (int r = 0; r < mConfig.rows; r++)
		{
			Vec2I cell(c, r);
			auto& tile = mGrid[c][r];
			bool obstacle = tile.crate > 0 || tile.snow;
			if ((tile.letter.IsEmpty() && !obstacle) || destroyedKeys.Contains(cell) ||
				result.activated.Contains(cell) || result.targeted.Contains(cell))
			{
				continue;
			}

			candidates.Add(cell);
		}
	}

	if (candidates.IsEmpty())
		return;

	// самая выгодная цель по задачам уровня; среди равных — случайная
	float best = -1e9f;
	Vector<Vec2I> top;
	for (auto& cell : candidates)
	{
		float score = RocketTargetScore(cell);
		if (score > best + 0.5f)
		{
			best = score;
			top.Clear();
		}
		if (score >= best - 0.5f)
			top.Add(cell);
	}
	Vec2I target = top[RandomInt(top.Count())];
	auto& tile = mGrid[target.x][target.y];

	use.targets.Add(target);
	result.targeted.Add(target);
	if (HitObstacle(target, result))
	{
		result.activated.Add(target);
		return;
	}

	result.extraScore += TileValue(tile);

	if (tile.stone > 0)
	{
		tile.stone = 0;
		result.activated.Add(target);
		return;
	}

	if (tile.ice > 0)
	{
		tile.ice = 0;
		result.iceBroken.Add(target);
		result.activated.Add(target);
		return;
	}

	destroyedKeys.Add(target);
	result.destroyed.Add(target);
}

void WordBoard::CollapseAndSpawn(const Vector<Vec2I>& removed, Vector<WordTileMove>& moved, Vector<Vec2I>& spawned)
{
	WordMoveResult scratch;
	CollapseAndSpawn(removed, scratch);
	moved = scratch.moved;
	spawned = scratch.spawned;
}

void WordBoard::CollapseAndSpawn(const Vector<Vec2I>& removed, WordMoveResult& result)
{
	for (auto& cell : removed)
	{
		auto& tile = mGrid[cell.x][cell.y];
		if (tile.hole)
			continue;

		tile = WordTile();
	}

	// доставленный конверт освобождает дно — обвал повторяется, ходы склеиваются
	for (int pass = 0; pass < 4; pass++)
	{
		Vector<WordTileMove> moved;
		Vector<Vec2I> spawned;
		CollapseOnce(moved, spawned);

		for (auto& move : moved)
		{
			bool chained = false;
			for (auto& prev : result.moved)
			{
				if (prev.column == move.column && prev.toRow == move.fromRow)
				{
					prev.toRow = move.toRow;
					chained = true;
					break;
				}
			}
			if (!chained)
			{
				int spawnIndex = result.spawned.IndexOf(Vec2I(move.column, move.fromRow));
				if (spawnIndex >= 0)
					result.spawned[spawnIndex] = Vec2I(move.column, move.toRow);
				else
					result.moved.Add(move);
			}
		}
		result.spawned.Add(spawned);

		auto delivered = DeliverParcels();
		if (delivered.IsEmpty())
			break;

		result.delivered.Add(delivered);
	}
}

void WordBoard::CollapseOnce(Vector<WordTileMove>& moved, Vector<Vec2I>& spawned)
{
	for (int c = 0; c < mConfig.columns; c++)
	{
		int r = 0;
		while (r < mConfig.rows)
		{
			if (IsTileStatic(mGrid[c][r]))
			{
				r++;
				continue;
			}

			// сегмент подвижных клеток до следующей статичной
			int bottom = r;
			int top = r;
			while (top + 1 < mConfig.rows && !IsTileStatic(mGrid[c][top + 1]))
				top++;

			Vector<WordTile> stack;
			Vector<int> fromRows;
			for (int i = bottom; i <= top; i++)
			{
				if (IsTileOccupied(mGrid[c][i]))
				{
					stack.Add(mGrid[c][i]);
					fromRows.Add(i);
				}
			}

			// заполняется только открытый сверху сегмент: над ним край поля или дыры
			bool fed = true;
			for (int i = top + 1; i < mConfig.rows; i++)
			{
				if (!mGrid[c][i].hole)
				{
					fed = false;
					break;
				}
			}

			for (int i = bottom; i <= top; i++)
			{
				int index = i - bottom;
				if (index < stack.Count())
				{
					mGrid[c][i] = stack[index];
					if (fromRows[index] != i)
						moved.Add({ c, fromRows[index], i });
				}
				else if (fed)
				{
					mGrid[c][i] = MakeTile(DrawLetter(NeedVowelAt(c, i)));
					spawned.Add(Vec2I(c, i));
				}
				else
					mGrid[c][i] = WordTile();
			}

			r = top + 1;
		}
	}

	// конверты и снежки уровня входят сверху вместо обычной буквы: по одному
	// на колонку, в самую верхнюю новую плитку колонки
	Vector<int> topSpawnByColumn;
	for (int c = 0; c < mConfig.columns; c++)
		topSpawnByColumn.Add(-1);
	for (auto& cell : spawned)
		topSpawnByColumn[cell.x] = Math::Max(topSpawnByColumn[cell.x], cell.y);

	Vector<int> columns;
	for (int c = 0; c < mConfig.columns; c++)
	{
		if (topSpawnByColumn[c] >= 0)
			columns.Add(c);
	}

	while ((mPendingParcels > 0 || mPendingSnow > 0) && !columns.IsEmpty())
	{
		int column = columns[RandomInt(columns.Count())];
		columns.Remove(column);
		auto& tile = mGrid[column][topSpawnByColumn[column]];
		tile = WordTile();
		if (mPendingParcels > 0)
		{
			tile.parcel = true;
			mPendingParcels--;
		}
		else
		{
			tile.snow = true;
			mPendingSnow--;
		}
	}
}

// Конверт на самой нижней играбельной клетке колонки доставлен
Vector<Vec2I> WordBoard::DeliverParcels()
{
	Vector<Vec2I> delivered;
	for (int c = 0; c < mConfig.columns; c++)
	{
		for (int r = 0; r < mConfig.rows; r++)
		{
			auto& tile = mGrid[c][r];
			if (tile.hole)
				continue;

			if (tile.parcel)
			{
				tile = WordTile();
				delivered.Add(Vec2I(c, r));
			}
			break;
		}
	}
	return delivered;
}

bool WordBoard::HitObstacle(const Vec2I& cell, PowerupActivation& result)
{
	auto& tile = mGrid[cell.x][cell.y];
	if (tile.hole || tile.parcel)
		return true; // дыра и конверт удар не принимают

	// бонус ломает ящик целиком: доламывать взрывом второй ход — не читается
	if (tile.crate > 0)
	{
		tile.crate = 0;
		result.crateBroken.Add(cell);
		return true;
	}

	if (tile.snow)
	{
		tile.snow = false;
		result.snowMelted.Add(cell);
		return true;
	}

	return false;
}

// Раскладывает буквы слова по случайным клеткам поля — слово гарантированно
// собираемо, но не бросается в глаза, как выложенное в одну линию
void WordBoard::SeedWord(const WString& word)
{
	Vector<Vec2I> used;
	for (int i = 0; i < word.Length(); i++)
	{
		Vec2I cell(-1, -1);
		for (int attempt = 0; attempt < 60 && cell.x < 0; attempt++)
		{
			Vec2I candidate(RandomInt(mConfig.columns), RandomInt(mConfig.rows));
			if (!used.Contains(candidate))
				cell = candidate;
		}
		if (cell.x < 0)
			return;

		used.Add(cell);
		mGrid[cell.x][cell.y] = MakeTile(word.SubStr(i, i + 1));
		mSeededCells.Add(cell);
	}
}
// --- META ---

ENUM_META(WordBoard::SelectResult, WordBoard__SelectResult)
{
    ENUM_ENTRY(Added);
    ENUM_ENTRY(Blocked);
    ENUM_ENTRY(Iced);
    ENUM_ENTRY(Removed);
}
END_ENUM_META;
// --- END META ---
