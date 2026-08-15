#pragma once

#include "o2/Utils/Math/Vector2.h"
#include "o2/Utils/Serialization/Serializable.h"
#include "o2/Utils/Types/Containers/Vector.h"

using namespace o2;

// Тип задачи уровня
enum class WordTaskType
{
	Word,      // собрать конкретное слово
	Length,    // собрать N слов из L букв
	Powerup,   // заработать N пауэрапов вида
	ClearIce,  // разбить весь лёд
	AnyWords,  // собрать N любых слов
	WordScore  // собрать слово стоимостью >= scoreThreshold
};

// Буква мешка: символ, номинал, количество в мешке
class LetterDef: public ISerializable
{
public:
	String letter;    // буква @SERIALIZABLE @EDITOR_PROPERTY
	int value = 1;    // номинал в очках @SERIALIZABLE @EDITOR_PROPERTY
	int bagCount = 1; // штук в мешке @SERIALIZABLE @EDITOR_PROPERTY

	LetterDef() = default;
	LetterDef(const String& letter, int value, int bagCount);

	bool operator==(const LetterDef& other) const;

	SERIALIZABLE(LetterDef);
};

// Задача уровня
class WordTaskConfig: public ISerializable
{
public:
	WordTaskType taskType = WordTaskType::Word; // тип задачи @SERIALIZABLE @EDITOR_PROPERTY
	String word;                            // слово (для type == Word) @SERIALIZABLE @EDITOR_PROPERTY
	int length = 4;                         // длина слов (для type == Length) @SERIALIZABLE @EDITOR_PROPERTY
	String powerupKind;                     // вид пауэрапа: bomb/rocket/wand, пусто = любой @SERIALIZABLE @EDITOR_PROPERTY
	int count = 1;                          // сколько раз выполнить @SERIALIZABLE @EDITOR_PROPERTY
	int scoreThreshold = 18;                // порог очков слова (для type == WordScore) @SERIALIZABLE @EDITOR_PROPERTY

	WordTaskConfig() = default;

	static WordTaskConfig MakeWord(const String& word);
	static WordTaskConfig MakeLength(int length, int count);
	static WordTaskConfig MakePowerup(const String& kind, int count);
	static WordTaskConfig MakeClearIce();
	static WordTaskConfig MakeAnyWords(int count);
	static WordTaskConfig MakeWordScore(int scoreThreshold);

	bool operator==(const WordTaskConfig& other) const;

	SERIALIZABLE(WordTaskConfig);
};

// Конфигурация уровня кампании
class WordLevelConfig: public ISerializable
{
public:
	int targetScore = 250;              // цель по очкам — обязательное условие @SERIALIZABLE @EDITOR_PROPERTY
	int moves = 12;                     // лимит ходов @SERIALIZABLE @EDITOR_PROPERTY
	Vector<Vec2I> iceCells;             // клетки со льдом @SERIALIZABLE @EDITOR_PROPERTY
	Vector<int> boosterCharges;         // заряды бустеров (молоток/перемешать/подсказка/джокер/удвоитель) @SERIALIZABLE @EDITOR_PROPERTY
	Vector<WordTaskConfig> tasks;       // задачи уровня (1..5) @SERIALIZABLE @EDITOR_PROPERTY

	WordLevelConfig();

	bool operator==(const WordLevelConfig& other) const;

	SERIALIZABLE(WordLevelConfig);
};

// Конфигурация поля и правил подсчёта
class WordBoardConfig: public ISerializable
{
public:
	int columns = 7;                 // колонок @SERIALIZABLE @EDITOR_PROPERTY
	int rows = 8;                    // рядов @SERIALIZABLE @EDITOR_PROPERTY
	String vowels = String("АЕИОУЫЭЮЯ"); // гласные (анти-клин) @SERIALIZABLE @EDITOR_PROPERTY
	int maxConsonantRun = 4;         // максимум согласных подряд в колонке @SERIALIZABLE @EDITOR_PROPERTY
	int bombWordLength = 5;          // длина слова для бомбы @SERIALIZABLE @EDITOR_PROPERTY
	int rocketWordLength = 6;        // длина слова для ракеты @SERIALIZABLE @EDITOR_PROPERTY
	int wandWordLength = 7;          // длина слова для палочки @SERIALIZABLE @EDITOR_PROPERTY
	Vector<LetterDef> letters;       // мешок букв @SERIALIZABLE @EDITOR_PROPERTY

