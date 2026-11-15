import type { KyInstance } from 'ky';
import type { Send } from './compose.js';
import { isHTTPError } from 'ky';

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
 * Sends with a Ky instance, as the last `Send` of a composed `fetch`: Ky retries and times out as it's set up to,
 * and the result is `fetch`'s, an error status included.
 *
 * Ky retries only the statuses it throws an `HTTPError` for (`throwHttpErrors`), so set that to the retry statuses.
 * Once Ky is out of retries, the status comes back as a response rather than its `HTTPError`. A request that isn't
 * safe to send twice (neither an idempotent method nor with an `Idempotency-Key`) is sent once, whatever Ky's
 * `retry.methods` say. Include `post` there for those with a key to be retried.
 *
 * @param api - The Ky instance, with its retry and timeout options
 * @returns What sends each request with it
 * @rejects {NetworkError} When the network still fails once out of retries
 * @rejects {TimeoutError} When an attempt times out
 */
export const kySend =
    (api: KyInstance): Send =>
    async request => {
        try {
            return await api(request, isReplayable(request) ? {} : { retry: 0 });
        } catch (error) {
            if (!isHTTPError(error)) {
                throw error;
            }
            return rebuild(error.response, error.data);
        }
    };
