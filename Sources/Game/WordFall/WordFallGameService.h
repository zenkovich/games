#pragma once

#include "Core/PlayerProgress.h"
#include "Core/WordDictionary.h"
#include "Core/WordFallConfigs.h"
#include "Core/WordBoardMotion.h"
#include "Core/WordLevel.h"
#include "o2/Scene/Component.h"
#include "o2/Scripts/ScriptValue.h"

using namespace o2;

// Сервисная нода игры: владеет ядром (поле, уровень, прогресс, словарь) и
// отдаёт его JS-вьюхам через SCRIPTABLE API. Живёт на акторе GameService в
// bootstrap-сцене — конфигурация кампании и поля видна и редактируется в
// редакторе. Данные не знают об отображении
class WordFallGameService: public Component
{
public:
	WordBoardConfig boardConfig;            // конфиг поля и мешка @SERIALIZABLE @EDITOR_PROPERTY
	int campaignLength = 100;               // длина процедурной кампании @SERIALIZABLE @EDITOR_PROPERTY
	Vector<WordLevelConfig> levels;         // ручная кампания; пусто — процедурная генерация @SERIALIZABLE @EDITOR_PROPERTY
	int randomSeed = 0;                     // сид (0 — случайный) @SERIALIZABLE @EDITOR_PROPERTY
	String progressPath = String("wordfall_progress.json"); // файл сохранения прогресса @SERIALIZABLE @EDITOR_PROPERTY

	WordFallGameService();

	// --- уровень и прогресс ---

	// Стартует уровень кампании по индексу @SCRIPTABLE
	void StartLevel(int index);

	// Рестарт текущего уровня @SCRIPTABLE
	void RestartLevel();

	// Победа подтверждена вью: двигает прогресс, сохраняет, стартует следующий @SCRIPTABLE
	void AdvanceToNextLevel();

	// Индекс текущего уровня (0-based) @SCRIPTABLE
	int GetLevelIndex() const;

	// Число уровней кампании @SCRIPTABLE
	int GetLevelCount() const;

	// --- состояние для вью ---

	// Число колонок @SCRIPTABLE
	int GetColumns() const;

	// Число рядов @SCRIPTABLE
	int GetRows() const;

	// Плитка: {letter, value, ice, stone, doubled, joker, powerup} @SCRIPTABLE
	ScriptValue GetTile(int column, int row);

	// Выбор: [{c, r}] @SCRIPTABLE
	ScriptValue GetSelection();

	// Задачи: [{type, word, length, kind, count, progress, done}] @SCRIPTABLE
	ScriptValue GetTasks();

	// Очки уровня @SCRIPTABLE
	int GetScore() const;

	// Цель по очкам @SCRIPTABLE
	int GetTargetScore() const;

	// Осталось ходов @SCRIPTABLE
	int GetMovesLeft() const;

	// Состояние: playing | won | lost @SCRIPTABLE
	String GetGameState() const;

	// Заряды бустера по индексу @SCRIPTABLE
	int GetBoosterCharges(int booster) const;

	// Текущее слово (паттерн с '?') @SCRIPTABLE
	String GetCurrentWord() const;

	// Валидно ли текущее слово @SCRIPTABLE
	bool IsCurrentWordValid() const;

	// Ревизия состояния: растёт при каждой мутации — вьюхи синкаются по ней @SCRIPTABLE
	int GetRevision() const;

	// --- модель движения плиток при обвале: вью только читает её состояние ---

	// Запускает анимацию обвала по последнему ходу @SCRIPTABLE
	void StartCollapseAnimation();

	// Идёт ли анимация обвала @SCRIPTABLE
	bool IsCollapseAnimating();

	// Вертикальный офсет плитки в клетках (0 — на месте) @SCRIPTABLE
	float GetTileFallOffset(int column, int row);

	// Плитка ещё за верхней границей поля — вью её прячет @SCRIPTABLE
	bool IsTileFallHidden(int column, int row);

	// Мгновенно доставляет плитки на места @SCRIPTABLE
	void FinishCollapseAnimation();

	// Результат последнего принятого слова/молотка — для анимаций @SCRIPTABLE
	ScriptValue GetLastMove();

	// --- действия игрока ---

	// Клик по плитке: added | removed | iced | blocked @SCRIPTABLE
	String ToggleSelect(int column, int row);

	// Сброс выбора @SCRIPTABLE
	void ClearSelection();

	// Принятие слова; результат для анимаций вью (см. WordMoveResult) @SCRIPTABLE
	ScriptValue AcceptWord();

	// Бустеры @SCRIPTABLE
	ScriptValue UseHammer(int column, int row);

	// @SCRIPTABLE
	bool UseShuffle();

	// @SCRIPTABLE
	bool UseHint();

	// @SCRIPTABLE
	bool UseJoker(int column, int row);

	// @SCRIPTABLE
	bool UseDoubler(int column, int row);

	// --- отладка и тесты ---

	// @SCRIPTABLE
	void DebugSetTile(int column, int row, const String& letter);

	// @SCRIPTABLE
	void DebugSetPowerup(int column, int row, const String& kind);

