---
description: Per-request containers in Hono, Fastify and Next.js route handlers.
---

# Web frameworks

Haywire doesn't need an adapter for each framework. The pattern is the same everywhere:

1. Build a [container factory](/packages/haywire/guides/runtime-values) once, from a module that leaves the per-request values unbound.
2. For each request, bind those values and create a container.
3. Dispose the container when the response is done, which releases that request's [singletons](/packages/haywire/guides/disposal#per-request-containers).

Each recipe uses this module. `UserService` needs the app-wide database and the incoming request. It is a singleton, so within one request every binding that depends on it shares one instance:

```ts
import { bind, createContainerFactory, createModule, identifier, singletonScope } from 'haywire';

interface Database {
    query: (sql: string) => Promise<unknown[]>;
}
const databaseId = identifier<Database>();
const requestId = identifier<Request>();

class UserService {
    constructor(
        private readonly database: Database,
        private readonly request: Request
    ) {}

    async list() {
        return this.database.query('select * from users');
    }
}

const requestFactory = createContainerFactory(
    createModule(
        bind(UserService)
            .withDependencies([databaseId, requestId])
            .withConstructorProvider()
            .scoped(singletonScope)
    )
);
// Fails fast at startup. Also check it in a test.
requestFactory.check();

// Your app-wide database client
declare const database: Database;

const createRequestContainer = (request: Request) =>
    requestFactory.bindInstance(databaseId, database).bindInstance(requestId, request).toContainer();
```

Wrapping the bindings in `createRequestContainer` keeps them in one place, and its return type names the container for frameworks that need one, without spelling out Haywire's generics.

## Hono

Create the container in a middleware, and keep it on the context. `await using` disposes it after every later middleware and the handler finish:

```ts
import { bind, createContainerFactory, createModule, identifier, singletonScope } from 'haywire';

interface Database {
    query: (sql: string) => Promise<unknown[]>;
}
const databaseId = identifier<Database>();
const requestId = identifier<Request>();
class UserService {
    constructor(
        private readonly database: Database,
        private readonly request: Request
    ) {}
    async list() {
        return this.database.query('select * from users');
    }
}
const requestFactory = createContainerFactory(
    createModule(
        bind(UserService)
            .withDependencies([databaseId, requestId])
            .withConstructorProvider()
            .scoped(singletonScope)
    )
);
declare const database: Database;
const createRequestContainer = (request: Request) =>
    requestFactory.bindInstance(databaseId, database).bindInstance(requestId, request).toContainer();
// ---cut---
import { Hono } from 'hono';

const app = new Hono<{
    Variables: { container: ReturnType<typeof createRequestContainer> };
}>();

app.use(async (c, next) => {
    await using container = createRequestContainer(c.req.raw);
    c.set('container', container);
    await next();
});

app.get('/users', async c => {
    const users = await c.var.container.get(UserService).list();
    return c.json(users);
});
```

Hono passes the standard `Request` as `c.req.raw`, so the module can depend on it directly.

## Fastify

Fastify's request isn't a standard `Request`, so bind `FastifyRequest` instead. Create the container in an `onRequest` hook, and dispose it in `onResponse`:

```ts
import { bind, createContainerFactory, createModule, identifier, singletonScope } from 'haywire';
import Fastify, { type FastifyRequest } from 'fastify';

interface Database {
    query: (sql: string) => Promise<unknown[]>;
}
const databaseId = identifier<Database>();
const requestId = identifier<FastifyRequest>();
class UserService {
    constructor(
        private readonly database: Database,
        private readonly request: FastifyRequest
    ) {}
    async list() {
        return this.database.query('select * from users');
    }
}
const requestFactory = createContainerFactory(
    createModule(
        bind(UserService)
            .withDependencies([databaseId, requestId])
            .withConstructorProvider()
            .scoped(singletonScope)
    )
);
declare const database: Database;
const createRequestContainer = (request: FastifyRequest) =>
    requestFactory.bindInstance(databaseId, database).bindInstance(requestId, request).toContainer();
// ---cut---
declare module 'fastify' {
    interface FastifyRequest {
        container: ReturnType<typeof createRequestContainer>;
    }
}

const app = Fastify();
// Declares the property up front, so every request has the same shape
app.decorateRequest('container');

app.addHook('onRequest', async request => {
    request.container = createRequestContainer(request);
});
app.addHook('onResponse', async request => {
    await request.container.disposeAsync();
});

app.get('/users', async request => request.container.get(UserService).list());
```

## Next.js route handlers

Route handlers receive a standard `Request`, and have no middleware that wraps the handler, so create the container in each handler. Module scope runs once per server instance, so the factory is only built and checked once:

```ts
import { bind, createContainerFactory, createModule, identifier, singletonScope } from 'haywire';

interface Database {
    query: (sql: string) => Promise<unknown[]>;
}
const databaseId = identifier<Database>();
const requestId = identifier<Request>();
class UserService {
    constructor(
        private readonly database: Database,
        private readonly request: Request
    ) {}
    async list() {
        return this.database.query('select * from users');
    }
}
const requestFactory = createContainerFactory(
    createModule(
        bind(UserService)
            .withDependencies([databaseId, requestId])
            .withConstructorProvider()
            .scoped(singletonScope)
    )
);
declare const database: Database;
const createRequestContainer = (request: Request) =>
    requestFactory.bindInstance(databaseId, database).bindInstance(requestId, request).toContainer();
// ---cut---
// app/users/route.ts
export async function GET(request: Request) {
    await using container = createRequestContainer(request);
    return Response.json(await container.get(UserService).list());
}
```

Keep the factory and `createRequestContainer` in a shared file that each `route.ts` imports.

The container is disposed when the handler returns. If the response streams values the container created, dispose it once the stream ends instead.
