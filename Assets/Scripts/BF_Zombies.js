// Zombies: arrive from the edge, queue up at the stand, buy a brain each and leave
BF.Zombies = class
{
    constructor()
    {
        this.container = Bridge.FindActor("Zombies");
        this.list = [];
        this._spawnTimer = 1.0;
        this._nameCounter = 0;

        // queue spots run from the stand toward the gate in the back fence, head first
        this.queueSpots = [];
        for (let i = 0; i < BF.cfg.queueLength; i++)
            this.queueSpots.push({ x: 0.12*i*BF.M, y: (5.65 + 0.8*i)*BF.M });
    }

    QueueIndexFree(index)
    {
        return !this.list.some(z => z.state != "leave" && z.spot == index);
    }

    FirstFreeSpot()
    {
        for (let i = 0; i < this.queueSpots.length; i++)
        {
            if (this.QueueIndexFree(i))
                return i;
        }

        return -1;
    }

    Spawn()
    {
        let spot = this.FirstFreeSpot();
        if (spot < 0)
            return;

        let actor = Bridge.SpawnZombie();
        if (!actor)
            return;

        actor.SetName("Zombie" + this._nameCounter++);
        actor.SetEnabled(true);

        let z = {
            actor: actor,
            x: BF.points.zombieSpawn.x,
            y: BF.points.zombieSpawn.y,
            state: "toQueue",
            spot: spot,
            sellTimer: BF.cfg.sellDelay,
            anim: ""
        };
        BF.setPos(actor, z.x, z.y, 0);
        this.list.push(z);
    }

    SetAnim(z, name, speed)
    {
        if (z.anim == name)
            return;

        z.anim = name;
        Bridge.PlayAnim(z.actor, "Zombie|Zombie" + name, true, speed || 1.0);
    }

    // Steps toward the target; returns true when arrived
    MoveTo(z, tx, ty, dt)
    {
        let dx = tx - z.x, dy = ty - z.y;
        let d = Math.sqrt(dx*dx + dy*dy);
        let step = BF.cfg.zombieSpeed*dt;
        if (d <= step)
        {
            z.x = tx;
            z.y = ty;
            return true;
        }

        z.x += dx/d*step;
        z.y += dy/d*step;
        BF.faceDir(z.actor, dx, dy);
        this.SetAnim(z, "Walk", 1.6);
        return false;
    }

    Update(dt, counter, game)
    {
        this._spawnTimer -= dt;
        if (this._spawnTimer <= 0)
        {
            this._spawnTimer = BF.cfg.zombieInterval;
            this.Spawn();
        }

        for (let z of this.list)
        {
            if (z.state == "toQueue")
            {
                // advance to a closer freed spot while walking
                let better = this.FirstFreeSpot();
                if (better >= 0 && better < z.spot)
                    z.spot = better;

                let spot = this.queueSpots[z.spot];
                if (this.MoveTo(z, spot.x, spot.y, dt))
                {
                    z.state = "queue";
                    BF.faceDir(z.actor, -0.25, -1); // face the stand
                    this.SetAnim(z, "Idle");
                }
            }
            else if (z.state == "queue")
            {
                let better = z.spot;
                while (better > 0 && this.QueueIndexFree(better - 1))
                    better--;
                if (better != z.spot)
                {
                    z.spot = better;
                    z.state = "toQueue";
                    continue;
                }

                if (z.spot == 0)
                {
                    z.sellTimer -= dt;
                    if (z.sellTimer <= 0)
                    {
                        z.sellTimer = BF.cfg.sellDelay;
                        if (counter.SellTo(z, game))
                        {
                            z.state = "leave";
                            this.SetAnim(z, "Walk", 1.6);
                        }
                    }
                }
            }
            else if (z.state == "leave")
            {
                if (this.MoveTo(z, BF.points.zombieExit.x, BF.points.zombieExit.y, dt))
                {
                    z.dead = true;
                    z.actor.Destroy();
                }
            }

            if (!z.dead)
                BF.setPos(z.actor, z.x, z.y, 0);
        }

        this.list = this.list.filter(z => !z.dead);
    }
};
