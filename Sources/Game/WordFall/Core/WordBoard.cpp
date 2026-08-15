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

void WordBoard::Fill(const Vector<Vec2I>& iceCells, const WString& seededWord)
{
	mSelection.Clear();
	mSeededCells.Clear();
	RefillBag();

	mGrid.Clear();
	for (int c = 0; c < mConfig.columns; c++)
	{
		Vector<WordTile> column;
		for (int r = 0; r < mConfig.rows; r++)
			column.Add(WordTile());
		mGrid.Add(column);
	}

	for (int c = 0; c < mConfig.columns; c++)
	{
		for (int r = 0; r < mConfig.rows; r++)
			mGrid[c][r] = MakeTile(DrawLetter(NeedVowelAt(c, r)));
	}

	if (!seededWord.IsEmpty())
		SeedWord(seededWord);

	for (auto& cell : iceCells)
	{
		if (IsValidCell(cell) && !mSeededCells.Contains(cell))
			mGrid[cell.x][cell.y].ice = 1;
	}
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
	if (mGrid[cell.x][cell.y].ice > 0)
		return SelectResult::Iced;

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
	result.iceBroken = DamageIceAround(cells, destroyed) + powerups.iceBroken;
	result.burned = destroyed;

	CollapseAndSpawn(destroyed, result.moved, result.spawned);

	// длинное слово — пауэрап на плитке, занявшей клетку последней буквы
	result.powerupEarned = PowerupForLength(cells.Count());
	if (!result.powerupEarned.IsEmpty())
	{
		auto last = cells.Last();
		mGrid[last.x][last.y].powerup = WString(result.powerupEarned);
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
	result.burned.Add(cell);
	CollapseAndSpawn({ cell }, result.moved, result.spawned);
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
			if (mGrid[c][r].ice == 0)
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
	if (tile.ice > 0 || tile.joker)
		return false;

	tile.joker = true;
	tile.value = 0;
	return true;
}

bool WordBoard::MakeDoubled(const Vec2I& cell)
{
	auto& tile = mGrid[cell.x][cell.y];
	if (tile.ice > 0 || tile.joker || tile.doubled)
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
			if (tile.ice > 0)
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
	struct PoolTile { Vec2I cell; wchar_t letter; int value; bool joker; };
	Vector<PoolTile> pool;
	for (int c = 0; c < mConfig.columns; c++)
	{
		for (int r = 0; r < mConfig.rows; r++)
		{
			auto& tile = mGrid[c][r];
			if (tile.ice == 0 && !tile.letter.IsEmpty())
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

		float value = (float)sum*LengthMultiplier(word.Length());
		if (value > outValue)
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
			if (tile.ice == 0 && !tile.joker && !tile.letter.IsEmpty())
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
				if (tile.ice > 0 || !tile.powerup.IsEmpty() || repaired.Contains(candidate))
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
	mGrid[cell.x][cell.y] = MakeTile(letter);
}

void WordBoard::DebugSetPowerup(const Vec2I& cell, const String& kind)
{
	mGrid[cell.x][cell.y].powerup = WString(kind);
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
	if (length >= mConfig.wandWordLength)
		return "wand";
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

	for (auto& cell : cells)
	{
		WString kind = mGrid[cell.x][cell.y].powerup;
		if (kind.IsEmpty())
			continue;

		result.used.Add({ String(kind), cell });

		if (kind == WString("bomb"))
		{
			// уничтожает 3×3, очки взорванных букв — в счёт
			for (int dc = -1; dc <= 1; dc++)
			{
				for (int dr = -1; dr <= 1; dr++)
				{
					Vec2I target(cell.x + dc, cell.y + dr);
					if (!IsValidCell(target) || destroyedKeys.Contains(target))
						continue;

					destroyedKeys.Add(target);
					auto& tile = mGrid[target.x][target.y];
					result.extraScore += TileValue(tile);
					if (tile.ice > 0)
						result.iceBroken.Add(target);
					result.destroyed.Add(target);
				}
			}
		}
		else if (kind == WString("rocket"))
		{
			// крест: задетые буквы активируются, но остаются на поле
			for (int c = 0; c < mConfig.columns; c++)
				ActivateTile(Vec2I(c, cell.y), destroyedKeys, result);
			for (int r = 0; r < mConfig.rows; r++)
				ActivateTile(Vec2I(cell.x, r), destroyedKeys, result);
		}
		else if (kind == WString("wand"))
		{
			// активирует все такие же буквы по всему полю
			WString letter = mGrid[cell.x][cell.y].letter;
			for (int c = 0; c < mConfig.columns; c++)
			{
				for (int r = 0; r < mConfig.rows; r++)
				{
					auto& tile = mGrid[c][r];
					if (tile.letter == letter && !tile.joker)
						ActivateTile(Vec2I(c, r), destroyedKeys, result);
				}
			}
		}
	}
	return result;
}

void WordBoard::ActivateTile(const Vec2I& cell, Vector<Vec2I>& destroyedKeys, PowerupActivation& result)
{
	if (destroyedKeys.Contains(cell) || result.activated.Contains(cell))
		return;

	auto& tile = mGrid[cell.x][cell.y];
	result.extraScore += TileValue(tile);
	if (tile.ice > 0)
	{
		tile.ice = 0;
		result.iceBroken.Add(cell);
	}
	result.activated.Add(cell);
}

Vector<Vec2I> WordBoard::DamageIceAround(const Vector<Vec2I>& cells, const Vector<Vec2I>& skipCells)
{
	Vector<Vec2I> broken;
	for (auto& cell : cells)
	{
		for (int dc = -1; dc <= 1; dc++)
		{
			for (int dr = -1; dr <= 1; dr++)
			{
				Vec2I target(cell.x + dc, cell.y + dr);
				if (!IsValidCell(target) || skipCells.Contains(target) || broken.Contains(target))
					continue;

				auto& tile = mGrid[target.x][target.y];
				if (tile.ice > 0)
				{
					tile.ice--;
					if (tile.ice == 0)
						broken.Add(target);
				}
			}
		}
	}
	return broken;
}

void WordBoard::CollapseAndSpawn(const Vector<Vec2I>& removed, Vector<WordTileMove>& moved, Vector<Vec2I>& spawned)
{
	for (auto& cell : removed)
		mGrid[cell.x][cell.y].letter.Clear();

	for (int c = 0; c < mConfig.columns; c++)
	{
		Vector<WordTile> stack;
		Vector<int> fromRows;
		for (int r = 0; r < mConfig.rows; r++)
		{
			if (!mGrid[c][r].letter.IsEmpty())
			{
				stack.Add(mGrid[c][r]);
				fromRows.Add(r);
			}
		}

		for (int r = 0; r < mConfig.rows; r++)
		{
			if (r < stack.Count())
			{
				mGrid[c][r] = stack[r];
				if (fromRows[r] != r)
					moved.Add({ c, fromRows[r], r });
			}
			else
			{
				mGrid[c][r] = MakeTile(DrawLetter(NeedVowelAt(c, r)));
				spawned.Add(Vec2I(c, r));
			}
		}
	}
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
    ENUM_ENTRY(Iced);
    ENUM_ENTRY(Removed);
}
END_ENUM_META;
// --- END META ---
