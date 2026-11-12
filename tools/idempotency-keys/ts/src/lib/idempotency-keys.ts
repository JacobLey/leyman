import type {
    AttemptContext,
    ClaimResult,
    IdempotencyAttempt,
    IdempotencyStore,
    RespondPolicy,
    StoredResponse,
} from './attempt.js';
import type { ProblemKind } from './http.js';
import type { IdempotencyNotifier } from './listeners.js';
import { Attempt } from './attempt.js';
import { newToken } from './encoding.js';
import { IdempotencyKeysBodyUsedError, IdempotencyKeysOptionError } from './errors.js';
import { computeFingerprint, computeIdentity } from './hashes.js';
import { problemResponse, replayResponse, requestTarget, responseBody } from './http.js';
import { readKeyValue } from './key.js';
import { Wakeup } from './wakeup.js';

const tooManyRequests = 429;

/**
 * Completes every response but a `429` (Too Many Requests), which says nothing was done.
 *
 * @param response - The attempt's response
 * @returns `release` for a `429`, else `complete`
 */
export const defaultRespondPolicy: RespondPolicy = ({ status }) =>
    status === tooManyRequests ? 'release' : 'complete';

export interface IdempotencyKeysOptions {
    /**
     * Where records live: a `PostgresStore` (from `idempotency-keys/postgres`), a `ValkeyStore` (from
     * `idempotency-keys/valkey`), or any store keeping the spec's store contract.
     */
    readonly store: IdempotencyStore;
    /**
     * Wakes waiting requests when a record changes, on this server and others. Without one, they only poll.
     */
    readonly notifier?: IdempotencyNotifier;
    /**
     * How long a key lasts from when it was claimed, in milliseconds. Defaults to 24 hours.
     */
    readonly ttlMs?: number;
    /**
     * How long a request may run before another may take over, in milliseconds: longer than the slowest handler,
     * so a slow request never runs twice. Below `ttlMs`. Defaults to 60 seconds.
     */
    readonly leaseMs?: number;
    /**
     * How long a request waits on a running one with its key before a conflict, in milliseconds. `0` answers at
     * once. Defaults to 10 seconds.
     */
    readonly waitMs?: number;
    /**
     * Which responses complete and which release. Defaults to {@link defaultRespondPolicy}.
     */
    readonly respondPolicy?: RespondPolicy;
    /**
     * Headers that are part of a request's fingerprint in `handle()`, in any case. None by default.
     */
    readonly fingerprintHeaders?: readonly string[];
    /**
     * The response `handle()` gives for each problem. Defaults to an RFC 9457 problem document.
     */
    readonly problem?: (kind: ProblemKind, request: Request) => Promise<Response> | Response;
    /**
     * Called with a failure that doesn't fail the request, and the identity of its key. Ignored by default.
     *
     * - Announcing a completed or released record failed: the attempt still ended as it did, and other servers'
     *   waiting requests notice by polling.
     * - In `handle()`, the response couldn't be stored: a replay couldn't send it (`IdempotencyKeysResponseError`),
     *   or the store failed to complete or release it. The caller still gets the response, and the key is held until
     *   its lease runs out.
     */
    readonly onError?: (error: unknown, identity: string) => void;
}

export interface BeginParams {
    /**
     * Who is calling: a user or tenant id. Not empty.
     */
    readonly scope: string;
    /**
     * Which operation the request is for, e.g. an OpenAPI `operationId`. Not empty.
     */
    readonly operation?: string;
    /**
     * The key, as `parseIdempotencyKey()` reads it.
     */
    readonly key: string;
    /**
     * The request's fingerprint, from {@link computeFingerprint}.
     */
    readonly fingerprint: string;
}

/**
 * How `begin()` answers a request:
 *
 * - `run`: it holds the key, so it runs, and ends its `attempt`
 * - `replay`: a request with the key completed, so it gets that `response`
 * - `conflict`: a request with the key is still running, and waiting ran out (`409`)
 * - `mismatch`: the key was used on a different request (`422`)
 */
