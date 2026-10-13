---
description: Read Haywire's container and request errors, and draw a container's dependency graph with describe() and toMermaid().
---

# Debugging

## Reading check errors

Types catch most wiring mistakes, and [`container.check()`](/haywire/guides/testing#check-the-container) catches the rest. Its errors name the bindings involved, not only the id that failed.

A missing binding lists each binding that depends on it:

```sh
Providers missing for container: DB_URL (needed by Database, MigrationRunner)
```

A [sync supplier](/haywire/guides/suppliers#sync-suppliers-of-async-values) of a value that can't be built synchronously names the binding that declares the supplier, and the chain of dependencies down to the async binding:

```sh
Binding has dependency on syncronous supplier that must be async: [output id: Repository, dependency supplier id: Repository(supplier(sync)), needed by: Handler, async: Repository->Database]
```

Here `Handler` depends on `identifier(Repository).supplier()`, and `Repository` depends on `Database`, which has an async provider. Make the supplier async, or make `Database` an [eager singleton](/haywire/guides/scopes) so it is ready before the supplier is called.

## Reading request errors

When a provider returns a value its id doesn't allow, like `null` for an id that isn't `.nullable()`, the error names the path from the id you requested to the binding that failed. Each id is shown as its dependent declared it:

```sh
Null value returned for non-nullable provider: Config (requested via App -> Repo(supplier(sync)) -> Config)
```

There is no path when the failing id is the one requested. [Eager](/haywire/guides/scopes) values are created at the start of a request, or by `preload()`, so their path starts at the eager binding. A failing singleton is shared by every request waiting for it, so they all get the path of the request that started creating it.

## Drawing the dependency graph

`container.toMermaid()` returns the container's bindings as a [Mermaid](https://mermaid.js.org/) flowchart, which GitHub, GitLab and most Markdown editors render:

```ts
import { bind, createContainer, createModule, identifier, singletonScope } from 'haywire';

class Database {
    constructor(private readonly url: string) {}
}
class Repository {
    constructor(private readonly database: Database) {}
}
class Handler {
    constructor(private readonly repository: () => Repository) {}
}
const dbUrlId = identifier<string>().named('dbUrl');
// ---cut---
const container = createContainer(
    createModule(bind(dbUrlId).withInstance('postgres://localhost/app'))
        .addBinding(
            bind(Database)
                .withDependencies([dbUrlId])
                .withConstructorProvider()
                .scoped(singletonScope)
        )
        .addBinding(bind(Repository).withDependencies([Database]).withConstructorProvider())
        .addBinding(
            bind(Handler)
                .withDependencies([identifier(Repository).supplier()])
                .withConstructorProvider()
        )
);

console.log(container.toMermaid());
```

```sh
flowchart LR
    b0["haywire-id(named: dbUrl)<br/>eager-singleton"]
    b1["Database<br/>singleton"]
    b2["Repository<br/>transient"]
    b3["Handler<br/>transient"]
    b1 --> b0
    b2 --> b1
    b3 -. supplier .-> b2
```

Each node is a binding, labelled with its id and [scope](/haywire/guides/scopes), and `async` if its provider is. Arrows point from a binding to its dependencies, dotted for suppliers and deferred dependencies, which aren't built before the binding. A dependency with no binding gets a dashed red node, since `toMermaid()` doesn't check the container: it can draw a container that fails `check()`.

For your own output, `container.describe()` returns the same information as data:

```ts
import { bind, createContainer, createModule } from 'haywire';

class Logger {}
const container = createContainer(createModule(bind(Logger).withConstructorFactory()));
// ---cut---
for (const binding of container.describe().bindings) {
    console.log(
        binding.outputId.toString(),
        binding.scope.description,
        binding.dependencies.map(({ id }) => id.toString())
    );
}
```

Each binding has its `outputId`, `scope`, whether it is `async`, and its `dependencies` in provider order. Each dependency has the `id` it was declared with, and the `providers` that satisfy it: one per element for a [list](/haywire/guides/lists), and none when it is missing.
