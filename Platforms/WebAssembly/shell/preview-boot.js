// Boot for the game preview client: the same session working copy as the editor
// next door, streamed into MEMFS, and the emscripten Module the parent page
// drives. Everything the editor shell does around the engine (chat, browser,
// bottom bar) belongs to the parent — this page is the game and nothing else.

console.log('[preview] game preview shell');

// in the portal's headless page on the server the frame rate is capped, this window's included (boot.js)
try { if (window.parent !== window && window.parent.__o2CapFrames) window.parent.__o2CapFrames(window); } catch (e) {}
// ...and in a person's page the game gets frames only while it is the face in front (boot.js: o2Power)
try { if (window.parent !== window && window.parent.o2Power) window.parent.o2Power.gate('preview', window); } catch (e) {}

// The session is the tab's, not the frame's: sessionStorage is shared with the
// parent page, so the client opens the very working copy the editor is editing.
var sid = sessionStorage.getItem('o2sid');
if (!sid) {
    sid = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    sessionStorage.setItem('o2sid', sid);
}
window.o2Base = location.pathname.replace(/\/[^\/]*$/, '');
document.cookie = 'o2sid=' + sid + '; Path=' + (window.o2Base || '/') + '; SameSite=Strict';
// Defined ⇒ the engine's WebFS mirrors every MEMFS mutation back to the server,
// so an asset rebuilt here is on disk for the editor and the agent as well
window.o2fsEndpoint = window.o2Base + '/api';

var statusEl = document.getElementById('status');
var statusText = document.getElementById('status-text');
var progressBar = document.querySelector('#progress > span');
function setStatus(text, frac) {
    // the parent page shows the same thing over the pane, so a switch to the
    // game reads as loading rather than as an empty rectangle
    try {
        parent.postMessage({ o2preview: 'progress', text: text || '', frac: typeof frac === 'number' ? frac : null },
                           location.origin);
    } catch (e) {}
    if (!text) { statusEl.classList.add('hidden'); return; }
    statusEl.classList.remove('hidden');
    statusText.textContent = text;
    if (typeof frac === 'number')
        progressBar.style.width = (frac * 100).toFixed(1) + '%';
}

