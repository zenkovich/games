// Session id, boot overlay, project snapshot and the emscripten Module.

console.log('[shell] editor shell; build-tag=editor-4-modular');

// ---- session bootstrap (per browser tab) --------------------------
var sid = sessionStorage.getItem('o2sid');
if (!sid) {
    sid = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    sessionStorage.setItem('o2sid', sid);
}
// The page may be served from the host root or under a path prefix
// (games.host/<slug>/editor/). Everything network-facing hangs off o2Base.
window.o2Base = location.pathname.replace(/\/[^\/]*$/, '');
document.cookie = 'o2sid=' + sid + '; Path=' + (window.o2Base || '/') + '; SameSite=Strict';
window.o2fsEndpoint = window.o2Base + '/api';

var statusEl = document.getElementById('status');
var statusText = document.getElementById('status-text');
var progressBar = document.querySelector('#progress > span');
function setStatus(text, frac) {
    if (!text) { statusEl.classList.add('hidden'); return; }
    statusEl.classList.remove('hidden');
    statusText.textContent = text;
    if (typeof frac === 'number')
        progressBar.style.width = (frac * 100).toFixed(1) + '%';
}


// ---- the project's files --------------------------------------------
// shell/snapshot.js brings them: from what this browser kept of earlier starts, and from the server what is
// not there. It is pulled in from here and not by editor.html, which a project's own runtime and the demo
// bring in a version of their own. The download starts as soon as that file is here - long before preRun,
// which emscripten only reaches once the wasm is compiled.
var projectFiles = (function () {
    var job = null, failed = null, waiting = [];
    function settle() { waiting.splice(0).forEach(function (fn) { fn(); }); }
    (function pull(tries) {
        var s = document.createElement('script');
        s.src = 'shell/snapshot.js';
        s.onload = function () {
            job = window.o2Snapshot.start({
                base: o2Base, status: setStatus,
                // the server's own page lives in a throwaway profile: nothing to find there, nothing worth keeping
                noCache: /[?&](headless|nocache)=1/.test(location.search),
                words: { full: 'Downloading project… ', waiting: 'Downloading editor…' },
            });
            settle();
        };
        s.onerror = function () {
            s.remove();
            if (tries < 3) { setTimeout(function () { pull(tries + 1); }, 800 * (tries + 1)); return; }
            failed = new Error('shell/snapshot.js did not load');
            settle();
        };
        document.head.appendChild(s);
    })(0);
    return {
        /** into MEMFS, once the files and the runtime are both there */
        into: function (FS) {
            return new Promise(function (resolve, reject) {
                function go() { if (failed) reject(failed); else job.into(FS).then(resolve, reject); }
                if (job || failed) go(); else waiting.push(go);
            });
        },
    };
})();

function loadSnapshot(done, fail) {
    projectFiles.into(Module.FS).then(function (stats) {
        console.log('[shell] snapshot unpacked:', stats.files, 'files');
        done();
    }, function (e) {
        console.error('[shell] snapshot failed', e);
        setStatus('Failed to load project: ' + e.message);
        fail(e);
    });
}

