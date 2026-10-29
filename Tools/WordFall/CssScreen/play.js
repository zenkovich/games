// WordFall in the browser: the engine's core (WordBoard / WordLevel / WordBoardMotion, loaded as
// script tags) drives the model; this file is the views of the o2 screen rewritten for the DOM —
// the board with falling tiles, the tray with flying letters, tasks, HUD, boosters, the move
// choreography (letters to the bar, bombs, rockets, fireworks), particles on a canvas, the
// level-end popup, and the intro flight of the letters onto the board.
// Units: 1rem = 1 concept pixel (game.css); all positions below are in those pixels.
(function() {
"use strict";

var COLS = 7, ROWS = 8;
var BOARD = { left: 8, top: 404, tile: 61, pitchX: (455 - 61)/6, pitchY: 66 };
var BAR = { x0: 72, x1: 461, y: 299, inset: 12, minFill: 0.12 };
var TRAY = { left: 7, width: 338, cy: 363.5, slot: 44, step: 48, inner: 320 };
var FALL = { speed: 9.5, cascade: 0.05, gap: 0.6 };
var FX = { stagger: 0.12, letterSpeed: 450, letterMin: 0.4, letterMax: 0.95, collapseDelay: 0.15,
           rocketSpeed: 380, rocketMin: 0.5, rocketMax: 1.2, rocketDetour: 150, rocketStagger: 0.15,
           rocketCharge: 0.14, bonusPause: 0.3, bombCharge: 0.28, bombShake: 6.5 };
var MODES = ["hammer", "shuffle", "hint", "joker", "doubler"];
var MODE_TEXT = { hammer: "Молоток: нажмите плитку", joker: "Джокер: нажмите плитку", doubler: "Удвоитель: нажмите плитку" };
var BONUS_ICON = { bomb: "💣", rocket: "🚀", fireworks: "🎆" };
var PROGRESS_KEY = "wordfall_play_progress";

var params = new URLSearchParams(location.search);
var SEED = parseInt(params.get("seed") || "0") || 0;
var AUTO = params.get("auto") == "1";
var START_LEVEL = params.has("level") ? parseInt(params.get("level")) : -1;

// progress lives in localStorage instead of the engine's file system
PlayerProgress.prototype.Save = function() {
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify({ currentLevel: this.currentLevel, bestScores: this.bestScores, seenTutorials: this.seenTutorials })); }
    catch (e) { return false; }
    return true;
};
PlayerProgress.prototype.Load = function() {
    try {
        var data = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "null");
        if (!data) return false;
        this.currentLevel = data.currentLevel || 0;
        this.bestScores = Array.isArray(data.bestScores) ? data.bestScores : [];
        this.seenTutorials = Array.isArray(data.seenTutorials) ? data.seenTutorials : [];
        return true;
    } catch (e) { return false; }
};

