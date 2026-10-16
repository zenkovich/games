#pragma once

#include "ObbyLevel.h"
#include "ObbyWorld.h"

namespace obbytest
{
	// Steps the world with fixed input for the given time at 120 Hz
	inline void Run(obby::World& world, float seconds, const obby::Input& input = obby::Input())
	{
		const float dt = 1.0f/120.0f;
		for (float t = 0.0f; t < seconds; t += dt)
			world.Step(dt, input);
	}

	// Naive runner: holds right and jumps when the ground ahead is missing or a fork is in the way.
	// Enough for the plain levels; returns true when the level was won within the time
	inline bool AutoRunRight(obby::World& world, float maxSeconds)
	{
		using namespace obby;

		const float dt = 1.0f/120.0f;
		float t = 0.0f;
		float jumpHold = 0.0f;
		while (t < maxSeconds && !world.IsWon())
		{
			Input input;
			input.right = true;

			Vec2F pos = world.GetPlayerPos();
			Box box = world.GetPlayerBox();
			int feetRow = World::RowOf(box.bottom - 4.0f);
			int col = World::ColOf(pos.x);

			bool gapAhead = false, hazardAhead = false;
			for (int ahead = 1; ahead <= 2; ahead++)
			{
				Tile under = world.TileAt(col + ahead, feetRow).type;
				Tile at = world.TileAt(col + ahead, feetRow - 1).type;
				if (ahead == 1 && !IsStaticSolid(under) && under != Tile::ConveyorLeft && under != Tile::ConveyorRight)
					gapAhead = true;
				if (under == Tile::SpikeUp || at == Tile::SpikeUp)
					hazardAhead = true;
			}

			if (world.IsOnGround() && (gapAhead || hazardAhead))
				jumpHold = 0.3f;

			if (jumpHold > 0.0f)
			{
				input.jump = true;
				jumpHold -= dt;
			}

			world.Step(dt, input);
			t += dt;
		}

		return world.IsWon();
	}
}