// ---- the agent's own page (o2 portal, ?headless=1) -----------------
// Nobody looks at this page: the portal opens it in a hidden browser - ON THE SERVER, or on a developer's machine -
// as the AI agent's own instance of the editor and the game: its tools run here while the people of the project
// keep theirs to themselves (o2portal backend/src/portal/headless.ts). It draws and ticks like any other, at the
// rates whoever hosts it can afford. On the server there is
// no GPU: one frame of the editor drawn in software costs a third of a core-second, so an uncapped
// loop eats both cores of a small box for nothing. The loop is capped instead — a frame every two seconds
// while nothing is asked of the page, ten a second at most while a tool that needs frames is at work, a few
// a second between the tools while a game runs (ai.js: LOOP_TOOLS, restRate). Done
// here, before the wasm starts — emscripten looks requestAnimationFrame up on every call. Callbacks asked
// for within one period run in one real frame, so the screenshot tool's "read it right after the engine
// drew" still holds.
window.o2Headless = /[?&]headless=1/.test(location.search);
if (window.o2Headless) {
    // The host's rates, frames a second: &fps= nothing to do, &busy= a tool needs frames, &play= a game runs between
    // the tools, for &hold= seconds after the last one (AGENT_HEADLESS_FPS, _BUSY_FPS, _PLAY_FPS, _PLAY_HOLD_SEC for the
    // server's browser). 0 - no cap: a machine with a GPU needs none.
    window.__o2FrameCap = (function () {
        function arg(name, def) { var m = new RegExp('[?&]' + name + '=([\\d.]+)').exec(location.search); return m ? +m[1] || 1000 : def; }
        var idle = arg('fps', 0.5), busy = Math.max(idle, arg('busy', 10)), play = Math.max(idle, Math.min(busy, arg('play', 4)));
        // (it starts at the busy rate: the editor comes up over its first frames; ai.js calms it down once it has joined)
        return { fps: busy, idle: idle, busy: busy, play: play, hold: arg('hold', 120), frames: 0, waiting: [], behind: null };
    })();
    // also called by the game client's frame (preview-boot.js) for its own window
    window.__o2CapFrames = function (w) {
        var cap = window.__o2FrameCap;
        var raf = w.requestAnimationFrame.bind(w);
        var queue = [], timer = 0, inFrame = false, lastFrame = 0, seq = 0;
        function flush(t) {
            inFrame = false;
            lastFrame = w.performance.now();
            if (w === window) cap.frames++;
            var q = queue;
            queue = [];
            q.forEach(function (it) {
                if (!it.cb) return;
                // one callback's exception must not cost the others their frame; rethrown as it is, because
                // the crash watch below tells a wasm trap by the error object
                try { it.cb(t); } catch (e) { w.setTimeout(function () { throw e; }, 0); }
            });
        }
        function arm() {
            if (inFrame || !queue.length) return;
            w.clearTimeout(timer);
            // (the face behind the other one - the editor under the game client, or the other way round - is drawn for nobody)
            var fps = cap.behind && cap.behind(w) ? Math.min(cap.fps, cap.idle) : cap.fps;
            var wait = 1000 / fps - (w.performance.now() - lastFrame);
            if (wait > 6) timer = w.setTimeout(function () { timer = 0; inFrame = true; raf(flush); }, wait - 4);
            else { timer = 0; inFrame = true; raf(flush); }
        }
        // the rate has changed: a frame that was seconds away is due now
        cap.waiting.push(arm);
        w.requestAnimationFrame = function (cb) {
            var id = ++seq;
            queue.push({ id: id, cb: cb });
            if (!timer) arm();
            return id;
        };
        w.cancelAnimationFrame = function (id) {
            queue.forEach(function (it) { if (it.id === id) it.cb = null; });
        };
    };
    window.__o2FrameCap.rate = function (fps) {
        this.fps = fps;
        this.waiting.forEach(function (arm) { try { arm(); } catch (e) {} });
    };
    window.__o2CapFrames(window);
}

