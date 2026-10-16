#include "o2/stdafx.h"
#include "ObbyWorld.h"

#include <cmath>

namespace obby
{
	Box Box::FromCenter(const Vec2F& center, const Vec2F& size)
	{
		Box box;
		box.left = center.x - size.x*0.5f;
		box.right = center.x + size.x*0.5f;
		box.bottom = center.y - size.y*0.5f;
		box.top = center.y + size.y*0.5f;
		return box;
	}

	Box Box::Inset(float amount) const
	{
		Box box = *this;
		box.left += amount;
		box.right -= amount;
		box.bottom += amount;
		box.top -= amount;
		return box;
	}

	Box Box::Offset(const Vec2F& offset) const
	{
		Box box = *this;
		box.left += offset.x;
		box.right += offset.x;
		box.bottom += offset.y;
		box.top += offset.y;
		return box;
	}

	bool Box::Overlaps(const Box& other) const
	{
		return left < other.right && right > other.left && bottom < other.top && top > other.bottom;
	}

	Vec2F Box::Center() const
	{
		return Vec2F((left + right)*0.5f, (bottom + top)*0.5f);
	}

	Box Mover::GetBox() const
	{
		Box box;
		box.left = pos.x - World::kTile*0.5f;
		box.right = box.left + World::kTile*(float)width;
		box.bottom = pos.y - World::kTile*0.5f;
		box.top = pos.y + World::kTile*0.5f;
		return box;
	}

	Vec2F World::CellCenter(int col, int row)
	{
		return Vec2F(((float)col + 0.5f)*kTile - kCols*kTile*0.5f,
					 kRows*kTile*0.5f - ((float)row + 0.5f)*kTile);
	}

	Box World::CellBox(int col, int row)
	{
		return Box::FromCenter(CellCenter(col, row), Vec2F(kTile, kTile));
	}

	int World::ColOf(float x)
	{
		return (int)std::floor((x + kCols*kTile*0.5f)/kTile);
	}

	int World::RowOf(float y)
	{
		return (int)std::floor((kRows*kTile*0.5f - y)/kTile);
	}

	TileState& World::Tile(int col, int row)
	{
		return mTiles[row*kCols + col];
	}

	const TileState& World::TileAt(int col, int row) const
	{
		static TileState empty;
		if (col < 0 || row < 0 || col >= kCols || row >= kRows)
			return empty;

		return mTiles[row*kCols + col];
	}

	void World::Load(const LevelData& level, const Physics& physics)
	{
		mLevel = level;
		mPhysics = physics;
		mLoaded = true;

		mTiles.Clear();
		mMovers.Clear();
		for (int r = 0; r < kRows; r++)
		{
			for (int c = 0; c < kCols; c++)
			{
				TileState state;
				state.type = level.At(c, r);
				mTiles.Add(state);
			}
		}

		for (int r = 0; r < kRows; r++)
		{
			for (int c = 0; c < kCols; c++)
			{
				obby::Tile type = Tile(c, r).type;
				if (type == Tile::MoverH)
				{
					int width = 0;
					while (c + width < kCols && Tile(c + width, r).type == Tile::MoverH)
					{
						Tile(c + width, r).type = Tile::Empty;
						width++;
					}

					Mover mover;
					mover.start = CellCenter(c, r);
					mover.pos = mover.start;
					mover.dir = Vec2F(1, 0);
					mover.width = width;
					mMovers.Add(mover);
					c += width - 1;
				}
				else if (type == Tile::MoverV)
				{
					Tile(c, r).type = Tile::Empty;

					Mover mover;
					mover.start = CellCenter(c, r);
					mover.pos = mover.start;
					mover.dir = Vec2F(0, 1);
					mover.vertical = true;
					mMovers.Add(mover);
				}
			}
		}

		int col = 0, row = 0;
		if (level.Find(Tile::Start, col, row))
			mStart = CellCenter(col, row);
		else
			mStart = CellCenter(1, kRows - 2);

		if (level.startFalls)
		{
			for (int c = col - 1; c <= col + 3; c++)
			{
				if (c < 0 || c >= kCols || row + 1 >= kRows)
					continue;

				auto& under = Tile(c, row + 1);
				if (under.type == Tile::Block)
					under.type = Tile::Fake;
			}
		}

		if (level.Find(Tile::Exit, col, row))
			mExitPos = CellCenter(col, row);
		else
			mExitPos = CellCenter(kCols - 2, kRows - 2);

		mHasExitTarget = level.Find(Tile::ExitTarget, col, row);
		if (mHasExitTarget)
			mExitTarget = CellCenter(col, row);

		mExitRan = false;
		mSpawn = mStart;
		mDeaths = 0;
		mTime = 0.0f;
		mBlinkTime = 0.0f;
		mWon = false;
		mEvents.Clear();

		ResetTiles();
		Respawn();
	}

