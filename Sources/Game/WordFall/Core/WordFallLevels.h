#pragma once

#include "WordFallConfigs.h"

using namespace o2;

class WordDictionary;

// Процедурная цепочка уровней: конфиг уровня детерминированно строится по
// индексу — цель по очкам, лимит ходов, лёд и набор заданий растут по рампе
// сложности. Первое задание — всегда точечное слово (оно же сидится на поле)
class WordFallLevels
{
public:
	// Конфиг уровня по индексу кампании (детерминирован)
	static WordLevelConfig Generate(int index, const WordDictionary& dictionary,
									const WordBoardConfig& boardConfig);

private:
	struct Rng
	{
		unsigned int seed;
		float Next01();
		int NextInt(int maxExclusive);
	};

	// Слово-задание из частых букв (низкие номиналы) — обычно обиходная лексика
	static WString PickTaskWord(int length, Rng& rng, const WordDictionary& dictionary,
								const WordBoardConfig& boardConfig);
};
