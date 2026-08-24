// Game root: owns the money, wires the systems together, runs brain flights
// and the camera follow
BF.Game = class
{
    constructor(rootActor)
    {
        this.root = rootActor;
        this.money = 0;
        this.flights = [];
        this._harvestTimer = 0;
    }

    Start()
    {
        this.camera = Bridge.FindActor("camera3d");
        this.flightsRoot = Bridge.FindActor("Flights");
        this.camBase = { x: 0, y: -5.6*BF.M, z: 7.2*BF.M };

        this.hud = new BF.Hud(this.root);
        this.player = new BF.Player();
        this.counter = new BF.Counter();
        this.zombies = new BF.Zombies();

        this.plantations = [
            new BF.Plantation(0, true),
            new BF.Plantation(1, false),
            new BF.Plantation(2, false)
        ];

        this.buyZones = [
            new BF.BuyZone(1, this.plantations[1]),
            new BF.BuyZone(2, this.plantations[2])
        ];
        this.hud.BindZones(this.buyZones);
        this.hud.SetMoney(this.money);
    }

    AddMoney(amount)
    {
        this.money += amount;
        this.hud.SetMoney(this.money);
    }

    SpendMoney(amount)
    {
        this.money = Math.max(0, this.money - amount);
        this.hud.SetMoney(this.money);
    }

    // Flies an actor from a point to a moving target along an arc, then hands it over
    StartFlight(actor, from, targetFn, onDone)
    {
        this.flightsRoot.AddChild(actor);
        BF.setPos(actor, from.x, from.y, from.z);
        this.flights.push({ actor: actor, from: from, targetFn: targetFn, onDone: onDone, t: 0 });
    }

    UpdateFlights(dt)
    {
        for (let f of this.flights)
        {
            f.t = Math.min(1, f.t + dt/BF.cfg.flightTime);
            let e = f.t*f.t*(3 - 2*f.t);
            let to = f.targetFn();
            let x = BF.lerp(f.from.x, to.x, e);
            let y = BF.lerp(f.from.y, to.y, e);
            let z = BF.lerp(f.from.z, to.z, e) + Math.sin(f.t*Math.PI)*0.85*BF.M;
            BF.setPos(f.actor, x, y, z);

            if (f.t >= 1)
            {
                f.done = true;
                f.onDone(f.actor);
            }
        }

        this.flights = this.flights.filter(f => !f.done);
    }

    UpdateHarvest(dt)
    {
        this._harvestTimer -= dt;
        if (this._harvestTimer > 0 || this.player.StackFull())
            return;

        for (let plantation of this.plantations)
        {
            if (!plantation.unlocked || !plantation.HasRipe())
                continue;

            let c = plantation.center;
            if (BF.dist2(this.player.x, this.player.y, c.x, c.y) >
                BF.cfg.harvestRadius*BF.cfg.harvestRadius)
                continue;

            let pos = plantation.PopRipe();
            if (!pos)
                continue;

            this._harvestTimer = BF.cfg.transferDelay;

            let brain = Bridge.SpawnBrain();
            if (!brain)
                return;

            brain.SetEnabled(true);
            BF.setScale(brain, 0.6);

            let player = this.player;
            this.StartFlight(brain, pos,
                () => ({ x: player.x, y: player.y,
                         z: (1.05 + player.StackCount()*0.23)*BF.M }),
                (b) => player.PushToStack(b));
            return; // one brain per tick keeps the cascade readable
        }
    }

    UpdateCamera(dt)
    {
        let tx = BF.clamp(this.player.x*0.55, -1.3*BF.M, 1.3*BF.M);
        let ty = BF.clamp(this.player.y*0.75, -4.6*BF.M, 3.6*BF.M) + this.camBase.y;
        let t = this.camera.GetTransform();
        let k = Math.min(1, dt*4);
        t.SetPositionX(BF.lerp(t.GetPositionX(), tx, k));
        t.SetPositionY(BF.lerp(t.GetPositionY(), ty, k));
    }

    Update(dt)
    {
        dt = Math.min(dt, 0.05); // a long hitch must not teleport the simulation

        this.player.Update(dt);
        for (let plantation of this.plantations)
            plantation.Update(dt);
        for (let zone of this.buyZones)
            zone.Update(dt, this.player, this);
        this.UpdateHarvest(dt);
        this.counter.Update(dt, this.player, this);
        this.zombies.Update(dt, this.counter, this);
        this.UpdateFlights(dt);
        this.UpdateCamera(dt);
        this.hud.Update(dt);
    }
};