	void World::ResetTiles()
	{
		int startCol = ColOf(mStart.x), startRow = RowOf(mStart.y);

		for (int r = 0; r < kRows; r++)
		{
			for (int c = 0; c < kCols; c++)
			{
				auto& tile = Tile(c, r);
				tile.triggered = false;
				tile.timer = 0.0f;
				tile.fallen = false;
				tile.fallOffset = 0.0f;
				tile.hidden = false;
				tile.fallDelay = mPhysics.fakeDelay;
				tile.phaseOffset = tile.type == Tile::BlinkAlt ? mPhysics.blinkPeriod*0.5f : 0.0f;

				bool underStart = mLevel.startFalls && tile.type == Tile::Fake && r == startRow + 1 &&
					c >= startCol - 1 && c <= startCol + 3;

				if (underStart)
				{
					tile.triggered = true;
					tile.fallDelay = mPhysics.startFallDelay;
				}
			}
		}

		for (auto& mover : mMovers)
		{
			mover.pos = mover.start;
			mover.dir = mover.vertical ? Vec2F(0, 1) : Vec2F(1, 0);
			mover.delta = Vec2F();
		}
	}

	void World::Respawn()
	{
		// Feet on the tile below the spawn cell, so the first frame is already grounded
		mPos = mSpawn - Vec2F(0.0f, (kTile - mPhysics.playerHeight)*0.5f);
		mVel = Vec2F();
		mGravityDir = -1;
		mOnGround = false;
		mCarriedMover = -1;
		mConveyorPush = 0.0f;
		mCoyote = 0.0f;
		mJumpBuffer = 0.0f;
		mGravityCooldown = 0.0f;
		mDead = false;
		mBlinkTime = 0.0f;
		mFreeze = 0.0f;
	}

	void World::SetPlayerPos(const Vec2F& pos)
	{
		mPos = pos;
		mVel = Vec2F();
	}

	Box World::GetPlayerBox() const
	{
		return Box::FromCenter(mPos, Vec2F(mPhysics.playerWidth, mPhysics.playerHeight));
	}

	bool World::IsTileSolidNow(int col, int row) const
	{
		const auto& tile = TileAt(col, row);
		switch (tile.type)
		{
			case Tile::Block:
			case Tile::Invisible:
			case Tile::Mimic:
			case Tile::ConveyorLeft:
			case Tile::ConveyorRight:
			return true;

			case Tile::Fake:
			return !tile.fallen;

			case Tile::Shy:
			return !tile.hidden;

			case Tile::Blink:
			case Tile::BlinkAlt:
			return IsTileVisible(col, row);

			default:
			return false;
		}
	}

	bool World::IsTileVisible(int col, int row) const
	{
		const auto& tile = TileAt(col, row);
		switch (tile.type)
		{
			case Tile::Empty:
			case Tile::Start:
			case Tile::ExitTarget:
			case Tile::MoverH:
			case Tile::MoverV:
			return false;

			case Tile::Invisible:
			return tile.revealed;

			case Tile::Shy:
			return !tile.hidden;

			case Tile::Blink:
			case Tile::BlinkAlt:
			{
				float phase = std::fmod(mBlinkTime + tile.phaseOffset, mPhysics.blinkPeriod);
				return phase < mPhysics.blinkVisible;
			}

			default:
			return true;
		}
	}

	void World::Emit(EventType type, const String& text)
	{
		Event event;
		event.type = type;
		event.text = text;
		mEvents.Add(event);
	}

	Vector<Event> World::TakeEvents()
	{
		Vector<Event> events = mEvents;
		mEvents.Clear();
		return events;
	}

	void World::Kill(const String& reason)
	{
		if (mDead || mWon)
			return;

		mDead = true;
		mDeaths++;
		Emit(EventType::Death, reason);
		ResetTiles();
		Respawn();
		mFreeze = kFreezeTime;
	}

