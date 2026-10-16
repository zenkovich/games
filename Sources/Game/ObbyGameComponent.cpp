#include "o2/stdafx.h"
#include "ObbyGameComponent.h"

#include "o2/Application/Application.h"
#include "o2/Application/Input.h"
#include "o2/Application/VKCodes.h"
#include "o2/Assets/Assets.h"
#include "o2/Integration.h"
#include "o2/Render/Render.h"
#include "o2/Render/Text.h"
#include "o2/Scene/Actor.h"
#include "o2/Scene/Components/ImageComponent.h"
#include "o2/Scene/Scene.h"
#include "o2/Scene/UI/WidgetLayout.h"
#include "o2/Scene/UI/Widgets/Label.h"
#include "o2/Utils/Debug/Debug.h"
#include "o2/Utils/FileSystem/FileSystem.h"
#include "o2/Utils/Serialization/DataValue.h"

using obby::Box;
using obby::EventType;
using obby::Tile;
using obby::World;

namespace
{
	const char* kSprites = "PotatoObby/Sprites/";
	const char* kFont = "PotatoObby/roboto_medium.ttf";

	const float kDepthBackground = -10.0f;
	const float kDepthTiles = 0.0f;
	const float kDepthMovers = 1.0f;
	const float kDepthExit = 2.0f;
	const float kDepthPlayer = 5.0f;
	const float kDepthDarkness = 8.0f;
	const float kDepthHud = 10.0f;
	const float kDepthMenu = 20.0f;

	const Color4 kTextColor(255, 255, 255, 255);
	const Color4 kShadowColor(40, 25, 15, 255);
	const Color4 kAccentColor(255, 230, 90, 255);

	const Vec2F kTouchButtonSize(96.0f, 96.0f);
	const Vec2F kTouchButtonPos[3] = { Vec2F(-560.0f, -400.0f), Vec2F(-430.0f, -400.0f), Vec2F(560.0f, -400.0f) };

	const Vec2F kPlayButtonPos(0.0f, -20.0f);
	const Vec2F kPlayButtonSize(320.0f, 80.0f);
	const int kLevelColumns = 10;
	const Vec2F kLevelGridOrigin(-450.0f, -160.0f);
	const Vec2F kLevelButtonSize(80.0f, 60.0f);
	const float kLevelButtonStep = 100.0f;
}

void ObbyGameComponent::OnStart()
{
	LoadLevelSet();
	LoadProgress();

	if (!Integration::IsHeadless())
		BuildView();

	ShowMenu();
}

bool ObbyGameComponent::LoadLevelSet()
{
	String path = o2Assets.GetBuiltAssetsPath() + levelsPath;
	if (!mLevels.LoadFromFile(path))
	{
		o2Debug.LogError("Potato Obby: can't load levels from " + path);
		return false;
	}

	String problem = mLevels.Validate();
	if (!problem.IsEmpty())
		o2Debug.LogError("Potato Obby: " + problem);

	return problem.IsEmpty();
}

void ObbyGameComponent::LoadProgress()
{
	DataDocument doc;
	if (!o2FileSystem.IsFileExist(savePath) || !doc.LoadFromFile(savePath))
		return;

	if (auto unlocked = doc.FindMember("unlocked"))
		unlocked->Get(mUnlocked);

	if (auto deaths = doc.FindMember("totalDeaths"))
		deaths->Get(mTotalDeaths);

	if (auto time = doc.FindMember("totalTime"))
		time->Get(mTotalTime);

	mUnlocked = Math::Clamp(mUnlocked, 1, Math::Max(1, mLevels.levels.Count()));
}

void ObbyGameComponent::SaveProgress()
{
	DataDocument doc;
	doc["unlocked"] = mUnlocked;
	doc["totalDeaths"] = mTotalDeaths;
	doc["totalTime"] = mTotalTime;
	doc.SaveToFile(savePath);
}

