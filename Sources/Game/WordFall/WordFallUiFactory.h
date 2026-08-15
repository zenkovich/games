#pragma once

#include "o2/Utils/Math/Color.h"
#include "o2/Utils/Math/Layout.h"
#include "o2/Utils/Types/Ref.h"
#include "o2/Utils/Types/String.h"

using namespace o2;

namespace o2
{
	class Actor;
	class Button;
	class Image;
	class Label;
	class Sprite;
	class Text;
	class Widget;

	FORWARD_CLASS_REF(HorizontalProgress);
}

// Фабрика UI Word Fall: виджеты с якорями WidgetLayout, кнопки со стейтом
// вдавливания и билдеры прототипов (плитка, слот слова, бустер).
// Все координаты — офсеты от якорной точки родителя
class WordFallUiFactory
{
public:
	static constexpr float kTileSize = 88.0f;
	static constexpr float kSlotSize = 64.0f;
	static constexpr float kFlightDuration = 0.45f; // длительность анимации полёта буквы в бар

	// Виджет-контейнер секции с якорем в родителе
	static Ref<Widget> CreateSection(const Ref<Actor>& parent, const String& name,
									 const Vec2F& anchor, const Vec2F& pos, const Vec2F& size);

	// Картинка с якорной точкой
	static Ref<Image> CreateImage(const Ref<Actor>& parent, const String& name, const String& image,
								  const Vec2F& anchor, const Vec2F& pos, const Vec2F& size,
								  float depth, const BorderI& slice = BorderI(),
								  const Color4& color = Color4::White());

	// Картинка, растянутая по родителю
	static Ref<Image> CreateStretchedImage(const Ref<Actor>& parent, const String& name, const String& image,
										   const BorderF& borders, float depth,
										   const BorderI& slice = BorderI(), const Color4& color = Color4::White());

	// Текстовая метка с якорной точкой; heavy — жирное начертание (заголовки, цифры)
	static Ref<Label> CreateLabel(const Ref<Actor>& parent, const String& name, const WString& text,
								  const Vec2F& anchor, const Vec2F& pos, const Vec2F& size,
								  int height, const Color4& color, HorAlign horAlign, float depth = 20.0f,
								  bool heavy = false);

	// Горизонтальный прогресс-бар со слоем заливки
	static Ref<HorizontalProgress> CreateProgressBar(const Ref<Actor>& parent, const String& name,
													 const String& fillImage, const Vec2F& anchor,
													 const Vec2F& pos, const Vec2F& size, float depth);

	// Билдеры прототипов: создают актор вне сцены. У кнопок стейт вдавливания живёт
	// на внутренней кнопке в стабильном full-stretch лэйауте — инстансы можно
	// позиционировать любыми якорями, не ломая треки стейта
	static Ref<Actor> BuildTilePrototype();
	static Ref<Actor> BuildWordSlotPrototype();
	static Ref<Actor> BuildBoosterPrototype();
	static Ref<Actor> BuildIconButtonPrototype();
	static Ref<Actor> BuildPillButtonPrototype();
	static Ref<Actor> BuildTaskRowPrototype();
	static Ref<Actor> BuildFlyingLetterPrototype();
	static Ref<Actor> BuildFxFlashPrototype();
	static Ref<Actor> BuildFxStarPrototype();
	static Ref<Actor> BuildFxGlowPrototype();
	static Ref<Actor> BuildFxBeamPrototype();

	// Общие хелперы
	static Ref<Sprite> MakeSliced(const String& image, const BorderI& slice);
	static Ref<Text> MakeText(int height, const Color4& color, bool heavy = false);
	static void SetAnchoredRect(const Ref<Widget>& widget, const Vec2F& anchor, const Vec2F& pos, const Vec2F& size);

	// Якоря с растяжкой: min/max якоря + офсеты краёв (адаптивная вёрстка)
	static void SetAnchors(const Ref<Widget>& widget, const Vec2F& anchorMin, const Vec2F& anchorMax,
						   const Vec2F& offsetMin, const Vec2F& offsetMax);
	static void SetDepth(const Ref<Widget>& widget, float depth);
	static void AddPressedState(const Ref<Button>& button, const String& image,
								const BorderI& slice, const Layout& layout, bool shift);

	// Цвета текстов игры
	static const Color4 kDarkText;
	static const Color4 kPointsText;
	static const Color4 kCaption;
	static const Color4 kCreamText;
	static const Color4 kAccent;
};
