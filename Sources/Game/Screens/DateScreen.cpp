#include "o2/stdafx.h"
#include "Screens/DateScreen.h"

#include "ColorTownGame.h"
#include "UI/UIKit.h"
#include "o2/Render/Render.h"
#include "o2/Scene/Components/ImageComponent.h"

using namespace UI;

void DateScreen::Build()
{
	auto back = mmake<Actor>(ActorCreateMode::InScene);
	back->SetName("Background");
	back->transform->SetSize2D(kDesignSize);
	if (Render::IsSingletonInitialzed())
	{
		auto image = mmake<ImageComponent>(String("UI/white.png"));
		image->SetColor(Color4(60, 40, 70));
		back->AddComponent(image);
	}
	back->SetParent(mRoot, false);
	back->transform->SetPosition2D(Vec2F());
	back->SetIndexInSiblings(0);

	mBackground = MakeImage("Scene", "", kCenter, Vec2F(0, 500), Vec2F(1080, 806));
	mUI->AddChildWidget(mBackground);

	mPortrait = MakeImage("Portrait", "", kCenter, Vec2F(-290, -130), Vec2F(520, 520));
	mUI->AddChildWidget(mPortrait);

	mUI->AddChildWidget(MakePanel("TextPanel", kCenter, Vec2F(0, -600), Vec2F(1000, 340)));
	mTitle = MakeLabel("Title", "", kCenter, Vec2F(0, -480), Vec2F(900, 60), 40, kTextDark, true);
	if (mTitle)
		mUI->AddChildWidget(mTitle);
	mText = MakeLabel("Text", "", kCenter, Vec2F(0, -610), Vec2F(900, 180), 34, kTextDark);
	if (mText)
		mUI->AddChildWidget(mText);

	mNextButton = MakeButton("NextButton", "Next", "pink", kCenter, Vec2F(340, -840), Vec2F(300, 100), [this] { Next(); }, 38);
	mUI->AddChildWidget(mNextButton);
}

void DateScreen::SetScene(const String& npcId, const String& spotId, const Vector<String>& lines)
{
	mNpc = npcId;
	mSpot = spotId;
	mLines = lines;
	mLineIndex = 0;
}

const String& DateScreen::GetNpc() const
{
	return mNpc;
}

int DateScreen::GetLineIndex() const
{
	return mLineIndex;
}

Ref<Button> DateScreen::GetNextButton() const
{
	return mNextButton;
}

void DateScreen::Refresh()
{
	auto model = Model();

	SetImage(mBackground, "Backgrounds/date_" + mSpot + ".png");
	SetImage(mPortrait, "Npc/" + mNpc + ".png");
	SetText(mTitle, "A date with " + model->GetString("GetNpcName", mNpc) + " at the " + model->GetString("GetBuildingName", mSpot));
	SetText(mText, mLineIndex < mLines.Count() ? mLines[mLineIndex] : String(""));
	SetCaption(mNextButton, mLineIndex + 1 < mLines.Count() ? WString("Next") : WString("Finish"));
}

void DateScreen::Next()
{
	mLineIndex++;
	if (mLineIndex >= mLines.Count())
	{
		Game()->ShowCharacter(mNpc);
		return;
	}

	Refresh();
}
