// Zero Line — namespace, config, math, layout and scene helpers
var ZL = (typeof ZL !== 'undefined') ? ZL : {};

ZL.W = 540;
ZL.H = 960;
ZL.headless = o2.Integration.IsHeadless();

ZL.cfg = {
    size: 5,
    cell: 92,                 // grid step in design units
    tile: 82,                 // tile size inside a cell
    textHeight: 44,           // tile number font height, must match Bridge.CreateTile
    boardY: -40,              // board center
    roundTime: 60,
    minLine: 2,
    hitRadius: 0.42,          // fraction of a cell around its center that counts as a hit
    weights: [0.25, 15, 8, 5, 3, 2, 1.5, 1.0, 0.8, 0.5], // index = |value|, normalized on use
    scorePerUnit: 10,
    zeroBonus: 100,
    saveName: "ZeroLineSave.json",
    solvableTries: 30,
    maxLineCheck: 4,          // longest line the solvability check looks for
    anim: {
        selectSpeed: 18,      // exponential smoothing of the tile scale
        selectScale: 1.12,
        flashScale: 1.28,
        flash: 0.1,           // seconds the removed tiles glow before shrinking
        shrink: 0.12,
        fallDelay: 0.14,      // survivors wait for the flash before dropping
        fallBase: 0.18,
        fallPerCell: 0.045,
        scoreSpeed: 9,        // score counter catch-up rate
        floatTime: 0.8
    }
};

ZL.colors = {
    white: [255, 255, 255],
    green: [70, 230, 130],
    muted: [150, 158, 200],
    red: [255, 105, 95],
    gold: [255, 214, 100],
    dim: [10, 12, 28]
};

ZL.color = function(rgb, a) { return new Color4(rgb[0], rgb[1], rgb[2], a === undefined ? 255 : a); };

ZL.clamp = function(v, a, b) { return v < a ? a : (v > b ? b : v); };
ZL.lerp = function(a, b, t) { return a + (b - a)*t; };

// Deterministic generator (mulberry32) so tests can replay boards
ZL.makeRng = function(seed)
{
    let s = seed >>> 0;
    return function()
    {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0)/4294967296;
    };
};

ZL.fmtSigned = function(v) { return v > 0 ? "+" + v : "" + v; };
ZL.fmtExpr = function(values) { return values.map(v => "" + v).join(" + "); };

// ---------------------------------------------------------------- board layout
// Column 0 is the left one, row 0 is the bottom one: tiles fall towards row 0
ZL.cellCenter = function(c, r)
{
    let half = (ZL.cfg.size - 1)/2;
    return { x: (c - half)*ZL.cfg.cell, y: (r - half)*ZL.cfg.cell + ZL.cfg.boardY };
};

ZL.cellAt = function(x, y)
{
    let half = (ZL.cfg.size - 1)/2;
    let fc = x/ZL.cfg.cell + half;
    let fr = (y - ZL.cfg.boardY)/ZL.cfg.cell + half;
    let c = Math.round(fc), r = Math.round(fr);
    if (c < 0 || r < 0 || c >= ZL.cfg.size || r >= ZL.cfg.size)
        return null;

    if (Math.abs(fc - c) > ZL.cfg.hitRadius || Math.abs(fr - r) > ZL.cfg.hitRadius)
        return null;

    return { c: c, r: r };
};

// ---------------------------------------------------------------- input
// The UI camera fits the 540x960 design rect into the window; cursor positions come
// in screen pixels (center origin, y up), divide by the fitted scale to get UI units
ZL.uiScale = function()
{
    return Math.min(Bridge.GetScreenWidth()/ZL.W, Bridge.GetScreenHeight()/ZL.H);
};

ZL.cursorUI = function()
{
    let s = ZL.uiScale();
    return { x: Bridge.GetCursorX()/s, y: Bridge.GetCursorY()/s };
};

// ---------------------------------------------------------------- scene helpers (2D layer)
ZL.makeActor = function(parent, name)
{
    let a = new o2.Actor(0); // InScene
    a.SetName(name);
    parent.AddChild(a);
    a.SetLayer("2D");
    return a;
};

ZL.setPos = function(actor, x, y)
{
    actor.GetTransform().SetPosition2D(new Vec2(x, y));
};

ZL.makeSprite = function(parent, image, w, h, depth)
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

// White 1x1 sprite tinted by SetColor, so the color can change later
ZL.makeRect = function(parent, w, h, color, depth)
{
    let a = new o2.Actor(0);
    a.SetName("rect");
    parent.AddChild(a);
    a.SetLayer("2D");
    let img = new o2.ImageComponent();
    a.AddComponent(img);
    img.LoadMonoColor(new Color4(255, 255, 255, 255));
    img.SetColor(color);
    a.SetDrawingDepth(depth || 0);
    a.GetTransform().SetSize2D(new Vec2(w, h));
    return { actor: a, img: img };
};

ZL.place = function(widget, cx, cy, w, h)
{
    let layout = widget.GetLayout();
    layout.SetAnchorMin(new Vec2(0.5, 0.5));
    layout.SetAnchorMax(new Vec2(0.5, 0.5));
    layout.SetOffsetMin(new Vec2(cx - w/2, cy - h/2));
    layout.SetOffsetMax(new Vec2(cx + w/2, cy + h/2));
};

ZL.makeLabel = function(parent, text, cx, cy, w, h, size, depth, heavy, color)
{
    if (ZL.headless)
        return null;

    let lbl = Bridge.CreateLabel(text, size || 24, heavy !== false);
    parent.AddChild(lbl);
    lbl.SetLayer("2D");
    ZL.place(lbl, cx, cy, w, h);
    lbl.SetHorAlign(1); // Middle
    lbl.SetVerAlign(1);
    lbl.SetDrawingDepth(depth || 100);
    if (color)
        lbl.SetColor(ZL.color(color));
    return lbl;
};

ZL.makeButton = function(parent, image, caption, cx, cy, w, h, size, depth)
{
    if (ZL.headless)
        return null;

    let btn = Bridge.CreateButton(image, caption, size || 28);
    parent.AddChild(btn);
    btn.SetLayer("2D");
    ZL.place(btn, cx, cy, w, h);
    btn.SetDrawingDepth(depth || 100);
    return btn;
};
