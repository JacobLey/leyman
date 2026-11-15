import type { Middleware } from './compose.js';

/**
 * Aborts each send that takes longer than the timeout, rejecting with a `TimeoutError`. A send the request's own
 * signal aborts first still rejects with its reason.
 *
 * @param milliseconds - How long a send may take, until its response's headers arrive
 * @returns The middleware
 */
export const timeout =
    (milliseconds: number): Middleware =>
    next =>
    async request => {
        const signal = AbortSignal.any([request.signal, AbortSignal.timeout(milliseconds)]);
        return next(new Request(request, { signal }));
    };
