// The lab in a browser page (the o2 portal's plugin tab): the game files are a map the page fetched through the portal,
// the rules run by indirect eval (as node:vm runs them, in the global scope), bots in Web Workers.
//
// A page on the portal lives in a sandbox with an opaque origin: a worker can only be made from a blob of that origin,
// so the blob is a classic script that imports the worker module by its absolute URL (the portal serves the plugin's
// files to anybody holding the link, CORS included) and keeps the messages that come before the module is in.

export function createWebHost(files, options = {})
{
    return {
        kind: 'web',
        files,
        readText(rel) { return typeof files[rel] == 'string' ? files[rel] : undefined; },
        exists(rel) { return typeof files[rel] == 'string'; },
        runScript(code, rel) { (0, eval)(code + '\n//# sourceURL=' + rel); },
        parallelism()
        {
            const cores = typeof navigator != 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
            return Math.max(1, Math.min(16, cores - 1));
        },
        makeWorker()
        {
            if (!options.workerUrl)
                throw new Error('LevelLab: no worker script URL');
            const source = 'var held = []; self.onmessage = function(e) { held.push(e.data); };\n' +
                           'import(' + JSON.stringify(options.workerUrl) + ').then(function(m) { m.attach(self, held); },\n' +
                           '    function(e) { self.postMessage({ id: 0, error: "the worker did not load: " + e }); });';
            const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
            const worker = new Worker(url);
            URL.revokeObjectURL(url);
            worker.postMessage({ init: files });
            return {
                post: (message) => worker.postMessage(message),
                onMessage: (fn) => { worker.onmessage = (event) => fn(event.data); },
                onError: (fn) => { worker.onerror = (event) => fn(new Error(event.message || 'worker error')); },
                terminate: () => worker.terminate()
            };
        }
    };
}
