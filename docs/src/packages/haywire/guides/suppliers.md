---
description: Depend on a function that builds a value on demand, synchronously or asynchronously.
---

# Suppliers

A dependency is usually built once, before its dependent. To build values on demand instead, such as a fresh id for every incoming message, depend on a **supplier**: a function that builds a new value each time it is called.

Mark the dependency with `.supplier()`, which changes its type from `T` to `() => T`:

```ts
import { bind, createContainer, createModule, identifier } from 'haywire';

const seedId = identifier<number>().named('seed');
const randomId = identifier<string>().named('random');

class MessageHandler {
    constructor(private readonly nextId: () => string) {}

    handle(message: string) {
        return { id: this.nextId(), message };
    }
}

const container = createContainer(
    createModule(bind(seedId).withInstance(42))
        .addBinding(
            bind(randomId)
                .withDependencies([seedId])
                .withProvider(seed => (Math.random() * seed).toString(36))
        )
        .addBinding(bind(MessageHandler).withDependencies([randomId.supplier()]).withConstructorProvider())
);
```

`randomId` is bound once, and can be depended on directly or through a supplier. Its own dependencies are resolved each time the supplier is called, so they follow their [scopes](/packages/haywire/guides/scopes) as usual.

A supplier id is distinct from an id for a function type, so `identifier<() => string>()` is never confused with `randomId.supplier()`.

::: info Coming from Guice or Dagger?
A Haywire supplier is what those libraries call a `Provider<T>`. In Haywire, a _provider_ is the
function given to `withProvider()`, which builds a value from its dependencies.
:::

## Forms

| `supplier(...)` | Type | Behaves like |
|-----------------|------|--------------|
| `()`, `true` or `{ sync: true, propagateScope: false }` | `() => T` | A new `container.get()` call. |
| `'async'` or `{ sync: false, propagateScope: false }` | `() => Promise<T>` | A new `container.getAsync()` call. |
| `{ sync: true, propagateScope: true }` | `() => T` | Builds within the current request. |
| `{ sync: false, propagateScope: true }` | `() => Promise<T>` | Builds within the current request. |
| `false` | `T` | Not a supplier. Reverts the modifier. |

Any container can have sync suppliers, even one with async bindings, as long as everything that supplier builds is synchronous.

### Propagating the request

Each call to a supplier is a new [request](/packages/haywire/guides/scopes#requests), so request-scoped values aren't shared with its dependent. With `propagateScope: true`, the supplier builds within the request that built its dependent instead, sharing its request-scoped values.

A binding scoped with `isolatedRequestScope` opts out: it, and everything that depends on it, is always built in a new request.

## Sync suppliers of async values

A sync supplier can't wait for a promise, so everything it builds must be synchronous, or already built by an [eager scope](/packages/haywire/guides/scopes#eager-scopes).

::: warning Not checked by types
Types can't tell whether a sync supplier can be built synchronously. `container.check()` can, so
[call it in a test](/packages/haywire/guides/testing). When in doubt, use an async supplier, which is always
safe.
:::
