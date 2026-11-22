// A simulation worker thread on this machine: plays batches of attempts on its own copy of the game rules.
import { parentPort } from 'node:worker_threads';
import { loadCore } from './core.mjs';
import { playJob } from './worker_core.mjs';

loadCore();
parentPort.on('message', (job) => parentPort.postMessage(playJob(job)));