void ObbyGameComponent::ShowMenu()
{
	mScreen = Screen::Menu;
	mMessage.Clear();
	mMessageTimer = 0.0f;
	ClearLevelView();

	if (mViewBuilt)
	{
		mMenu->SetEnabled(true);
		mHud->SetEnabled(false);
		mPopup->SetEnabled(false);
		mPlayer->SetEnabled(false);
		mExit->SetEnabled(false);
		for (auto& dark : mDarkness)
			dark->SetEnabled(false);

		SyncMenu();
	}
}

void ObbyGameComponent::StartLevel(int index)
{
	if (mLevels.levels.IsEmpty())
		return;

	mLevelIndex = Math::Clamp(index, 0, mLevels.levels.Count() - 1);
	mWorld.Load(mLevels.levels[mLevelIndex], mLevels.physics);
	mScreen = Screen::Playing;
	mWonTimer = 0.0f;

	BuildLevelView();

	if (mViewBuilt)
	{
		mMenu->SetEnabled(false);
		mHud->SetEnabled(true);
		mPopup->SetEnabled(false);
		mPlayer->SetEnabled(true);
		mExit->SetEnabled(true);
		for (auto& dark : mDarkness)
			dark->SetEnabled(mWorld.GetLevel().darkness);
	}

	SetLabel(mTitleLabel, String("Уровень ") + (String)(mLevelIndex + 1) + ": " + mWorld.GetLevel().name);
	ShowMessage(mWorld.GetLevel().hint, 3.0f);
	SyncView();
}

void ObbyGameComponent::RestartLevel()
{
	if (mScreen != Screen::Playing)
		return;

	int deaths = mWorld.GetDeaths();
	mWorld.Load(mLevels.levels[mLevelIndex], mLevels.physics);
	for (int i = 0; i < deaths; i++)
		mWorld.Kill("restart");

	mWorld.TakeEvents();
	BuildLevelView();
	SyncView();
}

void ObbyGameComponent::NextLevel()
{
	if (mLevelIndex + 1 >= mLevels.levels.Count())
	{
		mScreen = Screen::Finished;
		if (mViewBuilt)
		{
			mPopup->SetEnabled(true);
			SetLabel(mPopupTitle, "Ты — Картошка-Легенда!");
			SetLabel(mPopupText, String("Все 30 уровней пройдены. Смертей: ") + (String)mTotalDeaths +
					 ", время: " + FormatTime(mTotalTime) + ". Нажми, чтобы вернуться в меню.");
		}
		return;
	}

	StartLevel(mLevelIndex + 1);
}

void ObbyGameComponent::SetExternalInput(bool left, bool right, bool jump)
{
	mExternalInput.left = left;
	mExternalInput.right = right;
	mExternalInput.jump = jump;
	mHasExternalInput = left || right || jump;
}

void ObbyGameComponent::ShowMessage(const String& text, float duration)
{
	mMessage = text;
	mMessageTimer = duration;
}

void ObbyGameComponent::OnUpdate(float dt)
{
	dt = Math::Min(dt, 0.1f);

	if (mMessageTimer > 0.0f)
	{
		mMessageTimer -= dt;
		if (mMessageTimer <= 0.0f)
			mMessage.Clear();
	}

	switch (mScreen)
	{
		case Screen::Menu:
		HandleMenuInput();
		break;

		case Screen::Playing:
		{
			if (o2Input.IsKeyPressed(VK_ESCAPE))
			{
				ShowMenu();
				return;
			}

			if (o2Input.IsKeyPressed(VK_R))
				RestartLevel();

			obby::Input input = ReadInput();
			mLastInput = input;

			const float step = 1.0f/120.0f;
			float left = dt;
			while (left > 0.0f && mScreen == Screen::Playing)
			{
				float sub = Math::Min(step, left);
				mWorld.Step(sub, input);
				left -= sub;
				HandleEvents();
			}
			break;
		}

		case Screen::LevelWon:
		mWonTimer -= dt;
		if (mWonTimer <= 0.0f || o2Input.IsCursorPressed() || o2Input.IsKeyPressed(VK_SPACE))
			NextLevel();
		break;

		case Screen::Finished:
		if (o2Input.IsCursorPressed() || o2Input.IsKeyPressed(VK_SPACE) || o2Input.IsKeyPressed(VK_ESCAPE))
			ShowMenu();
		break;
	}

	SyncView();
}

