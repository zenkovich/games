// Player: joystick anchored at press, movement with bounds and the stand obstacle, Idle/Run
// animations and the brain stack carried on the back
BF.Player = class
{
    constructor()
    {
        this.actor = Bridge.FindActor("Player");
        this.stackRoot = Bridge.FindActor("Player/Stack");
        this.x = BF.points.playerStart.x;
        this.y = BF.points.playerStart.y;
        this.dirX = 0;
        this.dirY = 0;
        this.moving = false;
        this.pending = 0;
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
        let down=Bridge.IsCursorDown()&&!BF.game.victoryOpen,c=BF.cursorUI();
        if(down&&!this.joyActive&&c.y<310)
        {
            this.joyActive=true;this.joyOriginX=c.x;this.joyOriginY=c.y;
        }
        if(!down)this.joyActive=false;
        let sx=0,sy=0;
        this.joyDX=0;this.joyDY=0;
        if(this.joyActive)
        {
            const radius=74,dead=7;
            let dx=c.x-this.joyOriginX,dy=c.y-this.joyOriginY,len=Math.sqrt(dx*dx+dy*dy);
            if(len>radius)
            {
                dx=dx/len*radius;dy=dy/len*radius;len=radius;
            }
            this.joyDX=dx;this.joyDY=dy;
            if(len>dead)
            {
                let strength=(len-dead)/(radius-dead);
                strength=strength*(.7+.3*strength);
                sx=dx/len*strength;sy=dy/len*strength;
            }
        }
        let desired=BF.screenToGround(sx,sy),k=1-Math.exp(-dt*(this.joyActive?20:32));
        this.dirX=BF.lerp(this.dirX,desired.x,k);this.dirY=BF.lerp(this.dirY,desired.y,k);
        if(BF.game.victoryOpen || (!this.joyActive&&Math.abs(this.dirX)+Math.abs(this.dirY)<.01))
            this.dirX=this.dirY=0;
        BF.game.hud.UpdateJoystick(this.joyActive,this.joyOriginX,this.joyOriginY,this.joyDX,this.joyDY,dt);
    }

    UpdateMovement(dt)
    {
        let speed = Math.sqrt(this.dirX*this.dirX + this.dirY*this.dirY);
        this.moving = speed > 0.025;

        if (this.moving)
        {
            this.x += this.dirX*BF.game.moveSpeed*dt;
            this.y += this.dirY*BF.game.moveSpeed*dt;

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

            let target = Math.atan2(-this.dirX, this.dirY) + Math.PI;
            let current = this.actor.GetTransform().GetAngle();
            let delta = Math.atan2(Math.sin(target-current), Math.cos(target-current));
            this.actor.GetTransform().SetAngle(current + delta*Math.min(1,dt*15));
        }

        if(this._placedX!==this.x || this._placedY!==this.y)
        {
            BF.setPos(this.actor,this.x,this.y,0);
            this._placedX=this.x;this._placedY=this.y;
        }
        this.SetAnim(this.moving ? "Run" : "Idle");
    }

    StackCount() { return this.stack.length; }
    StackFull() { return this.stack.length + this.pending >= BF.game.capacity; }

    StackOffset(slot)
    {
        let columns=BF.game.capacity>30?3:2;
        return{x:(slot%columns-(columns-1)*.5)*27,y:0,z:Math.floor(slot/columns)*22};
    }

    StackPosition(slot)
    {
        let p=BF.getWorldPos(this.stackRoot),offset=this.StackOffset(slot),angle=this.actor.GetTransform().GetAngle();
        return{x:p.x+Math.cos(angle)*offset.x,y:p.y+Math.sin(angle)*offset.x,z:p.z+offset.z};
    }

    PushToStack(item)
    {
        this.stackRoot.AddChild(item.actor);
        this.stack.push(item);
        this._settledCount=-1;
        BF.setScale(item.actor,BF.cfg.brainScale);
        this.UpdateStack(0);
    }

    PopFromStack() { return this.stack.pop() || null; }

    UpdateStack(dt)
    {
        if(!this.moving && this._settledCount===this.stack.length)return;
        this._settledCount=this.moving?-1:this.stack.length;
        let t=BF.game.time;
        for (let i=0;i<this.stack.length;i++)
        {
            let sway=this.moving ? Math.sin(t*9-i*.42)*Math.min(i*1.0,7) : 0;
            let a=this.stack[i].actor;
            let offset=this.StackOffset(i);
            BF.setPos(a,offset.x+sway,offset.y,offset.z);
            a.GetTransform().SetAngle(this.moving?Math.sin(t*2+i)*.06:0);
        }
    }

    Update(dt)
    {
        this.UpdateJoystick(dt);
        this.UpdateMovement(dt);
        this.UpdateStack(dt);
    }
};