var $ = function(id) { return document.getElementById(id); };
var el = function(cls, html) { var e = document.createElement("div"); e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
var smooth = function(k) { return k*k*(3 - 2*k); };
var clamp = function(v, a, b) { return v < a ? a : v > b ? b : v; };
var cellX = function(c) { return BOARD.left + c*BOARD.pitchX + BOARD.tile/2; };
var cellY = function(r) { return BOARD.top + (ROWS - 1 - r)*BOARD.pitchY + BOARD.tile/2; };
var same = function(a, b) { return a.c == b.c && a.r == b.r; };
var inList = function(list, cell) { return list.some(function(x) { return same(x, cell); }); };

// ---- model ----------------------------------------------------------------------------------------

var dictionary = WordDictionary.LoadDefault();
var boardConfig = WordFallConfigs.DefaultBoardConfig();
var campaign = WordFallCampaignData.map(function(l) { return WordFallConfigs.NormalizeLevel(l); });
var level = new WordLevel();
var motion = new WordBoardMotion();
var progress = new PlayerProgress();
progress.Load();
var levelIndex = 0;
var lastMove = new WordMoveResult();

function tileAt(c, r) { return level.GetBoard().GetTile({ c: c, r: r }); }
function selection() { return level.GetBoard().GetSelection(); }
function letterValue(letter) { return level.GetBoard()._LetterValue(letter); }

// ---- effects sequencer ---------------------------------------------------------------------------

var Fx = {
    anims: [], busy: false,
    add: function(delay, dur, apply, done) { this.anims.push({ delay: delay, dur: Math.max(dur, 0.001), apply: apply, done: done || null, t: 0 }); },
    isBusy: function() { return this.busy || this.anims.length > 0; },
    update: function(dt) {
        var alive = [];
        for (var i = 0; i < this.anims.length; i++) {
            var a = this.anims[i];
            a.t += dt;
            var k = (a.t - a.delay)/a.dur;
            if (k < 0) { alive.push(a); continue; }
            try {
                if (k >= 1) { if (a.apply) a.apply(1); if (a.done) a.done(); }
                else { if (a.apply) a.apply(smooth(k)); alive.push(a); }
            } catch (e) { console.error("effect step failed", e); }
        }
        this.anims = alive;
    },
    clear: function() { this.anims = []; this.busy = false; }
};

// ---- particles on the canvas --------------------------------------------------------------------

var Vfx = {
    canvas: $("particles"), ctx: null, parts: [], unit: 1,
    init: function() { this.ctx = this.canvas.getContext("2d"); this.resize(); },
    resize: function() {
        this.unit = parseFloat(getComputedStyle(document.documentElement).fontSize);
        var dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.round(471*this.unit*dpr);
        this.canvas.height = Math.round(1026*this.unit*dpr);
        this.ctx.setTransform(this.unit*dpr, 0, 0, this.unit*dpr, 0, 0);
    },
    burst: function(x, y, o) {
        var n = o.count || 12;
        for (var i = 0; i < n; i++) {
            var a = (o.angle !== undefined ? o.angle : Math.random()*Math.PI*2) + (Math.random() - 0.5)*(o.spread !== undefined ? o.spread : Math.PI*2);
            var s = (o.speed || 120)*(0.5 + Math.random()*0.7);
            this.parts.push({ x: x, y: y, vx: Math.cos(a)*s, vy: Math.sin(a)*s, life: (o.life || 0.6)*(0.7 + Math.random()*0.6), t: 0,
                              size: (o.size || 3)*(0.6 + Math.random()*0.8), color: o.colors[Math.floor(Math.random()*o.colors.length)],
                              g: o.gravity || 0, drag: o.drag || 0, shape: o.shape || "dot", spin: (Math.random() - 0.5)*10 });
        }
    },
    ring: function(x, y, r0, r1, life, color, width) { this.parts.push({ x: x, y: y, shape: "ring", r0: r0, r1: r1, life: life, t: 0, color: color, width: width || 3 }); },
    burn: function(x, y) { this.burst(x, y, { count: 14, speed: 110, life: 0.5, size: 3, colors: ["#ffd27a", "#ff9a3c", "#ffe9b8", "#e05a2a"], gravity: 160, drag: 2 }); },
    scoreHit: function(x, y) { this.burst(x, y, { count: 18, speed: 130, life: 0.6, size: 3, colors: ["#fff3c4", "#ffd04a", "#ffffff"], gravity: 60, shape: "star" }); },
    bombBlast: function(x, y) {
        this.ring(x, y, 10, 120, 0.45, "rgba(255,200,120,.9)", 6);
        this.burst(x, y, { count: 40, speed: 220, life: 0.7, size: 4, colors: ["#ffe08a", "#ff8a2a", "#ff4a1a", "#fff4d0"], gravity: 220, drag: 2 });
        this.burst(x, y, { count: 14, speed: 60, life: 1.1, size: 12, colors: ["rgba(90,80,70,.5)", "rgba(60,50,45,.45)"], gravity: -40, drag: 3, shape: "puff" });
    },
    rocketLaunch: function(x, y) { this.ring(x, y, 4, 40, 0.3, "rgba(255,220,160,.8)", 3); this.burst(x, y, { count: 10, speed: 90, life: 0.4, size: 3, colors: ["#ffd27a", "#ffffff", "#ff9a3c"], gravity: 120 }); },
    rocketTrail: function(x, y) { this.burst(x, y, { count: 2, speed: 25, life: 0.35, size: 3, colors: ["#ffd27a", "#ff8a2a", "rgba(200,200,200,.6)"], gravity: 0, drag: 2 }); },
    rocketImpact: function(x, y) { this.ring(x, y, 6, 70, 0.3, "rgba(170,230,255,.9)", 4); this.burst(x, y, { count: 24, speed: 160, life: 0.55, size: 3, colors: ["#bfefff", "#ffffff", "#ffd27a", "#6ad1ff"], gravity: 150, shape: "star" }); },
    fireworkBurst: function(x, y) {
        this.ring(x, y, 10, 90, 0.4, "rgba(255,170,230,.9)", 5);
        this.burst(x, y, { count: 50, speed: 200, life: 0.9, size: 4, colors: ["#ff6ad5", "#ffd04a", "#6ad1ff", "#7dff8a", "#ffffff"], gravity: 120, drag: 1.5, shape: "confetti" });
    },
    crateHit: function(x, y) { this.burst(x, y, { count: 8, speed: 90, life: 0.45, size: 4, colors: ["#b07a3c", "#8a5a28", "#d9a86a"], gravity: 300, shape: "chip" }); },
    crateBreak: function(x, y) { this.burst(x, y, { count: 18, speed: 150, life: 0.6, size: 5, colors: ["#b07a3c", "#8a5a28", "#d9a86a", "#5a3a18"], gravity: 300, shape: "chip" }); },
    snowMelt: function(x, y) { this.burst(x, y, { count: 12, speed: 60, life: 0.6, size: 9, colors: ["rgba(255,255,255,.8)", "rgba(220,236,248,.8)"], gravity: -30, drag: 2, shape: "puff" }); this.burst(x, y, { count: 8, speed: 80, life: 0.6, size: 3, colors: ["#8ac8f0", "#5aa8e0"], gravity: 400 }); },
    delivered: function(x, y) { this.ring(x, y, 8, 60, 0.4, "rgba(255,230,120,.9)", 4); this.burst(x, y, { count: 14, speed: 110, life: 0.6, size: 3, colors: ["#fff3c4", "#ffd04a", "#ffffff"], gravity: 40, shape: "star" }); },
    bonusSparkle: function(x, y) { this.burst(x + (Math.random() - 0.5)*40, y + (Math.random() - 0.5)*40, { count: 1, speed: 20, life: 0.5, size: 4, colors: ["#ffffff", "#fff0a0"], gravity: -30, shape: "star" }); },
    bonusSpawn: function(x, y) { this.ring(x, y, 10, 50, 0.4, "rgba(255,240,180,.9)", 3); },
    win: function() { for (var i = 0; i < 70; i++) this.parts.push({ x: Math.random()*471, y: -20 - Math.random()*300, vx: (Math.random() - 0.5)*40, vy: 80 + Math.random()*120, life: 4, t: 0, size: 5, color: ["#ff6ad5", "#ffd04a", "#6ad1ff", "#7dff8a", "#ffffff", "#ff8a2a"][i % 6], g: 30, drag: 0, shape: "confetti", spin: (Math.random() - 0.5)*12 }); },
    update: function(dt) {
        var alive = [];
        for (var i = 0; i < this.parts.length; i++) {
            var p = this.parts[i];
            p.t += dt;
            if (p.t >= p.life) continue;
            if (p.shape != "ring") {
                p.vy += (p.g || 0)*dt;
                if (p.drag) { p.vx -= p.vx*p.drag*dt; p.vy -= p.vy*p.drag*dt; }
                p.x += p.vx*dt; p.y += p.vy*dt;
            }
            alive.push(p);
        }
        this.parts = alive;
    },
    draw: function() {
        var ctx = this.ctx;
        ctx.clearRect(0, 0, 471, 1026);
        for (var i = 0; i < this.parts.length; i++) {
            var p = this.parts[i], k = p.t/p.life;
            ctx.globalAlpha = 1 - k*k;
            ctx.fillStyle = p.color; ctx.strokeStyle = p.color;
            if (p.shape == "ring") {
                ctx.lineWidth = p.width*(1 - k) + 0.5;
                ctx.beginPath(); ctx.arc(p.x, p.y, p.r0 + (p.r1 - p.r0)*smooth(k), 0, Math.PI*2); ctx.stroke();
            } else if (p.shape == "puff") {
                ctx.beginPath(); ctx.arc(p.x, p.y, p.size*(0.6 + k), 0, Math.PI*2); ctx.fill();
            } else if (p.shape == "confetti" || p.shape == "chip") {
                ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.t*p.spin);
                ctx.fillRect(-p.size/2, -p.size/4, p.size, p.size/2); ctx.restore();
            } else if (p.shape == "star") {
                ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.t*p.spin);
                var s = p.size*(1 - k*0.5);
                ctx.beginPath();
                for (var j = 0; j < 8; j++) { var rr = j % 2 ? s*0.4 : s; var a = j*Math.PI/4; ctx.lineTo(Math.cos(a)*rr, Math.sin(a)*rr); }
                ctx.closePath(); ctx.fill(); ctx.restore();
            } else {
                ctx.beginPath(); ctx.arc(p.x, p.y, p.size*(1 - k*0.6), 0, Math.PI*2); ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
    }
};

// ---- the screen ----------------------------------------------------------------------------------

var screen = $("screen"), fxLayer = $("fx"), introLayer = $("intro");
var boardEl = $("board"), trayEl = $("tray"), wordsEl = $("words"), othersEl = $("others");
var tiles = [];          // [c][r] {el, letter, points, visible, shown:{letter,value}}
var slots = [];          // tray slots {el, letter, points, x, targetX, placed}
var flights = [];        // letters flying board -> tray
var hintQueue = [], hintTimer = 0;
var collapsing = false, pendingCollapse = null;
var aimMode = null;
var intro = { active: false, clones: [] };
var shake = { x: 0, y: 0, time: 0, duration: 1, strength: 0 };
var bonus = { time: 0, sparkle: 0, charge: null };
var displayScore = 0, scoreTween = null;
var messageTimer = 0, flashTimer = 0;
var popupShown = false, popupState = "playing", popupIdle = 0, popupStars = 0, confetti = [];
var acceptSeq = { base: 0, final: 0, wordShare: 0, bonusShare: 0, lastArrive: 0 };

function makeTile(cls) {
    var t = el("tile " + cls, '<span class="letter"></span><span class="points"></span>');
    return { el: t, letter: t.children[0], points: t.children[1] };
}

function setPos(e, x, y, size, scale, angle) {
    var s = size !== undefined ? size/BOARD.tile : 1;
    e.style.left = (x - BOARD.tile/2) + "rem";
    e.style.top = (y - BOARD.tile/2) + "rem";
    e.style.transform = "scale(" + (s*(scale || 1)) + ")" + (angle ? " rotate(" + angle + "deg)" : "");
}

function buildBoard() {
    boardEl.innerHTML = "";
    tiles = [];
    for (var c = 0; c < COLS; c++) {
        tiles[c] = [];
        for (var r = 0; r < ROWS; r++) {
            var back = el("cellback");
            back.style.left = (c*BOARD.pitchX) + "rem";
            back.style.top = ((ROWS - 1 - r)*BOARD.pitchY) + "rem";
            boardEl.appendChild(back);
            var t = makeTile("");
            t.back = back; t.visible = true; t.shown = { letter: "", value: 0 }; t.grade = null;
            t.el.style.left = (c*BOARD.pitchX) + "rem";
            t.el.style.top = ((ROWS - 1 - r)*BOARD.pitchY) + "rem";
            (function(cc, rr) { t.el.addEventListener("click", function() { onTileClick(cc, rr); }); })(c, r);
            boardEl.appendChild(t.el);
            tiles[c][r] = t;
        }
    }
}

function syncTile(c, r) {
    var tile = tileAt(c, r);
    var v = tiles[c][r];
    var isBonus = tile.powerup != "";
    var isObstacle = tile.crate > 0 || tile.snow || tile.parcel;
    var occupied = WordBoard.IsTileOccupied(tile) || WordBoard.IsTileStatic(tile);
    v.visible = !tile.hole && occupied;
    v.back.style.display = tile.hole ? "none" : "";
    var cls = "tile";
    if (!v.visible) cls += " hidden";
    if (tile.doubled) cls += " yellow";
    else if (tile.variant == 2) cls += " orange";
    else if (tile.variant == 1) cls += " peach";
    if (tile.ice > 0) cls += " ice";
    if (tile.stone > 0) cls += " stone";
    if (tile.joker) cls += " joker";
    if (isBonus) cls += " bonus " + tile.powerup;
    if (tile.crate > 0) cls += " crate" + (tile.crate == 1 ? " cracked" : "");
    if (tile.chained) cls += " chained";
    if (tile.snow) cls += " snow";
    if (tile.parcel) cls += " parcel";
    v.el.className = cls;
    v.letter.textContent = isBonus ? BONUS_ICON[tile.powerup] : isObstacle ? "" : tile.joker ? "?" : tile.letter;
    v.points.textContent = (isBonus || isObstacle || tile.joker) ? "" : ("" + tile.value*(tile.doubled ? 2 : 1));
    if (tile.crate > 1) {
        if (!v.grade) { v.grade = el("grade"); v.el.appendChild(v.grade); }
        v.grade.textContent = tile.crate;
    } else if (v.grade) { v.grade.remove(); v.grade = null; }
    v.shown = { letter: (isBonus || isObstacle) ? "" : tile.letter, value: tile.value*(tile.doubled ? 2 : 1) };
}

function syncBoard() {
    var before = bonusCells();
    for (var c = 0; c < COLS; c++) for (var r = 0; r < ROWS; r++) syncTile(c, r);
    var after = bonusCells();
    var countBefore = {}, countAfter = {};
    before.forEach(function(b) { countBefore[b.kind] = (countBefore[b.kind] || 0) + 1; });
    after.forEach(function(b) { countAfter[b.kind] = (countAfter[b.kind] || 0) + 1; });
    after.forEach(function(b) {
        if ((countAfter[b.kind] || 0) > (countBefore[b.kind] || 0) && !before.some(function(x) { return same(x, b) && x.kind == b.kind; }))
            Vfx.bonusSpawn(cellX(b.c), cellY(b.r));
    });
    bonus.cells = after;
}

function bonusCells() {
    var cells = [];
    for (var c = 0; c < COLS; c++) for (var r = 0; r < ROWS; r++) { var k = tileAt(c, r).powerup; if (k) cells.push({ c: c, r: r, kind: k }); }
    return cells;
}

function syncSelection() {
    var sel = selection();
    for (var c = 0; c < COLS; c++) for (var r = 0; r < ROWS; r++) {
        var hidden = !tiles[c][r].visible || inList(sel, { c: c, r: r }) || (collapsing && motion.IsHidden({ c: c, r: r }));
        tiles[c][r].el.classList.toggle("hidden", hidden);
    }
}

function setTileTransform(c, r, offsetCells, scale) {
    var e = tiles[c][r].el;
    e.style.transform = "translate(" + shake.x + "rem," + (shake.y - offsetCells*BOARD.pitchY) + "rem)" + (scale && scale != 1 ? " scale(" + scale + ")" : "");
}

function applyCollapseView() {
    for (var c = 0; c < COLS; c++) for (var r = 0; r < ROWS; r++) setTileTransform(c, r, motion.GetOffset({ c: c, r: r }));
    syncSelection();
}

function beginCollapse() {
    motion.Configure(COLS, ROWS, FALL.speed, FALL.cascade, FALL.gap);
    motion.StartCollapse(lastMove.moved, lastMove.spawned);
    collapsing = true;
    applyCollapseView();
}

function hideTile(c, r) { tiles[c][r].el.classList.add("hidden"); }

function setBonusCharge(c, r, k) {
    bonus.charge = k > 0 ? { c: c, r: r } : null;
    var offset = collapsing ? motion.GetOffset({ c: c, r: r }) : 0;
    setTileTransform(c, r, offset, 1 + 0.35*k);
    tiles[c][r].el.style.setProperty("--glow-a", Math.min(1, 0.3 + k));
}

function startShake(strength, duration) { shake.strength = strength; shake.duration = duration; shake.time = duration; }

function updateShake(dt) {
    if (shake.time <= 0) return;
    shake.time -= dt;
    var k = Math.max(0, shake.time/shake.duration);
    var amp = shake.strength*k*k, phase = (shake.duration - shake.time)*46;
    shake.x = k > 0 ? Math.sin(phase)*amp : 0;
    shake.y = k > 0 ? Math.cos(phase*0.8)*amp*0.5 : 0;
    if (!collapsing) for (var c = 0; c < COLS; c++) for (var r = 0; r < ROWS; r++) setTileTransform(c, r, 0);
}

function updateBonusIdle(dt) {
    bonus.time += dt;
    var cells = bonus.cells || [];
    if (cells.length == 0) return;
    var pulse = 0.5 + 0.5*Math.sin(bonus.time*3.2);
    for (var i = 0; i < cells.length; i++) {
        var b = cells[i];
        if (bonus.charge && same(bonus.charge, b)) continue;
        if (tiles[b.c][b.r].el.classList.contains("hidden")) continue;
        setTileTransform(b.c, b.r, collapsing ? motion.GetOffset(b) : 0, 1 + 0.07*pulse);
        tiles[b.c][b.r].el.style.setProperty("--glow-a", 0.3 + 0.55*pulse);
    }
    bonus.sparkle -= dt;
    if (bonus.sparkle <= 0) {
        bonus.sparkle = 0.7;
        var s = cells[Math.floor(Math.random()*cells.length)];
        if (!tiles[s.c][s.r].el.classList.contains("hidden")) Vfx.bonusSparkle(cellX(s.c), cellY(s.r));
    }
}

// ---- tasks ----------------------------------------------------------------------------------------

var OTHER_SYMBOL = { length: function(t) { return "" + t.length; }, letter: function(t) { return t.letter; }, wordScore: function() { return "+"; },
                     powerup: function() { return "*"; }, anyWords: function() { return "A"; }, deliver: function() { return "@"; },
                     melt: function() { return "~"; }, crates: function() { return "#"; }, clearIce: function() { return "~"; } };

function syncTasks() {
    var tasks = level.GetTasks();
    var current = level.GetBoard().GetCurrentWord();
    wordsEl.innerHTML = "";
    othersEl.innerHTML = "";
    var allDone = tasks.length > 0;
    tasks.forEach(function(task) {
        var cfg = task.config;
        allDone = allDone && task.done;
        if (cfg.taskType == "Word") {
            var row = el("word");
            var prefix = current.length > 0 && cfg.word.indexOf(current) == 0;
            for (var i = 0; i < cfg.word.length; i++) {
                var state = task.done ? "found" : (prefix && i < current.length) ? "active" : "";
                var t = makeTile("small " + state);
                t.letter.textContent = cfg.word[i];
                t.points.textContent = letterValue(cfg.word[i]);
                row.appendChild(t.el);
            }
            wordsEl.appendChild(row);
        } else {
            var type = cfg.taskType.charAt(0).toLowerCase() + cfg.taskType.slice(1);
            var item = el("other");
            var sym = makeTile("small");
            sym.letter.textContent = (OTHER_SYMBOL[type] || function() { return "?"; })(cfg);
            var text = type == "wordScore" ? cfg.scoreThreshold + "+" : (type == "crates" || type == "clearIce") ? (task.done ? "1/1" : "0/1") : task.progress + "/" + cfg.count;
            var count = el("count" + (task.done ? " done" : ""), text);
            item.appendChild(sym.el); item.appendChild(count);
            othersEl.appendChild(item);
        }
    });
    $("taskcheck").style.opacity = allDone ? "1" : ".55";
}

// ---- HUD ------------------------------------------------------------------------------------------

function barFill(score) {
    var p = clamp(score/level.GetTargetScore(), 0, 1);
    return p <= 0 ? 0 : BAR.minFill + (1 - BAR.minFill)*p;
}
function barTip(score) {
    var s = score === undefined ? displayScore : score;
    var x = BAR.x0 + (BAR.x1 - BAR.x0)*barFill(s) - BAR.inset;
    return { x: clamp(x, BAR.x0 + BAR.inset, BAR.x1 - BAR.inset), y: BAR.y };
}
function syncHud() {
    $("moves").textContent = level.GetMovesLeft();
    $("score").textContent = "Progress: " + displayScore + " / " + level.GetTargetScore();
    $("bar").style.setProperty("--fill", (barFill(displayScore)*100) + "%");
    $("level").textContent = "Уровень " + (levelIndex + 1) + " / " + campaign.length;
}
function animateScoreTo(score) { scoreTween = { from: displayScore, to: score, t: 0 }; }
function snapScore() { scoreTween = null; displayScore = level.GetScore(); syncHud(); }
function updateScore(dt) {
    if (!scoreTween) return;
    scoreTween.t += dt/0.12;
    var k = Math.min(scoreTween.t, 1);
    k = 1 - (1 - k)*(1 - k)*(1 - k);
    displayScore = Math.round(scoreTween.from + (scoreTween.to - scoreTween.from)*k);
    if (scoreTween.t >= 1) { displayScore = scoreTween.to; scoreTween = null; }
    syncHud();
}

// ---- boosters -------------------------------------------------------------------------------------

var boosterEls = Array.prototype.slice.call(document.querySelectorAll(".booster"));
function syncBoosters() {
    boosterEls.forEach(function(b, i) {
        var charges = level.GetBoosterCharges(i);
        b.querySelector(".charge").textContent = charges;
        b.classList.toggle("empty", charges <= 0);
        b.classList.toggle("armed", aimMode == MODES[i]);
    });
    $("mode").innerHTML = aimMode ? "<span>" + MODE_TEXT[aimMode] + "</span>" : "";
}
function cancelAim() { aimMode = null; syncBoosters(); }
function onBooster(i) {
    if (level.GetState() != "playing" || intro.active) return;
    var mode = MODES[i];
    if (aimMode == mode) { cancelAim(); return; }
    if (level.GetBoosterCharges(i) <= 0) return;
    if (mode == "shuffle") {
        if (level.UseShuffle(dictionary)) { syncBoard(); syncSelection(); popTiles(); }
    } else if (mode == "hint") {
        if (level.UseHint(dictionary)) {
            var cells = selection().slice();
            level.GetBoard().ClearSelection();
            syncSelection(); syncTray(); syncTasks();
            hintQueue = cells; hintTimer = 0;
        }
    } else { aimMode = mode; }
    syncBoosters();
}
function popTiles() {
    for (var c = 0; c < COLS; c++) for (var r = 0; r < ROWS; r++) (function(c, r) {
        Fx.add(Math.random()*0.15, 0.3, function(k) { setTileTransform(c, r, 0, 0.3 + 0.7*k + 0.15*Math.sin(Math.PI*k)); }, function() { setTileTransform(c, r, 0, 1); });
    })(c, r);
}

// ---- board input and the tray ---------------------------------------------------------------------

function onTileClick(c, r) {
    if (level.GetState() != "playing" || intro.active || pendingCollapse) return;
    if (aimMode) {
        var mode = aimMode;
        cancelAim();
        if (mode == "hammer") {
            var result = level.UseHammer({ c: c, r: r }, dictionary);
            if (result.ok) { lastMove = result; syncBoard(); syncSelection(); playMoveResult(result); afterMutation(); }
        } else if (mode == "joker") { if (level.UseJoker({ c: c, r: r })) { syncTile(c, r); syncTray(); } }
        else if (mode == "doubler") { if (level.UseDoubler({ c: c, r: r })) { syncTile(c, r); syncTray(); } }
        syncBoosters();
        return;
    }
    var action = level.GetBoard().ToggleSelect({ c: c, r: r });
    if (action == "added") startFlight(c, r, selection().length - 1);
    else if (action == "iced" || action == "blocked") { var e = tiles[c][r].el; e.classList.remove("shake"); void e.offsetWidth; e.classList.add("shake"); }
    syncSelection(); syncTray(); syncTasks();
}

function slotX(index, count) {
    var step = TRAY.step;
    if (count > 1) step = Math.min(step, (TRAY.inner - TRAY.slot)/(count - 1));
    var total = step*(count - 1) + TRAY.slot;
    return TRAY.width/2 - total/2 + TRAY.slot/2 + index*step;   // centre, relative to the field
}

function startFlight(c, r, index) {
    var tile = tileAt(c, r);
    var f = makeTile("");
    f.letter.textContent = tile.joker ? "?" : tile.letter;
    f.points.textContent = tile.joker ? "" : tile.value*(tile.doubled ? 2 : 1);
    if (tile.doubled) f.el.classList.add("yellow"); else if (tile.variant == 2) f.el.classList.add("orange"); else if (tile.variant == 1) f.el.classList.add("peach");
    fxLayer.appendChild(f.el);
    var from = { x: cellX(c), y: cellY(r) };
    setPos(f.el, from.x, from.y, BOARD.tile);
    flights.push({ el: f.el, slot: index, t: 0, from: from });
}

function updateFlights(dt) {
    if (flights.length == 0) return;
    var count = selection().length, alive = [];
    for (var i = 0; i < flights.length; i++) {
        var f = flights[i];
        f.t += dt/0.38;
        if (f.slot >= count) { f.el.remove(); continue; }
        var to = { x: TRAY.left + slotX(f.slot, count), y: TRAY.cy };
        var e = smooth(Math.min(f.t, 1)), inv = 1 - e;
        var cx = (f.from.x + to.x)/2 + (to.x - f.from.x)*0.18, cy = Math.min(f.from.y, to.y) - 55;
        var x = inv*inv*f.from.x + 2*inv*e*cx + e*e*to.x, y = inv*inv*f.from.y + 2*inv*e*cy + e*e*to.y;
        var size = BOARD.tile + (TRAY.slot - BOARD.tile)*e + 5*Math.sin(Math.PI*e);
        setPos(f.el, x, y, size);
        if (f.t >= 1) f.el.remove(); else alive.push(f);
    }
    var landed = alive.length != flights.length;
    flights = alive;
    if (landed) syncTray();
}

function cancelFlights() { flights.forEach(function(f) { f.el.remove(); }); flights = []; }

function syncTray() {
    var sel = selection(), count = sel.length;
    var valid = dictionary.Contains(level.GetBoard().GetCurrentWord());
    while (slots.length < count) {
        var s = makeTile("small");
        s.x = 0; s.targetX = 0; s.placed = false;
        (function(index) { s.el.addEventListener("click", function() { onSlotClick(index); }); })(slots.length);
        trayEl.appendChild(s.el);
        slots.push(s);
    }
    for (var i = 0; i < slots.length; i++) {
        var slot = slots[i];
        if (i >= count) { slot.el.style.display = "none"; slot.placed = false; continue; }
        var tile = tileAt(sel[i].c, sel[i].r);
        slot.letter.textContent = tile.joker ? "?" : tile.letter;
        slot.points.textContent = tile.joker ? "" : tile.value*(tile.doubled ? 2 : 1);
        slot.el.className = "tile small" + (flashTimer > 0 ? " bad" : valid ? " valid" : "") + (tile.doubled ? " yellow" : tile.joker ? " joker" : "");
        slot.targetX = slotX(i, count) - TRAY.slot/2;
        if (!slot.placed) { slot.placed = true; slot.x = slot.targetX; slot.el.style.left = slot.x + "rem"; }
        var flying = flights.some(function(f) { return f.slot == i; });
        slot.el.style.display = flying ? "none" : "";
    }
}

function updateTray(dt) {
    for (var i = 0; i < slots.length; i++) {
        var slot = slots[i];
        if (!slot.placed || Math.abs(slot.targetX - slot.x) < 0.3) continue;
        slot.x += (slot.targetX - slot.x)*Math.min(1, 14*dt);
        slot.el.style.left = slot.x + "rem";
    }
}

function onSlotClick(index) {
    if (intro.active || pendingCollapse) return;
    var sel = selection();
    if (index >= sel.length) return;
    level.GetBoard().ToggleSelect(sel[index]);
    syncSelection(); syncTray(); syncTasks();
}

function showMessage(text) {
    var m = $("message");
    m.textContent = text;
    m.classList.add("shown");
    messageTimer = 1.6;
}

function onClear() {
    if (intro.active) return;
    level.GetBoard().ClearSelection();
    cancelFlights(); cancelAim();
    syncSelection(); syncTray(); syncTasks();
}

// ---- the move: accept, fly letters to the bar, powerups, collapse -----------------------------------

function onAccept() {
    if (level.GetState() != "playing" || intro.active || pendingCollapse) return;
    finishFx();
    var sel = selection(), count = sel.length;
    var slotInfo = [];
    for (var i = 0; i < count; i++) {
        var tile = tileAt(sel[i].c, sel[i].r);
        slotInfo.push({ letter: tile.joker ? "?" : tile.letter, value: tile.joker ? 0 : tile.value*(tile.doubled ? 2 : 1), x: TRAY.left + slotX(i, count), y: TRAY.cy });
    }
    var result = level.AcceptWord(dictionary);
    if (!result.ok) {
        if (result.reason == "invalid" || result.reason == "duplicate") flashTimer = 0.7;
        showMessage(result.reason == "duplicate" ? "Это слово уже было на уровне" : result.reason == "invalid" ? "Такого слова нет в словаре" : "");
        syncTray();
        return;
    }
    lastMove = result;
    cancelFlights();
    slots.forEach(function(s) { s.el.style.display = "none"; s.placed = false; });
    pendingCollapse = result;
    syncTasks(); syncBoosters();
    $("moves").textContent = level.GetMovesLeft();
    playAccept(slotInfo, result);
}

function playAccept(slotInfo, result) {
    Fx.busy = true;
    acceptSeq = { base: displayScore, final: level.GetScore(), wordShare: 0, bonusShare: 0, lastArrive: 0 };
    var count = slotInfo.length, wordScore = result.wordScore || 0;
    slotInfo.forEach(function(slot, idx) {
        var share = Math.round(wordScore*(idx + 1)/count);
        flyLetter(slot.letter, slot.value, slot.x, slot.y, idx*FX.stagger, true, function() { acceptSeq.wordShare = Math.max(acceptSeq.wordShare, share); pushScore(); });
    });
    var bonusEnd = playPowerupFx(result);
    var collapseAt = bonusEnd > 0 ? bonusEnd + FX.bonusPause : FX.collapseDelay;
    Fx.add(collapseAt, 0.01, null, applyPendingCollapse);
    var finishAt = Math.max(acceptSeq.lastArrive, collapseAt);
    Fx.add(finishAt, 0.01, null, function() {
        var tip = barTip();
        Vfx.scoreHit(tip.x, tip.y);
        flash(tip.x, tip.y, 30, 120, 0, 0.3);
        animateScoreTo(acceptSeq.final);
    });
    var gain = el("gain", "+" + result.gain);
    fxLayer.appendChild(gain);
    gain.style.display = "none";
    Fx.add(finishAt, 0.7, function(k) {
        var tip = barTip();
        gain.style.display = "";
        gain.style.left = (tip.x - 20) + "rem";
        gain.style.top = (tip.y - 52 + 22*k - 13) + "rem";
        gain.style.opacity = k < 0.6 ? 1 : 1 - (k - 0.6)/0.4;
    }, function() { gain.remove(); Fx.busy = false; });
}

function pushScore() {
    var score = Math.min(acceptSeq.final, acceptSeq.base + acceptSeq.wordShare + acceptSeq.bonusShare);
    if (score > displayScore) animateScoreTo(score);
}

function flyLetter(letter, value, fromX, fromY, start, fromWord, onArrive) {
    var f = makeTile("small");
    f.letter.textContent = letter;
    f.points.textContent = value > 0 ? value : "";
    f.el.style.display = "none";
    f.el.style.color = fromWord ? "rgb(56,142,60)" : "rgb(224,140,40)";
    fxLayer.appendChild(f.el);
    var aim = barTip(acceptSeq.final);
    var dx = aim.x - fromX, dy = aim.y - fromY;
    var flight = clamp(Math.sqrt(dx*dx + dy*dy)/FX.letterSpeed, FX.letterMin, FX.letterMax);
    var side = (Math.random() - 0.5)*90;
    Fx.add(start, flight, function(k) {
        var tip = barTip();
        var to = { x: tip.x, y: tip.y };
        var inv = 1 - k;
        var cx = (fromX + to.x)/2 + side, cy = Math.min(fromY, to.y) - 40;
        var x = inv*inv*fromX + 2*inv*k*cx + k*k*to.x, y = inv*inv*fromY + 2*inv*k*cy + k*k*to.y;
        f.el.style.display = "";
        setPos(f.el, x, y, TRAY.slot*(1 - 0.35*k));
        var c = k*2 > 1 ? 1 : k*2;
        f.el.style.color = fromWord ? "rgb(" + Math.round(56 + 18*c) + "," + Math.round(142 - 94*c) + "," + Math.round(60 - 26*c) + ")"
                                    : "rgb(" + Math.round(224 - 150*c) + "," + Math.round(140 - 92*c) + "," + Math.round(40 - 6*c) + ")";
    }, function() {
        var tip = barTip();
        flash(tip.x, tip.y, 18, 64, 0, 0.22);
        f.el.remove();
        if (onArrive) onArrive();
    });
    acceptSeq.lastArrive = Math.max(acceptSeq.lastArrive, start + flight);
    return flight;
}

function flyFromCells(cells, at) {
    cells.forEach(function(cell, idx) {
        var info = tiles[cell.c][cell.r].shown;
        if (!info.letter) return;
        flyLetter(info.letter, info.value, cellX(cell.c), cellY(cell.r), at + idx*0.05, false, function() { acceptSeq.bonusShare += info.value; pushScore(); });
    });
}

function flash(x, y, fromSize, toSize, delay, dur) {
    var e = el("flash");
    fxLayer.appendChild(e);
    Fx.add(delay, dur, function(k) {
        var size = fromSize + (toSize - fromSize)*k;
        e.style.left = (x - size/2) + "rem"; e.style.top = (y - size/2) + "rem";
        e.style.width = size + "rem"; e.style.height = size + "rem";
        e.style.opacity = 1 - k;
    }, function() { e.remove(); });
}

function playPowerupFx(result) {
    var used = result.powerupsUsed || [];
    if (used.length == 0) return 0;
    var time = 0;
    used.forEach(function(pu) {
        var pos = { x: cellX(pu.c), y: cellY(pu.r) };
        time += FX.bonusPause;
        if (pu.kind == "bomb") {
            (function(at) {
                Fx.add(at, FX.bombCharge, function(k) { setBonusCharge(pu.c, pu.r, k*k); });
                var area = (result.destroyed || []).filter(function(d) { return Math.abs(d.c - pu.c) <= 1 && Math.abs(d.r - pu.r) <= 1 && !(d.c == pu.c && d.r == pu.r); });
                flyFromCells(area, at + FX.bombCharge);
                Fx.add(at + FX.bombCharge, 0.01, null, function() {
                    setBonusCharge(pu.c, pu.r, 0);
                    hideTile(pu.c, pu.r);
                    area.forEach(function(d) { hideTile(d.c, d.r); });
                    flash(pos.x, pos.y, 30, 130, 0, 0.45);
                    startShake(FX.bombShake, 0.42);
                    Vfx.bombBlast(pos.x, pos.y);
                });
            })(time);
            time += FX.bombCharge + 0.25;
        } else {
            (function(at) {
                Fx.add(at, FX.rocketCharge, function(k) { setBonusCharge(pu.c, pu.r, k*k); });
                if (pu.kind == "fireworks") Fx.add(at + FX.rocketCharge, 0.01, null, function() {
                    setBonusCharge(pu.c, pu.r, 0); hideTile(pu.c, pu.r);
                    flash(pos.x, pos.y, 15, 65, 0, 0.3); startShake(3, 0.28); Vfx.fireworkBurst(pos.x, pos.y);
                });
            })(time);
            time += FX.rocketCharge + (pu.kind == "fireworks" ? 0.12 : 0);
            var lastArrive = time;
            (pu.targets || []).forEach(function(target, t) {
                var to = { x: cellX(target.c), y: cellY(target.r) };
                var launchAt = time + t*FX.rocketStagger;
                var plan = rocketPlan(pos, to);
                launchRocket(pu, target, pos, to, launchAt, plan);
                lastArrive = Math.max(lastArrive, launchAt + plan.duration);
                if (inList(result.destroyed || [], target)) flyFromCells([target], launchAt + plan.duration);
            });
            time = lastArrive + 0.1;
        }
    });
    return time;
}

function rocketPlan(from, to) {
    var dx = to.x - from.x, dy = to.y - from.y, dist = Math.sqrt(dx*dx + dy*dy);
    var detour = dist < 160 ? FX.rocketDetour*(1 - dist/160) : 0;
    var duration = clamp((dist + detour)/FX.rocketSpeed, FX.rocketMin, FX.rocketMax);
    var nx = dist > 1 ? dx/dist : 1, ny = dist > 1 ? dy/dist : 0;
    var ctrl = detour > 0 ? { x: from.x + nx*(dist + detour*0.8) - ny*detour*0.75, y: from.y + ny*(dist + detour*0.8) + nx*detour*0.75 }
                          : { x: (from.x + to.x)/2 - ny*40, y: (from.y + to.y)/2 + nx*40 };
    return { duration: duration, ctrl: ctrl };
}

function launchRocket(pu, target, from, to, delay, plan) {
    var r = el("rocket", "<i></i>");
    r.style.display = "none";
    fxLayer.appendChild(r);
    var last = { x: from.x, y: from.y };
    Fx.add(delay, 0.01, null, function() {
        setBonusCharge(pu.c, pu.r, 0); hideTile(pu.c, pu.r);
        Vfx.rocketLaunch(from.x, from.y);
    });
    Fx.add(delay, plan.duration, function(k) {
        var inv = 1 - k;
        var x = inv*inv*from.x + 2*inv*k*plan.ctrl.x + k*k*to.x, y = inv*inv*from.y + 2*inv*k*plan.ctrl.y + k*k*to.y;
        var angle = Math.atan2(y - last.y, x - last.x)*180/Math.PI;
        if (Math.abs(x - last.x) + Math.abs(y - last.y) > 0.5) { r.style.transform = "rotate(" + angle + "deg)"; last = { x: x, y: y }; }
        r.style.display = ""; r.style.left = x + "rem"; r.style.top = y + "rem";
        Vfx.rocketTrail(x, y);
    }, function() {
        r.remove();
        hideTile(target.c, target.r);
        flash(to.x, to.y, 8, 35, 0, 0.22);
        startShake(1.5, 0.2);
        Vfx.rocketImpact(to.x, to.y);
    });
}

function playObstacleFx(result) {
    var play = function(cells, fn) { (cells || []).forEach(function(c) { fn(cellX(c.c), cellY(c.r)); }); };
    play(result.crateHit, function(x, y) { Vfx.crateHit(x, y); });
    play(result.crateBroken, function(x, y) { Vfx.crateBreak(x, y); });
    play(result.snowMelted, function(x, y) { Vfx.snowMelt(x, y); });
    play(result.delivered, function(x, y) { Vfx.delivered(x, y); });
}

function playMoveResult(result) {
    beginCollapse();
    (result.burned || []).forEach(function(c) { Vfx.burn(cellX(c.c), cellY(c.r)); });
    playObstacleFx(result);
}

function applyPendingCollapse() {
    if (!pendingCollapse) return;
    var collapse = pendingCollapse;
    pendingCollapse = null;
    (collapse.activated || []).concat(collapse.iceBroken || []).forEach(function(c) { Vfx.burn(cellX(c.c), cellY(c.r)); });
    playObstacleFx(collapse);
    syncBoard();
    beginCollapse();
    (collapse.repaired || []).forEach(function(c) { Vfx.bonusSpawn(cellX(c.c), cellY(c.r)); });
}

function finishFx() {
    if (!Fx.isBusy()) return;
    Fx.clear();
    applyPendingCollapse();
    fxLayer.innerHTML = "";
    snapScore();
    bonus.charge = null;
}

function afterMutation() { syncTasks(); syncBoosters(); syncHud(); }

// ---- level start and the intro flight -------------------------------------------------------------

function startLevel(index) {
    levelIndex = clamp(index, 0, campaign.length - 1);
    finishFx();
    collapsing = false; pendingCollapse = null; hintQueue = []; cancelAim(); cancelFlights();
    motion.Finish();
    level.Start(campaign[levelIndex], boardConfig, dictionary, SEED);
    lastMove = new WordMoveResult();
    displayScore = 0; scoreTween = null;
    slots.forEach(function(s) { s.el.remove(); }); slots = [];
    syncBoard(); syncSelection(); syncTray(); syncTasks(); syncBoosters(); syncHud();
    for (var c = 0; c < COLS; c++) for (var r = 0; r < ROWS; r++) setTileTransform(c, r, 0);
    playIntro();
}

// the letters fly out of a bag below the screen onto their cells, bottom row first
function playIntro() {
    introLayer.innerHTML = "";
    intro.active = true;
    var order = [];
    for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) if (tiles[c][r].visible) order.push({ c: c, r: r });
    order.forEach(function(cell, i) {
        var v = tiles[cell.c][cell.r];
        v.el.classList.add("hidden");
        var clone = v.el.cloneNode(true);
        clone.className = v.el.className.replace("hidden", "");
        clone.style.left = "0"; clone.style.top = "0";
        introLayer.appendChild(clone);
        var to = { x: cellX(cell.c), y: cellY(cell.r) };
        var from = { x: 235 + (Math.random() - 0.5)*120, y: 1080 };
        var ctrl = { x: from.x + (to.x - from.x)*0.3 + (Math.random() - 0.5)*160, y: Math.min(from.y, to.y) - 180 };
        var spin = (Math.random() - 0.5)*80;
        Fx.add(i*0.022, 0.55, function(k) {
            var e = 1 - Math.pow(1 - k, 3), inv = 1 - e;
            var x = inv*inv*from.x + 2*inv*e*ctrl.x + e*e*to.x, y = inv*inv*from.y + 2*inv*e*ctrl.y + e*e*to.y;
            setPos(clone, x, y, BOARD.tile, 0.4 + 0.6*e + 0.12*Math.sin(Math.PI*e), spin*(1 - e));
        }, function() {
            clone.remove();
            v.el.classList.remove("hidden");
            Vfx.burst(to.x, to.y + 20, { count: 4, speed: 40, life: 0.3, size: 3, colors: ["#fff3c4", "#ffffff"], gravity: 100 });
        });
    });
    Fx.add(order.length*0.022 + 0.6, 0.01, null, function() { intro.active = false; syncSelection(); });
}