// ---- frames only for what is on the screen -----------------------
// Both faces stay loaded, and the portal keeps this page while other tabs of the project are open - but an
// engine nobody looks at has no business drawing sixty frames a second: a phone gets hot from it. Each face's
// window asks for its frames through a gate (emscripten looks requestAnimationFrame up on every call). A closed
// gate keeps the callbacks and hands them over when it opens: the engine sees one long frame, and clamps its dt.
// Its sound stops with it. Who is on the screen is decided in preview-host.js (o2Power.show); a tool of the
// agent opens both gates for as long as it runs (o2Power.hold: ai.js), and a face that has just been loaded is
// let through its first frames, over which it comes up. The server's own page is capped above instead.
window.o2Power = (function () {
    var BOOT_FRAMES = 180;
    var faces = {}, shown = { editor: true, preview: true }, holds = 0;

    function sound(w, on) {
        try {
            ((w.miniaudio && w.miniaudio.devices) || []).forEach(function (d) {
                var ctx = d && d.webaudio;
                if (!ctx) return;
                if (!on && ctx.state === 'running') { d.__o2Paused = true; ctx.suspend(); }
                else if (on && d.__o2Paused) { d.__o2Paused = false; ctx.resume(); }
            });
        } catch (e) {}
    }
    function setOpen(g, on) {
        if (g.open === on) return;
        g.open = on;
        sound(g.win, on);
        if (!on) return;
        var q = g.held;
        g.held = [];
        q.forEach(function (it) {
            try { g.moved[it.id] = g.raf(function (t) { delete g.moved[it.id]; g.frames++; it.cb(t); }); } catch (e) {}
        });
    }
    function apply() {
        Object.keys(faces).forEach(function (face) {
            var g = faces[face];
            setOpen(g, holds > 0 || !!shown[face] || g.frames < BOOT_FRAMES);
        });
    }
    function gate(face, w) {
        var g = { win: w, open: true, held: [], moved: {}, seq: 0, frames: 0,
                  raf: w.requestAnimationFrame.bind(w), caf: w.cancelAnimationFrame.bind(w) };
        w.__o2NativeRaf = g.raf;        // the page's own layout code is not the engine: it is never held
        w.requestAnimationFrame = function (cb) {
            if (g.open) return g.raf(function (t) { if (++g.frames === BOOT_FRAMES) apply(); cb(t); });
            g.held.push({ id: -(++g.seq), cb: cb });
            return -g.seq;
        };
        w.cancelAnimationFrame = function (id) {
            if (!(id < 0)) return g.caf(id);
            g.held = g.held.filter(function (it) { return it.id !== id; });
            if (g.moved[id] !== undefined) { g.caf(g.moved[id]); delete g.moved[id]; }
        };
        faces[face] = g;
        apply();
    }
    return {
        gate: function (face, w) { if (!window.o2Headless) gate(face, w); },
        /** { editor, preview }: which face somebody is looking at */
        show: function (next) { shown = next; apply(); },
        /** the engine is needed whether it is looked at or not; returns what lets it go, a moment later */
        hold: function (graceMs) {
            var done = false;
            holds++;
            apply();
            return function () {
                if (done) return;
                done = true;
                setTimeout(function () { holds--; apply(); }, graceMs == null ? 2500 : graceMs);
            };
        },
        state: function () {
            var out = { holds: holds };
            Object.keys(faces).forEach(function (f) { out[f] = { open: faces[f].open, frames: faces[f].frames, held: faces[f].held.length }; });
            return out;
        },
    };
})();
window.o2Power.gate('editor', window);

// ---- patches for the AI agent's screenshot/input tools ------------
// keep the WebGL back buffer readable so canvas screenshots work
(function () {
    var orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, attrs) {
        if (this.id === 'canvas' && (type === 'webgl2' || type === 'webgl'))
            attrs = Object.assign({}, attrs, { preserveDrawingBuffer: true });
        return orig.call(this, type, attrs);
    };
    // synthetic PointerEvents have no active pointer: capture calls throw
    var sc = Element.prototype.setPointerCapture;
    Element.prototype.setPointerCapture = function (id) { try { return sc.call(this, id); } catch (e) {} };
    var rc = Element.prototype.releasePointerCapture;
    Element.prototype.releasePointerCapture = function (id) { try { return rc.call(this, id); } catch (e) {} };
})();

// Ring buffer of the engine's own output, so the AI agent (and anyone debugging)
// can read what the editor printed without scraping the Log window off a screenshot
var engineLogLines = [];
function engineLog(kind, text) {
    engineLogLines.push((kind === 'err' ? 'ERR ' : '') + text);
    if (engineLogLines.length > 500) engineLogLines.splice(0, engineLogLines.length - 500);
}

// ---- crash watch --------------------------------------------------
// A wasm trap or abort kills the engine's main loop for good: restart the
// editor right away and show what happened, with the call stack resolved
// through the symbol map the build ships (--emit-symbol-map).
var crashHandled = false;

