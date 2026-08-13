// Short-lived visual effects: flashes, sparks and floating texts.
// In headless mode the entries are still tracked (without views), so tests can assert
// that an effect was played without a renderer.
var SE = (typeof SE !== 'undefined') ? SE : {};

SE.Fx = class
{
    constructor(root, hud)
    {
        this.root = root;
        this.hud = hud;
        this.items = [];
    }

    // opts: { vx, vy, spin, growTo, fadeIn, color }
    Spawn(kind, image, x, y, w, h, life, opts)
    {
        opts = opts || {};
        let item = {
            kind: kind,
            x: x, y: y, w: w, h: h,
            vx: opts.vx || 0, vy: opts.vy || 0,
            spin: opts.spin || 0, angle: 0,
            growTo: (opts.growTo === undefined) ? 1 : opts.growTo,
            fadeIn: opts.fadeIn || 0,
            color: opts.color || new Color4(255, 255, 255, 255),
            life: life, maxLife: life,
            view: null, label: null
        };

        if (!SE.headless && this.root && image)
        {
            item.view = SE.makeSprite(this.root, image, w, h, 60);
            item.view.actor.GetTransform().SetPosition2D(new Vec2(x, y));
            item.view.img.SetColor(item.color);
        }

        this.items.push(item);
        return item;
    }

    Flash(x, y, w, h, color)
    {
        return this.Spawn("flash", "SpaceEvolver/particle_glow.png", x, y, w, h, 0.45,
                          { color: color, growTo: 1.8 });
    }

    Burst(x, y, color, count, speed)
    {
        for (let i = 0; i < count; i++)
        {
            let a = (i / count) * 6.28 + Math.random() * 0.6;
            let v = speed * (0.5 + Math.random() * 0.7);
            this.Spawn("spark", "SpaceEvolver/particle_glow.png", x, y, 34, 34, 0.55,
                       { vx: Math.cos(a) * v, vy: Math.sin(a) * v, color: color, growTo: 0.35 });
        }
    }

    // Rising caption used to confirm a pickup or a buff
    FloatingText(text, x, y, color, life)
    {
        let item = {
            kind: "text", x: x, y: y, vx: 0, vy: 110, spin: 0, angle: 0,
            growTo: 1, fadeIn: 0, color: color,
            life: life, maxLife: life, view: null, label: null
        };

        if (!SE.headless && this.hud)
            item.label = SE.makeLabel(this.hud, text, x, y, 320, 34, color, 115);

        this.items.push(item);
        return item;
    }

    Update(dt)
    {
        let alive = [];
        for (let i = 0; i < this.items.length; i++)
        {
            let it = this.items[i];
            it.life -= dt;

            if (it.life <= 0)
            {
                if (it.view && it.view.actor) it.view.actor.Destroy();
                if (it.label) it.label.Destroy();
                continue;
            }

            let t = 1 - it.life / it.maxLife;
            it.x += it.vx * dt;
            it.y += it.vy * dt;
            it.vx *= (1 - Math.min(1, 2.5 * dt));
            it.vy *= (1 - Math.min(1, 2.5 * dt));
            it.angle += it.spin * dt;

            // fades out over its life; fadeIn eases the first part of it in
            let alpha = 1 - t;
            if (it.fadeIn > 0 && t < it.fadeIn)
                alpha = t / it.fadeIn;

            if (it.view)
            {
                let scale = 1 + (it.growTo - 1) * t;
                let a = it.view.actor.GetTransform();
                a.SetPosition2D(new Vec2(it.x, it.y));
                a.SetSize2D(new Vec2(it.w * scale, it.h * scale));
                if (it.spin != 0)
                    a.SetAngle(it.angle);

                it.view.img.SetColor(new Color4(it.color.r, it.color.g, it.color.b,
                                                Math.round(it.color.a * alpha)));
            }

            if (it.label)
            {
                SE.place(it.label, it.x, it.y, 320, 34);
                it.label.SetTransparency(alpha);
            }

            alive.push(it);
        }
        this.items = alive;
    }

    Count() { return this.items.length; }

    Destroy()
    {
        for (let i = 0; i < this.items.length; i++)
        {
            let it = this.items[i];
            if (it.view && it.view.actor) it.view.actor.Destroy();
            if (it.label) it.label.Destroy();
        }
        this.items = [];
    }
};
