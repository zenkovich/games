// The session's files on their way into MEMFS - for both faces: the editor (boot.js) and the game client in
// its frame (preview-boot.js) - and what this browser keeps of them between starts.
//
// A project is tens of MB and a start used to download all of it, per face, although next to nothing changes
// from one start to the next. Every file that has been downloaded is kept in IndexedDB under the HASH OF ITS
// BYTES (the server names it: `h` in a snapshot's index and in the manifest), so a later start asks for
//     GET  api/fs/manifest                 [[path, size, mtime, hash], ...] and a tag naming the list
//     POST api/fs/pack {tag, want: [i..]}  the files it does not hold, in the snapshot's own format
// and takes the rest from here. What follows from "a name that is the content":
//   - nothing kept can be stale: a path gets the bytes whose hash the server has just named, or it is downloaded.
//     Paths and mtimes always come from the server, only bytes come from here;
//   - both faces, every tab, every session and every project of this origin share one store (the editor's own
//     assets are half of every project), and a tree rewritten without a changed byte - a git checkout, a zip
//     restore, a new demo session - costs a manifest;
//   - the tree moving between the manifest and the pack is the server's to notice (the tag): it answers 409 with
//     the manifest as it is now and the diff is made again, so MEMFS gets the tree of one moment, as a whole
//     snapshot is. A pack's index carries the hash of the bytes actually sent, and those are what is kept.
// Nothing kept yet, no IndexedDB (a private window), a store that fails or hangs, a server without the routes,
// most of the tree missing: GET api/fs/snapshot, the one request a shell without any of this makes - and for
// the portal's demo an immutable file the landing has already put in the HTTP cache. The server's own headless
// page (a throwaway profile) never comes here at all.
//
// The store: `blobs` (hash -> ArrayBuffer) and `projects` (o2Base -> the hashes its last start named, and when).
// Whether bytes are held is asked of `blobs` alone; `projects` only says what is still wanted: after a start
// every blob no project names goes, projects nobody opened for weeks go, and the least recently opened ones go
// while the whole is over CAP. A quota error drops the other projects once and then stops keeping - silently.
//
// The download starts when this file is loaded, not in preRun: emscripten runs preRun only after the wasm has
// been downloaded AND compiled, and the project used to wait behind it for nothing.
//
// This file is not in editor.html: a project's own runtime (Builds) and the demo bring an Editor.html made
// before it existed, so the two boot scripts pull it in themselves.

