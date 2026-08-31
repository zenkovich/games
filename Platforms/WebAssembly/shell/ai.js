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

    // identity-linked Console keys also need the workspace they act in
    var workspaceEl = document.createElement('input');
    workspaceEl.id = 'ai-workspace';
    workspaceEl.type = 'text';
    workspaceEl.placeholder = 'workspace id (wrkspc_…)';
    workspaceEl.title = 'Required for identity-linked API keys: the id of the Console workspace this key acts in (Console → Settings → Workspaces). Leave empty for classic keys.';
    workspaceEl.spellcheck = false;
    workspaceEl.autocomplete = 'off';
    workspaceEl.style.width = '150px';
    keyEl.parentNode.insertBefore(workspaceEl, keyEl.nextSibling);

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

    // permission mode, as in the terminal
    var modeEl = document.createElement('select');
    modeEl.id = 'ai-mode';
    modeEl.title = 'Permission mode: ask before tools (default), auto-accept edits, plan only, or bypass prompts (edits stay limited to Assets)';
    [['default', 'ask'], ['acceptEdits', 'accept edits'], ['plan', 'plan'], ['bypassPermissions', 'bypass']].forEach(function (m) {
        var o = document.createElement('option');
        o.value = m[0]; o.textContent = m[1];
        modeEl.appendChild(o);
    });
    effortEl.parentNode.insertBefore(modeEl, effortEl.nextSibling);

    // past Claude sessions of this tab, to continue one
    var histEl = document.createElement('select');
    histEl.id = 'ai-history';
    histEl.title = 'Conversations of this tab: pick one to continue it';
    effortEl.parentNode.insertBefore(histEl, modeEl.nextSibling);

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
    modeEl.value = getSetting('o2ai_mode') || 'acceptEdits';
    modeEl.onchange = function () { setSetting('o2ai_mode', modeEl.value); };
    keyEl.onchange = function () {
        setSetting('o2ai_claude_key', keyEl.value.trim());
        loadModels();
    };
    workspaceEl.value = getSetting('o2ai_workspace');
    workspaceEl.onchange = function () {
        setSetting('o2ai_workspace', workspaceEl.value.trim());
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
        var headers = key ? { 'X-Anthropic-Key': key } : {};
        if (workspaceEl.value.trim()) headers['X-Anthropic-Workspace'] = workspaceEl.value.trim();
        return fetch(o2Base + '/api/agent/models', { headers: headers })
            .then(function (r) { return r.json(); })
            .then(function (j) {
                fillModels(j.models || FALLBACK_MODELS);
                modelsLoaded = j.source === 'api';
                if (j.error && /workspace/i.test(j.error)) {
                    workspaceEl.style.outline = '2px solid #C86A6A';
                    setStatus('This API key also needs its workspace id (wrkspc_…) — Console → Settings → Workspaces.');
                } else {
                    workspaceEl.style.outline = '';
                    if (key && j.source === 'api') setStatus('');
                }
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

    // ---------- editor-side tool implementations ----------
    // Claude's own tools do the file work on the server; these are the calls
    // that only make sense inside the running editor.

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
        if (!Module.calledRun || typeof Module[fn] !== 'function')
            return Promise.reject(new Error('editor engine is not running'));
        return new Promise(function (resolve) {
            setTimeout(function () {
                Module[fn]();
                resolve();
            }, 50);
        }).then(function () {
            // The built files are mirrored to the server through an async queue.
            // Returning before it drains risks a reload cutting the tail off, which
            // leaves the server missing files the build index still claims exist.
            return drainMirror();
        }).then(function () {
            return { ok: true, forced: !!forced };
        });
    }

    // Waits until the BuiltAssets mirror queue has settled (nothing new for a moment)
    function drainMirror() {
        var rounds = 0;
        function settle() {
            var q = window.__o2MirrorQueue || Promise.resolve();
            return q.then(function () {
                return sleep(400);
            }).then(function () {
                var again = window.__o2MirrorQueue || Promise.resolve();
                if (again !== q && rounds++ < 60) return settle();
            });
        }
        return settle();
    }
    window.__o2DrainMirror = drainMirror;
    // Half size: the model reads it just as well, and the payload (and so the
    // round-trip) is a quarter. Coordinates below are still full-size CSS pixels.
    function toolScreenshot() {
        var w = canvas.clientWidth, h = canvas.clientHeight;
        var sw = Math.round(w / 2), sh = Math.round(h / 2);
        var t = document.createElement('canvas');
        t.width = sw; t.height = sh;
        t.getContext('2d').drawImage(canvas, 0, 0, sw, sh);
        var b64 = t.toDataURL('image/jpeg', 0.85).split(',')[1];
        return Promise.resolve({
            result: { imageWidth: sw, imageHeight: sh, canvasWidth: w, canvasHeight: h,
                      note: 'the image is half size; click coordinates are full-size canvas pixels, so double what you measure on it' },
            image: { mime: 'image/jpeg', b64: b64 },
        });
    }

    function isPlaying() {
        try { return !!(Module._o2_web_is_playing && Module._o2_web_is_playing()); }
        catch (e) { return false; }
    }

    function callJson(fn, args, types) {
        if (typeof Module.ccall !== 'function')
            return Promise.reject(new Error('the editor is not running yet'));
        var ptr = Module.ccall(fn, 'number', types || [], args || []);
        if (!ptr) return Promise.reject(new Error(fn + ' returned nothing'));
        var text = Module.UTF8ToString(ptr);
        try { Module._free(ptr); } catch (e) {}
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
        if (typeof Module._o2_web_save_scene !== 'function')
            return Promise.reject(new Error('the editor is not running yet'));
        Module._o2_web_save_scene();
        return sleep(800).then(function () { return { ok: true }; });
    }

    function toolPlayMode(a) {
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

    // Driving the editor chrome by synthetic clicks proved unreliable and
    // expensive, so input is allowed only while the game runs
    function requirePlay(what) {
        if (isPlaying()) return null;
        return Promise.reject(new Error(
            what + ' is only available in play mode, and only inside the Game window. ' +
            'Turn it on with play_mode({on:true}) - and note that editor windows (Assets, Tree, Properties, menus) ' +
            'cannot be driven at all: change the project through the file tools instead.'));
    }

    function focusCanvas() {
        if (document.activeElement && document.activeElement !== canvas && document.activeElement.blur)
            document.activeElement.blur();
        canvas.focus();
    }
    function fireMouse(type, cx, cy, extra) {
        var isPointer = type.indexOf('pointer') === 0;
        var Ctor = isPointer && window.PointerEvent ? PointerEvent : MouseEvent;
        canvas.dispatchEvent(new Ctor(type, Object.assign({
            bubbles: true, cancelable: true, view: window,
            clientX: cx, clientY: cy,
            pointerId: 1, pointerType: 'mouse', isPrimary: true,
        }, extra)));
    }
    function toolClick(a) {
        var blocked = requirePlay('clicking');
        if (blocked) return blocked;
        return (async function () {
            var r = canvas.getBoundingClientRect();
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
        canvas.dispatchEvent(new KeyboardEvent(type, Object.assign({
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
        var all = (window.engineLogLines || []);
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
    var MAIN_ARG = { Read: 'file_path', Write: 'file_path', Edit: 'file_path', MultiEdit: 'file_path',
                     Bash: 'command', Grep: 'pattern', Glob: 'pattern', Task: 'description', Agent: 'description',
                     WebFetch: 'url', WebSearch: 'query', Skill: 'skill', NotebookEdit: 'notebook_path' };
    // ---------- permission prompts ----------
    var permissionBlocks = {};
    function showPermission(ev) {
        if (permissionBlocks[ev.id]) return;
        var d = document.createElement('div');
        d.className = 'ai-m error ai-perm';
        var head = document.createElement('div');
        head.textContent = 'Allow ' + toolLabel(ev.tool, ev.input).replace(/^▸ /, '') + '?';
        d.appendChild(head);
        var detail = document.createElement('pre');
        detail.style.cssText = 'margin:4px 0;max-height:160px;overflow:auto;font-size:11px;white-space:pre-wrap';
        detail.textContent = shortPath(JSON.stringify(ev.input || {}, null, 2));
        d.appendChild(detail);
        var row = document.createElement('div');
        [['Allow', 'allow', false], ['Always allow', 'allow', true], ['Deny', 'deny', false]].forEach(function (b) {
            var btn = document.createElement('button');
            btn.className = 'tbtn' + (b[1] === 'deny' ? ' quiet' : '');
            btn.style.marginRight = '6px';
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
        scrollDown();
        setStatus('waiting for your permission…');
    }
    function resolvePermissionUi(id, behavior) {
        var d = permissionBlocks[id];
        if (!d) return;
        d.className = 'ai-step';
        d.innerHTML = '';
        var lab = document.createElement('div');
        lab.className = 'ai-step-head';
        lab.textContent = (behavior === 'allow' ? '✓ allowed' : '⊘ denied');
        d.appendChild(lab);
        delete permissionBlocks[id];
        setStatus('working…');
    }

    function removeDeletedFile(rel) {
        var m = rel.match(/^Assets\/(.+)$/);
        if (!m || !Module || !Module.FS) return;
        try { Module.FS.unlink('/project/Assets/' + m[1]); } catch (e) {}
    }

    // ---------- conversations of this tab ----------
    function loadHistory() {
        fetch(o2Base + '/api/agent/sessions').then(function (r) { return r.json(); }).then(function (j) {
            histEl.innerHTML = '';
            var o = document.createElement('option');
            o.value = ''; o.textContent = 'new conversation';
            histEl.appendChild(o);
            (j.sessions || []).forEach(function (h) {
                var opt = document.createElement('option');
                opt.value = h.id;
                opt.textContent = h.title + '  ($' + (h.cost || 0).toFixed(2) + ')';
                histEl.appendChild(opt);
            });
            histEl.value = j.current || '';
        }).catch(function () {});
    }
    histEl.onchange = function () {
        if (running) { loadHistory(); return; }
        post('resume', { id: histEl.value || null }).then(function () {
            chatEl.innerHTML = '';
            if (histEl.value) addStep('· continuing conversation ' + histEl.value.slice(0, 8) + '…', 'Its history stays on the server; new turns append to it.');
        }).catch(function (e) { addMsg('error', e.message); });
    };

    var slashCommands = [];
    function toolLabel(name, args, sub) {
        args = args || {};
        var short = name.replace(/^mcp__o2__/, '');
        var main = MAIN_ARG[name];
        var brief;
        if (main && args[main] !== undefined) {
            var v = shortPath(String(args[main])).replace(/\s+/g, ' ');
            brief = v.length > 90 ? v.slice(0, 90) + '…' : v;
            if (name === 'Grep' && args.path) brief += '  in ' + shortPath(String(args.path));
        } else {
            brief = Object.keys(args).map(function (k) {
                var v = shortPath(String(args[k]));
                return k + ': ' + (v.length > 60 ? v.slice(0, 60) + '…' : v);
            }).join(', ');
        }
        return (sub ? '  ↳ ' : '▸ ') + short + '(' + brief + ')';
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
                (ev.pending || []).forEach(showPermission);
                loadHistory();
                break;
            case 'init':
                if (ev.cwd) sessionCwd = ev.cwd;
                slashCommands = ev.slash || [];
                addStep('· session · ' + ev.model + ' · Claude Code ' + ev.version + ' · ' + (ev.tools || []).length + ' tools · ' + ev.mode +
                        (ev.apiKeySource === 'none' ? ' · host credentials' : ''),
                        JSON.stringify({ tools: ev.tools, mcp: ev.mcp, slash_commands: ev.slash }, null, 2));
                break;
            case 'started':
                break;
            case 'queued':
                setStatus('queued (' + ev.position + ') — sent when the current turn ends');
                break;
            case 'permission_request':
                showPermission(ev);
                break;
            case 'permission_resolved':
                resolvePermissionUi(ev.id, ev.behavior);
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
                steps[ev.id] = { ui: addStep(toolLabel(ev.name, ev.input, ev.sub), 'args ' + shortPath(JSON.stringify(ev.input || {}, null, 2))),
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
                (ev.changed || (ev.path ? [ev.path] : [])).forEach(syncChangedFile);
                (ev.deleted || []).forEach(removeDeletedFile);
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
            if (out && out.image) addShot(out.image.b64, out.image.mime);
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
        stopBtn.style.display = on ? '' : 'none';
        inputEl.placeholder = on ? 'Type the next message — it is sent when this turn ends…'
                                 : 'Ask the agent… (Enter — send, Shift+Enter — new line; /command runs a skill)';
        if (!on) { setStatus(''); loadHistory(); }
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
            await post('start', { text: text, apiKey: key, workspaceId: workspaceEl.value.trim(),
                                  model: model, effort: effortEl.value,
                                  mode: modeEl.value, review: !!review });
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
        if (running) {
            // typed during a turn: the server queues it after the current one
            post('start', { text: userText, apiKey: keyEl.value.trim(), workspaceId: workspaceEl.value.trim(),
                            model: modelEl.value.trim() || DEFAULT_MODEL,
                            effort: effortEl.value, mode: modeEl.value, review: false })
                .catch(function (e) { addMsg('error', e.message); });
            return;
        }
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
