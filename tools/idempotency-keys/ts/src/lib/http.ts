import type { StoredResponse } from './attempt.js';

/**
 * Why `handle()` answered a request itself:
 *
 * - `missing-key` (`400`): the operation requires a key, and the request has none
 * - `invalid-key` (`400`): the `Idempotency-Key` header can't be read
 * - `conflict` (`409`): a request with the key is still running, and waiting for it ran out
 * - `mismatch` (`422`): the key was used on a different request
 */
export type ProblemKind = 'conflict' | 'invalid-key' | 'mismatch' | 'missing-key';

const badRequest = 400;
const conflict = 409;
const unprocessableContent = 422;

const problems = {
    'missing-key': {
        status: badRequest,
        title: 'Bad Request',
        detail: 'This operation requires an Idempotency-Key header.',
    },
    'invalid-key': {
        status: badRequest,
        title: 'Bad Request',
        detail: 'The Idempotency-Key header must be one key of 1 to 255 printable ASCII characters, or a Structured Field String holding one.',
    },
    conflict: {
        status: conflict,
        title: 'Conflict',
        detail: 'A request with this Idempotency-Key is still being processed.',
    },
    mismatch: {
        status: unprocessableContent,
        title: 'Unprocessable Content',
        detail: 'This Idempotency-Key was already used on a different request.',
    },
} as const satisfies Record<ProblemKind, { status: number; title: string; detail: string }>;

/**
 * The default answer to each problem: an [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) problem document, with
 * the status code the IETF draft gives.
 *
 * @param kind - What went wrong
 * @returns `application/problem+json` response
 */
export const problemResponse = (kind: ProblemKind): Response => {
    const { status, title, detail } = problems[kind];
    return Response.json(
        { type: 'about:blank', title, status, detail },
        {
            status,
            headers: { 'content-type': 'application/problem+json' },
        }
    );
};

/**
 * The request target as received: the path and query of the request's URL, without its origin or fragment.
 *
 * @param url - The request's full URL
 * @returns Path and query, as the URL has them
 */
export const requestTarget = (url: string): string => {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.href.slice(parsed.origin.length);
};

/**
 * `Response` takes `null` for no body, and rejects an empty one with a status like `204`.
 *
 * @param body - Body bytes
 * @returns A body `Response` takes
 */
export const responseBody = (body: Uint8Array): Uint8Array<ArrayBuffer> | null =>
    body.byteLength === 0 ? null : new Uint8Array(body);

/**
 * Builds the replay of a stored response.
 *
 * @param response - Stored response
 * @returns The response, with `Idempotent-Replayed: true`
 */
export const replayResponse = ({ status, headers, body }: StoredResponse): Response =>
    new Response(responseBody(body), {
        status,
        headers: [...headers, ['idempotent-replayed', 'true']] as [string, string][],
    });
