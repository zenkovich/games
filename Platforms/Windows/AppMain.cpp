#include "GameApplication.h"
#include "o2/O2.h"
#include "o2libs/o2libs.h"

extern void InitializeTypesGameLib();

int main()
{
	INITIALIZE_O2;
	InitializeTypesGameLib();
	O2LIBS_INITIALIZE_TYPES;

	auto app = mmake<GameApplication>();
	app->Initialize();
	O2LIBS_START;
	app->Launch();

	return 0;
}