// ---- popup ----------------------------------------------------------------------------------------

function starsFor(score, target) { return score < target ? 0 : score >= target*1.6 ? 3 : score >= target*1.25 ? 2 : 1; }

function showPopup(won) {
    var score = level.GetScore(), target = level.GetTargetScore(), tasks = level.GetTasks();
    var best = progress.GetBestScore(levelIndex), last = levelIndex >= campaign.length - 1;
    var done = tasks.filter(function(t) { return t.done; }).length;
    var bonusScore = Math.max(0, score - target);
    popupShown = true; popupIdle = 0;
    $("title").textContent = won ? (last ? "ФИНАЛ!" : "ПОБЕДА!") : "НЕ ВЫШЛО";
    $("poptasks").innerHTML = "Задачи " + done + "/" + tasks.length + (done == tasks.length ? " <span style='color:#8fe08a'>✓</span>" : "");
    $("popsub").textContent = won ? (best > 0 && score > best ? "Новый рекорд! Было " + best : best > 0 ? "Рекорд: " + best : "")
                                  : (done < tasks.length ? "Задачи не закрыты" : score < target ? "Не хватило " + (target - score) + " очков" : "Не хватило ходов");
    $("popbtn").textContent = won ? (last ? "СНАЧАЛА" : "ДАЛЬШЕ") : "ЕЩЁ РАЗ";
    $("popscore").textContent = "0";
    var badge = $("badge"); badge.textContent = "+" + bonusScore; badge.classList.remove("shown");
    var stars = document.querySelectorAll("#popup .stars i");
    stars.forEach(function(s) { s.className = ""; });
    var card = $("card"); card.className = "card " + (won ? "pop" : "pop wobble");
    $("popup").classList.add("shown");
    document.querySelectorAll("#popup .confetti").forEach(function(c) { c.remove(); });
    confetti = [];
    Fx.add(0.3, 0.01, null, function() { stars.forEach(function(s, i) { setTimeout(function() { s.classList.add("slot"); }, i*60); }); });
    Fx.add(0.5, 0.9, function(k) { var e = 1 - (1 - k)*(1 - k); $("popscore").textContent = Math.round(score*e); }, function() { $("popscore").textContent = score; if (bonusScore > 0) badge.classList.add("shown"); });
    var earned = won ? starsFor(score, target) : 0;
    popupStars = earned;
    for (var i = 0; i < earned; i++) (function(i) {
        Fx.add(0.85 + i*0.32, 0.01, null, function() { stars[i].classList.add("lit"); Vfx.delivered(235 - 66 + i*66, 513 - 150 + 44 + 26); });
    })(i);
    if (won) {
        Fx.add(0.9, 0.01, null, function() { Vfx.win(); });
        var letters = [];
        tasks.forEach(function(t) { if (t.config.taskType == "Word" && t.config.word) letters = t.config.word.split(""); });
        var spare = ["П", "О", "Б", "Е", "Д", "А"];
        var places = [[-130, -140], [130, -150], [-150, 0], [155, -10], [-140, 150], [150, 160]];
        for (var i = 0; i < 6; i++) (function(i) {
            var t = makeTile("small confetti");
            t.letter.textContent = letters.length > i ? letters[i] : spare[i];
            t.points.textContent = 1 + (i*3) % 5;
            $("popup").appendChild(t.el);
            var item = { el: t.el, x: 235 + places[i][0], y: 513 + places[i][1], tilt: [-18, 14, 20, -16, 12, -22][i], radius: 5 + (i % 3)*2, rise: 6 + (i % 2)*3, period: 3.4 + i*0.35, phase: i*0.6 };
            confetti.push(item);
            var from = { x: item.x + (places[i][0] >= 0 ? 90 : -90), y: item.y + 40 };
            t.el.style.opacity = 0;
            Fx.add(0.3 + i*0.09, 0.55, function(k) {
                var e = 1 - Math.pow(1 - k, 3);
                setPos(t.el, from.x + (item.x - from.x)*e, from.y + (item.y - from.y)*e, 44, 1, item.tilt - 28*(1 - e));
                t.el.style.opacity = Math.min(1, k*2.2);
            });
        })(i);
    }
}

