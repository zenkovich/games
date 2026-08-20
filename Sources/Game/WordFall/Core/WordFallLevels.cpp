#include "o2/stdafx.h"
#include "WordFallLevels.h"

#include "WordDictionary.h"
#include "o2/Utils/Math/Math.h"

float WordFallLevels::Rng::Next01()
{
	seed = seed*1664525u + 1013904223u;
	return (float)((double)seed/4294967296.0);
}

int WordFallLevels::Rng::NextInt(int maxExclusive)
{
	return Math::Min((int)(Next01()*(float)maxExclusive), maxExclusive - 1);
}

WString WordFallLevels::PickTaskWord(int length, Rng& rng, const WordDictionary& dictionary,
									 const WordBoardConfig& boardConfig)
{
	auto& bucket = dictionary.GetWordsOfLength(length);
	if (bucket.IsEmpty())
		return WString();

	auto letterValue = [&](wchar_t letter)
	{
		wchar_t buffer[2] = { letter, 0 };
		String utf8 = String(WString(buffer));
		for (auto& def : boardConfig.letters)
		{
			if (def.letter == utf8)
				return def.value;
		}
		return 5;
	};

	for (int attempt = 0; attempt < 30; attempt++)
	{
		auto& word = bucket[rng.NextInt(bucket.Count())];
		bool rare = false;
		for (int i = 0; i < word.Length(); i++)
		{
			if (letterValue(word[i]) > 3)
				rare = true;
		}
		if (!rare)
			return word;
	}
	return bucket[rng.NextInt(bucket.Count())];
}

WordLevelConfig WordFallLevels::Generate(int index, const WordDictionary& dictionary,
										 const WordBoardConfig& boardConfig)
{
	Rng rng{ (unsigned int)(977 + index*7919) };

	WordLevelConfig config;

	int tier = index/10;
	config.moves = 12 + Math::Min(4, index/25);
	config.targetScore = 250 + tier*50 + rng.NextInt(30);
	config.boosterCharges = { 3, 3, 30, 3, 3 };

	int iceCount = Math::Min(3 + index/12, 10);
	Vector<Vec2I> usedCells;
	int guard = 0;
	while (config.iceCells.Count() < iceCount && guard++ < 300)
	{
		Vec2I cell(rng.NextInt(boardConfig.columns), rng.NextInt(boardConfig.rows));
		if (usedCells.Contains(cell))
			continue;
		usedCells.Add(cell);
		config.iceCells.Add(cell);
	}

	// камни появляются с пятого уровня, медленно нарастая
	int stoneCount = index >= 4 ? Math::Min(1 + (index - 4)/10, 4) : 0;
	while (config.stoneCells.Count() < stoneCount && guard++ < 600)
	{
		Vec2I cell(rng.NextInt(boardConfig.columns), rng.NextInt(boardConfig.rows));
		if (usedCells.Contains(cell))
			continue;
		usedCells.Add(cell);
		config.stoneCells.Add(cell);
	}

	// обязательное слово-задание (оно же сидится на поле)
	config.tasks.Add(WordTaskConfig::MakeWord(String(PickTaskWord(3 + rng.NextInt(3), rng, dictionary, boardConfig))));

	Vector<String> pool = { "length", "anyWords", "wordScore", "powerup", "clearIce", "word2" };
	for (int i = pool.Count() - 1; i > 0; i--)
	{
		int j = rng.NextInt(i + 1);
		auto tmp = pool[i];
		pool[i] = pool[j];
		pool[j] = tmp;
	}

	int extraCount = 2 + rng.NextInt(Math::Min(3, 1 + index/15));
	for (int i = 0; i < extraCount && i < pool.Count(); i++)
	{
		auto& kind = pool[i];
		if (kind == "length")
			config.tasks.Add(WordTaskConfig::MakeLength(4 + rng.NextInt(2), 1 + rng.NextInt(2)));
		else if (kind == "anyWords")
			config.tasks.Add(WordTaskConfig::MakeAnyWords(4 + rng.NextInt(4)));
		else if (kind == "wordScore")
			config.tasks.Add(WordTaskConfig::MakeWordScore(18 + tier*2 + rng.NextInt(8)));
		else if (kind == "powerup")
		{
			Vector<String> kinds = index < 10 ? Vector<String>{ "bomb" }
							 : index < 25 ? Vector<String>{ "bomb", "rocket" }
							 : Vector<String>{ "bomb", "rocket", "fireworks" };
			config.tasks.Add(WordTaskConfig::MakePowerup(kinds[rng.NextInt(kinds.Count())], 1));
		}
		else if (kind == "clearIce")
			config.tasks.Add(WordTaskConfig::MakeClearIce());
		else
			config.tasks.Add(WordTaskConfig::MakeWord(String(PickTaskWord(4 + rng.NextInt(2), rng, dictionary, boardConfig))));
	}

	// «разбить весь лёд» при 8-10 льдинах невыполнимо за лимит ходов
	bool hasClearIce = config.tasks.Contains([](const WordTaskConfig& t) {
		return t.taskType == WordTaskType::ClearIce; });
	if (hasClearIce && config.iceCells.Count() > 6)
		config.iceCells.Resize(6);

	return config;
}
