#pragma once

#include "ObbyLevel.h"
#include "ObbyWorld.h"
#include "o2/Scene/Actor.h"
#include "o2/Scene/Component.h"
#include "o2/Scene/UI/Widgets/Label.h"
#include "o2/Utils/Math/Color.h"

// The whole Potato Obby game on one actor: loads the level set, runs the world simulation, reads
// keyboard and touch input, draws the level with sprites, the HUD with labels and keeps the progress
class ObbyGameComponent: public Component
{
public:
	enum class Screen { Menu, Playing, LevelWon, Finished };

	String levelsPath = String("PotatoObby/levels.json"); // Level set asset @SERIALIZABLE @EDITOR_PROPERTY
	String savePath = String("potato_obby_save.json");   // Progress file next to the executable @SERIALIZABLE @EDITOR_PROPERTY
	float wonDelay = 1.5f;                        // Pause on the "level passed" screen @SERIALIZABLE @EDITOR_PROPERTY

	SERIALIZABLE(ObbyGameComponent);
	CLONEABLE_REF(ObbyGameComponent);

	Screen GetScreen() const { return mScreen; }
	int GetLevelIndex() const { return mLevelIndex; }
	int GetUnlockedLevels() const { return mUnlocked; }
	int GetTotalDeaths() const { return mTotalDeaths; }
	const obby::LevelSet& GetLevels() const { return mLevels; }
	obby::World& GetWorld() { return mWorld; }
	const String& GetMessage() const { return mMessage; }
	const Ref<Actor>& GetPlayerActor() const { return mPlayer; }
	const Ref<Actor>& GetLevelRoot() const { return mLevelRoot; }
	bool IsViewBuilt() const { return mViewBuilt; }

	void ShowMenu();
	void StartLevel(int index);
	void RestartLevel();
	void NextLevel();

	// Virtual input merged with the keyboard and the touch buttons: tests and cheats
	void SetExternalInput(bool left, bool right, bool jump);
	obby::Input GetLastInput() const { return mLastInput; }

	// Screen-space (window centre origin, y up, points) to world units of the fitted camera
	Vec2F ScreenToWorld(const Vec2F& screenPos) const;

	// Menu hit areas in world units, for tests
	obby::Box GetPlayButtonBox() const;
	obby::Box GetLevelButtonBox(int index) const;
	obby::Box GetTouchButtonBox(int which) const; // 0 left, 1 right, 2 jump

	bool LoadLevelSet();

private:
	// The camera shows the 1280x720 level plus a HUD band above and below it
	static constexpr float kScreenW = 1280.0f;
	static constexpr float kScreenH = 900.0f;

	obby::LevelSet mLevels;
	obby::World mWorld;
	Screen mScreen = Screen::Menu;
	int mLevelIndex = 0;
	int mUnlocked = 1;
	int mTotalDeaths = 0;
	float mTotalTime = 0.0f;
	float mWonTimer = 0.0f;

	String mMessage;
	float mMessageTimer = 0.0f;

	obby::Input mExternalInput;
	bool mHasExternalInput = false;
	obby::Input mLastInput;
	bool mWasCursorDown = false;

	bool mViewBuilt = false;
	Ref<Actor> mRoot;
	Ref<Actor> mBackground;
	Ref<Actor> mLevelRoot;
	Ref<Actor> mPlayer;
	Ref<Actor> mExit;
	Vector<Ref<Actor>> mTileActors; // kCols*kRows
	Vector<Ref<Actor>> mMoverActors;
	Vector<Ref<Actor>> mDarkness;
	Ref<Actor> mHud;
	Ref<Label> mTitleLabel;
	Ref<Label> mDeathsLabel;
	Ref<Label> mTimeLabel;
	Ref<Label> mMessageLabel;
	Ref<Label> mHintLabel;
	Vector<Ref<Actor>> mTouchButtons;
	Ref<Actor> mMenu;
	Ref<Label> mMenuSubtitle;
	Vector<Ref<Label>> mLevelButtons;
	Ref<Actor> mPopup;
	Ref<Label> mPopupTitle;
	Ref<Label> mPopupText;

