// The market stand: takes brains from the player's stack, shows them on the counter
// and hands them to buying zombies
BF.Counter = class
{
    constructor()
    {
        this.spotsRoot = Bridge.FindActor("Location/CounterSpots");
        this.spots = [];
        for (let i = 0; i < BF.cfg.counterLimit; i++)
            this.spots.push(this.spotsRoot.GetChild("Spot" + i));

        this.stock = [];        // brain actors on the counter, in spot order
        this._transferTimer = 0;
    }

    Full() { return this.stock.length >= BF.cfg.counterLimit; }

    Update(dt, player, game)
    {
        this._transferTimer -= dt;

        let p = BF.points.counterDrop;
        let near = BF.dist2(player.x, player.y, p.x, p.y) <
                   BF.cfg.counterRadius*BF.cfg.counterRadius;

        if (near && !this.Full() && player.StackCount() > 0 && this._transferTimer <= 0)
        {
            this._transferTimer = BF.cfg.transferDelay;

            let brain = player.PopFromStack();
            let spot = this.spots[this.stock.length];
            this.stock.push(brain);

            let from = BF.getWorldPos(brain);
            game.StartFlight(brain, from, () => BF.getWorldPos(spot), (b) =>
            {
                spot.AddChild(b);
                BF.setPos(b, 0, 0, 0);
                b.GetTransform().SetAngle(Math.random()*6.28);
                BF.setScale(b, 0.55);
            });
        }
    }

    // Takes the top brain off the counter and flies it to the zombie; returns false when empty
    SellTo(zombie, game)
    {
        let brain = this.stock.pop();
        if (!brain)
            return false;

        let from = BF.getWorldPos(brain);
        game.StartFlight(brain, from, () =>
        {
            let zp = BF.getPos(zombie.actor);
            return { x: zp.x, y: zp.y, z: 1.15*BF.M };
        }, (b) =>
        {
            b.Destroy();
            game.AddMoney(BF.cfg.brainPrice);
            let zp = BF.getPos(zombie.actor);
            if (game.hud)
                game.hud.FlyMoney(zp.x, zp.y, 1.6*BF.M);
        });

        return true;
    }
};
