#include "o2/stdafx.h"
#include "Screens/Screen.h"

#include "ColorTownGame.h"
#include "UI/UIKit.h"

Screen::Screen(const Ref<ColorTownGame>& game):
	mGame(game)
{}

void Screen::Create(const Ref<Actor>& parent, const String& name)
{
	mRoot = mmake<Actor>(ActorCreateMode::InScene);
	mRoot->SetName(name);
	mRoot->SetParent(parent, false);
	mRoot->transform->SetPosition2D(Vec2F());

	mUI = UI::MakeRoot("UI");
	mUI->SetParent(mRoot, false);

	Build();

	mRoot->SetEnabled(false);
}

void Screen::Show()
{
	if (mRoot->IsEnabled())
		return;

	mRoot->SetEnabled(true);
	Refresh();
	OnShown();
}

void Screen::Hide()
{
	if (!mRoot->IsEnabled())
		return;

	OnHidden();
	mRoot->SetEnabled(false);
}

bool Screen::IsShown() const
{
	return mRoot && mRoot->IsEnabled();
}

const Ref<Actor>& Screen::GetRoot() const
{
	return mRoot;
}

const Ref<Widget>& Screen::GetUI() const
{
	return mUI;
}

Ref<ColorTownGame> Screen::Game() const
{
	return mGame.Lock();
}

Ref<GameModel> Screen::Model() const
{
	auto game = mGame.Lock();
	return game ? game->GetModel() : nullptr;
}
