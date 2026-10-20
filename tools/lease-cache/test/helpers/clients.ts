import type { LeaseCacheConnection } from 'lease-cache';
import { GlideClient, Script } from '@valkey/valkey-glide';
import { Redis } from 'ioredis';
import { Redis as Valkey } from 'iovalkey';
import { createClient } from 'redis';

/**
 * The devcontainer runs Valkey as a sidecar under this hostname, and Dagger binds its service under the same one.
 */
const host = 'valkey';
const port = 6379;
const database = 5;

export interface TestClient {
    readonly connection: LeaseCacheConnection;
    readonly close: () => Promise<void>;
}

export interface ClientFactory {
    readonly name: string;
    readonly connect: () => Promise<TestClient>;
}

/**
 * Splits `eval`'s arguments into keys and the rest, as clients with an options object want them.
 *
 * @param numKeys - How many of `args` are keys
 * @param args - Keys, then arguments
 * @returns Keys and arguments, as strings
 */
const splitArgs = (
    numKeys: number,
    args: readonly (number | string)[]
): { keys: string[]; rest: string[] } => {
    const strings = args.map(String);
    return { keys: strings.slice(0, numKeys), rest: strings.slice(numKeys) };
};

/**
 * Every client the README documents, connected to the test server. ioredis and iovalkey fit as they are; node-redis
 * and Valkey GLIDE through the adapters the README shows.
 */
export const clients: readonly ClientFactory[] = [
    {
        name: 'ioredis',
        connect: async (): Promise<TestClient> => {
            const client = new Redis({ host, port, db: database });
            return {
                connection: client,
                close: async () => {
                    await client.quit();
                },
            };
        },
    },
    {
        name: 'iovalkey',
        connect: async (): Promise<TestClient> => {
            const client = new Valkey({ host, port, db: database });
            return {
                connection: client,
                close: async () => {
                    await client.quit();
                },
            };
        },
    },
    {
        name: 'node-redis',
        connect: async (): Promise<TestClient> => {
            const client = await createClient({
                url: `redis://${host}:${port}/${database}`,
            }).connect();
            const connection: LeaseCacheConnection = {
                eval: async (script, numKeys, ...args) => {
                    const { keys, rest } = splitArgs(numKeys, args);
                    return client.eval(script, { keys, arguments: rest });
                },
            };
            return {
                connection,
                close: async () => {
                    client.destroy();
                },
            };
        },
    },
    {
        name: 'Valkey GLIDE',
        connect: async (): Promise<TestClient> => {
            const client = await GlideClient.createClient({
                addresses: [{ host, port }],
                databaseId: database,
            });
            // GLIDE loads each script once and runs it by hash. Scripts must be released, so keep one per source.
            const scripts = new Map<string, Script>();
            const connection: LeaseCacheConnection = {
                eval: async (code, numKeys, ...args) => {
                    let script = scripts.get(code);
                    if (!script) {
                        script = new Script(code);
                        scripts.set(code, script);
                    }
                    const { keys, rest } = splitArgs(numKeys, args);
                    return client.invokeScript(script, { keys, args: rest });
                },
            };
            return {
                connection,
                close: async () => {
                    for (const script of scripts.values()) {
                        script.release();
                    }
                    client.close();
                },
            };
        },
    },
];
