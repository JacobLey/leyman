import type { Middleware } from '@leyman/demo-fetch-middleware';
import { TimeoutError } from 'ky';

/**
 * Aborts a send that has no response (its headers) within `ms`, and rejects with Ky's `TimeoutError`, so Ky treats
 * it as one of its own timeouts: `isTimeoutError` recognizes it, and `retry.retryOnTimeout` retries it. The timer
 * starts when this middleware is called, so composed after `limitConcurrency` it times only the send, not the wait
 * for a slot, which Ky's own `timeout` (it wraps the whole `fetch` option) would count. See
 * [Ky's timeout](https://github.com/sindresorhus/ky/blob/v2.2.0/source/utils/timeout.ts).
 *
 * The abort reaches the send through the request's signal, alongside the caller's: what sends must honor it, as
 * `fetch` does, rejecting with the signal's reason. A caller's abort rejects with its own reason, as before.
 *
 * @param ms - How long a send may take to respond
 * @returns The middleware
 */
export const attemptTimeout =
    (ms: number): Middleware =>
    next =>
    async request => {
        const timer = new AbortController();
        const timeout = setTimeout(() => {
            timer.abort(new TimeoutError(request));
        }, ms);
        try {
            return await next(
                new Request(request, { signal: AbortSignal.any([request.signal, timer.signal]) })
            );
        } finally {
            clearTimeout(timeout);
        }
    };
