#pragma once

#include "ObbyLevel.h"
#include "o2/Utils/Math/Vector2.h"

namespace obby
{
	struct Input
	{
		bool left = false;
		bool right = false;
		bool jump = false;
	};

	// Axis-aligned box in world units, y up
	struct Box
	{
		float left = 0, bottom = 0, right = 0, top = 0;

		static Box FromCenter(const Vec2F& center, const Vec2F& size);
		Box Inset(float amount) const;
		Box Offset(const Vec2F& offset) const;
		bool Overlaps(const Box& other) const;
		Vec2F Center() const;
	};

	struct TileState
	{
		Tile type = Tile::Empty;
		bool triggered = false; // fake: stepped on, shy: player came close
		float timer = 0.0f;
		float fallDelay = 0.0f; // fake: time from trigger to fall
		bool fallen = false;
		float fallOffset = 0.0f; // fake: how far it has dropped, for the view
		bool revealed = false;   // invisible: touched at least once
		bool hidden = false;     // shy: currently gone
		float phaseOffset = 0.0f; // blink
	};

	struct Mover
	{
		Vec2F start;
		Vec2F pos;   // center of the first cell
		Vec2F dir;
		int width = 1;
		bool vertical = false;
		Vec2F delta; // movement in the last step

		Box GetBox() const;
	};

	enum class EventType
	{
		Death, Win, Message, Checkpoint, Teleport, Bounce, GravityFlip, ExitRan, Jump
	};

	struct Event
	{
		EventType type;
		String text;
	};

	// Simulation of one level: the player, tiles with their troll behaviour and moving platforms.
	// Pure logic, no scene; the view mirrors it every frame
	class World
	{
	public:
		static constexpr float kTile = 40.0f;
		static constexpr int kCols = LevelData::kCols;
		static constexpr int kRows = LevelData::kRows;

		static Vec2F CellCenter(int col, int row);
		static Box CellBox(int col, int row);
		static int ColOf(float x);
		static int RowOf(float y);

		void Load(const LevelData& level, const Physics& physics);
		void Step(float dt, const Input& input);

		void Kill(const String& reason);
		void Respawn();

		bool IsLoaded() const { return mLoaded; }
		const LevelData& GetLevel() const { return mLevel; }
		const Physics& GetPhysics() const { return mPhysics; }

		Vec2F GetPlayerPos() const { return mPos; }
		Vec2F GetPlayerVel() const { return mVel; }
		Box GetPlayerBox() const;
		bool IsOnGround() const { return mOnGround; }
		int GetGravityDir() const { return mGravityDir; }
		int GetFacing() const { return mFacing; }
		bool IsWon() const { return mWon; }
		int GetDeaths() const { return mDeaths; }
		float GetTime() const { return mTime; }
		Vec2F GetSpawnPos() const { return mSpawn; }
		Vec2F GetExitPos() const { return mExitPos; }
		bool HasExitRun() const { return mExitRan; }
		float GetBlinkTime() const { return mBlinkTime; }
		bool IsFrozen() const { return mFreeze > 0.0f; }

		const TileState& TileAt(int col, int row) const;
		bool IsTileSolidNow(int col, int row) const;
		bool IsTileVisible(int col, int row) const;
		const Vector<Mover>& GetMovers() const { return mMovers; }

		Vector<Event> TakeEvents();

		// Teleports the player, used by cheats and tests
		void SetPlayerPos(const Vec2F& pos);

	private:
		static constexpr float kEps = 0.01f;
		static constexpr float kFreezeTime = 0.5f;

		bool mLoaded = false;
		LevelData mLevel;
		Physics mPhysics;

		Vector<TileState> mTiles; // kCols*kRows, row-major
		Vector<Mover> mMovers;

		Vec2F mStart;
		Vec2F mSpawn;
		Vec2F mPos;
		Vec2F mVel;
		int mGravityDir = -1;
		int mFacing = 1;
		bool mOnGround = false;
		int mCarriedMover = -1;
		float mConveyorPush = 0.0f;
		float mCoyote = 0.0f;
		float mJumpBuffer = 0.0f;
		bool mPrevJump = false;
		float mGravityCooldown = 0.0f;
		float mFreeze = 0.0f; // pause after a death or a teleport, so a held key does not chain them

		Vec2F mExitPos;
		Vec2F mExitTarget;
		bool mHasExitTarget = false;
		bool mExitRan = false;

		bool mWon = false;
		bool mDead = false;
		int mDeaths = 0;
		float mTime = 0.0f;
		float mBlinkTime = 0.0f;

		Vector<Event> mEvents;

		TileState& Tile(int col, int row);
		void ResetTiles();
		void UpdateTiles(float dt);
		void UpdateMovers(float dt);
		bool IsMoverBlocked(const Mover& mover, const Vec2F& nextPos) const;
		void MoveAxis(float dx, float dy);
		void TouchTile(int col, int row);
		void ProbeGround();
		void CheckTriggers();
		void Emit(EventType type, const String& text = String());
	};
}
// --- META ---

PRE_ENUM_META(obby::EventType);
// --- END META ---
