// Pool of simulation workers: many bots play at once, one batch of attempts per worker at a time. The workers are the
// host's (node_host.mjs: worker threads, web_host.mjs: Web Workers).
import { getHost } from './core.mjs';

export class Pool
{
    constructor(size)
    {
        const host = getHost();
        this.size = Math.max(1, size || host.parallelism());
        this.attempts = 0;
        this._workers = [];
        this._idle = [];
        this._queue = [];
        this._jobs = new Map();
        this._nextId = 1;
        for (let i = 0; i < this.size; i++)
        {
            const worker = host.makeWorker();
            worker.onMessage((message) => this._done(worker, message));
            worker.onError((error) => this._failed(worker, error));
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
        for (const job of this._jobs.values())
            job.reject(new Error('the bots were stopped'));
        for (const job of this._queue)
            job.reject(new Error('the bots were stopped'));
        this._workers = [];
        this._idle = [];
        this._queue = [];
        this._jobs.clear();
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
            worker.post({ id: job.id, level: job.level, options: job.options });
        }
    }

    _done(worker, message)
    {
        // a worker that could not start says so before any job
        if (!message.id)
        {
            this._failed(worker, new Error(message.error || 'worker error'));
            return;
        }
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
        else
        {
            // nothing to hand the failure to: the next job would wait for this worker forever
            this._idle = this._idle.filter((item) => item != worker);
            for (const waiting of this._queue.splice(0))
                waiting.reject(error);
        }
    }
}