	void World::Step(float dt, const Input& input)
	{
		if (!mLoaded || mWon || dt <= 0.0f)
			return;

		if (mFreeze > 0.0f)
		{
			mFreeze -= dt;
			mPrevJump = input.jump;
			return;
		}

		mTime += dt;
		mBlinkTime += dt;
		mGravityCooldown = Math::Max(0.0f, mGravityCooldown - dt);

		UpdateTiles(dt);
		UpdateMovers(dt);

		if (mCarriedMover >= 0 && mCarriedMover < mMovers.Count())
			mPos += mMovers[mCarriedMover].delta;

		int dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
		if (mLevel.mirror)
			dir = -dir;

		if (dir != 0)
			mFacing = dir;

		mVel.x = (float)dir*mPhysics.moveSpeed + (mOnGround ? mConveyorPush : 0.0f);

		bool jumpPressed = input.jump && !mPrevJump;
		bool jumpReleased = !input.jump && mPrevJump;
		mPrevJump = input.jump;

		if (jumpPressed)
			mJumpBuffer = mPhysics.jumpBuffer;
		else
			mJumpBuffer = Math::Max(0.0f, mJumpBuffer - dt);

		float up = -(float)mGravityDir;
		if (mJumpBuffer > 0.0f && (mOnGround || mCoyote > 0.0f))
		{
			mVel.y = up*mPhysics.jumpSpeed;
			mOnGround = false;
			mCoyote = 0.0f;
			mJumpBuffer = 0.0f;
			mCarriedMover = -1;
			Emit(EventType::Jump);
		}
		else if (jumpReleased && mVel.y*up > 0.0f)
			mVel.y *= mPhysics.jumpCut;

		float gravity = mLevel.lowGravity ? mPhysics.lowGravity : mPhysics.gravity;
		mVel.y += (float)mGravityDir*gravity*dt;
		mVel.y = Math::Clamp(mVel.y, -mPhysics.maxFallSpeed, mPhysics.maxFallSpeed);

		MoveAxis(mVel.x*dt, 0.0f);
		if (mDead)
			return;

		MoveAxis(0.0f, mVel.y*dt);
		if (mDead)
			return;

		ProbeGround();
		if (mDead)
			return;

		if (mOnGround)
			mCoyote = mPhysics.coyoteTime;
		else
			mCoyote = Math::Max(0.0f, mCoyote - dt);

		CheckTriggers();
		if (mDead)
			return;

		float halfWorld = kRows*kTile*0.5f;
		if (mPos.y < -halfWorld - kTile || mPos.y > halfWorld + kTile)
			Kill("Пропасть.");
	}

	void World::UpdateTiles(float dt)
	{
		for (int r = 0; r < kRows; r++)
		{
			for (int c = 0; c < kCols; c++)
			{
				auto& tile = Tile(c, r);
				if (tile.type == Tile::Fake)
				{
					if (tile.fallen)
						tile.fallOffset += mPhysics.fakeFallSpeed*dt;
					else if (tile.triggered)
					{
						tile.timer += dt;
						if (tile.timer >= tile.fallDelay)
							tile.fallen = true;
					}
				}
				else if (tile.type == Tile::Shy)
				{
					if (tile.hidden)
					{
						tile.timer -= dt;
						if (tile.timer <= 0.0f)
						{
							tile.hidden = false;
							tile.triggered = false;
							tile.timer = 0.0f;
						}
					}
					else if (tile.triggered)
					{
						tile.timer += dt;
						if (tile.timer >= mPhysics.shyDelay)
						{
							tile.hidden = true;
							tile.timer = mPhysics.shyHidden;
						}
					}
					else
					{
						Vec2F toPlayer = mPos - CellCenter(c, r);
						if (toPlayer.Length() <= mPhysics.shyRange*kTile)
						{
							tile.triggered = true;
							tile.timer = 0.0f;
						}
					}
				}
			}
		}
	}

	bool World::IsMoverBlocked(const Mover& mover, const Vec2F& nextPos) const
	{
		Mover probe = mover;
		probe.pos = nextPos;
		Box box = probe.GetBox().Inset(kEps);

		if (box.left < -kCols*kTile*0.5f || box.right > kCols*kTile*0.5f)
			return true;

		if (box.bottom < -kRows*kTile*0.5f || box.top > kRows*kTile*0.5f)
			return true;

		int c0 = Math::Max(0, ColOf(box.left)), c1 = Math::Min(kCols - 1, ColOf(box.right));
		int r0 = Math::Max(0, RowOf(box.top)), r1 = Math::Min(kRows - 1, RowOf(box.bottom));
		for (int r = r0; r <= r1; r++)
		{
			for (int c = c0; c <= c1; c++)
			{
				if (IsStaticSolid(TileAt(c, r).type) && CellBox(c, r).Overlaps(box))
					return true;
			}
		}

		return false;
	}