window.o2Snapshot = (function () {
    var DB_NAME = 'o2-files', BLOBS = 'blobs', PROJECTS = 'projects';
    var CAP = 1024 * 1048576;           // everything kept for this origin
    var FILE_MAX = 96 * 1048576;        // one file above this is downloaded every time
    var KEEP_DAYS = 45;                 // a project nobody opened for that long no longer holds its files here
    var FULL_FROM = 0.85;               // this much of the tree to download: the whole snapshot in one request instead
    var OPEN_MS = 2500;                 // an IndexedDB that does not open by then is not waited for (Safari has such days)
    var CHUNK = 8 * 1048576;            // bytes per write transaction: what is in flight to the store at once
    var ROUNDS = 4;

    function log() { var a = ['[files]']; a.push.apply(a, arguments); console.log.apply(console, a); }
    function mb(n) { return (n / 1048576).toFixed(1) + ' MB'; }
    function never() { return new Promise(function () {}); }

    // ---- the store --------------------------------------------------
    function openDb() {
        return new Promise(function (resolve) {
            var settled = false;
            function end(db) {
                if (settled) { if (db) try { db.close(); } catch (e) {} return; }
                settled = true;
                resolve(db || null);
            }
            try {
                if (!window.indexedDB) return end(null);
                var req = indexedDB.open(DB_NAME, 1);
                req.onupgradeneeded = function () {
                    var db = req.result;
                    if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS);
                    if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS, { keyPath: 'key' });
                };
                req.onsuccess = function () {
                    var db = req.result;
                    db.onversionchange = function () { try { db.close(); } catch (e) {} };
                    end(db);
                };
                req.onerror = function (e) { if (e && e.preventDefault) e.preventDefault(); end(null); };
                req.onblocked = function () { end(null); };
                setTimeout(function () { end(null); }, OPEN_MS);
            } catch (e) { end(null); }
        });
    }

    // one request of one transaction; null when anything at all goes wrong
    function ask(db, storeName, mode, fn) {
        return new Promise(function (resolve) {
            try {
                var tx = db.transaction(storeName, mode), out = null;
                var req = fn(tx.objectStore(storeName));
                if (req) req.onsuccess = function () { out = req.result; };
                tx.oncomplete = function () { resolve(req ? out : true); };
                tx.onerror = tx.onabort = function (e) { if (e && e.preventDefault) e.preventDefault(); resolve(null); };
            } catch (e) { resolve(null); }
        });
    }

    /** every hash held, as a map; null when the store cannot be read */
    function heldHashes(db) {
        return ask(db, BLOBS, 'readonly', function (s) { return s.getAllKeys(); }).then(function (keys) {
            if (!keys) return null;
            var have = Object.create(null);
            for (var i = 0; i < keys.length; i++) have[keys[i]] = true;
            have.__count = keys.length;
            return have;
        });
    }

    /** wanted: [[hash, size]]; resolves { hash: ArrayBuffer } with whatever could be read and is of the right size */
    function readBodies(db, wanted, onBytes) {
        return new Promise(function (resolve) {
            var out = Object.create(null);
            if (!wanted.length) return resolve(out);
            try {
                var tx = db.transaction(BLOBS, 'readonly'), store = tx.objectStore(BLOBS);
                wanted.forEach(function (w) {
                    var r = store.get(w[0]);
                    r.onsuccess = function () {
                        var v = r.result;
                        if (v instanceof ArrayBuffer && v.byteLength === w[1]) { out[w[0]] = v; onBytes(w[1]); }
                    };
                });
                tx.oncomplete = function () { resolve(out); };
                tx.onerror = tx.onabort = function (e) { if (e && e.preventDefault) e.preventDefault(); resolve(out); };
            } catch (e) { resolve(out); }
        });
    }

    // items: [{ h, d: Uint8Array }]. A value is cloned whole, so a view into a download gets a buffer of its own
    // first - or every entry would carry the entire snapshot. Resolves how many were kept; `quota` when it stopped on one.
    function putBodies(db, items) {
        var at = 0, kept = 0;
        function chunk() {
            if (at >= items.length) return Promise.resolve({ kept: kept });
            return new Promise(function (resolve) {
                var n = 0, bytes = 0, quota = false;
                try {
                    var tx = db.transaction(BLOBS, 'readwrite'), store = tx.objectStore(BLOBS);
                    while (at + n < items.length && (n === 0 || (bytes + items[at + n].d.byteLength <= CHUNK && n < 600))) {
                        var d = items[at + n].d;
                        store.put(d.byteLength === d.buffer.byteLength ? d.buffer : d.slice().buffer, items[at + n].h);
                        bytes += d.byteLength;
                        n++;
                    }
                    tx.oncomplete = function () { at += n; kept += n; resolve(null); };
                    tx.onerror = function (e) { if (e && e.preventDefault) e.preventDefault(); };
                    tx.onabort = function () { quota = !!(tx.error && /quota/i.test(tx.error.name || '')); resolve({ kept: kept, quota: quota, failed: true }); };
                } catch (e) { resolve({ kept: kept, quota: /quota/i.test(e && e.name || ''), failed: true }); }
            }).then(function (stop) { return stop || chunk(); });
        }
        return chunk();
    }

    // What nobody names any more goes. `key`: the project that has just started - it stays whatever the sum is.
    // `othersGo`: the store is full, every other project lets go of its files.
    function sweep(db, key, othersGo) {
        return ask(db, PROJECTS, 'readonly', function (s) { return s.getAll(); }).then(function (records) {
            if (!records) return;
            var now = Date.now(), drop = [], keep = [];
            records.sort(function (a, b) { return (b.used || 0) - (a.used || 0); });     // the most recent first
            var named = Object.create(null), total = 0;
            records.forEach(function (r) {
                var mine = r.key === key, fresh = 0;
                (r.files || []).forEach(function (f) { if (!named[f[0]]) fresh += f[1]; });
                if (!mine && (othersGo || now - (r.used || 0) > KEEP_DAYS * 86400000 || total + fresh > CAP)) { drop.push(r.key); return; }
                (r.files || []).forEach(function (f) { named[f[0]] = true; });
                total += fresh;
                keep.push(r.key);
            });
            return Promise.all(drop.map(function (k) { return ask(db, PROJECTS, 'readwrite', function (s) { s['delete'](k); }); })).then(function () {
                return ask(db, BLOBS, 'readonly', function (s) { return s.getAllKeys(); });
            }).then(function (keys) {
                var gone = (keys || []).filter(function (h) { return !named[h]; });
                if (!gone.length) return;
                return ask(db, BLOBS, 'readwrite', function (s) { gone.forEach(function (h) { s['delete'](h); }); }).then(function () {
                    log('let go of', gone.length, 'files nobody names any more' + (drop.length ? ' (' + drop.length + ' projects not opened lately)' : ''));
                });
            });
        });
    }

    // ---- the network ------------------------------------------------
    // a response body with progress, as one Uint8Array
    function readAll(resp, onChunk) {
        var reader = resp.body.getReader(), chunks = [], loaded = 0;
        function pump() {
            return reader.read().then(function (r) {
                if (r.done) return;
                chunks.push(r.value);
                loaded += r.value.length;
                onChunk(loaded);
                return pump();
            });
        }
        return pump().then(function () {
            if (chunks.length === 1) return chunks[0];
            var buf = new Uint8Array(loaded), off = 0;
            for (var i = 0; i < chunks.length; i++) { buf.set(chunks[i], off); off += chunks[i].length; }
            return buf;
        });
    }

    // O2SNAP01, u32 index length, the index as JSON, the files' bytes in its order -> [{ p, s, m, h?, d }]
    function parseSnap(buf) {
        if (buf.length < 12 || String.fromCharCode.apply(null, buf.subarray(0, 8)) !== 'O2SNAP01') throw new Error('bad snapshot magic');
        var indexLen = new DataView(buf.buffer, buf.byteOffset + 8, 4).getUint32(0, true);
        var files = JSON.parse(new TextDecoder().decode(buf.subarray(12, 12 + indexLen))).files, off = 12 + indexLen;
        for (var i = 0; i < files.length; i++) {
            files[i].d = buf.subarray(off, off + files[i].s);
            off += files[i].s;
        }
        // cut short or padded: not one byte of it is trusted, least of all kept
        if (off !== buf.length) throw new Error('snapshot is ' + buf.length + ' bytes, its index says ' + off);
        return files;
    }

    // ---- one start ----------------------------------------------------
    // opts: base (o2Base), status(text, frac), noCache, after (a promise to wait for first), and the face's own words:
    //   words.full 'Downloading project… ', words.waiting - what the page is still waiting for once the files are here
    // Returns { into(FS) -> Promise }: the files written into MEMFS under /project, as soon as both are there.
    function start(opts) {
        var base = opts.base || '', key = base || '/', words = opts.words || {};
        var t0 = Date.now(), asked = false;
        var stats = api.last = { mode: '', files: 0, bytes: 0, held: 0, heldBytes: 0, fetched: 0, fetchedBytes: 0, rounds: 0, kept: 0, ms: 0 };
        function status(text, frac) { try { opts.status(text, frac); } catch (e) {} }

        var sharedDone;
        shared = new Promise(function (r) { sharedDone = r; });

        // the whole project in one request: what a shell without a store does
        function full(db) {
            stats.mode = 'full';
            status((words.full || 'Downloading project… ') + '0.0 MB', 0);
            return fetch(base + '/api/fs/snapshot').then(function (resp) {
                if (!resp.ok) throw new Error('snapshot HTTP ' + resp.status);
                var total = +resp.headers.get('X-Uncompressed-Length') || 0;
                return readAll(resp, function (loaded) { status((words.full || 'Downloading project… ') + mb(loaded), total ? loaded / total : 0); });
            }).then(function (buf) {
                var files = parseSnap(buf);
                stats.fetched = files.length;
                stats.fetchedBytes = buf.length;
                // (a snapshot from a server older than the store has no hashes: nothing to keep them under)
                var keep = db && files.length && files[0].h ? files : null;
                return { files: files, db: keep ? db : null, keep: (keep || []).slice(), named: (keep || []).slice() };
            });
        }

        function manifest(json) {
            if (!json || json.v !== 1 || !json.tag || !Array.isArray(json.files)) throw new Error('not a manifest');
            return json;
        }

        function held(db, have) {
            stats.mode = 'kept';
            status('Checking the project…', 0);
            var bodies = Object.create(null);       // hash -> ArrayBuffer, out of the store
            var fresh = Object.create(null);        // path -> entry of a pack: bytes newer than anything here
            var keep = [];
            var read = 0, loaded = 0, toRead = 0, toLoad = 0, changed = 0;
            var painted = 0;
            function progress(force) {
                // (a few thousand reads finish within a second: the overlay - and the game's frame, which posts every
                // status to the page around it - hears of them twenty times, not of each)
                if (!force && Date.now() - painted < 50) return;
                painted = Date.now();
                var frac = toRead + toLoad ? (read + loaded) / (toRead + toLoad) : 0;
                if (changed) status('Downloading ' + changed + ' changed file' + (changed === 1 ? '' : 's') + '… ' + mb(loaded), frac);
                else status('Loading the project…', frac);
            }

            function round(m) {
                if (++stats.rounds > ROUNDS) throw new Error('the project keeps changing while it is read');
                var want = [], wantBytes = 0, wanted = [], total = 0, seen = Object.create(null);
                m.files.forEach(function (f, i) {
                    total += f[1];
                    if (fresh[f[0]] && fresh[f[0]].h === f[3]) return;
                    if (have[f[3]]) { if (!bodies[f[3]] && !seen[f[3]]) { seen[f[3]] = true; wanted.push([f[3], f[1]]); } return; }
                    want.push(i);
                    wantBytes += f[1];
                });
                if (stats.rounds === 1 && wantBytes > total * FULL_FROM) return full(db);

                toRead = read; toLoad = loaded; changed = want.length;
                wanted.forEach(function (w) { toRead += w[1]; });
                toLoad += wantBytes;
                progress(true);

                var reading = readBodies(db, wanted, function (n) { read += n; progress(); }).then(function (got) {
                    var lost = 0;
                    wanted.forEach(function (w) { if (got[w[0]]) bodies[w[0]] = got[w[0]]; else { delete have[w[0]]; lost++; } });
                    return lost;
                });
                var packing = !want.length ? Promise.resolve(null) : fetch(base + '/api/fs/pack', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tag: m.tag, want: want }),
                }).then(function (resp) {
                    // the tree has moved since the manifest: here is the new one
                    if (resp.status === 409) return resp.json().then(function (j) { return { moved: manifest(j) }; });
                    if (!resp.ok) throw new Error('pack HTTP ' + resp.status);
                    var before = loaded;
                    return readAll(resp, function (n) { loaded = before + n; progress(); }).then(function (buf) { return { files: parseSnap(buf), wire: buf.length }; });
                });

                return Promise.all([reading, packing]).then(function (r) {
                    var lost = r[0], pack = r[1];
                    if (pack && pack.files) {
                        stats.fetched += pack.files.length;
                        stats.fetchedBytes += pack.wire;
                        pack.files.forEach(function (e) { fresh[e.p] = e; if (e.h && !have[e.h] && e.s <= FILE_MAX) keep.push(e); });
                    }
                    if (pack && pack.moved) return round(pack.moved);
                    // held a moment ago and unreadable now (swept by another tab, a damaged store): those are downloaded after all
                    if (lost) return round(m);
                    return m;
                });
            }

            return fetch(base + '/api/fs/manifest', { cache: 'no-store' }).then(function (resp) {
                if (!resp.ok) throw new Error('manifest HTTP ' + resp.status);
                return resp.json();
            }).then(function (json) { return round(manifest(json)); }).then(function (m) {
                if (!m.tag) return m;        // round() fell back to the whole snapshot
                var owned = Object.create(null), files = [];
                m.files.forEach(function (f) {
                    var e = fresh[f[0]], b = bodies[f[3]];
                    // (other bytes than the manifest names and none of those held: rewritten while the pack was made - the newest win)
                    if (e && (e.h === f[3] || !b)) { files.push({ p: f[0], m: e.h === f[3] ? f[2] : e.m, d: e.d }); return; }
                    if (!b) throw new Error('no bytes for ' + f[0]);
                    // MEMFS may take a buffer out of the store as it is - once: two paths with the same bytes must not share it
                    files.push({ p: f[0], m: f[2], d: new Uint8Array(b), own: !owned[f[3]] });
                    owned[f[3]] = true;
                    stats.held++;
                    stats.heldBytes += f[1];
                });
                return { files: files, db: db, keep: keep, named: m.files.map(function (f) { return { h: f[3], s: f[1] }; }) };
            });
        }

        function load() {
            var opened = opts.noCache ? Promise.resolve(null) : openDb();
            return opened.then(function (db) {
                if (!db) { sharedDone(); return full(null); }
                return heldHashes(db).then(function (have) {
                    if (!have || !have.__count) return full(db);      // nothing kept yet: no manifest, the one request it always was
                    return held(db, have)['catch'](function (e) {
                        console.warn('[files] could not start from what this browser keeps, downloading the project:', e && e.message || e);
                        return full(db);
                    });
                });
            });
        }

        // a dropped connection is not worth losing the start over: everything here is idempotent
        function attempt(n) {
            return load()['catch'](function (e) {
                console.error('[files] loading the project failed', e);
                if (n >= 2) throw e;
                status('Reconnecting… (' + (n + 1) + ')');
                return new Promise(function (r) { setTimeout(r, 800 * (n + 1)); }).then(function () { return attempt(n + 1); });
            });
        }

        // what was downloaded goes into the store: the record first (it is what keeps a sweep in another tab off these
        // files), then the bytes, then a sweep of our own
        function keepFiles(res) {
            var db = res.db;
            if (!db) return Promise.resolve();
            var uniq = Object.create(null), items = [], files = [];
            res.named.forEach(function (f) { if (!uniq[f.h]) { uniq[f.h] = true; files.push([f.h, f.s]); } });
            uniq = Object.create(null);
            res.keep.forEach(function (e) { if (!uniq[e.h] && e.s <= FILE_MAX) { uniq[e.h] = true; items.push({ h: e.h, d: e.d }); } });
            return ask(db, PROJECTS, 'readwrite', function (s) { s.put({ key: key, used: Date.now(), files: files }); }).then(function () {
                return putBodies(db, items);
            }).then(function (r) {
                stats.kept = r.kept;
                if (!r.quota) return r;
                // full: the other projects let go, and what is left gets one more try
                return sweep(db, key, true).then(function () { return putBodies(db, items.slice(r.kept)); }).then(function (r2) { stats.kept += r2.kept; return r2; });
            }).then(function (r) {
                if (r.failed) console.warn('[files] this browser keeps no more files (' + (r.quota ? 'out of space' : 'the store failed') + ')');
                return sweep(db, key, false);
            });
        }

        var loaded = (opts.after || Promise.resolve()).then(function () { return attempt(0); }).then(function (res) {
            stats.files = res.files.length;
            res.files.forEach(function (f) { stats.bytes += f.d.byteLength; });
            stats.ms = Date.now() - t0;
            log(stats.files + ' files, ' + mb(stats.bytes) + ': ' + stats.held + ' from this browser, ' + stats.fetched + ' downloaded (' + mb(stats.fetchedBytes) + ') in ' + stats.ms + ' ms'
                + (stats.rounds > 1 ? ', ' + stats.rounds + ' rounds' : ''));
            if (!asked && words.waiting) status(words.waiting);
            // (the bytes are cloned as they are handed to the store and MEMFS copies what it does not own, so neither waits for the other)
            keepFiles(res)['catch'](function (e) { console.warn('[files] keeping the files failed', e); }).then(sharedDone);
            return res.files;
        });
        loaded['catch'](function () { sharedDone(); });

        return {
            into: function (FS) {
                asked = true;
                return loaded.then(function (files) {
                    status('Unpacking project…', 1);
                    var made = Object.create(null);
                    function mkdirs(dir) { if (!made[dir]) { FS.mkdirTree(dir); made[dir] = true; } }
                    for (var i = 0; i < files.length; i++) {
                        var f = files[i], path = '/project/' + f.p;
                        mkdirs(path.substring(0, path.lastIndexOf('/')));
                        FS.writeFile(path, f.d, { canOwn: !!f.own });
                        if (f.m) try { FS.utime(path, f.m, f.m); } catch (e) {}
                        files[i] = null;
                    }
                    mkdirs('/project/Bin/WebAssembly');
                    return stats;
                });
            },
        };
    }

    var shared = Promise.resolve();
    var api = {
        start: start,
        /** resolves once whatever this window was going to put into the store is there (or it is known that nothing will be):
            the game's frame starts after the editor next door, and finds the project here instead of downloading it again */
        shared: function (maxMs) { return Promise.race([shared, maxMs ? new Promise(function (r) { setTimeout(r, maxMs); }) : never()]); },
        /** the last start of this window, in numbers */
        last: null,
        /** forget everything this browser keeps (from the console, when in doubt) */
        clear: function () { return new Promise(function (r) { var q = indexedDB.deleteDatabase(DB_NAME); q.onsuccess = q.onerror = q.onblocked = function () { r(); }; }); },
    };
    return api;
})();
