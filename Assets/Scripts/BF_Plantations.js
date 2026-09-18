BF.Plantation = class
{
    constructor(index,unlocked)
    {
        this.index=index;this.center=BF.points.plantations[index];
        this.actor=Bridge.FindActor("Plantations/Plantation"+index);
        this.unlocked=unlocked;this.golden=index==2;this.spots=[];
        for(let row=0;row<BF.cfg.cropRows;row++)
            for(let col=0;col<BF.cfg.cropColumns;col++)
            {
                let actor=this.actor.GetChild("Spot"+(row*BF.cfg.cropColumns+col));
                let position=BF.getWorldPos(actor);
                this.spots.push({actor:actor,x:position.x,y:position.y,
                    state:unlocked?"ripe":"empty",progress:unlocked?1:0,delay:0,scaleStep:12});
                actor.SetEnabled(unlocked);
                BF.setScale(actor,BF.cfg.cropScale);
            }
    }

    Unlock()
    {
        this.unlocked=true;
        for(let s of this.spots)
        {
            s.state="growing";s.progress=.78;s.delay=0;s.scaleStep=-1;s.actor.SetEnabled(true);
        }
    }

    Update(dt)
    {
        if(!this.unlocked)return;
        for(let s of this.spots)
        {
            if(s.state=="ripe")continue;
            if(s.state=="empty")
            {
                s.delay-=dt;
                if(s.delay>0)continue;
                s.state="growing";s.progress=0;s.scaleStep=-1;s.actor.SetEnabled(true);
            }
            s.progress=Math.min(1,s.progress+dt/(this.golden?8.5:BF.cfg.growTime));
            let step=Math.floor(s.progress*12);
            if(step!==s.scaleStep)
            {
                s.scaleStep=step;let t=step/12;
                BF.setScale(s.actor,BF.cfg.cropScale*(.08+.92*t*t*(3-2*t)));
            }
            if(s.progress>=1)s.state="ripe";
        }
    }

    NearestRipe(x,y,radius)
    {
        if(!this.unlocked)return null;
        let best=null,limit=radius*radius;
        for(let s of this.spots)
        {
            if(s.state!=="ripe")continue;
            let distance=BF.dist2(x,y,s.x,s.y);
            if(distance<limit){best={spot:s,distance:distance};limit=distance;}
        }
        return best;
    }

    HasRipe(){return this.unlocked&&this.spots.some(s=>s.state=="ripe");}

    PopRipe(spot)
    {
        if(!spot || spot.state!=="ripe")return null;
        spot.state="empty";spot.delay=.8;spot.actor.SetEnabled(false);
        return{x:spot.x,y:spot.y,z:12};
    }
};
