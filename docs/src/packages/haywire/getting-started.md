---
description: Install Haywire, declare ids, bind them, and get instances from a container.
---

# Getting started

## Install

::: code-group

```sh [npm]
npm i haywire
```

```sh [pnpm]
pnpm add haywire
```

```sh [yarn]
yarn add haywire
```

:::

::: tip
Haywire is ESM only, and requires Node.js 24 or later. From CommonJS, load it with a dynamic
import: `const { bind } = await import('haywire');`
:::

Haywire runs in plain JavaScript, but its checks happen in TypeScript. They are tested with [`strict`](https://www.typescriptlang.org/tsconfig/#strict) and [`exactOptionalPropertyTypes`](https://www.typescriptlang.org/tsconfig/#exactOptionalPropertyTypes) enabled, so turn both on.

Wiring an app takes four steps: name each dependency with an **id**, **bind** each id to how it is built, collect the bindings in a **module**, and turn the module into a **container** that builds instances on request.

## Ids

Types don't exist at runtime, so Haywire needs a value to stand for each one. A class is its own id. For anything else, such as an interface or a primitive, create one with `identifier<T>()`:

```ts
import { identifier } from 'haywire';

interface Logger {
    info(message: string): void;
}

const loggerId = identifier<Logger>();
const dbUrlId = identifier<string>().named('dbUrl');
const dbPasswordId = identifier<string>().named('dbPassword');
```

`named()` tells apart ids of the same type. It takes a string literal, or a `unique symbol` when a string might collide.

::: warning Create each id once
`identifier<T>()` returns a new id every time, but TypeScript can't tell two `identifier<number>()`
calls apart. Create each id once, and import it wherever it is needed. `identifier(SomeClass)`
always returns the same id.
:::

Ids are modified with `nullable()`, `undefinable()` and more, which change the type they stand for. See the [HaywireId reference](/packages/haywire/reference/api#haywireid).

## Bindings

`bind(id)` starts a binding, which tells Haywire how to build a value for the id. List its dependencies, then a provider that receives them in the same order:

```ts
import { bind, identifier } from 'haywire';

interface Logger {
    info(message: string): void;
}
const loggerId = identifier<Logger>();
const dbUrlId = identifier<string>().named('dbUrl');
// ---cut---
class Database {
    constructor(
        private readonly logger: Logger,
        private readonly url: string
    ) {}
}

const databaseBinding = bind(Database)
    .withDependencies([loggerId, dbUrlId])
    .withProvider((logger, url) => new Database(logger, url));
//                         ^?
```

When the id is a class whose constructor takes the dependencies in order, `withConstructorProvider()` calls it for you:

```ts
import { bind, identifier } from 'haywire';

interface Logger {
    info(message: string): void;
}
const loggerId = identifier<Logger>();
const dbUrlId = identifier<string>().named('dbUrl');
class Database {
    constructor(
        private readonly logger: Logger,
        private readonly url: string
    ) {}
}
// ---cut---
const databaseBinding = bind(Database)
    .withDependencies([loggerId, dbUrlId])
    .withConstructorProvider();
```

Dependencies are checked against the provider's parameters, in either order, so passing the wrong id is a compile error:

```ts
// @errors: 2345
import { bind, identifier } from 'haywire';

interface Logger {
    info(message: string): void;
}
const loggerId = identifier<Logger>();
const dbUrlId = identifier<string>().named('dbUrl');
class Database {
    constructor(
        private readonly logger: Logger,
        private readonly url: string
    ) {}
}
// ---cut---
bind(Database)
    .withConstructorProvider()
    .withDependencies([dbUrlId, loggerId]);
```

Values with no dependencies have shorthands:

```ts
import { bind, identifier } from 'haywire';

interface Logger {
    info(message: string): void;
}
const loggerId = identifier<Logger>();
const dbUrlId = identifier<string>().named('dbUrl');
class Clock {}
// ---cut---
// Called to build each value
bind(loggerId).withFactory(() => console);

// Calls the class's constructor with no arguments
bind(Clock).withConstructorFactory();

// A value that already exists
bind(dbUrlId).withInstance('postgres://localhost/app');
```

Every binding method returns a new binding, so a binding can be shared and modified safely. A common modification is its [scope](/packages/haywire/guides/scopes): by default, a new value is built for every dependent.

## Modules

A module collects bindings. Bindings can be added in any order, and modules merged together:

```ts
import { bind, createModule, identifier } from 'haywire';

interface Logger {
    info(message: string): void;
}
const loggerId = identifier<Logger>();
const dbUrlId = identifier<string>().named('dbUrl');
class Database {
    constructor(
        private readonly logger: Logger,
        private readonly url: string
    ) {}
}
// ---cut---
const databaseModule = createModule(
    bind(Database).withDependencies([loggerId, dbUrlId]).withConstructorProvider()
).addBinding(bind(loggerId).withFactory(() => console));

const envModule = createModule(bind(dbUrlId).withInstance('postgres://localhost/app'));

const appModule = databaseModule.mergeModule(envModule);
```

A Haywire module is a bundle of bindings, as in Guice, not an ES module. Like bindings, modules are immutable: `addBinding()` and `mergeModule()` return a new module.

Each id gets exactly one binding, so adding a second is a compile error (and throws at runtime):

```ts
// @errors: 2345
import { bind, createModule, identifier } from 'haywire';

const dbUrlId = identifier<string>().named('dbUrl');
// ---cut---
createModule(bind(dbUrlId).withInstance('postgres://localhost/app'))
    .addBinding(bind(dbUrlId).withInstance('postgres://localhost/test'));
```

To swap a binding, for example in a test, use [`replaceBinding()`](/packages/haywire/guides/testing#replacing-bindings). For ids that collect many bindings, see [Lists](/packages/haywire/guides/lists).

## Containers

A module can be missing bindings, so it can be split up and combined freely. Once every dependency is bound, `createContainer()` turns it into a container, and `get()` builds instances:

```ts
import { bind, createContainer, createModule, identifier } from 'haywire';

interface Logger {
    info(message: string): void;
}
const loggerId = identifier<Logger>();
const dbUrlId = identifier<string>().named('dbUrl');
class Database {
    constructor(
        private readonly logger: Logger,
        private readonly url: string
    ) {}
}
const databaseModule = createModule(
    bind(Database).withDependencies([loggerId, dbUrlId]).withConstructorProvider()
).addBinding(bind(loggerId).withFactory(() => console));
const envModule = createModule(bind(dbUrlId).withInstance('postgres://localhost/app'));
// ---cut---
const container = createContainer(databaseModule.mergeModule(envModule));

const database = container.get(Database);
const dbUrl = container.get(dbUrlId);
//    ^?
```

A module with an unbound dependency can't become a container:

```ts
// @errors: 2769
import { bind, createContainer, createModule, identifier } from 'haywire';

interface Logger {
    info(message: string): void;
}
const loggerId = identifier<Logger>();
const dbUrlId = identifier<string>().named('dbUrl');
class Database {
    constructor(
        private readonly logger: Logger,
        private readonly url: string
    ) {}
}
const databaseModule = createModule(
    bind(Database).withDependencies([loggerId, dbUrlId]).withConstructorProvider()
).addBinding(bind(loggerId).withFactory(() => console));
// ---cut---
// Forgot envModule
createContainer(databaseModule);
```

And requesting an id the container doesn't bind is an error too:

```ts
// @errors: 2345
import { bind, createContainer, createModule, identifier } from 'haywire';

const dbUrlId = identifier<string>().named('dbUrl');
const dbPasswordId = identifier<string>().named('dbPassword');
// ---cut---
const container = createContainer(
    createModule(bind(dbUrlId).withInstance('postgres://localhost/app'))
);

container.get(dbPasswordId);
```

### Async values

Some values can only be built asynchronously, such as a secret loaded from a remote store. Bind them with `withAsyncFactory()` or `withAsyncProvider()`. Dependents don't change: they receive the resolved value.

A container with any async binding only has `getAsync()`:

```ts
// @errors: 2339
import { bind, createContainer, createModule, identifier } from 'haywire';

const dbPasswordId = identifier<string>().named('dbPassword');
declare const loadSecret: (name: string) => Promise<string>;
// ---cut---
const container = createContainer(
    createModule(bind(dbPasswordId).withAsyncFactory(async () => loadSecret('db-password')))
);

const password = await container.getAsync(dbPasswordId);

container.get(dbPasswordId);
```

Every container has `getAsync()`, so code that receives a container of either kind can use it, or narrow with `isSyncContainer()`.

## Check the container in a test

Some mistakes can't be caught by types: a [circular dependency](/packages/haywire/guides/circular-dependencies) without a deferred side, or a [sync supplier](/packages/haywire/guides/suppliers) of an async value. `container.check()` finds them without building anything, so call it in a test:

```ts
import { bind, createContainer, createModule, identifier } from 'haywire';

const dbUrlId = identifier<string>().named('dbUrl');
// ---cut---
export const container = createContainer(
    createModule(bind(dbUrlId).withInstance('postgres://localhost/app'))
);

// In a test
container.check();
```

See [Testing](/packages/haywire/guides/testing) for more.

## Next steps

- [Scopes](/packages/haywire/guides/scopes) control how often a value is built.
- [Suppliers](/packages/haywire/guides/suppliers) build values on demand, and [deferred ids](/packages/haywire/guides/circular-dependencies) break circular dependencies.
- [Runtime values](/packages/haywire/guides/runtime-values) inject per-request values like an HTTP request.
- The [API reference](/packages/haywire/reference/api) lists every method.