function updatePopupIdle(dt) {
    popupIdle += dt;
    confetti.forEach(function(tile) {
        if (parseFloat(tile.el.style.opacity) < 1) return;
        var phase = ((popupIdle + tile.phase) % tile.period)/tile.period;
        var swing = Math.sin(phase*Math.PI*2), ease = 0.5 - 0.5*Math.cos(phase*Math.PI*2);
        setPos(tile.el, tile.x + swing*tile.radius, tile.y + (ease - 0.5)*2*tile.rise, 44, 1, tile.tilt + swing*6);
    });
}

function hidePopup() { popupShown = false; $("popup").classList.remove("shown"); confetti.forEach(function(c) { c.el.remove(); }); confetti = []; }

function onPopupButton() {
    finishFx();
    if (level.GetState() == "won") {
        progress.CompleteLevel(levelIndex, level.GetScore(), campaign.length);
        progress.Save();
        hidePopup();
        startLevel(progress.currentLevel);
    } else { hidePopup(); startLevel(levelIndex); }
    popupState = "playing";
}

// ---- demo autopilot (?auto=1): plays the level by hints, shows boosters and bonuses ------------------

var Demo = {
    timer: 1.5, move: 0, phase: "play",
    idle: function() { return !Fx.isBusy() && !collapsing && !intro.active && !pendingCollapse && flights.length == 0 && hintQueue.length == 0; },
    update: function(dt) {
        if (!AUTO) return;
        this.timer -= dt;
        if (this.timer > 0) return;
        if (popupShown) { if (popupIdle < 3.5) { this.timer = 0.3; return; } this.timer = 1.0; onPopupButton(); this.move = 0; return; }
        if (!this.idle() || level.GetState() != "playing") { this.timer = 0.3; return; }
        var sel = selection();
        if (sel.length > 0) { this.timer = 1.2; onAccept(); this.move++; return; }
        // a booster between words: hammer on an obstacle, a joker, a doubler, a shuffle
        var board = level.GetBoard();
        var self = this;
        if (this.move == 1 && level.GetBoosterCharges(0) > 0) {
            var ob = this.findObstacle();
            aimMode = "hammer"; syncBoosters();
            setTimeout(function() { onTileClick(ob.c, ob.r); }, 700);
            this.move = 2; this.timer = 2.2; return;
        }
        if (this.move == 3 && level.GetBoosterCharges(4) > 0) {
            var u = this.findUsable();
            aimMode = "doubler"; syncBoosters();
            setTimeout(function() { onTileClick(u.c, u.r); }, 700);
            this.move = 4; this.timer = 1.6; return;
        }
        if (this.move == 5 && level.GetBoosterCharges(1) > 0) { onBooster(1); this.move = 6; this.timer = 1.4; return; }
        if (this.move == 9) { level.DebugCompleteTasks(); level.DebugAddScore(Math.max(0, level.GetTargetScore() + 40 - level.GetScore())); afterMutation(); this.move = 10; this.timer = 0.5; return; }
        if (!level.UseHint(dictionary)) { if (!level.UseShuffle(dictionary)) { startLevel(levelIndex); } else { syncBoard(); popTiles(); } this.timer = 1.0; return; }
        var cells = selection().slice();
        board.ClearSelection();
        // a bonus next to the first letter: the word activates it on accept
        var kinds = { 2: "bomb", 4: "rocket", 7: "fireworks" };
        if (kinds[this.move]) {
            var spot = this.findNeighbour(cells);
            if (spot) { board.DebugSetPowerup(spot, kinds[this.move]); syncBoard(); }
        }
        syncSelection(); syncTray(); syncTasks(); syncBoosters();
        hintQueue = cells; hintTimer = 0.2;
        this.timer = 0.14*cells.length + 1.1;
    },
    findObstacle: function() {
        for (var c = 0; c < COLS; c++) for (var r = 0; r < ROWS; r++) { var t = tileAt(c, r); if (t.crate > 0 || t.ice > 0 || t.stone > 0 || t.snow) return { c: c, r: r }; }
        return this.findUsable();
    },
    findUsable: function() {
        for (var c = 0; c < COLS; c++) for (var r = 0; r < ROWS; r++) if (WordBoard.IsTileUsable(tileAt(c, r))) return { c: c, r: r };
        return { c: 0, r: 0 };
    },
    findNeighbour: function(cells) {
        var seeded = level.GetBoard().GetSeededCells();
        for (var i = 0; i < cells.length; i++) for (var dc = -1; dc <= 1; dc++) for (var dr = -1; dr <= 1; dr++) {
            var cell = { c: cells[i].c + dc, r: cells[i].r + dr };
            if (cell.c < 0 || cell.c >= COLS || cell.r < 0 || cell.r >= ROWS || inList(cells, cell) || inList(seeded, cell)) continue;
            if (WordBoard.IsTileUsable(tileAt(cell.c, cell.r))) return cell;
        }
        return null;
    }
};

