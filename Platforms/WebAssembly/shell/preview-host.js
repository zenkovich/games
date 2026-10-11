// The preview pane: the game client of this session, running in its own frame.
//
// The page has two faces over one working copy — the editor with the agent, and
// the game with the agent — and the bar switches between them mid-session. Both
// keep running: the client is loaded once and goes on playing behind the editor,
// so switching back is instant and the game keeps its state. It picks up new
// assets the way it always does — rebuild_assets, then restart.
//
// Everything the agent does in preview mode goes through the same tools as in the
// editor; ai.js just aims them at this frame's Module and canvas (see o2Preview).

var o2Preview = (function () {
    var root = document.getElementById('preview');
    var stage = document.getElementById('preview-stage');
    var screen = document.getElementById('preview-screen');
    var hint = document.getElementById('preview-hint');
    var sizeLabel = document.getElementById('pv-size');
    var restartBtn = document.getElementById('pv-restart');

    var frame = null;          // the client; it outlives a switch back to the editor
    var crashed = false;       // a dead client is remounted on the next switch
    var mode = 'editor';
    var ready = false;
    var listeners = [];

    // Portrait sizes; landscape swaps them. "Fit" follows the pane, which is what
    // you want while working, the fixed ones are for checking a real device — and
    // each is drawn in its own body, so the shape you are testing is on screen.
    // CSS-pixel viewports of what people actually play on, grouped for the menu
    var DEVICES = [
        { id: 'fit', name: 'Fit to pane', kind: 'fit' },
        { group: 'Phones' },
        { id: 'iphone-se', name: 'iPhone SE', w: 375, h: 667, kind: 'phone' },
        { id: 'iphone-15', name: 'iPhone 15 / 16', w: 393, h: 852, kind: 'phone', notch: true },
        { id: 'iphone-16-pro', name: 'iPhone 16 Pro', w: 402, h: 874, kind: 'phone', notch: true },
        { id: 'iphone-15-pro-max', name: 'iPhone 15 Pro Max', w: 430, h: 932, kind: 'phone', notch: true },
        { id: 'pixel-8', name: 'Pixel 8', w: 412, h: 915, kind: 'phone', punch: true },
        { id: 'pixel-8-pro', name: 'Pixel 8 Pro', w: 448, h: 998, kind: 'phone', punch: true },
        { id: 'galaxy-s24', name: 'Galaxy S24', w: 360, h: 780, kind: 'phone', punch: true },
        { id: 'galaxy-s24-ultra', name: 'Galaxy S24 Ultra', w: 384, h: 824, kind: 'phone', punch: true },
        { group: 'Tablets' },
        { id: 'ipad-mini', name: 'iPad mini', w: 744, h: 1133, kind: 'tablet' },
        { id: 'ipad', name: 'iPad', w: 820, h: 1180, kind: 'tablet' },
        { id: 'ipad-pro-11', name: 'iPad Pro 11″', w: 834, h: 1194, kind: 'tablet' },
        { id: 'ipad-pro-13', name: 'iPad Pro 13″', w: 1024, h: 1366, kind: 'tablet' },
        { id: 'galaxy-tab-s9', name: 'Galaxy Tab S9', w: 800, h: 1280, kind: 'tablet' },
        { group: 'Desktop' },
        { id: 'steam-deck', name: 'Steam Deck', w: 1280, h: 800, kind: 'desktop' },
        { id: '720p', name: 'Window 720p', w: 1280, h: 720, kind: 'desktop' },
        { id: '1080p', name: 'Window 1080p', w: 1920, h: 1080, kind: 'desktop' },
    ];
    DEVICES.forEach(function (d) { if (d.id) d.label = d.w ? d.name + ' — ' + d.w + '×' + d.h : d.name; });

    // Silhouettes for the picker: the menu shows what each preset is, not just
    // its numbers
    var SHAPES = {
        fit: '<svg viewBox="0 0 24 24"><rect x="2.5" y="4.5" width="19" height="15" rx="2"/><path d="M7 9h4M7 12h7"/></svg>',
        desktop: '<svg viewBox="0 0 24 24"><rect x="2.5" y="4.5" width="19" height="12" rx="1.5"/><path d="M9 19.5h6M12 16.5v3"/></svg>',
        phone: '<svg viewBox="0 0 24 24"><rect x="7.5" y="2.5" width="9" height="19" rx="2"/><path d="M10.6 4.6h2.8"/></svg>',
        tablet: '<svg viewBox="0 0 24 24"><rect x="5.5" y="2.5" width="13" height="19" rx="2"/><circle cx="12" cy="19" r=".9"/></svg>',
    };
    // A game is a phone game until told otherwise: the pane opens as an upright
    // iPhone, and remembers what the visitor picked instead.
    function stored(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
    function remember(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }
    function byId(id) { for (var i = 0; i < DEVICES.length; i++) if (DEVICES[i].id === id) return DEVICES[i]; return null; }
    var device = byId(stored('o2pv_device')) || byId('iphone-15');
    var orientation = stored('o2pv_orient') === 'landscape' ? 'landscape' : 'portrait';  // meaningful for the fixed sizes only

    // On a phone there is nothing to emulate: the pane is the device. One rule for
    // the whole shell — a narrow page, or a touch screen lying on its side — and
    // the stylesheet follows it through body.handheld, so it is written down once.
    var MOBILE_QUERY = '(max-width: 820px), (pointer: coarse) and (max-height: 600px)';
    var mobileMq = window.matchMedia ? window.matchMedia(MOBILE_QUERY) : null;
    var mobile = !!(mobileMq && mobileMq.matches);
    var immersive = false;     // full screen: the game and nothing else
    var solo = false;          // the portal shows this page for its agent alone (a tab that is neither face)

    function emit(kind) { listeners.forEach(function (fn) { try { fn(kind); } catch (e) {} }); }

    // The screen gets a body around it (built here so a UI change needs no wasm
    // relink), and the hint gets a progress bar for the client's own loading.
    var device_el = document.createElement('div');
    device_el.id = 'preview-device';
    screen.parentNode.insertBefore(device_el, screen);
    device_el.appendChild(screen);
    var bezel = document.createElement('div');
    bezel.className = 'pv-bezel';
    bezel.innerHTML = '<span class="pv-notch"></span><span class="pv-speaker"></span><span class="pv-home"></span>';
    device_el.appendChild(bezel);

    var progressWrap = document.createElement('div');
    progressWrap.className = 'pv-progress';
    progressWrap.innerHTML = '<span></span>';
    var progressBar = progressWrap.firstChild;
    hint.parentNode.insertBefore(progressWrap, hint.nextSibling);

    function setHint(text, frac) {
        if (!text) {
            hint.style.display = 'none';
            progressWrap.style.display = 'none';
            return;
        }
        hint.style.display = '';
        hint.textContent = text;
        progressWrap.style.display = typeof frac === 'number' ? '' : 'none';
        if (typeof frac === 'number')
            progressBar.style.width = (Math.max(0, Math.min(1, frac)) * 100).toFixed(1) + '%';
    }

    // ---- geometry ----------------------------------------------------
    // The screen keeps its device size in CSS pixels (so the agent's canvas
    // coordinates are the device's) and is scaled down only to fit the pane.
    function layout() {
        if (mobile) {
            // this device: every pixel of the pane, at the pixel ratio it really has
            screen.style.width = '100%';
            screen.style.height = '100%';
            device_el.className = 'kind-native';
            device_el.style.transform = '';
            sizeLabel.textContent = screen.clientWidth + '×' + screen.clientHeight;
            return;
        }
        var pane = stage.getBoundingClientRect();
        // full screen keeps the emulated device, with air around its body, and gives
        // "Fit" the whole window
        var pad = !immersive ? 24 : device.id === 'fit' ? 0 : 64;
        var availW = Math.max(120, pane.width - pad), availH = Math.max(120, pane.height - pad);
        var w, h, scale = 1;
        if (device.id === 'fit') {
            w = Math.round(availW); h = Math.round(availH);
        } else {
            var short = Math.min(device.w, device.h), long = Math.max(device.w, device.h);
            w = orientation === 'landscape' ? long : short;
            h = orientation === 'landscape' ? short : long;
            scale = Math.min(1, availW / w, availH / h);
        }
        screen.style.width = w + 'px';
        screen.style.height = h + 'px';
        device_el.className = 'kind-' + device.kind +
            (device.notch ? ' has-notch' : '') + (device.punch ? ' has-punch' : '') +
            ' ' + (orientation === 'landscape' ? 'is-landscape' : 'is-portrait');
        device_el.style.transform = scale < 1 ? 'scale(' + scale + ')' : '';
        sizeLabel.textContent = w + '×' + h + (scale < 1 ? '  ·  ' + Math.round(scale * 100) + '%' : '');
    }

    window.addEventListener('resize', function () { if (mode === 'preview') layout(); });
    // the pane also changes when the agent panel is resized or folded away
    if (window.ResizeObserver)
        new ResizeObserver(function () { if (mode === 'preview') layout(); }).observe(stage);

    // (the agent alone, on a phone, is the same sheet over nothing: body.agent-solo)
    function applyHandheld() {
        document.body.classList.toggle('handheld', mobile && (mode === 'preview' || solo));
        document.body.classList.toggle('agent-solo', mobile && solo);
    }
    // Frames go to the face somebody looks at (boot.js: o2Power). `onScreen` is the portal's word: it keeps
    // this page while other tabs of the project are open, and shows it for its agent alone.
    var onScreen = true;
    function applyPower() {
        if (window.o2Power) o2Power.show({ editor: onScreen && mode === 'editor', preview: onScreen && mode === 'preview' });
    }
    function setOnScreen(on) {
        on = !!on;
        if (on === onScreen) return;
        onScreen = on;
        applyPower();
        emit('screen');
    }
    applyPower();
    function setSolo(on) {
        on = !!on;
        if (on === solo) return;
        solo = on;
        applyHandheld();
        emit('solo');
    }
    function onMobileChange() {
        if (mobile === mobileMq.matches) return;
        mobile = mobileMq.matches;
        applyHandheld();
        emit('mobile');
        if (mode === 'preview') layout();
    }
    if (mobileMq) {
        if (mobileMq.addEventListener) mobileMq.addEventListener('change', onMobileChange);
        else if (mobileMq.addListener) mobileMq.addListener(onMobileChange);
    }

    // ---- the client --------------------------------------------------
    function mount() {
        if (frame) return;
        ready = false;
        crashed = false;
        setHint('Loading the game client…', 0);
        frame = document.createElement('iframe');
        frame.id = 'preview-frame';
        frame.setAttribute('title', 'Game preview');
        frame.src = 'GamePreview.html';
        frame.addEventListener('load', watchFrame);
        screen.appendChild(frame);
    }

    function unmount() {
        if (!frame) return;
        frame.remove();
        frame = null;
        ready = false;
        emit('unmounted');
    }

    window.addEventListener('message', function (e) {
        if (e.origin !== location.origin || !e.data || !e.data.o2preview) return;
        if (e.data.o2preview === 'ready') {
            ready = true;
            setHint(null);
            emit('ready');
        } else if (e.data.o2preview === 'progress') {
            if (!ready) setHint(e.data.text || 'Loading the game client…',
                                typeof e.data.frac === 'number' ? e.data.frac : undefined);
        } else if (e.data.o2preview === 'crash') {
            ready = false;
            crashed = true;
            setHint('The game crashed: ' + e.data.message);
            emit('crash');
        }
    });

    // Restart with what is on disk now: the client rebuilds nothing by itself, so
    // whatever was already built (by the agent's rebuild_assets, or by the editor
    // before the switch) is what the game starts on.
    function restart() {
        if (!frame) { mount(); return Promise.resolve({ reloaded: true }); }
        var win = frame.contentWindow;
        if (ready && win && win.Module && typeof win.Module._o2_web_restart === 'function') {
            win.Module._o2_web_restart();
            return Promise.resolve({ restarted: true });
        }
        // not up yet (or the client crashed): a fresh frame is the restart
        unmount();
        mount();
        return Promise.resolve({ reloaded: true });
    }

    restartBtn.onclick = function () { restart(); };

    // ---- full screen -------------------------------------------------
    // The game and nothing else: the bar and the agent go away here, the page
    // this one is embedded in hides its own header when told (see the embed block
    // below). The Fullscreen API is asked as well, from the tap itself — but an
    // iPhone has none for elements, so the look never depends on it.
    var ICON_FULL = '<svg class="icon" viewBox="0 0 16 16"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var ICON_UNFULL = '<svg class="icon" viewBox="0 0 16 16"><path d="M6 2.5V6H2.5M13.5 6H10V2.5M10 13.5V10h3.5M2.5 10H6v3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var fsEntered = false;
    function fsElement() { return document.fullscreenElement || document.webkitFullscreenElement || null; }

    var fullBtn = document.createElement('button');
    fullBtn.id = 'pv-full';
    fullBtn.title = 'Full screen: the game and nothing else';
    fullBtn.innerHTML = ICON_FULL + 'Full screen';
    fullBtn.onclick = function () { setImmersive(true); };
    restartBtn.parentNode.insertBefore(fullBtn, restartBtn.nextSibling);

    // the way back: a button in the corner that fades out of the game's way and
    // comes back when something happens near it
    var exitBtn = document.createElement('button');
    exitBtn.id = 'pv-exit';
    exitBtn.title = 'Exit full screen';
    exitBtn.innerHTML = ICON_UNFULL;
    root.appendChild(exitBtn);
    var dimTimer = null, exitArmed = false;
    function wakeExit() {
        exitBtn.classList.remove('dim');
        clearTimeout(dimTimer);
        dimTimer = setTimeout(function () { exitBtn.classList.add('dim'); }, 3000);
    }
    // a tap on the faded button only brings it back: it must not end a game by accident
    exitBtn.addEventListener('pointerdown', function (e) {
        exitArmed = !exitBtn.classList.contains('dim');
        e.stopPropagation();
        wakeExit();
    });
    exitBtn.onclick = function () { if (exitArmed) setImmersive(false); };
    // a mouse has no such accidents: under the pointer it is simply there
    exitBtn.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') wakeExit(); });

    var EXIT_REACH = 150;
    function nearExit(x, y) {
        if (!immersive) return;
        var r = exitBtn.getBoundingClientRect();
        var dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2);
        if (dx * dx + dy * dy < EXIT_REACH * EXIT_REACH) wakeExit();
    }
    function onPointer(e) { if (!exitBtn.contains(e.target)) nearExit(e.clientX, e.clientY); }
    // the game is a frame of its own and keeps its events: listen inside it too
    function onFramePointer(e) {
        if (!immersive || !frame) return;
        var r = frame.getBoundingClientRect();
        var k = frame.clientWidth ? r.width / frame.clientWidth : 1;
        nearExit(r.left + e.clientX * k, r.top + e.clientY * k);
    }
    function onEscape(e) { if (e.key === 'Escape' && immersive) setImmersive(false); }
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('pointermove', onPointer, true);
    document.addEventListener('keydown', onEscape);
    function watchFrame() {
        try {
            var doc = frame.contentDocument;
            doc.addEventListener('pointerdown', onFramePointer, true);
            doc.addEventListener('pointermove', onFramePointer, true);
            doc.addEventListener('keydown', onEscape);
        } catch (e) {}
    }

    function setImmersive(on) {
        on = !!on && mode === 'preview';
        if (on === immersive) return;
        immersive = on;
        document.body.classList.toggle('immersive', on);
        var el = document.documentElement;
        if (on) {
            var request = el.requestFullscreen || el.webkitRequestFullscreen;
            if (request) {
                try {
                    var asked = request.call(el, { navigationUI: 'hide' });
                    if (asked && asked.catch) asked.catch(function () {});
                } catch (e) {}
            }
            wakeExit();
        } else if (fsElement()) {
            var leave = document.exitFullscreen || document.webkitExitFullscreen;
            try {
                var left = leave && leave.call(document);
                if (left && left.catch) left.catch(function () {});
            } catch (e) {}
        }
        layout();
        emit('immersive');
        window.dispatchEvent(new Event('resize'));
    }
    // left by the browser's own way out (Esc, the back gesture): follow it
    function onFsChange() {
        if (fsElement()) { fsEntered = true; return; }
        if (!fsEntered) return;
        fsEntered = false;
        setImmersive(false);
    }
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);

    // ---- controls ----------------------------------------------------
    var setOrientation = function () {};
    function buildControls() {
        var deviceSlot = document.getElementById('pv-device-slot');
        var dd = document.createElement('span');
        dd.className = 'pv-dd';
        var btn = document.createElement('button');
        btn.innerHTML = '<svg class="icon" viewBox="0 0 16 16"><use href="#i-device"/></svg>' +
                        '<span class="pv-dd-label"></span>' +
                        '<svg class="icon chev" viewBox="0 0 16 16"><use href="#i-chev"/></svg>';
        var menu = document.createElement('div');
        menu.className = 'pv-menu';
        function shortName(d) { return d.id === 'fit' ? 'Fit' : d.name; }
        function markCurrent() {
            menu.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x.dataset.id === device.id); });
            btn.querySelector('.pv-dd-label').textContent = shortName(device);
        }
        DEVICES.forEach(function (d) {
            if (d.group) {
                var head = document.createElement('div');
                head.className = 'pv-group';
                head.textContent = d.group;
                menu.appendChild(head);
                return;
            }
            var item = document.createElement('button');
            item.dataset.id = d.id;
            item.innerHTML = '<span class="pv-shape">' + (SHAPES[d.kind] || '') + '</span>' +
                             '<span class="pv-name">' + d.name + '</span>' +
                             (d.w ? '<span class="pv-dim">' + d.w + '×' + d.h + '</span>' : '');
            item.onclick = function () {
                device = d;
                remember('o2pv_device', d.id);
                menu.classList.remove('open');
                // a monitor lies on its side; nobody wants a 720×1280 "desktop"
                if (d.kind === 'desktop') setOrientation('landscape');
                markCurrent();
                layout();
            };
            menu.appendChild(item);
        });
        btn.onclick = function (e) { e.stopPropagation(); menu.classList.toggle('open'); };
        document.addEventListener('click', function () { menu.classList.remove('open'); });
        dd.appendChild(btn);
        dd.appendChild(menu);
        deviceSlot.appendChild(dd);
        markCurrent();

        var orientSlot = document.getElementById('pv-orient');
        var seg = document.createElement('span');
        seg.className = 'pv-seg';
        [['portrait', 'Portrait'], ['landscape', 'Landscape']].forEach(function (o) {
            var b = document.createElement('button');
            b.textContent = o[1];
            b.dataset.orient = o[0];
            b.onclick = function () { setOrientation(o[0]); layout(); };
            seg.appendChild(b);
        });
        setOrientation = function (next) {
            orientation = next;
            remember('o2pv_orient', next);
            seg.querySelectorAll('button').forEach(function (x) {
                x.classList.toggle('on', x.dataset.orient === orientation);
            });
        };
        setOrientation(orientation);
        orientSlot.appendChild(seg);
    }
    buildControls();

    // ---- mode --------------------------------------------------------
    function setMode(next) {
        if (next !== 'preview' && next !== 'editor') return;
        if (next === mode) return;
        if (next !== 'preview') setImmersive(false);
        mode = next;
        document.body.classList.toggle('mode-preview', mode === 'preview');
        applyHandheld();
        applyPower();
        if (mode === 'preview') {
            if (frame && !crashed) {
                // it kept running while the editor was in front: just show it
                layout();
            } else {
                // the editor may still owe the server the tail of a build — worth
                // a moment, never worth making the switch feel broken
                if (crashed) unmount();
                var drained = window.__o2DrainMirror ? window.__o2DrainMirror() : Promise.resolve();
                var bounded = Promise.race([drained, new Promise(function (r) { setTimeout(r, 1500); })]);
                bounded.then(function () {
                    if (mode !== 'preview') return;
                    mount();
                    layout();
                });
                layout();
            }
        }
        // leaving does not unload the client: it stays as it is behind the editor,
        // the way the editor stays behind it — loaded, and without frames (o2Power)
        var sw = document.getElementById('modeswitch');
        sw.classList.toggle('at-preview', mode === 'preview');
        sw.querySelectorAll('button').forEach(function (b) {
            b.classList.toggle('on', b.dataset.mode === mode);
        });
        emit('mode');
        // the editor canvas was hidden while away: let it size itself again
        window.dispatchEvent(new Event('resize'));
    }

    return {
        setMode: setMode,
        mode: function () { return mode; },
        isActive: function () { return mode === 'preview'; },
        isReady: function () { return mode === 'preview' && ready && !!frame; },
        // the client, whichever face is in front: it keeps running in the
        // background, so files changed meanwhile still have to reach its copy
        liveWindow: function () { return ready && frame ? frame.contentWindow : null; },
        frameWindow: function () { return frame && frame.contentWindow; },
        canvas: function () {
            try { return frame.contentDocument.getElementById('canvas'); } catch (e) { return null; }
        },
        restart: restart,
        device: function () {
            var w = screen.clientWidth, h = screen.clientHeight;
            if (mobile) return { id: 'native', label: 'This device', orientation: w > h ? 'landscape' : 'portrait', width: w, height: h };
            return { id: device.id, label: device.label, orientation: orientation, width: w, height: h };
        },
        isMobile: function () { return mobile; },
        isImmersive: function () { return immersive; },
        setImmersive: setImmersive,
        isSolo: function () { return solo; },
        setSolo: setSolo,
        isOnScreen: function () { return onScreen; },
        setOnScreen: setOnScreen,
        onChange: function (fn) { listeners.push(fn); },
    };
})();

