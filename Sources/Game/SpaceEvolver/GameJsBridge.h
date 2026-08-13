#pragma once

namespace space_evolver
{
	// Registers the global `Bridge` JS object: input, screen, configs, persistence,
	// styled UI widgets and logging. The JS game code is built on top of it
	void RegisterGameJsApi();

	// Removes the persistent save file (used by tests for a clean profile)
	void ResetPersistentSave();
}
