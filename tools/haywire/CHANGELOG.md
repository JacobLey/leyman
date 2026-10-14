# haywire

## 2.0.0

### Major Changes

- f6c298e: Errors thrown by providers are wrapped in a `HaywireProviderError`, which names the path from the requested id to the binding that failed. The original error is its `cause`, unchanged:
  
  ```
  HaywireProviderError: Provider for DB_URL failed (requested via App -> Database -> DB_URL): DB_URL is missing
  ```
  
  Code that catches a provider's error by type around `get()` or `getAsync()` must check `err.cause` instead. To keep throwing provider errors as they are, create the container with `createContainer(module, { unsafeRawProviderErrors: true })` (also accepted by `createContainerFactory()`, `module.toContainer()` and `module.toContainerFactory()`).
  
  Errors thrown by Haywire itself, by a value's methods after it is created, and by disposers are not wrapped.

### Minor Changes

- 23a101a: Make containers easier to debug.
  
  - Missing provider errors name the bindings that need each missing id: `Providers missing for container: DB_URL (needed by Database, MigrationRunner)`.
  - Sync supplier errors name the binding that declares the supplier, and the chain of dependencies down to the async binding: `needed by: Handler, async: Repository->Database`.
  - `container.describe()` returns every binding with its scope, whether it is async, and its dependencies with the bindings that provide them. `container.toMermaid()` renders the same graph as a Mermaid flowchart. Neither checks the container, so both work on one that fails `check()`. The `ContainerDescription` and `BindingDescription` types are exported.
- 981857a: Errors for a provider's invalid value (`null` or `undefined` where the id doesn't allow it, the wrong class, or a `list('multi')` provider not returning an array) name the path from the requested id: `Null value returned for non-nullable provider: Config (requested via App -> Repo(supplier(sync)) -> Config)`.
- 20d431b: Export every error class, not only the abstract bases, so their properties are typed: for example `requestPath` on `HaywireNullResponseError`, or `dependentIds` on `HaywireProviderMissingError`.
- 54037a8: `ContainerFactory` has `describe()` and `toMermaid()`, describing the containers it creates. Ids still to be bound with `bindInstance()` are marked `unbound` in the description (a new `BindingDescription` property), and drawn with a dashed border labelled `bindInstance()`.

### Patch Changes

- 2851c68: Node prints haywire ids by name, e.g. `HaywireId<DB_URL(nullable)>`, in `console.log()` and in the properties of a crashed error, instead of every field of the id.

## 1.1.1

### Patch Changes

- 9469c47: Eager values are created first however deep they are in the dependency graph. Previously an async `eagerRequestScope` value more than one dependency away from the requested value, or reached only through a propagating supplier or deferred dependency, was passed to its dependent as an unresolved `Promise` (or rejected with `HaywireInstanceOfResponseError` for a class). Likewise an eager singleton reached through another binding was not always created before the eager singletons that depend on it.
  
  A supplier that does not propagate scope no longer creates eager request values in the request that receives it, since its own requests create them.
- ec5c0e6: Export the `CombineListOutputs` type. A module or container with list bindings could not be exported from a package that emits declarations, as TypeScript could not name its type (`TS2883`).
- 04f66c2: When a deferred dependency fails, the promise passed to the provider no longer causes an unhandled rejection. The request still rejects with the error, and handlers the provider attaches to the promise still run.

## 1.1.0

### Minor Changes

- 474fda9: Containers can now release the singletons they created. `container.disposeAsync()` (or `await using`) disposes every singleton in reverse creation order, using the instance's `Symbol.asyncDispose`/`Symbol.dispose` by default or a disposer set with `binding.withDisposer()`. Once disposed, a container rejects further requests.
  
  Also fixes `named()`, `nullable()`, `undefinable()` and `list()` on a binding resetting its scope to transient.
- 898a75c: Add `module.replaceBinding(binding)` to swap a binding for another, such as a fake in tests. It is type-checked like `addBinding`: a binding for the id must already exist, the replacement must still satisfy everything that depends on it, and its own dependencies must be provided by the module. For a list, it replaces every binding of that list.

### Patch Changes