(function () {
    document.querySelectorAll('#modeswitch button').forEach(function (b) {
        b.onclick = function () { o2Preview.setMode(b.dataset.mode); };
        b.classList.toggle('on', b.dataset.mode === 'editor');
    });
})();

// ---- embedded in the o2 portal ---------------------------------------
// The portal shows this page in a frame under its own header: which face is in
// front and whether the agent panel is out is decided up there (the Editor and
// Play tabs, the Agent button), and what used to be buttons of this bar — the
// changed files, the asset browser, zip export — lives in the project's Git tab.
// Full screen goes the other way: asked for here ({o2shell:'immersive'}), and the
// page takes its header off; it can end it too ({o2portal:'immersive', on:false}).
// {o2portal:'viewport'} brings what a frame cannot see — safe areas, the keyboard.
// {o2portal:'solo'}: the frame is up for the agent alone, on a tab that is neither face.
// {o2portal:'shown'}: whether a face of this page is on the screen at all (it is kept while other tabs are open).
(function () {
    if (window.parent === window || !/[?&]embed=1/.test(location.search)) return;
    document.body.classList.add('embed');

    // git moved the tree since the built assets were made: build once after boot
    var m = location.search.match(/[?&]rebuild=([\w-]+)/);
    var revKey = 'o2_rebuilt_rev:' + o2Base;
    if (m && sessionStorage.getItem(revKey) !== m[1]) {
        sessionStorage.setItem(revKey, m[1]);
        if (m[1] !== '0') sessionStorage.setItem('o2_rebuild_after_load', '1');
    }

    // on a phone the agent is a row that is always there: "shown" is its sheet (ai.js)
    function agentShown() {
        return window.__o2AgentShown ? window.__o2AgentShown() : !document.body.classList.contains('ai-hidden');
    }
    // dock: how wide the agent's panel is - outside the editor tabs the portal shows this frame as a drawer of
    // exactly that width (the agent on every tab of a project), so dragging the panel's edge resizes the drawer
    function dockWidth() {
        var v = parseInt(getComputedStyle(document.body).getPropertyValue('--ai-dock'), 10);
        return v > 0 ? v : 420;
    }
    function report() {
        parent.postMessage({ o2shell: 'state', mode: o2Preview.mode(), agent: agentShown(), dock: dockWidth(),
                             immersive: o2Preview.isImmersive(), solo: o2Preview.isSolo(), shown: o2Preview.isOnScreen() }, location.origin);
    }
    function px(v) { return (Math.max(0, Math.round(+v || 0))) + 'px'; }

    window.addEventListener('message', function (e) {
        if (e.origin !== location.origin || !e.data || !e.data.o2portal) return;
        var d = e.data;
        if (d.o2portal === 'mode') {
            o2Preview.setMode(d.mode);
        } else if (d.o2portal === 'agent') {
            var hidden = !agentShown();
            if (window.__o2ToggleAgent && (d.open === undefined || d.open === hidden)) window.__o2ToggleAgent();
        } else if (d.o2portal === 'sync') {
            // files the portal's own browser saved or removed under Assets/
            if (window.__o2SyncFiles) window.__o2SyncFiles(d.changed || [], d.deleted || []);
        } else if (d.o2portal === 'solo') {
            o2Preview.setSolo(!!d.on);
        } else if (d.o2portal === 'shown') {
            o2Preview.setOnScreen(!!d.on);
        } else if (d.o2portal === 'immersive') {
            // the page left the Play tab under a game in full screen
            o2Preview.setImmersive(!!d.on);
        } else if (d.o2portal === 'viewport') {
            // what only the top page can see: the notch and the home bar around this
            // frame, and how much of it the on-screen keyboard covers. Not answered
            // with a state report, or the two pages would talk forever.
            var inset = d.insets || {}, st = document.documentElement.style;
            st.setProperty('--o2-safe-top', px(inset.top));
            st.setProperty('--o2-safe-right', px(inset.right));
            st.setProperty('--o2-safe-bottom', px(inset.bottom));
            st.setProperty('--o2-safe-left', px(inset.left));
            st.setProperty('--o2-kb', px(d.keyboard));
            document.documentElement.classList.toggle('kb-open', d.keyboard > 0);
            return;
        } else if (d.o2portal === 'reload') {
            if (d.rebuild) sessionStorage.setItem('o2_rebuild_after_load', '1');
            (window.__o2DrainMirror ? window.__o2DrainMirror() : Promise.resolve())
                .then(function () { location.reload(); });
            return;
        }
        report();
    });

    o2Preview.onChange(function (kind) {
        if (kind === 'immersive') parent.postMessage({ o2shell: 'immersive', on: o2Preview.isImmersive() }, location.origin);
        report();
    });
    // class: the panel shown or hidden, the face; style: --ai-dock while its edge is dragged
    new MutationObserver(report).observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
    report();
})();