export type BeginResult =
    | { readonly outcome: 'conflict' }
    | { readonly outcome: 'mismatch' }
    | { readonly outcome: 'replay'; readonly response: StoredResponse }
    | { readonly outcome: 'run'; readonly attempt: IdempotencyAttempt };

export interface HandleOptions {
    /**
     * Who is calling: a user or tenant id. Not empty.
     */
    readonly scope: string;
    /**
     * Which operation the request is for, e.g. an OpenAPI `operationId`. Not empty.
     */
    readonly operation?: string;
    /**
     * Whether a request without a key is a `400`. Otherwise it runs as it would without the library.
     */
    readonly required?: boolean;
}

const defaultTtlMs = 86_400_000;
const defaultLeaseMs = 60_000;
const defaultWaitMs = 10_000;

/**
 * Polling, the fallback for a lost notification, starts at this interval and doubles up to the next.
 */
const firstPollMs = 50;
const maxPollMs = 1000;

/**
 * Checks a duration option.
 *
 * @param option - Name of the option, for the error
 * @param value - Duration in milliseconds
 * @param minimum - Lowest valid value
 * @returns The duration, once checked
 * @throws {IdempotencyKeysOptionError} When not a whole number of at least `minimum`
 */
const duration = (option: string, value: number, minimum: 0 | 1): number => {
    if (!Number.isSafeInteger(value) || value < minimum) {
        throw new IdempotencyKeysOptionError(
            option,
            value,
            `must be a whole number of milliseconds of at least ${minimum}`
        );
    }
    return value;
};

/**
 * Checks that a scope, operation or key, when given, isn't empty and is well-formed Unicode.
 *
 * @param option - Name of the value, for the error
 * @param value - Scope, operation or key
 * @throws {IdempotencyKeysOptionError} When empty, or with a lone surrogate
 */
const checkPart = (option: string, value: string | undefined): void => {
    if (value === '') {
        throw new IdempotencyKeysOptionError(option, value, 'must not be empty');
    }
    // A lone surrogate has no UTF-8 encoding, so it can't be hashed as the spec says
    if (value?.isWellFormed() === false) {
        throw new IdempotencyKeysOptionError(option, value, 'must be well-formed Unicode');
    }
};

/**
 * `Idempotency-Key` handling: a request with a key runs once, across every server on the same store, and every
 * later request with the key gets its response.
 */
export class IdempotencyKeys {
    readonly #store: IdempotencyStore;
    readonly #notifier: IdempotencyNotifier | undefined;
    readonly #attemptContext: AttemptContext;
    readonly #ttlMs: number;
    readonly #leaseMs: number;
    readonly #waitMs: number;
    readonly #fingerprintHeaders: readonly string[];
    readonly #problem: (kind: ProblemKind, request: Request) => Promise<Response> | Response;
    readonly #onError: (error: unknown, identity: string) => void;

    /**
     * @param options - Store, notifier and timings
     * @throws {IdempotencyKeysOptionError} When a duration is invalid, or `leaseMs` isn't below `ttlMs`
     */
    public constructor({
        store,
        notifier,
        ttlMs = defaultTtlMs,
        leaseMs = defaultLeaseMs,
        waitMs = defaultWaitMs,
        respondPolicy = defaultRespondPolicy,
        fingerprintHeaders = [],
        problem = problemResponse,
        onError = () => {},
    }: IdempotencyKeysOptions) {
        this.#store = store;
        this.#notifier = notifier;
        this.#ttlMs = duration('ttlMs', ttlMs, 1);
        this.#leaseMs = duration('leaseMs', leaseMs, 1);
        this.#waitMs = duration('waitMs', waitMs, 0);
        if (this.#leaseMs >= this.#ttlMs) {
            throw new IdempotencyKeysOptionError('leaseMs', leaseMs, 'must be less than ttlMs');
        }
        this.#attemptContext = { store, notifier, respondPolicy, onError };
        this.#onError = onError;
        this.#fingerprintHeaders = fingerprintHeaders;
        this.#problem = problem;
    }

