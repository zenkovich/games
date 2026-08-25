#pragma once

#include "Core/GameModel.h"
#include "Screens/Screen.h"
#include "UI/Hud.h"
#include "o2/Scene/Component.h"
#include "o2/Scene/UI/Widgets/Label.h"

using namespace o2;

class GlassScreen;

// ---------------------------------------------------------------------------
// Bootstrap component of Color Town. Lives on the "Game" actor of Bootstrap.scn
// next to the ScriptableComponent that runs GameModel.js. On start it wraps the
// model, builds the camera, the HUD and every screen, then shows the city.
// Screens navigate through it; it also drives notifications and saving.
// ---------------------------------------------------------------------------
class ColorTownGame: public Component
{
public:
	static constexpr const char* kCity = "City";
	static constexpr const char* kGlass = "Glass";
	static constexpr const char* kWorkshop = "Workshop";
	static constexpr const char* kCharacter = "Character";
	static constexpr const char* kDate = "Date";
	static constexpr const char* kWarehouse = "Warehouse";
	static constexpr const char* kBuild = "Build";

	// When set, the model state is loaded from and saved to this file
	static String savePath;

public:
	void OnStart() override;
	void OnUpdate(float dt) override;
	void OnRemoveFromScene() override;

	const Ref<GameModel>& GetModel() const;

	void ShowCity();
	void ShowGlass(const String& buildingId);
	void ShowWorkshop(const String& buildingId);
	void ShowCharacter(const String& npcId);
	void ShowDate(const String& npcId, const String& spotId, const Vector<String>& lines);

	void OpenWarehouse();
	void OpenBuild(int slot);
	void CloseWindow();

	// Re-reads the model into the HUD, the current screen and the window on the next update, so a
	// click handler never rebuilds the very button that is being released
	void RefreshAll();

	// Immediate refresh
	void RefreshNow();

	// Shows a short message above the screen
	void Notify(const String& text);

	void Save() const;

	const String& GetCurrentScreenName() const;
	Ref<Screen> GetCurrentScreen() const;
	Ref<Screen> GetScreen(const String& name) const;
	const String& GetWindowName() const;
	Ref<Screen> GetWindow() const;
	Ref<GlassScreen> GetGlassScreen() const;

	// Finds the game component in the scene; null before the bootstrap scene is loaded
	static Ref<ColorTownGame> Find();

	// The "Game" actor with the model script and this component, ready to be saved into Bootstrap.scn
	static Ref<Actor> CreateBootstrapActor();

	SERIALIZABLE(ColorTownGame);
	CLONEABLE_REF(ColorTownGame);

private:
	Ref<GameModel> mModel;
	Ref<Actor>     mWorldRoot;
	Ref<Actor>     mScreensRoot;
	Ref<Actor>     mOverlayRoot;
	Ref<Hud>       mHud;

	Vector<Pair<String, Ref<Screen>>> mScreens;
	Ref<Screen> mCurrent;
	String      mCurrentName;
	Ref<Screen> mWindow;
	String      mWindowName;

	Ref<Label> mToast;
	float      mToastTime = 0.0f;
	bool       mRefreshPending = false;

private:
	void BuildWorld();
	void AddScreen(const String& name, const Ref<Screen>& screen);
	void ShowScreen(const String& name);
	void OpenWindow(const String& name);
};
// --- META ---

CLASS_BASES_META(ColorTownGame)
{
    BASE_CLASS(Component);
}
END_META;
CLASS_FIELDS_META(ColorTownGame)
{
    FIELD().PRIVATE().NAME(mModel);
    FIELD().PRIVATE().NAME(mWorldRoot);
    FIELD().PRIVATE().NAME(mScreensRoot);
    FIELD().PRIVATE().NAME(mOverlayRoot);
    FIELD().PRIVATE().NAME(mHud);
    FIELD().PRIVATE().NAME(mScreens);
    FIELD().PRIVATE().NAME(mCurrent);
    FIELD().PRIVATE().NAME(mCurrentName);
    FIELD().PRIVATE().NAME(mWindow);
    FIELD().PRIVATE().NAME(mWindowName);
    FIELD().PRIVATE().NAME(mToast);
    FIELD().PRIVATE().DEFAULT_VALUE(0.0f).NAME(mToastTime);
    FIELD().PRIVATE().DEFAULT_VALUE(false).NAME(mRefreshPending);
}
END_META;
CLASS_METHODS_META(ColorTownGame)
{

    FUNCTION().PUBLIC().SIGNATURE(void, OnStart);
    FUNCTION().PUBLIC().SIGNATURE(void, OnUpdate, float);
    FUNCTION().PUBLIC().SIGNATURE(void, OnRemoveFromScene);
    FUNCTION().PUBLIC().SIGNATURE(const Ref<GameModel>&, GetModel);
    FUNCTION().PUBLIC().SIGNATURE(void, ShowCity);
    FUNCTION().PUBLIC().SIGNATURE(void, ShowGlass, const String&);
    FUNCTION().PUBLIC().SIGNATURE(void, ShowWorkshop, const String&);
    FUNCTION().PUBLIC().SIGNATURE(void, ShowCharacter, const String&);
    FUNCTION().PUBLIC().SIGNATURE(void, ShowDate, const String&, const String&, const Vector<String>&);
    FUNCTION().PUBLIC().SIGNATURE(void, OpenWarehouse);
    FUNCTION().PUBLIC().SIGNATURE(void, OpenBuild, int);
    FUNCTION().PUBLIC().SIGNATURE(void, CloseWindow);
    FUNCTION().PUBLIC().SIGNATURE(void, RefreshAll);
    FUNCTION().PUBLIC().SIGNATURE(void, RefreshNow);
    FUNCTION().PUBLIC().SIGNATURE(void, Notify, const String&);
    FUNCTION().PUBLIC().SIGNATURE(void, Save);
    FUNCTION().PUBLIC().SIGNATURE(const String&, GetCurrentScreenName);
    FUNCTION().PUBLIC().SIGNATURE(Ref<Screen>, GetCurrentScreen);
    FUNCTION().PUBLIC().SIGNATURE(Ref<Screen>, GetScreen, const String&);
    FUNCTION().PUBLIC().SIGNATURE(const String&, GetWindowName);
    FUNCTION().PUBLIC().SIGNATURE(Ref<Screen>, GetWindow);
    FUNCTION().PUBLIC().SIGNATURE(Ref<GlassScreen>, GetGlassScreen);
    FUNCTION().PUBLIC().SIGNATURE_STATIC(Ref<ColorTownGame>, Find);
    FUNCTION().PUBLIC().SIGNATURE_STATIC(Ref<Actor>, CreateBootstrapActor);
    FUNCTION().PRIVATE().SIGNATURE(void, BuildWorld);
    FUNCTION().PRIVATE().SIGNATURE(void, AddScreen, const String&, const Ref<Screen>&);
    FUNCTION().PRIVATE().SIGNATURE(void, ShowScreen, const String&);
    FUNCTION().PRIVATE().SIGNATURE(void, OpenWindow, const String&);
}
END_META;
// --- END META ---
