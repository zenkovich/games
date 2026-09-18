// Sahur's Brain Farm — core namespace, config, math and scene helpers
var BF = (typeof BF !== 'undefined') ? BF : {};

BF.W = 540;
BF.H = 960;
BF.M = 100; // world units per meter, matches kUnitsPerMeter in the bootstrap
BF.headless = o2.Integration.IsHeadless();

BF.cfg = {
    brainPrice: 2, goldenPrice: 4,
    stackLimit: 30, upgradedStackLimit: 60,
    counterLimit: 36, growTime: 7.0,
    playerSpeed: 440, upgradedSpeed: 580,
    zombieSpeed: 220, zombieInterval: .85, queueLength: 5,
    harvestRadius: 115, counterRadius: 100,
    transferDelay: .024, sellDelay: .065, flightTime: .23,
    cropRows: 20, cropColumns: 4, brainScale: .55, cropScale: .85,
    cameraYaw: 35*Math.PI/180, cameraPitch: Math.PI/4
};

BF.points = {
    playerStart: {x:610,y:-430},
    counterDrop: {x:655,y:-260},
    standCenter: {x:820,y:-260},
    zombieSpawn: {x:1030,y:1050}, zombieExit: {x:1120,y:1200},
    plantations: [{x:-230,y:-260},{x:-230,y:160},{x:-230,y:580}],
    bounds: {minX:-990,maxX:1040,minY:-1090,maxY:1210},
    cameraOffset: {x:1230,y:-1760,z:2300}
};

BF.screenToGround = function(x,y)
{
    let c=Math.cos(BF.cfg.cameraYaw),s=Math.sin(BF.cfg.cameraYaw);
    let length=Math.sqrt(x*x+y*y), up=y/Math.cos(BF.cfg.cameraPitch);
    let wx=c*x-s*up,wy=s*x+c*up,worldLength=Math.sqrt(wx*wx+wy*wy);
    return worldLength>0?{x:wx/worldLength*length,y:wy/worldLength*length}:{x:0,y:0};
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

BF.makeImage = function(parent, image, cx, cy, w, h, depth)
{
    let widget = new o2.Image();
    parent.AddChild(widget);
    widget.SetLayer("2D");
    widget.SetImageName(image);
    BF.place(widget, cx, cy, w, h);
    widget.SetDrawingDepth(depth);
    return widget;
};
