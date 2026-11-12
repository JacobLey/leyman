/**
 * One route on the TypeScript implementation of idempotency-keys, the twin of the Go server in
 * `e2e/idempotency-keys-interop-go` (whose `main.go` documents the configuration and the route both share).
 *
 * Its configuration comes from the environment: `IK_STORE`, `IK_NOTIFIER`, `IK_TABLE`, `IK_PREFIX`, `IK_CHANNEL`,
 * `IK_LEASE_MS`, `IK_WAIT_MS`, `DATABASE_URL` and `VALKEY_URL`. It prints `listening <port>` once ready, and
 * `run <scope>` as its handler starts.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { IdempotencyNotifier, IdempotencyStore } from 'idempotency-keys';
import { createServer } from 'node:http';
import { setTimeout } from 'node:timers/promises';
import { Redis } from 'ioredis';
import { Client, Pool } from 'pg';
import { IdempotencyKeys } from 'idempotency-keys';
import { PostgresNotifier, PostgresStore } from 'idempotency-keys/postgres';
import { ValkeyNotifier, ValkeyStore } from 'idempotency-keys/valkey';

const operation = 'interop';
const defaultStatus = 201;

const env = (name: string): string => process.env[name] ?? '';

const milliseconds = (name: string): number => {
    const value = Number(env(name));
    if (!Number.isSafeInteger(value)) {
        throw new TypeError(`${name} must be whole milliseconds`);
    }
    return value;
};

const connectValkey = async (): Promise<Redis> => {
    // Ready before subscribing, as ioredis's ready check fails on a connection in subscriber mode
    const connection = new Redis(env('VALKEY_URL'), { lazyConnect: true });
    await connection.connect();
    return connection;
};

/**
 * Opens each service once, whether the store, the notifier or both use it.
 */
class Connections {
    #pool: Pool | null = null;
    #valkey: Promise<Redis> | null = null;

    public get postgres(): Pool {
        // Small, as every test of the e2e shares the server's `max_connections`
        this.#pool ??= new Pool({ connectionString: env('DATABASE_URL'), max: 3 });
        return this.#pool;
    }

    public async valkey(): Promise<Redis> {
        this.#valkey ??= connectValkey();
        return this.#valkey;
    }
}

const createStore = async (connections: Connections): Promise<IdempotencyStore> => {
    const kind = env('IK_STORE');
    switch (kind) {
        case 'postgres': {
            return new PostgresStore({ client: connections.postgres, table: env('IK_TABLE') });
        }
        case 'valkey': {
            const connection = await connections.valkey();
            return new ValkeyStore({
                // Replies as bytes, as the store requires
                connection: { eval: async (...args) => connection.callBuffer('EVAL', ...args) },
                prefix: env('IK_PREFIX'),
            });
        }
        default: {
            throw new TypeError(`Invalid IK_STORE ${JSON.stringify(kind)}`);
        }
    }
};

const createNotifier = async (connections: Connections): Promise<IdempotencyNotifier | null> => {
    const kind = env('IK_NOTIFIER');
    const channel = env('IK_CHANNEL');
    switch (kind) {
        case 'none': {
            return null;
        }
        case 'postgres': {
            const listener = new Client({ connectionString: env('DATABASE_URL') });
            await listener.connect();
            return PostgresNotifier.listen({ publisher: connections.postgres, listener, channel });
        }
        case 'valkey': {
            return ValkeyNotifier.listen({
                publisher: await connections.valkey(),
                subscriber: await connectValkey(),
                channel,
            });
        }
        default: {
            throw new TypeError(`Invalid IK_NOTIFIER ${JSON.stringify(kind)}`);
        }
    }
};

const connections = new Connections();
const notifier = await createNotifier(connections);
const keys = new IdempotencyKeys({
    store: await createStore(connections),
    ...(notifier && { notifier }),
    leaseMs: milliseconds('IK_LEASE_MS'),
    waitMs: milliseconds('IK_WAIT_MS'),
});

const headerInt = (request: Request, name: string, fallback: number): number => {
    const value = request.headers.get(name);
    if (value === null) {
        return fallback;
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
        throw new TypeError(`${name}: not a whole number`);
    }
    return parsed;
};

const runs = new Map<string, number>();

const run = async (request: Request): Promise<Response> => {
    let status: number;
    let delay: number;
    try {
        status = headerInt(request, 'x-status', defaultStatus);
        delay = headerInt(request, 'x-delay-ms', 0);
    } catch (error) {
        return new Response(String(error), { status: 400 });
    }
    const scope = request.headers.get('x-scope') ?? '';
    const count = (runs.get(scope) ?? 0) + 1;
    runs.set(scope, count);
    process.stdout.write(`run ${scope}\n`);

    await setTimeout(delay);

    // Serialized as Go's encoding/json does, and labelled application/json, as the Go server's is
    return Response.json({ server: 'ts', run: count }, { status });
};

/**
 * Node's request as fetch's: the origin and the raw target concatenated, as the spec says, unless the target is in
 * absolute form, which is parsed alone (https://www.rfc-editor.org/rfc/rfc9112#section-3.2.2).
 *
 * @param message - Node's request, with its raw target and headers
 * @returns The request, with its body read
 */
const toRequest = async (message: IncomingMessage): Promise<Request> => {
    const target = message.url ?? '/';
    const url = /^https?:\/\//iv.test(target) ? target : `http://interop${target}`;
    const headers = new Headers();
    for (let i = 0; i < message.rawHeaders.length; i += 2) {
        headers.append(message.rawHeaders[i]!, message.rawHeaders[i + 1]!);
    }
    const chunks: Buffer[] = [];
    for await (const chunk of message) {
        chunks.push(chunk as Buffer);
    }
    const method = message.method ?? 'GET';
    const hasBody = method !== 'GET' && method !== 'HEAD';
    return new Request(url, { method, headers, body: hasBody ? Buffer.concat(chunks) : null });
};

const send = async (response: Response, res: ServerResponse): Promise<void> => {
    res.statusCode = response.status;
    for (const [name, value] of response.headers) {
        res.appendHeader(name, value);
    }
    // Ends with the whole body, so Node sends a Content-Length, as Go does, rather than chunks
    res.end(Buffer.from(await response.arrayBuffer()));
};

const server = createServer((message, res) => {
    void (async () => {
        try {
            const request = await toRequest(message);
            const response = await keys.handle(
                request,
                { scope: request.headers.get('x-scope') ?? '', operation },
                run
            );
            await send(response, res);
        } catch (error) {
            process.stderr.write(`${String(error)}\n`);
            res.writeHead(500).end();
        }
    })();
});

server.listen(0, '127.0.0.1', () => {
    process.stdout.write(`listening ${(server.address() as AddressInfo).port}\n`);
});
