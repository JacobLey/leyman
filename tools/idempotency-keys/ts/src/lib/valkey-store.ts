import type { ClaimParams, ClaimResult, IdempotencyStore, StoredResponse } from './attempt.js';
// eslint-disable-next-line n/prefer-global/buffer -- Imported, as the package assumes no Node.js globals: Bun, Deno and Workers (`nodejs_compat`) have the module
import { Buffer } from 'node:buffer';
import { claimScript, completeScript, releaseScript } from './scripts.js';

/**
 * The one command needed from a Valkey (or Redis) client. An ioredis `Redis` or `Cluster` fits as is, though its
 * `eval` decodes replies as UTF-8 text: run `EVAL` through `callBuffer` to replay binary bodies byte for byte. Replies may be
 * strings or bytes.
 */
export interface ValkeyConnection {
    eval: (
        script: string,
        numKeys: number,
        ...args: (number | string | Buffer)[]
    ) => Promise<unknown>;
}

export interface ValkeyStoreOptions {
    /**
     * Connection to run the scripts on. The store never closes it.
     */
    readonly connection: ValkeyConnection;
    /**
     * Start of every key, `<prefix>:<identity>`. Defaults to `idempotency_keys`.
     */
    readonly prefix?: string;
}

const decoder = new TextDecoder();
const encoder = new TextEncoder();

type Reply = string | Uint8Array;

const text = (reply: Reply): string => (typeof reply === 'string' ? reply : decoder.decode(reply));

const bytes = (reply: Reply): Uint8Array =>
    typeof reply === 'string' ? encoder.encode(reply) : reply;

/**
 * The lax store: a claim is a key with a time to live, so a failover that loses writes, or a flush, forgets keys,
 * and a request after that runs again. For deduplicating notifications or non-financial creates, never payments.
 */
export class ValkeyStore implements IdempotencyStore {
    readonly #connection: ValkeyConnection;
    readonly #prefix: string;

    public constructor({ connection, prefix = 'idempotency_keys' }: ValkeyStoreOptions) {
        this.#connection = connection;
        this.#prefix = prefix;
    }

    public async claim({
        identity,
        fingerprint,
        token,
        leaseMs,
        ttlMs,
    }: ClaimParams): Promise<ClaimResult> {
        const [state, recordFingerprint, status, headers, body] = (await this.#connection.eval(
            claimScript,
            1,
            this.#key(identity),
            fingerprint,
            token,
            leaseMs,
            ttlMs
        )) as [Reply, Reply?, Reply?, Reply?, Reply?];
        switch (text(state)) {
            case 'claimed': {
                return { state: 'claimed' };
            }
            case 'running': {
                return { state: 'running', fingerprint: text(recordFingerprint!) };
            }
            default: {
                return {
                    state: 'completed',
                    fingerprint: text(recordFingerprint!),
                    response: {
                        status: Number(text(status!)),
                        headers: JSON.parse(text(headers!)) as StoredResponse['headers'],
                        body: bytes(body!),
                    },
                };
            }
        }
    }

    public async complete(
        identity: string,
        token: string,
        response: StoredResponse
    ): Promise<boolean> {
        const { body } = response;
        const done = await this.#connection.eval(
            completeScript,
            1,
            this.#key(identity),
            token,
            response.status,
            JSON.stringify(response.headers),
            // Clients send a Buffer's bytes as they are, where they would write out any other value as text
            Buffer.from(body.buffer, body.byteOffset, body.byteLength)
        );
        return done === 1;
    }

    public async release(identity: string, token: string): Promise<boolean> {
        const done = await this.#connection.eval(releaseScript, 1, this.#key(identity), token);
        return done === 1;
    }

    #key(identity: string): string {
        return `${this.#prefix}:${identity}`;
    }
}