	void World::UpdateMovers(float dt)
	{
		for (auto& mover : mMovers)
		{
			float speed = mover.vertical ? mPhysics.moverSpeedV : mPhysics.moverSpeed;
			Vec2F next = mover.pos + mover.dir*speed*dt;
			if (IsMoverBlocked(mover, next))
			{
				mover.dir = mover.dir*-1.0f;
				next = mover.pos + mover.dir*speed*dt;
				if (IsMoverBlocked(mover, next))
					next = mover.pos;
			}

			mover.delta = next - mover.pos;
			mover.pos = next;
		}
	}

	void World::TouchTile(int col, int row)
	{
		auto& tile = Tile(col, row);
		if (tile.type == Tile::Invisible)
			tile.revealed = true;
		else if (tile.type == Tile::Mimic)
			Kill("Это был мимик!");
	}

	void World::MoveAxis(float dx, float dy)
	{
		mPos.x += dx;
		mPos.y += dy;

		float halfW = mPhysics.playerWidth*0.5f, halfH = mPhysics.playerHeight*0.5f;
		float worldHalfW = kCols*kTile*0.5f;
		if (dx != 0.0f)
		{
			if (mPos.x - halfW < -worldHalfW)
			{
				mPos.x = -worldHalfW + halfW;
				mVel.x = 0.0f;
			}
			if (mPos.x + halfW > worldHalfW)
			{
				mPos.x = worldHalfW - halfW;
				mVel.x = 0.0f;
			}
		}

		for (int pass = 0; pass < 2; pass++)
		{
			Box box = GetPlayerBox();
			int c0 = Math::Max(0, ColOf(box.left)), c1 = Math::Min(kCols - 1, ColOf(box.right - kEps));
			int r0 = Math::Max(0, RowOf(box.top)), r1 = Math::Min(kRows - 1, RowOf(box.bottom + kEps));

			bool moved = false;
			for (int r = r0; r <= r1 && !moved; r++)
			{
				for (int c = c0; c <= c1 && !moved; c++)
				{
					if (!IsTileSolidNow(c, r))
						continue;

					Box cell = CellBox(c, r);
					if (!cell.Overlaps(box.Inset(kEps)))
						continue;

					TouchTile(c, r);
					if (mDead)
						return;

					if (dx > 0.0f)
						mPos.x = cell.left - halfW;
					else if (dx < 0.0f)
						mPos.x = cell.right + halfW;
					else if (dy < 0.0f)
						mPos.y = cell.top + halfH;
					else if (dy > 0.0f)
						mPos.y = cell.bottom - halfH;

					if (dx != 0.0f)
						mVel.x = 0.0f;
					else
						mVel.y = 0.0f;

					moved = true;
				}
			}

			for (int i = 0; i < mMovers.Count() && !moved; i++)
			{
				Box mb = mMovers[i].GetBox();
				if (!mb.Overlaps(box.Inset(kEps)))
					continue;

				if (dx > 0.0f)
					mPos.x = mb.left - halfW;
				else if (dx < 0.0f)
					mPos.x = mb.right + halfW;
				else if (dy < 0.0f)
					mPos.y = mb.top + halfH;
				else if (dy > 0.0f)
					mPos.y = mb.bottom - halfH;

				if (dx != 0.0f)
					mVel.x = 0.0f;
				else
					mVel.y = 0.0f;

				moved = true;
			}

			if (!moved)
				break;
		}
	}

