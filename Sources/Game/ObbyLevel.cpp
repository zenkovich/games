#include "o2/stdafx.h"
#include "ObbyLevel.h"

#include "o2/Utils/FileSystem/FileSystem.h"

namespace obby
{
	namespace
	{
		const char* kTileChars = ".#FIKDdV^vMNB<>GCTSEXe";

		template<typename T>
		void ReadMember(const DataValue& data, const char* name, T& value)
		{
			if (auto member = data.FindMember(name))
				member->Get(value);
		}
	}

	Tile TileFromChar(char c)
	{
		for (int i = 0; kTileChars[i]; i++)
		{
			if (kTileChars[i] == c)
				return (Tile)i;
		}

		return Tile::Empty;
	}

	char CharFromTile(Tile tile)
	{
		return kTileChars[(int)tile];
	}

	bool IsStaticSolid(Tile tile)
	{
		switch (tile)
		{
			case Tile::Block:
			case Tile::Fake:
			case Tile::Invisible:
			case Tile::Mimic:
			case Tile::Blink:
			case Tile::BlinkAlt:
			case Tile::Shy:
			return true;

			default:
			return false;
		}
	}

	void Physics::Load(const DataValue& data)
	{
		ReadMember(data, "gravity", gravity);
		ReadMember(data, "lowGravity", lowGravity);
		ReadMember(data, "moveSpeed", moveSpeed);
		ReadMember(data, "jumpSpeed", jumpSpeed);
		ReadMember(data, "jumpCut", jumpCut);
		ReadMember(data, "bounceSpeed", bounceSpeed);
		ReadMember(data, "conveyorSpeed", conveyorSpeed);
		ReadMember(data, "moverSpeed", moverSpeed);
		ReadMember(data, "moverSpeedV", moverSpeedV);
		ReadMember(data, "fakeDelay", fakeDelay);
		ReadMember(data, "fakeFallSpeed", fakeFallSpeed);
		ReadMember(data, "blinkPeriod", blinkPeriod);
		ReadMember(data, "blinkVisible", blinkVisible);
		ReadMember(data, "shyRange", shyRange);
		ReadMember(data, "shyDelay", shyDelay);
		ReadMember(data, "shyHidden", shyHidden);
		ReadMember(data, "coyoteTime", coyoteTime);
		ReadMember(data, "jumpBuffer", jumpBuffer);
		ReadMember(data, "gravityCooldown", gravityCooldown);
		ReadMember(data, "startFallDelay", startFallDelay);
		ReadMember(data, "exitRunRange", exitRunRange);
		ReadMember(data, "maxFallSpeed", maxFallSpeed);
		ReadMember(data, "playerWidth", playerWidth);
		ReadMember(data, "playerHeight", playerHeight);
	}

	Tile LevelData::At(int col, int row) const
	{
		if (col < 0 || row < 0 || col >= kCols || row >= kRows || row >= rows.Count())
			return Tile::Empty;

		const String& line = rows[row];
		if (col >= line.Length())
			return Tile::Empty;

		return TileFromChar(line[col]);
	}

	bool LevelData::Find(Tile tile, int& col, int& row) const
	{
		for (int r = 0; r < kRows; r++)
		{
			for (int c = 0; c < kCols; c++)
			{
				if (At(c, r) == tile)
				{
					col = c;
					row = r;
					return true;
				}
			}
		}

		return false;
	}

	int LevelData::Count(Tile tile) const
	{
		int count = 0;
		for (int r = 0; r < kRows; r++)
		{
			for (int c = 0; c < kCols; c++)
			{
				if (At(c, r) == tile)
					count++;
			}
		}

		return count;
	}