    /**
     * Claims a key for a request. A request with the key that completed is replayed, and one still running is
     * waited on (up to `waitMs`). A key used on a different request is a mismatch, at once.
     *
     * @param params - Scope, operation, key and fingerprint
     * @returns Whether to run, replay, or answer `409` or `422`
     * @throws {IdempotencyKeysOptionError} When `scope`, `operation` or `key` is empty or not well-formed Unicode
     */
    public async begin(params: BeginParams): Promise<BeginResult> {
        checkPart('scope', params.scope);
        checkPart('operation', params.operation);
        checkPart('key', params.key);
        const identity = await computeIdentity(params);
        const { fingerprint } = params;
        const deadline = performance.now() + this.#waitMs;

        // Subscribed before the first claim, so no notification after it is missed
        const wakeup = new Wakeup();
        const unsubscribe = this.#notifier?.subscribe(identity, () => {
            wakeup.wake();
        });
        try {
            let token = newToken();
            const claim = async (): Promise<ClaimResult> =>
                this.#store.claim({
                    identity,
                    fingerprint,
                    token,
                    leaseMs: this.#leaseMs,
                    ttlMs: this.#ttlMs,
                });

            let result = await claim();
            // Waits while another request with the same fingerprint runs. A mismatch never waits
            let polls = 0;
            while (result.state === 'running' && result.fingerprint === fingerprint) {
                const remaining = deadline - performance.now();
                if (remaining <= 0) {
                    return { outcome: 'conflict' };
                }
                await wakeup.sleep(Math.min(firstPollMs * 2 ** polls, maxPollMs, remaining));
                polls++;
                wakeup.reset();
                token = newToken();
                result = await claim();
            }

            if (result.state === 'claimed') {
                return {
                    outcome: 'run',
                    attempt: new Attempt(identity, token, this.#attemptContext),
                };
            }
            if (result.state === 'running' || result.fingerprint !== fingerprint) {
                return { outcome: 'mismatch' };
            }
            return { outcome: 'replay', response: result.response };
        } finally {
            unsubscribe?.();
        }
    }

    /**
     * Handles a request with fetch's `Request` and `Response`: reads its `Idempotency-Key` header, runs `run` at
     * most once per key, and stores its response by the respond policy. A replay has the header
     * `Idempotent-Replayed: true`. Each response is read whole, to store it, so a streamed one is buffered before it is sent.
     *
     * A request without a key runs as is, unless `required`. When `run` rejects, the attempt doesn't end:
     * its lease runs out, and a later request with the key runs. When the response can't be stored (a replay couldn't
     * send it, or the store fails to complete or release it), it is still returned, and the failure goes to `onError`.
     *
     * @param request - Request to handle, whose body is read from a clone
     * @param options - Scope and operation of the request
     * @param run - Runs the request, given the request as it came
     * @returns `run`'s response, a replay, or a problem response
     * @rejects {IdempotencyKeysBodyUsedError} When the request's body was already read
     */
    public async handle(
        request: Request,
        { required = false, ...identity }: HandleOptions,
        run: (request: Request) => Promise<Response>
    ): Promise<Response> {
        if (request.bodyUsed) {
            throw new IdempotencyKeysBodyUsedError();
        }
        const header = request.headers.get('idempotency-key');
        if (header === null) {
            return required ? this.#problem('missing-key', request) : run(request);
        }
        const key = readKeyValue(header);
        if (key === false) {
            return this.#problem('invalid-key', request);
        }
        const fingerprint = await computeFingerprint({
            method: request.method,
            target: requestTarget(request.url),
            headers: request.headers,
            named: this.#fingerprintHeaders,
            body: new Uint8Array(await request.clone().arrayBuffer()),
        });

        const result = await this.begin({ ...identity, key, fingerprint });
        if (result.outcome === 'replay') {
            return replayResponse(result.response);
        }
        if (result.outcome !== 'run') {
            return this.#problem(result.outcome, request);
        }
        const response = await run(request);
        const body = new Uint8Array(await response.arrayBuffer());
        try {
            await result.attempt.respond({
                status: response.status,
                headers: [...response.headers],
                body,
            });
        } catch (error) {
            // The request ran, so its caller gets the response, which a retry couldn't give
            this.#onError(error, result.attempt.identity);
        }
        return new Response(responseBody(body), {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
        });
    }
}
