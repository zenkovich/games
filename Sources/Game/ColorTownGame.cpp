#include "o2/stdafx.h"
#include "ColorTownGame.h"

#include "Screens/BuildWindow.h"
#include "Screens/CharacterScreen.h"
#include "Screens/CityScreen.h"
#include "Screens/DateScreen.h"
#include "Screens/GlassScreen.h"
#include "Screens/WarehouseWindow.h"
#include "Screens/WorkshopScreen.h"
#include "UI/UIKit.h"
#include "o2/Scene/CameraActor.h"
#include "o2/Scene/Scene.h"
#include "o2/Utils/FileSystem/File.h"
#include "o2/Utils/FileSystem/FileSystem.h"

String ColorTownGame::savePath;

void ColorTownGame::OnStart()
{
	auto owner = mOwner.Lock();

	if (auto scriptable = owner->GetComponent<ScriptableComponent>())
		mModel = mmake<GameModel>(scriptable->GetInstance());
	else
		mModel = GameModel::CreateOn(owner);

	if (!savePath.IsEmpty() && o2FileSystem.IsFileExist(savePath))
	{
		InFile file(savePath);
		if (file.IsOpened())
			mModel->Call<bool>("FromJson", file.ReadFullData());
	}

	BuildWorld();
	ShowCity();
}

void ColorTownGame::BuildWorld()
{
	auto owner = mOwner.Lock();

	mWorldRoot = mmake<Actor>(ActorCreateMode::InScene);
	mWorldRoot->SetName("World");
	mWorldRoot->SetParent(owner, false);
	mWorldRoot->transform->SetPosition2D(Vec2F());

	auto camera = mmake<CameraActor>();
	camera->SetName("Camera");
	camera->fillColor = Color4(120, 190, 110);
	camera->SetFittedSize(UI::kDesignSize);
	camera->SetParent(mWorldRoot, false);
	camera->transform->SetPosition2D(Vec2F());

	mScreensRoot = mmake<Actor>(ActorCreateMode::InScene);
	mScreensRoot->SetName("Screens");
	mScreensRoot->SetParent(mWorldRoot, false);
	mScreensRoot->transform->SetPosition2D(Vec2F());

	auto self = Ref(this);
	AddScreen(kCity, mmake<CityScreen>(self));
	AddScreen(kGlass, mmake<GlassScreen>(self));
	AddScreen(kWorkshop, mmake<WorkshopScreen>(self));
	AddScreen(kCharacter, mmake<CharacterScreen>(self));
	AddScreen(kDate, mmake<DateScreen>(self));

	auto hudRoot = mmake<Actor>(ActorCreateMode::InScene);
	hudRoot->SetName("HudRoot");
	hudRoot->SetParent(mWorldRoot, false);
	hudRoot->transform->SetPosition2D(Vec2F());

	auto hudUI = UI::MakeRoot("UI");
	hudUI->SetParent(hudRoot, false);
	mHud = mmake<Hud>();
	hudUI->AddChildWidget(mHud->Build());

	mToast = UI::MakeLabel("Toast", "", UI::kCenter, Vec2F(0, 800), Vec2F(900, 50), 32, UI::kTextLight, true);
	if (mToast)
	{
		hudUI->AddChildWidget(mToast);
		mToast->SetEnabledForcible(false);
	}

	mOverlayRoot = mmake<Actor>(ActorCreateMode::InScene);
	mOverlayRoot->SetName("Windows");
	mOverlayRoot->SetParent(mWorldRoot, false);
	mOverlayRoot->transform->SetPosition2D(Vec2F());

	auto warehouse = mmake<WarehouseWindow>(self);
	warehouse->Create(mOverlayRoot, kWarehouse);
	mScreens.Add({ kWarehouse, warehouse });

	auto build = mmake<BuildWindow>(self);
	build->Create(mOverlayRoot, kBuild);
	mScreens.Add({ kBuild, build });
}

void ColorTownGame::AddScreen(const String& name, const Ref<Screen>& screen)
{
	screen->Create(mScreensRoot, name);
	mScreens.Add({ name, screen });
}

void ColorTownGame::OnUpdate(float dt)
{
	if (mCurrent)
		mCurrent->Update(dt);

	if (mWindow)
		mWindow->Update(dt);

	String notification = mModel ? mModel->GetString("PopNotification") : String();
	if (!notification.IsEmpty())
	{
		Notify(notification);
		mRefreshPending = true;
	}

	if (mRefreshPending)
		RefreshNow();

	if (mToastTime > 0.0f)
	{
		mToastTime -= dt;
		if (mToastTime <= 0.0f && mToast)
			mToast->SetEnabledForcible(false);
	}
}

void ColorTownGame::OnRemoveFromScene()
{
	Save();

	mScreens.Clear();
	mCurrent = nullptr;
	mWindow = nullptr;
	mHud = nullptr;
}

