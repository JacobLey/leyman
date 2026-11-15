import type { IBackoff, IBackoffFactory, IRetryBackoffContext } from 'cockatiel';
import type { Middleware } from './compose.js';
import { ExponentialBackoff, handleWhen, retry as retryPolicy } from 'cockatiel';

export interface RetryOptions {
    /**
     * How many times a request is sent at most, the first time included.
     *
     * @default 3
     */
    readonly maxAttempts?: number | undefined;
    /**
     * How long to wait before each retry, when the response doesn't say (`Retry-After`).
     *
     * @default cockatiel's `ExponentialBackoff`: 128ms doubling with decorrelated jitter, up to 30s
     */
    readonly backoff?: IBackoffFactory<IRetryBackoffContext<unknown>> | undefined;
    /**
     * The statuses worth sending the request again for.
     *
     * @default 429, 502, 503 and 504
     */
    readonly statuses?: ReadonlySet<number> | undefined;
    /**
     * The longest `Retry-After` waited for. A response that asks for longer is returned rather than retried.
     *
     * @default 30 seconds
     */
    readonly maxRetryAfterMs?: number | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-magic-numbers -- HTTP statuses
const defaultStatuses: ReadonlySet<number> = new Set([429, 502, 503, 504]);
const defaultMaxAttempts = 3;
const defaultMaxRetryAfterMs = 30_000;
const millisecondsPerSecond = 1000;

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
 * How long a response asks to wait (`Retry-After`, in seconds or as a date), if it says.
 *
 * @param response - What the server answered
 * @returns The milliseconds, at least 0
 */
const retryAfterMs = (response: Response): number | undefined => {
    const header = response.headers.get('retry-after');
    if (header === null) {
        return undefined;
    }
    const at = /^\d+$/v.test(header)
        ? Date.now() + Number(header) * millisecondsPerSecond
        : // eslint-disable-next-line unicorn/prefer-temporal -- An HTTP-date (RFC 9110 §5.6.7) is `toUTCString`'s format, which `Date.parse` must read (ECMA-262 §21.4.3.2). Temporal reads none of them
          Date.parse(header);
    return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
};

/**
 * The backoff's delays, except after a response that says how long to wait.
 *
 * @param backoff - The delays otherwise
 * @returns The same backoff, honoring `Retry-After`
 */
const honoringRetryAfter = (
    backoff: IBackoffFactory<IRetryBackoffContext<unknown>>
): IBackoffFactory<IRetryBackoffContext<unknown>> => ({
    next: context => {
        const next: IBackoff<IRetryBackoffContext<unknown>> = backoff.next(context);
        const asked =
            'value' in context.result && context.result.value instanceof Response
                ? retryAfterMs(context.result.value)
                : undefined;
        return {
            duration: asked ?? next.duration,
            next: nextContext => honoringRetryAfter(next).next(nextContext),
        };
    },
});

/**
 * Whether a send failed to reach the server at all: `fetch` rejects with a `TypeError` caused by the network error
 * ([Fetch §4.6](https://fetch.spec.whatwg.org/#http-network-fetch)), while an abort or timeout is a `DOMException`.
 *
 * @param error - What the send rejected with
 * @returns Whether it's a network error
 */
const isNetworkError = (error: unknown): boolean =>
    error instanceof TypeError && error.cause !== undefined;

/**
 * Sends a request again when the network failed or the response is one of the statuses, waiting longer each time,
 * or as long as the response asks. Only requests safe to send twice are retried: idempotent methods, and those with
 * an `Idempotency-Key`.
 *
 * @param options - How many times, how long between, and for which statuses
 * @returns The middleware
 */
export const retry = (options: RetryOptions = {}): Middleware => {
    const statuses = options.statuses ?? defaultStatuses;
    const maxRetryAfterMs = options.maxRetryAfterMs ?? defaultMaxRetryAfterMs;
    const policy = retryPolicy(
        handleWhen(isNetworkError).orWhenResult(
            result =>
                result instanceof Response &&
                statuses.has(result.status) &&
                (retryAfterMs(result) ?? 0) <= maxRetryAfterMs
        ),
        {
            maxAttempts: (options.maxAttempts ?? defaultMaxAttempts) - 1,
            backoff: honoringRetryAfter(options.backoff ?? new ExponentialBackoff()),
        }
    );
    // A response retried is never read: free its connection
    policy.onRetry(reason => {
        if ('value' in reason && reason.value instanceof Response) {
            void reason.value.body?.cancel();
        }
    });
    return next => async request =>
        isReplayable(request)
            ? policy.execute(
                  async ({ signal }) => next(new Request(request.clone(), { signal })),
                  request.signal
              )
            : next(request);
};
