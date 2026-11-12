import type { IdempotencyNotifier } from './listeners.js';
import { IdempotencyKeysResponseError } from './errors.js';

/**
 * A response as stored and replayed.
 */
export interface StoredResponse {
    /**
     * An integer from 200 to 599.
     */
    readonly status: number;
    /**
     * `[name, value]` pairs, names in lower case, repeated names kept.
     */
    readonly headers: readonly (readonly [string, string])[];
    readonly body: Uint8Array;
}

export interface ClaimParams {
    /**
     * The key's identity, as 64 hex characters.
     */
    readonly identity: string;
    /**
     * The request's fingerprint, as 64 hex characters.
     */
    readonly fingerprint: string;
    /**
     * 32 hex characters, new for every claim.
     */
    readonly token: string;
    readonly leaseMs: number;
    readonly ttlMs: number;
}

/**
 * What a claim found:
 *
 * - `claimed`: no record (or an expired one, or a running one whose lease ran out with the same fingerprint), so
 *   the request holds it now
 * - `running`: another request holds it
 * - `completed`: a response is stored
 */
export type ClaimResult =
    | {
          readonly state: 'completed';
          readonly fingerprint: string;
          readonly response: StoredResponse;
      }
    | { readonly state: 'claimed' }
    | { readonly state: 'running'; readonly fingerprint: string };

/**
 * Where records live: the spec's three operations. A store written for this interface must keep the
 * [store contract](https://github.com/JacobLey/leyman/blob/main/tools/idempotency-keys/SPEC.md#the-store-contract):
 * each operation is atomic for its identity, reads see every completed write, a record past its `ttlMs` counts as
 * absent, every time is measured on one clock all servers agree on (the store's own, or else the servers'), and a
 * failure is a rejection, never an answer.
 */
export interface IdempotencyStore {
    /**
     * Claims the record for a request, or says what holds it.
     */
    readonly claim: (params: ClaimParams) => Promise<ClaimResult>;
    /**
     * Stores the response if the record still holds `token`.
     *
     * @returns Whether it did
     */
    readonly complete: (
        identity: string,
        token: string,
        response: StoredResponse
    ) => Promise<boolean>;
    /**
     * Deletes the record if it still holds `token`.
     *
     * @returns Whether it did
     */
    readonly release: (identity: string, token: string) => Promise<boolean>;
}

/**
 * Decides how an attempt ends, from its response: `complete` stores it, to replay to every later request with the
 * key; `release` deletes the record, so the next request with the key runs.
 */
export type RespondPolicy = (response: StoredResponse) => 'complete' | 'release';

/**
 * How `respond()` ended an attempt.
 */
export type RespondResult = 'lost' | 'released' | 'stored';

const minStatus = 200;
const maxStatus = 599;

/**
 * Statuses whose response has no body, which `fetch`'s `Response` refuses to build with one.
 */
const noContent = 204;
const resetContent = 205;
const notModified = 304;
const nullBodyStatuses: ReadonlySet<number> = new Set([noContent, resetContent, notModified]);

/**
 * Headers a server recomputes for every response it sends, which would be wrong on a replay, and the replay marker,
 * which only the replay adds.
 */
const unstoredHeaders: ReadonlySet<string> = new Set([
    'connection',
    'content-length',
    'idempotent-replayed',
    'keep-alive',
    'transfer-encoding',
]);

/**
 * Checks that a replay could send a response, as `fetch`'s `Response` would build it.
 *
 * @param response - Response to store
 * @throws {IdempotencyKeysResponseError} When the status isn't an integer from 200 to 599, or a null-body status has
 * a body
 */
const checkSendable = ({ status, body }: StoredResponse): void => {
    if (!Number.isSafeInteger(status) || status < minStatus || status > maxStatus) {
        throw new IdempotencyKeysResponseError(
            status,
            'a status must be an integer from 200 to 599'
        );
    }
    if (body.byteLength > 0 && nullBodyStatuses.has(status)) {
        throw new IdempotencyKeysResponseError(status, 'a 204, 205 or 304 must have an empty body');
    }
};

/**
 * A request that holds its key, and runs. End it with `respond()` or `release()`. One that never ends (it crashed)
 * holds the key until its lease runs out.
 */
export interface IdempotencyAttempt {
    /**
     * The key's identity, as 64 hex characters.
     */
    readonly identity: string;
    /**
     * Ends the attempt with its response, by the respond policy. Header names are stored in lower case, without the
     * headers a server recomputes for each response it sends (`content-length`, `transfer-encoding`, `connection`,
     * `keep-alive`) or any `idempotent-replayed`.
     *
     * @returns `stored` or `released` by the policy, or `lost` when the lease ran out and another request took over,
     * so nothing changed
     * @rejects {IdempotencyKeysResponseError} For a response a replay couldn't send (a status that isn't an integer
     * from 200 to 599, or a body with a `204`, `205` or `304`), before the policy is asked or the store touched: the
     * attempt still holds the key, to respond again or release
     */
    readonly respond: (response: StoredResponse) => Promise<RespondResult>;
    /**
     * Releases the key, whatever the response, so the next request with it runs.
     *
     * @returns Whether it released, `false` when another request took over
     */
    readonly release: () => Promise<boolean>;
}

export interface AttemptContext {
    readonly store: IdempotencyStore;
    readonly notifier: IdempotencyNotifier | undefined;
    readonly respondPolicy: RespondPolicy;
    readonly onError: (error: unknown, identity: string) => void;
}

/**
 * An attempt, holding the token of its claim. The store only changes the record while it still holds the token.
 */
export class Attempt implements IdempotencyAttempt {
    public readonly identity: string;
    readonly #token: string;
    readonly #context: AttemptContext;

    public constructor(identity: string, token: string, context: AttemptContext) {
        this.identity = identity;
        this.#token = token;
        this.#context = context;
    }

    public async respond(response: StoredResponse): Promise<RespondResult> {
        checkSendable(response);
        if (this.#context.respondPolicy(response) === 'release') {
            return (await this.release()) ? 'released' : 'lost';
        }
        const headers = response.headers
            .map(([name, value]) => [name.toLowerCase(), value] as const)
            .filter(([name]) => !unstoredHeaders.has(name));
        const isStored = await this.#context.store.complete(this.identity, this.#token, {
            headers,
            status: response.status,
            body: response.body,
        });
        await this.#announce(isStored);
        return isStored ? 'stored' : 'lost';
    }

    public async release(): Promise<boolean> {
        const isReleased = await this.#context.store.release(this.identity, this.#token);
        await this.#announce(isReleased);
        return isReleased;
    }

    /**
     * Tells other waiting requests that the record changed. Only an optimization, so a failure doesn't fail the
     * attempt, whose record already changed.
     *
     * @param didChange - Whether the store changed the record
     */
    async #announce(didChange: boolean): Promise<void> {
        const { notifier, onError } = this.#context;
        if (didChange && notifier) {
            try {
                await notifier.publish(this.identity);
            } catch (error) {
                onError(error, this.identity);
            }
        }
    }
}