const Ref<GameModel>& ColorTownGame::GetModel() const
{
	return mModel;
}

void ColorTownGame::ShowScreen(const String& name)
{
	CloseWindow();

	auto screen = GetScreen(name);
	if (!screen)
		return;

	if (mCurrent && mCurrent != screen)
		mCurrent->Hide();

	mCurrent = screen;
	mCurrentName = name;
	mCurrent->Show();
	mCurrent->Refresh();
	mHud->Refresh(mModel);
}

void ColorTownGame::ShowCity()
{
	ShowScreen(kCity);
}

void ColorTownGame::ShowGlass(const String& buildingId)
{
	if (auto screen = DynamicCast<GlassScreen>(GetScreen(kGlass)))
	{
		if (screen->IsShown() && screen->GetBuilding() != buildingId)
			screen->Hide();

		screen->SetBuilding(buildingId);
	}

	ShowScreen(kGlass);
}

void ColorTownGame::ShowWorkshop(const String& buildingId)
{
	if (auto screen = DynamicCast<WorkshopScreen>(GetScreen(kWorkshop)))
		screen->SetBuilding(buildingId);

	ShowScreen(kWorkshop);
}

void ColorTownGame::ShowCharacter(const String& npcId)
{
	if (auto screen = DynamicCast<CharacterScreen>(GetScreen(kCharacter)))
	{
		screen->SetNpc(npcId);
		screen->SetMode(CharacterScreen::Mode::None);
	}

	ShowScreen(kCharacter);
}

void ColorTownGame::ShowDate(const String& npcId, const String& spotId, const Vector<String>& lines)
{
	if (auto screen = DynamicCast<DateScreen>(GetScreen(kDate)))
		screen->SetScene(npcId, spotId, lines);

	ShowScreen(kDate);
}

void ColorTownGame::OpenWindow(const String& name)
{
	CloseWindow();

	mWindow = GetScreen(name);
	if (!mWindow)
		return;

	mWindowName = name;
	mWindow->Show();
	mWindow->Refresh();
}

void ColorTownGame::OpenWarehouse()
{
	OpenWindow(kWarehouse);
}

void ColorTownGame::OpenBuild(int slot)
{
	if (auto window = DynamicCast<BuildWindow>(GetScreen(kBuild)))
		window->SetSlot(slot);

	OpenWindow(kBuild);
}

void ColorTownGame::CloseWindow()
{
	if (!mWindow)
		return;

	mWindow->Hide();
	mWindow = nullptr;
	mWindowName = "";
}

void ColorTownGame::RefreshAll()
{
	mRefreshPending = true;
}

void ColorTownGame::RefreshNow()
{
	mRefreshPending = false;

	if (mHud)
		mHud->Refresh(mModel);

	if (mCurrent)
		mCurrent->Refresh();

	if (mWindow)
		mWindow->Refresh();
}

void ColorTownGame::Notify(const String& text)
{
	if (!mToast)
		return;

	mToast->SetText((WString)text);
	mToast->SetEnabledForcible(true);
	mToastTime = 2.5f;
}

void ColorTownGame::Save() const
{
	if (savePath.IsEmpty() || !mModel || !mModel->IsValid())
		return;

	OutFile file(savePath);
	if (file.IsOpened())
	{
		String json = mModel->GetString("ToJson");
		file.WriteData(json.Data(), json.Length());
	}
}

const String& ColorTownGame::GetCurrentScreenName() const
{
	return mCurrentName;
}

Ref<Screen> ColorTownGame::GetCurrentScreen() const
{
	return mCurrent;
}

Ref<Screen> ColorTownGame::GetScreen(const String& name) const
{
	for (auto& pair : mScreens)
	{
		if (pair.first == name)
			return pair.second;
	}

	return nullptr;
}

const String& ColorTownGame::GetWindowName() const
{
	return mWindowName;
}

Ref<Screen> ColorTownGame::GetWindow() const
{
	return mWindow;
}

Ref<GlassScreen> ColorTownGame::GetGlassScreen() const
{
	return DynamicCast<GlassScreen>(GetScreen(kGlass));
}

Ref<ColorTownGame> ColorTownGame::Find()
{
	for (auto& actor : o2Scene.GetRootActors())
	{
		if (auto game = actor->GetComponent<ColorTownGame>())
			return game;
	}

	return nullptr;
}

Ref<Actor> ColorTownGame::CreateBootstrapActor()
{
	auto actor = mmake<Actor>(ActorCreateMode::InScene);
	actor->SetName("Game");
	actor->transform->SetPosition2D(Vec2F());
	GameModel::CreateOn(actor);
	actor->AddComponent<ColorTownGame>();
	return actor;
}

DECLARE_TEMPLATE_CLASS(o2::LinkRef<ColorTownGame>);
// --- META ---

DECLARE_CLASS(ColorTownGame, ColorTownGame);
// --- END META ---
