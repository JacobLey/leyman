/* eslint-disable @typescript-eslint/no-magic-numbers -- HTTP status codes, as the spec documents them */
import type { ProblemKind } from 'idempotency-keys';
import type { NotesAppConfig } from './app.js';
import type { NotesDatabase } from './handlers.js';
import { IdempotencyKeys } from 'idempotency-keys';
import { PostgresStore } from 'idempotency-keys/postgres';

const problems = {
    // The spec never requires a key, so this is only reached by an app that changes it to
    'missing-key': {
        status: 400,
        code: 'invalid_request',
        message: 'This operation requires an Idempotency-Key header',
    },
    'invalid-key': {
        status: 400,
        code: 'invalid_request',
        message:
            'The Idempotency-Key header must be one key of 1 to 255 printable ASCII characters',
    },
    conflict: {
        status: 409,
        code: 'idempotency_key_in_use',
        message: 'A request with this Idempotency-Key is still running: retry later',
    },
    mismatch: {
        status: 422,
        code: 'idempotency_key_reused',
        message: 'This Idempotency-Key was already used on a different request',
    },
} as const satisfies Record<
    ProblemKind,
    { readonly status: number; readonly code: string; readonly message: string }
>;

/**
 * Idempotency-keys' answer to a request it can't run, in the spec's `ApiError` shape rather than its default problem
 * document, with the statuses the spec documents.
 *
 * @param kind - What went wrong
 * @returns An `ApiError` response
 */
export const idempotencyProblem = (kind: ProblemKind): Response => {
    const { status, code, message } = problems[kind];
    return Response.json({ code, message }, { status });
};

/**
 * Idempotency keys in the database's `idempotency_keys` table, on the same pool as the handlers, with the library's
 * defaults: a key lasts 24 hours, a duplicate waits up to 10 seconds, and every response but a `429` is kept (a
 * `500` too, as the write may have happened). No notifier: a waiting duplicate polls the table, since the server owns
 * no connection to `LISTEN` on.
 *
 * @param db - Drizzle, whose pool the store queries too
 * @param config - Where a failure to store a response is reported
 * @returns Keys in Postgres, answering what they can't run with an `ApiError`
 */
export const postgresIdempotencyKeys = (
    db: NotesDatabase,
    config: NotesAppConfig
): IdempotencyKeys =>
    new IdempotencyKeys({
        store: new PostgresStore({ client: db.$client }),
        problem: idempotencyProblem,
        // The caller got its response; the key stays held until its lease runs out
        onError: error => {
            config.onError(error as Error);
        },
    });
