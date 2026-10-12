---
description: Break a circular dependency by deferring one side.
---

# Circular dependencies

When two values depend on each other, neither can be built first. Haywire refuses to build them, and `container.check()` reports the cycle.

Circular dependencies are best avoided, but when one can't be, break it by **deferring** one side. Mark the dependency with `.deferred()`, which changes its type from `T` to `Promise<T>`. The dependent is built first, and receives a promise that resolves once the other side is built:

```ts
import { bind, createContainer, createModule, identifier } from 'haywire';

class Chicken {
    constructor(public readonly egg: Egg) {}
}
class Egg {
    chicken?: Chicken;

    constructor(chicken: Promise<Chicken>) {
        void chicken.then(resolved => {
            this.chicken = resolved;
        });
    }
}

const container = createContainer(
    createModule(bind(Chicken).withDependencies([Egg]).withConstructorProvider()).addBinding(
        bind(Egg).withDependencies([identifier(Chicken).deferred()]).withConstructorProvider()
    )
);

const chicken = container.get(Chicken);
```

Deferred ids work in synchronous containers too. Internally, the container does roughly this:

```ts
class Chicken {
    constructor(public readonly egg: Egg) {}
}
class Egg {
    constructor(chicken: Promise<Chicken>) {}
}
// ---cut---
const getChicken = () => {
    const { promise, resolve } = Promise.withResolvers<Chicken>();
    // Chicken hasn't started building when Egg is built
    const egg = new Egg(promise);
    const chicken = new Chicken(egg);
    resolve(chicken);
    return chicken;
};
```

The promise resolves before the request returns. Callbacks chained on it with `.then()` may not have run yet, so don't rely on them having finished.

A deferred id can also be a [supplier](/haywire/guides/suppliers): a promise that resolves to the supplier.

::: danger Never wait for a deferred dependency in its provider
The promise resolves only after the provider returns, so a provider that awaits it never
finishes. Haywire can't detect this.

```ts
import { bind, identifier } from 'haywire';

class Chicken {
    constructor(public readonly egg: Egg) {}
}
class Egg {
    constructor(public readonly chicken: Chicken) {}
}
// ---cut---
bind(Egg)
    .withDependencies([identifier(Chicken).deferred()])
    .withAsyncProvider(async chicken => new Egg(await chicken)); // Never resolves
```

:::

::: warning Not checked by types
Types can't detect a cycle. `container.check()` can, so [call it in a test](/haywire/guides/testing).
:::