// ---- main loop ------------------------------------------------------------------------------------

var lastTime = performance.now();
function frame(now) {
    var dt = Math.min(0.05, (now - lastTime)/1000);
    lastTime = now;

    Fx.update(dt);
    updateFlights(dt);
    updateTray(dt);
    updateScore(dt);

    if (hintQueue.length > 0) {
        hintTimer -= dt;
        if (hintTimer <= 0) {
            var cell = hintQueue.shift();
            hintTimer = 0.14;
            if (level.GetBoard().ToggleSelect(cell) == "added") startFlight(cell.c, cell.r, selection().length - 1);
            syncSelection(); syncTray(); syncTasks();
        }
    }

    if (collapsing) {
        motion.Update(dt);
        applyCollapseView();
        if (!motion.IsAnimating()) { collapsing = false; syncBoard(); syncSelection(); for (var c = 0; c < COLS; c++) for (var r = 0; r < ROWS; r++) setTileTransform(c, r, 0); }
    }
    updateShake(dt);
    updateBonusIdle(dt);

    if (messageTimer > 0) { messageTimer -= dt; if (messageTimer <= 0) $("message").classList.remove("shown"); }
    if (flashTimer > 0) { flashTimer -= dt; if (flashTimer <= 0) syncTray(); }

    var state = level.GetState();
    if (state != "playing" && popupState != state && !Fx.isBusy() && !collapsing) { popupState = state; showPopup(state == "won"); }
    if (popupShown) updatePopupIdle(dt);

    Demo.update(dt);
    Vfx.update(dt);
    Vfx.draw();
    requestAnimationFrame(frame);
}

// ---- wiring ---------------------------------------------------------------------------------------

Vfx.init();
window.addEventListener("resize", function() { Vfx.resize(); });
buildBoard();
$("accept").addEventListener("click", onAccept);
$("cancel").addEventListener("click", onClear);
$("popbtn").addEventListener("click", onPopupButton);
boosterEls.forEach(function(b, i) { b.addEventListener("click", function() { onBooster(i); }); });
startLevel(START_LEVEL >= 0 ? START_LEVEL : progress.currentLevel);
requestAnimationFrame(frame);

// a handle for experiments from the console
window.WordFallPlay = { level: level, dictionary: dictionary, start: startLevel, accept: onAccept, booster: onBooster, spawnPowerup: function(c, r, kind) { level.GetBoard().DebugSetPowerup({ c: c, r: r }, kind); syncBoard(); } };
})();
