// Прогресс игрока: текущий уровень кампании, лучшие результаты и звёзды, показанные туториалы, язык,
// монеты, жизни, бустеры, бонусы на старт уровня и настройки. Хранится JSON-файлом; путь задаёт сервис
PlayerProgress = class PlayerProgress
{
    constructor()
    {
        this.currentLevel = 0;
        this.bestScores = [];
        this.seenTutorials = [];
        this.language = "";       // код языка из настроек игрока; пусто — язык по умолчанию
        this.stars = [];          // лучшие звёзды по уровням
        this.coins = -1;          // монеты; -1 — новый игрок, стартовый запас даёт сервис
        this.lives = -1;          // жизни; -1 — полный запас
        this.livesAt = 0;         // время (мс) последнего восстановления жизни, 0 — запас полон
        this.boosters = null;     // заряды бустеров по индексам WordLevel, общие на всю игру; null — новый игрок
        this.bonuses = null;      // бонусы на старт уровня: бомба, ракета, салют; null — новый игрок
        this.settings = {};       // настройки игрока: sound, music (true — включено)
    }

    // Бонусы на старт уровня: три неотрицательных целых; новому игроку — start
    EnsureBonuses(start)
    {
        if (!Array.isArray(this.bonuses))
            this.bonuses = (start || []).slice();
        for (var i = 0; i < 3; i++)
            this.bonuses[i] = Math.max(0, Math.floor(this.bonuses[i] || 0));
        this.bonuses.length = 3;
        return this.bonuses;
    }

    // Запас бустеров: пять неотрицательных целых; новому игроку — start
    EnsureBoosters(start)
    {
        if (!Array.isArray(this.boosters))
            this.boosters = (start || []).slice();
        for (var i = 0; i < 5; i++)
            this.boosters[i] = Math.max(0, Math.floor(this.boosters[i] || 0));
        this.boosters.length = 5;
        return this.boosters;
    }

    SetStars(levelIndex, stars)
    {
        while (this.stars.length <= levelIndex)
            this.stars.push(0);
        this.stars[levelIndex] = Math.max(this.stars[levelIndex], stars);
    }

    TotalStars()
    {
        var total = 0;
        for (var i = 0; i < this.stars.length; i++)
            total += this.stars[i] || 0;
        return total;
    }

    // Жизни копятся по одной за regenSeconds до max; now — Date.now()
    RegenLives(max, regenSeconds, now)
    {
        if (this.lives < 0 || this.lives >= max)
        {
            this.lives = max;
            this.livesAt = 0;
            return;
        }
        if (this.livesAt <= 0)
            this.livesAt = now;
        var gained = Math.floor((now - this.livesAt)/(regenSeconds*1000));
        if (gained <= 0)
            return;
        this.lives = Math.min(max, this.lives + gained);
        this.livesAt = this.lives >= max ? 0 : this.livesAt + gained*regenSeconds*1000;
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
        var data = { currentLevel: this.currentLevel, bestScores: this.bestScores, seenTutorials: this.seenTutorials, language: this.language,
                     stars: this.stars, coins: this.coins, lives: this.lives, livesAt: this.livesAt, boosters: this.boosters,
                     bonuses: this.bonuses, settings: this.settings };
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
            this.stars = Array.isArray(data.stars) ? data.stars : [];
            this.coins = typeof data.coins == "number" ? data.coins : -1;
            this.lives = typeof data.lives == "number" ? data.lives : -1;
            this.livesAt = typeof data.livesAt == "number" ? data.livesAt : 0;
            this.boosters = Array.isArray(data.boosters) ? data.boosters : null;
            this.bonuses = Array.isArray(data.bonuses) ? data.bonuses : null;
            this.settings = data.settings && typeof data.settings == "object" ? data.settings : {};
            return true;
        }
        catch (e)
        {
            print("WordFall: broken progress file " + path + ": " + e);
            return false;
        }
    }
};
