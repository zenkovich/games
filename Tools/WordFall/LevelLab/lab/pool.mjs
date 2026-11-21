// Pool of simulation workers: many bots play at once, one batch of attempts per worker at a time.
import os from 'node:os';
import { Worker } from 'node:worker_threads';

export class Pool
{
    constructor(size)
    {
        this.size = Math.max(1, size || Math.max(1, os.availableParallelism() - 2));
        this.attempts = 0;
        this._workers = [];
        this._idle = [];
        this._queue = [];
        this._jobs = new Map();
        this._nextId = 1;
        for (let i = 0; i < this.size; i++)
        {
            const worker = new Worker(new URL('./worker.mjs', import.meta.url));
            worker.on('message', (message) => this._done(worker, message));
            worker.on('error', (error) => this._failed(worker, error));
            this._workers.push(worker);
            this._idle.push(worker);
        }
    }

    // Plays options.count attempts of the level split between the workers; resolves to the attempt records.
    // options: language, profile, count, seedBase, cap, assume (see sim.mjs)
    simulate(level, options)
    {
        const count = options.count;
        const chunk = Math.max(8, Math.min(48, Math.ceil(count/this.size)));
        const parts = [];
        for (let first = 0; first < count; first += chunk)
            parts.push(this._run(level, { ...options, first, count: Math.min(chunk, count - first) }));
        this.attempts += count;
        return Promise.all(parts).then((lists) => lists.flat());
    }

    close()
    {
        for (const worker of this._workers)
            worker.terminate();
        this._workers = [];
        this._idle = [];
    }

    _run(level, options)
    {
        return new Promise((resolve, reject) => {
            this._queue.push({ id: this._nextId++, level, options, resolve, reject });
            this._pump();
        });
    }

    _pump()
    {
        while (this._idle.length > 0 && this._queue.length > 0)
        {
            const worker = this._idle.pop();
            const job = this._queue.shift();
            this._jobs.set(job.id, job);
            worker.job = job.id;
            worker.postMessage({ id: job.id, level: job.level, options: job.options });
        }
    }

    _done(worker, message)
    {
        const job = this._jobs.get(message.id);
        this._jobs.delete(message.id);
        worker.job = 0;
        this._idle.push(worker);
        if (job)
        {
            if (message.error)
                job.reject(new Error(message.error));
            else
                job.resolve(message.records);
        }
        this._pump();
    }

    _failed(worker, error)
    {
        const job = this._jobs.get(worker.job);
        if (job)
        {
            this._jobs.delete(worker.job);
            job.reject(error);
        }
    }
}
