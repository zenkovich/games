#pragma once

#include "o2/Scene/Component.h"
#include "o2/Utils/Serialization/Serializable.h"

using namespace o2;

// The rotator's balance as the Live-ops tab holds it: a remote config is read whole into a
// serializable object, a field the config leaves out keeps its value
class RotatorBalance: public ISerializable
{
public:
	float speed = 45.0f;      // Degrees per second @SERIALIZABLE
	bool  clockwise = false;  // Turns the other way @SERIALIZABLE

	SERIALIZABLE(RotatorBalance);
};

// Rotates the owner actor around the Z axis with a constant speed. A minimal
// example of a game component: serializable field, editable in the editor,
// registered in reflection by the CodeTool - and of a remote config read in C++
class RotatorComponent: public Component
{
public:
	float  speed = 45.0f; // Rotation speed in degrees per second @SERIALIZABLE @EDITOR_PROPERTY
	String balanceConfig; // Remote config with a RotatorBalance that replaces the speed; empty - none @SERIALIZABLE @EDITOR_PROPERTY

public:
	// Returns the speed in effect: the remote balance when there is one, the field otherwise
	float GetEffectiveSpeed();

	SERIALIZABLE(RotatorComponent);
	CLONEABLE_REF(RotatorComponent);

private:
	RotatorBalance mBalance;              // The last remote balance read
	bool           mHasBalance = false;
	int            mBalanceRevision = -1; // Configs revision the balance was read at

private:
	// Called each frame; rotates the owner actor
	void OnUpdate(float dt) override;

	REF_COUNTERABLE_IMPL(Component);
};
// --- META ---

CLASS_BASES_META(RotatorBalance)
{
    BASE_CLASS(ISerializable);
}
END_META;
CLASS_FIELDS_META(RotatorBalance)
{
    FIELD().PUBLIC().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(45.0f).NAME(speed);
    FIELD().PUBLIC().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(false).NAME(clockwise);
}
END_META;
CLASS_METHODS_META(RotatorBalance)
{
}
END_META;

CLASS_BASES_META(RotatorComponent)
{
    BASE_CLASS(Component);
}
END_META;
CLASS_FIELDS_META(RotatorComponent)
{
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().DEFAULT_VALUE(45.0f).NAME(speed);
    FIELD().PUBLIC().EDITOR_PROPERTY_ATTRIBUTE().SERIALIZABLE_ATTRIBUTE().NAME(balanceConfig);
    FIELD().PRIVATE().NAME(mBalance);
    FIELD().PRIVATE().DEFAULT_VALUE(false).NAME(mHasBalance);
    FIELD().PRIVATE().DEFAULT_VALUE(-1).NAME(mBalanceRevision);
}
END_META;
CLASS_METHODS_META(RotatorComponent)
{

    FUNCTION().PUBLIC().SIGNATURE(float, GetEffectiveSpeed);
    FUNCTION().PRIVATE().SIGNATURE(void, OnUpdate, float);
}
END_META;
// --- END META ---
