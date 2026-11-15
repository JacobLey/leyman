import type { AfterResponseHook, NormalizedOptions, Options, RetryOptions } from 'ky';
import type { Send } from './compose.js';
import ky, { isNetworkError, isTimeoutError } from 'ky';

/**
 * @import { NetworkError, TimeoutError } from 'ky'
 */

/**
 * Methods that are idempotent: sending one twice has the effect of sending it once, so a retry is safe even when
 * the first got through. See [RFC 9110 §9.2.2](https://www.rfc-editor.org/rfc/rfc9110#section-9.2.2), and
 * [draft-ietf-httpbis-safe-method-w-body](https://datatracker.ietf.org/doc/draft-ietf-httpbis-safe-method-w-body/)
 * for `QUERY`.
 */
const idempotentMethods: ReadonlySet<string> = new Set([
    'DELETE',
    'GET',
    'HEAD',
    'OPTIONS',
    'PUT',
    'QUERY',
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
const isReplayable = (request: Readonly<Request>): boolean =>
    idempotentMethods.has(request.method) || request.headers.has('idempotency-key');

/**
 * Every method Ky may retry after a network error or timeout: Ky's own check lets them all through, and
 * `shouldRetry` decides by `isReplayable`.
 */
const retryMethods: readonly string[] = [...idempotentMethods, 'PATCH', 'POST'].map(method =>
    method.toLowerCase()
);

/**
 * Ky's `shouldRetry`, which Ky calls for a network error or timeout (statuses are retried by `retryStatus`): no
 * retry for a request that isn't safe to send again, and otherwise Ky's own checks. Both errors carry their
 * request; Ky doesn't retry any other error by its own checks either.
 *
 * @param state - What Ky passes
 * @param state.error - Why the attempt failed
 * @returns `false` to send no more, or `undefined` for Ky's own checks
 */
const shouldRetry = ({ error }: { readonly error: Error }): false | undefined =>
    (isNetworkError(error) || isTimeoutError(error)) && !isReplayable(error.request)
        ? false
        : undefined;

/**
 * The delay a `Retry-After` header asks for, in milliseconds: delay-seconds or an HTTP-date
 * ([RFC 9110 §10.2.3](https://www.rfc-editor.org/rfc/rfc9110#section-10.2.3)), or `undefined` when there is none
 * or it can't be read.
 *
 * @param headers - The response's headers
 * @returns The delay, if any
 */
const retryAfter = (headers: Readonly<Headers>): number | undefined => {
    const value = headers.get('retry-after');
    if (value === null) {
        return undefined;
    }
    if (/^\d+$/v.test(value)) {
        // eslint-disable-next-line @typescript-eslint/no-magic-numbers -- seconds to milliseconds
        return Number(value) * 1000;
    }
    // An HTTP-date isn't a form Temporal parses; `Date.parse` reads the IMF-fixdate a sender must use
    // eslint-disable-next-line unicorn/prefer-temporal -- see above
    const date = Date.parse(value);
    return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
};

/**
 * The delay before a retry of a status, as Ky would choose it for a status it throws for: what `Retry-After` asks
 * for, cut to `maxRetryAfter`, when the status is in `afterStatusCodes`, and otherwise `undefined` for Ky's
 * backoff.
 *
 * @param status - The response's status
 * @param headers - The response's headers
 * @param retry - Ky's retry options, normalized
 * @returns The delay in milliseconds, or `undefined` for Ky's own
 */
const retryDelay = (
    status: number,
    headers: Readonly<Headers>,
    retry: Readonly<NormalizedOptions['retry']>
): number | undefined => {
    const after = retry.afterStatusCodes.includes(status) ? retryAfter(headers) : undefined;
    return after === undefined ? undefined : Math.min(after, retry.maxRetryAfter);
};

/**
 * An `afterResponse` hook that has Ky send the request again after a retry status, while it's safe to and retries
 * remain, and otherwise leaves the response as it is.
 *
 * A retry forced with `ky.retry()` skips Ky's `methods`, `shouldRetry` and retry timing headers, and uses its
 * `delay` instead of Ky's backoff when one is given
 * ([Ky's source](https://github.com/sindresorhus/ky/blob/3541888878c4d303a8bc2ad61815f4e048f55a5d/source/core/Ky.ts#L688-L700)),
 * so the hook checks the request and reads `Retry-After` itself, as Ky would for a status it throws for. Ky throws
 * the forced retry as an error once out of retries, so the hook only asks while `retryCount` is under the limit.
 *
 * @param state - What Ky passes
 * @param state.request - The request, ready to send again
 * @param state.response - Its response
 * @param state.options - Ky's options, its retry options normalized
 * @param state.retryCount - How many retries were sent before it
 * @returns A retry, or `undefined` to keep the response
 */
const retryStatus: AfterResponseHook = ({
    request,
    response: { status, headers },
    options: { retry },
    retryCount,
}) =>
    retry.statusCodes.includes(status) && retryCount < retry.limit && isReplayable(request)
        ? ky.retry({ delay: retryDelay(status, headers, retry) })
        : undefined;

export interface KySendOptions extends Omit<Options, 'retry' | 'throwHttpErrors'> {
    /**
     * Ky's retry options. Which requests are retried is up to `kySend` (see it), so there are no `methods` or
     * `shouldRetry`. `statusCodes` is required: Ky's default list counts on Ky not retrying a `413` without a
     * `Retry-After`, which `kySend` doesn't copy.
     */
    readonly retry: Omit<RetryOptions, 'methods' | 'shouldRetry' | 'statusCodes'> & {
        readonly statusCodes: readonly number[];
    };
}

/**
 * Sends with Ky, as the last `Send` of a composed `fetch`: Ky retries and times out as it's set up to, and the
 * result is `fetch`'s, an error status included, its body untouched.
 *
 * Only a request safe to send twice is retried: an idempotent method, or one with an `Idempotency-Key` (a retry an
 * `afterResponse` hook of the caller's forces with `ky.retry()` is that hook's own decision). Once out of retries,
 * the last response comes back as it is. A retry status is retried by an `afterResponse` hook, so a `beforeRetry`
 * hook sees a `ForceRetryError` for it rather than an `HTTPError`. A delay that `Retry-After` asks for is used
 * when the status is in `retry.afterStatusCodes`, cut to `retry.maxRetryAfter`, without jitter, as Ky does; other
 * delays are Ky's backoff.
 *
 * @param options - Ky's options: its retries, timeout and so on
 * @returns What sends each request with Ky
 * @rejects {NetworkError} When the network still fails once out of retries, or at once when not safe to retry
 * @rejects {TimeoutError} When an attempt times out and isn't retried (`retry.retryOnTimeout` is off, it's not
 * safe to retry, or it was the last), or `totalTimeout` runs out, retries left or not
 */
export const kySend = (options: KySendOptions): Send => {
    const api = ky.create({
        ...options,
        retry: {
            ...options.retry,
            statusCodes: [...options.retry.statusCodes],
            methods: [...retryMethods],
            shouldRetry,
        },
        hooks: {
            ...options.hooks,
            afterResponse: [...(options.hooks?.afterResponse ?? []), retryStatus],
        },
        throwHttpErrors: false,
    });
    return async request => api(request);
};