	// @SCRIPTABLE
	void DebugSetStone(int column, int row);

	// @SCRIPTABLE
	void DebugSetTargetScore(int target);

	// @SCRIPTABLE
	void DebugCompleteTasks();

	// Последний результат хода для C++ тестов
	const WordMoveResult& GetLastMoveResult() const { return mLastMove; }

	float fallSpeedCells = 9.5f;   // скорость падения, клеток/с @SERIALIZABLE @EDITOR_PROPERTY
	float fallCascadeDelay = 0.05f; // пауза стартов плиток колонки @SERIALIZABLE @EDITOR_PROPERTY

	// Прямой доступ к ядру для C++ тестов
	WordLevel& GetLevel();
	const WordDictionary& GetDictionary() const;
	PlayerProgress& GetProgress();

	SERIALIZABLE(WordFallGameService);
	CLONEABLE_REF(WordFallGameService);

private:
	WordDictionary mDictionary;
	WordLevel mLevel;
	PlayerProgress mProgress;
	int mLevelIndex = 0;
	bool mStarted = false;
	int mRevision = 0;
	WordMoveResult mLastMove;
	WordBoardMotion mMotion; // модель падения плиток: офсеты, каскад, видимость

	void OnStart() override;
	void OnUpdate(float dt) override;

	void EnsureStarted();
	ScriptValue MoveResultToScript(const WordMoveResult& result) const;
	static ScriptValue CellsToScript(const Vector<Vec2I>& cells);

	REF_COUNTERABLE_IMPL(Component);
};
// --- META ---

CLASS_BASES_META(WordFallGameService)
{
    BASE_CLASS(Component);
}
END_META;
CLASS_FIELDS_META(WordFallGameService)
{
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().NAME(boardConfig);
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(100).NAME(campaignLength);
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().NAME(levels);
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(0).NAME(randomSeed);
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(String("wordfall_progress.json")).NAME(progressPath);
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(9.5f).NAME(fallSpeedCells);
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(0.05f).NAME(fallCascadeDelay);
    FIELD().PRIVATE().NAME(mDictionary);
    FIELD().PRIVATE().NAME(mLevel);
    FIELD().PRIVATE().NAME(mProgress);
    FIELD().PRIVATE().DEFAULT_VALUE(0).NAME(mLevelIndex);
    FIELD().PRIVATE().DEFAULT_VALUE(false).NAME(mStarted);
    FIELD().PRIVATE().DEFAULT_VALUE(0).NAME(mRevision);
    FIELD().PRIVATE().NAME(mLastMove);
    FIELD().PRIVATE().NAME(mMotion);
}
END_META;
CLASS_METHODS_META(WordFallGameService)
{

    FUNCTION().PUBLIC().CONSTRUCTOR();
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(void, StartLevel, int);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(void, RestartLevel);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(void, AdvanceToNextLevel);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(int, GetLevelIndex);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(int, GetLevelCount);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(int, GetColumns);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(int, GetRows);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(ScriptValue, GetTile, int, int);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(ScriptValue, GetSelection);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(ScriptValue, GetTasks);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(int, GetScore);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(int, GetTargetScore);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(int, GetMovesLeft);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(String, GetGameState);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(int, GetBoosterCharges, int);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(String, GetCurrentWord);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(bool, IsCurrentWordValid);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(int, GetRevision);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(void, StartCollapseAnimation);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(bool, IsCollapseAnimating);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(float, GetTileFallOffset, int, int);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(bool, IsTileFallHidden, int, int);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(void, FinishCollapseAnimation);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(ScriptValue, GetLastMove);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(String, ToggleSelect, int, int);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(void, ClearSelection);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(ScriptValue, AcceptWord);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(ScriptValue, UseHammer, int, int);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(bool, UseShuffle);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(bool, UseHint);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(bool, UseJoker, int, int);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(bool, UseDoubler, int, int);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(void, DebugSetTile, int, int, const String&);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(void, DebugSetPowerup, int, int, const String&);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(void, DebugSetStone, int, int);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(void, DebugSetTargetScore, int);
    FUNCTION().PUBLIC().SCRIPTABLE_ATTRIBUTE().SIGNATURE(void, DebugCompleteTasks);
    FUNCTION().PUBLIC().SIGNATURE(const WordMoveResult&, GetLastMoveResult);
    FUNCTION().PUBLIC().SIGNATURE(WordLevel&, GetLevel);
    FUNCTION().PUBLIC().SIGNATURE(const WordDictionary&, GetDictionary);
    FUNCTION().PUBLIC().SIGNATURE(PlayerProgress&, GetProgress);
    FUNCTION().PRIVATE().SIGNATURE(void, OnStart);
    FUNCTION().PRIVATE().SIGNATURE(void, OnUpdate, float);
    FUNCTION().PRIVATE().SIGNATURE(void, EnsureStarted);
    FUNCTION().PRIVATE().SIGNATURE(ScriptValue, MoveResultToScript, const WordMoveResult&);
    FUNCTION().PRIVATE().SIGNATURE_STATIC(ScriptValue, CellsToScript, const Vector<Vec2I>&);
}
END_META;
// --- END META ---
