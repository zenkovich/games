#include "o2/stdafx.h"
#include "o2/O2.h"
#include "o2/Application/Application.h"
#include "o2/Sound/SoundSystem.h"
#include <gtest/gtest.h>

#include <filesystem>
#include "o2libs/o2libs.h"

extern void InitializeTypeso2TestsSupport();
extern void InitializeTypesGameLib();

using namespace o2;

// Rendered test runner: full Application::Initialize with a real window and render
// device, so tests can drive the game through AppTestDriver (cursor input, frame
// pumping, screenshots). cwd is pinned to the executable folder so the relative
// asset paths resolve the same way as a direct launch from Bin.
int main(int argc, char** argv)
{
	if (argc > 0 && argv[0])
	{
		std::filesystem::path exe(argv[0]);
		if (exe.has_parent_path())
		{
			std::error_code ec;
			std::filesystem::current_path(exe.parent_path(), ec);
		}
	}

	InitializeTypeso2TestsSupport();
	InitializeTypesGameLib();
	O2LIBS_INITIALIZE_TYPES;
	INITIALIZE_O2;

	::testing::InitGoogleTest(&argc, argv);

	bool listOnly = ::testing::GTEST_FLAG(list_tests);

	// The suites bring up a real window: keep it out of the focus and the audio out of the speakers,
	// otherwise a test run makes the machine unusable
	Integration::SetBackgroundWindow(true);
	SoundSystem::SetSilent(true);

	Ref<Application> app;
	if (!listOnly)
	{
		app = mmake<Application>();
		app->Initialize();
		O2LIBS_START;
	}

	int result = RUN_ALL_TESTS();

	if (app)
		app->Deinitialize();

	return result;
}
