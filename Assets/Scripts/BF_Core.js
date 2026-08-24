// Sahur's Brain Farm — core namespace, config, math and scene helpers
var BF = (typeof BF !== 'undefined') ? BF : {};

BF.W = 540;
BF.H = 960;
BF.M = 100; // world units per meter, matches kUnitsPerMeter in the bootstrap
BF.headless = o2.Integration.IsHeadless();

BF.cfg = {
    brainPrice: 10,          // $ paid by a zombie per brain
    stackLimit: 8,           // brains the player carries at most
    counterLimit: 6,         // brains the stand holds at most
    growTime: 4.0,           // seconds for one brain to ripen
    plantationCosts: [0, 100, 250],
    playerSpeed: 3.4*BF.M,   // units/s
    zombieSpeed: 1.5*BF.M,   // units/s
    zombieInterval: 2.2,     // seconds between arrivals
    queueLength: 5,
    harvestRadius: 1.5*BF.M, // around a plantation center
    counterRadius: 1.6*BF.M, // around the drop point
    buyRadius: 1.05*BF.M,    // around a buy zone center
    buyRate: 120,            // $ per second drained while standing on a zone
    transferDelay: 0.12,     // seconds between brain hops (cascade feel)
    sellDelay: 0.7,          // seconds between zombie purchases
    flightTime: 0.32         // seconds of a brain flight
};

// World anchor points, must match BrainFarmBootstrap.cpp
BF.points = {
    counterDrop: { x: 0, y: 3.35*BF.M },
    standCenter: { x: 0, y: 4.6*BF.M },
    zombieSpawn: { x: 0.9*BF.M, y: 10.8*BF.M },
    zombieExit: { x: -0.9*BF.M, y: 10.8*BF.M },
    plantations: [{ x: 0, y: -1.6*BF.M }, { x: -2.0*BF.M, y: -4.3*BF.M }, { x: 2.0*BF.M, y: -4.3*BF.M }],
    bounds: { minX: -3.5*BF.M, maxX: 3.5*BF.M, minY: -6.3*BF.M, maxY: 7.7*BF.M }
};

BF.clamp = function(v, a, b) { return v < a ? a : (v > b ? b : v); };
BF.lerp = function(a, b, t) { return a + (b - a)*t; };
BF.dist2 = function(ax, ay, bx, by) { let dx = ax - bx, dy = ay - by; return dx*dx + dy*dy; };

BF.fmt = function(n)
{
    n = Math.round(n);
    if (n >= 1000000) return (n/1000000).toFixed(1) + "M";
    if (n >= 10000) return (n/1000).toFixed(1) + "k";
    return "" + n;
};

// ---------------------------------------------------------------- transforms (3D)
BF.getPos = function(actor)
{
    let t = actor.GetTransform();
    return { x: t.GetPositionX(), y: t.GetPositionY(), z: t.GetPositionZ() };
};

BF.setPos = function(actor, x, y, z)
{
    let t = actor.GetTransform();
    t.SetPositionX(x);
    t.SetPositionY(y);
    t.SetPositionZ(z);
};

// Through the bridge: Vec3F returned into JS carries undefined fields
BF.getWorldPos = function(actor)
{
    return { x: Bridge.WorldPosX(actor), y: Bridge.WorldPosY(actor), z: Bridge.WorldPosZ(actor) };
};

// Per-axis setters: SetScale takes a Vec3F, a JS Vec2 marshals into it as zeros
BF.setScale = function(actor, s)
{
    let t = actor.GetTransform();
    t.SetScaleX(s);
    t.SetScaleY(s);
    t.SetScaleZ(s);
};

// Model yaw: the visual child faces -Y at zero, so yaw rotates the owner around Z
BF.faceDir = function(actor, dx, dy)
{
    if (Math.abs(dx) + Math.abs(dy) < 0.0001)
        return;

    actor.GetTransform().SetAngle(Math.atan2(-dx, dy) + Math.PI);
};

// ---------------------------------------------------------------- UI (2D layer)
// The UI camera fits the 540x960 design rect into the window; cursor positions come
// in screen pixels (center origin, y up), divide by the fitted scale to get UI units
BF.uiScale = function()
{
    return Math.min(Bridge.GetScreenWidth()/BF.W, Bridge.GetScreenHeight()/BF.H);
};

BF.cursorUI = function()
{
    let s = BF.uiScale();
    return { x: Bridge.GetCursorX()/s, y: Bridge.GetCursorY()/s };
};

BF.worldToUI = function(x, y, z)
{
    let s = BF.uiScale();
    return { x: Bridge.WorldToScreenX(x, y, z)/s, y: Bridge.WorldToScreenY(x, y, z)/s };
};

BF.makeActor = function(parent, name, layer)
{
    let a = new o2.Actor(0); // InScene
    a.SetName(name);
    parent.AddChild(a);
    a.SetLayer(layer || "2D");
    return a;
};

BF.makeSprite = function(parent, image, w, h, depth)
{
    let a = new o2.Actor(0);
    a.SetName(image);
    parent.AddChild(a);
    a.SetLayer("2D");
    let img = new o2.ImageComponent();
    a.AddComponent(img);
    img.LoadFromImage(image);
    a.SetDrawingDepth(depth || 0); // draw depth belongs to the actor, not the image component
    a.GetTransform().SetSize2D(new Vec2(w, h));
    return { actor: a, img: img };
};

BF.makeRect = function(parent, w, h, color, depth)
{
    let a = new o2.Actor(0);
    a.SetName("rect");
    parent.AddChild(a);
    a.SetLayer("2D");
    let img = new o2.ImageComponent();
    a.AddComponent(img);
    img.LoadMonoColor(color);
    a.SetDrawingDepth(depth || 0);
    a.GetTransform().SetSize2D(new Vec2(w, h));
    return { actor: a, img: img };
};

BF.place = function(widget, cx, cy, w, h)
{
    widget.GetLayout().SetAnchorMin(new Vec2(0.5, 0.5));
    widget.GetLayout().SetAnchorMax(new Vec2(0.5, 0.5));
    widget.GetLayout().SetOffsetMin(new Vec2(cx - w/2, cy - h/2));
    widget.GetLayout().SetOffsetMax(new Vec2(cx + w/2, cy + h/2));
};

BF.makeLabel = function(parent, text, cx, cy, w, h, size, depth)
{
    if (BF.headless)
        return null;

    let lbl = Bridge.CreateLabel(text, size || 24);
    parent.AddChild(lbl);
    lbl.SetLayer("2D");
    BF.place(lbl, cx, cy, w, h);
    lbl.SetHorAlign(1); // Middle
    lbl.SetVerAlign(1);
    lbl.SetDrawingDepth(depth || 110);
    return lbl;
};
