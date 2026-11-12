import type { ValkeyConnection } from 'idempotency-keys/valkey';
import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';

/**
 * The devcontainer runs Valkey as a sidecar under this hostname, and Dagger binds its service under the same one.
 */
const host = 'valkey';
const port = 6379;
const database = 6;

/**
 * Connects to the test server. Waits until the connection is ready, as ioredis's ready check (`INFO`) fails on a
 * connection that a `SUBSCRIBE` already put in subscriber mode.
 *
 * @returns A new connection
 */
export const connectValkey = async (): Promise<Redis> => {
    const connection = new Redis({ host, port, db: database, lazyConnect: true });
    await connection.connect();
    return connection;
};

/**
 * The store's connection over ioredis, replying with bytes as the store requires.
 *
 * @param valkey - ioredis connection to wrap
 * @returns `eval` through `callBuffer`
 */
export const bufferConnection = (valkey: Redis): ValkeyConnection => ({
    eval: async (...args) => valkey.callBuffer('EVAL', ...args),
});

export interface ValkeyContext {
    readonly valkey: Redis;
    readonly subscriber: Redis;
    readonly prefix: string;
    readonly channel: string;
}

/**
 * A hook for each test that uses Valkey: a connection, one for subscriber mode, and a prefix and channel no other
 * test uses, as tests share the server. Close them with {@link closeValkey}.
 *
 * @returns Connections, prefix and channel
 */
export const valkeyContext = async (): Promise<ValkeyContext> => {
    const id = randomUUID();
    const [valkey, subscriber] = await Promise.all([connectValkey(), connectValkey()]);
    return {
        valkey,
        subscriber,
        prefix: `idempotency-keys-test:${id}`,
        channel: `idempotency_keys_${id}`,
    };
};

/**
 * Closes the connections of {@link valkeyContext}.
 *
 * @param context - The hook's context
 */
export const closeValkey = async ({ valkey, subscriber }: ValkeyContext): Promise<void> => {
    await Promise.all([valkey.quit(), subscriber.quit()]);
};
