#include "o2/stdafx.h"
#include "WordFallConfigs.h"

LetterDef::LetterDef(const String& letter, int value, int bagCount):
	letter(letter), value(value), bagCount(bagCount)
{}

bool LetterDef::operator==(const LetterDef& other) const
{
	return letter == other.letter && value == other.value && bagCount == other.bagCount;
}

WordTaskConfig WordTaskConfig::MakeWord(const String& word)
{
	WordTaskConfig res;
	res.taskType = WordTaskType::Word;
	res.word = word;
	return res;
}

WordTaskConfig WordTaskConfig::MakeLength(int length, int count)
{
	WordTaskConfig res;
	res.taskType = WordTaskType::Length;
	res.length = length;
	res.count = count;
	return res;
}

WordTaskConfig WordTaskConfig::MakePowerup(const String& kind, int count)
{
	WordTaskConfig res;
	res.taskType = WordTaskType::Powerup;
	res.powerupKind = kind;
	res.count = count;
	return res;
}

WordTaskConfig WordTaskConfig::MakeClearIce()
{
	WordTaskConfig res;
	res.taskType = WordTaskType::ClearIce;
	return res;
}

WordTaskConfig WordTaskConfig::MakeAnyWords(int count)
{
	WordTaskConfig res;
	res.taskType = WordTaskType::AnyWords;
	res.count = count;
	return res;
}

WordTaskConfig WordTaskConfig::MakeWordScore(int scoreThreshold)
{
	WordTaskConfig res;
	res.taskType = WordTaskType::WordScore;
	res.scoreThreshold = scoreThreshold;
	return res;
}

bool WordTaskConfig::operator==(const WordTaskConfig& other) const
{
	return taskType == other.taskType && word == other.word && length == other.length &&
		powerupKind == other.powerupKind && count == other.count &&
		scoreThreshold == other.scoreThreshold;
}

WordLevelConfig::WordLevelConfig()
{
	boosterCharges = { 3, 3, 3, 3, 3 };
}

bool WordLevelConfig::operator==(const WordLevelConfig& other) const
{
	return targetScore == other.targetScore && moves == other.moves && iceCells == other.iceCells &&
		boosterCharges == other.boosterCharges && tasks == other.tasks;
}

WordBoardConfig::WordBoardConfig()
{
	letters = DefaultRussianLetters();
}

bool WordBoardConfig::operator==(const WordBoardConfig& other) const
{
	return columns == other.columns && rows == other.rows && vowels == other.vowels &&
		maxConsonantRun == other.maxConsonantRun && bombWordLength == other.bombWordLength &&
		rocketWordLength == other.rocketWordLength && fireworksWordLength == other.fireworksWordLength &&
		letters == other.letters;
}

Vector<LetterDef> WordBoardConfig::DefaultRussianLetters()
{
	return {
		{ "О", 1, 9 }, { "А", 1, 8 }, { "Е", 1, 8 }, { "И", 1, 7 }, { "Н", 1, 6 }, { "Т", 1, 6 },
		{ "С", 2, 5 }, { "Р", 2, 5 }, { "В", 2, 4 }, { "Л", 2, 4 }, { "К", 2, 4 },
		{ "М", 3, 3 }, { "Д", 3, 3 }, { "П", 3, 3 }, { "У", 3, 3 },
		{ "Я", 4, 2 }, { "Ы", 4, 2 }, { "Ь", 4, 2 }, { "Г", 4, 2 }, { "З", 4, 2 }, { "Б", 4, 2 },
		{ "Ч", 5, 1 }, { "Й", 5, 1 }, { "Х", 5, 1 }, { "Ж", 5, 1 }, { "Ш", 5, 1 },
		{ "Ю", 5, 1 }, { "Ц", 5, 1 }, { "Щ", 5, 1 }, { "Э", 5, 1 }, { "Ф", 5, 1 }
	};
}

Vector<WordLevelConfig> MakeDefaultCampaign()
{
	Vector<WordLevelConfig> levels;

	WordLevelConfig level1;
	level1.targetScore = 250;
	level1.moves = 12;
	level1.iceCells = { Vec2I(1, 6), Vec2I(5, 2), Vec2I(4, 7), Vec2I(0, 1) };
	level1.tasks = { WordTaskConfig::MakeWord("КОТ"), WordTaskConfig::MakeLength(4, 2),
					 WordTaskConfig::MakeClearIce() };
	levels.Add(level1);

	WordLevelConfig level2;
	level2.targetScore = 350;
	level2.moves = 12;
	level2.iceCells = { Vec2I(0, 5), Vec2I(2, 6), Vec2I(4, 6), Vec2I(6, 5), Vec2I(3, 3), Vec2I(5, 2) };
	level2.tasks = { WordTaskConfig::MakeWord("ЧАШКА"), WordTaskConfig::MakeLength(4, 2),
					 WordTaskConfig::MakePowerup("bomb", 1) };
	levels.Add(level2);

	WordLevelConfig level3;
	level3.targetScore = 500;
	level3.moves = 14;
	level3.iceCells = { Vec2I(0, 6), Vec2I(1, 5), Vec2I(2, 7), Vec2I(3, 4), Vec2I(4, 7),
						Vec2I(5, 5), Vec2I(6, 6), Vec2I(3, 2) };
	level3.tasks = { WordTaskConfig::MakeWord("РАКЕТА"), WordTaskConfig::MakeLength(5, 1),
					 WordTaskConfig::MakePowerup("rocket", 1), WordTaskConfig::MakeClearIce() };
	levels.Add(level3);

	return levels;
}
// --- META ---

ENUM_META(WordTaskType, WordTaskType)
{
    ENUM_ENTRY(AnyWords);
    ENUM_ENTRY(ClearIce);
    ENUM_ENTRY(Length);
    ENUM_ENTRY(Powerup);
    ENUM_ENTRY(Word);
    ENUM_ENTRY(WordScore);
}
END_ENUM_META;

DECLARE_CLASS(LetterDef, LetterDef);

DECLARE_CLASS(WordTaskConfig, WordTaskConfig);

DECLARE_CLASS(WordLevelConfig, WordLevelConfig);

DECLARE_CLASS(WordBoardConfig, WordBoardConfig);
// --- END META ---