void ObbyGameComponent::HandleEvents()
{
	for (auto& event : mWorld.TakeEvents())
	{
		switch (event.type)
		{
			case EventType::Death:
			mTotalDeaths++;
			ShowMessage(event.text, 1.5f);
			break;

			case EventType::Win:
			{
				mTotalTime += mWorld.GetTime();
				mUnlocked = Math::Max(mUnlocked, Math::Min(mLevelIndex + 2, mLevels.levels.Count()));
				SaveProgress();

				mScreen = Screen::LevelWon;
				mWonTimer = wonDelay;
				if (mViewBuilt)
				{
					mPopup->SetEnabled(true);
					SetLabel(mPopupTitle, "Уровень пройден!");
					SetLabel(mPopupText, String("Смертей: ") + (String)mWorld.GetDeaths() + ", время: " + FormatTime(mWorld.GetTime()));
				}
				break;
			}

			case EventType::Teleport:
			case EventType::ExitRan:
			case EventType::Checkpoint:
			case EventType::GravityFlip:
			case EventType::Message:
			ShowMessage(event.text, 2.0f);
			break;

			default:
			break;
		}
	}
}

obby::Input ObbyGameComponent::ReadInput()
{
	obby::Input input;
	input.left = o2Input.IsKeyDown(VK_LEFT) || o2Input.IsKeyDown(VK_A);
	input.right = o2Input.IsKeyDown(VK_RIGHT) || o2Input.IsKeyDown(VK_D);
	input.jump = o2Input.IsKeyDown(VK_SPACE) || o2Input.IsKeyDown(VK_UP) || o2Input.IsKeyDown(VK_W);

	if (mViewBuilt)
	{
		input.left |= IsAnyCursorDownIn(GetTouchButtonBox(0));
		input.right |= IsAnyCursorDownIn(GetTouchButtonBox(1));
		input.jump |= IsAnyCursorDownIn(GetTouchButtonBox(2));
	}

	if (mHasExternalInput)
	{
		input.left |= mExternalInput.left;
		input.right |= mExternalInput.right;
		input.jump |= mExternalInput.jump;
	}

	return input;
}

Vec2F ObbyGameComponent::ScreenToWorld(const Vec2F& screenPos) const
{
	Vec2I resolution = o2Render.GetResolution();
	if (resolution.x <= 0 || resolution.y <= 0)
		return screenPos;

	float scale = Math::Min((float)resolution.x/kScreenW, (float)resolution.y/kScreenH);
	if (scale <= 0.0f)
		return screenPos;

	return screenPos/scale;
}

bool ObbyGameComponent::IsCursorInBox(const Box& box) const
{
	Vec2F pos = ScreenToWorld(o2Input.GetCursorPos());
	return pos.x >= box.left && pos.x <= box.right && pos.y >= box.bottom && pos.y <= box.top;
}

bool ObbyGameComponent::IsAnyCursorDownIn(const Box& box) const
{
	for (auto& cursor : o2Input.GetCursors())
	{
		if (!cursor.isPressed)
			continue;

		Vec2F pos = ScreenToWorld(cursor.position);
		if (pos.x >= box.left && pos.x <= box.right && pos.y >= box.bottom && pos.y <= box.top)
			return true;
	}

	return false;
}

Box ObbyGameComponent::GetPlayButtonBox() const
{
	return Box::FromCenter(kPlayButtonPos, kPlayButtonSize);
}

Box ObbyGameComponent::GetLevelButtonBox(int index) const
{
	int col = index%kLevelColumns, row = index/kLevelColumns;
	Vec2F pos = kLevelGridOrigin + Vec2F((float)col*kLevelButtonStep, -(float)row*(kLevelButtonSize.y + 20.0f));
	return Box::FromCenter(pos, kLevelButtonSize);
}

Box ObbyGameComponent::GetTouchButtonBox(int which) const
{
	return Box::FromCenter(kTouchButtonPos[Math::Clamp(which, 0, 2)], kTouchButtonSize);
}

