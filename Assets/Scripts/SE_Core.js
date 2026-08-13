// Space Evolver: Galaxy Core — core namespace, factories and the screen state machine
var SE = (typeof SE !== 'undefined') ? SE : {};

SE.W = 540;
SE.H = 960;
SE.headless = o2.Integration.IsHeadless();

SE.clamp = function(v, a, b) { return v < a ? a : (v > b ? b : v); };

SE.makeActor = function(parent, name, layer)
{
    let a = new o2.Actor(0); // InScene: a NotInScene actor stays off-scene even after AddChild
    a.SetName(name);
    parent.AddChild(a);
    a.SetLayer(layer);
    return a;
};

// Sprite entity view: actor + ImageComponent. Returns { actor, img }
SE.makeSprite = function(parent, image, w, h, depth, layer)
{
    let a = new o2.Actor(0);
    a.SetName(image);
    parent.AddChild(a);
    a.SetLayer(layer || "Game");
    let img = new o2.ImageComponent();
    a.AddComponent(img);
    img.LoadFromImage(image);
    a.SetDrawingDepth(depth || 0); // draw depth belongs to the actor, not the image component
    a.GetTransform().SetSize2D(new Vec2(w, h));
    return { actor: a, img: img };
};

// Solid color rectangle (panels, bars)
SE.makeRect = function(parent, w, h, color, depth, layer)
{
    let a = new o2.Actor(0);
    a.SetName("rect");
    parent.AddChild(a);
    a.SetLayer(layer || "UI");
    let img = new o2.ImageComponent();
    a.AddComponent(img);
    img.LoadMonoColor(color);
    a.SetDrawingDepth(depth || 0); // draw depth belongs to the actor, not the image component
    a.GetTransform().SetSize2D(new Vec2(w, h));
    return { actor: a, img: img };
};

// Places a widget at world position (center-origin coords) with given size
SE.place = function(widget, cx, cy, w, h)
{
    widget.GetLayout().SetAnchorMin(new Vec2(0.5, 0.5));
    widget.GetLayout().SetAnchorMax(new Vec2(0.5, 0.5));
    widget.GetLayout().SetOffsetMin(new Vec2(cx - w/2, cy - h/2));
    widget.GetLayout().SetOffsetMax(new Vec2(cx + w/2, cy + h/2));
};

SE.makeLabel = function(parent, text, cx, cy, w, h, color, depth, size)
{
    if (SE.headless)
        return null;

    let lbl = Bridge.CreateLabel(text, size || 18);
    parent.AddChild(lbl);
    lbl.SetLayer("UI");
    SE.place(lbl, cx, cy, w, h);
    lbl.SetHorAlign(1); // Middle
    lbl.SetVerAlign(1); // Middle
    if (color)
        lbl.SetColor(color);
    lbl.SetDrawingDepth(depth || 110);
    return lbl;
};

SE.makeButton = function(parent, caption, cx, cy, w, h, depth, onClick)
{
    if (SE.headless)
        return null;

    let btn = Bridge.CreateButton(caption, 18);
    parent.AddChild(btn);
    btn.SetLayer("UI");
    SE.place(btn, cx, cy, w, h);
    btn.SetDrawingDepth(depth || 105);
    btn.onClick = onClick;
    return btn;
};

SE.fmt = function(n)
{
    n = Math.round(n);
    if (n >= 1000000) return (n/1000000).toFixed(1) + "M";
    if (n >= 10000) return (n/1000).toFixed(1) + "k";
    return "" + n;
};

// ------------------------------------------------------------------ Game (screens state machine)
SE.Game = class
{
    constructor(rootActor)
    {
        this.root = rootActor;
        this.state = "none";
        this.hangar = null;
        this.run = null;
        this.bgs = [];
        this.scroll = 0;
    }

    Start()
    {
        SE.meta = new SE.Meta();
        SE.meta.Load();

        if (!SE.headless)
        {
            this.bgRoot = SE.makeActor(this.root, "bgRoot", "Background");
            for (let i = 0; i < 2; i++)
            {
                let bg = SE.makeSprite(this.bgRoot, "SpaceEvolver/bg_space.png", SE.W, SE.H, i, "Background");
                bg.actor.GetTransform().SetPosition2D(new Vec2(0, i * SE.H));
                this.bgs.push(bg);
            }
        }

        this.GoHangar();
    }

    GoHangar()
    {
        this.Cleanup();
        this.state = "hangar";
        this.hangar = new SE.Hangar(this);
        this.hangar.Build();
    }

    StartRun()
    {
        this.Cleanup();
        this.state = "run";
        this.run = new SE.Run(this);
        SE.run = this.run; // shortcut for tests and debugging
        this.run.Start();
    }

    // Called by the run when it is over; shows results overlay handled by the run itself
    EndRunToHangar()
    {
        SE.meta.Save();
        this.GoHangar();
    }

    Cleanup()
    {
        if (this.hangar) { this.hangar.Destroy(); this.hangar = null; }
        if (this.run) { this.run.Destroy(); this.run = null; SE.run = null; }
    }

    Update(dt)
    {
        // scrolling space background
        if (!SE.headless && this.bgs.length == 2)
        {
            let speed = this.state == "run" ? 120 : 20;
            this.scroll += speed * dt;
            let base = -(this.scroll % SE.H); // two tiles at base and base+H always cover the screen
            for (let i = 0; i < 2; i++)
                this.bgs[i].actor.GetTransform().SetPosition2D(new Vec2(0, base + i * SE.H));
        }

        if (this.state == "run" && this.run)
            this.run.Update(dt);
        else if (this.state == "hangar" && this.hangar)
            this.hangar.Update(dt);
    }
};
