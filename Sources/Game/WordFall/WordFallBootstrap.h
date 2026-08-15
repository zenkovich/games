#pragma once

#include "o2/Scene/Component.h"

using namespace o2;

namespace o2
{
	class ActorAsset;
	class Widget;
}

// Точка входа Word Fall. Живёт в bootstrap-сцене вместе с сервисной нодой
// GameService (конфиги кампании редактируются в редакторе). На старте
// инстанцирует прототип экрана геймплея WordFall/Prototypes/GameScreen.proto
// (при отсутствии — собирает и сохраняет его) и инжектит зависимости вьюх
class WordFallBootstrap: public Component
{
public:
	static constexpr int kColumns = 7;
	static constexpr int kRows = 8;
	static constexpr int kMaxTasks = 5;
	static constexpr int kWordSlots = 8;
	static constexpr int kFlyers = 4;

	// Создаёт акторы bootstrap-сцены (Bootstrap + GameService); используется игрой и тестами
	static Ref<Actor> CreateBootstrapActor();

	// Собирает минимальную bootstrap-сцену и сохраняет её в path
	static void SaveBootstrapScene(const String& path);

	// Центр плитки поля в экранных координатах (центр экрана — (0,0))
	static Vec2F TilePosition(int column, int row);

	SERIALIZABLE(WordFallBootstrap);
	CLONEABLE_REF(WordFallBootstrap);

private:
	bool mBuilt = false;

	void OnStart() override;

	void BuildLayersAndCamera();
	Ref<Actor> FindOrCreateService();

	// Экран геймплея: инстанс прототипа; свежий чекаут — прямая сборка и сохранение прототипа
	Ref<Actor> InstantiateGameScreen();

	// Инстанс прототипа части UI; при отсутствии ассета — сборка билдером (+сохранение на десктопе)
	static Ref<Actor> InstantiatePart(const String& assetPath, Ref<Actor>(*builder)());

	// Полная сборка дерева экрана: BG, Screen с секциями и вьюхами, Vfx
	static Ref<Actor> BuildGameScreen();

	static void BuildBoard(const Ref<Widget>& screen);
	static void BuildHud(const Ref<Widget>& screen);
	static void BuildTasks(const Ref<Widget>& screen);
	static void BuildWordBar(const Ref<Widget>& screen);
	static void BuildBoosters(const Ref<Widget>& screen);
	static void BuildFx(const Ref<Widget>& screen);
	static void BuildPopup(const Ref<Widget>& screen);
	static void BuildVfx(const Ref<Actor>& root);

	// Вешает JS-вьюху на секцию (зависимости инжектятся после инстанцирования)
	static void AttachView(const Ref<Actor>& sectionActor, const String& scriptPath);

	// Инжектит serviceActor/vfxActor в инстансы вьюх инстанцированного экрана
	static void InjectViewDependencies(const Ref<Actor>& root, const Ref<Actor>& service);

	REF_COUNTERABLE_IMPL(Component);
};
// --- META ---

CLASS_BASES_META(WordFallBootstrap)
{
    BASE_CLASS(Component);
}
END_META;
CLASS_FIELDS_META(WordFallBootstrap)
{
    FIELD().PRIVATE().DEFAULT_VALUE(false).NAME(mBuilt);
}
END_META;
CLASS_METHODS_META(WordFallBootstrap)
{

    FUNCTION().PUBLIC().SIGNATURE_STATIC(Ref<Actor>, CreateBootstrapActor);
    FUNCTION().PUBLIC().SIGNATURE_STATIC(void, SaveBootstrapScene, const String&);
    FUNCTION().PUBLIC().SIGNATURE_STATIC(Vec2F, TilePosition, int, int);
    FUNCTION().PRIVATE().SIGNATURE(void, OnStart);
    FUNCTION().PRIVATE().SIGNATURE(void, BuildLayersAndCamera);
    FUNCTION().PRIVATE().SIGNATURE(Ref<Actor>, FindOrCreateService);
    FUNCTION().PRIVATE().SIGNATURE(Ref<Actor>, InstantiateGameScreen);
    FUNCTION().PRIVATE().SIGNATURE_STATIC(Ref<Actor>, InstantiatePart, const String&, Ref<Actor> (*)());
    FUNCTION().PRIVATE().SIGNATURE_STATIC(Ref<Actor>, BuildGameScreen);
    FUNCTION().PRIVATE().SIGNATURE_STATIC(void, BuildBoard, const Ref<Widget>&);
    FUNCTION().PRIVATE().SIGNATURE_STATIC(void, BuildHud, const Ref<Widget>&);
    FUNCTION().PRIVATE().SIGNATURE_STATIC(void, BuildTasks, const Ref<Widget>&);
    FUNCTION().PRIVATE().SIGNATURE_STATIC(void, BuildWordBar, const Ref<Widget>&);
    FUNCTION().PRIVATE().SIGNATURE_STATIC(void, BuildBoosters, const Ref<Widget>&);
    FUNCTION().PRIVATE().SIGNATURE_STATIC(void, BuildFx, const Ref<Widget>&);
    FUNCTION().PRIVATE().SIGNATURE_STATIC(void, BuildPopup, const Ref<Widget>&);
    FUNCTION().PRIVATE().SIGNATURE_STATIC(void, BuildVfx, const Ref<Actor>&);
    FUNCTION().PRIVATE().SIGNATURE_STATIC(void, AttachView, const Ref<Actor>&, const String&);
    FUNCTION().PRIVATE().SIGNATURE_STATIC(void, InjectViewDependencies, const Ref<Actor>&, const Ref<Actor>&);
}
END_META;
// --- END META ---