void ObbyGameComponent::HandleMenuInput()
{
	if (o2Input.IsKeyPressed(VK_SPACE))
	{
		StartLevel(mUnlocked - 1);
		return;
	}

	if (!o2Input.IsCursorPressed())
		return;

	if (IsCursorInBox(GetPlayButtonBox()))
	{
		StartLevel(mUnlocked - 1);
		return;
	}

	for (int i = 0; i < mLevels.levels.Count() && i < mUnlocked; i++)
	{
		if (IsCursorInBox(GetLevelButtonBox(i)))
		{
			StartLevel(i);
			return;
		}
	}
}

String ObbyGameComponent::FormatTime(float seconds)
{
	int total = (int)seconds;
	int minutes = total/60, secs = total%60;
	String result = (String)minutes + ":";
	if (secs < 10)
		result += "0";
	result += (String)secs;
	return result;
}

Ref<Actor> ObbyGameComponent::MakeSprite(const Ref<Actor>& parent, const String& name, const String& image,
										 const Vec2F& pos, const Vec2F& size, float depth)
{
	auto actor = mmake<Actor>();
	actor->name = name;
	parent->AddChild(actor);

	auto sprite = actor->AddComponent<ImageComponent>();
	sprite->LoadFromImage(String(kSprites) + image, false);

	actor->SetDrawingDepthInheritFromParent(false);
	actor->drawDepth = depth;
	actor->transform->size = size;
	actor->transform->position = pos;
	return actor;
}

Ref<Label> ObbyGameComponent::MakeLabel(const Ref<Actor>& parent, const String& name, const String& text, int height,
										const Color4& color, const Vec2F& pos, const Vec2F& size, float depth)
{
	auto label = mmake<Label>();
	label->name = name;
	parent->AddChild(label);

	auto drawable = mmake<Text>(String(kFont));
	label->AddLayer("text", drawable, Layout::BothStretch());
	label->SetHeight(height);
	label->SetColor(color);
	label->SetHorAlign(HorAlign::Middle);
	label->SetVerAlign(VerAlign::Middle);
	label->SetText(WString(text));

	label->layout->anchorMin = Vec2F(0.5f, 0.5f);
	label->layout->anchorMax = Vec2F(0.5f, 0.5f);
	label->layout->offsetMin = pos - size*0.5f;
	label->layout->offsetMax = pos + size*0.5f;
	label->SetDrawingDepthInheritFromParent(false);
	label->drawDepth = depth;
	return label;
}

void ObbyGameComponent::SetLabel(const Ref<Label>& label, const String& text)
{
	if (label)
		label->SetText(WString(text));
}

