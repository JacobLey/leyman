---
description: Check your container in a test, and swap real bindings for fakes with replaceBinding.
---

# Testing

## Check the container

Types catch most wiring mistakes, but not all. `container.check()` validates the rest without building anything:

- Every dependency is bound, as types already ensure.
- There are no [circular dependencies](/haywire/guides/circular-dependencies) without a deferred side.
- Every [sync supplier](/haywire/guides/suppliers#sync-suppliers-of-async-values) can be built synchronously.
- [Disposers](/haywire/guides/disposal) are only set on singletons.

It throws a `HaywireContainerValidationError` describing the problem, naming the bindings involved (see [Debugging](/haywire/guides/debugging)). Export your container, or its module, and check it in a test:

```ts
import { bind, createContainer, createModule, identifier } from 'haywire';

const dbUrlId = identifier<string>().named('dbUrl');
// ---cut---
export const appModule = createModule(bind(dbUrlId).withInstance('postgres://localhost/app'));

// In a test
createContainer(appModule).check();
```

`check()` is cached, and every later stage runs it first, so calling it at startup too costs nothing.

## Replacing bindings

Each test can build its own container: there is no global registry to reset. To swap a real implementation for a fake, use `module.replaceBinding()`. Adding a second binding for an id is a compile error, so `addBinding()` can't be used.

```ts
import { bind, createContainer, createModule, identifier } from 'haywire';

interface Database {
    getRowById(table: string, id: number): unknown;
}
const databaseId = identifier<Database>();
declare class PostgresDatabase implements Database {
    getRowById(table: string, id: number): unknown;
}
class UserService {
    constructor(private readonly database: Database) {}
}
const appModule = createModule(bind(databaseId).withFactory(() => new PostgresDatabase())).addBinding(
    bind(UserService).withDependencies([databaseId]).withConstructorProvider()
);
// ---cut---
const fakeDatabase: Database = { getRowById: () => ({ id: 1 }) };

const container = createContainer(
    appModule.replaceBinding(bind(databaseId).withInstance(fakeDatabase))
);
```

It returns a new module, so `appModule` is untouched for other tests. The replacement is checked like any other binding:

- There must already be a binding for the id.
- It must satisfy everything that depends on the id. A nullable replacement fails if a service needs a non-null value.
- Its own dependencies must be bound by the rest of the module.

```ts
// @errors: 2345
import { bind, createModule, identifier } from 'haywire';

interface Database {
    getRowById(table: string, id: number): unknown;
}
const databaseId = identifier<Database>();
declare class PostgresDatabase implements Database {
    getRowById(table: string, id: number): unknown;
}
class UserService {
    constructor(private readonly database: Database) {}
}
const appModule = createModule(bind(databaseId).withFactory(() => new PostgresDatabase())).addBinding(
    bind(UserService).withDependencies([databaseId]).withConstructorProvider()
);
// ---cut---
appModule.replaceBinding(bind(databaseId.nullable()).withInstance(null));
```

For a [list](/haywire/guides/lists), the replacement takes the place of every binding in the list.

The replaced binding's dependencies stay required by the module's types, even if the replacement doesn't use them. In practice the full app module already binds them.
