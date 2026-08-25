#include "o2/stdafx.h"
#include "UI/UIKit.h"

#include "o2/Assets/Types/ImageAsset.h"
#include "o2/Assets/Types/VectorFontAsset.h"
#include "o2/Render/Render.h"
#include "o2/Render/Sprite.h"
#include "o2/Render/Text.h"
#include "o2/Scene/UI/WidgetLayer.h"
#include "o2/Scene/UI/WidgetLayout.h"
#include "o2/Utils/Math/Math.h"

namespace UI
{
	const Vec2F kDesignSize(1080.0f, 1920.0f);
	const Vec2F kCenter(0.5f, 0.5f);
	const char* kTitleFont = "Fonts/Title.ttf";
	const char* kTextFont = "Fonts/Text.ttf";

	const Color4 kTextDark(92, 58, 38);
	const Color4 kTextLight(255, 255, 255);
	const Color4 kTextGood(60, 150, 50);
	const Color4 kTextBad(215, 70, 60);

	namespace
	{
		bool HasRender()
		{
			return Render::IsSingletonInitialzed();
		}

		Ref<Sprite> MakeSprite(const String& imagePath, int sliceBorder)
		{
			auto sprite = mmake<Sprite>(imagePath);
			if (sliceBorder > 0)
			{
				sprite->SetMode(SpriteMode::Sliced);
				sprite->SetSliceBorder(BorderI(sliceBorder, sliceBorder, sliceBorder, sliceBorder));
			}

			return sprite;
		}
	}

	void SetLayout(const Ref<Widget>& widget, const Vec2F& anchor, const Vec2F& pos, const Vec2F& size)
	{
		widget->layout->anchorMin = anchor;
		widget->layout->anchorMax = anchor;
		widget->layout->offsetMin = pos - size*0.5f;
		widget->layout->offsetMax = pos + size*0.5f;
	}

	Ref<Widget> MakeRoot(const String& name)
	{
		auto root = mmake<Widget>();
		root->SetName(name);
		SetLayout(root, kCenter, Vec2F(), kDesignSize);
		return root;
	}

	Ref<Widget> MakeContainer(const String& name, const Vec2F& anchor, const Vec2F& pos, const Vec2F& size)
	{
		auto widget = mmake<Widget>();
		widget->SetName(name);
		SetLayout(widget, anchor, pos, size);
		return widget;
	}

	Ref<Image> MakeImage(const String& name, const String& imagePath, const Vec2F& anchor, const Vec2F& pos,
						 const Vec2F& size, int sliceBorder)
	{
		auto image = mmake<Image>();
		image->SetName(name);

		if (HasRender() && !imagePath.IsEmpty())
			image->SetImage(MakeSprite(imagePath, sliceBorder));

		SetLayout(image, anchor, pos, size);
		return image;
	}

	Ref<Image> MakePanel(const String& name, const Vec2F& anchor, const Vec2F& pos, const Vec2F& size,
						 const String& imagePath)
	{
		return MakeImage(name, imagePath, anchor, pos, size, 30);
	}

	Ref<Label> MakeLabel(const String& name, const WString& text, const Vec2F& anchor, const Vec2F& pos,
						 const Vec2F& size, int height, const Color4& color, bool title, HorAlign align)
	{
		// The Label constructor already loads a font, so no labels without render at all
		if (!HasRender())
			return nullptr;

		auto label = mmake<Label>();
		label->SetName(name);
		label->SetFontAsset(AssetRef<FontAsset>(String(title ? kTitleFont : kTextFont)));
		label->SetText(text);
		label->SetHeight(height);
		label->SetColor(color);
		label->SetHorAlign(align);
		label->SetVerAlign(VerAlign::Middle);
		label->SetHorOverflow(Label::HorOverflow::Wrap);
		SetLayout(label, anchor, pos, size);
		return label;
	}

