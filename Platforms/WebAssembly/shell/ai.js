// AI agent: Claude Code runs on the server, scoped to this session's project;
// this file is its face in the page and its hands in the editor.
//
// The server streams the conversation over SSE (/api/agent/stream). File work
// happens there with Claude's own tools; anything that needs the running
// editor (screenshot, scene tree, run_script, play mode, asset rebuild...)
// arrives as a tool_request event, is executed here and posted back.
//
// UI shape: the title bar carries identity and live status; settings and
// developer output are folded away until asked for, so an ordinary turn is
// just the conversation, a progress line and the list of files that changed.

// ---- AI agent ------------------------------------------------------
(function () {
    var ICONS_PLUS = '<svg viewBox="0 0 16 16"><path d="M8 3.5v9M3.5 8h9"/></svg>';
    var ICONS_GEAR = '<svg viewBox="0 0 16 16"><path d="M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/><path d="M13 8a5 5 0 0 0-.1-1l1.3-1-1.5-2.6-1.6.6a5 5 0 0 0-1.7-1L9.2 1H6.8l-.2 1.7a5 5 0 0 0-1.7 1l-1.6-.6L1.8 6l1.3 1a5 5 0 0 0 0 2l-1.3 1 1.5 2.6 1.6-.6a5 5 0 0 0 1.7 1l.2 1.7h2.4l.2-1.7a5 5 0 0 0 1.7-1l1.6.6 1.5-2.6-1.3-1A5 5 0 0 0 13 8z"/></svg>';
    var ICONS_CODE = '<svg viewBox="0 0 16 16"><path d="M5.5 4 2 8l3.5 4M10.5 4 14 8l-3.5 4"/></svg>';
    var ICONS_CLOSE = '<svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
    var ICONS_STOP = '<svg viewBox="0 0 16 16"><rect x="4.5" y="4.5" width="7" height="7" rx="1.5"/></svg>';
    var dlg = document.getElementById('ai');
    var canvas = document.getElementById('canvas');

    // Built here rather than in editor.html: the shell page is baked into the wasm
    // binary at link time, this file is not. The header goes into the page's top
    // bar, over the panel it belongs to, so the chrome reads as one bar.
    var headerSlot = document.getElementById('ai-header-slot');
    headerSlot.innerHTML =
        '<button class="titlebtn icon-only" id="ai-toggle" title="Hide the agent panel">' +
          '<svg class="icon" viewBox="0 0 16 16"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '</button>' +
        '<svg class="icon" viewBox="0 0 16 16"><use href="#i-ai"/></svg>' +
        '<span class="name">Agent</span>' +
        '<span id="ai-chip">ready</span>' +
        '<span class="grow"></span>' +
        '<button class="titlebtn" id="ai-chats" title="Your chats with the agent: every one of them is kept on the server">' +
          '<svg viewBox="0 0 16 16"><path d="M3 8a5 5 0 1 0 1.6-3.7"/><path d="M3 3v2.5h2.5"/><path d="M8 5.5V8l2 1.2"/></svg>' +
          '<span class="lbl">Chats</span><i class="dot"></i></button>' +
        '<button class="titlebtn" id="ai-new" title="Start a new chat">' + ICONS_PLUS + ' New</button>' +
        '<button class="titlebtn icon-only" id="ai-gear" title="Key, model, self-review">' + ICONS_GEAR + '</button>' +
        '<button class="titlebtn icon-only" id="ai-dev" title="Debug: steps, thinking, raw events">' + ICONS_CODE + '</button>';

    dlg.innerHTML =
        '<div id="ai-chat"></div>' +
        '<div id="ai-files"><div class="fhead"><span id="ai-files-title"></span></div><div class="flist"></div></div>' +
        '<div id="ai-bar">' +
          '<span class="spin"></span><span id="ai-act">working…</span>' +
          '<span id="ai-meta"></span>' +
          '<button class="ai-btn danger" id="ai-stop">' + ICONS_STOP + ' Stop</button>' +
        '</div>' +
        '<div id="ai-inputrow">' +
          '<div id="ai-composer">' +
            '<div id="ai-attach-list"></div>' +
            '<textarea id="ai-input" rows="1" enterkeyhint="send" placeholder="What should the agent do? For example: add a title label to the scene…"></textarea>' +
            '<div id="ai-controls">' +
              '<button class="ai-pill" id="ai-attach" title="Attach files from your computer">' +
                '<svg viewBox="0 0 16 16"><path d="M11.5 6.5 7 11a2.5 2.5 0 0 1-3.5-3.5l5-5a3.5 3.5 0 0 1 5 5l-5.2 5.2"/></svg>' +
              '</button>' +
              '<input id="ai-attach-input" type="file" multiple style="display:none">' +
              '<span id="ai-model-slot"></span>' +
              '<span id="ai-effort-slot"></span>' +
              '<span id="ai-mode-slot"></span>' +
              '<span class="grow"></span>' +
              '<button id="ai-send" title="Send (Enter)">' +
                '<svg viewBox="0 0 16 16"><path d="M1.7 14.3 15 8 1.7 1.7l2 5.1 6.6 1.2-6.6 1.2z"/></svg>' +
              '</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        // the chats of this working copy, over the conversation (see "chats" below)
        '<div id="ai-chatlist">' +
          '<div class="clhead"><span class="ttl">Chats</span>' +
            '<span class="ai-seg" id="ai-chats-scope"><button data-scope="mine">Mine</button><button data-scope="all">All of this project</button></span>' +
            '<span class="grow"></span>' +
            '<button class="ai-btn" id="ai-chats-new">' + ICONS_PLUS + ' New chat</button>' +
            '<button class="ai-btn icon-only" id="ai-chats-close" title="Back to the conversation">' + ICONS_CLOSE + '</button></div>' +
          '<div class="cllist" id="ai-chats-list"></div>' +
        '</div>' +
        '<div id="ai-modal">' +
          '<div id="ai-settings">' +
            '<div class="sheet-head"><span>Agent settings</span><span class="grow"></span>' +
              '<button class="ai-btn" id="ai-settings-close">Done</button></div>' +
            '<div class="row auth"><span class="lbl">Sign in with</span>' +
              '<span class="ai-seg" id="ai-auth"><button data-auth="key">API key</button>' +
              '<button data-auth="sub">Claude subscription</button></span>' +
              '<span class="grow"></span><span class="keystate" id="ai-keystate"></span></div>' +
            '<div class="row" id="row-key"><span class="lbl">Anthropic key</span>' +
              '<input id="ai-key" class="ai-input" type="password" placeholder="sk-ant-…" spellcheck="false" autocomplete="off"></div>' +
            '<div class="row" id="row-workspace"><span class="lbl">Workspace</span>' +
              '<input id="ai-workspace" class="ai-input" type="text" placeholder="wrkspc_… — for keys scoped to all workspaces" spellcheck="false" autocomplete="off"></div>' +
            '<div class="row" id="row-sub"><span class="lbl">Subscription token</span>' +
              '<input id="ai-oauth" class="ai-input" type="password" placeholder="sk-ant-oat…" spellcheck="false" autocomplete="off"></div>' +
            '<div class="row" id="row-gemini"><span class="lbl">Gemini key</span>' +
              '<input id="ai-gemini" class="ai-input" type="password" placeholder="AIza… — for the image tools" spellcheck="false" autocomplete="off"></div>' +
            '<div class="row"><span class="lbl">Self-review</span>' +
              '<span id="ai-review-slot"></span></div>' +
            '<div class="row"><span class="lbl">Clarify first</span>' +
              '<span id="ai-clarify-slot"></span></div>' +
            // (only where the server can give the agent an editor of its own: hello.ownPages)
            '<div class="row hidden" id="row-own"><span class="lbl">Its own editor</span>' +
              '<span id="ai-own-slot"></span></div>' +
            // its own row: next to the toggle and its sentence it never fitted a narrow panel
            '<div class="row"><span class="lbl">Conversation</span>' +
              '<button class="ai-btn" id="ai-log" title="The whole conversation and its events as JSON">Copy log</button>' +
              '<span class="note">everything said and done, as JSON</span></div>' +
            '<p class="hint" id="hint-key">The key is sent to this server and handed to the Claude Code process; usage is billed to it. ' +
               'Create one at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>.</p>' +
            '<p class="hint" id="hint-sub">Run <code>claude setup-token</code> in a terminal where you are logged in to Claude Code, ' +
               'then paste the token it prints. Work then runs on your Claude subscription instead of API billing. ' +
               'The token is yours: this page never opens a claude.ai login.</p>' +
            '<p class="hint hidden" id="hint-own">With its own editor the agent opens scenes, plays the game and clicks in a hidden ' +
               'instance of the editor and the game, and yours stay as you left them: keep working while it runs. What it changes ' +
               'reaches your editor through the files, and what you save reaches its. Off: it drives this page, and you watch.</p>' +
            '<p class="hint">The Gemini key powers the project\'s image tools (the <code>imagegen</code> MCP server): ' +
               'generating sprites and icons while prototyping, and editing them afterwards. Without it the agent works ' +
               'as usual, only without generated art. Create one at ' +
               '<a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com</a>.</p>' +
          '</div>' +
        '</div>';

    // Inline icons: the page sprite carries file-browser glyphs only, and the
    // window is built here so it can ship its own without a wasm relink.
    var ICON = {
        gear: '<path d="M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/><path d="M13 8a5 5 0 0 0-.1-1l1.3-1-1.5-2.6-1.6.6a5 5 0 0 0-1.7-1L9.2 1H6.8l-.2 1.7a5 5 0 0 0-1.7 1l-1.6-.6L1.8 6l1.3 1a5 5 0 0 0 0 2l-1.3 1 1.5 2.6 1.6-.6a5 5 0 0 0 1.7 1l.2 1.7h2.4l.2-1.7a5 5 0 0 0 1.7-1l1.6.6 1.5-2.6-1.3-1A5 5 0 0 0 13 8z"/>',
        code: '<path d="M5.5 4 2 8l3.5 4M10.5 4 14 8l-3.5 4"/>',
        plus: '<path d="M8 3.5v9M3.5 8h9"/>',
        close: '<path d="M4 4l8 8M12 4l-8 8"/>',
        stop: '<rect x="4.5" y="4.5" width="7" height="7" rx="1.5"/>',
        file: '<path d="M9 2H4.5A1.5 1.5 0 0 0 3 3.5v9A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5V6z"/><path d="M9 2v4h4"/>',
        spark: '<path d="M8 2.5 9.3 6l3.5 1.3L9.3 8.6 8 12.1 6.7 8.6 3.2 7.3 6.7 6z"/>',
        gauge: '<path d="M13 11a5.5 5.5 0 1 0-10 0"/><path d="M8 11 10.5 7"/>',
        shield: '<path d="M8 2 3.5 4v4c0 2.6 1.9 4.8 4.5 5.5 2.6-.7 4.5-2.9 4.5-5.5V4z"/>',
        cpu: '<rect x="4.5" y="4.5" width="7" height="7" rx="1.5"/><path d="M6.5 1.5v2M9.5 1.5v2M6.5 12.5v2M9.5 12.5v2M1.5 6.5h2M1.5 9.5h2M12.5 6.5h2M12.5 9.5h2"/>',
    };
    function icon(name, cls) {
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 16 16');
        if (cls) svg.setAttribute('class', cls);
        svg.innerHTML = ICON[name] || '';
        return svg;
    }
    function iconHtml(name) {
        return '<svg viewBox="0 0 16 16">' + (ICON[name] || '') + '</svg>';
    }

    // ---------- on a phone: a row under the game ----------
    // There (body.handheld, decided in preview-host.js) the panel folds down to its
    // composer, docked under the game. The conversation is a sheet pulled up over
    // the game when asked for, with the header that otherwise sits in the top bar,
    // and what the agent is doing meanwhile is one line above the row. Pulled once
    // more, the sheet takes the whole height (body.ai-tall).
    // On the portal's other tabs there is no game: the sheet is all the frame shows
    // (body.agent-solo), and folding it away is closing it up there.
    var headerHome = headerSlot.parentNode;
    var grabEl = document.createElement('div');
    grabEl.id = 'ai-grab';
    grabEl.title = 'The conversation';
    grabEl.innerHTML = '<span></span>';
    dlg.insertBefore(grabEl, dlg.firstChild);

    var peekEl = document.createElement('div');
    peekEl.id = 'ai-peek';
    peekEl.innerHTML = '<span class="spin"></span><span class="dot"></span><span class="txt"></span>' +
        '<button type="button" class="stop" title="Stop">' + ICONS_STOP + '</button>' +
        '<button type="button" class="x" title="Dismiss">' + ICONS_CLOSE + '</button>';
    dlg.appendChild(peekEl);
    var peekText = peekEl.querySelector('.txt');

    // the game's own two buttons ride in the same row: there is no bar for them here
    var gameBtns = document.createElement('div');
    gameBtns.id = 'ai-game-btns';
    gameBtns.innerHTML =
        '<button type="button" id="ai-restart" title="Restart the game with the current assets">' +
          '<svg viewBox="0 0 16 16"><path d="M13 8a5 5 0 1 1-1.5-3.5M13 2v3h-3"/></svg></button>' +
        '<button type="button" id="ai-full" title="Full screen: the game and nothing else">' +
          '<svg viewBox="0 0 16 16"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/></svg></button>';
    var inputRowEl = document.getElementById('ai-inputrow');
    inputRowEl.insertBefore(gameBtns, inputRowEl.firstChild);
    document.getElementById('ai-restart').onclick = function () { o2Preview.restart(); };
    document.getElementById('ai-full').onclick = function () { o2Preview.setImmersive(true); };

    var sheetBack = document.createElement('div');
    sheetBack.id = 'ai-sheet-back';
    dlg.parentNode.insertBefore(sheetBack, dlg);

    var PLACEHOLDER = 'What should the agent do? For example: add a title label to the scene…';
    var PLACEHOLDER_BUSY = 'Next message — sent when this turn ends…';
    var phoneOn = false, sheetOpen = false, soloOn = false, restHeight = 0;
    var tall = false;
    try { tall = localStorage.getItem('o2ai_sheet_tall') === '1'; } catch (e) {}
    function setTall(on) {
        tall = !!on;
        document.body.classList.toggle('ai-tall', tall);
        try { localStorage.setItem('o2ai_sheet_tall', tall ? '1' : '0'); } catch (e) {}
    }
    document.body.classList.toggle('ai-tall', tall);
    var peekState = null;      // { kind: 'busy' | 'ask' | 'reply' | 'error', text }
    var lastReply = '';

    function isMobile() { return typeof o2Preview !== 'undefined' && o2Preview.isMobile(); }

    function paintPlaceholder() {
        // one line is all a phone has for it
        inputEl.placeholder = !phoneOn ? (running ? PLACEHOLDER_BUSY : PLACEHOLDER)
            : running ? 'Next message…' : sheetOpen ? 'What should the agent do?' : 'Ask the agent…';
    }
    function setPeek(kind, text) {
        // (a chat being replayed says nothing new)
        if (replaying) return;
        // said into an open sheet, it has been read already
        if (sheetOpen && kind !== 'busy' && kind !== 'ask') kind = null;
        peekState = kind ? { kind: kind, text: text || '' } : null;
        paintPeek();
    }
    function paintPeek() {
        var show = phoneOn && !sheetOpen && !!peekState;
        peekEl.className = show ? 'show ' + peekState.kind : '';
        if (show) peekText.textContent = peekState.text;
    }
    // the first sentence of an answer is what it says; the rest is in the sheet
    function firstSentence(md) {
        var t = String(md || '').replace(/```[\s\S]*?```/g, ' ').replace(/[#*`_>|]/g, '').replace(/\s+/g, ' ').trim();
        var m = t.match(/^(.{12,160}?[.!?…])(\s|$)/);
        return m ? m[1] : t.slice(0, 160);
    }
    function setSheet(on) {
        on = !!on && phoneOn;
        if (on === sheetOpen) return;
        sheetOpen = on;
        document.body.classList.toggle('ai-sheet', on);
        dlg.style.transform = '';
        if (on) {
            // read is read: only a turn still running comes back as a line
            if (peekState && peekState.kind !== 'busy' && peekState.kind !== 'ask') peekState = null;
            if (chatEl.querySelector('#ai-empty')) chatEl.scrollTop = 0; else scrollDown();
            if (!modelsLoaded) loadModels();
        } else {
            if (openDd) openDd.close();
            closeSettings();
            openChatList(false);
            inputEl.blur();
        }
        paintPlaceholder();
        paintPeek();
        if (window.__o2LayoutChanged) window.__o2LayoutChanged();
    }
    function applyPhone() {
        var alone = isMobile() && o2Preview.isSolo();
        var on = isMobile() && (o2Preview.isActive() || alone);
        if (on !== phoneOn) {
            phoneOn = on;
            if (on) {
                // the row is always there: a panel folded away on a wide page is unfolded
                document.body.classList.remove('ai-hidden');
                dlg.insertBefore(headerSlot, grabEl.nextSibling);
            } else { setSheet(false); headerHome.appendChild(headerSlot); }
            paintPlaceholder();
            paintPeek();
            measureRest();
        }
        // alone, the sheet is the page; back over a game it starts as the row again
        if (alone !== soloOn) { soloOn = alone; setSheet(alone); }
    }
    // The game ends where the resting row begins. A row grown by a long message or
    // by attachments lies over the game instead of resizing it under the player.
    function measureRest() {
        if (!phoneOn || sheetOpen || inputEl.value || attachments.length) return;
        if (document.activeElement === inputEl || document.documentElement.classList.contains('kb-open')) return;
        var h = Math.round(dlg.getBoundingClientRect().height);
        if (h > 0 && h !== restHeight) document.body.style.setProperty('--ai-rest', (restHeight = h) + 'px');
    }
    // (a frame later: the panes this resizes are observed too)
    if (window.ResizeObserver)
        new ResizeObserver(function () { (window.__o2NativeRaf || requestAnimationFrame)(measureRest); }).observe(dlg);

    peekEl.onclick = function () { setSheet(true); };
    peekEl.querySelector('.x').onclick = function (e) { e.stopPropagation(); setPeek(null); };
    peekEl.querySelector('.stop').onclick = function (e) { e.stopPropagation(); stopBtn.onclick(); };
    sheetBack.onclick = function () { setSheet(false); };

    // the handle: a tap toggles, a pull opens and then takes the whole height, a push down goes back
    (function setupGrab() {
        var drag = null, pulled = false;
        grabEl.addEventListener('pointerdown', function (e) {
            drag = { y: e.clientY, dy: 0, h: dlg.getBoundingClientRect().height };
            pulled = false;
            try { grabEl.setPointerCapture(e.pointerId); } catch (err) {}
            dlg.classList.add('dragging');
        });
        grabEl.addEventListener('pointermove', function (e) {
            if (!drag) return;
            drag.dy = e.clientY - drag.y;
            if (Math.abs(drag.dy) >= 8) pulled = true;
            if (!sheetOpen) return;
            // down it slides (cheap: a long conversation is not laid out again), up it grows
            dlg.style.transform = drag.dy > 0 ? 'translateY(' + drag.dy + 'px)' : '';
            dlg.style.height = drag.dy < 0 && !tall ? (drag.h - drag.dy) + 'px' : '';
        });
        function release(cancelled) {
            if (!drag) return;
            var dy = drag.dy, far = dy > drag.h * .55;
            drag = null;
            dlg.classList.remove('dragging');
            dlg.style.transform = '';
            dlg.style.height = '';
            if (cancelled || !pulled) return;
            if (!sheetOpen) { if (dy < -24) setSheet(true); return; }
            if (dy < -40) setTall(true);
            else if (dy > 70 && tall && !far) setTall(false);
            else if (dy > 70) setSheet(false);
            if (sheetOpen) scrollDown();
        }
        grabEl.addEventListener('pointerup', function () { release(false); });
        grabEl.addEventListener('pointercancel', function () { release(true); });
        // a click of its own, so a finger that lands a little off still finds it
        grabEl.onclick = function () { if (!pulled) setSheet(!sheetOpen); };
    })();

    // ---------- resizing ----------
    // The panel is docked in both modes, so there is one handle: the splitter on
    // its left edge. It writes a CSS variable, which is what the layout is built
    // on, and the width outlives the session.
    (function setupResize() {
        var edgeL = document.createElement('div');
        edgeL.className = 'ai-edge left';
        edgeL.title = 'Drag to resize the panel';
        dlg.appendChild(edgeL);

        var DOCK_MIN = 300;
        function setVar(name, px) { document.body.style.setProperty(name, Math.round(px) + 'px'); }

        // The engine only learns about its canvas from window resizes, and folding
        // or dragging the panel resizes it without one.
        var notifyPending = false;
        function notifyLayout() {
            if (notifyPending) return;
            notifyPending = true;
            (window.__o2NativeRaf || requestAnimationFrame)(function () {
                notifyPending = false;
                window.dispatchEvent(new Event('resize'));
            });
        }
        window.__o2LayoutChanged = notifyLayout;

        // A width kept from a wider window would leave the scene no room at all
        // in this one (and a canvas of no width has nothing to draw or to capture).
        var wanted = 0;
        function fit() {
            if (!window.innerWidth) return;                 // a hidden frame: nothing to measure against
            var most = Math.max(DOCK_MIN, window.innerWidth - 260);
            var next = Math.min(wanted || 420, most);
            var was = document.body.style.getPropertyValue('--ai-dock');
            if (!wanted && next === 420) document.body.style.removeProperty('--ai-dock');
            else setVar('--ai-dock', next);
            if (document.body.style.getPropertyValue('--ai-dock') !== was) notifyLayout();
        }
        function restore() {
            try { wanted = +localStorage.getItem('o2ai_dock') || 0; } catch (e) {}
            fit();
        }
        restore();
        window.addEventListener('resize', fit);

        function drag(el, onMove) {
            el.addEventListener('mousedown', function (e) {
                e.preventDefault();
                e.stopPropagation();
                if (e.button !== 0) return;
                var box = dlg.getBoundingClientRect();
                var start = { x: e.clientX, y: e.clientY, w: box.width, h: box.height };
                document.body.classList.add('ai-resizing');
                function move(ev) { onMove(ev, start); }
                function up() {
                    document.removeEventListener('mousemove', move);
                    document.removeEventListener('mouseup', up);
                    document.body.classList.remove('ai-resizing');
                    wanted = parseInt(document.body.style.getPropertyValue('--ai-dock'), 10) || 0;
                    try { localStorage.setItem('o2ai_dock', wanted || ''); } catch (e) {}
                }
                document.addEventListener('mousemove', move);
                document.addEventListener('mouseup', up);
            });
        }

        // the left edge is the splitter between the work area and the agent
        drag(edgeL, function (ev) {
            setVar('--ai-dock', Math.max(DOCK_MIN, Math.min(window.innerWidth - 260, window.innerWidth - ev.clientX)));
            notifyLayout();
        });
    })();

    var chatEl = document.getElementById('ai-chat');
    var inputEl = document.getElementById('ai-input');
    var sendBtn = document.getElementById('ai-send');
    var stopBtn = document.getElementById('ai-stop');
    var keyEl = document.getElementById('ai-key');
    var keyStateEl = document.getElementById('ai-keystate');
    var workspaceEl = document.getElementById('ai-workspace');
    var oauthEl = document.getElementById('ai-oauth');
    var geminiEl = document.getElementById('ai-gemini');
    var authSeg = document.getElementById('ai-auth');
    var modalEl = document.getElementById('ai-modal');
    var devBtn = document.getElementById('ai-dev');
    var gearBtn = document.getElementById('ai-gear');
    var chipEl = document.getElementById('ai-chip');
    var barEl = document.getElementById('ai-bar');
    var actEl = document.getElementById('ai-act');
    var metaEl = document.getElementById('ai-meta');
    var filesEl = document.getElementById('ai-files');
    var filesTitle = document.getElementById('ai-files-title');
    var filesList = filesEl.querySelector('.flist');
    var chatListEl = document.getElementById('ai-chatlist');
    var chatsBtn = document.getElementById('ai-chats');

    // ---------- a dropdown of our own: no native select anywhere ----------
    var openDd = null;
    document.addEventListener('mousedown', function (e) {
        if (openDd && !openDd.root.contains(e.target)) openDd.close();
    });
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape' || !dlg.classList.contains('open')) return;
        // in full screen the panel is not there to be closed: Esc is the way out of that
        if (typeof o2Preview !== 'undefined' && o2Preview.isImmersive()) return;
        // innermost thing first: a menu, then the settings sheet, then the window
        if (openDd) { openDd.close(); e.stopPropagation(); return; }
        if (modalEl.classList.contains('open')) { closeSettings(); e.stopPropagation(); return; }
        if (chatListEl.classList.contains('open')) { openChatList(false); e.stopPropagation(); return; }
        closeDlg();
    }, true);

    function dropdown(opts) {
        var root = document.createElement('div');
        root.className = 'ai-dd ' + (opts.cls || '') + ' ' + (opts.up ? 'up' : 'down') + (opts.right ? ' right' : '');
        var val = document.createElement('div');
        val.className = 'val';
        val.title = opts.title || '';
        if (opts.icon) val.appendChild(icon(opts.icon));
        var cur = document.createElement('span');
        cur.className = 'cur';
        val.appendChild(cur);
        var caret = document.createElement('span');
        caret.className = 'caret';
        val.appendChild(caret);
        var menu = document.createElement('div');
        menu.className = 'menu';
        root.appendChild(val);
        root.appendChild(menu);

        var items = [], value = null, api;
        function paint() {
            var it = items.filter(function (i) { return i.value === value; })[0];
            var text = it ? (it.short || it.label) : (opts.empty || '—');
            if (opts.short && value) text = opts.short(value);
            cur.textContent = (opts.prefix || '') + text;
            val.title = it ? (it.title || it.label) : (opts.title || '');
            menu.querySelectorAll('.opt').forEach(function (el) {
                el.classList.toggle('sel', el.dataset.value === value);
            });
        }
        function build() {
            menu.innerHTML = '';
            items.forEach(function (it) {
                if (it.separator) { var sp = document.createElement('div'); sp.className = 'sep'; menu.appendChild(sp); return; }
                var o = document.createElement('div');
                o.className = 'opt';
                o.dataset.value = it.value;
                var label = document.createElement('span');
                label.textContent = it.label;
                o.appendChild(label);
                if (it.sub) {
                    var sub = document.createElement('span');
                    sub.className = 'sub';
                    sub.textContent = it.sub;
                    o.appendChild(sub);
                }
                o.onclick = function () {
                    api.close();
                    if (it.action) { it.action(api); return; }
                    api.set(it.value);
                    if (opts.onChange) opts.onChange(it.value, it);
                };
                menu.appendChild(o);
            });
            paint();
        }
        // The menu takes the room there is between its button and the edge of the panel (which clips it), not a
        // fixed height: a long list - the models - shows whole where it fits and says so where it does not
        function fit() {
            var box = dlg.getBoundingClientRect(), at = val.getBoundingClientRect();
            var room = opts.up ? at.top - Math.max(box.top, 0) : Math.min(box.bottom, window.innerHeight) - at.bottom;
            menu.style.maxHeight = Math.max(120, Math.floor(room - 30)) + 'px';
            var sel = menu.querySelector('.opt.sel');
            if (sel) menu.scrollTop = Math.max(0, sel.offsetTop - menu.clientHeight / 2);
            more();
        }
        function more() {
            root.classList.toggle('more-up', menu.scrollTop > 2);
            root.classList.toggle('more-down', menu.scrollTop + menu.clientHeight < menu.scrollHeight - 2);
        }
        menu.addEventListener('scroll', more, { passive: true });
        val.onclick = function () {
            if (root.classList.contains('open')) { api.close(); return; }
            if (openDd) openDd.close();
            root.classList.add('open');
            openDd = api;
            fit();
        };
        api = {
            root: root,
            close: function () { root.classList.remove('open'); if (openDd === api) openDd = null; },
            set: function (v) { value = v; paint(); },
            get: function () { return value; },
            options: function (list) { items = list; build(); if (root.classList.contains('open')) fit(); },
            add: function (it) { items.push(it); build(); },
            has: function (v) { return items.some(function (i) { return i.value === v; }); },
            el: root,
        };
        api.options(opts.items || []);
        if (opts.value !== undefined) api.set(opts.value);
        return api;
    }

    function toggle(labelText, checked, onChange) {
        var root = document.createElement('div');
        root.className = 'ai-check' + (checked ? ' on' : '');
        var box = document.createElement('span');
        box.className = 'box';
        root.appendChild(box);
        if (labelText) root.appendChild(document.createTextNode(labelText));
        root.onclick = function () {
            root.classList.toggle('on');
            onChange(root.classList.contains('on'));
        };
        return { el: root, get: function () { return root.classList.contains('on'); },
                 set: function (v) { root.classList.toggle('on', !!v); } };
    }

    // file names in the answer open the file in the assets browser
    chatEl.addEventListener('click', function (e) {
        var el = e.target.closest('.ai-file');
        if (!el || !window.__o2RevealAsset) return;
        window.__o2RevealAsset(el.dataset.path);
    });

    var DEFAULT_MODEL = 'claude-opus-5';
    var FALLBACK_MODELS = ['claude-opus-5', 'claude-sonnet-5', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-haiku-4-5'];

    // settings live in cookies so they survive across tabs and sessions
    // (localStorage is kept as a fallback for values saved earlier)
    function setSetting(name, value) {
        document.cookie = name + '=' + encodeURIComponent(value) +
            ';path=' + (window.o2Base || '/') + ';max-age=' + (365 * 24 * 3600) + ';SameSite=Lax';
        try { localStorage.setItem(name, value); } catch (e) {}
    }
    function getSetting(name) {
        var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
        if (m) return decodeURIComponent(m[1]);
        try { return localStorage.getItem(name) || ''; } catch (e) { return ''; }
    }

    keyEl.value = getSetting('o2ai_claude_key');
    workspaceEl.value = getSetting('o2ai_workspace');
    oauthEl.value = getSetting('o2ai_oauth');
    geminiEl.value = getSetting('o2ai_gemini');
    var authMode = getSetting('o2ai_auth') || (oauthEl.value ? 'sub' : 'key');
    var devMode = getSetting('o2ai_dev') === '1';

    // effort and permissions sit next to Send, where they are decided
    // model, effort and permissions sit together next to Send, where a turn
    // is actually decided; the model list is a list, never a filter
    var modelDd = dropdown({
        cls: 'pill', up: true, icon: 'cpu', title: 'Claude model', empty: DEFAULT_MODEL,
        short: function (v) { return String(v).replace(/^claude-/, ''); },
        value: getSetting('o2ai_claude_model') || DEFAULT_MODEL,
        onChange: function (v) { setSetting('o2ai_claude_model', v); },
    });
    document.getElementById('ai-model-slot').appendChild(modelDd.el);

    var effortDd = dropdown({
        cls: 'pill', up: true, icon: 'gauge', title: 'Reasoning effort',
        items: ['low', 'medium', 'high', 'xhigh', 'max'].map(function (e) { return { value: e, label: e }; }),
        value: getSetting('o2ai_effort') || 'high',
        onChange: function (v) { setSetting('o2ai_effort', v); },
    });
    document.getElementById('ai-effort-slot').appendChild(effortDd.el);

    var MODES = [
        { value: 'acceptEdits', label: 'edit files and drive the editor', short: 'edits' },
        { value: 'default', label: 'ask before everything', short: 'ask' },
        { value: 'plan', label: 'plan only, no changes', short: 'plan' },
        { value: 'bypassPermissions', label: 'never ask', short: 'no prompts' },
    ];
    var modeDd = dropdown({
        cls: 'pill', up: true, icon: 'shield',
        title: 'What the agent may do without asking (reading the scene is never asked)',
        items: MODES, value: getSetting('o2ai_mode') || 'acceptEdits',
        onChange: function (v) { setSetting('o2ai_mode', v); },
    });
    document.getElementById('ai-mode-slot').appendChild(modeDd.el);

    var reviewToggle = toggle('the agent reviews its own run afterwards', getSetting('o2ai_review') === '1',
                              function (v) { setSetting('o2ai_review', v ? '1' : '0'); });
    document.getElementById('ai-review-slot').appendChild(reviewToggle.el);

    // On by default: a general request gets a few questions with ready answers before the work starts
    var clarifyToggle = toggle('the agent asks about a general request before starting on it', getSetting('o2ai_clarify') !== '0',
                               function (v) { setSetting('o2ai_clarify', v ? '1' : '0'); });
    document.getElementById('ai-clarify-slot').appendChild(clarifyToggle.el);

    // Whose hands: the agent's own hidden editor (the default), or this page as it used to be. The person's choice, kept
    // with their other settings and sent with every message (start: ownEditor) - the server routes that turn's editor tools.
    var ownToggle = toggle('the agent works in its own hidden editor — yours stays yours', getSetting('o2ai_own_editor') !== '0',
                           function (v) { setSetting('o2ai_own_editor', v ? '1' : '0'); });
    document.getElementById('ai-own-slot').appendChild(ownToggle.el);

    // `claude setup-token` prints the token wrapped across terminal lines, so a
    // copy of it arrives with newlines inside — which the API rejects as invalid
    function cleanSecret(v) {
        return String(v == null ? '' : v).replace(/\s+/g, '').replace(/^["']+|["']+$/g, '');
    }
    function tidy(el) {
        var v = cleanSecret(el.value);
        if (el.value !== v) el.value = v;
        return v;
    }
    function setKeyState(kind, text) {
        keyStateEl.className = 'keystate ' + kind;
        keyStateEl.textContent = text;
    }
    function credential() {
        return cleanSecret(authMode === 'sub' ? oauthEl.value : keyEl.value);
    }
    function paintKeyState() {
        var local = /localhost|127\.0\.0\.1/.test(location.hostname);
        if (credential()) setKeyState('ok', 'saved');
        else setKeyState(local ? 'ok' : 'missing', local ? 'local: host credentials' : 'credential required');
    }
    function paintAuthMode() {
        authSeg.querySelectorAll('button').forEach(function (b) {
            b.classList.toggle('on', b.dataset.auth === authMode);
        });
        document.getElementById('row-key').classList.toggle('hidden', authMode !== 'key');
        document.getElementById('row-workspace').classList.toggle('hidden', authMode !== 'key');
        document.getElementById('row-sub').classList.toggle('hidden', authMode !== 'sub');
        document.getElementById('hint-key').classList.toggle('hidden', authMode !== 'key');
        document.getElementById('hint-sub').classList.toggle('hidden', authMode !== 'sub');
        paintKeyState();
    }
    authSeg.querySelectorAll('button').forEach(function (b) {
        b.onclick = function () {
            authMode = b.dataset.auth;
            setSetting('o2ai_auth', authMode);
            paintAuthMode();
            loadModels();
        };
    });
    paintAuthMode();

    keyEl.onchange = function () { setSetting('o2ai_claude_key', tidy(keyEl)); paintKeyState(); loadModels(); };
    workspaceEl.onchange = function () { setSetting('o2ai_workspace', tidy(workspaceEl)); loadModels(); };
    oauthEl.onchange = function () { setSetting('o2ai_oauth', tidy(oauthEl)); paintKeyState(); loadModels(); };
    // the image tools are the project's own, so this key rides along with the run
    geminiEl.onchange = function () { setSetting('o2ai_gemini', tidy(geminiEl)); };

    function openSettings() {
        if (phoneOn) setSheet(true);
        openChatList(false);
        modalEl.classList.add('open');
        gearBtn.classList.add('on');
        if (!modelsLoaded) loadModels();
    }
    function closeSettings() {
        modalEl.classList.remove('open');
        gearBtn.classList.remove('on');
    }
    gearBtn.onclick = function () {
        if (modalEl.classList.contains('open')) closeSettings(); else openSettings();
    };
    document.getElementById('ai-settings-close').onclick = closeSettings;
    modalEl.onclick = function (e) { if (e.target === modalEl) closeSettings(); };
    // a missing key is the one thing worth opening the sheet for on its own — but
    // not over a game on a phone: there it waits for the first message (runAgent)
    // Not in the portal's anonymous demo: a visitor came to see the editor, and a dialog asking for an API key
    // over it is the wrong first thing to show - it opens when they first try to send, like on a phone.
    var anonymousDemo = /^\/demo\/editor\//.test(location.pathname);
    if (!credential() && !/localhost|127\.0\.0\.1/.test(location.hostname) && !isMobile() && !anonymousDemo) openSettings();

    function applyDev() {
        devBtn.classList.toggle('on', devMode);
        chatEl.classList.toggle('dev', devMode);
        chatEl.querySelectorAll('.ai-step').forEach(function (s) {
            if (s.dataset.dev === '1') s.style.display = devMode ? '' : 'none';
        });
    }
    devBtn.onclick = function () {
        devMode = !devMode;
        setSetting('o2ai_dev', devMode ? '1' : '0');
        applyDev();
    };

    // ---------- model list ----------
    var modelsLoaded = false;
    function fillModels(names) {
        var items = names.map(function (n) { return { value: n, label: n }; });
        // a model typed by hand stays in the list instead of vanishing
        var cur = modelDd.get();
        if (cur && names.indexOf(cur) < 0) items.unshift({ value: cur, label: cur, sub: 'custom' });
        items.push({ separator: true });
        items.push({ value: '__custom__', label: 'Enter manually…', action: function () {
            var v = window.prompt('Model id', modelDd.get() || DEFAULT_MODEL);
            if (!v) return;
            v = v.trim();
            modelDd.add({ value: v, label: v, sub: 'custom' });
            modelDd.set(v);
            setSetting('o2ai_claude_model', v);
        } });
        modelDd.options(items);
        modelDd.set(cur || DEFAULT_MODEL);
    }
    function loadModels() {
        var headers = {};
        if (authMode === 'sub') {
            if (cleanSecret(oauthEl.value)) headers['X-Anthropic-Oauth'] = cleanSecret(oauthEl.value);
        } else {
            if (cleanSecret(keyEl.value)) headers['X-Anthropic-Key'] = cleanSecret(keyEl.value);
            if (cleanSecret(workspaceEl.value)) headers['X-Anthropic-Workspace'] = cleanSecret(workspaceEl.value);
        }
        return fetch(o2Base + '/api/agent/models', { headers: headers })
            .then(function (r) { return r.json(); })
            .then(function (j) {
                fillModels(j.models || FALLBACK_MODELS);
                modelsLoaded = j.source === 'api';
                // a background fetch never reopens a sheet the user closed:
                // it only marks the field it is complaining about
                if (j.error && /workspace/i.test(j.error)) {
                    workspaceEl.style.borderColor = '#C86A6A';
                    workspaceEl.title = j.error;
                    setKeyState('missing', 'workspace id required');
                } else {
                    workspaceEl.style.borderColor = '';
                    workspaceEl.title = '';
                    paintKeyState();
                }
            })
            .catch(function () { fillModels(FALLBACK_MODELS); });
    }
    fillModels(FALLBACK_MODELS);

    var running = false;

    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    // the conversation is followed only while the reader is at its end
    var pinned = true;
    chatEl.addEventListener('scroll', function () {
        pinned = chatEl.scrollHeight - chatEl.scrollTop - chatEl.clientHeight < 70;
    });
    function scrollDown(force) { if (force || pinned) { pinned = true; chatEl.scrollTop = chatEl.scrollHeight; } }

    // ---------- syntax colouring ----------
    // A tokenizer of our own: the shell has no build step and loads nothing from a
    // CDN. Each scanner walks the source once, left to right, and only decides which
    // class wraps a piece — the text itself reaches the page through esc() and
    // nowhere else. No token crosses a line end, so coloured code can be cut into lines.
    var HL_MAX = 200 * 1024;                        // above this a block stays plain
    var CODE_LINES = 400, CODE_CHARS = 64 * 1024;   // drawn at once; the rest waits behind "show all"

    function esc(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function wordSet(s) {
        var o = Object.create(null);
        s.split(' ').forEach(function (w) { o[w] = 1; });
        return o;
    }
    function hlOut(src) {
        var out = [], from = 0;
        var api = {
            skip: function (to) { if (to > from) { out.push(esc(src.slice(from, to))); from = to; } },
            put: function (cls, at, to) {
                api.skip(at);
                var s = src.slice(at, to);
                if (s.indexOf('\n') < 0) out.push('<span class="hl-' + cls + '">' + esc(s) + '</span>');
                else out.push(s.split('\n').map(function (l) {
                    return l ? '<span class="hl-' + cls + '">' + esc(l) + '</span>' : '';
                }).join('\n'));
                from = to;
            },
            done: function () { api.skip(src.length); return out.join(''); },
        };
        return api;
    }

    var RE_IDENT = /[A-Za-z_$][\w$]*/y;
    var RE_NUM = /0[xX][\da-fA-F]+|(?:\d[\d_]*\.?\d*|\.\d+)(?:[eE][+-]?\d+)?[a-zA-Z%]*/y;
    var RE_PRE = /#[ \t]*[A-Za-z_]+/y;
    var LANGS = {
        js: { lines: ['//'], block: ['/*', '*/'], quotes: '"\'`', pascal: true,
              kw: wordSet('async await break case catch class const continue debugger default delete do else export extends ' +
                          'finally for from function get if import in instanceof let new of return set static switch throw try ' +
                          'typeof var void while with yield interface type enum implements declare readonly public private ' +
                          'protected as namespace'),
              lit: wordSet('true false null undefined NaN Infinity this super arguments'),
              types: wordSet('string number boolean any unknown never object symbol bigint') },
        json: { lines: ['//'], block: ['/*', '*/'], quotes: '"', keys: true, kw: wordSet(''), lit: wordSet('true false null') },
        cpp: { lines: ['//'], block: ['/*', '*/'], quotes: '"\'', pre: true, macros: true, pascal: true,
               kw: wordSet('alignas alignof and auto break case catch class const constexpr const_cast continue decltype default ' +
                           'delete do dynamic_cast else enum explicit export extern final for friend goto if inline mutable ' +
                           'namespace new noexcept not operator or override private protected public register reinterpret_cast ' +
                           'return sizeof static static_assert static_cast struct switch template this throw try typedef typeid ' +
                           'typename union using virtual volatile while co_await co_return co_yield concept requires ' +
                           'uniform varying attribute precision highp mediump lowp in out inout'),
               lit: wordSet('true false nullptr NULL'),
               types: wordSet('void bool char short int long float double signed unsigned size_t int8_t int16_t int32_t int64_t ' +
                              'uint8_t uint16_t uint32_t uint64_t wchar_t char16_t char32_t vec2 vec3 vec4 mat2 mat3 mat4 ' +
                              'sampler2D samplerCube') },
        py: { lines: ['#'], quotes: '"\'', triple: true, deco: true, pascal: true,
              kw: wordSet('and as assert async await break class continue def del elif else except finally for from global if ' +
                          'import in is lambda nonlocal not or pass raise return try while with yield match case'),
              lit: wordSet('True False None self cls'),
              types: wordSet('str int float bool bytes list dict tuple set object') },
        conf: { lines: ['#'], block: ['/*', '*/'], quotes: '"\'', keyColon: true, kw: wordSet(''),
                lit: wordSet('true false null yes no on off ON OFF TRUE FALSE') },
    };

    function hlCode(src, L) {
        var o = hlOut(src), n = src.length, i = 0, lineStart = true, m, j, k;
        while (i < n) {
            var ch = src.charAt(i);
            if (ch === '\n') { lineStart = true; i++; continue; }
            if (ch === ' ' || ch === '\t' || ch === '\r') { i++; continue; }
            var atStart = lineStart;
            lineStart = false;
            if (L.pre && atStart && ch === '#') {
                RE_PRE.lastIndex = i;
                if ((m = RE_PRE.exec(src))) {
                    o.put('m', i, i + m[0].length);
                    i += m[0].length;
                    if (/include|import/.test(m[0])) {
                        while (i < n && src.charAt(i) === ' ') i++;
                        j = src.indexOf('>', i);
                        k = src.indexOf('\n', i);
                        if (src.charAt(i) === '<' && j > 0 && (k < 0 || j < k)) { o.put('s', i, j + 1); i = j + 1; }
                    }
                    continue;
                }
            }
            var isLine = false;
            for (k = 0; L.lines && k < L.lines.length; k++) if (src.startsWith(L.lines[k], i)) isLine = true;
            if (isLine) {
                j = src.indexOf('\n', i);
                if (j < 0) j = n;
                o.put('c', i, j); i = j;
                continue;
            }
            if (L.block && src.startsWith(L.block[0], i)) {
                j = src.indexOf(L.block[1], i + L.block[0].length);
                j = j < 0 ? n : j + L.block[1].length;
                o.put('c', i, j); i = j;
                continue;
            }
            if (L.quotes.indexOf(ch) >= 0) {
                if (L.triple && src.startsWith(ch + ch + ch, i)) {
                    j = src.indexOf(ch + ch + ch, i + 3);
                    j = j < 0 ? n : j + 3;
                } else {
                    for (j = i + 1; j < n; j++) {
                        var c = src.charAt(j);
                        if (c === '\\') { j++; continue; }
                        if (c === ch) { j++; break; }
                        if (c === '\n' && ch !== '`') break;
                    }
                    if (j > n) j = n;
                }
                var cls = 's';
                if (L.keys) {
                    k = j;
                    while (k < n && (src.charAt(k) === ' ' || src.charAt(k) === '\t')) k++;
                    if (src.charAt(k) === ':') cls = 'p';
                }
                o.put(cls, i, j); i = j;
                continue;
            }
            var next = src.charAt(i + 1);
            if ((ch >= '0' && ch <= '9') || (ch === '.' && next >= '0' && next <= '9')) {
                RE_NUM.lastIndex = i;
                if ((m = RE_NUM.exec(src)) && m[0]) { o.put('n', i, i + m[0].length); i += m[0].length; continue; }
            }
            if (L.deco && atStart && ch === '@') {
                RE_IDENT.lastIndex = i + 1;
                if ((m = RE_IDENT.exec(src))) { o.put('m', i, i + 1 + m[0].length); i += 1 + m[0].length; continue; }
            }
            RE_IDENT.lastIndex = i;
            if ((m = RE_IDENT.exec(src))) {
                var w = m[0], e = i + w.length, as = '';
                if (L.kw[w]) as = 'k';
                else if (L.lit && L.lit[w]) as = 'l';
                else if (L.types && L.types[w]) as = 't';
                else if (L.macros && w.length > 2 && w === w.toUpperCase() && /^[A-Z]/.test(w)) as = 'm';
                else {
                    k = e;
                    while (k < n && src.charAt(k) === ' ') k++;
                    var after = src.charAt(k);
                    if (after === '(') as = 'f';
                    else if (L.keyColon && atStart && (after === ':' || after === '=')) as = 'p';
                    else if (L.pascal && /^[A-Z]/.test(w) && /[a-z]/.test(w)) as = 't';
                }
                if (as) o.put(as, i, e);
                i = e;
                continue;
            }
            i++;
        }
        return o.done();
    }

    var SH_KW = wordSet('if then elif else fi for while until do done case esac in function select time');
    var SH_KEEP = wordSet('then else elif do time if while until');      // a command follows these
    var RE_SH_WORD = /[^\s|&;()<>"'`$\\↵]+/y, RE_SH_VAR = /\$(?:\{[^}\n]{0,200}\}|[A-Za-z_]\w*|[0-9?#@*!$-])/y;
    function hlShell(src) {
        var o = hlOut(src), n = src.length, i = 0, cmd = true, m, j;
        while (i < n) {
            var ch = src.charAt(i), prev = i ? src.charAt(i - 1) : '\n';
            var wordStart = prev === '\n' || prev === ' ' || prev === '\t' || prev === '(' || prev === ';' || prev === '|' || prev === '&';
            if (ch === '\n' || ch === '↵') { cmd = true; i++; continue; }
            if (ch === ' ' || ch === '\t' || ch === '\r') { i++; continue; }
            if (ch === '\\') { i += 2; continue; }
            if (ch === '#' && wordStart) {
                j = src.indexOf('\n', i);
                if (j < 0) j = n;
                o.put('c', i, j); i = j;
                continue;
            }
            if (ch === '$' && prev === '\n' && src.charAt(i + 1) === ' ') { o.put('c', i, i + 1); i += 2; cmd = true; continue; }
            if (ch === "'") {
                j = src.indexOf("'", i + 1);
                j = j < 0 ? n : j + 1;
                o.put('s', i, j); i = j; cmd = false;
                continue;
            }
            if (ch === '"') {
                for (j = i + 1; j < n; j++) {
                    if (src.charAt(j) === '\\') { j++; continue; }
                    if (src.charAt(j) === '"') { j++; break; }
                }
                if (j > n) j = n;
                o.put('s', i, j); i = j; cmd = false;
                continue;
            }
            if (ch === '$') {
                RE_SH_VAR.lastIndex = i;
                if ((m = RE_SH_VAR.exec(src))) { o.put('v', i, i + m[0].length); i += m[0].length; cmd = false; continue; }
                if (src.charAt(i + 1) === '(') { i += 2; cmd = true; continue; }
                i++;
                continue;
            }
            if (ch === '|' || ch === ';' || ch === '(' || ch === '`' || ch === '&' || ch === '{') {
                // a redirect (2>&1, &>) is not a new command
                cmd = !(ch === '&' && (prev === '>' || src.charAt(i + 1) === '>'));
                i++;
                continue;
            }
            RE_SH_WORD.lastIndex = i;
            if (!(m = RE_SH_WORD.exec(src))) { i++; continue; }
            var w = m[0], e = i + w.length, eq = w.indexOf('=');
            if (cmd && eq > 0 && /^[A-Za-z_]\w*$/.test(w.slice(0, eq))) o.put('v', i, i + eq);
            else if (cmd && SH_KW[w]) { o.put('k', i, e); cmd = !!SH_KEEP[w]; }
            else if (cmd) { o.put('f', i, e); cmd = false; }
            else if (wordStart && ch === '-' && w.length > 1) o.put('o', i, eq > 0 ? i + eq : e);
            else if (wordStart && /^\d+(\.\d+)?$/.test(w)) o.put('n', i, e);
            i = e;
        }
        return o.done();
    }

    // a line is a whole row here: the colour runs the full width of the block
    function hlRows(src, classify) {
        return src.split('\n').map(function (l) {
            var cls = classify(l);
            return '<span class="hl-row' + (cls ? ' hl-' + cls : '') + '">' + esc(l) + '\n</span>';
        }).join('');
    }
    function hlDiff(src) {
        return hlRows(src, function (l) {
            if (/^(diff |index |--- |\+\+\+ |Index: |={5,}|rename |similarity |new file|deleted file)/.test(l)) return 'meta';
            if (l.indexOf('@@') === 0) return 'hunk';
            if (l.charAt(0) === '+') return 'add';
            if (l.charAt(0) === '-') return 'del';
            return '';
        });
    }
    function hlLog(src) {
        return hlRows(src, function (l) {
            if (/\b(error|exception|fatal|failed|failure|assert(ion)?|undefined reference|traceback)\b/i.test(l) &&
                !/\b0 (errors?|failed|failures)\b/i.test(l)) return 'err';
            if (/\bwarn(ing)?s?\b/i.test(l) && !/\b0 warnings?\b/i.test(l)) return 'warn';
            return '';
        });
    }
    // grep -n output: where it was found, then what
    var RE_GREP = /^([^\s:][^:\n]*?)([:-])(\d+)\2/;
    function hlGrep(src) {
        return src.split('\n').map(function (l) {
            var m = l.length < 2000 && RE_GREP.exec(l);
            if (!m) return esc(l);
            return '<span class="hl-p">' + esc(m[1]) + '</span>' + esc(m[2]) + '<span class="hl-n">' + m[3] + '</span>' +
                   esc(m[2]) + esc(l.slice(m[0].length));
        }).join('\n');
    }
    var RE_XML_NAME = /[A-Za-z_:][\w:.-]*/y;
    function hlXml(src) {
        var o = hlOut(src), n = src.length, i = 0, m, j;
        while (i < n) {
            j = src.indexOf('<', i);
            if (j < 0) break;
            i = j;
            if (src.startsWith('<!--', i)) {
                j = src.indexOf('-->', i + 4);
                j = j < 0 ? n : j + 3;
                o.put('c', i, j); i = j;
                continue;
            }
            if (src.startsWith('<![CDATA[', i)) {
                j = src.indexOf(']]>', i);
                i = j < 0 ? n : j + 3;
                continue;
            }
            var c1 = src.charAt(i + 1), open = i;
            i += c1 === '/' || c1 === '?' || c1 === '!' ? 2 : 1;
            RE_XML_NAME.lastIndex = i;
            if (!(m = RE_XML_NAME.exec(src))) continue;
            i += m[0].length;
            o.put('g', open, i);
            while (i < n) {                                 // attributes, up to the closing bracket
                var ch = src.charAt(i);
                if (ch === '>') { o.put('g', i, i + 1); i++; break; }
                if ((ch === '/' || ch === '?') && src.charAt(i + 1) === '>') { o.put('g', i, i + 2); i += 2; break; }
                if (ch === '<') break;
                if (ch === '"' || ch === "'") {
                    j = src.indexOf(ch, i + 1);
                    j = j < 0 ? n : j + 1;
                    o.put('s', i, j); i = j;
                    continue;
                }
                RE_XML_NAME.lastIndex = i;
                if ((m = RE_XML_NAME.exec(src))) { o.put('a', i, i + m[0].length); i += m[0].length; continue; }
                i++;
            }
        }
        return o.done();
    }

    var LANG_ALIAS = {
        js: 'js', javascript: 'js', jsx: 'js', mjs: 'js', cjs: 'js', ts: 'js', tsx: 'js', typescript: 'js',
        json: 'json', json5: 'json', jsonc: 'json', scn: 'json', proto: 'json', meta: 'json', atlas: 'json', anim: 'json',
        pipeline: 'json', fntstyle: 'json', mat: 'json',
        cpp: 'cpp', 'c++': 'cpp', cxx: 'cpp', cc: 'cpp', c: 'cpp', h: 'cpp', hpp: 'cpp', hh: 'cpp', hxx: 'cpp', inl: 'cpp',
        objc: 'cpp', mm: 'cpp', glsl: 'cpp', frag: 'cpp', vert: 'cpp', metal: 'cpp', hlsl: 'cpp', java: 'cpp', cs: 'cpp', csharp: 'cpp',
        sh: 'sh', bash: 'sh', shell: 'sh', zsh: 'sh', console: 'sh', terminal: 'sh', shellscript: 'sh',
        py: 'py', python: 'py', python3: 'py',
        diff: 'diff', patch: 'diff',
        xml: 'xml', html: 'xml', htm: 'xml', svg: 'xml', xhtml: 'xml', plist: 'xml', vcxproj: 'xml',
        yaml: 'conf', yml: 'conf', toml: 'conf', ini: 'conf', cfg: 'conf', conf: 'conf', cmake: 'conf', dockerfile: 'conf',
        env: 'conf', properties: 'conf', css: 'conf', scss: 'conf',
        log: 'log', grep: 'grep',
    };
    var LANG_LABEL = { js: 'JavaScript', json: 'JSON', cpp: 'C++', sh: 'Shell', py: 'Python', diff: 'Diff', xml: 'XML',
                       conf: 'Config', log: 'Log', grep: 'Matches' };
    var INFO_LABEL = { ts: 'TypeScript', tsx: 'TypeScript', typescript: 'TypeScript', c: 'C', h: 'C++ header', hpp: 'C++ header',
                       glsl: 'GLSL', frag: 'GLSL', vert: 'GLSL', metal: 'Metal', hlsl: 'HLSL', java: 'Java', cs: 'C#', csharp: 'C#',
                       html: 'HTML', svg: 'SVG', yaml: 'YAML', yml: 'YAML', toml: 'TOML', ini: 'INI', cmake: 'CMake', css: 'CSS',
                       scn: 'Scene · JSON', proto: 'Prototype · JSON', meta: 'Meta · JSON', console: 'Console', objc: 'Objective-C',
                       mm: 'Objective-C++', dockerfile: 'Dockerfile' };
    function langOf(info) { return LANG_ALIAS[String(info || '').toLowerCase()] || ''; }
    function langOfPath(path) {
        var m = /\.([A-Za-z0-9+]+)$/.exec(String(path || ''));
        if (m) return langOf(m[1]);
        return /(^|\/)CMakeLists\.txt$|(^|\/)Dockerfile$/.test(String(path)) ? 'conf' : '';
    }
    function langLabel(info, lang) {
        var key = String(info || '').toLowerCase();
        return INFO_LABEL[key] || LANG_LABEL[lang] || (info ? String(info).slice(0, 24) : 'text');
    }
    function guessLang(src) {
        var head = src.slice(0, 2000), t = head.replace(/^\s+/, '');
        if (/^(diff --git |--- \S|Index: |@@ -\d)/m.test(head) && /^[+-]/m.test(head)) return 'diff';
        if ((/^[{\[]/.test(t) && /"\s*:/.test(head)) || /^\[\s*[\[{"\d]/.test(t)) return 'json';
        if (/^<[?!A-Za-z]/.test(t)) return 'xml';
        if (/^\s*#\s*(include|pragma|define|ifndef|ifdef)\b|\b(CLASS_META|SERIALIZABLE|IOBJECT|nullptr)\b|\bstd::|\w::\w+\(/m.test(head)) return 'cpp';
        if (/^\s*(def \w+\(|class \w+.*:\s*$|import \w+\s*$|from [\w.]+ import )/m.test(head)) return 'py';
        if (/^\s*(\$ |#!\/bin\/|#!\/usr\/bin\/env (ba)?sh|(sudo|cd|ls|git|npm|npx|node|cmake|ctest|curl|mkdir|rm|cp|mv|echo|export|python3?|pip3?|docker|cat|grep|chmod|brew|apt|make) )/m.test(head)) return 'sh';
        if (/\b(function|const|let|var|require\(|console\.log|extends o2\.|new \w+\()|=>/.test(head)) return 'js';
        return '';
    }
    function highlight(src, lang) {
        if (!lang || src.length > HL_MAX) return esc(src);
        try {
            if (lang === 'sh') return hlShell(src);
            if (lang === 'diff') return hlDiff(src);
            if (lang === 'log') return hlLog(src);
            if (lang === 'grep') return hlGrep(src);
            if (lang === 'xml') return hlXml(src);
            return LANGS[lang] ? hlCode(src, LANGS[lang]) : esc(src);
        } catch (e) { return esc(src); }
    }
    // one line of code for a tool row: never more than `max` characters of it
    function hlLine(src, lang, max) {
        var s = String(src == null ? '' : src).replace(/\s*\n\s*/g, ' ↵ ').replace(/[ \t]+/g, ' ').trim();
        if (s.length > max) s = s.slice(0, max) + '…';
        return highlight(s, lang === 'diff' || lang === 'log' ? '' : lang);
    }

    // ---------- code blocks ----------
    // block: { src, lang, label, numbers?, err? }. The source rides on the element
    // (box._block), so Copy and "show all" have the whole text even when part is drawn.
    function codeInner(block, all) {
        var src = block.src, total = 1, at = -1, shown = 0, end = src.length;
        while ((at = src.indexOf('\n', at + 1)) >= 0) {
            total++;
            if (!all && total === CODE_LINES + 1) end = at;
        }
        if (!all && end > CODE_CHARS) end = CODE_CHARS;
        var cut = !all && end < src.length;
        var text = cut ? src.slice(0, end) : src;
        var html = highlight(text, block.lang);
        var rows = block.lang === 'diff' || block.lang === 'log';
        if (block.numbers && !rows) {
            var nums = block.numbers;
            html = html.split('\n').map(function (l, i) {
                return '<span class="hl-ln">' + esc(nums[i] == null ? '' : nums[i]) + '</span>' + l;
            }).join('\n');
        }
        shown = cut ? text.split('\n').length : total;
        return '<pre class="' + (rows ? 'rows' : '') + (block.numbers ? ' numbered' : '') + '"><code>' + html + '</code></pre>' +
               (cut ? '<button type="button" class="ai-more">Show all — ' + total.toLocaleString('en-US') + ' lines' +
                      (src.length > HL_MAX ? ', plain text' : '') + ' (' + shown + ' shown)</button>' : '');
    }
    function codeHtml(block) {
        return '<div class="ai-code' + (block.err ? ' err' : '') + '">' +
               '<div class="ai-code-head"><span class="ai-code-lang' + (block.path ? ' path' : '') + '">' +
               esc(block.label || langLabel('', block.lang)) + '</span>' +
               '<button type="button" class="ai-copy" title="Copy">Copy</button></div>' + codeInner(block, false) + '</div>';
    }
    function wireCode(root, blocks) {
        var boxes = root.querySelectorAll('.ai-code');
        for (var i = 0; i < boxes.length && i < blocks.length; i++) boxes[i]._block = blocks[i];
    }
    function codeEl(block) {
        var d = document.createElement('div');
        d.innerHTML = codeHtml(block);
        var box = d.firstChild;
        box._block = block;
        return box;
    }
    function copyText(text, btn) {
        function flash(ok) {
            btn.textContent = ok ? 'Copied' : 'Copy failed';
            btn.classList.toggle('ok', ok);
            setTimeout(function () { btn.textContent = 'Copy'; btn.classList.remove('ok'); }, 1300);
        }
        function viaField() {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;left:-999px;top:0;opacity:0';
            document.body.appendChild(ta);
            ta.select();
            var ok = false;
            try { ok = document.execCommand('copy'); } catch (e) {}
            ta.remove();
            flash(ok);
        }
        if (navigator.clipboard && navigator.clipboard.writeText)
            navigator.clipboard.writeText(text).then(function () { flash(true); }, viaField);
        else viaField();
    }
    chatEl.addEventListener('click', function (e) {
        var btn = e.target.closest && e.target.closest('.ai-copy, .ai-more');
        var box = btn && btn.closest('.ai-code');
        if (!box) return;
        e.stopPropagation();
        var block = box._block;
        if (btn.classList.contains('ai-copy')) {
            copyText(block ? block.src : box.querySelector('pre').textContent, btn);
        } else if (block) {
            var holder = document.createElement('div');
            holder.innerHTML = codeInner(block, true);
            box.replaceChild(holder.firstChild, box.querySelector('pre'));
            btn.remove();
        }
    });

    // ---------- markdown ----------
    var ASSET_EXT = /\.(scn|proto|js|json|png|jpe?g|gif|webp|atlas|anim|ttf|otf|fntstyle|meta|mat|frag|vert|metal|glsl|txt|xml|md|ogg|wav|mp3|pipeline|glb|gltf|fbx|spine|skel|csv)$/i;
    var CODE_EXT = /\.(cpp|cxx|cc|c|h|hpp|hh|inl|mm|m|ts|tsx|jsx|mjs|cjs|py|sh|bash|cmake|css|scss|html|htm|svg|yml|yaml|toml|ini|cfg|log|bat|ps1|java|cs|swift|kt|gradle|plist|lock|patch|diff|wasm|data|zip|pdf)$/i;
    var NOT_ASSET = /^(?:\/|~|\.\.?\/|(?:Sources|Work|o2|Platforms|Bin|Tools|CMake|node_modules|build[\w-]*)\/)/;
    // the server-side paths Claude prints are session-absolute; the browser
    // knows them relative to Assets
    function assetRel(p) {
        var m = String(p).match(/(?:^|\/)Assets\/(.+)$/);
        return m ? m[1] : p;
    }
    // "Assets/Scripts/Player.js:42" → { path, line }; null for anything that is not one path
    var RE_REF = /^([^\s:*?"<>|]+\.[A-Za-z][A-Za-z0-9]{0,7})(?::(\d+(?:[:-]\d+)?)|#L(\d+))?$/;
    function pathRef(s) {
        s = String(s).trim();
        if (!s || s.length > 300 || s.indexOf('://') >= 0) return null;
        var probe = s;
        if (/\s/.test(s)) {
            // a name with spaces is believed only under Assets, where scenes and sprites have them
            if (/\s{2,}|\n/.test(s) || !/(?:^|\/)Assets\//.test(s)) return null;
            probe = s.replace(/ /g, '_');
        }
        var m = RE_REF.exec(probe);
        if (!m) return null;
        var path = s.slice(0, m[1].length);
        if (path.indexOf('/') < 0 && !ASSET_EXT.test(path) && !CODE_EXT.test(path)) return null;
        return { path: path, line: m[2] || m[3] || '' };
    }
    function pathChip(ref, label) {
        var p = shortPath(ref.path);
        var isAsset = /(?:^|\/)Assets\//.test(p) || (!NOT_ASSET.test(p) && ASSET_EXT.test(p));
        var shown = isAsset ? assetRel(p) : p, cut = shown.lastIndexOf('/');
        var dir = cut >= 0 ? shown.slice(0, cut + 1) : '';
        if (dir.length > 42) dir = '…' + dir.slice(dir.indexOf('/', dir.length - 40));
        return '<span class="ai-path' + (isAsset ? ' ai-file" data-path="' + esc(assetRel(p)) + '" title="' + esc(p) + ' — open in the assets browser"'
                                                 : '" title="' + esc(p) + '"') + '>' +
               (label != null ? label
                              : (dir ? '<span class="dir">' + esc(dir) + '</span>' : '') + esc(shown.slice(cut + 1))) +
               (ref.line ? '<span class="ln">:' + esc(ref.line) + '</span>' : '') + '</span>';
    }
    function fileLink(path) { return pathChip({ path: String(path).trim(), line: '' }); }

    var RE_URL = /https?:\/\/[^\s<>"'`]+/y, RE_AUTOLINK = /<(https?:\/\/[^\s<>]+)>/y;
    var RE_PROSE_PATH = /(?:~|\.{1,2})?\/?(?:[\w@+-][\w.@+-]*\/)+[\w@+-][\w.@+-]*\.[A-Za-z][A-Za-z0-9]{0,7}(?::\d+(?:[:-]\d+)?|#L\d+)?/y;
    var MD_ESCAPABLE = '\\`*_{}[]()#+-.!|~<>';
    function linkHtml(href, labelHtml) {
        return '<a href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">' + labelHtml + '</a>';
    }
    function findTicks(src, count, from) {
        var j = from, n = src.length;
        while (j < n) {
            j = src.indexOf('`', j);
            if (j < 0) return -1;
            var e = j;
            while (e < n && src.charAt(e) === '`') e++;
            if (e - j === count) return j;
            j = e;
        }
        return -1;
    }
    function isWordChar(c) { return !!c && /[\wÀ-￿]/.test(c); }
    function mdInline(src, depth) {
        depth = depth || 0;
        if (src.length > 20000 || depth > 6) return esc(src).replace(/\n/g, '<br>');
        var out = '', i = 0, n = src.length, from = 0, dead = {}, m, j, k;
        function text(to) { if (to > from) out += esc(src.slice(from, to)).replace(/\n/g, '<br>'); }
        function took(to) { i = from = to; }
        while (i < n) {
            var ch = src.charAt(i), prev = i ? src.charAt(i - 1) : '';
            if (ch === '\\' && i + 1 < n && MD_ESCAPABLE.indexOf(src.charAt(i + 1)) >= 0) {
                text(i); out += esc(src.charAt(i + 1)); took(i + 2);
                continue;
            }
            if (ch === '`') {
                k = i;
                while (k < n && src.charAt(k) === '`') k++;
                var ticks = k - i;
                j = dead['`' + ticks] ? -1 : findTicks(src, ticks, k);
                if (j < 0) { dead['`' + ticks] = 1; i = k; continue; }
                var code = src.slice(k, j).replace(/\n/g, ' ');
                if (code.length > 2 && code.charAt(0) === ' ' && code.charAt(code.length - 1) === ' ') code = code.slice(1, -1);
                var ref = pathRef(code);
                text(i);
                out += ref ? pathChip(ref) : '<code>' + esc(code) + '</code>';
                took(j + ticks);
                continue;
            }
            if (ch === '*' || ch === '_' || ch === '~') {
                k = i;
                while (k < n && src.charAt(k) === ch) k++;
                var run = Math.min(k - i, 3), key = ch + run, delim = src.slice(i, i + run), after = src.charAt(i + run);
                var opens = after && !/\s/.test(after) && (ch !== '_' || !isWordChar(prev)) && (ch !== '~' || run === 2);
                if (!opens || dead[key]) { i = k; continue; }
                var close = -1;
                j = i + run + 1;
                while (j < n) {
                    j = src.indexOf(delim, j);
                    if (j < 0) break;
                    var e = j;
                    while (e < n && src.charAt(e) === ch) e++;
                    var b = j;
                    while (b > 0 && src.charAt(b - 1) === ch) b--;
                    if (e - b === run && !/\s/.test(src.charAt(j - 1)) && (ch !== '_' || !isWordChar(src.charAt(e)))) { close = j; break; }
                    j = e;
                }
                if (close < 0) { dead[key] = 1; i = k; continue; }
                var inner = mdInline(src.slice(i + run, close), depth + 1);
                text(i);
                out += ch === '~' ? '<del>' + inner + '</del>'
                     : run === 3 ? '<b><i>' + inner + '</i></b>' : run === 2 ? '<b>' + inner + '</b>' : '<i>' + inner + '</i>';
                took(close + run);
                continue;
            }
            if (ch === '[' || (ch === '!' && src.charAt(i + 1) === '[')) {
                var lb = ch === '!' ? i + 1 : i, level = 0, rb = -1;
                for (j = lb; j < n && j < lb + 600; j++) {
                    var cj = src.charAt(j);
                    if (cj === '\\') { j++; continue; }
                    if (cj === '[') level++;
                    else if (cj === ']' && --level === 0) { rb = j; break; }
                }
                if (rb > 0 && src.charAt(rb + 1) === '(') {
                    var rp = -1;
                    level = 0;
                    for (j = rb + 1; j < n && j < rb + 1200; j++) {
                        var cp = src.charAt(j);
                        if (cp === '\n') break;
                        if (cp === '(') level++;
                        else if (cp === ')' && --level === 0) { rp = j; break; }
                    }
                    if (rp > 0) {
                        var label = src.slice(lb + 1, rb);
                        var href = src.slice(rb + 2, rp).trim().replace(/\s+"[^"]*"$/, '');
                        if (href.charAt(0) === '<' && href.charAt(href.length - 1) === '>') href = href.slice(1, -1);
                        var labelHtml = mdInline(label || href, depth + 1), hrefRef;
                        text(i);
                        if (/^(https?:\/\/|mailto:)/i.test(href)) out += linkHtml(href, labelHtml);
                        else if ((hrefRef = pathRef(href) || (/(?:^|\/)Assets\//.test(href) ? { path: href, line: '' } : null)))
                            out += pathChip(hrefRef, labelHtml);
                        else out += labelHtml + (href ? ' (' + esc(href) + ')' : '');
                        took(rp + 1);
                        continue;
                    }
                }
                i = lb + 1;
                continue;
            }
            if (ch === '<') {
                RE_AUTOLINK.lastIndex = i;
                if ((m = RE_AUTOLINK.exec(src))) { text(i); out += linkHtml(m[1], esc(m[1])); took(i + m[0].length); continue; }
            }
            if (!isWordChar(prev)) {
                if (ch === 'h' && (src.startsWith('http://', i) || src.startsWith('https://', i))) {
                    RE_URL.lastIndex = i;
                    if ((m = RE_URL.exec(src))) {
                        var url = m[0];
                        while (/[.,;:!?*_\]}]$/.test(url) || (/\)$/.test(url) && url.indexOf('(') < 0)) url = url.slice(0, -1);
                        text(i); out += linkHtml(url, esc(url)); took(i + url.length);
                        continue;
                    }
                }
                if (prev !== '/' && prev !== '.' && prev !== '-' && /[\w.~\/]/.test(ch)) {
                    RE_PROSE_PATH.lastIndex = i;
                    if ((m = RE_PROSE_PATH.exec(src)) && !isWordChar(src.charAt(i + m[0].length))) {
                        var pr = pathRef(m[0]);
                        if (pr && (ASSET_EXT.test(pr.path) || CODE_EXT.test(pr.path))) {
                            text(i); out += pathChip(pr); took(i + m[0].length);
                            continue;
                        }
                    }
                }
            }
            i++;
        }
        text(n);
        return out;
    }

    function indentOf(line) {
        var w = 0;
        for (var i = 0; i < line.length; i++) {
            var c = line.charAt(i);
            if (c === ' ') w++; else if (c === '\t') w += 4; else break;
        }
        return w;
    }
    function dropIndent(line, cols) {
        var i = 0, w = 0;
        while (i < line.length && w < cols) {
            var c = line.charAt(i);
            if (c === ' ') w++; else if (c === '\t') w += 4; else break;
            i++;
        }
        return line.slice(i);
    }
    var RE_FENCE = /^(`{3,}|~{3,})\s*([^`]*)$/;
    var RE_MARKER = /^([-*+]|\d{1,9}[.)])( +|$)(.*)$/;
    function fenceOf(line) { var m = RE_FENCE.exec(line.replace(/^[ \t]+/, '')); return m ? { mark: m[1], info: m[2].trim() } : null; }
    function closesFence(line, f) {
        var t = line.trim();
        if (t.length < f.mark.length || t.charAt(0) !== f.mark.charAt(0)) return false;
        for (var i = 0; i < t.length; i++) if (t.charAt(i) !== f.mark.charAt(0)) return false;
        return true;
    }
    function markerOf(line) {
        var ind = indentOf(line), m = RE_MARKER.exec(line.replace(/^[ \t]+/, ''));
        if (!m) return null;
        var ordered = m[1].length > 1 || /\d/.test(m[1]);
        return { indent: ind, ordered: ordered, start: ordered ? parseInt(m[1], 10) : 0,
                 content: ind + m[1].length + Math.min(Math.max(m[2].length, 1), 4), text: m[3] };
    }
    function isRule(t) { return t.length < 200 && /^([-*_])(?:[ \t]*\1){2,}$/.test(t); }
    function splitRow(line) {
        var t = line.trim(), cells = [], cur = '';
        if (t.charAt(0) === '|') t = t.slice(1);
        if (t.charAt(t.length - 1) === '|' && t.charAt(t.length - 2) !== '\\') t = t.slice(0, -1);
        for (var i = 0; i < t.length; i++) {
            var c = t.charAt(i);
            if (c === '\\' && t.charAt(i + 1) === '|') { cur += '|'; i++; }
            else if (c === '|') { cells.push(cur.trim()); cur = ''; }
            else cur += c;
        }
        cells.push(cur.trim());
        return cells;
    }
    function tableAlign(line) {
        if (line.indexOf('-') < 0 || line.length > 2000) return null;
        var cells = splitRow(line), out = [];
        for (var i = 0; i < cells.length; i++) {
            if (!/^:?-+:?$/.test(cells[i])) return null;
            var l = cells[i].charAt(0) === ':', r = cells[i].charAt(cells[i].length - 1) === ':';
            out.push(l && r ? 'center' : r ? 'right' : l ? 'left' : '');
        }
        return out;
    }

    function mdBlocks(lines, ctx, depth) {
        var html = '', i = 0, para = [], m;
        function flush() { if (para.length) { html += '<p>' + mdInline(para.join('\n')) + '</p>'; para = []; } }
        if (depth > 8) return '<p>' + esc(lines.join('\n')).replace(/\n/g, '<br>') + '</p>';
        while (i < lines.length) {
            var line = lines[i], t = line.trim();
            if (!t) { flush(); i++; continue; }
            var fence = fenceOf(line);
            if (fence) {
                flush();
                var buf = [], ind = indentOf(line);
                for (i++; i < lines.length && !closesFence(lines[i], fence); i++) buf.push(dropIndent(lines[i], ind));
                i++;
                var info = fence.info.split(/[\s,:{]/)[0], src = buf.join('\n');
                var lang = langOf(info) || (info ? '' : guessLang(src));
                var block = { src: src, lang: lang, label: langLabel(info, lang) };
                ctx.blocks.push(block);
                html += codeHtml(block);
                continue;
            }
            if ((m = /^(#{1,6})[ \t]+(.*)$/.exec(t))) {
                flush();
                var ht = m[2], he = ht.length;
                while (he > 0 && ht.charAt(he - 1) === '#') he--;
                if (he < ht.length && (he === 0 || ht.charAt(he - 1) === ' ')) ht = ht.slice(0, he).trim();
                var level = Math.min(m[1].length, 4);
                html += '<h' + level + '>' + mdInline(ht) + '</h' + level + '>';
                i++;
                continue;
            }
            if (isRule(t)) { flush(); html += '<hr>'; i++; continue; }
            if (t.charAt(0) === '>') {
                flush();
                var quote = [];
                while (i < lines.length && lines[i].trim().charAt(0) === '>') {
                    quote.push(lines[i].replace(/^[ \t]*>[ ]?/, ''));
                    i++;
                }
                html += '<blockquote>' + mdBlocks(quote, ctx, depth + 1) + '</blockquote>';
                continue;
            }
            var align = t.indexOf('|') >= 0 && i + 1 < lines.length ? tableAlign(lines[i + 1]) : null;
            if (align && splitRow(t).length === align.length) {
                flush();
                var cell = function (tag, text, c) {
                    return '<' + tag + (align[c] ? ' style="text-align:' + align[c] + '"' : '') + '>' + mdInline(text || '') + '</' + tag + '>';
                };
                var table = '<div class="ai-table"><table><thead><tr>' +
                    splitRow(t).map(function (c, ci) { return cell('th', c, ci); }).join('') + '</tr></thead><tbody>';
                for (i += 2; i < lines.length && lines[i].trim() && lines[i].indexOf('|') >= 0; i++) {
                    var cells = splitRow(lines[i]), row = '';
                    for (var c = 0; c < align.length; c++) row += cell('td', cells[c], c);
                    table += '<tr>' + row + '</tr>';
                }
                html += table + '</tbody></table></div>';
                continue;
            }
            var mk = markerOf(line);
            if (mk) {
                flush();
                var list = mdList(lines, i, mk, ctx, depth);
                html += list.html;
                i = list.next;
                continue;
            }
            para.push(t);
            i++;
        }
        flush();
        return html;
    }
    // One list: the items at the first marker's indent, each with the lines that
    // belong to it (deeper markers, continuation text, fenced code) rendered as blocks.
    function mdList(lines, i, first, ctx, depth) {
        var items = [], loose = false, base = first.indent, ordered = first.ordered;
        while (i < lines.length) {
            var mk = markerOf(lines[i]);
            if (!mk || mk.ordered !== ordered || mk.indent < base || mk.indent > base + 1 || isRule(lines[i].trim())) break;
            var body = [mk.text], blank = false, inFence = null;
            for (i++; i < lines.length; i++) {
                var line = lines[i];
                if (inFence) {
                    body.push(dropIndent(line, mk.content));
                    if (closesFence(line, inFence)) inFence = null;
                    continue;
                }
                if (!line.trim()) { blank = true; body.push(''); continue; }
                var ind = indentOf(line), sub = markerOf(line);
                if (ind <= base + 1 && (sub || blank)) break;          // a sibling, or the list is over
                if (ind <= base + 1 && (fenceOf(line) || /^(#{1,6}[ \t]|>)/.test(line.trim()))) break;
                if (blank && ind > base + 1) loose = loose || !sub;
                blank = false;
                body.push(dropIndent(line, mk.content));
                if (fenceOf(line)) inFence = fenceOf(line);
            }
            while (body.length && !body[body.length - 1]) body.pop();
            if (blank && i < lines.length && markerOf(lines[i])) loose = true;
            items.push({ body: body, start: mk.start });
        }
        var html = items.map(function (it) {
            var task = /^\[([ xX])\][ \t]+/.exec(it.body[0] || ''), box = '';
            if (task) {
                it.body[0] = it.body[0].slice(task[0].length);
                box = '<span class="ai-task' + (task[1] === ' ' ? '' : ' on') + '"></span>';
            }
            var inner = mdBlocks(it.body, ctx, depth + 1);
            if (!loose && inner.indexOf('<p>') === 0) inner = inner.slice(3).replace('</p>', '');
            return '<li' + (task ? ' class="task"' : '') + '>' + box + inner + '</li>';
        }).join('');
        var tag = ordered ? 'ol' : 'ul';
        return { html: '<' + tag + (ordered && items[0].start !== 1 ? ' start="' + items[0].start + '"' : '') + '>' + html + '</' + tag + '>',
                 next: i };
    }
    function renderMarkdown(src, ctx) {
        ctx = ctx || { blocks: [] };
        return mdBlocks(String(src == null ? '' : src).replace(/\r\n?/g, '\n').split('\n'), ctx, 0);
    }
    function setMarkdown(el, src) {
        var ctx = { blocks: [] };
        el.innerHTML = renderMarkdown(src, ctx);
        el.classList.add('ai-md');
        wireCode(el, ctx.blocks);
    }

    // ---------- chat pieces ----------
    var EXAMPLES = [
        'Describe this project and what is on the scene right now.',
        'Add a title label to the scene and place it sensibly.',
        'Find every script under Assets and say what each one does.',
        'Enter play mode, take a screenshot and tell me what you see.',
    ];
    function showEmptyState() {
        if (chatEl.querySelector('#ai-empty') || chatEl.children.length) return;
        var d = document.createElement('div');
        d.id = 'ai-empty';
        d.innerHTML =
            '<div class="badge">' + iconHtml('spark') + '</div>' +
            '<h2>The agent works on a copy of this project</h2>' +
            '<p>Claude Code on the server: it reads and edits files under <b>Assets/</b> in your session, ' +
            'sees the scene and drives the editor. ' +
            // a portal project (/p/<id>/editor/) also owns its C++, and its agent has the project's own tools
            (/^\/p\/[a-f0-9]+\/editor\//.test(location.pathname)
                ? 'It can write the game\u2019s C++ under <b>Sources/</b> too and build it, and looks after the project around the editor: git, builds, settings. '
                : '') +
            'The rest of the repository is read-only.</p>' +
            '<div class="examples"></div>';
        var ex = d.querySelector('.examples');
        EXAMPLES.forEach(function (t) {
            var b = document.createElement('div');
            b.className = 'ex';
            var dot = document.createElement('span');
            dot.className = 'dot';
            b.appendChild(icon('spark'));
            b.appendChild(document.createTextNode(t));
            b.onclick = function () {
                inputEl.value = t;
                inputEl.dispatchEvent(new Event('input'));
                inputEl.focus();
            };
            ex.appendChild(b);
        });
        chatEl.appendChild(d);
    }
    function clearEmptyState() {
        var e = chatEl.querySelector('#ai-empty');
        if (e) e.remove();
    }

    function addMsg(cls, text) {
        clearEmptyState();
        var d = document.createElement('div');
        d.className = 'ai-m ' + cls;
        if (cls === 'model') setMarkdown(d, text);
        else d.textContent = text;
        chatEl.appendChild(d);
        scrollDown(cls === 'user');
        return d;
    }

    // An error the user can act on: plain words, and a button when a retry
    // is the obvious next move
    function addError(message, opts) {
        opts = opts || {};
        clearEmptyState();
        var d = document.createElement('div');
        d.className = 'ai-m error';
        var head = document.createElement('div');
        head.className = 'errhead';
        head.textContent = opts.head || 'Something went wrong';
        d.appendChild(head);
        var body = document.createElement('div');
        body.textContent = message;
        d.appendChild(body);
        if (opts.retry) {
            var row = document.createElement('div');
            row.className = 'errrow';
            var b = document.createElement('button');
            b.className = 'tbtn';
            b.textContent = 'Retry';
            b.onclick = function () { row.remove(); opts.retry(); };
            row.appendChild(b);
            d.appendChild(row);
        }
        chatEl.appendChild(d);
        scrollDown(true);
        setPeek('error', (opts.head ? opts.head + ': ' : '') + message);
        return d;
    }

    // a collapsible line: tool call, thinking, or a debug dump
    function addStep(label, detail, opts) {
        opts = opts || {};
        clearEmptyState();
        var step = document.createElement('div');
        step.className = 'ai-step' + (opts.open ? ' open' : '') + (opts.kind ? ' ' + opts.kind : '');
        if (opts.dev) {
            step.dataset.dev = '1';
            if (!devMode) step.style.display = 'none';
        }

        var head = document.createElement('div');
        head.className = 'ai-step-head';
        head.appendChild(svgIcon('#i-chev', 'icon ai-chev'));
        if (opts.tool) {
            var t = document.createElement('span');
            t.className = 'tool';
            t.textContent = opts.tool;
            head.appendChild(t);
        }
        var lab = document.createElement('span');
        lab.className = 'ai-step-label';
        lab.textContent = label;
        head.appendChild(lab);
        var live = document.createElement('span');
        live.className = 'ai-step-live';
        head.appendChild(live);
        var time = document.createElement('span');
        time.className = 'ai-step-time';
        head.appendChild(time);

        var body = document.createElement('div');
        body.className = 'ai-step-body' + (opts.markdown ? ' md' : '') + (opts.render ? ' io' : '');
        // a body that takes work to draw (coloured code, a diff) is drawn when it is looked at
        var stale = !!opts.render, mdText = detail || '', mdTimer = null;
        function draw() {
            if (!opts.render || !stale || !step.classList.contains('open')) return;
            stale = false;
            opts.render(body);
        }
        function drawMd() { mdTimer = null; setMarkdown(body, mdText); }
        if (opts.markdown) setMarkdown(body, mdText);
        else if (!opts.render) body.textContent = detail || '';
        if (!opts.render && !opts.markdown && !detail) step.classList.add('bare');

        head.onclick = function (e) {
            if (e.target.closest && e.target.closest('.ai-file')) return;      // a path opens the file, not the row
            step.classList.toggle('open');
            draw();
        };
        step.appendChild(head);
        step.appendChild(body);
        chatEl.appendChild(step);
        draw();
        scrollDown();
        return {
            el: step,
            append: function (t) {
                step.classList.remove('bare');
                if (opts.markdown) { mdText += (mdText ? '\n\n' : '') + t; drawMd(); }
                else body.textContent += (body.textContent ? '\n' : '') + t;
            },
            // streamed markdown is redrawn a few times a second, not once per token
            set: function (t) {
                step.classList.remove('bare');
                if (!opts.markdown) { body.textContent = t; return; }
                mdText = t;
                if (!mdTimer) mdTimer = setTimeout(drawMd, 120);
            },
            setLabel: function (t) { lab.textContent = t; },
            setLabelHtml: function (h) { lab.innerHTML = h; },       // built from esc()'d pieces only
            setLive: function (t) { live.textContent = t || ''; },
            setTime: function (t) { time.textContent = t; },
            label: function () { return lab.textContent; },
            fail: function () { step.classList.add('err'); },
            settle: function () { step.classList.remove('running'); live.textContent = ''; },
            redraw: function () { stale = true; draw(); },
            body: body,
        };
    }
    // a quiet line between the messages: a run ended, a message was queued, a tool was refused
    function addSysLine(text, kind) {
        clearEmptyState();
        var d = document.createElement('div');
        d.className = 'ai-sys' + (kind ? ' ' + kind : '');
        var span = document.createElement('span');
        span.textContent = text;
        d.appendChild(span);
        chatEl.appendChild(d);
        scrollDown();
        return d;
    }
    // a picture that cannot be shown is a quiet line, never a broken icon
    function addShotNote(why) {
        clearEmptyState();
        var d = document.createElement('div');
        d.className = 'ai-shot-note';
        d.textContent = 'screenshot unavailable' + (why ? ' — ' + why : '');
        chatEl.appendChild(d);
        scrollDown();
        return d;
    }
    function addShot(b64, mime) {
        if (!validShot(b64, mime)) return addShotNote('the image came back empty');
        return addShotSrc('data:' + mime + ';base64,' + b64);
    }
    // src: the picture itself, or where the chat keeps it on the server
    function addShotSrc(src) {
        clearEmptyState();
        var img = document.createElement('img');
        img.className = 'ai-shot';
        img.alt = 'screenshot';
        img.onerror = function () {
            var note = addShotNote('the image could not be decoded');
            if (img.parentNode) img.parentNode.replaceChild(note, img);
        };
        img.onload = function () { scrollDown(); };
        img.onclick = function () { img.classList.toggle('big'); };
        img.src = src;
        chatEl.appendChild(img);
        scrollDown();
        return img;
    }

    // ---------- status: the chip, the progress bar, the changed files ----------
    function setChip(text, kind) {
        chipEl.textContent = text;
        chipEl.className = kind ? kind : '';
        chipEl.id = 'ai-chip';
    }
    function setAction(text) {
        actEl.textContent = text || 'working…';
        if (running) setPeek('busy', actEl.textContent);
    }
    function setMeta(text) { metaEl.textContent = text || ''; }

    var changed = {};   // path -> 'edit' | 'delete'
    function resetChanges() { changed = {}; paintChanges(); }
    function noteChange(path, kind) { changed[path] = kind; paintChanges(); }
    function paintChanges() {
        var paths = Object.keys(changed);
        filesEl.classList.toggle('show', paths.length > 0);
        if (!paths.length) return;
        filesTitle.textContent = paths.length + (paths.length === 1 ? ' file changed' : ' files changed') + ' — show';
        filesList.innerHTML = '';
        paths.sort().forEach(function (p) {
            var b = document.createElement('span');
            b.className = 'fitem' + (changed[p] === 'delete' ? ' del' : '');
            b.appendChild(icon('file'));
            b.appendChild(document.createTextNode(assetRel(p)));
            b.title = changed[p] === 'delete' ? 'deleted' : 'open in the assets browser';
            b.onclick = function () {
                if (changed[p] !== 'delete' && window.__o2RevealAsset) window.__o2RevealAsset(assetRel(p));
            };
            filesList.appendChild(b);
        });
    }
    filesEl.querySelector('.fhead').onclick = function () {
        filesEl.classList.toggle('open');
        var paths = Object.keys(changed).length;
        filesTitle.textContent = paths + (paths === 1 ? ' file changed' : ' files changed') +
            (filesEl.classList.contains('open') ? ' — hide' : ' — show');
    };
    // ---------- editor-side tool implementations ----------
    // Claude's own tools do the file work on the server; these are the calls
    // that only make sense inside the running engine.
    //
    // Which engine that is depends on the mode: the editor is this page's own
    // Module, the game preview is the client in its frame. The tools below are
    // written once and aimed through eng()/engCanvas(), so the agent works the
    // same on either side — only play_mode/open_scene/save_scene are the
    // editor's alone, and restart is the preview's answer to play mode.

    function previewOn() {
        return typeof o2Preview !== 'undefined' && o2Preview.isActive();
    }
    function engWin() {
        if (!previewOn()) return window;
        var w = o2Preview.frameWindow();
        if (!w) throw new Error('the game client is not loaded — switch to the Game mode first');
        return w;
    }
    function eng() {
        var m = engWin().Module;
        if (!m || !m.calledRun)
            throw new Error(previewOn() ? 'the game client is still starting' : 'the editor is not running yet');
        return m;
    }
    function engCanvas() {
        var c = previewOn() ? o2Preview.canvas() : canvas;
        if (!c) throw new Error('the game client is not loaded');
        return c;
    }
    function editorOnly(what) {
        if (previewOn())
            throw new Error(what + ' belongs to the editor; the preview runs the game. ' +
                            'Switch to the Editor mode for it, or use restart here.');
    }

    function rmTree(FS, dir) {
        FS.readdir(dir).forEach(function (name) {
            if (name === '.' || name === '..') return;
            var child = dir + '/' + name;
            var st = FS.analyzePath(child);
            if (st.exists && FS.isDir(st.object.mode)) rmTree(FS, child);
            else if (st.exists) FS.unlink(child);
        });
        FS.rmdir(dir);
    }
    function toolRebuild(a) {
        var forced = a && a.force;
        var fn = forced ? '_o2_web_rebuild_assets_forced' : '_o2_web_rebuild_assets';
        var M = eng();
        if (typeof M[fn] !== 'function')
            return Promise.reject(new Error('this engine cannot rebuild assets'));
        // (a file the agent has just written may still be on its way into this copy)
        return whenPulled().then(function () { return sleep(50); }).then(function () {
            if (M === Module) pulled = false;
            M[fn]();
        }).then(function () {
            // The built files are mirrored to the server through an async queue.
            // Returning before it drains risks a reload cutting the tail off, which
            // leaves the server missing files the build index still claims exist.
            return drainMirror();
        }).then(function () {
            return { ok: true, forced: !!forced };
        });
    }

    // Waits until the BuiltAssets mirror queue has settled (nothing new for a moment).
    // The queue is undefined until the engine writes something: comparing the
    // fallback promise instead of the queue itself made every round look like new
    // work and cost the full 60 rounds — a 24 s wait before a mode switch.
    function drainMirror() {
        var rounds = 0;
        var w = (function () { try { return engWin(); } catch (e) { return window; } })();
        function settle() {
            var q = w.__o2MirrorQueue;
            return Promise.resolve(q).then(function () {
                return sleep(400);
            }).then(function () {
                if (w.__o2MirrorQueue !== q && rounds++ < 60) return settle();
            });
        }
        return settle();
    }
    window.__o2DrainMirror = drainMirror;
    // ---------- screenshot ----------
    // The picture is taken from the canvas's backing store (sharp on a HiDPI
    // screen), scaled so its longest side is about SHOT_SIDE. A view that is not
    // there — a client still loading, a page the portal keeps in a hidden frame, a
    // scene area squeezed to nothing — is waited for, and then answered in words:
    // an empty image is a broken icon in the chat and a rejected request upstream.
    var SHOT_SIDE = 900, SHOT_KEEP = 1024, SHOT_WAIT_MS = 3000;

    function pageHidden() {
        if (!window.innerWidth || !window.innerHeight) return true;
        try { var f = window.frameElement; if (f && !f.getClientRects().length) return true; } catch (e) {}
        return false;
    }
    function shotView() {
        var c;
        if (previewOn()) {
            c = o2Preview.canvas();
            if (!c || !o2Preview.isReady()) return { wait: 'loading' };
        } else {
            c = canvas;
            if (typeof Module === 'undefined' || !Module.calledRun) return { wait: 'starting' };
        }
        if (pageHidden()) return { wait: 'hidden', canvas: c };
        if (c.clientWidth < 8 || c.clientHeight < 8 || c.width < 8 || c.height < 8) return { wait: 'nosize', canvas: c };
        // the engine sizes the backing store a frame or two after the layout moved
        var skew = (c.width / c.height) / (c.clientWidth / c.clientHeight);
        if (skew < 0.8 || skew > 1.25) return { wait: 'resizing', canvas: c };
        return { canvas: c };
    }
    function validShot(b64, mime) {
        if (typeof b64 !== 'string' || b64.length < 200) return false;
        if (mime === 'image/jpeg') return b64.indexOf('/9j/') === 0;
        if (mime === 'image/png') return b64.indexOf('iVBOR') === 0;
        return /^image\/(webp|gif)$/.test(mime);
    }
    function grabCanvas(c, last) {
        var cw = c.clientWidth, ch = c.clientHeight, bw = c.width, bh = c.height;
        var longest = Math.max(bw, bh);
        var scale = longest <= SHOT_KEEP ? 1 : SHOT_SIDE / longest;
        var sw = Math.max(1, Math.round(bw * scale)), sh = Math.max(1, Math.round(bh * scale));
        var t = document.createElement('canvas');
        t.width = sw; t.height = sh;
        var g = t.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(c, 0, 0, bw, bh, 0, 0, sw, sh);
        var flat = null;
        try {
            var d = g.getImageData(0, 0, sw, sh).data, step = 4 * Math.max(1, Math.floor(sw * sh / 4096));
            flat = [d[0], d[1], d[2]];
            for (var i = step; i < d.length && flat; i += step)
                if (Math.abs(d[i] - flat[0]) + Math.abs(d[i + 1] - flat[1]) + Math.abs(d[i + 2] - flat[2]) > 6) flat = null;
        } catch (e) { flat = null; }
        if (flat && !last) return { flat: flat };      // worth another look before it is encoded
        var url = t.toDataURL('image/jpeg', 0.85), b64 = url.slice(url.indexOf(',') + 1);
        if (url.indexOf('data:image/jpeg;base64,') !== 0 || !validShot(b64, 'image/jpeg')) return null;
        var kx = cw / sw, ky = ch / sh;
        var same = Math.abs(kx - 1) < 0.005 && Math.abs(ky - 1) < 0.005;
        return {
            flat: flat,
            out: {
                result: { imageWidth: sw, imageHeight: sh, canvasWidth: cw, canvasHeight: ch,
                          clickScaleX: +kx.toFixed(4), clickScaleY: +ky.toFixed(4),
                          note: same
                            ? 'the image is the canvas pixel for pixel: a point measured on it is the click coordinate'
                            : 'click coordinates are CSS pixels of the canvas (canvasWidth × canvasHeight), the image is ' +
                              'imageWidth × imageHeight: multiply a point measured on the image by clickScaleX / clickScaleY ' +
                              '(' + kx.toFixed(3) + ') before clicking' },
                image: { mime: 'image/jpeg', b64: b64 },
            },
        };
    }
    // Read inside a frame of the canvas's own window, right after the engine drew
    // (a WebGL buffer that is not preserved is empty anywhere else). A page in the
    // background gets no frames: the last one drawn is read after a short wait.
    function grabInFrame(c, last) {
        return new Promise(function (resolve) {
            var done = false;
            function go() {
                if (done) return;
                done = true;
                try { resolve(grabCanvas(c, last)); } catch (e) { resolve(null); }
            }
            var w = c.ownerDocument.defaultView || window;
            if (document.visibilityState === 'visible') try { w.requestAnimationFrame(go); } catch (e) {}
            setTimeout(go, 300);
        });
    }
    var SHOT_WHY = {
        hidden: 'the game view is not visible right now (the project\'s Play/Editor tab is not open in the user\'s browser), ' +
                'so there is nothing to capture — do not retry in a loop; verify through scene_tree / run_script / read_log ' +
                'instead, and say that the result was not checked visually',
        nosize: 'the view has no room on the page right now (the agent panel or a small window covers it), so there is ' +
                'nothing to capture — do not retry in a loop; verify through scene_tree / run_script / read_log instead',
        loading: 'the game client is still loading, or it crashed: there is no frame to capture yet. Wait a few seconds ' +
                 '(wait) and try once more; if it fails again read_log, then restart',
        starting: 'the editor is not running yet — wait a few seconds and try once more',
        failed: 'the browser returned an empty image for the view — do not retry in a loop; verify through ' +
                'scene_tree / run_script / read_log instead',
    };
    var SHOT_WHY_SHORT = { hidden: 'the view is hidden (another tab of the project is open)',
                           nosize: 'the view has no room on the page', loading: 'the game client is still loading',
                           starting: 'the editor is still starting', failed: 'the browser returned an empty image' };
    function toolScreenshot() {
        var deadline = Date.now() + SHOT_WAIT_MS;
        function attempt() {
            var v = shotView();
            if (v.wait === 'resizing' && Date.now() >= deadline) v = { canvas: v.canvas };
            if (v.wait) {
                if (Date.now() < deadline) return sleep(150).then(attempt);
                var c = v.canvas;
                return { error: 'screenshot unavailable: ' + SHOT_WHY[v.wait], reason: v.wait,
                         canvasWidth: c ? c.clientWidth : 0, canvasHeight: c ? c.clientHeight : 0 };
            }
            var last = Date.now() + 450 >= deadline;
            return grabInFrame(v.canvas, last).then(function (shot) {
                if (shot && !shot.flat) return shot.out;
                if (!last) return sleep(150).then(attempt);
                if (!shot) return { error: 'screenshot unavailable: ' + SHOT_WHY.failed, reason: 'failed' };
                shot.out.result.warning = 'the whole frame is one flat colour (rgb ' + shot.flat.join(', ') +
                    '): the game may not have drawn anything yet — check read_log before trusting it';
                return shot.out;
            });
        }
        return Promise.resolve().then(attempt);
    }

    function isPlaying() {
        if (previewOn()) return o2Preview.isReady();
        try { return !!(Module._o2_web_is_playing && Module._o2_web_is_playing()); }
        catch (e) { return false; }
    }

    function callJson(fn, args, types) {
        var M = eng();
        if (typeof M.ccall !== 'function')
            return Promise.reject(new Error('the engine is not running yet'));
        var ptr = M.ccall(fn, 'number', types || [], args || []);
        if (!ptr) return Promise.reject(new Error(fn + ' returned nothing'));
        var text = M.UTF8ToString(ptr);
        try { M._free(ptr); } catch (e) {}
        var parsed;
        try { parsed = JSON.parse(text); }
        catch (e) { throw new Error('bad reply from ' + fn + ': ' + text.slice(0, 200)); }
        if (parsed.error) throw new Error(parsed.error);
        return Promise.resolve(parsed);
    }

    function toolSceneTree(a) {
        var depth = a.depth === undefined ? 3 : Math.max(0, Math.min(Number(a.depth), 12));
        return callJson('o2_web_scene_dump', [a.path || '', depth], ['string', 'number']);
    }

    function toolViewInfo() {
        return callJson('o2_web_view_info', [], []).then(function (info) {
            info.mode = previewOn() ? 'preview' : 'editor';
            // (the agent's prompt explains the difference)
            info.instance = HEADLESS ? 'your own hidden instance (1280x800): the user does not see it, and has their own' : 'the user\'s own page: they see what you do here';
            if (previewOn()) {
                var d = o2Preview.device();
                info.previewDevice = { preset: d.label, orientation: d.orientation, width: d.width, height: d.height };
                info.note = 'the game client fills the canvas, so canvas pixels are the device pixels; ' +
                            'there is no play mode here — use restart to start the game over.';
            }
            // everything the model needs to aim a click, spelled out
            info.howToClick = 'A world point maps to a canvas pixel as: ' +
                'canvasX = canvas.x/2 + worldX, canvasY = canvas.y/2 - worldY for screen-space widgets. ' +
                'In play mode the game is drawn inside gameView, so first map the world point through the ' +
                'camera: u = (worldX - camera.position.x) / camera.size.x + 0.5, ' +
                'v = 0.5 - (worldY - camera.position.y) / camera.size.y, then ' +
                'canvasX = canvas.x/2 + gameView.left + u * (gameView.right - gameView.left), ' +
                'canvasY = canvas.y/2 - (gameView.top - v * (gameView.top - gameView.bottom)).';
            return info;
        });
    }

    // The engine's browser backend evaluates scripts in the page's global scope, so
    // bare let/const would collide between calls - the body is wrapped in a function,
    // and a small prelude adds the helpers the model is told about
    var SCRIPT_PRELUDE =
        'function findActor(path) {' +
        '  var parts = String(path).split("/").filter(function (p) { return p; });' +
        '  var list = sceneRoots, cur = null;' +
        '  for (var i = 0; i < parts.length; i++) {' +
        '    cur = null;' +
        '    for (var j = 0; j < list.length; j++) {' +
        '      if (list[j] && list[j].GetName() === parts[i]) { cur = list[j]; break; }' +
        '    }' +
        '    if (!cur) return null;' +
        '    list = cur.GetChildren ? cur.GetChildren() : [];' +
        '  }' +
        '  return cur;' +
        '}' +
        'function eachActor(fn, list, path) {' +
        '  list = list || sceneRoots; path = path || "";' +
        '  for (var i = 0; i < list.length; i++) {' +
        '    var a = list[i]; if (!a) continue;' +
        '    var p = path ? path + "/" + a.GetName() : a.GetName();' +
        '    fn(a, p);' +
        '    if (a.GetChildren) eachActor(fn, a.GetChildren(), p);' +
        '  }' +
        '}';

    function toolRunScript(a) {
        if (!a.code) return Promise.reject(new Error('code is required'));
        // Console semantics: the value of the last expression comes back, so the model
        // does not have to remember a return (and a stray one is forgiven)
        var code = String(a.code).replace(/^\s*return\s+/, '');
        var asExpression = '(function () {' + SCRIPT_PRELUDE + '\nreturn eval(' + JSON.stringify(code) + ');\n})()';
        var asBody = '(function () {' + SCRIPT_PRELUDE + '\n' + code + '\n})()';

        function run(wrapped) {
            return callJson('o2_web_run_script', [wrapped], ['string']).then(function (r) {
                if (typeof r.result === 'string' && /^(TypeError|SyntaxError|ReferenceError|RangeError|Error)\b/.test(r.result))
                    throw new Error(r.result);
                return r;
            });
        }

        // eval gives console semantics (the last expression is the result), but code
        // written with a return statement needs a real function body instead
        return run(asExpression).catch(function (e) {
            if (/Illegal return statement/i.test(e.message)) return run(asBody);
            throw e;
        });
    }

    function toolOpenScene(a) {
        editorOnly('opening a scene');
        if (typeof Module.ccall !== 'function')
            return Promise.reject(new Error('the editor is not running yet'));
        if (!a.path) return Promise.reject(new Error('path is required, e.g. Boot.scn'));
        // The engine silently does nothing for a missing scene, which reads as success
        return fetch(o2Base + '/api/assets/file?path=' + encodeURIComponent(a.path)).then(function (r) {
            if (!r.ok) throw new Error('no such scene: ' + a.path + ' (paths are relative to Assets)');
            var before = (window.engineLogLines || []).length;
            Module.ccall('o2_web_open_scene', null, ['string'], [a.path]);
            return sleep(1800).then(function () {
                var failed = (window.engineLogLines || []).slice(before)
                    .some(function (l) { return l.indexOf('Failed to load scene') >= 0; });
                if (!failed || a._healed) return failed;
                // The built copy can go missing while the build index still lists it,
                // and only a full rebuild puts it back
                return toolRebuild({ force: true })
                    .then(function () { return sleep(30000); })
                    .then(function () { return toolOpenScene({ path: a.path, _healed: true }); })
                    .then(function () { return 'healed'; });
            });
        }).then(function (state) {
            return callJson('o2_web_scene_dump', ['', 0], ['string', 'number']).then(function (dump) {
                var count = (dump.actors || []).length;
                var result = { ok: true, opened: a.path, rootActors: count };
                if (state === 'healed')
                    result.note = 'the built scene was missing and has been rebuilt from source';
                else if (state === true)
                    result.note = 'the engine could not load the built scene; run rebuild_assets({force:true})';
                else if (!count)
                    result.note = 'the scene opened but has no root actors - check the file';
                return result;
            });
        });
    }

    function toolSaveScene() {
        editorOnly('saving a scene');
        if (typeof Module._o2_web_save_scene !== 'function')
            return Promise.reject(new Error('the editor is not running yet'));
        Module._o2_web_save_scene();
        return sleep(800).then(function () { return { ok: true }; });
    }

    function toolPlayMode(a) {
        if (previewOn())
            return toolRestart({ _from: 'play_mode' });
        if (typeof Module._o2_web_set_play !== 'function')
            return Promise.reject(new Error('the editor is not running yet'));
        var want = a.on === undefined ? true : !!a.on;
        Module._o2_web_set_play(want ? 1 : 0);
        return sleep(600).then(function () {
            var now = isPlaying();
            return { playing: now,
                     note: now
                        ? 'the scene is running in the Game window; input tools now work, and they only make sense inside that window'
                        : 'stopped; the scene is back to its saved state' };
        });
    }

    // Either face of the session is the agent's to open: it edits in one and
    // checks the result in the other.
    function toolSetMode(a) {
        if (typeof o2Preview === 'undefined')
            return Promise.reject(new Error('this page has no game preview'));
        var want = a && a.mode === 'preview' ? 'preview' : 'editor';
        if (o2Preview.mode() === want)
            return Promise.resolve({ ok: true, mode: want, note: 'already open' });
        o2Preview.setMode(want);
        if (want === 'editor')
            return sleep(600).then(function () { return { ok: true, mode: 'editor' }; });
        // the client streams the session and starts the game; wait for it
        return (function waitReady(left) {
            if (o2Preview.isReady()) return Promise.resolve({ ok: true, mode: 'preview' });
            if (left <= 0)
                return { ok: false, mode: 'preview',
                         note: 'the game client is still loading; call view_info or wait and try again' };
            return sleep(1000).then(function () { return waitReady(left - 1); });
        })(60);
    }

    // In the preview the game is the whole world, so the only way to see a change
    // from the top is to start it over — that is what the Restart button and this
    // tool do. In the editor the same intent is a stop and start of play mode.
    function toolRestart(a) {
        if (previewOn()) {
            return o2Preview.restart().then(function (r) {
                var reloaded = !!(r && r.reloaded);
                // a fresh frame streams the session again: until it is up its canvas is an empty black rectangle
                function whenReady(left) {
                    if (o2Preview.isReady()) return sleep(700).then(function () { return true; });
                    if (left <= 0) return Promise.resolve(false);
                    return sleep(500).then(function () { return whenReady(left - 1); });
                }
                return (reloaded ? whenReady(60) : sleep(900).then(function () { return true; })).then(function (ready) {
                    return { ok: true, mode: 'preview', reloaded: reloaded, ready: ready,
                             note: (a && a._from === 'play_mode'
                                    ? 'there is no play mode in the preview: the client was restarted instead. '
                                    : '') +
                                   (!reloaded ? 'the game started over on the assets as they are built now'
                                    : ready ? 'the client was loaded again and the game is running on the assets as they are built now'
                                    : 'the client is still loading the session; wait and check read_log before a screenshot') };
                });
            });
        }
        if (typeof Module._o2_web_set_play !== 'function')
            return Promise.reject(new Error('the editor is not running yet'));
        var wasPlaying = isPlaying();
        Module._o2_web_set_play(0);
        return sleep(500).then(function () {
            Module._o2_web_set_play(1);
            return sleep(700);
        }).then(function () {
            return { ok: true, mode: 'editor', playing: isPlaying(),
                     note: wasPlaying ? 'play mode was restarted' : 'play mode started from the saved scene' };
        });
    }

    // Driving the editor chrome by synthetic clicks proved unreliable and
    // expensive, so input is allowed only while the game runs
    function requirePlay(what) {
        if (isPlaying()) return null;
        if (previewOn())
            return Promise.reject(new Error(what + ' needs the game client running: it is still loading, or it crashed.'));
        return Promise.reject(new Error(
            what + ' is only available in play mode, and only inside the Game window. ' +
            'Turn it on with play_mode({on:true}) - and note that editor windows (Assets, Tree, Properties, menus) ' +
            'cannot be driven at all: change the project through the file tools instead.'));
    }

    function focusCanvas() {
        var c = engCanvas();
        var doc = c.ownerDocument;
        if (doc.activeElement && doc.activeElement !== c && doc.activeElement.blur)
            doc.activeElement.blur();
        c.focus();
    }
    function fireMouse(type, cx, cy, extra) {
        var c = engCanvas();
        // the events must be built by the frame's own window, or the engine
        // inside it sees objects from a foreign realm
        var w = c.ownerDocument.defaultView;
        var isPointer = type.indexOf('pointer') === 0;
        var Ctor = isPointer && w.PointerEvent ? w.PointerEvent : w.MouseEvent;
        c.dispatchEvent(new Ctor(type, Object.assign({
            bubbles: true, cancelable: true, view: w,
            clientX: cx, clientY: cy,
            pointerId: 1, pointerType: 'mouse', isPrimary: true,
        }, extra)));
    }
    function toolClick(a) {
        var blocked = requirePlay('clicking');
        if (blocked) return blocked;
        return (async function () {
            // coordinates are the canvas's own pixels; in the preview the frame
            // has its own viewport, so they need no page offset at all
            var c = engCanvas();
            var r = previewOn() ? { left: 0, top: 0 } : c.getBoundingClientRect();
            var cx = r.left + Number(a.x), cy = r.top + Number(a.y);
            focusCanvas();
            fireMouse('pointermove', cx, cy, { buttons: 0 });
            fireMouse('mousemove', cx, cy, { buttons: 0 });
            await sleep(300); // the engine dispatches presses to last-frame under-cursor listeners
            var btn = a.button === 'right' ? 2 : 0;
            var buttons = btn === 2 ? 2 : 1;
            var n = a.double ? 2 : 1;
            for (var i = 1; i <= n; i++) {
                fireMouse('pointerdown', cx, cy, { button: btn, buttons: buttons, detail: i });
                fireMouse('mousedown', cx, cy, { button: btn, buttons: buttons, detail: i });
                await sleep(40);
                fireMouse('pointerup', cx, cy, { button: btn, buttons: 0, detail: i });
                fireMouse('mouseup', cx, cy, { button: btn, buttons: 0, detail: i });
                if (i < n) await sleep(110);
            }
            await sleep(200);
            return { ok: true };
        })();
    }
    var CHAR_CODES = { ' ': 'Space', '.': 'Period', ',': 'Comma', '/': 'Slash', ';': 'Semicolon', "'": 'Quote',
        '[': 'BracketLeft', ']': 'BracketRight', '-': 'Minus', '=': 'Equal', '`': 'Backquote', '\\': 'Backslash',
        '!': 'Digit1', '@': 'Digit2', '#': 'Digit3', '$': 'Digit4', '%': 'Digit5', '^': 'Digit6', '&': 'Digit7',
        '*': 'Digit8', '(': 'Digit9', ')': 'Digit0', '_': 'Minus', '+': 'Equal', '{': 'BracketLeft',
        '}': 'BracketRight', ':': 'Semicolon', '"': 'Quote', '<': 'Comma', '>': 'Period', '?': 'Slash',
        '~': 'Backquote', '|': 'Backslash' };
    function codeForChar(ch) {
        if (/[a-zA-Z]/.test(ch)) return 'Key' + ch.toUpperCase();
        if (/[0-9]/.test(ch)) return 'Digit' + ch;
        return CHAR_CODES[ch] || '';
    }
    function fireKey(type, key, code, mods) {
        var c = engCanvas();
        var w = c.ownerDocument.defaultView;
        c.dispatchEvent(new w.KeyboardEvent(type, Object.assign({
            bubbles: true, cancelable: true, key: key, code: code,
        }, mods || {})));
    }
    function toolTypeText(a) {
        var blocked = requirePlay('typing');
        if (blocked) return blocked;
        return (async function () {
            focusCanvas();
            await sleep(100);
            var text = String(a.text);
            for (var i = 0; i < text.length; i++) {
                var ch = text[i];
                if (ch === '\n') { fireKey('keydown', 'Enter', 'Enter'); fireKey('keyup', 'Enter', 'Enter'); }
                else {
                    var code = codeForChar(ch);
                    fireKey('keydown', ch, code, { shiftKey: /[A-Z~!@#$%^&*()_+{}:"<>?|]/.test(ch) });
                    fireKey('keyup', ch, code);
                }
                await sleep(45);
            }
            return { ok: true };
        })();
    }
    var NAMED_KEYS = { Enter: 'Enter', Escape: 'Escape', Backspace: 'Backspace', Delete: 'Delete', Tab: 'Tab',
        ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown',
        Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', Space: 'Space' };
    function toolPressKey(a) {
        var blocked = requirePlay('pressing keys');
        if (blocked) return blocked;
        return (async function () {
            focusCanvas();
            await sleep(100);
            var parts = String(a.key).split('+');
            var main = parts.pop();
            var mods = { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false };
            parts.forEach(function (m) {
                m = m.toLowerCase();
                if (m === 'ctrl' || m === 'control') mods.ctrlKey = true;
                else if (m === 'shift') mods.shiftKey = true;
                else if (m === 'alt') mods.altKey = true;
                else if (m === 'meta' || m === 'cmd') mods.metaKey = true;
            });
            var key, code;
            if (NAMED_KEYS[main]) { key = main === 'Space' ? ' ' : main; code = NAMED_KEYS[main]; }
            else if (main.length === 1) { key = mods.ctrlKey || mods.altKey ? main.toLowerCase() : main; code = codeForChar(main); }
            else { key = main; code = main; }
            if (mods.ctrlKey) fireKey('keydown', 'Control', 'ControlLeft', { ctrlKey: true });
            if (mods.shiftKey) fireKey('keydown', 'Shift', 'ShiftLeft', { shiftKey: true });
            if (mods.altKey) fireKey('keydown', 'Alt', 'AltLeft', { altKey: true });
            await sleep(40);
            fireKey('keydown', key, code, mods);
            await sleep(40);
            fireKey('keyup', key, code, mods);
            if (mods.altKey) fireKey('keyup', 'Alt', 'AltLeft');
            if (mods.shiftKey) fireKey('keyup', 'Shift', 'ShiftLeft');
            if (mods.ctrlKey) fireKey('keyup', 'Control', 'ControlLeft');
            await sleep(100);
            return { ok: true };
        })();
    }
    function toolReadLog(a) {
        var all = [];
        try { all = engWin().engineLogLines || []; } catch (e) { all = window.engineLogLines || []; }
        var filtered = a.filter
            ? all.filter(function (l) { return l.indexOf(a.filter) >= 0; })
            : all;
        var n = Math.min(Math.max(Number(a.lines) || 60, 1), 300);
        var tail = filtered.slice(-n);
        return Promise.resolve({
            lines: tail, shown: tail.length, totalKept: all.length,
            note: all.length ? undefined : 'the engine has printed nothing yet',
        });
    }

    function toolWait(a) {
        var ms = Math.min(Math.max(Number(a.ms) || 0, 0), 5000);
        return sleep(ms).then(function () { return { ok: true, waited: ms }; });
    }


    var EXEC = {
        rebuild_assets: toolRebuild, screenshot: toolScreenshot, restart: toolRestart, set_mode: toolSetMode,
        click: toolClick, type_text: toolTypeText, press_key: toolPressKey,
        read_log: toolReadLog, wait: toolWait, play_mode: toolPlayMode,
        open_scene: toolOpenScene, save_scene: toolSaveScene,
        scene_tree: toolSceneTree, view_info: toolViewInfo, run_script: toolRunScript,
    };
    window.__o2aiExec = EXEC;       // debug/testing handles
    window.__o2aiEvents = function () { return events; };
    window.__o2aiFeed = function (ev) { onEvent(ev); };   // a stream event by hand, to see the panel without a turn

    // Claude writes files on the server; the running editor works off its
    // own MEMFS copy, so pull what changed under Assets into it
    //
    // So do the other pages of the session, now that the agent has an editor of its own next to the people's (the server
    // tells every page what another one saved: `fs` with from: 'page'). `pulled` remembers that this copy has files its
    // built assets know nothing of, and buildPulled() builds them - here when the agent's page has built (`assets_built`)
    // and when a run is over, there before the next tool. A build on this side makes no event, so nothing goes round.
    var pulling = 0, pulled = false;
    function syncChangedFile(rel) {
        var m = rel.match(/^Assets\/(.+)$/);
        if (!m) return;
        var inner = m[1];
        // both engines may be up (the editor keeps running behind the preview),
        // and each has its own MEMFS copy of the session
        var modules = [];
        if (Module && Module.FS) modules.push(Module);
        try {
            // the game client keeps running behind the editor, so it needs the
            // file too — otherwise a restart later would run on a stale copy
            var w = typeof o2Preview !== 'undefined' && o2Preview.liveWindow();
            if (w && w.Module && w.Module.FS) modules.push(w.Module);
        } catch (e) {}
        if (!modules.length) return;
        pulling++;
        fetch(o2Base + '/api/assets/file?path=' + encodeURIComponent(inner)).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.arrayBuffer();
        }).then(function (buf) {
            var full = '/project/Assets/' + inner;
            modules.forEach(function (M) {
                M.FS.mkdirTree(full.substring(0, full.lastIndexOf('/')));
                M.FS.writeFile(full, new Uint8Array(buf));
            });
            pulled = true;
        }).catch(function (e) { console.warn('[ai] MEMFS sync failed for ' + rel, e); })
          .then(function () { pulling--; });
    }
    // what an `fs` event names, into this page's copy; `synced`: the ones the pages have already (a page wrote them and
    // the server said so then) - fetching one again could put an older file over this editor's next save
    function pullFiles(ev) {
        var have = ev.synced || [];
        (ev.changed || (ev.path ? [ev.path] : [])).forEach(function (p) { if (have.indexOf(p) < 0) syncChangedFile(p); });
        (ev.deleted || []).forEach(removeDeletedFile);
    }
    function whenPulled() {
        var left = 100;
        return (function wait() { return pulling > 0 && left-- > 0 ? sleep(150).then(wait) : Promise.resolve(); })();
    }
    // the editor's built assets catch up with the files that were pulled (nothing to do when none were)
    function buildPulled(why) {
        return whenPulled().then(function () {
            if (!pulled || typeof Module === 'undefined' || !Module.calledRun || typeof Module._o2_web_rebuild_assets !== 'function') return false;
            pulled = false;
            console.log('[ai] building the assets: ' + why);
            try { Module._o2_web_rebuild_assets(); } catch (e) { console.warn('[ai] rebuild after sync failed', e); }
            return true;
        });
    }
    window.__o2aiSync = function () { return { pulling: pulling, pulled: pulled }; };      // debug/testing handle

    // the portal's file browser edits the same working copy from outside the frame
    window.__o2SyncFiles = function (changed, deleted) {
        changed.forEach(function (p) { syncChangedFile(p); });
        deleted.forEach(function (p) { removeDeletedFile(p); });
        setTimeout(function () { buildPulled('files were saved in the project page'); }, 300);
    };

    var sessionCwd = '';
    function shortPath(v) {
        return sessionCwd && v.indexOf(sessionCwd + '/') === 0 ? v.slice(sessionCwd.length + 1) : v;
    }

    // ---------- clarifying questions ----------
    // One card per question: the ready answers as buttons, a field for an own one, Skip. Answered, it folds into a line
    var questionBlocks = {};
    function showQuestion(ev) {
        if (questionBlocks[ev.id]) return;
        clearEmptyState();
        hideTyping();
        var d = document.createElement('div');
        d.className = 'ai-ask';
        d._question = ev.question;

        var head = document.createElement('div');
        head.className = 'askhead';
        head.innerHTML = (ev.step && ev.steps ? '<span class="askstep">' + ev.step + ' / ' + ev.steps + '</span>' : '') + esc(ev.question);
        d.appendChild(head);

        var answered = false;
        function answer(text, skipped) {
            if (answered) return;
            answered = true;
            d.classList.add('sent');
            post('answer', { id: ev.id, answer: text || '', skipped: !!skipped }).catch(function () { answered = false; d.classList.remove('sent'); });
        }

        var list = document.createElement('div');
        list.className = 'askopts';
        (ev.options || []).forEach(function (o) {
            var b = document.createElement('button');
            b.className = 'askopt';
            b.innerHTML = '<b>' + esc(o.label) + '</b>' + (o.detail ? '<span>' + esc(o.detail) + '</span>' : '');
            b.onclick = function () { answer(o.label, false); };
            list.appendChild(b);
        });
        d.appendChild(list);

        var own = document.createElement('div');
        own.className = 'askown';
        var input = document.createElement('input');
        input.className = 'ai-input';
        input.placeholder = 'Or answer in your own words…';
        input.onkeydown = function (e) { if (e.key === 'Enter' && input.value.trim()) { e.preventDefault(); answer(input.value.trim(), false); } };
        var send = document.createElement('button');
        send.className = 'tbtn';
        send.textContent = 'Answer';
        send.onclick = function () { if (input.value.trim()) answer(input.value.trim(), false); };
        var skip = document.createElement('button');
        skip.className = 'tbtn quiet';
        skip.textContent = 'Skip';
        skip.title = ev['default'] ? 'The agent decides: ' + ev['default'] : 'The agent decides itself';
        skip.onclick = function () { answer('', true); };
        own.appendChild(input); own.appendChild(send); own.appendChild(skip);
        d.appendChild(own);

        if (ev['default']) {
            var dflt = document.createElement('div');
            dflt.className = 'askdefault';
            dflt.textContent = 'Skipped, the agent goes with: ' + ev['default'];
            d.appendChild(dflt);
        }
        if (ev.away) {
            var away = document.createElement('div');
            away.className = 'permaway';
            away.textContent = 'Asked ' + ago(ev.t || Date.now()) + ', while nobody was here — the agent has been waiting for the answer since.';
            d.appendChild(away);
        }

        chatEl.appendChild(d);
        questionBlocks[ev.id] = d;
        scrollDown(true);
        setChip('asking you', 'busy');
        setAction('asks: ' + ev.question);
        setPeek('ask', 'The agent has a question — tap to answer');
        if (!sheetOpen && phoneOn) setSheet(true);
        setTimeout(function () { try { if (!phoneOn) input.focus({ preventScroll: true }); } catch (e) {} }, 50);
    }
    function resolveQuestionUi(ev) {
        var d = questionBlocks[ev.id];
        if (!d) return;
        var line = document.createElement('div');
        line.className = 'ai-ask done';
        line.innerHTML = '<span class="askq">' + esc(d._question) + '</span> <b>' +
            (ev.skipped ? (ev.timeout ? '— no answer, the agent decided' : '— skipped, the agent decides') : '→ ' + esc(ev.answer)) + '</b>';
        d.replaceWith(line);
        delete questionBlocks[ev.id];
        if (running) { setChip('working', 'busy'); setAction('working…'); }
    }

    // ---------- permission prompts ----------
    var permissionBlocks = {};
    function showPermission(ev) {
        if (permissionBlocks[ev.id]) return;
        clearEmptyState();
        var d = document.createElement('div');
        d.className = 'ai-perm';
        var head = document.createElement('div');
        head.className = 'permhead';
        head.innerHTML = 'Allow <b>' + esc(toolShort(ev.tool)) + '</b>?';
        d.appendChild(head);
        // a command or a script is shown whole right below: its one-line form would only repeat it
        if (!/^(Bash|run_script)$/.test(toolShort(ev.tool))) {
            var what = document.createElement('div');
            what.className = 'permwhat';
            what.innerHTML = toolSummary(ev.tool, ev.input);
            d.appendChild(what);
        }
        var detail = document.createElement('div');
        detail.className = 'permdetail';
        renderToolInput(detail, ev.tool, ev.input);
        d.appendChild(detail);
        d._tool = ev.tool;
        d._input = ev.input;
        if (ev.away) {
            var away = document.createElement('div');
            away.className = 'permaway';
            away.textContent = 'Asked ' + ago(ev.t || Date.now()) + ', while nobody was here — the agent has been waiting for the answer since.';
            d.appendChild(away);
        }
        var row = document.createElement('div');
        row.className = 'permrow';
        [['Allow', 'allow', false], ['Always allow', 'allow', true], ['Deny', 'deny', false]].forEach(function (b) {
            var btn = document.createElement('button');
            btn.className = 'tbtn' + (b[1] === 'deny' ? ' quiet' : '');
            btn.textContent = b[0];
            if (b[2] && !(ev.suggestions && ev.suggestions.length)) btn.disabled = true;
            btn.onclick = function () {
                post('permission', { id: ev.id, behavior: b[1], always: b[2] }).catch(function () {});
            };
            row.appendChild(btn);
        });
        d.appendChild(row);
        chatEl.appendChild(d);
        permissionBlocks[ev.id] = d;
        scrollDown(true);           // it waits for an answer: never below the fold
        setChip('waiting for you', 'busy');
        setAction('needs permission: ' + ev.tool.replace(/^mcp__o2__/, ''));
        setPeek('ask', 'Needs your permission: ' + ev.tool.replace(/^mcp__o2__/, '') + ' — tap to answer');
    }
    function resolvePermissionUi(id, behavior) {
        var d = permissionBlocks[id];
        if (!d) return;
        var row = addStep('', '', { tool: (behavior === 'allow' ? '✓ allowed · ' : '⊘ denied · ') + toolShort(d._tool),
                                    kind: behavior === 'allow' ? 'sys' : 'warn' });
        row.setLabelHtml(toolSummary(d._tool, d._input));
        d.replaceWith(row.el);
        delete permissionBlocks[id];
        if (running) { setChip('working', 'busy'); setAction('working…'); }
    }

    function removeDeletedFile(rel) {
        var m = rel.match(/^Assets\/(.+)$/);
        if (!m) return;
        var full = '/project/Assets/' + m[1];
        // (a folder, when another page removed or moved one)
        function drop(FS) {
            var st = FS.analyzePath(full);
            if (!st.exists) return;
            if (FS.isDir(st.object.mode)) rmTree(FS, full); else FS.unlink(full);
            pulled = true;
        }
        if (Module && Module.FS) try { drop(Module.FS); } catch (e) {}
        try {
            var w = typeof o2Preview !== 'undefined' && o2Preview.liveWindow();
            if (w && w.Module && w.Module.FS) drop(w.Module.FS);
        } catch (e) {}
    }

    // ---------- chats ----------
    // Every conversation is kept on the server (agent-chats.ts) as a list of events, each with a `seq`. Opening a chat
    // REPLAYS them through onEvent - the very code that draws the live stream - with `replaying` set, and that flag is
    // what keeps a replay from DOING anything: no editor tool runs, no file is pulled into the editor, no peek line,
    // no review turn. Then the stream is told to follow the chat after the last replayed seq, so a run still in
    // progress continues where the replay ended. What is kept arrives with its seq - drawn once, in order, asked for
    // again after a dropped connection; what only streams (deltas, a tool's progress) arrives marked `live`.
    var curChat = null;           // the chat on screen; null: a new one, not a message in it yet
    var lastSeq = 0;              // the last kept event of it that is drawn
    var replaying = false;
    var openTicket = 0;           // a chat opened while another was still loading wins
    var me = null, chatRows = [], chatScope = 'mine';
    var sentCids = {};            // messages drawn here as they were sent: their echo from the server is not drawn again

    function newId() {
        var a = new Uint8Array(8), out = '';
        crypto.getRandomValues(a);
        for (var i = 0; i < a.length; i++) out += ('0' + a[i].toString(16)).slice(-2);
        return out;
    }
    function getJson(path) {
        return fetch(o2Base + '/api/agent/' + path).then(function (r) {
            return r.json().then(function (j) { if (!r.ok) throw Object.assign(new Error(j.error || ('HTTP ' + r.status)), { status: r.status }); return j; });
        });
    }
    function remember(id) { try { if (id) sessionStorage.setItem('o2ai_chat:' + o2Base, id); else sessionStorage.removeItem('o2ai_chat:' + o2Base); } catch (e) {} }

    // everything the conversation on screen is drawn from
    function resetView() {
        chatEl.innerHTML = '';
        typingEl = null;
        steps = {}; bubble = null; bubbleText = ''; thinkStep = null; thinkText = ''; reviewStep = null; reviewText = '';
        permissionBlocks = {}; sentCids = {}; events = [];
        lastError = null; lastResult = null; lastReply = ''; lastPrompt = ''; pendingReview = false; runTools = 0;
        resetChanges();
    }

    function ago(t) {
        var s = Math.max(0, (Date.now() - t) / 1000);
        if (s < 90) return 'just now';
        if (s < 3600) return Math.round(s / 60) + ' min ago';
        if (s < 86400) return Math.round(s / 3600) + ' h ago';
        if (s < 172800) return 'yesterday';
        return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    }
    function rowState(c) {
        if (c.needsYou) return ['ask', 'needs you'];
        if (c.status === 'running') return ['running', 'working'];
        if (c.queued) return ['idle', 'queued'];
        return [c.status, { error: 'failed', stopped: 'stopped', done: '', idle: '' }[c.status] || ''];
    }
    function paintChats() {
        var others = chatRows.some(function (c) { return !c.mine; });
        document.getElementById('ai-chats-scope').style.display = others ? '' : 'none';
        chatListEl.querySelectorAll('#ai-chats-scope button').forEach(function (b) { b.classList.toggle('on', b.dataset.scope === chatScope); });
        // the button says what waits behind it: somebody's answer, or a turn in progress
        var mine = chatRows.filter(function (c) { return c.mine; });
        chatsBtn.className = 'titlebtn' + (chatListEl.classList.contains('open') ? ' on' : '') +
            (mine.some(function (c) { return c.needsYou; }) ? ' ask' : chatRows.some(function (c) { return c.status === 'running'; }) ? ' run' : '');
        var list = document.getElementById('ai-chats-list');
        list.innerHTML = '';
        var rows = chatScope === 'all' && others ? chatRows : mine;
        if (!rows.length) {
            var none = document.createElement('div');
            none.className = 'clnone';
            none.textContent = 'No chats yet. What you ask the agent is kept here, with everything it did — also after the page is closed.';
            list.appendChild(none);
        }
        rows.forEach(function (c) {
            var st = rowState(c), row = document.createElement('div');
            row.className = 'clrow' + (c.id === curChat ? ' cur' : '');
            row.dataset.id = c.id;
            var dot = document.createElement('i');
            dot.className = 'st ' + st[0];
            row.appendChild(dot);
            var main = document.createElement('div');
            main.className = 'main';
            var t = document.createElement('div');
            t.className = 't';
            t.textContent = c.title;
            main.appendChild(t);
            var sub = document.createElement('div');
            sub.className = 'sub';
            sub.textContent = [ago(c.updated), c.mine ? '' : (c.by.name || c.by.email || 'somebody else'), st[1],
                               c.cost ? '$' + c.cost.toFixed(2) : ''].filter(Boolean).join(' · ');
            if (st[0] === 'ask' || st[0] === 'error') sub.classList.add(st[0]);
            main.appendChild(sub);
            row.appendChild(main);
            function act(cls, title, svg, fn) {
                var b = document.createElement('button');
                b.className = 'act ' + cls;
                b.title = title;
                b.innerHTML = svg;
                b.onclick = function (e) { e.stopPropagation(); fn(); };
                row.appendChild(b);
            }
            if (c.mine) act('ren', 'Rename', '<svg viewBox="0 0 16 16"><path d="M3 13l.6-2.8L10.8 3 13 5.2 5.8 12.4z"/></svg>', function () {
                var title = window.prompt('Name of the chat', c.title);
                if (title && title.trim()) post('chats/' + c.id + '/rename', { title: title.trim() }).then(loadChats, function (e) { addError(e.message); });
            });
            if (c.mine || (me && me.owner)) act('del', 'Delete the chat and its transcript', ICONS_CLOSE, function () {
                if (!window.confirm('Delete the chat “' + c.title + '”? Its transcript is removed from the server.')) return;
                fetch(o2Base + '/api/agent/chats/' + c.id, { method: 'DELETE' }).then(function (r) {
                    return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status)); });
                }).then(loadChats, function (e) { window.alert(e.message); });
            });
            row.onclick = function () { openChat(c.id); };
            list.appendChild(row);
        });
    }
    function loadChats() {
        return getJson('chats').then(function (j) {
            me = j.me || null;
            chatRows = j.chats || [];
            paintChats();
            return chatRows;
        }).catch(function () { return chatRows; });
    }
    var chatsTimer = null;
    function loadChatsSoon() {
        if (!chatsTimer) chatsTimer = setTimeout(function () { chatsTimer = null; loadChats(); }, 300);
    }
    function openChatList(on) {
        if (!on && !chatListEl.classList.contains('open')) return;         // (asked to close by everything that opens over it)
        chatListEl.classList.toggle('open', on);
        if (on) { if (phoneOn) setSheet(true); closeSettings(); loadChats(); }
        paintChats();
    }
    chatsBtn.onclick = function () { openChatList(!chatListEl.classList.contains('open')); };
    document.getElementById('ai-chats-close').onclick = function () { openChatList(false); };
    chatListEl.querySelectorAll('#ai-chats-scope button').forEach(function (b) {
        b.onclick = function () { chatScope = b.dataset.scope; paintChats(); };
    });

    // A chat from its first event: replayed by pages, then followed live
    function openChat(id) {
        var ticket = ++openTicket;
        openChatList(false);
        curChat = id; lastSeq = 0; replaying = true;
        remember(id);
        resetView();
        if (running) busy(false);
        function page() {
            return getJson('chats/' + id + '?after=' + lastSeq).then(function (j) {
                if (ticket !== openTicket) return null;
                (j.events || []).forEach(function (ev) { lastSeq = ev.seq; feed(ev); });
                return j.more && j.events.length ? page() : j.chat;
            });
        }
        return page().then(function (chat) {
            if (ticket !== openTicket || !chat) return;
            replaying = false;
            closeBubble();
            if (!chatEl.children.length) showEmptyState();
            if (chat.status === 'running') {
                // the run the replay ended in the middle of: its clock and its count, not this page's
                var since = runStarted, tools = runTools;
                busy(true);
                runStarted = since || Date.now(); runTools = tools;
                setAction('the agent is still working');
                var ask = Object.keys(permissionBlocks)[0];
                if (ask) {
                    hideTyping();
                    setChip('waiting for you', 'busy');
                    setAction('needs permission: ' + toolShort(permissionBlocks[ask]._tool));
                    setPeek('ask', 'The agent waits for your permission — tap to answer');
                }
            } else setChip(chat.queued ? 'queued' : chat.status === 'error' ? 'error' : 'ready', chat.status === 'error' ? 'err' : '');
            scrollDown(true);
            paintChats();
            follow();
        }).catch(function (e) {
            if (ticket !== openTicket) return;
            replaying = false;
            // a chat that is gone (deleted elsewhere, a session made anew): a new one
            if (e.status === 404) newChat(); else addError(e.message, { head: 'The chat could not be loaded', retry: function () { openChat(id); } });
        });
    }
    // The panel says a turn runs, the server says none does: the end was missed. The chat's record has the outcome
    function settleRun() {
        if (!running) return;
        if (!curChat) { busy(false); setChip('ready'); return; }
        var chat = curChat;
        getJson('chats/' + chat).then(function (j) {
            if (chat !== curChat || !running || !j || !j.chat || j.chat.status === 'running') return;
            finishRun({ type: 'done', review: false, aborted: j.chat.status === 'stopped' });
            if (j.chat.status === 'error') setChip('error', 'err');
        }).catch(function () { busy(false); setChip('ready'); });
    }
    // The chat list is read every so often while a turn runs here: when it says this chat is over, so is the panel
    var settleTimer = null;
    function watchSettle() {
        if (settleTimer) return;
        settleTimer = setInterval(function () {
            if (!running || document.hidden) return;
            if (!curChat) return;
            getJson('chats/' + curChat).then(function (j) {
                if (running && j && j.chat && curChat === j.chat.id && j.chat.status !== 'running' && !j.chat.queued) settleRun();
            }).catch(function () {});
        }, 15000);
    }

    function newChat() {
        openTicket++;
        replaying = false;
        curChat = null; lastSeq = 0;
        remember(null);
        resetView();
        if (running) busy(false);
        setChip('ready');
        showEmptyState();
        openChatList(false);
        follow();
    }
    document.getElementById('ai-new').onclick = newChat;
    document.getElementById('ai-chats-new').onclick = newChat;

    // On load: the chat that is running - the reason to come back - else the one this tab showed, else the caller's latest
    var booted = false;
    function bootChats() {
        if (booted) { loadChats(); return; }
        booted = true;
        loadChats().then(function (rows) {
            if (curChat || chatEl.querySelector('.ai-m')) return;        // already talking
            var last = null;
            try { last = sessionStorage.getItem('o2ai_chat:' + o2Base); } catch (e) {}
            var pick = rows.filter(function (c) { return c.status === 'running'; })[0] ||
                       rows.filter(function (c) { return c.id === last; })[0] ||
                       rows.filter(function (c) { return c.mine; })[0];
            if (pick) openChat(pick.id);
        });
    }

    var MAIN_ARG = { Read: 'file_path', Write: 'file_path', Edit: 'file_path', MultiEdit: 'file_path',
                     Bash: 'command', Grep: 'pattern', Glob: 'pattern', Task: 'description', Agent: 'description',
                     WebFetch: 'url', WebSearch: 'query', Skill: 'skill', NotebookEdit: 'notebook_path' };
    // What the tool is doing, in the user's words, for the progress line
    var HUMAN = { build_project: 'building the project\u2019s C++', project_info: 'looking at the project', project_git: 'working with git',
                  project_builds: 'looking at the builds', project_update: 'updating the project\u2019s details', Read: 'reading', Write: 'writing', Edit: 'editing', MultiEdit: 'editing', Bash: 'running',
                  Grep: 'searching', Glob: 'listing files', Task: 'subtask', Skill: 'skill',
                  screenshot: 'taking a screenshot', scene_tree: 'reading the scene', view_info: 'reading the view',
                  run_script: 'running a script', open_scene: 'opening a scene', save_scene: 'saving the scene',
                  play_mode: 'toggling play', rebuild_assets: 'rebuilding assets', read_log: 'reading the log',
                  click: 'clicking', type_text: 'typing', press_key: 'pressing a key', wait: 'waiting' };
    function humanAction(name, args) {
        var short = name.replace(/^mcp__o2__/, '');
        var verb = HUMAN[short] || toolShort(name);
        var main = MAIN_ARG[name];
        var what = main && args && args[main] !== undefined ? shortPath(String(args[main])).replace(/\s+/g, ' ') : '';
        if (what.length > 60) what = what.slice(0, 60) + '…';
        return what ? verb + ' ' + what : verb;
    }

    // ---------- tool rows ----------
    // A row is the tool's name and one line that says what it is doing, coloured the
    // way the thing itself would be (a command as shell, a script as JavaScript, a
    // file as a path chip). Opened, it shows what went in and what came back.
    //
    // A new tool needs nothing here to get a decent row: its arguments are listed as
    // key: value and its result is shown as JSON or text. To give it a line of its
    // own add an entry to TOOL_SUMMARY (and its progress-bar verb to HUMAN above);
    // a tool that reports while it runs sends { type: 'tool_progress', id | name, text }.
    function toolShort(name) {
        var parts = String(name).split('__');
        if (parts[0] !== 'mcp' || parts.length < 3) return String(name);
        var rest = parts.slice(2).join('__');
        return parts[1] === 'o2' || parts[1] === 'o2editor' ? rest : parts[1] + ' · ' + rest;
    }
    function muted(text) { return '<span class="hl-c">' + esc(text) + '</span>'; }
    function chipOf(path, line) { return pathChip({ path: String(path == null ? '' : path), line: line || '' }); }
    function strOf(text, max) {
        var s = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
        return '<span class="hl-s">' + esc(s.length > max ? s.slice(0, max) + '…' : s) + '</span>';
    }
    function lineCount(text) { return text ? String(text).split('\n').length : 0; }

    // a line diff of two texts, as unified-diff rows; { text, added, removed }
    function lineDiff(before, after) {
        var A = String(before == null ? '' : before).split('\n'), B = String(after == null ? '' : after).split('\n');
        var p = 0, s = 0, i, j;
        while (p < A.length && p < B.length && A[p] === B[p]) p++;
        while (s < A.length - p && s < B.length - p && A[A.length - 1 - s] === B[B.length - 1 - s]) s++;
        var a = A.slice(p, A.length - s), b = B.slice(p, B.length - s), rows = [], added = 0, removed = 0;
        for (i = Math.max(0, p - 3); i < p; i++) rows.push(' ' + A[i]);
        if (a.length * b.length > 250000) {
            a.forEach(function (l) { rows.push('-' + l); });
            b.forEach(function (l) { rows.push('+' + l); });
            added = b.length; removed = a.length;
        } else {
            var w = b.length + 1, lcs = new Uint16Array((a.length + 1) * w);
            for (i = a.length - 1; i >= 0; i--)
                for (j = b.length - 1; j >= 0; j--)
                    lcs[i * w + j] = a[i] === b[j] ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
            i = j = 0;
            while (i < a.length || j < b.length) {
                if (i < a.length && j < b.length && a[i] === b[j]) { rows.push(' ' + a[i]); i++; j++; }
                else if (j < b.length && (i >= a.length || lcs[i * w + j + 1] > lcs[(i + 1) * w + j])) { rows.push('+' + b[j++]); added++; }
                else { rows.push('-' + a[i++]); removed++; }
            }
        }
        for (i = A.length - s; i < Math.min(A.length, A.length - s + 3); i++) rows.push(' ' + A[i]);
        return { text: rows.join('\n'), added: added, removed: removed };
    }
    function diffStat(d) {
        return ' <span class="hl-add-t">+' + d.added + '</span> <span class="hl-del-t">−' + d.removed + '</span>';
    }
    function smallEnough(a, b) { return String(a || '').length + String(b || '').length < 60000; }

    var TOOL_SUMMARY = {
        // the portal's server-side C++ build: what it builds; the log streams into the row (tool_progress)
        // the portal's server-side project tools (portal/agent-tools.ts): the action, and what it is about
        project_git: function (a) {
            var what = a.message || a.branch || a.id || (a.paths && a.paths.length ? a.paths.slice(0, 3).join(' ') + (a.paths.length > 3 ? ' \u2026' : '') : '') || (a.all ? 'everything' : '');
            return '<b>' + esc(a.action || '') + '</b>' + (what ? ' ' + esc(String(what).slice(0, 140)) : '') + (a.prefer ? ' \u00b7 prefer ' + esc(a.prefer) : '');
        },
        project_builds: function (a) { return '<b>' + esc(a.action || '') + '</b>' + (a.n ? ' #' + esc(a.n) : '') + (a.filter ? ' \u00b7 ' + esc(a.filter) : ''); },
        project_update: function (a) { return esc(['title', 'description', 'emoji'].filter(function (k) { return a[k] !== undefined; }).map(function (k) { return k + ': ' + String(a[k]).slice(0, 60); }).join(' \u00b7 ')); },
        project_info: function () { return ''; },
        build_project: function (a) { return esc((a.targets && a.targets.length ? a.targets.join(' + ') : 'runtime') + (a.activate === false ? '' : ' \u00b7 then switch the editor to it')); },
        Bash: function (a) { return hlLine(a.command, 'sh', 180); },
        Read: function (a) {
            var from = +a.offset || 0, n = +a.limit || 0;
            return chipOf(a.file_path, from || n ? (from || 1) + (n ? '-' + ((from || 1) + n - 1) : '+') : '');
        },
        Write: function (a) { return chipOf(a.file_path) + muted('  ' + lineCount(a.content) + ' lines'); },
        Edit: function (a) {
            return chipOf(a.file_path) + (smallEnough(a.old_string, a.new_string) ? diffStat(lineDiff(a.old_string, a.new_string)) : '') +
                   (a.replace_all ? muted('  every occurrence') : '');
        },
        MultiEdit: function (a) { return chipOf(a.file_path) + muted('  ' + (a.edits || []).length + ' edits'); },
        NotebookEdit: function (a) { return chipOf(a.notebook_path); },
        Grep: function (a) {
            return strOf(a.pattern, 90) + (a.path ? muted(' in ') + chipOf(shortPath(String(a.path))) : '') +
                   (a.glob ? muted('  ' + a.glob) : '') + (a.type ? muted('  type ' + a.type) : '');
        },
        Glob: function (a) { return strOf(a.pattern, 90) + (a.path ? muted(' in ') + chipOf(shortPath(String(a.path))) : ''); },
        Task: function (a) { return esc(a.description || '') + (a.subagent_type ? muted('  ' + a.subagent_type) : ''); },
        Agent: function (a) { return esc(a.description || '') + (a.subagent_type ? muted('  ' + a.subagent_type) : ''); },
        WebFetch: function (a) { return strOf(a.url, 120); },
        WebSearch: function (a) { return strOf(a.query, 120); },
        Skill: function (a) { return esc(a.skill || ''); },
        TodoWrite: function (a) {
            var todos = a.todos || [], now = todos.filter(function (t) { return t.status === 'in_progress'; })[0];
            return esc(todos.length + ' items') + (now ? muted('  now: ' + (now.activeForm || now.content || '')) : '');
        },
        run_script: function (a) { return hlLine(a.code, 'js', 180); },
        scene_tree: function (a) {
            return (a.path ? strOf(a.path, 80) : muted('whole scene')) + (a.depth !== undefined ? muted('  depth ' + a.depth) : '');
        },
        open_scene: function (a) { return chipOf(a.path); },
        click: function (a) {
            return '<span class="hl-n">' + esc(a.x) + '</span>, <span class="hl-n">' + esc(a.y) + '</span>' +
                   muted((a.button === 'right' ? '  right' : '') + (a.double ? '  double' : ''));
        },
        type_text: function (a) { return strOf(JSON.stringify(String(a.text == null ? '' : a.text)), 100); },
        press_key: function (a) { return '<span class="hl-k">' + esc(a.key) + '</span>'; },
        wait: function (a) { return '<span class="hl-n">' + esc(a.ms) + '</span> ms'; },
        read_log: function (a) {
            return muted('last ' + (a.lines || 60) + ' lines') + (a.filter ? muted(' with ') + strOf(a.filter, 60) : '');
        },
        rebuild_assets: function (a) { return a.force ? muted('everything, forced') : muted('what changed'); },
        play_mode: function (a) { return '<span class="hl-l">' + (a.on === false ? 'off' : 'on') + '</span>'; },
        set_mode: function (a) { return '<span class="hl-l">' + esc(a.mode || 'editor') + '</span>'; },
    };
    function toolSummary(name, args) {
        args = args || {};
        var make = TOOL_SUMMARY[toolShort(name)], html = '';
        try { html = make ? make(args) : ''; } catch (e) { html = ''; }
        if (html || make) return html;
        return Object.keys(args).slice(0, 6).map(function (k) {
            var v = args[k], shown;
            if (typeof v === 'string') {
                var ref = pathRef(shortPath(v));
                shown = ref ? pathChip(ref) : strOf(shortPath(v), 70);
            } else if (v && typeof v === 'object') shown = muted(Array.isArray(v) ? '[' + v.length + ']' : '{…}');
            else shown = '<span class="hl-n">' + esc(String(v)) + '</span>';
            return '<span class="hl-a">' + esc(k) + '</span> ' + shown;
        }).join(muted('  ·  '));
    }

    var RE_ANSI = /\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]|\x9b[0-9;?]*[@-~]/g;
    function cleanOutput(text) {
        var s = String(text == null ? '' : text).replace(RE_ANSI, '');
        if (s.indexOf('\r') >= 0)
            s = s.replace(/\r\n/g, '\n').split('\n').map(function (l) { return l.slice(l.lastIndexOf('\r') + 1); }).join('\n');
        if (s.indexOf('<system-reminder>') >= 0) {                      // the harness talking to the model, not output
            var kept = [], from = 0, at;
            while ((at = s.indexOf('<system-reminder>', from)) >= 0) {
                kept.push(s.slice(from, at));
                var end = s.indexOf('</system-reminder>', at);
                from = end < 0 ? s.length : end + 18;
            }
            kept.push(s.slice(from));
            s = kept.join('');
        }
        if (sessionCwd) s = s.split(sessionCwd + '/').join('');
        return s.replace(/^\n+/, '').trimEnd();
    }
    function prettyJson(text) {
        var t = text.trim(), c = t.charAt(0);
        if ((c !== '{' && c !== '[') || t.length > HL_MAX) return null;
        try { return JSON.stringify(JSON.parse(t), null, 2); } catch (e) { return null; }
    }
    // `cat -n` output: the numbers go to a gutter, the code is coloured as the file it is
    function splitNumbered(text) {
        var lines = text.split('\n'), nums = [], code = [], hit = 0;
        for (var i = 0; i < lines.length; i++) {
            var m = /^ {0,8}(\d{1,7})(?:→|\t)/.exec(lines[i]);
            if (m) { hit++; nums.push(m[1]); code.push(lines[i].slice(m[0].length)); }
            else { nums.push(''); code.push(lines[i]); }
        }
        if (!hit || hit < lines.length * 0.8 || !nums[0]) return null;
        return { numbers: nums, src: code.join('\n') };
    }
    function ioBlock(parent, label, src, lang, opts) {
        opts = opts || {};
        parent.appendChild(codeEl({ src: String(src == null ? '' : src), lang: lang || '', label: label,
                                    numbers: opts.numbers, err: opts.err, path: opts.path }));
    }
    function ioNote(parent, text) {
        var d = document.createElement('div');
        d.className = 'ai-io-note';
        d.textContent = text;
        parent.appendChild(d);
    }
    // the arguments the row's own line already shows in full
    var SAID_IN_LINE = { Read: 'file_path offset limit', Glob: 'pattern path', Grep: 'pattern path glob type',
                         open_scene: 'path', scene_tree: 'path depth', click: 'x y button double', press_key: 'key',
                         wait: 'ms', read_log: 'lines filter', rebuild_assets: 'force', play_mode: 'on', set_mode: 'mode' };
    function shortAll(text) { return sessionCwd ? text.split(sessionCwd + '/').join('') : text; }
    function renderToolInput(parent, name, a) {
        var short = toolShort(name);
        a = a || {};
        var said = (SAID_IN_LINE[short] || '').split(' ');
        if (Object.keys(a).every(function (k) { return said.indexOf(k) >= 0; })) return;
        if (short === 'Bash') {
            if (a.description) ioNote(parent, a.description);
            ioBlock(parent, 'command', a.command, 'sh');
        } else if (short === 'Edit') {
            ioBlock(parent, shortPath(String(a.file_path || '')) || 'change',
                    smallEnough(a.old_string, a.new_string) ? lineDiff(a.old_string, a.new_string).text
                        : String(a.old_string).split('\n').map(function (l) { return '-' + l; })
                            .concat(String(a.new_string).split('\n').map(function (l) { return '+' + l; })).join('\n'),
                    'diff', { path: true });
        } else if (short === 'MultiEdit') {
            (a.edits || []).forEach(function (e, i) {
                ioBlock(parent, shortPath(String(a.file_path || '')) + ' · edit ' + (i + 1), lineDiff(e.old_string, e.new_string).text,
                        'diff', { path: true });
            });
        } else if (short === 'Write') {
            ioBlock(parent, shortPath(String(a.file_path || '')) || 'content', a.content, langOfPath(a.file_path), { path: true });
        } else if (short === 'run_script') {
            ioBlock(parent, 'script', a.code, 'js');
        } else if (Object.keys(a).length) {
            ioBlock(parent, 'input', shortAll(JSON.stringify(a, null, 2)), 'json');
        }
    }
    function renderToolBody(body, st) {
        body.textContent = '';
        var short = toolShort(st.name);
        renderToolInput(body, st.name, st.input);
        if (st.log) {
            ioBlock(body, 'log', cleanOutput(st.log), 'log');
            var pre = body.lastChild.querySelector('pre');
            if (pre) pre.scrollTop = pre.scrollHeight;
        }
        if (st.result == null) { if (!st.log) ioNote(body, 'running…'); return; }
        var text = cleanOutput(st.result), label = st.isError ? 'error' : 'output', opts = { err: st.isError };
        if (!text) { ioNote(body, st.isError ? 'failed without a message' : 'no output'); return; }
        var numbered = short === 'Read' && !st.isError ? splitNumbered(text) : null, json;
        // "the file has been updated": a line, not a block
        if (/^(Edit|MultiEdit|Write|NotebookEdit)$/.test(short) && !st.isError && text.length < 400) ioNote(body, text);
        else if (numbered) ioBlock(body, label, numbered.src, langOfPath(st.input.file_path), { numbers: numbered.numbers });
        else if (short === 'read_log' && (json = safeParse(text)) && Array.isArray(json.lines))
            ioBlock(body, 'log · ' + json.shown + ' of ' + json.totalKept + ' lines', json.lines.join('\n') || json.note || '', 'log', opts);
        else if ((json = prettyJson(text))) ioBlock(body, st.isError ? 'error' : 'result', json, 'json', opts);
        else if (short === 'Grep' && !st.isError) ioBlock(body, label, text, 'grep');
        else ioBlock(body, label, text, '', opts);
    }
    function safeParse(text) { try { return JSON.parse(text); } catch (e) { return null; } }
    function fmtTook(ms) {
        if (ms < 1500) return ms + ' ms';
        if (ms < 60000) return (ms / 1000).toFixed(1) + ' s';
        return Math.floor(ms / 60000) + ' min ' + Math.round(ms % 60000 / 1000) + ' s';
    }
    function addToolStep(ev) {
        var st = { started: ev.t || Date.now(), name: ev.name, input: ev.input || {}, result: null, isError: false, log: '' };
        st.ui = addStep('', '', { tool: (ev.sub ? '↳ ' : '') + toolShort(ev.name), dev: ev.name === 'ToolSearch',
                                  kind: 'tool running' + (ev.sub ? ' sub' : ''),
                                  render: function (body) { renderToolBody(body, st); } });
        st.ui.setLabelHtml(toolSummary(ev.name, st.input));
        return st;
    }
    // what a long tool printed since the last time: the row's last line, and its log when open
    var LOG_KEEP = 300 * 1024;
    function toolProgress(st, ev) {
        st.log = (ev.replace ? '' : st.log) + String(ev.text == null ? '' : ev.text);
        if (st.log.length > LOG_KEEP) st.log = st.log.slice(st.log.indexOf('\n', st.log.length - LOG_KEEP) + 1);
        var lines = cleanOutput(st.log.slice(-2000)).split('\n'), last = lines[lines.length - 1] || '';
        st.ui.setLive(last.slice(0, 200));
        if (running && last) setAction(humanAction(st.name, st.input) + ' — ' + last.slice(0, 80));
        if (!st.redraw) st.redraw = setTimeout(function () { st.redraw = null; st.ui.redraw(); }, 250);
    }

    // ---------- the stream from the server ----------
    var events = [];          // everything received, for the Log button
    var source = null;
    var steps = {};           // tool_use id -> ui step
    var bubble = null, bubbleText = '';
    var reviewStep = null, reviewText = '';
    var thinkStep = null, thinkText = '';
    var runStarted = 0, runTools = 0, lastPrompt = '';

    // ---------- the agent's own page (o2 portal) ----------
    // A hidden page the portal opens for the agent (boot.js: o2Headless; o2portal backend/src/portal/headless.ts): a turn
    // works HERE while the people of the project keep their editor and their game to themselves, and it stands in when
    // nobody has the project open. It is the agent's hands and nothing else: no chat is drawn, no event is
    // kept, and of the stream only the tool requests and the changed files matter. JOINING THE STREAM IS ITS
    // "READY FOR TOOLS": the server holds the requests back until then, so the page joins only once the editor
    // runs and draws (headlessJoin).
    var HEADLESS = !!window.o2Headless;
    var retired = false, calm = null, atWork = 0, lastTool = 0, theirs = false;
    // The tools that need the engine's loop to turn: a scene opens over several frames, a game is played and looked at.
    // The rest are answered by a call into the engine and are not worth a frame — drawn in software, one costs a third
    // of a core-second (boot.js), and the box is small.
    var LOOP_TOOLS = { screenshot: 1, open_scene: 1, save_scene: 1, play_mode: 1, restart: 1, set_mode: 1,
                       click: 1, type_text: 1, press_key: 1, wait: 1 };
    // Between the tools: a game that runs - play mode, the game client - goes on running, so that what the agent looks at
    // next is a game that has lived through the pause, not one frozen when the last tool returned. At the host's `play` rate
    // and for its `hold` seconds after the last tool (a turn that waits an hour for a permission does not play on); nothing
    // runs: the idle rate. The face behind the other one idles either way (boot.js: cap.behind).
    function restRate() {
        var cap = window.__o2FrameCap, live = false;
        try { live = Date.now() - lastTool < cap.hold * 1000 && isPlaying(); } catch (e) {}
        cap.rate(live ? cap.play : cap.idle);
        if (live) calm = setTimeout(restRate, 5000);
    }
    function onHeadlessEvent(ev) {
        // a person's page has joined and takes a stand-in over: what is running here finishes, nothing new starts
        if (ev.type === 'headless_retire') retired = true;
        // Files changed on the server - by the agent, or saved in somebody's editor (from: 'page') - go into this editor's copy,
        // or the next rebuild would build the old ones. The agent builds what it wrote itself (rebuild_assets, as its prompt
        // says); what PEOPLE saved it knows nothing of, so that is built here before its next tool looks at the project.
        else if (ev.type === 'fs') { pullFiles(ev); if (ev.from === 'page') theirs = true; }
        else if (ev.type === 'tool_request' && !retired) {
            var cap = window.__o2FrameCap, loop = !!LOOP_TOOLS[ev.name];
            clearTimeout(calm);
            if (loop) { atWork++; cap.rate(cap.busy); }
            var ahead = theirs && ev.name !== 'rebuild_assets' && ev.name !== 'read_log' && ev.name !== 'wait'
                ? buildPulled('files were saved in somebody\'s editor') : Promise.resolve();
            theirs = false;
            ahead.then(function () { return runBrowserTool(ev); }).then(function () {
                lastTool = Date.now();
                if (loop) atWork--;
                if (!atWork) calm = setTimeout(restRate, 3000);
            });
        }
    }
    // which window draws for nothing: the face that is not in front (both engines stay loaded, boot.js caps each)
    if (HEADLESS) window.__o2FrameCap.behind = function (w) {
        try { return (w === window) === (typeof o2Preview !== 'undefined' && o2Preview.isActive()); } catch (e) { return false; }
    };
    var ranAt = 0;
    function toolsReady() {
        if (typeof Module === 'undefined' || !Module.calledRun) return false;
        // the overlay is up while the editor loads — and while a project that was never built is built before it starts over
        if (!document.getElementById('status').classList.contains('hidden')) return false;
        if (window.__o2FrameCap.frames < 10) return false;
        // ... and it has drawn itself: the first frames of a cold start are one flat colour, and a screenshot asked for then
        // would spend seconds waiting for a picture (not insisted on for ever: a project may well draw nothing)
        ranAt = ranAt || Date.now();
        if (Date.now() - ranAt > 20000) return true;
        try {
            var t = document.createElement('canvas');
            t.width = t.height = 24;
            var g = t.getContext('2d');
            g.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, 24, 24);
            var d = g.getImageData(0, 0, 24, 24).data;
            for (var i = 4; i < d.length; i += 4)
                if (Math.abs(d[i] - d[0]) + Math.abs(d[i + 1] - d[1]) + Math.abs(d[i + 2] - d[2]) > 6) return true;
            return false;
        } catch (e) { return true; }
    }
    function headlessJoin() {
        if (!toolsReady()) { setTimeout(headlessJoin, 250); return; }
        ensureStream();
        calm = setTimeout(function () { if (!atWork) restRate(); }, 5000);
        // the other face has come to the front: its next frame is due at the front's rate, not seconds away
        try { o2Preview.onChange(function () { window.__o2FrameCap.rate(window.__o2FrameCap.fps); }); } catch (e) {}
    }

    var subToken = null;      // this stream's name on the server (hello.sub): what `watch` and `start` call it by
    var streamChat = null;    // the chat the stream was last told to follow
    var retryMs = 1000;

    // one event on its way to the screen, replayed or live
    function feed(ev) {
        events.push(ev);
        if (devMode && ev.type !== 'delta' && ev.type !== 'thinking')
            addStep('◇ ' + ev.type, JSON.stringify(ev, null, 2), { dev: true });
        try { onEvent(ev); } catch (err) { console.error('[ai] event failed', ev, err); }
    }
    function onStreamEvent(ev) {
        // The portal page around this frame shows the project's files too (its Git tab): it is told what the agent
        // wrote, whatever chat this panel shows, so the files are there at once and not at its next poll.
        if (ev.type === 'fs' && window.parent !== window) {
            try { parent.postMessage({ o2shell: 'fs', changed: ev.changed || (ev.path ? [ev.path] : []), deleted: ev.deleted || [] }, location.origin); } catch (e) {}
        }
        if (ev.type === 'chats') { loadChatsSoon(); return; }
        if (ev.type === 'gone') {
            // deleted, here or by somebody else; a list that was open stays open over the new chat
            var listed = chatListEl.classList.contains('open');
            if (ev.chat === curChat && lastSeq) newChat();
            if (listed) openChatList(true); else loadChatsSoon();
            return;
        }
        // further behind than the stream carries: read the chat again
        if (ev.type === 'reload') { if (ev.chat === curChat && !replaying) openChat(curChat); return; }
        // Another page of this working copy saved or removed a file - the agent's own editor, somebody else's: into this
        // editor's copy, and no part of any chat. Built when the agent's page has built, or with the next build here.
        if (ev.type === 'fs' && ev.from === 'page') { pullFiles(ev); return; }
        // the agent's own page has built the assets: this editor builds its copy of what it pulled meanwhile
        if (ev.type === 'assets_built') { buildPulled('the agent\'s editor has built them'); return; }
        // an editor tool is for whichever page is there, whatever chat it shows
        if (ev.chat && ev.type !== 'tool_request') {
            if (ev.chat !== curChat || replaying) {
                // so is a changed file: the editor behind the panel is the same one (once the chat is followed it comes again, as drawn)
                if (ev.type === 'fs' && ev.chat !== curChat) pullFiles(ev);
                return;
            }
            if (!ev.live) {
                if (ev.seq <= lastSeq) return;                              // drawn already
                if (ev.seq > lastSeq + 1) { openChat(curChat); return; }    // a hole: never draw around it
                lastSeq = ev.seq;
            }
        }
        feed(ev);
    }
    // The browser's own reconnect would come back with the URL the stream was opened with; what has been drawn since
    // is in lastSeq, so a dropped stream is closed and opened again from there - nothing twice, nothing missed.
    function ensureStream() {
        if (source && source.readyState !== 2) return;
        subToken = null;
        streamChat = replaying ? null : curChat;
        var mine = source = new EventSource(o2Base + '/api/agent/stream' + (streamChat ? '?chat=' + streamChat + '&after=' + lastSeq : ''));
        mine.onmessage = function (e) {
            var ev;
            try { ev = JSON.parse(e.data); } catch (err) { return; }
            if (HEADLESS) { onHeadlessEvent(ev); return; }
            if (source === mine) onStreamEvent(ev);
        };
        mine.onerror = function () {
            if (running) { setChip('connection lost…', 'err'); setAction('reconnecting'); }
            mine.close();
            if (source !== mine) return;
            source = null;
            setTimeout(ensureStream, retryMs);
            retryMs = Math.min(retryMs * 2, 15000);
        };
    }
    // the stream follows the chat on screen, from what is drawn of it
    function follow() {
        if (replaying) return;
        if (!source || source.readyState === 2) { ensureStream(); return; }
        if (!subToken) return;                                  // it has not said hello yet: it is told there
        streamChat = curChat;
        post('watch', { sub: subToken, chat: curChat, after: lastSeq }).then(function (r) {
            if (!r.ok && source) { source.close(); source = null; ensureStream(); }
        }).catch(function () {});
    }

    var typingEl = null;
    function showTyping() {
        if (typingEl) return;
        clearEmptyState();
        typingEl = document.createElement('div');
        typingEl.className = 'ai-typing';
        typingEl.innerHTML = '<i></i><i></i><i></i>';
        chatEl.appendChild(typingEl);
        scrollDown();
    }
    function hideTyping() {
        if (typingEl) { typingEl.remove(); typingEl = null; }
    }

    function currentBubble() {
        hideTyping();
        if (!bubble) { clearEmptyState(); bubble = addMsg('model', ''); bubbleText = ''; }
        return bubble;
    }
    // the answer reads as markdown while it is being written, redrawn a few times a second
    var bubbleTimer = null;
    function paintBubble() {
        if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null; }
        if (bubble && bubbleText) { setMarkdown(bubble, bubbleText); scrollDown(); }
    }
    function closeBubble() { paintBubble(); bubble = null; bubbleText = ''; }

    // Whose hands: where the running turn's editor tools go, as the server says it (`agent_page`, and `hello` for a page
    // that joins in the middle) - the agent's own hidden editor, or the pages people have open, this one among them.
    var hands = null;
    function setHands(h) {
        hands = h;
        metaEl.title = !h ? ''
            : h.where === 'own' ? 'The agent works in a hidden editor and game of its own' + (h.host ? ' (on ' + h.host + ')' : '') +
                                  ': yours stay as you left them, and its changes reach them through the files'
            : 'The agent drives the editor pages that are open, this one among them' + (h.why ? ': ' + h.why : '');
        tickMeta();
    }
    function tickMeta() {
        if (!running) return;
        var s = Math.round((Date.now() - runStarted) / 1000);
        setMeta(runTools + (runTools === 1 ? ' action' : ' actions') + ' · ' +
                (s < 60 ? s + ' s' : Math.floor(s / 60) + ' min ' + (s % 60) + ' s') +
                (!hands ? '' : hands.where !== 'own' ? ' · in your editor' : hands.state === 'starting' ? ' · its own editor is starting…' : ' · in its own editor'));
    }
    setInterval(tickMeta, 1000);

    function onEvent(ev) {
        switch (ev.type) {
            case 'hello':
                subToken = ev.sub || null;
                retryMs = 1000;
                // the server can give the agent an editor of its own: the switch is offered, and where a running turn works is shown
                document.getElementById('row-own').classList.toggle('hidden', !ev.ownPages);
                document.getElementById('hint-own').classList.toggle('hidden', !ev.ownPages);
                setHands(ev.hands || null);
                // back after a drop: the chip said so; a question still open is what the turn waits for. And the server
                // says whether a turn runs at all: a `done` lost with the stream would leave this panel "working" for good
                if (running && !(ev.running && (!ev.runChat || ev.runChat === curChat))) settleRun();
                else if (running && !Object.keys(permissionBlocks).length && !Object.keys(questionBlocks).length) { setChip('working', 'busy'); setAction('working…'); }
                else if (running) setChip('waiting for you', 'busy');
                if (streamChat !== curChat) follow();
                bootChats();
                break;
            case 'user':
                // (the review's own prompt is not part of the conversation)
                if (ev.review) break;
                lastPrompt = ev.text;
                if (!replaying && ev.cid && sentCids[ev.cid]) { delete sentCids[ev.cid]; break; }
                var um = addMsg('user', ev.text);
                // in a shared project somebody else may have said it
                if (ev.by && ev.by.name && me && ev.by.id !== me.id) um.dataset.by = ev.by.name;
                break;
            case 'started':
                if (!ev.review) resetChanges();
                if (replaying) { runStarted = ev.t || Date.now(); runTools = 0; break; }
                if (!running) { busy(true); setAction(ev.review ? 'reviewing its own run' : 'working…'); }
                break;
            case 'note':
                addSysLine(ev.text, ev.kind);
                break;
            case 'shot':
                if (ev.dropped) addShotNote('no longer kept: the chat outgrew its size cap');
                else addShotSrc(o2Base + '/api/agent/' + ev.url);
                break;
            case 'shot_note':
                addShotNote(SHOT_WHY_SHORT[ev.reason] || ev.why || '');
                break;
            case 'init':
                if (ev.cwd) sessionCwd = ev.cwd;
                addStep('· session · ' + ev.model + ' · Claude Code ' + ev.version + ' · ' + (ev.tools || []).length +
                        ' tools · ' + ev.mode + ' · ' + (ev.auth || (ev.apiKeySource === 'none' ? 'host' : 'api key')),
                        JSON.stringify({ tools: ev.tools, mcp: ev.mcp, slash_commands: ev.slash }, null, 2),
                        { dev: true });
                break;
            case 'thinking':
                hideTyping();
                if (!thinkStep) { thinkStep = addStep('thinking…', '', { markdown: true, kind: 'thinking', dev: true }); thinkText = ''; }
                // replace: the whole block - as the transcript keeps it, or what a page that joins now has missed of it
                thinkText = ev.replace ? ev.text : thinkText + ev.text;
                thinkStep.set(thinkText);
                setAction('thinking');
                break;
            case 'delta':
                if (ev.review) { reviewText = ev.replace ? ev.text : reviewText + ev.text; if (reviewStep) reviewStep.set(reviewText); break; }
                if (ev.sub) break;                      // subagent chatter stays in the steps
                currentBubble();
                bubbleText = ev.replace ? ev.text : bubbleText + ev.text;
                if (!bubble.firstChild) paintBubble();
                else if (!bubbleTimer) bubbleTimer = setTimeout(paintBubble, 100);
                break;
            case 'text':
                if (thinkStep) {
                    thinkStep.setLabel('thinking · ' + (thinkText.replace(/[#*`]/g, '').split('\n')
                        .filter(function (l) { return l.trim(); })[0] || 'reasoning').slice(0, 90));
                    thinkStep = null;
                }
                if (ev.review) {
                    reviewText = ev.text;
                    if (!reviewStep) reviewStep = addStep('self-review of the run', '', { markdown: true, kind: 'review', open: true });
                    reviewStep.set(reviewText);
                    break;
                }
                if (ev.sub) { addStep('  ↳ subtask replied', ev.text, { dev: true }); break; }
                lastReply = ev.text;
                currentBubble();
                bubbleText = ev.text;
                closeBubble();
                break;
            case 'tool_use': {
                hideTyping();
                if (bubble) closeBubble();
                thinkStep = null;
                // the question itself is the card that follows; a tool row would say it twice
                if (toolShort(ev.name) === 'ask_user') { steps[ev.id] = { hidden: true, name: ev.name, log: '', started: Date.now() }; break; }
                runTools++;
                steps[ev.id] = addToolStep(ev);
                // the model's own tool lookups say nothing about the task
                if (ev.name !== 'ToolSearch') { setAction(humanAction(ev.name, ev.input)); tickMeta(); }
                break;
            }
            case 'tool_progress': {
                var ps = ev.id != null && steps[ev.id];
                if (!ps) for (var sid in steps)
                    if (steps[sid].result == null && toolShort(steps[sid].name) === toolShort(ev.name || '')) ps = steps[sid];
                // the tail the transcript keeps of a log this page has followed whole: the page's own is the better one
                if (ps && !(ev.replace && !ev.live && ps.log.length > String(ev.text || '').length)) toolProgress(ps, ev);
                break;
            }
            case 'tool_result': {
                var st = steps[ev.id];
                if (!st || st.hidden) break;
                st.result = ev.text == null ? '' : ev.text;
                // a tool that answers { ok: false } or { error } failed, whatever the transport says
                var answer = /^\s*\{/.test(st.result) ? safeParse(st.result) : null;
                st.isError = !!ev.is_error || !!(answer && (answer.ok === false || answer.error));
                st.ui.setTime((st.isError ? 'failed · ' : '') + fmtTook(Math.max(0, (ev.t || Date.now()) - st.started)));
                st.ui.settle();
                if (st.isError) st.ui.fail();
                st.ui.redraw();
                if (running) setAction('working…');
                break;
            }
            case 'tool_request':
                runBrowserTool(ev);
                break;
            case 'fs':
                // (a replay only lists them: the editor was loaded with these files as they are now)
                if (!replaying) pullFiles(ev);
                (ev.changed || (ev.path ? [ev.path] : [])).forEach(function (p) { noteChange(p, 'edit'); });
                (ev.deleted || []).forEach(function (p) { noteChange(p, 'delete'); });
                break;
            case 'agent_page':
                setHands(ev.where ? ev : null);
                break;
            case 'queued':
                if (ev.review) break;               // the review's own prompt waits unseen, as it is sent unseen
                addSysLine('message queued (' + ev.position + ') — it is sent as soon as ' +
                           (ev.behind ? 'the agent is done in “' + ev.behind + '”' : 'this turn ends'));
                break;
            case 'permission_request':
                hideTyping();
                showPermission(ev);
                break;
            case 'question_request':
                showQuestion(ev);
                break;
            case 'question_resolved':
                resolveQuestionUi(ev);
                break;
            case 'permission_resolved':
                resolvePermissionUi(ev.id, ev.behavior);
                break;
            case 'result': {
                var u = ev.usage || {};
                var cost = ev.cost != null ? '$' + ev.cost.toFixed(3) : '';
                addStep('· ' + ev.subtype + ' · ' + ev.turns + ' turns · ' + Math.round((ev.ms || 0) / 1000) + ' s · ' + cost +
                        ' · in ' + (u.input_tokens || 0) + ' (+' + (u.cache_read_input_tokens || 0) + ' cached) / out ' +
                        (u.output_tokens || 0) + ' tok', JSON.stringify(ev, null, 2), { dev: true });
                lastResult = ev;
                if (ev.denials && ev.denials.length)
                    addSysLine('⊘ the permission guard refused: ' + ev.denials.map(toolShort).join(', '), 'warn');
                break;
            }
            case 'error':
                lastError = ev.message;
                break;
            case 'done':
                finishRun(ev);
                break;
        }
    }

    function runBrowserTool(ev) {
        var impl = EXEC[ev.name];
        // a face nobody looks at gets no frames (boot.js: o2Power): a tool gets them for as long as it runs
        var letGo = window.o2Power ? o2Power.hold() : function () {};
        return Promise.resolve().then(function () {
            if (!impl) throw new Error('no such editor tool: ' + ev.name);
            return impl(ev.args || {});
        }).then(function (out) {
            // A run's screenshot is drawn when the server says it is kept ('shot' / 'shot_note', by URL) - the same for
            // the page that took it, a page that shows the chat elsewhere and a replay. Only a request that belongs to
            // no chat (a local Claude Code driving this tab) is drawn here.
            var draw = !ev.chat && !HEADLESS;
            if (out && out.image) {
                // what the chat cannot show the model does not get either: an empty image fails the whole request
                if (validShot(out.image.b64, out.image.mime)) { if (draw) addShot(out.image.b64, out.image.mime); }
                else { if (draw) addShotNote(SHOT_WHY_SHORT.failed); out = { error: 'screenshot unavailable: ' + SHOT_WHY.failed, reason: 'failed' }; }
            } else if (ev.name === 'screenshot' && draw) addShotNote(SHOT_WHY_SHORT[out && out.reason] || '');
            return post('tool_result', { id: ev.id, result: out });
        }, function (e) {
            return post('tool_result', { id: ev.id, result: { error: String(e && e.message || e) } });
        }).catch(function (e) { console.error('[ai] tool_result post failed', e); }).then(letGo);
    }

    function post(what, body) {
        return fetch(o2Base + '/api/agent/' + what, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
        }).then(function (r) {
            return r.json().then(function (j) {
                if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
                return j;
            });
        });
    }

    function busy(on) {
        running = on;
        if (on) watchSettle();
        document.getElementById('ai-toggle').classList.toggle('busy', on);
        barEl.classList.toggle('show', on);
        sendBtn.classList.toggle('queue', on);
        sendBtn.title = on ? 'Queued until the current turn ends' : 'Send (Enter)';
        paintPlaceholder();
        if (on) { setChip('working', 'busy'); runStarted = Date.now(); runTools = 0; tickMeta(); showTyping(); lastReply = ''; setPeek('busy', 'working…'); }
        else {
            hideTyping(); setChip('ready'); setMeta(''); loadChats();
            // what is left above the row: the failure, or what the agent said last
            if (!peekState || peekState.kind !== 'error') setPeek(lastReply ? 'reply' : null, firstSentence(lastReply));
        }
    }

    // ---------- a run from start to finish ----------
    var pendingReview = false, lastError = null, lastResult = null;

    // A failed turn should read as failed: report it in the user's words,
    // offer the retry, and never chase it with a self-review of nothing
    function runLine(what, r) {
        var files = Object.keys(changed).length, s = Math.round(((r && r.ms) || 0) / 1000);
        return what + ' · ' + (s < 60 ? s + ' s' : Math.floor(s / 60) + ' min ' + (s % 60) + ' s') +
               (runTools ? ' · ' + runTools + (runTools === 1 ? ' action' : ' actions') : '') +
               (files ? ' · ' + files + (files === 1 ? ' file changed' : ' files changed') : '') +
               (r && r.cost != null ? ' · $' + r.cost.toFixed(3) : '');
    }
    function finishRun(ev) {
        // what the agent wrote and nobody built here (its own editor builds its own copy): this editor shows the run's outcome
        if (!replaying) buildPulled('the agent\'s run is over');
        closeBubble(); thinkStep = null;
        for (var sid in steps) if (steps[sid].result == null) steps[sid].ui.settle();      // nothing is still running
        steps = {};
        for (var id in permissionBlocks) { permissionBlocks[id].remove(); delete permissionBlocks[id]; }

        var failed = lastError || (lastResult && lastResult.subtype !== 'success');
        // (a replayed run starts nothing: its review, if it had one, is further down the transcript)
        if (!replaying && !ev.review && !ev.aborted && !failed && pendingReview) {
            if (lastResult) addSysLine(runLine('done', lastResult));
            pendingReview = false;
            reviewStep = null; reviewText = '';
            startRun(REVIEW_PROMPT, true);
            return;
        }
        pendingReview = false;
        if (ev.review) reviewStep = null;

        if (ev.aborted) {
            addSysLine('stopped — the turn was interrupted at your request', 'warn');
        } else if (failed) {
            var msg = lastError || (lastResult && (lastResult.errors || []).join('\n')) || 'the turn ended with an error';
            var overloaded = /529|overload|rate.?limit|429/i.test(msg);
            var prompt = lastPrompt;
            addError(msg, {
                head: overloaded ? 'The model is overloaded' : 'The turn failed',
                retry: prompt ? function () { runAgent(prompt, true); } : null,
            });
            setChip('error', 'err');
        }
        var summary = null;
        if (!failed && !ev.aborted && lastResult) {
            var c = lastResult.cost != null ? ' · $' + lastResult.cost.toFixed(3) : '';
            summary = 'done · ' + Math.round((lastResult.ms || 0) / 1000) + ' s' + c;
            addSysLine(runLine(ev.review ? 'review done' : 'done', lastResult));
        }
        lastError = null; lastResult = null;
        if (replaying) return;
        busy(false);
        if (failed) setChip('error', 'err');
        else if (summary) setChip(summary);
    }

    function credentials() {
        var c = authMode === 'sub'
            ? { oauthToken: cleanSecret(oauthEl.value) }
            : { apiKey: cleanSecret(keyEl.value), workspaceId: cleanSecret(workspaceEl.value) };
        var gemini = cleanSecret(geminiEl.value);
        if (gemini) c.geminiKey = gemini;
        return c;
    }

    // the Changes window commits on the same credential and model (shell/git.js)
    window.o2AiCredentials = function () {
        var c = credentials();
        return { apiKey: c.apiKey || '', oauthToken: c.oauthToken || '', workspaceId: c.workspaceId || '' };
    };
    window.o2AiModel = function () { return modelDd.get() || DEFAULT_MODEL; };

    // What goes to /api/agent/start. The first message of a new chat names the chat itself, so this page can follow
    // it from its first event; `cid` marks a message already drawn here, so its echo from the server is not drawn again.
    function startBody(text, review, cid) {
        var fresh = !curChat;
        if (fresh) { curChat = newId(); lastSeq = 0; remember(curChat); }
        return { fresh: fresh, body: Object.assign({ text: text, model: modelDd.get() || DEFAULT_MODEL, effort: effortDd.get(),
                                                    mode: modeDd.get(), review: !!review, clarify: clarifyToggle.get(), chat: curChat, cid: cid, sub: subToken || undefined,
                                                    ownEditor: ownToggle.get() },
                                                  credentials()) };
    }
    async function startRun(text, review, cid) {
        var req = startBody(text, review, cid), chat = curChat;
        setSetting('o2ai_claude_model', req.body.model);
        ensureStream();
        busy(true);
        setAction(review ? 'reviewing its own run' : 'starting: ' + req.body.model);
        try {
            var r = await post('start', req.body);
            if (chat !== curChat) return;                  // another chat was opened meanwhile
            // (the server has put this stream on a chat it made; asked again, it sends only what is not drawn yet)
            if (req.fresh) { streamChat = null; follow(); }
            // the agent is at work in another chat of this project: the message waits for its turn
            if (r.queued) { busy(false); setChip('queued'); }
        } catch (e) {
            if (cid) delete sentCids[cid];
            if (chat !== curChat) return;
            addError(e.message, { retry: function () { startRun(text, review); } });
            busy(false);
            setChip('error', 'err');
        }
    }

    // ---------- attachments ----------
    // A file the visitor drops in is written into their own session copy, where
    // Claude's ordinary Read reaches it: an image it can look at, a log it can
    // grep. The list travels with the message as plain paths.
    var attachments = [];          // { name, path, size }
    var attachListEl = document.getElementById('ai-attach-list');
    var attachInput = document.getElementById('ai-attach-input');
    var ATTACH_DIR = 'Work/uploads';
    var ATTACH_MAX = 32 * 1024 * 1024;

    function safeName(name) {
        return String(name).replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, '_').slice(-80) || 'file';
    }
    function humanSize(n) {
        return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
    }
    function renderAttachments() {
        attachListEl.innerHTML = '';
        attachListEl.classList.toggle('show', attachments.length > 0);
        attachments.forEach(function (a, i) {
            var chip = document.createElement('span');
            chip.className = 'ai-attach-chip' + (a.pending ? ' pending' : '') + (a.error ? ' err' : '');
            chip.title = a.error || a.path;
            chip.appendChild(icon('file'));
            var label = document.createElement('span');
            label.textContent = a.name + (a.error ? ' — failed' : a.pending ? ' — uploading…' : ' · ' + humanSize(a.size));
            chip.appendChild(label);
            var x = document.createElement('button');
            x.type = 'button';
            x.title = 'Remove';
            x.innerHTML = ICONS_CLOSE;
            x.onclick = function () { attachments.splice(i, 1); renderAttachments(); };
            chip.appendChild(x);
            attachListEl.appendChild(chip);
        });
    }
    function addFiles(files) {
        Array.prototype.forEach.call(files, function (f) {
            if (f.size > ATTACH_MAX) {
                addError('"' + f.name + '" is ' + humanSize(f.size) + ' — the limit for an attachment is ' + humanSize(ATTACH_MAX) + '.',
                         { head: 'File too large' });
                return;
            }
            var stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
            var rec = { name: f.name, size: f.size, pending: true,
                        path: ATTACH_DIR + '/' + stamp + '-' + safeName(f.name) };
            attachments.push(rec);
            renderAttachments();
            f.arrayBuffer().then(function (buf) {
                return fetch(o2Base + '/api/fs/write?path=' + encodeURIComponent('/project/' + rec.path), {
                    method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: buf,
                });
            }).then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                rec.pending = false;
                renderAttachments();
            }).catch(function (e) {
                rec.pending = false;
                rec.error = e.message;
                renderAttachments();
            });
        });
    }
    document.getElementById('ai-attach').onclick = function () { attachInput.click(); };
    attachInput.onchange = function () {
        if (attachInput.files && attachInput.files.length) addFiles(attachInput.files);
        attachInput.value = '';
    };
    // dropping onto the panel is the same thing
    dlg.addEventListener('dragover', function (e) {
        if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) {
            e.preventDefault();
            dlg.classList.add('dropping');
        }
    });
    dlg.addEventListener('dragleave', function (e) { if (e.target === dlg) dlg.classList.remove('dropping'); });
    dlg.addEventListener('drop', function (e) {
        if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
        e.preventDefault();
        dlg.classList.remove('dropping');
        addFiles(e.dataTransfer.files);
    });
    inputEl.addEventListener('paste', function (e) {
        var items = e.clipboardData && e.clipboardData.files;
        if (items && items.length) { e.preventDefault(); addFiles(items); }
    });

    // What the agent is told about them: paths in its own working copy
    function attachmentNote() {
        var ready = attachments.filter(function (a) { return !a.pending && !a.error; });
        if (!ready.length) return '';
        return '\n\nAttached files (in this working copy, read them with Read):\n' +
               ready.map(function (a) { return '- ' + a.path; }).join('\n');
    }
    function clearAttachments() { attachments = []; renderAttachments(); }
    function attachmentsPending() { return attachments.some(function (a) { return a.pending; }); }

    function runAgent(userText, isRetry) {
        if (!credential() && !/localhost|127\.0\.0\.1/.test(location.hostname)) {
            openSettings();
            (authMode === 'sub' ? oauthEl : keyEl).focus();
            addError(authMode === 'sub'
                ? 'Paste a subscription token in settings — run `claude setup-token` to mint one.'
                : 'Add your Anthropic API key in settings — the agent runs on it.',
                { head: 'Credential required' });
            return;
        }
        lastPrompt = userText;
        // drawn at once; a retry is said again by the server's echo, like anybody else's message
        var cid = isRetry ? '' : newId();
        if (cid) { sentCids[cid] = 1; addMsg('user', userText); }
        if (running) {
            // typed during a turn: the server queues it after the current one
            post('start', startBody(userText, false, cid).body).catch(function (e) { addError(e.message); });
            return;
        }
        resetChanges();
        pendingReview = reviewToggle.get();
        startRun(userText, false, cid);
    }

    // ---------- self-review ----------
    // One extra turn at the end of a run: the model critiques its own work,
    // which is where the useful signal for improving the agent lives.
    var REVIEW_PROMPT = [
        'The task is over. Step out of it and review your own run as an engineer would review a colleague.',
        'Answer in markdown, in the language of my first message, under these headings and nothing else:',
        '',
        '## Mistakes',
        'What you actually got wrong: wrong assumptions, calls that failed, things you had to redo.',
        'Write "none" if there were none.',
        '',
        '## Waste',
        'Where the run was inefficient: repeated lookups, reading what you already knew, exploring instead of acting,',
        'tools you should have used earlier or not at all.',
        '',
        '## What would have helped',
        'Knowledge or a tool that was missing and would have shortened the run - phrased so it can be added to the',
        'agent briefing or built as a new tool.',
        '',
        '## Advice for next time',
        'Two or three concrete rules you would follow on a similar task.',
        '',
        'Be blunt and concrete. Do not praise yourself, do not restate what the task was, do not repeat the summary.',
        'Do not use any tools for this.',
    ].join('\n');

    // ---------- UI wiring ----------
    // The panel is part of the layout now: it slides out of the way instead of
    // closing, and both faces of the session make room for it.
    function openDlg() {
        dlg.classList.add('open');
        document.body.classList.remove('ai-hidden');
        settle();
        // a focused field on a phone is a keyboard over the game
        if (!isMobile()) inputEl.focus();
        ensureStream();         // its hello is where the chats are loaded and one of them opened (bootChats)
        showEmptyState();
        if (!modelsLoaded) loadModels();
    }
    function closeDlg() {
        if (phoneOn) { setSheet(false); return; }
        document.body.classList.add('ai-hidden');
        settle();
    }
    // The panes grow into the freed space over a transition, and the engine only
    // reads its canvas on a resize: nudge it on the way and when the slide ends.
    function settle() {
        if (window.__o2LayoutChanged) window.__o2LayoutChanged();
        setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 120);
    }
    ['canvas-wrap', 'preview'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('transitionend', function (e) {
            if (e.propertyName === 'right') window.dispatchEvent(new Event('resize'));
        });
    });
    function toggleDlg() {
        if (phoneOn) { setSheet(!sheetOpen); return; }
        if (document.body.classList.contains('ai-hidden')) openDlg(); else closeDlg();
    }
    window.__o2ToggleAgent = toggleDlg;
    // on a phone the row is always there; what opens and closes is the sheet
    window.__o2AgentShown = function () {
        return phoneOn ? sheetOpen : !document.body.classList.contains('ai-hidden');
    };

    document.getElementById('ai-toggle').onclick = toggleDlg;

    // whole session as JSON: every event the server streamed
    document.getElementById('ai-log').onclick = function () {
        var dump = JSON.stringify({ model: modelDd.get(), events: events }, null, 2);
        console.log('[ai] session log', events);
        var btn = document.getElementById('ai-log');
        navigator.clipboard.writeText(dump).then(function () {
            btn.textContent = 'Copied';
            setTimeout(function () { btn.textContent = 'Copy log'; }, 1200);
        }, function () {
            // clipboard blocked (no focus / insecure origin): fall back to a download
            var a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([dump], { type: 'application/json' }));
            a.download = 'ai-session.json';
            a.click();
            URL.revokeObjectURL(a.href);
        });
    };
    stopBtn.onclick = function () {
        pendingReview = false;
        setAction('stopping…');
        post('stop', { chat: curChat }).catch(function () {});
    };
    function send() {
        var t = inputEl.value.trim();
        var note = attachmentNote();
        if (!t && !note) return;
        if (attachmentsPending()) {
            setAction('waiting for the attachments to upload…');
            setTimeout(send, 300);
            return;
        }
        inputEl.value = '';
        inputEl.style.height = '';
        clearAttachments();
        // sent from the row: the keyboard goes, the game and the status line stay
        if (phoneOn && !sheetOpen) inputEl.blur();
        runAgent((t || 'Take a look at the attached files.') + note);
    }
    sendBtn.onclick = send;
    var composerEl = document.getElementById('ai-composer');
    inputEl.addEventListener('focus', function () { composerEl.classList.add('focus'); });
    inputEl.addEventListener('blur', function () { composerEl.classList.remove('focus'); });
    inputEl.addEventListener('input', function () {
        inputEl.style.height = 'auto';
        inputEl.style.height = Math.min(inputEl.scrollHeight, 190) + 'px';
    });
    inputEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
        e.stopPropagation(); // don't leak typing into the engine
    });
    inputEl.addEventListener('keyup', function (e) { e.stopPropagation(); });
    applyDev();
    showEmptyState();

    // The agent is part of the page: it starts open on the right, in either mode.
    // (the server's own page has nobody to talk to: the stream alone, and the whole window for the canvas)
    if (HEADLESS) { document.body.classList.add('ai-hidden'); headlessJoin(); }
    else openDlg();

    if (typeof o2Preview !== 'undefined') o2Preview.onChange(function (kind) {
        if (kind === 'mode' || kind === 'mobile' || kind === 'solo') applyPhone();
    });
    applyPhone();
})();
