#include "GameApplication.h"
#include "o2/O2.h"
#include "o2libs/o2libs.h"

extern void InitializeTypesGameLib();

int main()
{
	INITIALIZE_O2;
	{
		PROFILE_SAMPLE("Register game types");
		InitializeTypesGameLib();
		O2LIBS_INITIALIZE_TYPES;
	}

	auto app = mmake<GameApplication>();
	app->Initialize();
	{
		PROFILE_SAMPLE("Start o2libs");
		O2LIBS_START;
	}
	app->Launch();

	return 0;
}
