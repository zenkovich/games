#pragma once

// Общая обвязка UI-тестов Word Fall: сцена WordFall.scn, как в игре, клики в мировых
// координатах, C++-вид JS-сервиса игры (WordFallGame.service) с его именами методов

#include <gtest/gtest.h>

#include "o2/Application/Application.h"
#include "o2/Assets/Assets.h"
#include "o2/Assets/Types/SceneAsset.h"
#include "o2/Scene/Actor.h"
#include "o2/Scene/Components/AnimationComponent.h"
#include "o2/Scene/Components/FlightTrajectoryComponent.h"
#include "o2/Scene/Components/ParticlesEmitterComponent.h"
#include "o2/Scene/Scene.h"
#include "o2/Render/Render.h"
#include "o2/Scene/UI/Widgets/Button.h"
#include "o2/Scene/UI/Widget.h"
#include "o2/Scene/UI/WidgetLayer.h"
#include "o2/Scene/UI/WidgetLayout.h"
#include "o2/Scene/UI/Widgets/HorizontalProgress.h"
#include "o2/Scene/UI/Widgets/Label.h"
#include "o2/Scripts/ScriptEngine.h"
#include "o2/Scripts/ScriptValue.h"
#include "o2/Utils/FileSystem/FileSystem.h"
#include "o2/Utils/Serialization/DataValue.h"
#include "o2/Utils/Test/AppTestDriver.h"

using namespace o2;

// Плитка поля, как её отдаёт WordFallGame.service.GetTile
struct WordTile
{
	WString letter;
	WString powerup;
	int value = 0;
	int ice = 0;
	int stone = 0;
	int crate = 0;
	bool joker = false;
	bool doubled = false;
	bool hole = false;
	bool chained = false;
	bool snow = false;
	bool parcel = false;
};

// Результат хода, как его отдаёт WordFallGame.service.GetLastMove
struct WordFallMove
{
	struct PowerupUse
	{
		String kind;
		Vec2I cell;
		Vector<Vec2I> targets;
	};

	bool ok = false;
	String reason;
	String word;
	String powerupEarned;
	int gain = 0;
	int wordScore = 0;
	int extraScore = 0;
	Vector<Vec2I> burned;
	Vector<Vec2I> destroyed;
	Vector<Vec2I> activated;
	Vector<Vec2I> iceBroken;
	Vector<Vec2I> spawned;
	Vector<Vec2I> crateHit;
	Vector<Vec2I> crateBroken;
	Vector<Vec2I> snowMelted;
	Vector<Vec2I> delivered;
	Vector<PowerupUse> powerupsUsed;
};

class WordFallJsService;

// Поле уровня через сервис
class WordFallJsBoard
{
public:
	explicit WordFallJsBoard(WordFallJsService& service): mService(service) {}

	int GetColumns() const { return 7; }
	int GetRows() const { return 8; }
	bool IsHole(const Vec2I& cell) const { return GetTile(cell).hole; }

	const WordTile& GetTile(const Vec2I& cell) const;
	Vector<Vec2I> GetSelection() const;
	Vector<Vec2I> GetSeededCells() const;

private:
	WordFallJsService& mService;
	mutable WordTile   mTile;
};

// C++-вид JS-сервиса игры: те же имена, что вьюхи и тесты зовут у WordFallGame.service
class WordFallJsService
{
public:
	WordFallJsService(): mBoard(*this) {}

	static ScriptValue Object() { return o2Scripts.GetGlobal().GetProperty("WordFallGame").GetProperty("service"); }

	ScriptValue Call(const char* method, const Vector<ScriptValue>& args = {}) const
	{
		auto service = Object();
		auto result = service.GetProperty(method).InvokeRaw(service, args);
		EXPECT_NE(result.GetValueType(), ScriptValue::ValueType::Error) << method << ": " << result.GetError().Data();
		return result;
	}

