// HUD: money counter on top, floating joystick visuals, buy zone price tags
// and flying money sparks. All 2D-layer, in the 540x960 design space
BF.Hud = class
{
    constructor(rootActor)
    {
        this.root = rootActor;
        this.moneyFlies = [];
        this.zoneLabels = [];

        if (BF.headless)
            return;

        let top = BF.H/2;

        this.plaque = BF.makeSprite(this.root, "UI/money_plaque.png", 190, 64, 100);
        this.plaque.actor.GetTransform().SetPosition2D(new Vec2(0, top - 62));

        this.moneyLabel = BF.makeLabel(this.root, "$ 0", 16, top - 62, 170, 50, 30, 110);

        this.joyBase = BF.makeSprite(this.root, "UI/joystick_base.png", 150, 150, 100);
        this.joyKnob = BF.makeSprite(this.root, "UI/joystick_knob.png", 64, 64, 101);
        this.joyBase.actor.SetEnabled(false);
        this.joyKnob.actor.SetEnabled(false);
    }

    BindZones(zones)
    {
        if (BF.headless)
            return;

        for (let zone of zones)
        {
            let plaque = BF.makeSprite(this.root, "UI/money_plaque.png", 120, 44, 112);
            let label = BF.makeLabel(this.root, "$ " + zone.cost, 0, 0, 160, 40, 24, 115);
            zone.label = label;
            zone.labelPlaque = plaque.actor;
            this.zoneLabels.push({ zone: zone, label: label, plaque: plaque.actor });
        }
    }

    SetMoney(value)
    {
        if (this.moneyLabel)
            this.moneyLabel.SetText("$ " + BF.fmt(value));
    }

    UpdateJoystick(active, ox, oy, dx, dy)
    {
        if (BF.headless)
            return;

        this.joyBase.actor.SetEnabled(active);
        this.joyKnob.actor.SetEnabled(active);
        if (active)
        {
            this.joyBase.actor.GetTransform().SetPosition2D(new Vec2(ox, oy));
            this.joyKnob.actor.GetTransform().SetPosition2D(new Vec2(ox + dx, oy + dy));
        }
    }

    FlyMoney(wx, wy, wz)
    {
        if (BF.headless)
            return;

        let from = BF.worldToUI(wx, wy, wz);
        let spark = BF.makeSprite(this.root, "UI/money_icon.png", 44, 44, 105);
        spark.actor.GetTransform().SetPosition2D(new Vec2(from.x, from.y));
        this.moneyFlies.push({ view: spark, x: from.x, y: from.y, t: 0 });
    }

    Update(dt)
    {
        if (BF.headless)
            return;

        // price tags float above their zones in screen space
        for (let entry of this.zoneLabels)
        {
            if (entry.zone.done)
            {
                entry.plaque.SetEnabled(false);
                continue;
            }

            let c = entry.zone.center;
            let p = BF.worldToUI(c.x, c.y, 0.1*BF.M);
            entry.plaque.GetTransform().SetPosition2D(new Vec2(p.x, p.y + 8));
            BF.place(entry.label, p.x, p.y + 8, 160, 40);
            entry.label.SetText("$ " + Math.ceil(entry.zone.Remaining()));
        }

        let top = BF.H/2;
        for (let fly of this.moneyFlies)
        {
            fly.t = Math.min(1, fly.t + dt/0.55);
            let e = fly.t*fly.t*(3 - 2*fly.t);
            let x = BF.lerp(fly.x, 0, e);
            let y = BF.lerp(fly.y, top - 62, e);
            fly.view.actor.GetTransform().SetPosition2D(new Vec2(x, y));
            if (fly.t >= 1)
            {
                fly.done = true;
                fly.view.actor.Destroy();
            }
        }

        this.moneyFlies = this.moneyFlies.filter(f => !f.done);
    }
};
