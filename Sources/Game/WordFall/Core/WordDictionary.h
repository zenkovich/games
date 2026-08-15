#pragma once

#include "o2/Utils/Types/Containers/Map.h"
#include "o2/Utils/Types/Containers/Vector.h"
#include "o2/Utils/Types/String.h"

using namespace o2;

// Словарь допустимых слов. Матчинг с джокером: '?' совпадает с любой буквой.
// Внутри — WString: кириллица в BMP, одна буква = один элемент строки
class WordDictionary
{
public:
	// Заполняет словарём русских существительных прототипа
	void LoadDefault();

	// Загружает из списка слов (UTF-8)
	void Load(const Vector<String>& words);

	bool IsEmpty() const;
	int GetWordsCount() const;

	// Есть ли слово; pattern может содержать '?'
	bool Contains(const WString& pattern) const;

	// Все слова длины length
	const Vector<WString>& GetWordsOfLength(int length) const;

	// Все слова
	const Vector<WString>& GetAllWords() const;

	static bool MatchPattern(const WString& pattern, const WString& word);

private:
	Vector<WString> mWords;
	Map<int, Vector<WString>> mByLength;
	Vector<WString> mEmpty;
};