void ObbyGameComponent::BuildView()
{
	auto owner = GetActor();
	if (!owner)
		return;

	mRoot = mmake<Actor>();
	mRoot->name = "View";
	owner->AddChild(mRoot);

	mBackground = MakeSprite(mRoot, "Background", "background.png", Vec2F(), Vec2F(kScreenW, kScreenH), kDepthBackground);

	mLevelRoot = mmake<Actor>();
	mLevelRoot->name = "Level";
	mRoot->AddChild(mLevelRoot);

	mExit = MakeSprite(mRoot, "Exit", "exit.png", Vec2F(), Vec2F(World::kTile, 48.0f), kDepthExit);
	mPlayer = MakeSprite(mRoot, "Player", "potato.png", Vec2F(), Vec2F(40.0f, 44.0f), kDepthPlayer);

	for (int i = 0; i < 4; i++)
	{
		auto dark = MakeSprite(mRoot, String("Darkness") + (String)i, "dark.png", Vec2F(), Vec2F(10.0f, 10.0f), kDepthDarkness);
		dark->SetEnabled(false);
		mDarkness.Add(dark);
	}

	mHud = mmake<Actor>();
	mHud->name = "HUD";
	mRoot->AddChild(mHud);

	auto panel = MakeSprite(mHud, "TopPanel", "dark.png", Vec2F(0.0f, kScreenH*0.5f - 26.0f), Vec2F(kScreenW, 52.0f), kDepthHud);
	panel->GetComponent<ImageComponent>()->SetTransparency(0.45f);

	mTitleLabel = MakeLabel(mHud, "Title", "", 24, kAccentColor, Vec2F(-320.0f, kScreenH*0.5f - 26.0f), Vec2F(600.0f, 44.0f), kDepthHud + 1.0f);
	mTitleLabel->SetHorAlign(HorAlign::Left);
	mDeathsLabel = MakeLabel(mHud, "Deaths", "", 24, kTextColor, Vec2F(220.0f, kScreenH*0.5f - 26.0f), Vec2F(360.0f, 44.0f), kDepthHud + 1.0f);
	mTimeLabel = MakeLabel(mHud, "Time", "", 24, kTextColor, Vec2F(540.0f, kScreenH*0.5f - 26.0f), Vec2F(180.0f, 44.0f), kDepthHud + 1.0f);
	mMessageLabel = MakeLabel(mHud, "Message", "", 34, kAccentColor, Vec2F(0.0f, 120.0f), Vec2F(1100.0f, 60.0f), kDepthHud + 1.0f);
	mHintLabel = MakeLabel(mHud, "Help", "Стрелки / A D — идти, Space / W — прыжок, R — заново, Esc — меню", 18, kTextColor,
						   Vec2F(0.0f, -kScreenH*0.5f + 60.0f), Vec2F(700.0f, 30.0f), kDepthHud + 1.0f);

	const char* buttonImages[3] = { "btn_left.png", "btn_right.png", "btn_jump.png" };
	for (int i = 0; i < 3; i++)
		mTouchButtons.Add(MakeSprite(mHud, String("Touch") + (String)i, buttonImages[i], kTouchButtonPos[i], kTouchButtonSize, kDepthHud + 1.0f));

	mMenu = mmake<Actor>();
	mMenu->name = "Menu";
	mRoot->AddChild(mMenu);

	auto shade = MakeSprite(mMenu, "Shade", "dark.png", Vec2F(), Vec2F(kScreenW, kScreenH), kDepthMenu);
	shade->GetComponent<ImageComponent>()->SetTransparency(0.55f);

	MakeLabel(mMenu, "MenuTitle", "КАРТОФЕЛЬНОЕ ОББИ", 64, kAccentColor, Vec2F(0.0f, 230.0f), Vec2F(1100.0f, 90.0f), kDepthMenu + 1.0f);
	MakeLabel(mMenu, "MenuTagline", "Сложное тролль-обби. 30 уровней. Никому не верь.", 26, kTextColor, Vec2F(0.0f, 160.0f), Vec2F(1100.0f, 40.0f), kDepthMenu + 1.0f);
	MakeSprite(mMenu, "MenuPotato", "potato.png", Vec2F(-420.0f, 40.0f), Vec2F(120.0f, 132.0f), kDepthMenu + 1.0f);
	MakeSprite(mMenu, "MenuSack", "exit.png", Vec2F(420.0f, 40.0f), Vec2F(110.0f, 132.0f), kDepthMenu + 1.0f);

	auto play = MakeSprite(mMenu, "PlayButton", "white.png", kPlayButtonPos, kPlayButtonSize, kDepthMenu + 1.0f);
	play->GetComponent<ImageComponent>()->SetColor(Color4(96, 180, 60, 255));
	MakeLabel(mMenu, "PlayCaption", "ИГРАТЬ", 36, kTextColor, kPlayButtonPos, kPlayButtonSize, kDepthMenu + 2.0f);
	mMenuSubtitle = MakeLabel(mMenu, "MenuSubtitle", "", 22, kTextColor, Vec2F(0.0f, -90.0f), Vec2F(1100.0f, 36.0f), kDepthMenu + 1.0f);

	for (int i = 0; i < mLevels.levels.Count(); i++)
	{
		Box box = GetLevelButtonBox(i);
		auto back = MakeSprite(mMenu, String("LevelButton") + (String)(i + 1), "white.png", box.Center(), kLevelButtonSize, kDepthMenu + 1.0f);
		back->GetComponent<ImageComponent>()->SetColor(Color4(139, 90, 43, 255));
		mLevelButtons.Add(MakeLabel(mMenu, String("LevelCaption") + (String)(i + 1), (String)(i + 1), 26, kTextColor, box.Center(), kLevelButtonSize, kDepthMenu + 2.0f));
	}

	mPopup = mmake<Actor>();
	mPopup->name = "Popup";
	mRoot->AddChild(mPopup);

	auto popupBack = MakeSprite(mPopup, "PopupBack", "dark.png", Vec2F(0.0f, 40.0f), Vec2F(760.0f, 220.0f), kDepthMenu);
	popupBack->GetComponent<ImageComponent>()->SetTransparency(0.8f);
	mPopupTitle = MakeLabel(mPopup, "PopupTitle", "", 44, kAccentColor, Vec2F(0.0f, 90.0f), Vec2F(740.0f, 70.0f), kDepthMenu + 1.0f);
	mPopupText = MakeLabel(mPopup, "PopupText", "", 24, kTextColor, Vec2F(0.0f, 10.0f), Vec2F(740.0f, 100.0f), kDepthMenu + 1.0f);
	mPopup->SetEnabled(false);

	mViewBuilt = true;
}

