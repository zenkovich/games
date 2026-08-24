// Player: floating joystick, movement with bounds and the stand obstacle, Idle/Run
// animations and the brain stack carried on the back
BF.Player = class
{
    constructor()
    {
        this.actor = Bridge.FindActor("Player");
        this.stackRoot = Bridge.FindActor("Player/Stack");
        this.x = 0;
        this.y = -0.2;
        this.dirX = 0;
        this.dirY = 0;
        this.moving = false;
        this.stack = [];      // brain actors, bottom to top
        this.joyActive = false;
        this.joyOriginX = 0;  // UI units
        this.joyOriginY = 0;
        this.joyDX = 0;
        this.joyDY = 0;
        this.SetAnim("Idle");
    }

    SetAnim(name)
    {
        if (this._anim == name)
            return;

        this._anim = name;
        Bridge.PlayAnim(this.actor, "CharacterArmature|" + name, true, name == "Run" ? 1.35 : 1.0);
    }

    UpdateJoystick(dt)
    {
        let down = Bridge.IsCursorDown();
        if (down && !this.joyActive)
        {
            let c = BF.cursorUI();
            this.joyActive = true;
            this.joyOriginX = c.x;
            this.joyOriginY = c.y;
        }

        if (!down)
            this.joyActive = false;

        this.dirX = 0;
        this.dirY = 0;
        if (this.joyActive)
        {
            let c = BF.cursorUI();
            const radius = 95; // UI units of the full deflection
            let dx = c.x - this.joyOriginX, dy = c.y - this.joyOriginY;
            let len = Math.sqrt(dx*dx + dy*dy);
            if (len > radius)
            {
                // the base drags after the finger, the classic floating stick
                this.joyOriginX = c.x - dx/len*radius;
                this.joyOriginY = c.y - dy/len*radius;
                dx = c.x - this.joyOriginX;
                dy = c.y - this.joyOriginY;
                len = radius;
            }

            this.joyDX = dx;
            this.joyDY = dy;
            if (len > radius*0.12) // dead zone
            {
                this.dirX = dx/radius;
                this.dirY = dy/radius;
            }
        }

        if (BF.game && BF.game.hud)
            BF.game.hud.UpdateJoystick(this.joyActive, this.joyOriginX, this.joyOriginY, this.joyDX, this.joyDY);
    }

    // Keyboard fallback for desktop runs is intentionally absent: the demo is a mobile playable
    UpdateMovement(dt)
    {
        let speed = Math.sqrt(this.dirX*this.dirX + this.dirY*this.dirY);
        this.moving = speed > 0.01;

        if (this.moving)
        {
            this.x += this.dirX*BF.cfg.playerSpeed*dt;
            this.y += this.dirY*BF.cfg.playerSpeed*dt;

            let b = BF.points.bounds;
            this.x = BF.clamp(this.x, b.minX, b.maxX);
            this.y = BF.clamp(this.y, b.minY, b.maxY);

            // the stand is a solid circle, push the player out
            let s = BF.points.standCenter;
            let dx = this.x - s.x, dy = this.y - s.y;
            let d = Math.sqrt(dx*dx + dy*dy);
            const standRadius = 1.35*BF.M;
            if (d < standRadius && d > 0.0001)
            {
                this.x = s.x + dx/d*standRadius;
                this.y = s.y + dy/d*standRadius;
            }

            BF.faceDir(this.actor, this.dirX, this.dirY);
        }

        BF.setPos(this.actor, this.x, this.y, 0);
        this.SetAnim(this.moving ? "Run" : "Idle");
    }

    StackCount() { return this.stack.length; }
    StackFull() { return this.stack.length >= BF.cfg.stackLimit; }

    // The brain actor becomes a child of the stack root at its slot position
    PushToStack(brain)
    {
        this.stackRoot.AddChild(brain);
        let slot = this.stack.length;
        this.stack.push(brain);
        BF.setPos(brain, 0, 0, slot*0.42*BF.M);
        brain.GetTransform().SetAngle(slot*0.9); // vary yaw so the pile looks alive
        BF.setScale(brain, 1);
    }

    PopFromStack()
    {
        return this.stack.pop() || null;
    }

    Update(dt)
    {
        this.UpdateJoystick(dt);
        this.UpdateMovement(dt);
    }
};
