import type { IdempotencyNotifier } from './listeners.js';

/**
 * A response as stored and replayed.
 */
export interface StoredResponse {
    /**
     * An integer from 100 to 599.
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
 * Where records live, as the spec's three atomic operations. Every time is the store's own clock.
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
 * A request that holds its key, and runs. End it with `respond()` or `release()`. One that never ends (it crashed)
 * holds the key until its lease runs out.
 */
export interface IdempotencyAttempt {
    /**
     * The key's identity, as 64 hex characters.
     */
    readonly identity: string;
    /**
     * Ends the attempt with its response, by the respond policy. Header names are stored in lower case.
     *
     * @returns `stored` or `released` by the policy, or `lost` when the lease ran out and another request took
     * over, so nothing changed
     */
    readonly respond: (response: StoredResponse) => Promise<'lost' | 'released' | 'stored'>;
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

    public async respond(response: StoredResponse): Promise<'lost' | 'released' | 'stored'> {
        if (this.#context.respondPolicy(response) === 'release') {
            return (await this.release()) ? 'released' : 'lost';
        }
        const isStored = await this.#context.store.complete(this.identity, this.#token, {
            status: response.status,
            headers: response.headers.map(([name, value]) => [name.toLowerCase(), value] as const),
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