void ObbyGameComponent::ClearLevelView()
{
	if (!mViewBuilt)
		return;

	for (auto& actor : mTileActors)
	{
		if (actor)
			actor->Destroy();
	}
	mTileActors.Clear();

	for (auto& actor : mMoverActors)
		actor->Destroy();
	mMoverActors.Clear();
}

void ObbyGameComponent::BuildLevelView()
{
	if (!mViewBuilt)
		return;

	ClearLevelView();

	for (int r = 0; r < World::kRows; r++)
	{
		for (int c = 0; c < World::kCols; c++)
		{
			Tile type = mWorld.TileAt(c, r).type;
			const char* image = nullptr;
			Vec2F size(World::kTile, World::kTile);
			Vec2F scale(1.0f, 1.0f);

			switch (type)
			{
				case Tile::Block:
				case Tile::Fake:
				case Tile::Invisible:
				case Tile::Mimic:
				case Tile::Blink:
				case Tile::BlinkAlt:
				case Tile::Shy:
				image = "block.png"; break;

				case Tile::SpikeUp: image = "spike.png"; break;
				case Tile::SpikeDown: image = "spike.png"; scale.y = -1.0f; break;
				case Tile::Bounce: image = "bounce.png"; break;
				case Tile::ConveyorLeft: image = "conveyor.png"; scale.x = -1.0f; break;
				case Tile::ConveyorRight: image = "conveyor.png"; break;
				case Tile::Gravity: image = "gravity.png"; break;
				case Tile::Checkpoint:
				case Tile::FakeCheckpoint: image = "checkpoint.png"; break;
				case Tile::FakeExit: image = "exit.png"; size.y = 48.0f; break;

				default: break;
			}

			if (!image)
			{
				mTileActors.Add(nullptr);
				continue;
			}

			Vec2F pos = World::CellCenter(c, r);
			if (type == Tile::FakeExit)
				pos.y += 4.0f;

			auto actor = MakeSprite(mLevelRoot, String("Tile_") + (String)c + "_" + (String)r, image, pos, size, kDepthTiles);
			actor->transform->scale = scale;
			if (type == Tile::Invisible)
			{
				actor->GetComponent<ImageComponent>()->SetTransparency(0.45f);
				actor->SetEnabled(false);
			}

			mTileActors.Add(actor);
		}
	}

	int index = 0;
	for (auto& mover : mWorld.GetMovers())
	{
		auto actor = mmake<Actor>();
		actor->name = String("Mover") + (String)index++;
		mLevelRoot->AddChild(actor);
		actor->transform->position = mover.pos;

		for (int i = 0; i < mover.width; i++)
			MakeSprite(actor, String("Plank") + (String)i, "mover.png", Vec2F((float)i*World::kTile, 0.0f), Vec2F(World::kTile, World::kTile), kDepthMovers);

		mMoverActors.Add(actor);
	}
}

