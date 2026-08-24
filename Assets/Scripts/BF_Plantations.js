// Plantations: brains ripen on spots, the player harvests them by proximity;
// locked plantations are bought by standing on their buy zones
BF.Plantation = class
{
    constructor(index, unlocked)
    {
        this.index = index;
        this.center = BF.points.plantations[index];
        this.actor = Bridge.FindActor("Plantations/Plantation" + index);
        this.unlocked = unlocked;
        this.spots = [];
        for (let i = 0; i < 4; i++)
        {
            this.spots.push({
                actor: this.actor.GetChild("Spot" + i),
                state: "empty", // empty -> growing -> ripe
                progress: 0,
                delay: i*0.9    // stagger the first wave
            });
        }
        this._time = 0;
    }

    Unlock()
    {
        this.unlocked = true;
        this.actor.SetEnabled(true);
    }

    Update(dt)
    {
        if (!this.unlocked)
            return;

        this._time += dt;
        for (let spot of this.spots)
        {
            if (spot.state == "empty")
            {
                if (spot.delay > 0)
                {
                    spot.delay -= dt;
                    continue;
                }

                spot.state = "growing";
                spot.progress = 0;
                spot.actor.SetEnabled(true);
            }

            if (spot.state == "growing")
            {
                spot.progress = Math.min(1, spot.progress + dt/BF.cfg.growTime);
                let ease = spot.progress*spot.progress*(3 - 2*spot.progress);
                BF.setScale(spot.actor, 0.05 + 0.65*ease);
                if (spot.progress >= 1)
                    spot.state = "ripe";
            }

            if (spot.state == "ripe")
                spot.actor.GetTransform().SetAngle(this._time*1.2 + spot.delay); // ripe brains slowly spin
        }
    }

    HasRipe()
    {
        return this.spots.some(s => s.state == "ripe");
    }

    // Takes one ripe brain off its spot; returns its world position or null
    PopRipe()
    {
        for (let spot of this.spots)
        {
            if (spot.state != "ripe")
                continue;

            let pos = BF.getWorldPos(spot.actor);
            spot.state = "empty";
            spot.delay = 0.4 + Math.random()*0.8;
            spot.actor.SetEnabled(false);
            BF.setScale(spot.actor, 0.05);
            return pos;
        }

        return null;
    }
};

BF.BuyZone = class
{
    constructor(index, plantation) // index 1..2, the zone unlocks `plantation`
    {
        this.plantation = plantation;
        this.cost = BF.cfg.plantationCosts[plantation.index];
        this.paid = 0;
        this.done = false;
        this.actor = Bridge.FindActor("BuyZones/BuyZone" + index);
        this.center = plantation.center;
        this.label = null; // created by the HUD, positioned by world projection
    }

    Remaining() { return Math.max(0, this.cost - this.paid); }

    Update(dt, player, game)
    {
        if (this.done)
            return;

        let near = BF.dist2(player.x, player.y, this.center.x, this.center.y) <
                   BF.cfg.buyRadius*BF.cfg.buyRadius;
        if (near && game.money > 0)
        {
            let pay = Math.min(BF.cfg.buyRate*dt, this.Remaining(), game.money);
            game.SpendMoney(pay);
            this.paid += pay;

            // the disc shrinks as the zone gets paid
            let t = 1 - this.paid/this.cost;
            BF.setScale(this.actor, 0.35 + 0.65*t);
        }

        if (this.Remaining() <= 0.0001)
        {
            this.done = true;
            this.actor.SetEnabled(false);
            this.plantation.Unlock();
            if (this.label)
                this.label.SetEnabled(false);
        }
    }
};
