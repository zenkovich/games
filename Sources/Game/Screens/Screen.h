#pragma once

#include "Core/GameModel.h"
#include "o2/Scene/Actor.h"
#include "o2/Scene/UI/Widget.h"

using namespace o2;

class ColorTownGame;

// A screen or a window: owns a root actor with a design-sized UI widget; the game shows one
// screen and at most one window on top of it
class Screen: public RefCounterable
{
public:
	explicit Screen(const Ref<ColorTownGame>& game);
	virtual ~Screen() = default;

	// Creates the root under the parent and builds the content
	void Create(const Ref<Actor>& parent, const String& name);

	void Show();
	void Hide();
	bool IsShown() const;

	// Re-reads the model into the widgets
	virtual void Refresh() {}
	virtual void Update(float dt) {}

	const Ref<Actor>& GetRoot() const;
	const Ref<Widget>& GetUI() const;

protected:
	WeakRef<ColorTownGame> mGame;
	Ref<Actor>             mRoot;
	Ref<Widget>            mUI;

protected:
	virtual void Build() = 0;
	virtual void OnShown() {}
	virtual void OnHidden() {}

	Ref<ColorTownGame> Game() const;
	Ref<GameModel> Model() const;
};
