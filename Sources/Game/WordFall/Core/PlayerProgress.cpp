#include "o2/stdafx.h"
#include "PlayerProgress.h"

#include "o2/Utils/FileSystem/FileSystem.h"
#include "o2/Utils/Serialization/DataValue.h"

void PlayerProgress::CompleteLevel(int levelIndex, int score, int levelsCount)
{
	while (bestScores.Count() <= levelIndex)
		bestScores.Add(0);

	if (score > bestScores[levelIndex])
		bestScores[levelIndex] = score;

	currentLevel = levelIndex + 1;
	if (currentLevel >= levelsCount)
		currentLevel = 0;
}

int PlayerProgress::GetBestScore(int levelIndex) const
{
	return levelIndex >= 0 && levelIndex < bestScores.Count() ? bestScores[levelIndex] : 0;
}

bool PlayerProgress::Save(const String& path) const
{
	DataDocument document;
	document.Set(*this);
	return document.SaveToFile(path, DataDocument::Format::JSON);
}

bool PlayerProgress::Load(const String& path)
{
	if (!o2FileSystem.IsFileExist(path))
		return false;

	DataDocument document;
	if (!document.LoadFromFile(path, DataDocument::Format::JSON))
		return false;

	document.Get(*this);
	return true;
}
// --- META ---

DECLARE_CLASS(PlayerProgress, PlayerProgress);
// --- END META ---