	void Set(const char* field, const ScriptValue& value) { Object().SetProperty(field, value); }

	void StartLevel(int index) { Call("StartLevel", { ScriptValue(index) }); }
	void RestartLevel() { Call("RestartLevel"); }
	int GetLevelIndex() const { return Call("GetLevelIndex").GetValue<int>(); }
	int GetLevelCount() const { return Call("GetLevelCount").GetValue<int>(); }
	int GetScore() const { return Call("GetScore").GetValue<int>(); }
	int GetTargetScore() const { return Call("GetTargetScore").GetValue<int>(); }
	int GetMovesLeft() const { return Call("GetMovesLeft").GetValue<int>(); }
	String GetGameState() const { return Call("GetGameState").ToString(); }
	int GetBoosterCharges(int booster) const { return Call("GetBoosterCharges", { ScriptValue(booster) }).GetValue<int>(); }
	String GetCurrentWord() const { return Call("GetCurrentWord").ToString(); }
	bool IsWordUsed(const String& word) const { return Call("IsWordUsed", { ScriptValue(word) }).ToBool(); }
	bool IsTutorialSeen(const String& key) const { return Call("IsTutorialSeen", { ScriptValue(key) }).ToBool(); }
	void MarkTutorialSeen(const String& key) { Call("MarkTutorialSeen", { ScriptValue(key) }); }
	void ResetTutorials() { Call("ResetTutorials"); }
	String GetProgressPath() const { return Object().GetProperty("progressPath").ToString(); }

	void DebugSetTile(int column, int row, const String& letter) { Call("DebugSetTile", { ScriptValue(column), ScriptValue(row), ScriptValue(letter) }); }
	void DebugSetPowerup(int column, int row, const String& kind) { Call("DebugSetPowerup", { ScriptValue(column), ScriptValue(row), ScriptValue(kind) }); }
	void DebugSetStone(int column, int row) { Call("DebugSetStone", { ScriptValue(column), ScriptValue(row) }); }
	void DebugSetTargetScore(int target) { Call("DebugSetTargetScore", { ScriptValue(target) }); }
	void DebugCompleteTasks() { Call("DebugCompleteTasks"); }
	void DebugAddScore(int score) { Call("DebugAddScore", { ScriptValue(score) }); }
	void DebugAddMoves(int moves) { Call("DebugAddMoves", { ScriptValue(moves) }); }
	void DebugLoseLevel() { Call("DebugLoseLevel"); }
	int GetLevelConfigMoves(int index) const { return Call("GetLevelConfig", { ScriptValue(index) }).GetProperty("moves").GetValue<int>(); }

	// Лёд на клетке без хода: сценарии проверяют, что выбор его не трогает
	void DebugSetIce(int column, int row, int layers)
	{
		auto tile = Call("GetLevel").GetProperty("board").GetProperty("grid").GetElement(column).GetElement(row);
		tile.SetProperty("ice", ScriptValue(layers));
		Object().SetProperty("_revision", ScriptValue(Object().GetProperty("_revision").GetValue<int>() + 1));
	}

	WordFallJsService& GetLevel() { return *this; }
	WordFallJsBoard& GetBoard() { return mBoard; }