function isWasmCrash(err, message) {
    if (typeof WebAssembly !== 'undefined' && err instanceof WebAssembly.RuntimeError) return true;
    var t = String(message || (err && err.message) || '');
    return /RuntimeError|memory access out of bounds|null function or function signature|unreachable|table index is out of bounds|Aborted\(/.test(t);
}

// wasm frames come as wasm-function[N]; the .symbols file maps N to the name
function symbolizeStack(stack) {
    if (!/wasm-function\[\d+\]/.test(stack)) return Promise.resolve(stack);
    return fetch('Editor.html.symbols').then(function (r) {
        if (!r.ok) throw new Error('no symbol map');
        return r.text();
    }).then(function (text) {
        var map = {};
        text.split('\n').forEach(function (line) {
            var i = line.indexOf(':');
            if (i > 0) map[line.slice(0, i)] = line.slice(i + 1);
        });
        return stack.replace(/wasm-function\[(\d+)\]/g, function (m, n) {
            return map[n] ? map[n] + ' [' + n + ']' : m;
        });
    }).catch(function () { return stack; });
}

function showCrashBanner(record, blocked) {
    var prev = document.querySelector('.crash-banner');
    if (prev) prev.remove();
    var d = document.createElement('div');
    d.className = 'crash-banner';
    var head = document.createElement('div');
    head.className = 'crash-head';
    head.textContent = blocked
        ? '⚠ The editor keeps crashing — auto-restart paused'
        : '⚠ The editor crashed and was restarted';
    d.appendChild(head);
    var msg = document.createElement('div');
    msg.className = 'crash-msg';
    msg.textContent = record.message;
    d.appendChild(msg);
    if (record.stack) {
        var pre = document.createElement('pre');
        pre.textContent = record.stack;
        d.appendChild(pre);
    }
    var row = document.createElement('div');
    row.className = 'crash-row';
    function btn(label, fn, quiet) {
        var b = document.createElement('button');
        b.className = 'tbtn' + (quiet ? ' quiet' : '');
        b.textContent = label;
        b.onclick = fn;
        row.appendChild(b);
        return b;
    }
    if (blocked) btn('Restart the editor', function () { location.reload(); });
    var copyBtn = btn('Copy', function () {
        navigator.clipboard.writeText(record.t + '  ' + record.message + '\n' + (record.stack || ''))
            .then(function () { copyBtn.textContent = 'Copied'; }, function () {});
    }, true);
    btn('Close', function () { d.remove(); }, true);
    d.appendChild(row);
    document.body.appendChild(d);
}

// What emscripten said on stderr last: a failed start names its real reason there
// ("wasm streaming compile failed: TypeError: Failed to fetch"), the abort itself does not.
var lastErrLines = [];

// The editor never started because its wasm did not arrive: a network matter (a dropped
// connection, a server restart under a deploy), not a crash of the editor. It is retried with a
// growing pause and never counted as a crash strike; after a few tries the page says what is wrong.
function handleDownloadFailure(message) {
    var tries = 0;
    try { tries = +sessionStorage.getItem('o2_dl_retries') || 0; } catch (e) {}
    var why = lastErrLines.filter(function (l) { return /streaming compile failed/.test(l); }).pop() || '';
    console.error('[shell] editor download failed (try ' + (tries + 1) + ')', message, why);
    try {
        fetch(o2Base + '/api/agent/log', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ t: new Date().toISOString(), kind: 'download-failed', message: message, reason: why, tries: tries + 1, online: navigator.onLine }) }).catch(function () {});
    } catch (e) {}
    if (tries >= 4) {
        try { sessionStorage.removeItem('o2_dl_retries'); } catch (e) {}
        setStatus('Could not download the editor — check the connection and reload');
        showCrashBanner({ t: new Date().toISOString(), message: 'The editor could not be downloaded (' + (why || message) + '). This is a network problem, not a crash: reload the page when the connection is back.', stack: '' }, true);
        return;
    }
    try { sessionStorage.setItem('o2_dl_retries', String(tries + 1)); } catch (e) {}
    var wait = [1500, 3000, 6000, 10000][tries];
    setStatus('The connection dropped while downloading the editor — retrying…');
    var go = function () { location.reload(); };
    // offline: wait for the network to come back rather than burn the tries
    if (navigator.onLine === false) window.addEventListener('online', function () { setTimeout(go, 800); }, { once: true });
    else setTimeout(go, wait);
}

function handleCrash(message, stack) {
    if (crashHandled) return;
    crashHandled = true;
    message = String(message || 'wasm crash');
    if (/fetching of the wasm failed/.test(message)) { handleDownloadFailure(message); return; }
    console.error('[shell.crash]', message, stack);
    setStatus('The editor crashed — restarting…');
    symbolizeStack(String(stack || '')).then(function (sym) {
        var record = { t: new Date().toISOString(), message: message, stack: sym.slice(0, 8000) };
        try {
            fetch(o2Base + '/api/agent/log', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ t: record.t, kind: 'crash', message: message, stack: record.stack.slice(0, 4000) }),
            }).catch(function () {});
        } catch (e) {}
        var times = [];
        try { times = JSON.parse(sessionStorage.getItem('o2_crash_times') || '[]'); } catch (e) {}
        var now = Date.now();
        times = times.filter(function (t) { return now - t < 120000; });
        times.push(now);
        try {
            sessionStorage.setItem('o2_crash_times', JSON.stringify(times));
            sessionStorage.setItem('o2_crash', JSON.stringify(record));
        } catch (e) {}
        // a crash loop would reload forever; three strikes and the page waits for a human
        if (times.length >= 3) {
            try { sessionStorage.removeItem('o2_crash'); } catch (e) {}
            showCrashBanner(record, true);
            return;
        }
        // pending MEMFS -> server mirror writes should land before the world resets
        var drained = window.__o2DrainMirror ? window.__o2DrainMirror() : Promise.resolve();
        Promise.race([drained, new Promise(function (r) { setTimeout(r, 2500); })])
            .then(function () { location.reload(); });
    });
}

