BF.Counter = class
{
    constructor()
    {
        this.spotsRoot=Bridge.FindActor("Location/CounterSpots");
        this.spots=[];this.occupied=[];
        for(let i=0;i<BF.cfg.counterLimit;i++)
        {
            this.spots.push(this.spotsRoot.GetChild("Spot"+i));this.occupied.push(false);
        }
        this.stock=[];this.pending=0;this._transferTimer=0;
    }

    Full(){return this.stock.length+this.pending>=BF.cfg.counterLimit;}

    Update(dt,player,game)
    {
        this._transferTimer-=dt;
        let p=BF.points.counterDrop;
        if(BF.dist2(player.x,player.y,p.x,p.y)>BF.cfg.counterRadius*BF.cfg.counterRadius || this.Full() || player.StackCount()==0 || this._transferTimer>0)return;
        let slot=this.occupied.indexOf(false);
        if(slot<0)return;
        this._transferTimer=BF.cfg.transferDelay;
        let item=player.PopFromStack(),brain=item.actor;
        this.occupied[slot]=true;this.pending++;item.slot=slot;
        let from=BF.getWorldPos(brain);BF.setScale(brain,BF.cfg.brainScale);
        game.StartFlight(brain,from,()=>BF.getWorldPos(this.spots[slot]),()=>{
            this.spots[slot].AddChild(brain);BF.setPos(brain,0,0,0);BF.setScale(brain,.52);
            this.pending--;this.stock.push(item);
        });
    }

    SellTo(zombie,game)
    {
        let item=this.stock.pop();if(!item)return false;
        this.occupied[item.slot]=false;
        let brain=item.actor,from=BF.getWorldPos(brain);BF.setScale(brain,.52);
        game.StartFlight(brain,from,()=>({x:zombie.x,y:zombie.y-20,z:130}),()=>{
            brain.Destroy();game.RecordSale(item.value,zombie);
        });
        return true;
    }
};