	const WordFallMove& GetLastMoveResult()
	{
		auto move = Call("GetLastMove");
		mMove = WordFallMove();
		mMove.ok = move.GetProperty("ok").ToBool();
		mMove.reason = move.GetProperty("reason").ToString();
		mMove.word = move.GetProperty("word").ToString();
		mMove.powerupEarned = move.GetProperty("powerupEarned").ToString();
		mMove.gain = move.GetProperty("gain").GetValue<int>();
		mMove.wordScore = move.GetProperty("wordScore").GetValue<int>();
		mMove.extraScore = move.GetProperty("extraScore").GetValue<int>();
		mMove.burned = Cells(move.GetProperty("burned"));
		mMove.destroyed = Cells(move.GetProperty("destroyed"));
		mMove.activated = Cells(move.GetProperty("activated"));
		mMove.iceBroken = Cells(move.GetProperty("iceBroken"));
		mMove.spawned = Cells(move.GetProperty("spawned"));
		mMove.crateHit = Cells(move.GetProperty("crateHit"));
		mMove.crateBroken = Cells(move.GetProperty("crateBroken"));
		mMove.snowMelted = Cells(move.GetProperty("snowMelted"));
		mMove.delivered = Cells(move.GetProperty("delivered"));

		auto used = move.GetProperty("powerupsUsed");
		for (int i = 0; i < used.GetLength(); i++)
		{
			auto item = used.GetElement(i);
			WordFallMove::PowerupUse use;
			use.kind = item.GetProperty("kind").ToString();
			use.cell = Vec2I(item.GetProperty("c").GetValue<int>(), item.GetProperty("r").GetValue<int>());
			use.targets = Cells(item.GetProperty("targets"));
			mMove.powerupsUsed.Add(use);
		}
		return mMove;
	}

	static Vector<Vec2I> Cells(const ScriptValue& list)
	{
		Vector<Vec2I> cells;
		for (int i = 0; i < list.GetLength(); i++)
		{
			auto cell = list.GetElement(i);
			cells.Add(Vec2I(cell.GetProperty("c").GetValue<int>(), cell.GetProperty("r").GetValue<int>()));
		}
		return cells;
	}

private:
	WordFallJsBoard mBoard;
	WordFallMove    mMove;
};

inline const WordTile& WordFallJsBoard::GetTile(const Vec2I& cell) const
{
	auto tile = mService.Call("GetTile", { ScriptValue(cell.x), ScriptValue(cell.y) });
	mTile.letter = WString(tile.GetProperty("letter").ToString());
	mTile.powerup = WString(tile.GetProperty("powerup").ToString());
	mTile.value = tile.GetProperty("value").GetValue<int>();
	mTile.ice = tile.GetProperty("ice").GetValue<int>();
	mTile.stone = tile.GetProperty("stone").GetValue<int>();
	mTile.crate = tile.GetProperty("crate").GetValue<int>();
	mTile.joker = tile.GetProperty("joker").ToBool();
	mTile.doubled = tile.GetProperty("doubled").ToBool();
	mTile.hole = tile.GetProperty("hole").ToBool();
	mTile.chained = tile.GetProperty("chained").ToBool();
	mTile.snow = tile.GetProperty("snow").ToBool();
	mTile.parcel = tile.GetProperty("parcel").ToBool();
	return mTile;
}

inline Vector<Vec2I> WordFallJsBoard::GetSelection() const
{
	return WordFallJsService::Cells(mService.Call("GetSelection"));
}

inline Vector<Vec2I> WordFallJsBoard::GetSeededCells() const
{
	return WordFallJsService::Cells(mService.Call("GetSeededCells"));
}

namespace
{
	const String kScreenshotsDir = "../../Work/ScreenShots/";
	const String kTestLevelsPath = "wordfall_test_levels.json"; // правки редактора уровней в тестах — не в файле игрока

	// Центр плитки в экранных координатах: поле 7×8, шаг 96, центр секции поля (0, -121)
	Vec2F TilePosition(int column, int row)
	{
		return Vec2F((column - 3)*96.0f, -121.0f + (row - 3.5f)*96.0f);
	}

	// Портретное окно 768x1376 система может ужать по высоте экрана; fitted-камера
	// масштабирует картинку, ввод конвертируется через камеру — кликаем в оконных
	// координатах: мировые * масштаб камеры
	Vec2F ToWindow(const Vec2F& worldPos)
	{
		Vec2F resolution = (Vec2F)o2Render.GetResolution();
		float scale = Math::Min(resolution.x/768.0f, resolution.y/1376.0f);
		return worldPos*scale;
	}

