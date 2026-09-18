BF.Hud = class
{
    constructor(root)
    {
        this.root=root;this.moneyFlies=[];this.zoneLabels=[];this.toastTime=0;
        if(BF.headless)return;
        this.Panel("UI/card.png",0,426,496,76,100);
        this.title=this.Label("SAHUR'S FARM",-98,442,285,28,19,110);
        this.title.SetColor(new Color4(40,63,52,255));
        this.rank=this.Label("ROOKIE FARMER",-110,416,260,24,12,110);
        this.rank.SetColor(new Color4(93,125,80,255));
        this.Panel("UI/coin.png",131,433,34,34,112);
        this.moneyLabel=this.Label("0",188,432,88,42,27,115);
        this.moneyLabel.SetColor(new Color4(40,63,52,255));
        this.Panel("UI/dark_card.png",0,357,452,49,101);
        this.mission=this.Label("COLLECT YOUR FIRST BRAINS",0,365,424,30,16,112);
        this.progressBg=this.Panel("UI/progress_back.png",0,343,384,8,112);
        this.progress=this.Panel("UI/progress_fill.png",-191,343,2,8,113);
        this.hintPlate=this.Panel("UI/dark_card.png",0,-429,416,44,100);
        this.hint=this.Label("DRAG TO MOVE",0,-429,390,35,16,110);
        this.Panel("UI/card.png",178,-370,145,44,100);
        this.Panel("UI/brain_icon.png",133,-370,29,29,111);
        this.capacity=this.Label("0 / 30",195,-370,103,34,18,112);
        this.capacity.SetColor(new Color4(40,63,52,255));
        this.toastPlate=this.Panel("UI/gold_card.png",0,212,422,70,140);
        this.toast=this.Label("",0,212,395,56,21,145);
        this.toast.SetColor(new Color4(60,66,34,255));
        this.toastPlate.SetEnabled(false);this.toast.SetEnabled(false);
        this.joyBase=this.Panel("UI/joystick_base.png",0,-322,170,170,120);
        this.joyGlow=this.Panel("UI/joystick_glow.png",0,-322,95,95,121);
        this.joyKnob=this.Panel("UI/joystick_knob.png",0,-322,72,72,122);
        this.joyCaption=this.Label("DRAG TO WALK",0,-386,210,30,14,123);
        this.joyCaption.SetColor(new Color4(255,254,232,255));
        this.navArrow=this.Panel("UI/nav_arrow.png",0,0,45,45,118);
        this.navLabel=this.Label("",0,0,115,28,13,119);
        this.joyBase.SetTransparency(.55);this.joyKnob.SetTransparency(.75);this.joyGlow.SetEnabled(false);
        this.worldStock=this.Label("",0,0,180,32,16,116);
        this.win=[];
        this.win.push(this.Panel("UI/modal.png",0,35,470,420,200));
        this.win.push(this.Panel("UI/coin.png",0,148,74,74,201));
        this.win.push(this.Label("BRAIN EMPIRE!",0,73,425,55,30,205));
        this.win.push(this.Label("VIP MARKET UNLOCKED",0,17,425,40,20,205));
        this.win.push(this.Label("Bigger orders. Double rewards.",0,-25,430,38,15,205));
        let button=Bridge.CreateButton("KEEP FARMING",22);
        this.root.AddChild(button);button.SetLayer("2D");BF.place(button,0,-104,328,58);button.SetDrawingDepth(210);
        button.onClick=()=>{BF.game.victoryOpen=false;for(let w of this.win)w.SetEnabled(false);};
        this.win.push(button);for(let w of this.win)w.SetEnabled(false);
    }

    Panel(path,x,y,w,h,depth){return BF.makeImage(this.root,path,x,y,w,h,depth);}
    Label(text,x,y,w,h,size,depth){return BF.makeLabel(this.root,text,x,y,w,h,size,depth);}

    BindZones(zones)
    {
        if(BF.headless)return;
        for(let z of zones)
        {
            let plate=this.Panel("UI/dark_card.png",0,0,146,65,112);
            let name=this.Label(z.name,0,0,140,26,13,115);
            let value=this.Label("$ "+z.cost,0,0,140,33,21,115);
            let fill=this.Panel("UI/progress_fill.png",0,0,1,5,116);
            this.zoneLabels.push({zone:z,plate:plate,name:name,value:value,fill:fill});
        }
    }

    SetMoney(value){if(this.moneyLabel)this.moneyLabel.SetText(BF.fmt(value));}

    RefreshProgress()
    {
        if(BF.headless)return;
        let g=BF.game;
        this.rank.SetText(["ROOKIE FARMER","GROWING BUSINESS","STACK MASTER","GOLD HARVEST","BRAIN TYCOON"][g.progression.index]);
        if(g.victoryOpen){this.toastTime=0;for(let w of this.win)w.SetEnabled(true);}
    }

    Celebrate(message)
    {
        this.toastTime=2.5;
        if(BF.headless)return;
        this.toast.SetText(message);this.toast.SetEnabled(true);this.toastPlate.SetEnabled(true);
    }

    UpdateJoystick(active,x,y,dx,dy,dt)
    {
        if(BF.headless)return;
        let k=1-Math.exp(-dt*24);
        this.joyVisualX=BF.lerp(this.joyVisualX||0,active?dx*.68:0,k);
        this.joyVisualY=BF.lerp(this.joyVisualY||0,active?dy*.68:0,k);
        let bx=active?x:0,by=active?y:-322;
        BF.place(this.joyBase,bx,by,170,170);
        BF.place(this.joyKnob,bx+this.joyVisualX,by+this.joyVisualY,72,72);
        BF.place(this.joyGlow,bx+this.joyVisualX,by+this.joyVisualY,95,95);
        this.joyBase.SetTransparency(active?.92:.40);this.joyKnob.SetTransparency(active?1:.65);
        this.joyGlow.SetEnabled(active);this.joyCaption.SetEnabled(!active&&!BF.game.victoryOpen);
        this.joyBase.SetEnabled(!BF.game.victoryOpen);this.joyKnob.SetEnabled(!BF.game.victoryOpen);
    }

    FlyMoney(x,y,z,amount)
    {
        if(BF.headless)return;
        let from=BF.worldToUI(x,y,z);
        let image=this.Panel("UI/coin.png",from.x,from.y,30,30,126);
        let label=this.Label("+"+amount,from.x,from.y+23,95,34,22,127);
        label.SetColor(new Color4(255,237,118,255));
        this.moneyFlies.push({image:image,label:label,x:from.x,y:from.y,t:0});
    }

    Update(dt)
    {
        if(BF.headless)return;
        let g=BF.game, player=g.player;
        this.capacity.SetText((player.StackCount()+player.pending)+" / "+g.capacity);
        this.capacity.SetColor(player.StackFull()?new Color4(221,95,78,255):new Color4(40,63,52,255));
        let stage=g.progression.Current();
        let mission=g.harvested==0?"COLLECT YOUR FIRST BRAINS":(g.sold==0?"SERVE YOUR FIRST ZOMBIE":(stage?stage.title:"VIP ORDERS / DOUBLE REWARDS"));
        this.mission.SetText(mission);
        let progress=stage?BF.clamp((g.money+stage.paid)/stage.cost,0,1):1;
        BF.place(this.progress,-192+192*progress,343,Math.max(2,384*progress),8);
        let goal=g.Goal();
        let message=player.StackFull()?"STACK FULL - SELL YOUR HARVEST!":goal.text;
        if(g.harvested==0 && !player.moving)message="SWEEP THE ROWS & COLLECT";
        this.hint.SetText(message);
        for(let e of this.zoneLabels)
        {
            let p=BF.worldToUI(e.zone.x,e.zone.y,4);
            let visible=e.zone.active&&!g.victoryOpen&&Math.abs(p.x)<190&&p.y>-250&&p.y<285;
            for(let w of [e.plate,e.name,e.value,e.fill])w.SetEnabled(visible);
            if(!visible)continue;
            let x=p.x,y=p.y;
            BF.place(e.plate,x,y,146,65);BF.place(e.name,x,y+15,140,25);BF.place(e.value,x,y-11,140,32);
            let progress=e.zone.paid/e.zone.cost;
            BF.place(e.fill,x-59+59*progress,y-28,Math.max(1,118*progress),5);
            e.value.SetText("$ "+Math.ceil(e.zone.Remaining()));
        }
        let p=BF.worldToUI(BF.points.standCenter.x,BF.points.standCenter.y-65,145);
        BF.place(this.worldStock,p.x,p.y,180,32);
        let target=BF.worldToUI(goal.x,goal.y,30);
        let outside=Math.abs(target.x)>230||target.y>315||target.y< -225;
        this.navArrow.SetEnabled(outside&&!g.victoryOpen);this.navLabel.SetEnabled(outside&&!g.victoryOpen);
        if(outside)
        {
            let nx=BF.clamp(target.x,-218,218),ny=BF.clamp(target.y,-210,295);
            if(player.joyActive&&BF.dist2(nx,ny,player.joyOriginX,player.joyOriginY)<130*130)
            {
                nx=player.joyOriginX>0?-218:218;
                ny=BF.clamp(player.joyOriginY+120,-210,295);
            }
            BF.place(this.navArrow,nx,ny,45,45);
            this.navArrow.GetTransform().SetAngle(Math.atan2(-target.x,target.y));
            BF.place(this.navLabel,BF.clamp(nx,-195,195),ny-34,115,28);
            this.navLabel.SetText(goal.text.indexOf("BUILD")===0?"UPGRADE":(goal.x===BF.points.counterDrop.x?"SELL":"HARVEST"));
        }
        this.worldStock.SetText(g.counter.stock.length+g.counter.pending>0?"STOCK "+(g.counter.stock.length+g.counter.pending):"");
        this.toastTime-=dt;
        if(this.toastTime<=0){this.toast.SetEnabled(false);this.toastPlate.SetEnabled(false);}
        for(let f of this.moneyFlies)
        {
            f.t=Math.min(1,f.t+dt/.8);let e=f.t*f.t;
            BF.place(f.image,BF.lerp(f.x,131,e),BF.lerp(f.y,433,e),30*(1-e*.3),30*(1-e*.3));
            BF.place(f.label,f.x,f.y+35+f.t*45,95,34);f.label.SetTransparency(1-f.t);
            if(f.t>=1){f.done=true;f.image.Destroy();f.label.Destroy();}
        }
        this.moneyFlies=this.moneyFlies.filter(f=>!f.done);
    }
};
