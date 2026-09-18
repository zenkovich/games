BF.Game = class
{
    constructor(rootActor)
    {
        this.root = rootActor;
        this.money = 0; this.earned = 0; this.sold = 0; this.harvested = 0;
        this.capacity = BF.cfg.stackLimit; this.moveSpeed = BF.cfg.playerSpeed; this.marketLevel = 1;
        this.victory = false; this.victoryOpen = false;
        this.flights = []; this._harvestTimer = 0; this.time = 0;
    }

    Start()
    {
        this.camera = Bridge.FindActor("camera3d");
        this.flightsRoot = Bridge.FindActor("Flights");
        this.guide = Bridge.FindActor("Guide");
        this.hud = new BF.Hud(this.root);
        this.player = new BF.Player();
        this.counter = new BF.Counter();
        this.zombies = new BF.Zombies();
        this.plantations = [new BF.Plantation(0,true),new BF.Plantation(1,false),new BF.Plantation(2,false)];
        this.progression = new BF.Progression(this);
        this.buyZones = this.progression.stages;
        this.hud.BindZones(this.buyZones);
        this.hud.SetMoney(0);
        this.hud.RefreshProgress();
        this.zombies.Spawn(true);
    }

    AddMoney(amount)
    {
        this.money += amount;
        this.hud.SetMoney(this.money);
    }

    SpendMoney(amount)
    {
        this.money = Math.max(0,this.money - amount);
        this.hud.SetMoney(this.money);
    }

    RecordSale(value, zombie)
    {
        let payment = value*this.marketLevel*(zombie.vip ? 2 : 1);
        this.AddMoney(payment); this.earned += payment; this.sold++;
        this.hud.FlyMoney(zombie.x,zombie.y,165,payment);
    }

    StartFlight(actor, from, targetFn, onDone)
    {
        this.flightsRoot.AddChild(actor);
        BF.setPos(actor,from.x,from.y,from.z);
        this.flights.push({actor:actor,from:from,targetFn:targetFn,onDone:onDone,t:0});
    }

    UpdateFlights(dt)
    {
        let active = this.flights;
        this.flights = [];
        for (let f of active)
        {
            f.t = Math.min(1,f.t + dt/BF.cfg.flightTime);
            let e = 1-Math.pow(1-f.t,2), to = f.targetFn();
            BF.setPos(f.actor,BF.lerp(f.from.x,to.x,e),BF.lerp(f.from.y,to.y,e),BF.lerp(f.from.z,to.z,e)+Math.sin(f.t*Math.PI)*70);
            if (f.t >= 1) f.onDone(f.actor);
            else this.flights.push(f);
        }
    }

    UpdateHarvest(dt)
    {
        this._harvestTimer -= dt;
        if (this._harvestTimer > 0 || this.player.StackFull()) return;
        let nearest=null, source=null;
        for(let p of this.plantations)
        {
            let spot=p.NearestRipe(this.player.x,this.player.y,BF.cfg.harvestRadius);
            if(spot && (!nearest || spot.distance<nearest.distance)){nearest=spot;source=p;}
        }
        if(!source)return;
        let actor=source.golden?Bridge.SpawnGoldenBrain():Bridge.SpawnBrain();
        if(!actor)return;
        let from=source.PopRipe(nearest.spot);
        let item={actor:actor,value:source.golden?BF.cfg.goldenPrice:BF.cfg.brainPrice,golden:source.golden};
        let slot=this.player.stack.length+this.player.pending;
        this.player.pending++;this.harvested++;this._harvestTimer=BF.cfg.transferDelay;
        actor.SetEnabled(true);BF.setScale(actor,BF.cfg.brainScale);
        this.StartFlight(actor,from,()=>this.player.StackPosition(slot),()=>{
            this.player.pending--;this.player.PushToStack(item);
        });
    }

    Goal()
    {
        let stage=this.progression.Current(),drop=BF.points.counterDrop;
        if(stage && this.money>=stage.Remaining())return{x:stage.x,y:stage.y,text:"BUILD "+stage.name};
        if(this.player.StackFull())return{x:drop.x,y:drop.y,text:"STACK FULL - SELL!"};
        if(this.counter.stock.length+this.counter.pending>0 && this.earned<40)
            return{x:drop.x,y:drop.y,text:"ZOMBIES ARE BUYING!"};
        let nearest=null;
        for(let p of this.plantations)
        {
            let point=p.NearestRipe(this.player.x,this.player.y,1e6);
            if(!point)continue;
            let distance=point.distance*(p.golden?.55:1);
            if(!nearest || distance<nearest.distance)nearest={x:point.spot.x,y:point.spot.y,distance:distance};
        }
        if(nearest)return{x:nearest.x,y:nearest.y,text:"SWEEP THE ROWS & COLLECT"};
        return this.player.StackCount()>0?{x:drop.x,y:drop.y,text:"DELIVER YOUR HARVEST"}:
            {x:this.plantations[0].spots[0].x,y:this.plantations[0].center.y,text:"YOUR CROPS ARE GROWING"};
    }

    UpdateCamera(dt)
    {
        let t=this.camera.GetTransform(),k=1-Math.exp(-dt*4),offset=BF.points.cameraOffset;
        t.SetPositionX(BF.lerp(t.GetPositionX(),this.player.x+offset.x,k));
        t.SetPositionY(BF.lerp(t.GetPositionY(),this.player.y+offset.y,k));
        let goal=this.Goal();
        if(this.guide)
        {
            BF.setPos(this.guide,goal.x,goal.y,65+Math.sin(this.time*4)*6);
            this.guide.GetTransform().SetAngle(BF.cfg.cameraYaw);
            this.guide.SetEnabled(!this.victoryOpen);
        }
    }

    Update(dt)
    {
        dt=Math.min(dt,.05); this.time+=dt;
        this.player.Update(dt);
        for (let p of this.plantations) p.Update(dt);
        this.progression.Update(dt);
        this.UpdateHarvest(dt);
        this.counter.Update(dt,this.player,this);
        this.zombies.Update(dt,this.counter,this);
        this.UpdateFlights(dt);
        this.UpdateCamera(dt);
        this.hud.Update(dt);
    }
};
