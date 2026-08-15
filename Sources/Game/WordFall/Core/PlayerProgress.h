#pragma once

#include "o2/Utils/Serialization/Serializable.h"
#include "o2/Utils/Types/Containers/Vector.h"

using namespace o2;

// Прогресс игрока: текущий уровень кампании и лучшие результаты.
// Сохраняется в JSON-файл; путь задаётся сервисом
class PlayerProgress: public ISerializable
{
public:
	int currentLevel = 0;       // индекс текущего уровня кампании @SERIALIZABLE
	Vector<int> bestScores;     // лучший счёт по уровням @SERIALIZABLE

	// Отмечает уровень пройденным, двигает текущий (по кругу при финале кампании)
	void CompleteLevel(int levelIndex, int score, int levelsCount);

	// Лучший счёт уровня (0, если не проходили)
	int GetBestScore(int levelIndex) const;

	bool Save(const String& path) const;
	bool Load(const String& path);

	SERIALIZABLE(PlayerProgress);
};
// --- META ---

CLASS_BASES_META(PlayerProgress)
{
    BASE_CLASS(ISerializable);
}
END_META;
CLASS_FIELDS_META(PlayerProgress)
{
    FIELD().PUBLIC().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(0).NAME(currentLevel);
    FIELD().PUBLIC().SERIALIZABLE_ATTRIBUTE().NAME(bestScores);
}
END_META;
CLASS_METHODS_META(PlayerProgress)
{

    FUNCTION().PUBLIC().SIGNATURE(void, CompleteLevel, int, int, int);
    FUNCTION().PUBLIC().SIGNATURE(int, GetBestScore, int);
    FUNCTION().PUBLIC().SIGNATURE(bool, Save, const String&);
    FUNCTION().PUBLIC().SIGNATURE(bool, Load, const String&);
}
END_META;
// --- END META ---