	void Click(const Vec2F& worldPos)
	{
		AppTestDriver::Click(ToWindow(worldPos));
	}

	void ClickTile(int column, int row)
	{
		Click(TilePosition(column, row));
		AppTestDriver::PumpFrames(2);
	}

	// Число перед "/" в подписи счёта "N/M"
	int ShownScore(const Ref<Label>& label)
	{
		String text = label->GetText();
		int value = 0;
		for (int i = 0; i < text.Length() && text[i] >= '0' && text[i] <= '9'; i++)
			value = value*10 + (text[i] - '0');
		return value;
	}

	// Текущий уровень из файла прогресса
	int SavedCurrentLevel(const String& path)
	{
		DataDocument data;
		if (!data.LoadFromFile(path))
			return -1;
		return data["currentLevel"];
	}
}

// Гоняет реальный экран Word Fall: сцена WordFall.scn, JS-сервис и вьюхи, тест кликает
// настоящими кнопками
class WordFallUI: public ::testing::Test
{
protected:
	WordFallJsService  mServiceView;
	WordFallJsService* mService = nullptr;

	// Кампания из campaign.json вместо процедурной генерации
	virtual bool UseCampaign() const { return false; }

	// Загружает сцену игры; сервис настраивается до старта уровня
	void LoadScene()
	{
		auto sceneAsset = o2Assets.GetAssetRefByType<SceneAsset>(String("WordFall.scn"));
		ASSERT_TRUE(sceneAsset);
		sceneAsset->Load();
		o2Scene.UpdateAddedEntities(); // зарегистрировать акторы, не стартуя их

		ASSERT_TRUE(WordFallJsService::Object().IsObject()) << "сцена без WordFallGame.service";
		mService = &mServiceView;
	}

	void SetUp() override
	{
		o2Application.SetWindowSize(Vec2I(768, 1376));
		o2FileSystem.FileDelete("wordfall_progress.json"); // чистый прогресс для каждого теста
		o2FileSystem.FileDelete(kTestLevelsPath);

		LoadScene();
		ASSERT_TRUE(mService);

		// фиксированный сид и свой файл правок уровней до старта сервиса
		mService->Set("randomSeed", ScriptValue(42));
		mService->Set("editedLevelsPath", ScriptValue(String(kTestLevelsPath)));
		if (!UseCampaign())
		{
			mService->Set("campaignPath", ScriptValue(String())); // старые сценарии рассчитаны на процедурный первый уровень
			// обучение блокирует клики вне вырезов — сценарии свободной игры его пропускают
			const char* keys[9] = { "basics", "boosters", "ice", "stone", "bonus", "crate", "chain", "snow", "parcel" };
			for (auto key : keys)
				mService->MarkTutorialSeen(key);
		}

		AppTestDriver::PumpFrames(10); // OnStart сервиса и вьюх + лэйауты
	}

	void TearDown() override
	{
		mService = nullptr;
		o2FileSystem.FileDelete(kTestLevelsPath);
		o2Scene.Clear(true);
		o2Scene.UpdateDestroyingEntities();
		AppTestDriver::PumpFrames(2);
	}

	// Выкладывает КОТ в нижний ряд в колонки 1..3
	void PlantKot()
	{
		PlantWord("КОТ");
	}

	// Выкладывает слово в нижний ряд с колонки 1: слово принимается раз за уровень,
	// поэтому повторные сборы берут другие слова
	void PlantWord(const char* word)
	{
		WString letters((String(word)));
		for (int i = 0; i < letters.Length(); i++)
			mService->DebugSetTile(1 + i, 0, String(letters.SubStr(i, i + 1)));
		AppTestDriver::PumpFrames(2);
	}

	// Слово с индексом сбора: КОТ, ТОК, КИТ, ТИК
	static const char* NthWord(int index)
	{
		static const char* words[4] = { "КОТ", "ТОК", "КИТ", "ТИК" };
		return words[index % 4];
	}
};