// The project's files: shell/snapshot.js, as in boot.js - what this browser kept of earlier starts, the rest from
// the server. The editor next door has usually just put the whole project there, so this frame waits for it to
// finish doing that (its own wasm is downloaded and compiled meanwhile) and then downloads next to nothing.
var projectFiles = (function () {
    var job = null, failed = null, waiting = [];
    function settle() { waiting.splice(0).forEach(function (fn) { fn(); }); }
    (function pull(tries) {
        var s = document.createElement('script');
        s.src = 'shell/snapshot.js';
        s.onload = function () {
            var host = null;
            try { if (window.parent !== window && window.parent.o2Snapshot) host = window.parent; } catch (e) {}
            job = window.o2Snapshot.start({
                base: o2Base, status: setStatus,
                after: host ? host.o2Snapshot.shared(90000) : null,
                noCache: /[?&]nocache=1/.test(location.search) || !!(host && (host.o2Headless || /[?&]nocache=1/.test(host.location.search))),
                words: { full: 'Loading project… ', waiting: 'Loading the game client…' },
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
        console.log('[preview] snapshot unpacked:', stats.files, 'files');
        done();
    }, function (e) {
        // (a dropped connection has already been retried in there)
        console.error('[preview] snapshot failed', e);
        setStatus('Failed to load the project: ' + e.message);
        fail(e);
    });
}

// The agent screenshots this canvas from the parent page, and drives the game
// with synthetic events: both need the same patches the editor page applies.
(function () {
    var orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, attrs) {
        if (this.id === 'canvas' && (type === 'webgl2' || type === 'webgl'))
            attrs = Object.assign({}, attrs, { preserveDrawingBuffer: true });
        return orig.call(this, type, attrs);
    };
    var sc = Element.prototype.setPointerCapture;
    Element.prototype.setPointerCapture = function (id) { try { return sc.call(this, id); } catch (e) {} };
    var rc = Element.prototype.releasePointerCapture;
    Element.prototype.releasePointerCapture = function (id) { try { return rc.call(this, id); } catch (e) {} };
})();

// What the engine printed, for the agent's read_log — the parent reads this
// array out of the frame the same way it reads its own
var engineLogLines = [];
function engineLog(kind, text) {
    engineLogLines.push((kind === 'err' ? 'ERR ' : '') + text);
    if (engineLogLines.length > 500) engineLogLines.splice(0, engineLogLines.length - 500);
}

function isWasmCrash(err, message) {
    if (typeof WebAssembly !== 'undefined' && err instanceof WebAssembly.RuntimeError) return true;
    var t = String(message || (err && err.message) || '');
    return /RuntimeError|memory access out of bounds|null function or function signature|unreachable|table index is out of bounds|Aborted\(/.test(t);
}

// A crash here is the game's, not the editor's: tell the parent, which shows it
// and decides whether to reload the client
var crashHandled = false;
function handleCrash(message, stack) {
    if (crashHandled) return;
    crashHandled = true;
    // the client's wasm did not arrive: the network's doing, not the game's - try again a few times
    // before telling anybody (boot.js does the same for the editor)
    if (/fetching of the wasm failed/.test(String(message))) {
        var tries = 0;
        try { tries = +sessionStorage.getItem('o2_pv_dl_retries') || 0; } catch (e) {}
        if (tries < 4) {
            try { sessionStorage.setItem('o2_pv_dl_retries', String(tries + 1)); } catch (e) {}
            setStatus('The connection dropped while downloading the game — retrying…');
            setTimeout(function () { location.reload(); }, [1500, 3000, 6000, 10000][tries]);
            return;
        }
        try { sessionStorage.removeItem('o2_pv_dl_retries'); } catch (e) {}
        message = 'The game client could not be downloaded - a network problem, not a crash of the game. Restart it when the connection is back.';
    }
    console.error('[preview.crash]', message, stack);
    setStatus('The game crashed');
    try {
        parent.postMessage({ o2preview: 'crash', message: String(message || 'wasm crash'),
                             stack: String(stack || '').slice(0, 8000) }, location.origin);
    } catch (e) {}
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

// Heartbeat the parent can read: it tells whether the client is still ticking
// (behind the editor it is not: a face nobody looks at gets no frames, boot.js).
window.__o2Ticks = 0;
(function tick() { window.__o2Ticks++; requestAnimationFrame(tick); })();

var Module = {
    canvas: (function () {
        var c = document.getElementById('canvas');
        c.addEventListener('webglcontextlost', function (e) {
            console.error('[preview] webglcontextlost');
            setStatus('WebGL context lost — restart the client');
            e.preventDefault();
        }, false);
        return c;
    })(),
    print: function (text) { console.log('[game.out]', text); engineLog('out', text); },
    printErr: function (text) { console.error('[game.err]', text); engineLog('err', text); },
    setStatus: function (text) {
        if (text) console.log('[preview.setStatus]', text);
        var m = text && text.match(/([^\(]+)\((\d+(\.\d+)?)\/(\d+)\)/);
        if (m) setStatus('Downloading the client… ' + m[1].trim().replace(/^Downloading data\.\.\.$/, ''),
                         parseFloat(m[2]) / parseFloat(m[4]));
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
        console.log('[preview.onRuntimeInitialized]');
        try { sessionStorage.removeItem('o2_pv_dl_retries'); } catch (e) {}
        setStatus(null);
        try { parent.postMessage({ o2preview: 'ready' }, location.origin); } catch (e) {}
    },
    onAbort: function (reason) { handleCrash('abort: ' + reason, new Error().stack); },
    onExit: function (code) { console.log('[preview.onExit]', code); }
};
setStatus('Loading the game client…');