	void OnStart() override;
	void OnUpdate(float dt) override;

	void BuildView();
	void BuildLevelView();
	void ClearLevelView();
	void SyncView();
	void SyncHud();
	void SyncMenu();

	Ref<Actor> MakeSprite(const Ref<Actor>& parent, const String& name, const String& image,
						  const Vec2F& pos, const Vec2F& size, float depth);
	Ref<Label> MakeLabel(const Ref<Actor>& parent, const String& name, const String& text, int height,
						 const Color4& color, const Vec2F& pos, const Vec2F& size, float depth);
	void SetLabel(const Ref<Label>& label, const String& text);
	static String FormatTime(float seconds);

	obby::Input ReadInput();
	bool IsCursorInBox(const obby::Box& box) const;
	bool IsAnyCursorDownIn(const obby::Box& box) const;
	void HandleMenuInput();
	void HandleEvents();
	void ShowMessage(const String& text, float duration);

	void LoadProgress();
	void SaveProgress();

	REF_COUNTERABLE_IMPL(Component);
};
// --- META ---

PRE_ENUM_META(ObbyGameComponent::Screen);

CLASS_BASES_META(ObbyGameComponent)
{
    BASE_CLASS(Component);
}
END_META;
CLASS_FIELDS_META(ObbyGameComponent)
{
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(String("PotatoObby/levels.json")).NAME(levelsPath);
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(String("potato_obby_save.json")).NAME(savePath);
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(1.5f).NAME(wonDelay);
    FIELD().PRIVATE().NAME(mLevels);
    FIELD().PRIVATE().NAME(mWorld);
    FIELD().PRIVATE().DEFAULT_VALUE(Screen::Menu).NAME(mScreen);
    FIELD().PRIVATE().DEFAULT_VALUE(0).NAME(mLevelIndex);
    FIELD().PRIVATE().DEFAULT_VALUE(1).NAME(mUnlocked);
    FIELD().PRIVATE().DEFAULT_VALUE(0).NAME(mTotalDeaths);
    FIELD().PRIVATE().DEFAULT_VALUE(0.0f).NAME(mTotalTime);
    FIELD().PRIVATE().DEFAULT_VALUE(0.0f).NAME(mWonTimer);
    FIELD().PRIVATE().NAME(mMessage);
    FIELD().PRIVATE().DEFAULT_VALUE(0.0f).NAME(mMessageTimer);
    FIELD().PRIVATE().NAME(mExternalInput);
    FIELD().PRIVATE().DEFAULT_VALUE(false).NAME(mHasExternalInput);
    FIELD().PRIVATE().NAME(mLastInput);
    FIELD().PRIVATE().DEFAULT_VALUE(false).NAME(mWasCursorDown);
    FIELD().PRIVATE().DEFAULT_VALUE(false).NAME(mViewBuilt);
    FIELD().PRIVATE().NAME(mRoot);
    FIELD().PRIVATE().NAME(mBackground);
    FIELD().PRIVATE().NAME(mLevelRoot);
    FIELD().PRIVATE().NAME(mPlayer);
    FIELD().PRIVATE().NAME(mExit);
    FIELD().PRIVATE().NAME(mTileActors);
    FIELD().PRIVATE().NAME(mMoverActors);
    FIELD().PRIVATE().NAME(mDarkness);
    FIELD().PRIVATE().NAME(mHud);
    FIELD().PRIVATE().NAME(mTitleLabel);
    FIELD().PRIVATE().NAME(mDeathsLabel);
    FIELD().PRIVATE().NAME(mTimeLabel);
    FIELD().PRIVATE().NAME(mMessageLabel);
    FIELD().PRIVATE().NAME(mHintLabel);
    FIELD().PRIVATE().NAME(mTouchButtons);
    FIELD().PRIVATE().NAME(mMenu);
    FIELD().PRIVATE().NAME(mMenuSubtitle);
    FIELD().PRIVATE().NAME(mLevelButtons);
    FIELD().PRIVATE().NAME(mPopup);
    FIELD().PRIVATE().NAME(mPopupTitle);
    FIELD().PRIVATE().NAME(mPopupText);
}
END_META;
CLASS_METHODS_META(ObbyGameComponent)
{

    FUNCTION().PUBLIC().SIGNATURE(Screen, GetScreen);
    FUNCTION().PUBLIC().SIGNATURE(int, GetLevelIndex);
    FUNCTION().PUBLIC().SIGNATURE(int, GetUnlockedLevels);
    FUNCTION().PUBLIC().SIGNATURE(int, GetTotalDeaths);
    FUNCTION().PUBLIC().SIGNATURE(const obby::LevelSet&, GetLevels);
    FUNCTION().PUBLIC().SIGNATURE(obby::World&, GetWorld);
    FUNCTION().PUBLIC().SIGNATURE(const String&, GetMessage);
    FUNCTION().PUBLIC().SIGNATURE(const Ref<Actor>&, GetPlayerActor);
    FUNCTION().PUBLIC().SIGNATURE(const Ref<Actor>&, GetLevelRoot);
    FUNCTION().PUBLIC().SIGNATURE(bool, IsViewBuilt);
    FUNCTION().PUBLIC().SIGNATURE(void, ShowMenu);
    FUNCTION().PUBLIC().SIGNATURE(void, StartLevel, int);
    FUNCTION().PUBLIC().SIGNATURE(void, RestartLevel);
    FUNCTION().PUBLIC().SIGNATURE(void, NextLevel);
    FUNCTION().PUBLIC().SIGNATURE(void, SetExternalInput, bool, bool, bool);
    FUNCTION().PUBLIC().SIGNATURE(obby::Input, GetLastInput);
    FUNCTION().PUBLIC().SIGNATURE(Vec2F, ScreenToWorld, const Vec2F&);
    FUNCTION().PUBLIC().SIGNATURE(obby::Box, GetPlayButtonBox);
    FUNCTION().PUBLIC().SIGNATURE(obby::Box, GetLevelButtonBox, int);
    FUNCTION().PUBLIC().SIGNATURE(obby::Box, GetTouchButtonBox, int);
    FUNCTION().PUBLIC().SIGNATURE(bool, LoadLevelSet);
    FUNCTION().PRIVATE().SIGNATURE(void, OnStart);
    FUNCTION().PRIVATE().SIGNATURE(void, OnUpdate, float);
    FUNCTION().PRIVATE().SIGNATURE(void, BuildView);
    FUNCTION().PRIVATE().SIGNATURE(void, BuildLevelView);
    FUNCTION().PRIVATE().SIGNATURE(void, ClearLevelView);
    FUNCTION().PRIVATE().SIGNATURE(void, SyncView);
    FUNCTION().PRIVATE().SIGNATURE(void, SyncHud);
    FUNCTION().PRIVATE().SIGNATURE(void, SyncMenu);
    FUNCTION().PRIVATE().SIGNATURE(Ref<Actor>, MakeSprite, const Ref<Actor>&, const String&, const String&, const Vec2F&, const Vec2F&, float);
    FUNCTION().PRIVATE().SIGNATURE(Ref<Label>, MakeLabel, const Ref<Actor>&, const String&, const String&, int, const Color4&, const Vec2F&, const Vec2F&, float);
    FUNCTION().PRIVATE().SIGNATURE(void, SetLabel, const Ref<Label>&, const String&);
    FUNCTION().PRIVATE().SIGNATURE_STATIC(String, FormatTime, float);
    FUNCTION().PRIVATE().SIGNATURE(obby::Input, ReadInput);
    FUNCTION().PRIVATE().SIGNATURE(bool, IsCursorInBox, const obby::Box&);
    FUNCTION().PRIVATE().SIGNATURE(bool, IsAnyCursorDownIn, const obby::Box&);
    FUNCTION().PRIVATE().SIGNATURE(void, HandleMenuInput);
    FUNCTION().PRIVATE().SIGNATURE(void, HandleEvents);
    FUNCTION().PRIVATE().SIGNATURE(void, ShowMessage, const String&, float);
    FUNCTION().PRIVATE().SIGNATURE(void, LoadProgress);
    FUNCTION().PRIVATE().SIGNATURE(void, SaveProgress);
}
END_META;
// --- END META ---
