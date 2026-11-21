#include "GameApplication.h"
#include "o2/O2.h"
#include "o2libs/o2libs.h"

#include <cstdlib>

extern void InitializeTypesGameLib();

int main()
{
	INITIALIZE_O2;
	{
		PROFILE_SAMPLE("Register game types");
		InitializeTypesGameLib();
		O2LIBS_INITIALIZE_TYPES;
	}

	// A tool that needs only the outcome of a run (a bot playing a level) keeps the window off the user's screen
	if (std::getenv("O2_BACKGROUND_WINDOW"))
		Integration::SetBackgroundWindow(true);

	auto app = mmake<GameApplication>();
	app->Initialize();
	{
		PROFILE_SAMPLE("Start o2libs");
		O2LIBS_START;
	}
	app->Launch();

	return 0;
}
