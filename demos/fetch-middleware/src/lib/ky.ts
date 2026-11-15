import type { Options, RetryOptions } from 'ky';
import type { Send } from './compose.js';
import ky, { isHTTPError, isNetworkError, isTimeoutError } from 'ky';

/**
 * @import { NetworkError, TimeoutError } from 'ky'
 */

/**
 * Methods that are idempotent: sending one twice has the effect of sending it once, so a retry is safe even when
 * the first got through. See [RFC 9110 §9.2.2](https://www.rfc-editor.org/rfc/rfc9110#section-9.2.2).
 */
const idempotentMethods: ReadonlySet<string> = new Set([
    'DELETE',
    'GET',
    'HEAD',
    'OPTIONS',
    'PUT',
    'TRACE',
]);

/**
 * Whether sending the request again is safe: its method is idempotent, or it carries an `Idempotency-Key` for the
 * server to send the first's response again
 * ([draft-ietf-httpapi-idempotency-key-header](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/)).
 *
 * @param request - What would be sent again
 * @returns Whether it can be retried
 */
const isReplayable = (request: Request): boolean =>
    idempotentMethods.has(request.method) || request.headers.has('idempotency-key');

/**
 * Every method Ky may retry: Ky's own check lets them all through, and `shouldRetry` decides by `isReplayable`.
 */
const retryMethods: readonly string[] = [...idempotentMethods, 'PATCH', 'POST'].map(method =>
    method.toLowerCase()
);

/**
 * Ky's `shouldRetry`: no retry for a request that isn't safe to send again, and otherwise Ky's own checks. Every
 * error Ky retries carries its request; any other error isn't retried by Ky's checks either.
 *
 * @param state - What Ky passes
 * @param state.error - Why the attempt failed
 * @returns `false` to send no more, or `undefined` for Ky's own checks
 */
const shouldRetry = ({ error }: { readonly error: Error }): false | undefined => {
    if (
        (isHTTPError(error) || isNetworkError(error) || isTimeoutError(error)) &&
        !isReplayable(error.request)
    ) {
        return false;
    }
    return undefined;
};

export interface KySendOptions extends Omit<Options, 'retry' | 'throwHttpErrors'> {
    /**
     * Ky's retry options. Which requests are retried is up to `kySend` (see it), so there are no `methods` or
     * `shouldRetry`, and `statusCodes` is required: it's also which statuses Ky throws for.
     */
    readonly retry: Omit<RetryOptions, 'methods' | 'shouldRetry' | 'statusCodes'> & {
        readonly statusCodes: readonly number[];
    };
}

/**
 * The response an `HTTPError` was for. Ky has already read its body into `data` (parsed, for JSON), so the body is
 * that again: the same JSON or text, or none when Ky couldn't read it.
 *
 * @param response - The response, its body used
 * @param data - What Ky read from its body
 * @returns A response like it, its body readable
 */
const rebuild = (response: Response, data: unknown): Response => {
    const headers = new Headers(response.headers);
    // The body is decoded, and may be a different length once serialized again
    headers.delete('content-encoding');
    headers.delete('content-length');
    let body: string | null = null;
    if (typeof data === 'string') {
        body = data;
    } else if (data !== undefined) {
        body = JSON.stringify(data);
    }
    return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
};

/**
 * Sends with Ky, as the last `Send` of a composed `fetch`: Ky retries and times out as it's set up to, and the
 * result is `fetch`'s, an error status included.
 *
 * Only a request safe to send twice is retried: an idempotent method, or one with an `Idempotency-Key` (a retry an
 * `afterResponse` hook forces with `ky.retry()` is that hook's own decision, and Ky doesn't check it). Ky retries
 * only the statuses it throws an `HTTPError` for, so it throws for exactly the retry statuses, and once it's out of
 * retries the status comes back as a response rather than its `HTTPError`. A delay that `Retry-After` asks for
 * longer than `retry.maxRetryAfter` is cut to it, as Ky does.
 *
 * @param options - Ky's options: its retries, timeout and so on
 * @returns What sends each request with Ky
 * @rejects {NetworkError} When the network still fails once out of retries
 * @rejects {TimeoutError} When an attempt times out
 */
export const kySend = (options: KySendOptions): Send => {
    const statuses: ReadonlySet<number> = new Set(options.retry.statusCodes);
    const api = ky.create({
        ...options,
        retry: {
            ...options.retry,
            statusCodes: [...statuses],
            methods: [...retryMethods],
            shouldRetry,
        },
        throwHttpErrors: status => statuses.has(status),
    });
    return async request => {
        try {
            return await api(request);
        } catch (error) {
            if (!isHTTPError(error)) {
                throw error;
            }
            return rebuild(error.response, error.data);
        }
    };
};
