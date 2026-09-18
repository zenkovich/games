BF.Progression = class
{
    constructor(game)
    {
        this.game = game;
        this.index = 0;
        this.stages = [
            { name: "GARDEN 2", title: "OPEN A SECOND GARDEN", cost: 40, x: 570, y: 160, kind: "garden", garden: 1 },
            { name: "BIG STACK", title: "UPGRADE YOUR BACKPACK", cost: 70, x: 590, y: -840, kind: "pack" },
            { name: "GOLD BRAINS", title: "GROW GOLDEN BRAINS", cost: 110, x: 570, y: 580, kind: "garden", garden: 2 },
            { name: "VIP MARKET", title: "OPEN THE VIP MARKET", cost: 180, x: 850, y: -600, kind: "market" }
        ];
        for (let i = 0; i < this.stages.length; i++)
        {
            let s = this.stages[i];
            s.actor = Bridge.FindActor("BuyZones/BuyZone" + (i + 1));
            s.center = { x: s.x, y: s.y };
            s.paid = 0; s.done = false; s.active = i == 0;
            s.actor.SetEnabled(s.active);
            s.Remaining = function() { return Math.max(0, this.cost - this.paid); };
        }
    }

    Current() { return this.stages[this.index] || null; }

    Update(dt)
    {
        let s = this.Current();
        if (!s) return;
        let game = this.game;
        let near = BF.dist2(game.player.x, game.player.y, s.x, s.y) < 78*78;
        if (near && game.money > 0)
        {
            let pay = Math.min(100*dt, s.Remaining(), game.money);
            game.SpendMoney(pay); s.paid += pay;
        }
        if (s.Remaining() > 0.001) return;
        s.done = true; s.active = false; s.actor.SetEnabled(false);
        if (s.kind == "garden") game.plantations[s.garden].Unlock();
        if (s.kind == "pack") { game.capacity = BF.cfg.upgradedStackLimit; game.moveSpeed = BF.cfg.upgradedSpeed; }
        if (s.kind == "market") { game.marketLevel = 2; game.victory = true; game.victoryOpen = true; }
        game.hud.Celebrate(s.name + " UNLOCKED!");
        this.index++;
        let next = this.Current();
        if (next) { next.active = true; next.actor.SetEnabled(true); }
        game.hud.RefreshProgress();
    }
};