	Ref<Button> MakeButton(const String& name, const WString& caption, const String& style, const Vec2F& anchor,
						   const Vec2F& pos, const Vec2F& size, const Function<void()>& onClick, int captionHeight)
	{
		auto button = mmake<Button>();
		button->SetName(name);

		if (HasRender())
		{
			button->AddLayer("regular", MakeSprite(String("UI/btn_") + style + ".png", 30), Layout::BothStretch());

			auto text = mmake<Text>(String(kTitleFont));
			text->SetHeight(captionHeight);
			text->SetHorAlign(HorAlign::Middle);
			text->SetVerAlign(VerAlign::Middle);
			text->SetText(caption);
			button->AddLayer("caption", text, Layout::BothStretch(0, 8, 0, 0));
		}

		button->onClick = onClick;
		SetLayout(button, anchor, pos, size);
		button->layout->SetPivot2D(kCenter);
		return button;
	}

	Ref<Button> MakeIconButton(const String& name, const String& iconPath, const Vec2F& anchor, const Vec2F& pos,
							   const Vec2F& size, const Function<void()>& onClick)
	{
		auto button = mmake<Button>();
		button->SetName(name);

		if (HasRender() && !iconPath.IsEmpty())
			button->AddLayer("regular", MakeSprite(iconPath, 0), Layout::BothStretch());

		button->onClick = onClick;
		SetLayout(button, anchor, pos, size);
		button->layout->SetPivot2D(kCenter);
		return button;
	}

	Ref<Widget> MakeProgress(const String& name, const Vec2F& anchor, const Vec2F& pos, const Vec2F& size,
							 const String& fillPath)
	{
		auto bar = MakeContainer(name, anchor, pos, size);

		auto back = MakeImage("bg", "UI/bar_bg.png", kCenter, Vec2F(), size, 14);
		back->layout->anchorMin = Vec2F(0, 0);
		back->layout->anchorMax = Vec2F(1, 1);
		back->layout->offsetMin = Vec2F();
		back->layout->offsetMax = Vec2F();
		bar->AddChildWidget(back);

		auto fill = MakeImage("fill", fillPath, kCenter, Vec2F(), size, 14);
		fill->layout->anchorMin = Vec2F(0, 0);
		fill->layout->anchorMax = Vec2F(0.5f, 1);
		fill->layout->offsetMin = Vec2F(4, 4);
		fill->layout->offsetMax = Vec2F(-4, -4);
		bar->AddChildWidget(fill);

		return bar;
	}

	void SetProgress(const Ref<Widget>& bar, float progress)
	{
		auto fill = bar->GetChildWidget("fill");
		if (!fill)
			return;

		progress = Math::Clamp01(progress);
		fill->SetEnabledForcible(progress > 0.001f);
		fill->layout->anchorMax = Vec2F(Math::Max(progress, 0.06f), 1.0f);
	}

	Ref<Button> MakeDim(const String& name, const Function<void()>& onClick)
	{
		auto dim = mmake<Button>();
		dim->SetName(name);

		if (HasRender())
		{
			auto sprite = MakeSprite("UI/white.png", 0);
			sprite->SetColor(Color4(30, 20, 15, 170));
			dim->AddLayer("regular", sprite, Layout::BothStretch());
		}

		dim->onClick = onClick;
		SetLayout(dim, kCenter, Vec2F(), kDesignSize*1.5f);
		return dim;
	}

	void SetText(const Ref<Label>& label, const WString& text)
	{
		if (label)
			label->SetText(text);
	}

	void SetText(const Ref<Label>& label, const String& text)
	{
		SetText(label, (WString)text);
	}

	void SetText(const Ref<Label>& label, const char* text)
	{
		SetText(label, (WString)String(text));
	}

	void SetImage(const Ref<Image>& image, const String& imagePath)
	{
		if (image && HasRender())
			image->SetImage(MakeSprite(imagePath, 0));
	}

	void SetEnabled(const Ref<Button>& button, bool enabled)
	{
		if (!button)
			return;

		button->SetInteractable(enabled);
		button->SetTransparency(enabled ? 1.0f : 0.45f);
	}

	void SetCaption(const Ref<Button>& button, const WString& caption)
	{
		if (button && HasRender())
			button->SetCaption(caption);
	}

	String Seconds(float time)
	{
		return (String)Math::CeilToInt(time) + "s";
	}

	String Decimal(float value)
	{
		int whole = (int)value;
		int tenth = Math::RoundToInt((value - (float)whole)*10.0f);
		if (tenth >= 10)
		{
			whole++;
			tenth = 0;
		}

		return (String)whole + "." + (String)tenth;
	}
}