- a59b9b4: Faster type-checking of large modules built with `addBinding()`. `addBinding()`, `replaceBinding()` and `createModule()` no longer recompute the base ids of every existing output to validate the incoming binding's dependencies, cutting check time by about a quarter to a third for a 200-binding module.
- 5ecdfe1: Type errors now say what is wrong, e.g. `{ error: "Error: an output is already bound. Use replaceBinding() on a module to swap it." }`, for module bindings, `toContainer()`/`createContainer()`, `container.get()`/`getAsync()` and `factory.bindInstance()`, instead of `'[]' is not assignable to 'never'` or `not assignable to 'IsClass'`.
  
  `module.toContainer()` now rejects a module with unbound dependencies at compile time, like `createContainer(module)` already did.
- 15f5262: Fix README links that were broken on npm: relative links (such as WHY files and sibling packages) are now absolute, table-of-contents anchors match their headings, LICENSE badges point at the right path, and `repository` now names the package's directory in the monorepo.
- ac478a2: Make the package easier to find and evaluate: a clearer npm description and keywords, and a README that opens with highlights and how it compares to alternatives.

## 1.0.0

### Major Changes

- eaae490: Increase node engine requirement

### Minor Changes

- 9221852: Add `list()` annotations to haywire, allowing multiple bindings to contribute elements to a single array dependency (`list('multi')` providers contribute several elements at once).
- 3651dbf: Rename haywire APIs to clearer, less overloaded names. This is a breaking change:
  
  | Before | After |
  |--------|-------|
  | `Factory` | `ContainerFactory` |
  | `createFactory()` / `module.toFactory()` | `createContainerFactory()` / `module.toContainerFactory()` |
  | `factory.register(id, instance)` | `containerFactory.bindInstance(id, instance)` |
  | `AsyncContainer` | `Container` |
  | `optimisticSingletonScope` / `optimisticRequestScope` | `eagerSingletonScope` / `eagerRequestScope` |
  | `supplierScope` | `isolatedRequestScope` |
  | `withGenerator()` / `withAsyncGenerator()` / `withConstructorGenerator()` | `withFactory()` / `withAsyncFactory()` / `withConstructorFactory()` |
  | `id.lateBinding()` / `LateBinding<T>` / `id.annotations.lateBinding` | `id.deferred()` / `Deferred<T>` / `id.annotations.deferred` |
  
  `haywire-launcher` now requires the renamed `Container` type.

### Patch Changes

- f8cdb0e: Fix `identifier()` and other class-accepting APIs rejecting classes whose private constructor takes arguments. TypeScript strips private constructor parameters from emitted declarations, so the published types only accepted private constructors with no arguments. `Constructable` is now a hand-written declaration that ships as-is.
- 2ae16b8: Update READMEs to be more agent friendly
- b87bd62: Fixed typos in README and docstrings

## 0.1.8

### Patch Changes

- 2dfcf0d: Refactor dependencies to not require pnpmfile
- 9694f33: Bump dependencies

## 0.1.7

### Patch Changes

- 282a5b7: Bump license version
- 75d9ae4: Migrate to using per-package eslint CLI instead of Nx plugin

## 0.1.6

### Patch Changes

- 18cfe17: Add dev dependency on pnpm-dedicated-lockfile
- efd163f: Remove local files from publishing
- 37b2ec5: Move from nx-tsc to swc + tsc CLI
- 36d1c12: Bump dependencies

## 0.1.5

### Patch Changes

- e718f38: Update dependencies

## 0.1.4

### Patch Changes

- 19d5289: Fix missing test assertions
- 784035c: Ignore lint rules in test
- bcd9e61: Bump dependencies
- cbb9ef5: Replace type union with common alias
- 24d8e87: Enforce no-magic numbers/strings
- 1387a8c: Bump sonarjs eslint and fix/ignore issues
- c4af482: Enforce type-file coverage via explicit test suite

## 0.1.3

### Patch Changes

- 3b3f77f: Bump dependencies
- 3285cb6: Bump biome version
- 7d6f471: Add support for type-only exports to barrels
- 9b58c82: Bump typescript version
- 231acc9: Bump eslint import. Apply/ignore changes
- ff72123: Bump typescript eslint, apply/ignore rules

## 0.1.2

### Patch Changes

- 1de1659: Omit CHANGELOG from publish
- 725510a: Include npmignore ignore file

## 0.1.1

### Patch Changes

- Fix badge links

## 0.1.0

### Minor Changes

- c2c0990: Distinguish abstract/private constructors in ids

### Patch Changes

- 3dc29d2: Update JSDoc
- 31f81fa: Internal dependency updates
- 3e7ee18: Dependency bumps
- f6a4729: Update year in LICENSE
- cab8478: Include more types in export for container handling
- 9c786d0: Update dependencies
- 5984ed5: Add references to haywire-launcher
