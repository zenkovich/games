// Прогресс игрока: текущий уровень кампании, лучшие результаты, показанные туториалы, язык.
// Хранится JSON-файлом; путь задаёт сервис
PlayerProgress = class PlayerProgress
{
    constructor()
    {
        this.currentLevel = 0;
        this.bestScores = [];
        this.seenTutorials = [];
        this.language = "";       // код языка из настроек игрока; пусто — язык по умолчанию
    }

    IsTutorialSeen(key)
    {
        return this.seenTutorials.indexOf(key) >= 0;
    }

    MarkTutorialSeen(key)
    {
        if (!this.IsTutorialSeen(key))
            this.seenTutorials.push(key);
    }

    // Отмечает уровень пройденным, двигает текущий (по кругу после финала кампании)
    CompleteLevel(levelIndex, score, levelsCount)
    {
        while (this.bestScores.length <= levelIndex)
            this.bestScores.push(0);

        if (score > this.bestScores[levelIndex])
            this.bestScores[levelIndex] = score;

        this.currentLevel = levelIndex + 1;
        if (this.currentLevel >= levelsCount)
            this.currentLevel = 0;
    }

    GetBestScore(levelIndex)
    {
        return levelIndex >= 0 && levelIndex < this.bestScores.length ? this.bestScores[levelIndex] : 0;
    }

    Save(path)
    {
        var data = { currentLevel: this.currentLevel, bestScores: this.bestScores, seenTutorials: this.seenTutorials, language: this.language };
        return o2.FileSystem.WriteFile(path, JSON.stringify(data, null, 4));
    }

    Load(path)
    {
        var text = o2.FileSystem.ReadFile(path);
        if (text === undefined)
            return false;

        try
        {
            var data = JSON.parse(text);
            this.currentLevel = data.currentLevel || 0;
            this.bestScores = Array.isArray(data.bestScores) ? data.bestScores : [];
            this.seenTutorials = Array.isArray(data.seenTutorials) ? data.seenTutorials : [];
            this.language = typeof data.language == "string" ? data.language : "";
            return true;
        }
        catch (e)
        {
            print("WordFall: broken progress file " + path + ": " + e);
            return false;
        }
    }
};
