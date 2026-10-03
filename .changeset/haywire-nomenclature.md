---
"haywire": minor
"haywire-launcher": minor
"nx-lifecycle": patch
---

Rename haywire APIs to clearer, less overloaded names. This is a breaking change:

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