	String LevelData::Validate() const
	{
		if (rows.Count() != kRows)
			return String("level '") + name + "': expected " + (String)kRows + " rows, got " + (String)rows.Count();

		for (int r = 0; r < kRows; r++)
		{
			if (rows[r].Length() != kCols)
				return String("level '") + name + "': row " + (String)r + " is " + (String)rows[r].Length() + " wide";

			for (int c = 0; c < kCols; c++)
			{
				char ch = rows[r][c];
				bool known = false;
				for (int i = 0; kTileChars[i]; i++)
					known |= kTileChars[i] == ch;

				if (!known)
					return String("level '") + name + "': unknown tile '" + String(ch) + "'";
			}
		}

		if (Count(Tile::Start) != 1)
			return String("level '") + name + "': needs exactly one start";

		if (Count(Tile::Exit) != 1)
			return String("level '") + name + "': needs exactly one exit";

		if (Count(Tile::ExitTarget) > 1)
			return String("level '") + name + "': more than one exit target";

		return String();
	}

	void LevelData::Load(const DataValue& data)
	{
		ReadMember(data, "name", name);
		ReadMember(data, "hint", hint);
		ReadMember(data, "mirror", mirror);
		ReadMember(data, "lowGravity", lowGravity);
		ReadMember(data, "startFalls", startFalls);
		ReadMember(data, "darkness", darkness);

		rows.Clear();
		if (auto rowsData = data.FindMember("rows"))
		{
			if (rowsData->IsArray())
			{
				for (auto it = rowsData->Begin(); it != rowsData->End(); ++it)
				{
					String row;
					it->Get(row);
					rows.Add(row);
				}
			}
		}
	}

	LevelData LevelData::FromRows(const Vector<String>& sourceRows)
	{
		LevelData level;
		level.name = "test";

		String empty;
		for (int i = 0; i < kCols; i++)
			empty += ".";

		for (int i = 0; i < kRows - sourceRows.Count(); i++)
			level.rows.Add(empty);

		for (auto& row : sourceRows)
		{
			String line = row;
			while (line.Length() < kCols)
				line += ".";

			level.rows.Add(line);
		}

		return level;
	}

	bool LevelSet::LoadFromJson(const String& json)
	{
		DataDocument doc;
		if (!doc.LoadFromData(json))
			return false;

		Load(doc);
		return !levels.IsEmpty();
	}

	bool LevelSet::LoadFromFile(const String& path)
	{
		if (!o2FileSystem.IsFileExist(path))
			return false;

		return LoadFromJson(o2FileSystem.ReadFile(path));
	}

	void LevelSet::Load(const DataValue& data)
	{
		levels.Clear();

		if (auto physicsData = data.FindMember("physics"))
			physics.Load(*physicsData);

		if (auto levelsData = data.FindMember("levels"))
		{
			if (levelsData->IsArray())
			{
				for (auto it = levelsData->Begin(); it != levelsData->End(); ++it)
				{
					LevelData level;
					level.Load(*it);
					levels.Add(level);
				}
			}
		}
	}

	String LevelSet::Validate() const
	{
		if (levels.IsEmpty())
			return "no levels";

		for (auto& level : levels)
		{
			String problem = level.Validate();
			if (!problem.IsEmpty())
				return problem;
		}

		return String();
	}
}
// --- META ---

ENUM_META(obby::Tile, obby__Tile)
{
    ENUM_ENTRY(Blink);
    ENUM_ENTRY(BlinkAlt);
    ENUM_ENTRY(Block);
    ENUM_ENTRY(Bounce);
    ENUM_ENTRY(Checkpoint);
    ENUM_ENTRY(ConveyorLeft);
    ENUM_ENTRY(ConveyorRight);
    ENUM_ENTRY(Empty);
    ENUM_ENTRY(Exit);
    ENUM_ENTRY(ExitTarget);
    ENUM_ENTRY(Fake);
    ENUM_ENTRY(FakeCheckpoint);
    ENUM_ENTRY(FakeExit);
    ENUM_ENTRY(Gravity);
    ENUM_ENTRY(Invisible);
    ENUM_ENTRY(Mimic);
    ENUM_ENTRY(MoverH);
    ENUM_ENTRY(MoverV);
    ENUM_ENTRY(Shy);
    ENUM_ENTRY(SpikeDown);
    ENUM_ENTRY(SpikeUp);
    ENUM_ENTRY(Start);
}
END_ENUM_META;
// --- END META ---
