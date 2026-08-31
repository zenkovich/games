// AI agent: Claude Code runs on the server, scoped to this session's project;
// this file is its face in the page and its hands in the editor.
//
// The server streams the conversation over SSE (/api/agent/stream). File work
// happens there with Claude's own tools; anything that needs the running
// editor (screenshot, scene tree, run_script, play mode, asset rebuild...)
// arrives as a tool_request event, is executed here and posted back.

// ---- AI agent ------------------------------------------------------
(function () {
    var dlg = document.getElementById('ai');
    var back = document.getElementById('ai-back');
    var chatEl = document.getElementById('ai-chat');
    var statusEl = document.getElementById('ai-status');
    var inputEl = document.getElementById('ai-input');
    var sendBtn = document.getElementById('ai-send');
    var stopBtn = document.getElementById('ai-stop');
    var keyEl = document.getElementById('ai-key');
    var modelEl = document.getElementById('ai-model');
    var debugEl = document.getElementById('ai-debug');
    var rawEl = document.getElementById('ai-raw');
    var reviewEl = document.getElementById('ai-review');
    var canvas = document.getElementById('canvas');

    keyEl.placeholder = 'Anthropic API key (sk-ant-…)';
    keyEl.title = 'Your own Anthropic API key. It is sent to this server with each request and handed to the Claude Code process; usage is billed to your account.';

    // reasoning effort sits next to the model; built here so the markup
    // (linked into the wasm shell) stays untouched
    var effortEl = document.createElement('select');
    effortEl.id = 'ai-effort';
    effortEl.title = 'Reasoning effort';
    ['low', 'medium', 'high', 'xhigh', 'max'].forEach(function (e) {
        var o = document.createElement('option');
        o.value = e; o.textContent = e;
        effortEl.appendChild(o);
    });
    modelEl.parentNode.insertBefore(effortEl, modelEl.nextSibling.nextSibling);

    // "steps" expands/collapses every debug step, new ones follow it
    debugEl.onchange = function () {
        chatEl.querySelectorAll('.ai-step').forEach(function (s) {
            s.classList.toggle('open', debugEl.checked);
        });
    };
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

    // the Gemini-era key would be sent as an Anthropic key otherwise
    var savedKey = getSetting('o2ai_claude_key');
    keyEl.value = savedKey;
    var savedModel = getSetting('o2ai_claude_model');
    modelEl.value = savedModel || DEFAULT_MODEL;
    effortEl.value = getSetting('o2ai_effort') || 'high';
    keyEl.onchange = function () {
        setSetting('o2ai_claude_key', keyEl.value.trim());
        loadModels();
    };
    modelEl.onchange = function () { setSetting('o2ai_claude_model', modelEl.value.trim()); };
    effortEl.onchange = function () { setSetting('o2ai_effort', effortEl.value); };

    // ---------- model list ----------
    var modelsLoaded = false;
    function fillModels(names) {
        var list = document.getElementById('ai-models');
        list.innerHTML = '';
        names.forEach(function (n) {
            var o = document.createElement('option');
            o.value = n;
            list.appendChild(o);
        });
    }
    function loadModels() {
        var key = keyEl.value.trim();
        return fetch(o2Base + '/api/agent/models', { headers: key ? { 'X-Anthropic-Key': key } : {} })
            .then(function (r) { return r.json(); })
            .then(function (j) {
                fillModels(j.models || FALLBACK_MODELS);
                modelsLoaded = j.source === 'api';
            })
            .catch(function () { fillModels(FALLBACK_MODELS); });
    }
    fillModels(FALLBACK_MODELS);

    var running = false, aborted = false;

    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function scrollDown() { chatEl.scrollTop = chatEl.scrollHeight; }

    // ---------- markdown ----------
    function esc(s) {
        return s.replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }
    var ASSET_EXT = /\.(scn|proto|js|json|png|jpe?g|gif|webp|atlas|anim|ttf|otf|fntstyle|meta|mat|frag|vert|metal|glsl|txt|xml|md|ogg|wav|mp3)$/i;
    function looksLikeAsset(s) {
        s = s.trim();
        return !/\s{2,}|^https?:|^\//.test(s) && ASSET_EXT.test(s);
    }
    // the server-side paths Claude prints are session-absolute; the browser
    // knows them relative to Assets
    function assetRel(p) {
        var m = String(p).match(/(?:^|\/)Assets\/(.+)$/);
        return m ? m[1] : p;
    }
    function fileLink(path) {
        var rel = assetRel(path.trim());
        return '<span class="ai-file" data-path="' + esc(rel) + '">' + esc(path.trim()) + '</span>';
    }
    // inline markdown: code spans, links, bold, italic; asset paths become
    // clickable links into the assets browser
    function mdInline(src) {
        var out = '', rest = src, m;
        var re = /(`[^`]+`)|(\[([^\]]+)\]\(([^)\s]+)\))|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(__[^_]+__)/;
        while ((m = re.exec(rest))) {
            out += esc(rest.slice(0, m.index));
            var tok = m[0];
            if (m[1]) {
                var code = tok.slice(1, -1);
                out += looksLikeAsset(code) ? fileLink(code) : '<code>' + esc(code) + '</code>';
            } else if (m[2]) {
                var label = m[3], href = m[4];
                out += /^https?:/.test(href)
                    ? '<a href="' + esc(href) + '" target="_blank" rel="noopener">' + esc(label) + '</a>'
                    : '<span class="ai-file" data-path="' + esc(assetRel(href)) + '">' + esc(label) + '</span>';
            } else if (m[5]) out += '<b>' + esc(tok.slice(2, -2)) + '</b>';
            else if (m[6]) out += '<i>' + esc(tok.slice(1, -1)) + '</i>';
            else out += '<b>' + esc(tok.slice(2, -2)) + '</b>';
            rest = rest.slice(m.index + tok.length);
        }
        return out + esc(rest);
    }
    function renderMarkdown(src) {
        var html = '', lines = String(src).split('\n'), list = null;
        function closeList() { if (list) { html += '</' + list + '>'; list = null; } }
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            var fence = line.match(/^\s*```(\w*)/);
            if (fence) {                                   // fenced code block
                closeList();
                var buf = [];
                for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) buf.push(lines[i]);
                html += '<pre><code>' + esc(buf.join('\n')) + '</code></pre>';
                continue;
            }
            var h = line.match(/^(#{1,6})\s+(.*)$/);
            if (h) { closeList(); html += '<h' + Math.min(h[1].length, 3) + '>' + mdInline(h[2]) + '</h' + Math.min(h[1].length, 3) + '>'; continue; }
            if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { closeList(); html += '<hr>'; continue; }
            var ul = line.match(/^\s*[-*+]\s+(.*)$/);
            var ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
            if (ul || ol) {
                var want = ul ? 'ul' : 'ol';
                if (list !== want) { closeList(); html += '<' + want + '>'; list = want; }
                html += '<li>' + mdInline((ul || ol)[1]) + '</li>';
                continue;
            }
            closeList();
            if (!line.trim()) continue;
            html += '<p>' + mdInline(line) + '</p>';
        }
        closeList();
        return html;
    }

    function addMsg(cls, text) {
        var d = document.createElement('div');
        d.className = 'ai-m ' + cls;
        if (cls === 'model') d.innerHTML = renderMarkdown(text);
        else d.textContent = text;
        chatEl.appendChild(d);
        scrollDown();
        return d;
    }

    // a collapsible debug step: header with a summary, body with the details
    function addStep(label, detail, opts) {
        opts = opts || {};
        var step = document.createElement('div');
        step.className = 'ai-step' + (debugEl.checked || opts.open ? ' open' : '') +
                         (opts.kind ? ' ' + opts.kind : '');

        var head = document.createElement('div');
        head.className = 'ai-step-head';
        head.appendChild(svgIcon('#i-chev', 'icon ai-chev'));
        var lab = document.createElement('span');
        lab.className = 'ai-step-label';
        lab.textContent = label;
        head.appendChild(lab);

        var body = document.createElement('div');
        body.className = 'ai-step-body' + (opts.markdown ? ' md' : '');
        if (opts.markdown) body.innerHTML = renderMarkdown(detail || '');
        else body.textContent = detail || '';

        head.onclick = function () { step.classList.toggle('open'); };
        step.appendChild(head);
        step.appendChild(body);
        chatEl.appendChild(step);
        scrollDown();
        return {
            append: function (t) {
                if (opts.markdown) body.innerHTML += renderMarkdown(t);
                else body.textContent += (body.textContent ? '\n' : '') + t;
            },
            set: function (t) {
                if (opts.markdown) body.innerHTML = renderMarkdown(t);
                else body.textContent = t;
            },
            setLabel: function (t) { lab.textContent = t; },
            label: function () { return lab.textContent; },
            body: body,
        };
    }
    function addShot(b64, mime) {
        var img = document.createElement('img');
        img.className = 'ai-shot';
        img.src = 'data:' + mime + ';base64,' + b64;
        img.onclick = function () { img.classList.toggle('big'); };
        chatEl.appendChild(img);
        scrollDown();
    }
    function setStatus(t) { statusEl.textContent = t || ''; }

    // ---------- working rules for the model ----------
    // The server prepends the environment facts (paths, tool names); this is
    // the part about how to work in this project.
    var SYSTEM = [
        'You are the AI agent embedded into the web (WebAssembly) build of the o2 game editor, working on a game project',
        'built on the o2 engine. The editor UI is rendered into a canvas; the hosting page adds an assets browser and you.',
        '',
        'KNOW BEFORE YOU ACT. CLAUDE.md in the working directory holds briefings distilled from the engine documentation:',
        'project (what the project is, how C++ and JS split the work), assets (the JSON shape of scenes, prototypes and',
        '.meta, and the concrete ways to corrupt them), scripting (the JavaScript model, the real lifecycle hooks, the actor',
        'API), editor (windows, modes, hotkeys), particles (the emitter and how to configure one), workflows (recipes).',
        'The briefings are authoritative for what they state: field names, defaults, the JSON shape, which calls are',
        'scriptable. Do not re-verify them against the C++ headers - that is the single biggest source of wasted steps.',
        'Go to the engine sources only for what a briefing does not cover, and then read one targeted place.',
        '',
        'FACTS THAT BREAK THINGS SILENTLY IF YOU GET THEM WRONG:',
        '- A script file must define a class whose name equals the file name, assigned to the global without let/const:',
        '  Name = class Name extends o2.Component { ... }. The only lifecycle hooks are OnStart(), OnEnabled(),',
        '  OnDisabled() and Update(dt). Log with print(), not console.log, and never Dump() or enumerate the JS global.',
        '- A window script reports to C++ through the property C++ injects, named exactly `action`: this.action(\'close\').',
        '- Never change an asset uid, an actor Id or a PrototypeLink number, and always move a .meta together with its',
        '  file: every reference elsewhere is by uid and breaks quietly.',
        '',
        'HOW TO WORK - in three phases, not in a hundred small moves:',
        '1. Gather: read the matching briefing, find the files involved, read the parts you will change.',
        '2. Plan: one short paragraph - which files change, what each change is, how you will verify.',
        '3. Act in batches: apply the whole set of edits, then rebuild_assets once, then verify once with read_log',
        '   (and scene_tree / a screenshot only if the change is visual). A rebuild freezes the editor 10-20 s.',
        'When something fails, go back to gathering rather than trying variants of an API you have not looked up.',
        '',
        'WORKING RULES:',
        '- Asset content is loaded from the built copy: file changes need rebuild_assets to take effect.',
        '- After creating or changing a scene, open exactly that scene (open_scene) before play mode; scene_tree and',
        '  view_info report openScene - check it instead of assuming.',
        '- NEVER try to operate the editor with the cursor: menus, Assets, Tree and Properties ignore synthetic input.',
        '  click/type_text/press_key exist only to play the running game in the Game window during play mode.',
        '- To see the scene, read it with scene_tree and view_info; aim clicks from those numbers, never from a picture.',
        '- run_script executes JavaScript inside the engine right away; use it to inspect or change the scene and for',
        '  editor work no tool covers. It is not a text processor for files.',
        '- To watch runtime behaviour, play_mode({on:true}), wait, screenshot, play_mode({on:false}). Screenshots are',
        '  half size; click coordinates are full-size canvas pixels.',
        '',
        'Work autonomously: plan, use the tools, verify the result. Say plainly when something did not work or when you',
        'are unsure rather than reporting success. When done, reply with a short summary of what you changed and checked.',
        'Answer in the language of the user\'s message.',
    ].join('\n');

    // the briefings, shipped to the server as the working directory's CLAUDE.md
    function guidesMarkdown() {
        var g = window.AI_GUIDES || {};
        var out = ['# Project briefing for the agent', '',
                   'Read the section matching the job before engine-specific work. These notes are distilled from',
                   'o2/Docs and the engine sources and are authoritative for what they state.', ''];
        Object.keys(g).forEach(function (topic) {
            out.push('## ' + topic, '', g[topic], '');
        });
        return out.join('\n');
    }

    // ---------- editor-side tool implementations ----------
    // Claude's own tools do the file work on the server; these are the calls
    // that only make sense inside the running editor.

    function drainMirror() {
        // wait for the async MEMFS -> server mirror queue to settle
        return new Promise(function (resolve) {
            var q = window.__o2MirrorQueue || Promise.resolve();
            q.then(function () {
                // a rebuild may have queued more while we waited
                var again = window.__o2MirrorQueue || Promise.resolve();
                again.then(resolve, resolve);
            }, resolve);
        });
    }
    window.__o2DrainMirror = drainMirror;

    function rmTree(FS, dir) {
        var entries;
        try { entries = FS.readdir(dir); } catch (e) { return; }
        entries.forEach(function (n) {
            if (n === '.' || n === '..') return;
            var p = dir + '/' + n;
            var st = FS.stat(p);
            if (FS.isDir(st.mode)) { rmTree(FS, p); FS.rmdir(p); }
            else FS.unlink(p);
        });
    }
    function toolRebuild(a) {
        if (!Module || !Module._o2_web_rebuild_assets) throw new Error('editor not ready');
        var started = Date.now();
        return new Promise(function (resolve, reject) {
            setTimeout(function () {
                try {
                    if (a && a.force && Module._o2_web_rebuild_assets_forced)
                        Module._o2_web_rebuild_assets_forced();
                    else
                        Module._o2_web_rebuild_assets();
                } catch (e) { reject(e); return; }
                drainMirror().then(function () {
                    var errs = (window.engineLogLines || []).slice(-80)
                        .filter(function (l) { return /ERR|error|Error/.test(l); }).slice(-12);
                    resolve({ ok: true, ms: Date.now() - started, forced: !!(a && a.force),
                              recentErrors: errs });
                });
            }, 30);
        });
    }

    function toolScreenshot() {
        var w = Math.max(1, Math.round(canvas.width / 2)), h = Math.max(1, Math.round(canvas.height / 2));
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(canvas, 0, 0, w, h);
        var b64 = c.toDataURL('image/jpeg', 0.7).split(',')[1];
        addShot(b64, 'image/jpeg');
        return { image: { mime: 'image/jpeg', b64: b64 },
                 result: { width: w, height: h, fullWidth: canvas.width, fullHeight: canvas.height,
                           playing: isPlaying(), note: 'half-size image; click coordinates are full-size canvas pixels' } };
    }

    function isPlaying() {
        try { return !!(Module._o2_web_is_playing && Module._o2_web_is_playing()); } catch (e) { return false; }
    }
    // C++ exports that return a JSON string (allocated with strdup, freed here)
    function callJson(fn, args, types) {
        if (!Module || !Module[fn]) throw new Error('editor not ready (' + fn + ' missing)');
        var ptr = Module.ccall(fn.replace(/^_/, ''), 'number', types || [], args || []);
        if (!ptr) throw new Error(fn + ' returned null');
        var text = Module.UTF8ToString(ptr);
        try { Module._free(ptr); } catch (e) {}
        try { return JSON.parse(text); } catch (e) { return { raw: text }; }
    }
    function toolSceneTree(a) {
        a = a || {};
        return callJson('_o2_web_scene_dump', [a.path || '', Math.max(0, Math.min(20, a.depth == null ? 3 : a.depth))],
                        ['string', 'number']);
    }
    function toolViewInfo() {
        var info = callJson('_o2_web_view_info');
        var rect = canvas.getBoundingClientRect();
        info.canvas = { width: canvas.width, height: canvas.height,
                        cssWidth: Math.round(rect.width), cssHeight: Math.round(rect.height) };
        info.playing = isPlaying();
        info.howToAim = 'world -> canvas pixel: px = W/2 + (x - cam.x) * zoom, py = H/2 - (y - cam.y) * zoom, ' +
                        'then offset into the Game window rectangle when it is not the whole canvas';
        return info;
    }

    // BrowserJS runs code in the page global scope, so a bare `let` from one
    // call collides with the next: wrap the code in a function, keep console
    // semantics (last expression is the value) via eval, and let `return` work
    var SCRIPT_PRELUDE = [
        'var sceneRoots = (function(){ try { return o2.Scene.GetRootActors ? o2.Scene.GetRootActors() : (o2Scene && o2Scene.GetRootActors ? o2Scene.GetRootActors() : []); } catch (e) { return []; } })();',
        'function findActor(p) { try { return o2.Scene.FindActor ? o2.Scene.FindActor(p) : (o2Scene ? o2Scene.FindActor(p) : null); } catch (e) { return null; } }',
        'function eachActor(fn) { var walk = function (a) { fn(a); try { var ch = a.GetChildren(); for (var i = 0; i < ch.length; i++) walk(ch[i]); } catch (e) {} }; for (var i = 0; i < sceneRoots.length; i++) walk(sceneRoots[i]); }',
    ].join('\n');
    function toolRunScript(a) {
        if (!a || !a.code) throw new Error('code is required');
        var out = callJson('_o2_web_run_script', [SCRIPT_PRELUDE + '\n' + a.code], ['string']);
        if (out && out.error && /return/.test(a.code)) {
            // a top-level `return` only makes sense in a function body
            out = callJson('_o2_web_run_script', [SCRIPT_PRELUDE + '\n(function(){\n' + a.code + '\n})()'], ['string']);
        }
        if (out && typeof out.result === 'string' && out.result.length > 6000)
            out.result = out.result.slice(0, 6000) + '\n… truncated';
        return out;
    }

    function toolOpenScene(a) {
        if (!a || !a.path) throw new Error('path is required, e.g. Main.scn');
        var res = callJson('_o2_web_open_scene', [a.path], ['string']);
        return new Promise(function (resolve) {
            setTimeout(function () {
                var log = (window.engineLogLines || []).slice(-30);
                var failed = log.some(function (l) { return /Failed to load scene|Can't load scene/i.test(l); });
                if (failed && Module._o2_web_rebuild_assets_forced) {
                    // the incremental build index can list a file that is gone; heal and retry
                    try { Module._o2_web_rebuild_assets_forced(); } catch (e) {}
                    drainMirror().then(function () {
                        var again = callJson('_o2_web_open_scene', [a.path], ['string']);
                        again.healed = true;
                        resolve(again);
                    });
                    return;
                }
                res.openScene = a.path;
                resolve(res);
            }, 400);
        });
    }
    function toolSaveScene() { return callJson('_o2_web_save_scene'); }
    function toolPlayMode(a) {
        var on = !(a && a.on === false);
        if (!Module || !Module._o2_web_set_play) throw new Error('editor not ready');
        Module._o2_web_set_play(on ? 1 : 0);
        return sleep(600).then(function () {
            return { playing: isPlaying(), requested: on };
        });
    }

    function requirePlay(what) {
        if (!isPlaying())
            throw new Error(what + ' works only in play mode inside the Game window; the editor chrome ignores ' +
                            'synthetic input. Use the file tools, run_script and the editor tools instead.');
    }
    function focusCanvas() { try { canvas.focus(); } catch (e) {} }
    function fireMouse(type, cx, cy, extra) {
        var rect = canvas.getBoundingClientRect();
        var sx = rect.width / canvas.width, sy = rect.height / canvas.height;
        var init = Object.assign({ bubbles: true, cancelable: true, clientX: rect.left + cx * sx, clientY: rect.top + cy * sy,
                                   button: 0, buttons: 1, pointerId: 1, pointerType: 'mouse', isPrimary: true }, extra || {});
        canvas.dispatchEvent(new PointerEvent(type.replace('mouse', 'pointer'), init));
        canvas.dispatchEvent(new MouseEvent(type, init));
    }
    function toolClick(a) {
        requirePlay('click');
        var x = +a.x, y = +a.y;
        var button = a.button === 'right' ? 2 : 0;
        focusCanvas();
        return (async function () {
            var times = a.double ? 2 : 1;
            for (var i = 0; i < times; i++) {
                fireMouse('mousemove', x, y, { button: 0, buttons: 0 });
                await sleep(300);
                fireMouse('mousedown', x, y, { button: button, buttons: button === 2 ? 2 : 1 });
                await sleep(60);
                fireMouse('mouseup', x, y, { button: button, buttons: 0 });
                if (times > 1) await sleep(110);
            }
            await sleep(200);
            return { ok: true, x: x, y: y, button: a.button || 'left', double: !!a.double };
        })();
    }
    var CHAR_CODES = { ' ': 'Space', '.': 'Period', ',': 'Comma', '/': 'Slash', ';': 'Semicolon', "'": 'Quote',
                       '[': 'BracketLeft', ']': 'BracketRight', '\\': 'Backslash', '-': 'Minus', '=': 'Equal',
                       '`': 'Backquote' };
    function codeForChar(ch) {
        if (/[a-z]/i.test(ch)) return 'Key' + ch.toUpperCase();
        if (/[0-9]/.test(ch)) return 'Digit' + ch;
        return CHAR_CODES[ch] || '';
    }
    function fireKey(type, key, code, mods) {
        canvas.dispatchEvent(new KeyboardEvent(type, Object.assign({ bubbles: true, cancelable: true, key: key, code: code }, mods || {})));
    }
    function toolTypeText(a) {
        requirePlay('type_text');
        focusCanvas();
        return (async function () {
            var text = String(a.text || '');
            for (var i = 0; i < text.length; i++) {
                var ch = text[i];
                if (ch === '\n') { fireKey('keydown', 'Enter', 'Enter'); await sleep(30); fireKey('keyup', 'Enter', 'Enter'); }
                else {
                    var code = codeForChar(ch);
                    fireKey('keydown', ch, code, { shiftKey: /[A-Z]/.test(ch) });
                    await sleep(20);
                    fireKey('keyup', ch, code, { shiftKey: /[A-Z]/.test(ch) });
                }
                await sleep(40);
            }
            return { ok: true, typed: text.length };
        })();
    }
    var NAMED_KEYS = { Enter: 'Enter', Escape: 'Escape', Backspace: 'Backspace', Delete: 'Delete', Tab: 'Tab',
                       ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown',
                       Home: 'Home', End: 'End', Space: 'Space' };
    function toolPressKey(a) {
        requirePlay('press_key');
        focusCanvas();
        var parts = String(a.key || '').split('+');
        var key = parts.pop();
        var mods = {};
        parts.forEach(function (m) {
            m = m.toLowerCase();
            if (m === 'ctrl' || m === 'control') mods.ctrlKey = true;
            else if (m === 'shift') mods.shiftKey = true;
            else if (m === 'alt') mods.altKey = true;
            else if (m === 'meta' || m === 'cmd') mods.metaKey = true;
        });
        var code = NAMED_KEYS[key] || codeForChar(key);
        return (async function () {
            fireKey('keydown', key, code, mods);
            await sleep(40);
            fireKey('keyup', key, code, mods);
            await sleep(80);
            return { ok: true, key: a.key };
        })();
    }
    function toolReadLog(a) {
        a = a || {};
        var lines = window.engineLogLines || [];
        if (a.filter) lines = lines.filter(function (l) { return l.indexOf(a.filter) >= 0; });
        var n = Math.max(1, Math.min(300, a.lines || 60));
        return { total: (window.engineLogLines || []).length, lines: lines.slice(-n) };
    }
    function toolWait(a) {
        var ms = Math.max(0, Math.min(5000, (a && a.ms) || 500));
        return sleep(ms).then(function () { return { waited: ms }; });
    }

    var EXEC = {
        rebuild_assets: toolRebuild, screenshot: toolScreenshot,
        click: toolClick, type_text: toolTypeText, press_key: toolPressKey,
        read_log: toolReadLog, wait: toolWait, play_mode: toolPlayMode,
        open_scene: toolOpenScene, save_scene: toolSaveScene,
        scene_tree: toolSceneTree, view_info: toolViewInfo, run_script: toolRunScript,
    };
    window.__o2aiExec = EXEC;       // debug/testing handles
    window.__o2aiEvents = function () { return events; };

    // Claude writes files on the server; the running editor works off its
    // own MEMFS copy, so pull what changed under Assets into it
    function syncChangedFile(rel) {
        var m = rel.match(/^Assets\/(.+)$/);
        if (!m || !Module || !Module.FS) return;
        var inner = m[1];
        fetch(o2Base + '/api/assets/file?path=' + encodeURIComponent(inner)).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.arrayBuffer();
        }).then(function (buf) {
            var full = '/project/Assets/' + inner;
            Module.FS.mkdirTree(full.substring(0, full.lastIndexOf('/')));
            Module.FS.writeFile(full, new Uint8Array(buf));
        }).catch(function (e) { console.warn('[ai] MEMFS sync failed for ' + rel, e); });
    }

    var sessionCwd = '';
    function shortPath(v) {
        return sessionCwd && v.indexOf(sessionCwd + '/') === 0 ? v.slice(sessionCwd.length + 1) : v;
    }
    function toolLabel(name, args) {
        var brief = Object.keys(args || {}).map(function (k) {
            var v = shortPath(String(args[k]));
            return k + ': ' + (v.length > 60 ? v.slice(0, 60) + '…' : v);
        }).join(', ');
        return '▸ ' + name.replace(/^mcp__o2__/, '') + '(' + brief + ')';
    }

    // ---------- the stream from the server ----------
    var events = [];          // everything received, for the Log button
    var source = null;
    var steps = {};           // tool_use id -> ui step
    var bubble = null, bubbleText = '';
    var reviewStep = null, reviewText = '';
    var thinkStep = null, thinkText = '';
    var runStarted = 0;

    function ensureStream() {
        if (source && source.readyState !== 2) return;
        source = new EventSource(o2Base + '/api/agent/stream');
        source.onmessage = function (e) {
            var ev;
            try { ev = JSON.parse(e.data); } catch (err) { return; }
            events.push(ev);
            if (rawEl.checked && ev.type !== 'delta' && ev.type !== 'thinking')
                addStep('◇ ' + ev.type, JSON.stringify(ev, null, 2));
            try { onEvent(ev); } catch (err) { console.error('[ai] event failed', ev, err); }
        };
        source.onerror = function () { setStatus(running ? 'stream lost, reconnecting…' : ''); };
    }

    function currentBubble() {
        if (!bubble) { bubble = addMsg('model', ''); bubbleText = ''; }
        return bubble;
    }

    function onEvent(ev) {
        switch (ev.type) {
            case 'hello':
                if (ev.running && !running) { running = true; busy(true); setStatus('the agent is still working…'); }
                break;
            case 'init':
                if (ev.cwd) sessionCwd = ev.cwd;
                addStep('· session · ' + ev.model + ' · Claude Code ' + ev.version + ' · ' + (ev.tools || []).length + ' tools',
                        JSON.stringify({ tools: ev.tools, mcp: ev.mcp }, null, 2));
                break;
            case 'thinking':
                if (!thinkStep) { thinkStep = addStep('🧠 thinking…', '', { markdown: true }); thinkText = ''; }
                thinkText += ev.text;
                thinkStep.set(thinkText);
                break;
            case 'delta':
                if (ev.review) { reviewText += ev.text; if (reviewStep) reviewStep.set(reviewText); break; }
                bubbleText += ev.text;
                currentBubble().textContent = bubbleText;
                scrollDown();
                break;
            case 'text':
                if (thinkStep) {
                    thinkStep.setLabel('🧠 ' + (thinkText.replace(/[#*`]/g, '').split('\n')
                        .filter(function (l) { return l.trim(); })[0] || 'reasoning').slice(0, 90));
                    thinkStep = null;
                }
                if (ev.review) {
                    reviewText = ev.text;
                    if (!reviewStep) reviewStep = addStep('🔍 self-review', '', { markdown: true, kind: 'review', open: true });
                    reviewStep.set(reviewText);
                    break;
                }
                currentBubble().innerHTML = renderMarkdown(ev.text);
                bubble = null; bubbleText = '';
                scrollDown();
                break;
            case 'tool_use':
                if (bubble) { bubble = null; bubbleText = ''; }
                thinkStep = null;
                steps[ev.id] = { ui: addStep(toolLabel(ev.name, ev.input), 'args ' + shortPath(JSON.stringify(ev.input || {}, null, 2))),
                                 started: Date.now(), name: ev.name };
                setStatus(ev.name.replace(/^mcp__o2__/, '') + '…');
                break;
            case 'tool_result': {
                var st = steps[ev.id];
                if (!st) break;
                var took = Date.now() - st.started;
                st.ui.append('result (' + took + 'ms) ' + ev.text);
                if (ev.is_error) st.ui.setLabel('✗ ' + st.ui.label().replace(/^▸ /, '') + '  ' + took + 'ms');
                else st.ui.setLabel(st.ui.label() + '  ' + took + 'ms');
                setStatus('working…');
                break;
            }
            case 'tool_request':
                runBrowserTool(ev);
                break;
            case 'fs':
                syncChangedFile(ev.path);
                break;
            case 'result': {
                var cost = ev.cost != null ? '$' + ev.cost.toFixed(3) : '';
                var u = ev.usage || {};
                addStep('· ' + ev.subtype + ' · ' + ev.turns + ' turns · ' + Math.round((ev.ms || 0) / 1000) + ' s · ' + cost +
                        ' · in ' + (u.input_tokens || 0) + ' (+' + (u.cache_read_input_tokens || 0) + ' cached) / out ' +
                        (u.output_tokens || 0) + ' tok', JSON.stringify(ev, null, 2));
                if (ev.subtype !== 'success' && !ev.review)
                    addMsg('error', 'Run ended: ' + ev.subtype + (ev.errors && ev.errors.length ? '\n' + ev.errors.join('\n') : ''));
                if (ev.denials && ev.denials.length)
                    addStep('⊘ denied tools: ' + ev.denials.join(', '), 'The permission guard refused these calls.');
                break;
            }
            case 'error':
                addMsg('error', ev.message);
                break;
            case 'done':
                finishRun(ev);
                break;
        }
    }

    function runBrowserTool(ev) {
        var name = ev.name;
        var impl = EXEC[name];
        Promise.resolve().then(function () {
            if (!impl) throw new Error('unknown editor tool ' + name);
            return impl(ev.args || {});
        }).then(function (out) {
            return post('tool_result', { id: ev.id, result: out });
        }, function (e) {
            return post('tool_result', { id: ev.id, result: { error: String(e && e.message || e) } });
        }).catch(function (e) { console.error('[ai] tool_result post failed', e); });
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
        document.getElementById('btn-ai').classList.toggle('busy', on);
        sendBtn.style.display = on ? 'none' : '';
        stopBtn.style.display = on ? '' : 'none';
        inputEl.disabled = on;
        if (!on) setStatus('');
    }

    var pendingReview = false;
    function finishRun(ev) {
        bubble = null; bubbleText = ''; thinkStep = null;
        if (!ev.review && !ev.aborted && pendingReview) {
            pendingReview = false;
            startRun(REVIEW_PROMPT, true);
            return;
        }
        if (ev.review) reviewStep = null;
        if (ev.aborted) addMsg('error', 'Stopped.');
        busy(false);
    }

    async function startRun(text, review) {
        var key = keyEl.value.trim();
        var model = modelEl.value.trim() || DEFAULT_MODEL;
        setSetting('o2ai_claude_key', key);
        setSetting('o2ai_claude_model', model);
        ensureStream();
        busy(true);
        setStatus(review ? 'reviewing the run…' : 'starting ' + model + '…');
        runStarted = Date.now();
        try {
            await post('start', { text: text, apiKey: key, model: model, effort: effortEl.value,
                                  system: SYSTEM, guides: guidesMarkdown(), review: !!review });
        } catch (e) {
            addMsg('error', e.message);
            busy(false);
        }
    }

    async function runAgent(userText) {
        if (!keyEl.value.trim() && !/localhost|127\.0\.0\.1/.test(location.hostname)) {
            addMsg('error', 'Set your Anthropic API key in the settings field above.');
            return;
        }
        addMsg('user', userText);
        pendingReview = reviewEl.checked;
        await startRun(userText, false);
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
    function openDlg() {
        if (window.__o2CloseBrowser) window.__o2CloseBrowser(); // it renders above the chat
        dlg.classList.add('open');
        back.classList.add('open');
        inputEl.focus();
        ensureStream();
        if (!modelsLoaded) loadModels();
    }
    function closeDlg() { dlg.classList.remove('open'); back.classList.remove('open'); }
    document.getElementById('btn-ai').onclick = function () {
        if (dlg.classList.contains('open')) closeDlg(); else openDlg();
    };
    document.getElementById('ai-close').onclick = closeDlg;
    back.onclick = closeDlg; // the agent keeps running in the background

    document.getElementById('ai-clear').onclick = function () {
        if (running) return;
        events = [];
        chatEl.innerHTML = '';
        post('reset').catch(function () {});   // next message starts a fresh Claude session
    };
    // whole session as JSON: every event the server streamed
    document.getElementById('ai-copy').onclick = function () {
        var dump = JSON.stringify({ model: modelEl.value.trim(), events: events }, null, 2);
        console.log('[ai] session log', events);
        var btn = document.getElementById('ai-copy');
        navigator.clipboard.writeText(dump).then(function () {
            btn.textContent = 'Copied';
            setTimeout(function () { btn.textContent = 'Log'; }, 1200);
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
        setStatus('stopping…');
        post('stop').catch(function () {});
    };
    function send() {
        if (running) return;
        var t = inputEl.value.trim();
        if (!t) return;
        inputEl.value = '';
        runAgent(t);
    }
    sendBtn.onclick = send;
    inputEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
        e.stopPropagation(); // don't leak typing into the engine
    });
    inputEl.addEventListener('keyup', function (e) { e.stopPropagation(); });
})();
