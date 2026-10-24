---
description: Control how often a value is built with transient, singleton and request scopes, and build values early with eager scopes.
---

# Scopes

A binding's scope controls how often its value is built. Set it with `.scoped()`:

```ts
import { bind, singletonScope } from 'haywire';

class Logger {}
// ---cut---
const loggerBinding = bind(Logger).withConstructorFactory().scoped(singletonScope);
```

| Scope | A new value is built |
|-------|----------------------|
| `transientScope` | For every dependent. The default. |
| `singletonScope` | Once per container, the first time it is needed. |
| `eagerSingletonScope` | Once per container, when the container is [preloaded](#eager-scopes). |
| `requestScope` | Once per request, shared by everything built during it. |
| `eagerRequestScope` | Once per request, at the start of the request. |
| `isolatedRequestScope` | Once per request, without sharing the request of a [supplier that propagates it](/packages/haywire/guides/suppliers#propagating-the-request). |

Singletons are only shared within one container. Two containers built from the same module have their own.

## Requests

Every call to `container.get()` or `getAsync()` is a request. A request-scoped value is shared by everything built for that call, and built again for the next:

```ts
import { bind, createContainer, createModule, requestScope } from 'haywire';

class RequestContext {}
class Repository {
    constructor(public readonly context: RequestContext) {}
}
class Service {
    constructor(
        public readonly repository: Repository,
        public readonly context: RequestContext
    ) {}
}

const container = createContainer(
    createModule(bind(RequestContext).withConstructorFactory().scoped(requestScope))
        .addBinding(bind(Repository).withDependencies([RequestContext]).withConstructorProvider())
        .addBinding(
            bind(Service).withDependencies([Repository, RequestContext]).withConstructorProvider()
        )
);

const service1 = container.get(Service);
service1.repository.context === service1.context; // true: built in the same request

const service2 = container.get(Service);
service1.context === service2.context; // false: built in a new request
```

Calling a [supplier](/packages/haywire/guides/suppliers) also starts a new request, unless it propagates the current one.

::: tip
`requestScope` is one `get()` call, not one HTTP request. For values shared across an HTTP
request, create a container per request with a [container factory](/packages/haywire/guides/runtime-values),
and use `singletonScope`.
:::

## Eager scopes

An eager value is built before it is needed:

- `eagerSingletonScope` values are built when the container is preloaded, with `container.preloadAsync()` (or `preload()` on a sync container). A request preloads the container first if it hasn't been.
- `eagerRequestScope` values are built at the start of each request, before anything else.

Building early moves slow work, like opening a connection, to startup. It also lets an async value be used by a synchronous [supplier](/packages/haywire/guides/suppliers): by the time the supplier is called, the value already exists.

```ts
import { bind, createContainer, createModule, eagerSingletonScope, identifier } from 'haywire';

declare const loadConfig: () => Promise<Config>;
// ---cut---
class Config {}
class Client {
    constructor(public readonly config: Config) {}
}
class Pool {
    constructor(public readonly createClient: () => Client) {}
}

const container = createContainer(
    createModule(bind(Config).withAsyncFactory(loadConfig).scoped(eagerSingletonScope))
        .addBinding(bind(Client).withDependencies([Config]).withConstructorProvider())
        .addBinding(
            bind(Pool).withDependencies([identifier(Client).supplier()]).withConstructorProvider()
        )
);

const pool = await container.getAsync(Pool);
// Synchronous, because Config was built when the container was preloaded
const client = pool.createClient();
```

Without `eagerSingletonScope`, `Config` would be built only when `createClient()` is called, which can't wait for a promise, so `container.check()` would fail.

## Singletons that depend on request-scoped values

A singleton is built once, in whichever request first needs it. If it depends on a request-scoped value, it keeps the value from that first request:

```ts
import { bind, createContainer, createModule, requestScope, singletonScope } from 'haywire';

class RequestContext {}
class Cache {
    constructor(public readonly context: RequestContext) {}
}
class Service {
    constructor(
        public readonly cache: Cache,
        public readonly context: RequestContext
    ) {}
}

const container = createContainer(
    createModule(bind(RequestContext).withConstructorFactory().scoped(requestScope))
        .addBinding(
            bind(Cache).withDependencies([RequestContext]).withConstructorProvider().scoped(singletonScope)
        )
        .addBinding(bind(Service).withDependencies([Cache, RequestContext]).withConstructorProvider())
);

const service1 = container.get(Service);
service1.cache.context === service1.context; // true: Cache was built in this request

const service2 = container.get(Service);
service2.cache.context === service2.context; // false: Cache keeps the first request's context
```

This affects any injector with both singleton and request scopes. Avoid it by not depending on a dependency's dependencies, or by making the singleton eager, so it is always built in a request of its own.
