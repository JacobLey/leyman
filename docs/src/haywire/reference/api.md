---
description: Every function, class and method in Haywire.
---

# API

Most classes have private constructors, so their checks can't be skipped. Create them with the functions below.

## Functions

### `identifier`

Returns a [`HaywireId`](#haywireid), which stands for a type in every other API.

| Signature | Returns |
|-----------|---------|
| `identifier(SomeClass)` | The id for the class. Always the same id, and interchangeable with passing the class itself. |
| `identifier<T>(name?)` | A new id for `T`. Create each one once: TypeScript can't tell two ids for the same `T` apart. `name` is used when the id is printed in errors, and defaults to `'haywire-id'`. |
| `identifier(id)` | `id`, unchanged. |

`T` can't include `null` or `undefined`. Use [`nullable()` and `undefinable()`](#haywireid) instead.

### `bind(idOrClass)`

Starts a binding for an id or class. Returns a builder: see [Bindings](#bindings).

### `createModule(binding)`

Creates a [`Module`](#module) from one binding. Alias of `Module.fromBinding()`.

### `createContainer(moduleOrFactory)`

Creates a [container](#container) from a module whose dependencies are all bound, or a container factory whose remaining dependencies are all bound. Anything unbound is a compile error.

Returns a [`SyncContainer`](#synccontainer) when every binding is synchronous, otherwise a [`Container`](#container).

### `createContainerFactory(module)`

Creates a [`ContainerFactory`](#containerfactory) from a module that may have unbound dependencies. See [Runtime values](/haywire/guides/runtime-values).

### `isSyncContainer(container)`

Whether a container is a [`SyncContainer`](#synccontainer), narrowing its type. Keeps types better than `instanceof SyncContainer`.

## `HaywireId`

Stands for a type. Every method returns an id for the modified type, and can be reverted: modifiers can be applied in any order, and an id modified back to an earlier type is the same instance.

```ts
import { identifier } from 'haywire';

const id = identifier<number>();
const modified = id.nullable().supplier('async').named('count');

modified.nullable(false).supplier(false).named(null) === id; // true
```

| Method | Type | Description |
|--------|------|-------------|
| `nullable(enabled = true)` | `T \| null` | Allows `null`. |
| `undefinable(enabled = true)` | `T \| undefined` | Allows `undefined`. |
| `named(name)` | `T` | Distinguishes ids of the same type. A string literal or `unique symbol`, or `null` to remove. Unions and non-unique symbols are rejected. |
| `supplier(options = true)` | `() => T` or `() => Promise<T>` | Depends on a function that builds the value. `true`, `'async'`, `false`, or `{ sync, propagateScope }`. See [Suppliers](/haywire/guides/suppliers). |
| `deferred(enabled = true)` | `Promise<T>` | Depends on a promise of the value. See [Circular dependencies](/haywire/guides/circular-dependencies). |
| `list(list = true)` | `T[]` | Collects every binding into an array. `'multi'` for a binding whose provider returns several elements. See [Lists](/haywire/guides/lists). |
| `baseId()` | `T` | The id without modifiers, except `list` (`'multi'` becomes `true`). |
| `toString()` | | The class name or `name`, for debugging. |

## Bindings

`bind()` returns a builder. Set its dependencies and provider in either order, or use a shorthand for values with no dependencies.

| Method | Description |
|--------|-------------|
| `withDependencies([...ids])` | Ids or classes to build first, passed to the provider in order. Checked against the provider's parameters when both are set. |
| `withProvider((...deps) => value)` | Builds the value from its dependencies. |
| `withAsyncProvider(async (...deps) => value)` | Builds the value asynchronously. Makes the container async. |
| `withConstructorProvider()` | Calls the class's constructor with the dependencies. Class ids only. |
| `withFactory(() => value)` | Builds the value, with no dependencies. |
| `withAsyncFactory(async () => value)` | Builds the value asynchronously, with no dependencies. Makes the container async. |
| `withConstructorFactory()` | Calls the class's constructor with no arguments. Class ids only. |
| `withInstance(value)` | A value that already exists. Always a singleton, and never [disposed](/haywire/guides/disposal) unless given a disposer. |

### `Binding`

Once both are set, the result is a `Binding`. Its methods return a new binding:

| Method | Description |
|--------|-------------|
| `scoped(scope)` | How often the value is built. Defaults to `transientScope`. See [Scopes](/haywire/guides/scopes). |
| `withDisposer(disposer)` | `(instance) => void \| Promise<void>`, or `null`, called when the container is [disposed](/haywire/guides/disposal). Defaults to the instance's `Symbol.asyncDispose` or `Symbol.dispose`, or `null` for `withInstance()`. Singletons only. |
| `nullable(true)` | Marks the output nullable, as if the id passed to `bind()` were. Useful when binding a class directly. Can't be reverted. |
| `undefinable(true)` | Marks the output undefinable. Can't be reverted. |
| `named(name)` | Names the output, as if the id passed to `bind()` were named. |
| `list(true)` | Makes the output a [list](/haywire/guides/lists), with the provider's value as one element. |

## `Module`

An immutable collection of bindings, one per id (except [lists](/haywire/guides/lists)). Every method returns a new module, and checks at compile time and runtime that outputs are unique and dependencies are satisfied.

| Method | Description |
|--------|-------------|
| `addBinding(binding)` | Adds a binding. |
| `mergeModule(module)` | Adds every binding of another module. Order doesn't matter. |
| `replaceBinding(binding)` | Replaces the binding for an id, or every binding of a list. See [Replacing bindings](/haywire/guides/testing#replacing-bindings). |
| `toContainer()` | Same as [`createContainer(module)`](#createcontainer-moduleorfactory). |
| `toContainerFactory()` | Same as [`createContainerFactory(module)`](#createcontainerfactory-module). |

## `Container`

Builds values asynchronously. A container goes through four stages. Each runs the stages before it first, and is cached.

| Method | Description |
|--------|-------------|
| `check()` | Validates bindings, [circular dependencies](/haywire/guides/circular-dependencies), [sync suppliers](/haywire/guides/suppliers) and [disposers](/haywire/guides/disposal), without building anything. Run it in a test. |
| `wire()` | Links each binding to its dependencies, so requests are fast. Run it at startup. |
| `preloadAsync()` | Builds every `eagerSingletonScope` value. Run it at startup. |
| `getAsync(idOrClass)` | Builds a value. Each call is a new [request](/haywire/guides/scopes#requests). Requesting an id the container doesn't bind, or a non-null id bound as nullable, is a compile error and throws. |
| `disposeAsync()` | Releases every singleton the container created, then rejects all further requests. Also `[Symbol.asyncDispose]()`. See [Disposal](/haywire/guides/disposal). |
| `describe()` | Returns every binding with its scope and dependencies, as a `ContainerDescription`. Doesn't check the container. See [Debugging](/haywire/guides/debugging#drawing-the-dependency-graph). |
| `toMermaid()` | Returns the dependency graph as a Mermaid flowchart. See [Debugging](/haywire/guides/debugging#drawing-the-dependency-graph). |

### `SyncContainer`

A `Container` whose bindings are all synchronous, which adds:

| Method | Description |
|--------|-------------|
| `preload()` | Synchronous `preloadAsync()`. |
| `get(idOrClass)` | Synchronous `getAsync()`. |

## `ContainerFactory`

An immutable module with some dependencies left unbound, that can be checked and wired once and then bound per use. See [Runtime values](/haywire/guides/runtime-values).

| Method | Description |
|--------|-------------|
| `check()` | Like `container.check()`, assuming the values bound later are synchronous singletons with no dependencies. Shared by every container it creates. |
| `wire()` | Like `container.wire()`. Shared by every container it creates. |
| `bindInstance(idOrClass, value)` | Returns a new factory with the value bound. List ids can be bound repeatedly, each adding elements. |
| `toContainer()` | Same as [`createContainer(factory)`](#createcontainer-moduleorfactory). |

## Scopes

`transientScope`, `singletonScope`, `eagerSingletonScope`, `requestScope`, `eagerRequestScope` and `isolatedRequestScope`. See [Scopes](/haywire/guides/scopes).

## Types

Haywire tracks a lot in generics, but they are not part of the API: let TypeScript infer them. Instead of typing a variable as a module or container, create modules and containers where they are used, and choose between modules for each environment rather than passing them through functions.

```ts
import { bind, createModule } from 'haywire';

class Logger {}
// ---cut---
// Do this
const loggerModule = createModule(bind(Logger).withConstructorFactory());
```

The exceptions are `identifier<T>()`, and these types:

| Type | Description |
|------|-------------|
| `HaywireIdType<typeof id>` | The type an id stands for, as returned by `get()` or passed to a provider. |
| `Supplier<T>` | `() => T`, as depended on with `.supplier()`. |
| `AsyncSupplier<T>` | `() => Promise<T>`, as depended on with `.supplier('async')`. |
| `Deferred<T>` | `Promise<T>`, as depended on with `.deferred()`. |
| `ContainerDescription`, `BindingDescription` | Returned by `container.describe()`. |

```ts
import { identifier, type HaywireIdType } from 'haywire';

const id = identifier<number>().nullable().supplier();

type Id = HaywireIdType<typeof id>;
//   ^?
```

## Errors

Haywire throws these, or subclasses of them. Compare thrown errors with `instanceof`; don't throw them yourself.

| Error | Thrown |
|-------|--------|
| `HaywireError` | Base class of every error, and when requesting from a [disposed](/haywire/guides/disposal) container. |
| `HaywireModuleValidationError` | When building a module: a duplicate binding, or replacing a binding that doesn't exist. |
| `HaywireContainerValidationError` | By `check()`: a circular dependency, a sync supplier of an async value, or a disposer on a binding that isn't a singleton. |
| `HaywireInstanceValidationError` | When building a value: `null` or `undefined` for an id that doesn't allow it, a value that isn't an instance of the requested class, or a `list('multi')` provider that doesn't return an array. |
