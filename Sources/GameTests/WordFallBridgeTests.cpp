#include "o2/stdafx.h"
#include <gtest/gtest.h>

#include "Scene/SceneTestHelpers.h"
#include "WordFall/WordFallBootstrap.h"
#include "WordFall/WordFallGameService.h"
#include "o2/Assets/Assets.h"
#include "o2/Scene/Actor.h"
#include "o2/Scene/Scene.h"
#include "o2/Scripts/ScriptEngine.h"
#include "o2/Scripts/ScriptValue.h"
#include "o2/Utils/FileSystem/FileSystem.h"

using namespace o2;

#if IS_SCRIPTING_SUPPORTED

// Мост JS<->C++: JS-вьюхи получают сервис через actor.GetComponent("WordFallGameService")
// и зовут его SCRIPTABLE-методы, включая возвраты ScriptValue-объектов
class WordFallBridge: public ::testing::Test
{
protected:
	SceneCleanGuard mSceneGuard;

	ScriptValue EvalChecked(const char* code)
	{
		ScriptValue res = o2Scripts.Eval(code);
		EXPECT_NE(res.GetValueType(), ScriptValue::ValueType::Error) << res.GetError().Data();
		return res;
	}
};

TEST_F(WordFallBridge, ServiceIsCallableFromScripts)
{
	auto actor = mmake<Actor>(ActorCreateMode::InScene);
	actor->SetName("GameService");
	auto service = actor->AddComponent<WordFallGameService>();
	service->randomSeed = 42;
	service->StartLevel(0);

	o2Scripts.GetGlobal().SetProperty("BridgeProbeActor", ScriptValue(actor));

	// компонент достаётся по имени типа
	EvalChecked("var bridgeSvc = BridgeProbeActor.GetComponent('WordFallGameService');");
	EXPECT_EQ(EvalChecked("bridgeSvc.GetColumns()").GetValue<int>(), 7);
	EXPECT_EQ(EvalChecked("bridgeSvc.GetRows()").GetValue<int>(), 8);
	EXPECT_EQ(EvalChecked("bridgeSvc.GetGameState()").GetValue<String>(), String("playing"));

	// ScriptValue-объекты: плитка и задачи
	EvalChecked("bridgeSvc.DebugSetTile(0, 0, 'К');");
	EXPECT_EQ(EvalChecked("bridgeSvc.GetTile(0, 0).letter").GetValue<String>(), String("К"));
	EXPECT_EQ(EvalChecked("bridgeSvc.GetTile(0, 0).value").GetValue<int>(), 2);
	EXPECT_GE(EvalChecked("bridgeSvc.GetTasks().length").GetValue<int>(), 1);

	// действия и составной результат хода
	EvalChecked(
		"bridgeSvc.DebugSetTile(0, 0, 'К'); bridgeSvc.DebugSetTile(1, 0, 'О'); bridgeSvc.DebugSetTile(2, 0, 'Т');"
		"bridgeSvc.ToggleSelect(0, 0); bridgeSvc.ToggleSelect(1, 0); bridgeSvc.ToggleSelect(2, 0);");
	EXPECT_EQ(EvalChecked("bridgeSvc.GetCurrentWord()").GetValue<String>(), String("КОТ"));
	EXPECT_TRUE(EvalChecked("bridgeSvc.IsCurrentWordValid()").GetValue<bool>());

	EvalChecked("var bridgeMove = bridgeSvc.AcceptWord();");
	EXPECT_TRUE(EvalChecked("bridgeMove.ok").GetValue<bool>());
	EXPECT_EQ(EvalChecked("bridgeMove.gain").GetValue<int>(), 12);
	EXPECT_EQ(EvalChecked("bridgeMove.spawned.length").GetValue<int>(), 3);
	EXPECT_EQ(EvalChecked("bridgeSvc.GetScore()").GetValue<int>(), 12);

	EvalChecked("BridgeProbeActor = undefined; bridgeSvc = undefined; bridgeMove = undefined;");
}

// Регенерирует bootstrap-сцену: только акторы Bootstrap и GameService,
// без визуальных ассетов — сохранение безопасно в headless
TEST_F(WordFallBridge, BootstrapSceneRegenerates)
{
	String path = o2Assets.GetAssetsPath() + "WordFall.scn";
	WordFallBootstrap::SaveBootstrapScene(path);

	EXPECT_TRUE(o2FileSystem.IsFileExist(path));
	EXPECT_TRUE(o2Scene.FindActor("GameService"));
	EXPECT_TRUE(o2Scene.FindActor("Bootstrap"));
}

#endif // IS_SCRIPTING_SUPPORTED
