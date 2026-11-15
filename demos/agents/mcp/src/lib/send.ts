import type PQueue from 'p-queue';
import type { Middleware, Send } from '@leyman/demo-fetch-middleware';
import { compose, kySend } from '@leyman/demo-fetch-middleware';
import { maxRetryAfterMs } from './discovery.js';
import { limitConcurrency } from './limit.js';
import { attemptTimeout } from './timeout.js';

/**
 * How long each attempt to send a request to the notes API may take to answer. Longer than the API holds a retry of
 * an `add_note` whose first attempt (same `Idempotency-Key`) still runs, 10 seconds, so the retry gets the first's
 * answer or the API's `409` rather than timing out first
 * ([the notes API's README](../../../../openapi/server/README.md#retrying-safely)).
 */
export const apiRequestTimeoutMs = 15_000;

export interface NotesApiSendOptions {
    /**
     * The slots each attempt waits for, shared by everything that should count against the same cap. Unset, there's
     * no cap.
     */
    readonly queue?: PQueue | undefined;
    /**
     * How long each attempt may take to answer, once it has a slot.
     */
    readonly timeoutMs: number;
}

/**
 * How requests to the notes API are sent: a request safe to send twice (a `GET`, or `add_note`'s `POST` with its
 * `Idempotency-Key`) is sent up to twice more when its answer may have been lost (a timeout, a dropped connection)
 * or the API is busy or behind a failing gateway.
 *
 * Inside Ky's retries, each attempt waits for a slot in `queue`, then times out `timeoutMs` after it got one. So the
 * cap counts attempts (a request waiting out a retry's delay holds no slot), and the wait for a slot never counts
 * against the timeout: under a burst, queued attempts wait rather than time out and come back as retries, and an
 * attempt doesn't time out after the API did its work. Ky's own `timeout` is off, as it would time the wait too.
 *
 * @param options - The queue, and the timeout
 * @returns What sends each request
 */
export const notesApiSend = (options: NotesApiSendOptions): Send => {
    const limit: Middleware[] =
        options.queue === undefined ? [] : [limitConcurrency(options.queue)];
    return kySend({
        fetch: compose([...limit, attemptTimeout(options.timeoutMs)]),
        timeout: false,
        retry: {
            limit: 2,
            // A 409 only comes from a POST whose Idempotency-Key is still running, so asking again is safe. A 500
            // isn't retried: the API stored it under the key, and would only answer it again
            // eslint-disable-next-line @typescript-eslint/no-magic-numbers -- HTTP statuses
            statusCodes: [409, 429, 502, 503, 504],
            // eslint-disable-next-line @typescript-eslint/no-magic-numbers -- HTTP statuses
            afterStatusCodes: [429, 503],
            maxRetryAfter: maxRetryAfterMs,
            jitter: true,
            retryOnTimeout: true,
        },
    });
};
