#pragma once

#include "o2/Scene/UI/Widget.h"
#include "o2/Scene/UI/Widgets/Button.h"
#include "o2/Scene/UI/Widgets/Image.h"
#include "o2/Scene/UI/Widgets/Label.h"
#include "o2/Utils/Function/Function.h"

using namespace o2;

// Builders for the game widgets. Positions are widget centers relative to the anchor point of
// the parent, in design pixels (1080x1920, origin in the middle, y up). Everything visual is
// skipped without the render device (headless tests): labels come back null, buttons and
// images stay as plain widgets so the screen structure and the click flow still exist.
namespace UI
{
	extern const Vec2F kDesignSize;
	extern const Vec2F kCenter;
	extern const char* kTitleFont;
	extern const char* kTextFont;

	extern const Color4 kTextDark;
	extern const Color4 kTextLight;
	extern const Color4 kTextGood;
	extern const Color4 kTextBad;

	void SetLayout(const Ref<Widget>& widget, const Vec2F& anchor, const Vec2F& pos, const Vec2F& size);

	Ref<Widget> MakeRoot(const String& name);

	Ref<Widget> MakeContainer(const String& name, const Vec2F& anchor, const Vec2F& pos, const Vec2F& size);

	Ref<Image> MakeImage(const String& name, const String& imagePath, const Vec2F& anchor, const Vec2F& pos,
						 const Vec2F& size, int sliceBorder = 0);

	Ref<Image> MakePanel(const String& name, const Vec2F& anchor, const Vec2F& pos, const Vec2F& size,
						 const String& imagePath = "UI/panel.png");

	Ref<Label> MakeLabel(const String& name, const WString& text, const Vec2F& anchor, const Vec2F& pos,
						 const Vec2F& size, int height, const Color4& color = kTextDark, bool title = false,
						 HorAlign align = HorAlign::Middle);

	Ref<Button> MakeButton(const String& name, const WString& caption, const String& style, const Vec2F& anchor,
						   const Vec2F& pos, const Vec2F& size, const Function<void()>& onClick, int captionHeight = 40);

	Ref<Button> MakeIconButton(const String& name, const String& iconPath, const Vec2F& anchor, const Vec2F& pos,
							   const Vec2F& size, const Function<void()>& onClick);

	// Progress bar: "bg" and "fill" images, fill stretched by SetProgress
	Ref<Widget> MakeProgress(const String& name, const Vec2F& anchor, const Vec2F& pos, const Vec2F& size,
							 const String& fillPath = "UI/bar_fill.png");
	void SetProgress(const Ref<Widget>& bar, float progress);

	// Dimmed full-screen backdrop for windows; the click closes them
	Ref<Button> MakeDim(const String& name, const Function<void()>& onClick);

	void SetText(const Ref<Label>& label, const WString& text);
	void SetText(const Ref<Label>& label, const String& text);
	void SetText(const Ref<Label>& label, const char* text);
	void SetImage(const Ref<Image>& image, const String& imagePath);
	void SetEnabled(const Ref<Button>& button, bool enabled);
	void SetCaption(const Ref<Button>& button, const WString& caption);

	String Seconds(float time);

	// One decimal place, e.g. "1.5"
	String Decimal(float value);
}
