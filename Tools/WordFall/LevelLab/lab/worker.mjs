// A simulation worker: plays batches of attempts on its own copy of the game rules.
import { parentPort } from 'node:worker_threads';
import { loadCore } from './core.mjs';
import { playBatch } from './sim.mjs';

loadCore();

parentPort.on('message', function(job) {
    try
    {
        parentPort.postMessage({ id: job.id, records: playBatch(job.level, job.options) });
    }
    catch (error)
    {
        parentPort.postMessage({ id: job.id, error: String(error && error.stack || error) });
    }
});
