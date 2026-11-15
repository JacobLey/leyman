import type PQueue from 'p-queue';
import type { Middleware } from '@leyman/demo-fetch-middleware';

/**
 * Sends each request only once the queue has a slot for it, so a queue with a `concurrency` caps how many requests
 * are in flight at once, across everything that shares it. A request holds its slot until its response arrives (its
 * headers, not its body) or it fails. Composed into Ky's own `fetch`, that's each attempt; outside Ky, it would be
 * the whole call, retries and their delays included.
 *
 * A request aborted while it waits leaves the queue, and rejects with the abort's reason.
 *
 * @param queue - The slots to wait for
 * @returns The middleware
 */
export const limitConcurrency =
    (queue: PQueue): Middleware =>
    next =>
    async request =>
        queue.add(async () => next(request), { signal: request.signal });
