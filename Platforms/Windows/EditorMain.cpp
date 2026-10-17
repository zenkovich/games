#include "o2/stdafx.h"
#include "o2/O2.h"
#include "o2/Utils/Memory/MemoryAnalyzer.h"
#include "o2Editor/EditorApplication.h"
#include "o2Editor/EditorConfig.h"
#include "o2Editor/ToolsPanel.h"
#include "o2Editor/Windows/WindowsManager.h"
#include "o2libs/o2libs.h"

using namespace o2;

DECLARE_SINGLETON(Editor::WindowsManager);
DECLARE_SINGLETON(Editor::EditorConfig);
DECLARE_SINGLETON(Editor::ToolsPanel);

extern void InitializeTypeso2Editor();
extern void InitializeTypesGameLib();
extern void InitializeTypesEditorLib();

int main()
{
	o2::MemoryAnalyzer::enabledObjectsTracking = false;
	INITIALIZE_O2;
	InitializeTypesGameLib();
	O2LIBS_INITIALIZE_TYPES;
	InitializeTypeso2Editor();
	InitializeTypesEditorLib();
	o2::MemoryAnalyzer::enabledObjectsTracking = true;

	auto app = mmake<Editor::EditorApplication>();
	app->Initialize();
	O2LIBS_START;
	app->Launch();

	return 0;
}