void ObbyGameComponent::SyncView()
{
	if (!mViewBuilt)
		return;

	if (mScreen == Screen::Menu)
		return;

	mPlayer->transform->position = mWorld.GetPlayerPos();
	mPlayer->transform->scale = Vec2F((float)mWorld.GetFacing(), (float)(-mWorld.GetGravityDir()));

	mExit->transform->position = mWorld.GetExitPos() + Vec2F(0.0f, 4.0f);

	for (int r = 0; r < World::kRows; r++)
	{
		for (int c = 0; c < World::kCols; c++)
		{
			auto& actor = mTileActors[r*World::kCols + c];
			if (!actor)
				continue;

			const auto& tile = mWorld.TileAt(c, r);
			switch (tile.type)
			{
				case Tile::Fake:
				{
					Vec2F pos = World::CellCenter(c, r);
					pos.y -= tile.fallOffset;
					actor->transform->position = pos;
					actor->SetEnabled(tile.fallOffset < 500.0f);
					break;
				}

				case Tile::Invisible:
				actor->SetEnabled(tile.revealed);
				break;

				case Tile::Blink:
				case Tile::BlinkAlt:
				case Tile::Shy:
				actor->SetEnabled(mWorld.IsTileVisible(c, r));
				break;

				default:
				break;
			}
		}
	}

	const auto& movers = mWorld.GetMovers();
	for (int i = 0; i < movers.Count() && i < mMoverActors.Count(); i++)
		mMoverActors[i]->transform->position = movers[i].pos;

	if (mWorld.GetLevel().darkness && mDarkness.Count() == 4)
	{
		Vec2F p = mWorld.GetPlayerPos();
		const float hole = 110.0f;
		const float big = 4000.0f;
		mDarkness[0]->transform->position = Vec2F(p.x, p.y + hole + big*0.5f);
		mDarkness[0]->transform->size = Vec2F(big, big);
		mDarkness[1]->transform->position = Vec2F(p.x, p.y - hole - big*0.5f);
		mDarkness[1]->transform->size = Vec2F(big, big);
		mDarkness[2]->transform->position = Vec2F(p.x - hole - big*0.5f, p.y);
		mDarkness[2]->transform->size = Vec2F(big, hole*2.0f);
		mDarkness[3]->transform->position = Vec2F(p.x + hole + big*0.5f, p.y);
		mDarkness[3]->transform->size = Vec2F(big, hole*2.0f);
	}

	SyncHud();
}

void ObbyGameComponent::SyncHud()
{
	SetLabel(mDeathsLabel, String("Смерти: ") + (String)mWorld.GetDeaths() + " (всего " + (String)mTotalDeaths + ")");
	SetLabel(mTimeLabel, FormatTime(mWorld.GetTime()));
	SetLabel(mMessageLabel, mMessage);
}

void ObbyGameComponent::SyncMenu()
{
	SetLabel(mMenuSubtitle, String("Открыто уровней: ") + (String)mUnlocked + " из " + (String)mLevels.levels.Count() +
			 ". Смертей всего: " + (String)mTotalDeaths);

	for (int i = 0; i < mLevelButtons.Count(); i++)
	{
		bool unlocked = i < mUnlocked;
		mLevelButtons[i]->SetColor(unlocked ? kTextColor : Color4(120, 120, 120, 255));
		auto back = mMenu->GetChild(String("LevelButton") + (String)(i + 1));
		if (back)
			back->GetComponent<ImageComponent>()->SetColor(unlocked ? Color4(139, 90, 43, 255) : Color4(70, 60, 50, 255));
	}
}
// --- META ---

ENUM_META(ObbyGameComponent::Screen, ObbyGameComponent__Screen)
{
    ENUM_ENTRY(Finished);
    ENUM_ENTRY(LevelWon);
    ENUM_ENTRY(Menu);
    ENUM_ENTRY(Playing);
}
END_ENUM_META;

DECLARE_CLASS(ObbyGameComponent, ObbyGameComponent);
// --- END META ---
