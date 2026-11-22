// A simulation Web Worker of a page on the o2 portal (web_host.mjs makes it): the first message is the game files
import { setHost, loadCore } from './core.mjs';
import { createWebHost } from './web_host.mjs';
import { playJob } from './worker_core.mjs';

export function attach(scope, held)
{
    const handle = (message) => {
        if (message && message.init)
        {
            setHost(createWebHost(message.init));
            loadCore();
            return;
        }
        scope.postMessage(playJob(message));
    };
    scope.onmessage = (event) => handle(event.data);
    for (const message of held.splice(0))
        handle(message);
}