	void World::ProbeGround()
	{
		mOnGround = false;
		mCarriedMover = -1;
		mConveyorPush = 0.0f;

		Box box = GetPlayerBox();
		Box probe = box;
		if (mGravityDir < 0)
		{
			probe.top = box.bottom;
			probe.bottom = box.bottom - 2.0f;
		}
		else
		{
			probe.bottom = box.top;
			probe.top = box.top + 2.0f;
		}
		probe.left += 2.0f;
		probe.right -= 2.0f;

		int c0 = Math::Max(0, ColOf(probe.left)), c1 = Math::Min(kCols - 1, ColOf(probe.right));
		int r0 = Math::Max(0, RowOf(probe.top)), r1 = Math::Min(kRows - 1, RowOf(probe.bottom));
		for (int r = r0; r <= r1; r++)
		{
			for (int c = c0; c <= c1; c++)
			{
				if (!CellBox(c, r).Overlaps(probe))
					continue;

				auto& tile = Tile(c, r);
				if (IsTileSolidNow(c, r))
				{
					mOnGround = true;
					if (tile.type == Tile::Fake && !tile.triggered)
					{
						tile.triggered = true;
						tile.timer = 0.0f;
					}
					else if (tile.type == Tile::ConveyorLeft)
						mConveyorPush = -mPhysics.conveyorSpeed;
					else if (tile.type == Tile::ConveyorRight)
						mConveyorPush = mPhysics.conveyorSpeed;

					TouchTile(c, r);
					if (mDead)
						return;
				}
				else if (mGravityDir < 0 && tile.type == Tile::Bounce)
				{
					// The trampoline is not solid: the potato sinks a bit into it and gets launched
					if (mVel.y <= 0.0f)
					{
						mVel.y = mPhysics.bounceSpeed;
						mPos.y = CellBox(c, r).top + mPhysics.playerHeight*0.5f + 1.0f;
						mCoyote = 0.0f;
						Emit(EventType::Bounce);
					}
				}
			}
		}

		for (int i = 0; i < mMovers.Count(); i++)
		{
			if (mMovers[i].GetBox().Overlaps(probe))
			{
				mOnGround = true;
				mCarriedMover = i;
			}
		}

	}

	void World::CheckTriggers()
	{
		Box box = GetPlayerBox();
		Box hurtBox = box.Inset(4.0f);

		Box exitBox = Box::FromCenter(mExitPos, Vec2F(kTile, kTile)).Inset(6.0f);
		if (exitBox.Overlaps(hurtBox))
		{
			mWon = true;
			Emit(EventType::Win);
			return;
		}

		if (mHasExitTarget && !mExitRan)
		{
			if ((mPos - mExitPos).Length() <= mPhysics.exitRunRange*kTile)
			{
				mExitPos = mExitTarget;
				mExitRan = true;
				Emit(EventType::ExitRan, "Мешок убежал!");
			}
		}

		int c0 = Math::Max(0, ColOf(box.left)), c1 = Math::Min(kCols - 1, ColOf(box.right));
		int r0 = Math::Max(0, RowOf(box.top)), r1 = Math::Min(kRows - 1, RowOf(box.bottom));
		for (int r = r0; r <= r1; r++)
		{
			for (int c = c0; c <= c1; c++)
			{
				auto& tile = Tile(c, r);
				Box cell = CellBox(c, r);

				switch (tile.type)
				{
					case Tile::SpikeUp:
					case Tile::SpikeDown:
					{
						Box spike = cell.Inset(8.0f);
						if (spike.Overlaps(hurtBox))
						{
							Kill("Вилка.");
							return;
						}
						break;
					}

					case Tile::FakeExit:
					if (cell.Inset(6.0f).Overlaps(hurtBox))
					{
						mPos = mSpawn;
						mVel = Vec2F();
						mGravityDir = -1;
						mFreeze = kFreezeTime;
						Emit(EventType::Teleport, "Это был не тот мешок!");
						return;
					}
					break;

					case Tile::Checkpoint:
					if (!tile.triggered && cell.Inset(6.0f).Overlaps(hurtBox))
					{
						tile.triggered = true;
						mSpawn = CellCenter(c, r);
						Emit(EventType::Checkpoint, "Чекпоинт!");
					}
					break;

					case Tile::FakeCheckpoint:
					if (cell.Inset(6.0f).Overlaps(hurtBox))
					{
						mSpawn = mStart;
						mPos = mStart;
						mVel = Vec2F();
						mGravityDir = -1;
						mFreeze = kFreezeTime;
						Emit(EventType::Teleport, "Флаг-обманщик! Обратно на старт.");
						return;
					}
					break;

					case Tile::Gravity:
					if (mGravityCooldown <= 0.0f && cell.Inset(6.0f).Overlaps(hurtBox))
					{
						mGravityDir = -mGravityDir;
						mGravityCooldown = mPhysics.gravityCooldown;
						mOnGround = false;
						mVel.y = 0.0f;
						Emit(EventType::GravityFlip, "Переворот!");
					}
					break;

					default:
					break;
				}
			}
		}
	}
}
// --- META ---

ENUM_META(obby::EventType, obby__EventType)
{
    ENUM_ENTRY(Bounce);
    ENUM_ENTRY(Checkpoint);
    ENUM_ENTRY(Death);
    ENUM_ENTRY(ExitRan);
    ENUM_ENTRY(GravityFlip);
    ENUM_ENTRY(Jump);
    ENUM_ENTRY(Message);
    ENUM_ENTRY(Teleport);
    ENUM_ENTRY(Win);
}
END_ENUM_META;
// --- END META ---
