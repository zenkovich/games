// One batch of attempts, as a worker of either host plays it
import { playBatch } from './sim.mjs';

export function playJob(job)
{
    try
    {
        return { id: job.id, records: playBatch(job.level, job.options) };
    }
    catch (error)
    {
        return { id: job.id, error: String(error && error.stack || error) };
    }
}
