#pragma once

#include "o2/Scene/Component.h"

using namespace o2;

// Lives on the "Game" actor of the bootstrap scene next to the ZeroLine.js component and
// registers the JS bridge, so the scene runs the game on its own — also when played from
// the editor, where the game application never starts
class ZeroLineHost: public Component
{
public:
	static String GetName();
	static String GetCategory();

	SERIALIZABLE(ZeroLineHost);
	CLONEABLE_REF(ZeroLineHost);

private:
	void OnStart() override;

	REF_COUNTERABLE_IMPL(Component);
};
// --- META ---

CLASS_BASES_META(ZeroLineHost)
{
    BASE_CLASS(Component);
}
END_META;
CLASS_FIELDS_META(ZeroLineHost)
{
}
END_META;
CLASS_METHODS_META(ZeroLineHost)
{

    FUNCTION().PUBLIC().SIGNATURE_STATIC(String, GetName);
    FUNCTION().PUBLIC().SIGNATURE_STATIC(String, GetCategory);
    FUNCTION().PRIVATE().SIGNATURE(void, OnStart);
}
END_META;
// --- END META ---
