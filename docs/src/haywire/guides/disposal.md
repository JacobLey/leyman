---
description: Release the singletons a container created, like database pools and sockets, on shutdown or at the end of a request.
---

# Disposal

Singletons often hold resources that must be released on shutdown: database pools, sockets, file handles. `container.disposeAsync()` releases every singleton the container created, in reverse creation order, so each instance is disposed before the instances it depends on. Containers are `AsyncDisposable`, so `await using` works too.

By default, an instance is disposed with its own `Symbol.asyncDispose` or `Symbol.dispose` method, if it has one. Use `.withDisposer()` for anything else, or `.withDisposer(null)` to leave an instance alone.

```ts
import { bind, createContainer, createModule, identifier, singletonScope } from 'haywire';

declare class Pool {
    query(sql: string): Promise<unknown[]>;
    end(): Promise<void>;
}
// ---cut---
const poolId = identifier<Pool>();

class UserRepository implements AsyncDisposable {
    constructor(private readonly pool: Pool) {}

    async [Symbol.asyncDispose]() {
        // Flush pending writes
    }
}

const container = createContainer(
    createModule(
        bind(poolId)
            .withFactory(() => new Pool())
            .scoped(singletonScope)
            .withDisposer(pool => pool.end())
    ).addBinding(
        // Has `Symbol.asyncDispose`, so needs no disposer
        bind(UserRepository)
            .withDependencies([poolId])
            .withConstructorProvider()
            .scoped(singletonScope)
    )
);

// On shutdown. Disposes the repository, then the pool
await container.disposeAsync();
```

- **Only singletons are disposed.** Request-scoped and transient instances belong to whoever requested them. A disposer on any other scope fails `container.check()`.
- **Instances you provide are yours.** Values bound with `withInstance()` or a container factory's `bindInstance()` are not disposed, unless you set a disposer on them.
- **Once disposal starts, the container is closed.** Requests already in progress finish first, so their singletons are disposed too. Every new request, including from suppliers, throws a `HaywireError`.
- If disposers fail, the rest still run, and `disposeAsync()` rejects with the error, or with one listing every error in `causes`.

`disposeAsync()` is safe to call more than once.

## Per-request containers

Each container made by a [container factory](/haywire/guides/runtime-values) has its own singletons. So in a container per request, `singletonScope` means once per request, and disposing the container at the end of the request releases exactly what the request created. App-wide instances passed in with `bindInstance()` are left alone.

```ts
import {
    bind,
    createContainer,
    createContainerFactory,
    createModule,
    identifier,
    singletonScope,
} from 'haywire';

declare class PoolClient {
    query(sql: string): Promise<unknown[]>;
    release(): void;
}
declare class Pool {
    connect(): Promise<PoolClient>;
}
// ---cut---
const poolId = identifier<Pool>();
const connectionId = identifier<PoolClient>();

class RequestHandler {
    constructor(private readonly connection: PoolClient) {}

    async handle() {
        return this.connection.query('SELECT 1');
    }
}

const requestFactory = createContainerFactory(
    createModule(
        bind(connectionId)
            .withDependencies([poolId])
            .withAsyncProvider(async pool => pool.connect())
            // Once per request container
            .scoped(singletonScope)
            .withDisposer(connection => connection.release())
    ).addBinding(bind(RequestHandler).withDependencies([connectionId]).withConstructorProvider())
);
requestFactory.check();

// One pool for the whole app
const pool = new Pool();

const handleRequest = async () => {
    await using container = createContainer(requestFactory.bindInstance(poolId, pool));

    const handler = await container.getAsync(RequestHandler);
    return handler.handle();
    // Leaving the block releases this request's connection, but not the pool
};
```

[`requestScope`](/haywire/guides/scopes#requests) is narrower than an HTTP request: it is a single `get()` call, and those instances are never disposed. Resources to release per HTTP request belong in `singletonScope` on a per-request container.