window.addEventListener('error', function (e) {
    if (isWasmCrash(e.error, e.message)) {
        e.preventDefault();
        handleCrash(e.message || String(e.error), e.error && e.error.stack);
    }
});
window.addEventListener('unhandledrejection', function (e) {
    if (isWasmCrash(e.reason)) {
        e.preventDefault();
        handleCrash(String((e.reason && e.reason.message) || e.reason), e.reason && e.reason.stack);
    }
});

// the previous life of this tab ended in a crash: say so, with the stack
try {
    var prevCrash = sessionStorage.getItem('o2_crash');
    if (prevCrash) {
        sessionStorage.removeItem('o2_crash');
        showCrashBanner(JSON.parse(prevCrash), false);
    }
} catch (e) {}

var Module = {
    canvas: (function () {
        var c = document.getElementById('canvas');
        c.addEventListener('webglcontextlost', function (e) {
            console.error('[shell] webglcontextlost');
            setStatus('WebGL context lost — reload the page');
            e.preventDefault();
        }, false);
        return c;
    })(),
    print: function (text) { console.log('[wasm.out]', text); engineLog('out', text); },
    printErr: function (text) { console.error('[wasm.err]', text); lastErrLines.push(String(text)); if (lastErrLines.length > 8) lastErrLines.shift(); engineLog('err', text); },
    setStatus: function (text) {
        if (text) console.log('[shell.setStatus]', text);
        var m = text && text.match(/([^\(]+)\((\d+(\.\d+)?)\/(\d+)\)/);
        if (m) setStatus(m[1].trim(), parseFloat(m[2]) / parseFloat(m[4]));
        else if (text) setStatus(text);
        else setStatus(null);
    },
    preRun: [function () {
        Module.addRunDependency('project-snapshot');
        loadSnapshot(
            function () { Module.removeRunDependency('project-snapshot'); },
            function () { /* startup halts with the error shown */ });
    }],
    onRuntimeInitialized: function () {
        console.log('[shell.onRuntimeInitialized]');
        try { sessionStorage.removeItem('o2_dl_retries'); } catch (e) {}
        // Assets restored from a zip are only sources: build them before the user
        // wonders why the editor still shows the old project
        // A working copy that has never been built (a project just imported from
        // its repository) has no game data at all: build it, then start over once,
        // because the editor has already tried to open its scene on nothing.
        var neverBuilt = false;
        try { neverBuilt = !Module.FS.analyzePath('/project/BuiltAssets/WebAssembly/Data.json').exists; } catch (e) {}
        if (sessionStorage.getItem('o2_rebuild_after_load') || neverBuilt) {
            sessionStorage.removeItem('o2_rebuild_after_load');
            setStatus(neverBuilt ? 'Building the project\'s assets for the first time…' : 'Building the restored assets…');
            setTimeout(function () {
                var ok = true;
                try { Module._o2_web_rebuild_assets(); }
                catch (e) { ok = false; console.error('[shell] rebuild after load failed', e); }
                if (neverBuilt && ok && !sessionStorage.getItem('o2_first_build:' + o2Base)) {
                    sessionStorage.setItem('o2_first_build:' + o2Base, '1');   // once: a build that leaves no Data.json must not loop
                    setStatus('Opening the project…');
                    (window.__o2DrainMirror ? window.__o2DrainMirror() : Promise.resolve())
                        .then(function () { return fetch(o2Base + '/api/session/built', { method: 'POST' }).catch(function () {}); })
                        .then(function () { location.reload(); });
                    return;
                }
                setStatus(null);
            }, 1500);
        }
    },
    onAbort: function (reason) { handleCrash('abort: ' + reason, new Error().stack); },
    onExit: function (code) { console.log('[shell.onExit]', code); }
};
setStatus('Downloading editor…');
window.onerror = function (e) { console.error('[shell]', e); };