	WordBoardConfig();

	bool operator==(const WordBoardConfig& other) const;

	// Мешок и номиналы русского прототипа (100 плиток, без Ъ/Ё)
	static Vector<LetterDef> DefaultRussianLetters();

	SERIALIZABLE(WordBoardConfig);
};

// Кампания по умолчанию (3 уровня прототипа)
Vector<WordLevelConfig> MakeDefaultCampaign();
// --- META ---

PRE_ENUM_META(WordTaskType);

CLASS_BASES_META(LetterDef)
{
    BASE_CLASS(ISerializable);
}
END_META;
CLASS_FIELDS_META(LetterDef)
{
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().NAME(letter);
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(1).NAME(value);
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(1).NAME(bagCount);
}
END_META;
CLASS_METHODS_META(LetterDef)
{

    FUNCTION().PUBLIC().CONSTRUCTOR();
    FUNCTION().PUBLIC().CONSTRUCTOR(const String&, int, int);
}
END_META;

CLASS_BASES_META(WordTaskConfig)
{
    BASE_CLASS(ISerializable);
}
END_META;
CLASS_FIELDS_META(WordTaskConfig)
{
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(WordTaskType::Word).NAME(taskType);
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().NAME(word);
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(4).NAME(length);
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().NAME(powerupKind);
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(1).NAME(count);
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(18).NAME(scoreThreshold);
}
END_META;
CLASS_METHODS_META(WordTaskConfig)
{

    FUNCTION().PUBLIC().CONSTRUCTOR();
    FUNCTION().PUBLIC().SIGNATURE_STATIC(WordTaskConfig, MakeWord, const String&);
    FUNCTION().PUBLIC().SIGNATURE_STATIC(WordTaskConfig, MakeLength, int, int);
    FUNCTION().PUBLIC().SIGNATURE_STATIC(WordTaskConfig, MakePowerup, const String&, int);
    FUNCTION().PUBLIC().SIGNATURE_STATIC(WordTaskConfig, MakeClearIce);
    FUNCTION().PUBLIC().SIGNATURE_STATIC(WordTaskConfig, MakeAnyWords, int);
    FUNCTION().PUBLIC().SIGNATURE_STATIC(WordTaskConfig, MakeWordScore, int);
}
END_META;

CLASS_BASES_META(WordLevelConfig)
{
    BASE_CLASS(ISerializable);
}
END_META;
CLASS_FIELDS_META(WordLevelConfig)
{
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(250).NAME(targetScore);
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(12).NAME(moves);
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().NAME(iceCells);
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().NAME(boosterCharges);
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().NAME(tasks);
}
END_META;
CLASS_METHODS_META(WordLevelConfig)
{

    FUNCTION().PUBLIC().CONSTRUCTOR();
}
END_META;

CLASS_BASES_META(WordBoardConfig)
{
    BASE_CLASS(ISerializable);
}
END_META;
CLASS_FIELDS_META(WordBoardConfig)
{
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(7).NAME(columns);
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(8).NAME(rows);
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(String("АЕИОУЫЭЮЯ")).NAME(vowels);
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(4).NAME(maxConsonantRun);
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(5).NAME(bombWordLength);
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(6).NAME(rocketWordLength);
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(7).NAME(wandWordLength);
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().NAME(letters);
}
END_META;
CLASS_METHODS_META(WordBoardConfig)
{

    FUNCTION().PUBLIC().CONSTRUCTOR();
    FUNCTION().PUBLIC().SIGNATURE_STATIC(Vector<LetterDef>, DefaultRussianLetters);
}
END_META;
// --- END META ---
