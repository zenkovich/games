#pragma once

// Общая обвязка UI-тестов Word Fall: сцена из бутстрапа, клики в мировых координатах,
// раскладка КОТ. Используют WordFallUITests и WordFallVfxShowcaseTests

#include <gtest/gtest.h>

#include "WordFall/WordFallBootstrap.h"
#include "WordFall/WordFallGameService.h"
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
#include "o2/Utils/FileSystem/FileSystem.h"
#include "o2/Utils/Test/AppTestDriver.h"

using namespace o2;

namespace
{
	const String kScreenshotsDir = "../../Work/ScreenShots/";

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
		Click(WordFallBootstrap::TilePosition(column, row));
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
}

// Гоняет реальный экран Word Fall: bootstrap строит сцену из прототипов,
// JS-вьюхи цепляются к C++ сервису, тест кликает настоящими кнопками
class WordFallUI: public ::testing::Test
{
protected:
	Ref<WordFallGameService> mService;

	// Кампания из campaign.json вместо процедурной генерации
	virtual bool UseCampaign() const { return false; }

	void SetUp() override
	{
		o2Application.SetWindowSize(Vec2I(768, 1376));
		o2FileSystem.FileDelete("wordfall_progress.json"); // чистый прогресс для каждого теста

		WordFallBootstrap::CreateBootstrapActor();
		o2Scene.UpdateAddedEntities(); // зарегистрировать акторы, не стартуя их

		// фиксированный сид до старта сервиса
		auto serviceActor = o2Scene.FindActor("GameService");
		ASSERT_TRUE(serviceActor);
		mService = serviceActor->GetComponent<WordFallGameService>();
		ASSERT_TRUE(mService);
		mService->randomSeed = 42;
		if (!UseCampaign())
		{
			mService->campaignPath = ""; // старые сценарии рассчитаны на процедурный первый уровень
			// обучение блокирует клики вне вырезов — сценарии свободной игры его пропускают
			const char* keys[9] = { "basics", "boosters", "ice", "stone", "bonus", "crate", "chain", "snow", "parcel" };
			for (auto key : keys)
				mService->MarkTutorialSeen(key);
		}

		AppTestDriver::PumpFrames(10); // bootstrap OnStart + вьюхи OnStart + лэйауты
	}

	void TearDown() override
	{
		mService = nullptr;
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

