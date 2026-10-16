#pragma once

#include "o2/Utils/Serialization/DataValue.h"
#include "o2/Utils/Types/Containers/Vector.h"
#include "o2/Utils/Types/String.h"

using namespace o2;

namespace obby
{
	enum class Tile
	{
		Empty, Block, Fake, Invisible, Mimic, Blink, BlinkAlt, Shy, SpikeUp, SpikeDown, MoverH, MoverV,
		Bounce, ConveyorLeft, ConveyorRight, Gravity, Checkpoint, FakeCheckpoint, Start, Exit, FakeExit,
		ExitTarget
	};

	Tile TileFromChar(char c);
	char CharFromTile(Tile tile);

	// Solid for movers and the static view: dynamic tiles (fake, blink, shy) still count here
	bool IsStaticSolid(Tile tile);

	// Tunables shared by all levels, the "physics" object of levels.json
	struct Physics
	{
		float gravity = 2400.0f;
		float lowGravity = 1000.0f;
		float moveSpeed = 320.0f;
		float jumpSpeed = 800.0f;
		float jumpCut = 0.5f;
		float bounceSpeed = 1200.0f;
		float conveyorSpeed = 160.0f;
		float moverSpeed = 160.0f;
		float moverSpeedV = 100.0f;
		float fakeDelay = 0.25f;
		float fakeFallSpeed = 700.0f;
		float blinkPeriod = 3.0f;
		float blinkVisible = 2.0f;
		float shyRange = 2.0f;
		float shyDelay = 0.5f;
		float shyHidden = 2.0f;
		float coyoteTime = 0.08f;
		float jumpBuffer = 0.1f;
		float gravityCooldown = 0.6f;
		float startFallDelay = 1.0f;
		float exitRunRange = 3.5f;
		float maxFallSpeed = 1500.0f;
		float playerWidth = 28.0f;
		float playerHeight = 36.0f;

		void Load(const DataValue& data);
	};

	struct LevelData
	{
		static constexpr int kCols = 32;
		static constexpr int kRows = 18;

		String name;
		String hint;
		bool mirror = false;
		bool lowGravity = false;
		bool startFalls = false;
		bool darkness = false;
		Vector<String> rows; // kRows strings of kCols chars, row 0 at the top

		Tile At(int col, int row) const;
		bool Find(Tile tile, int& col, int& row) const;
		int Count(Tile tile) const;

		// Empty string when the level is well formed, otherwise the first problem found
		String Validate() const;

		void Load(const DataValue& data);
		static LevelData FromRows(const Vector<String>& rows);
	};

	struct LevelSet
	{
		Physics physics;
		Vector<LevelData> levels;

		bool LoadFromJson(const String& json);
		bool LoadFromFile(const String& path);
		void Load(const DataValue& data);

		String Validate() const;
	};
}
// --- META ---

PRE_ENUM_META(obby::Tile);
// --- END META ---
