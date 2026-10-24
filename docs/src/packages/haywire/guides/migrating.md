---
description: Move from InversifyJS or TSyringe to Haywire, mapping decorators, tokens and scopes to bindings.
---

# Migrating from InversifyJS or TSyringe

InversifyJS and TSyringe read constructor parameters from decorators and `reflect-metadata` at runtime. Haywire lists each binding's dependencies in code instead, so TypeScript can check them. Migrating means:

1. Replace each token (`Symbol.for('Logger')`, `'Logger'`) with an `identifier<T>()`. Classes are already ids.
2. Replace each `@injectable()` class and its `@inject()` parameters with a `bind(...).withDependencies([...])` binding.
3. Replace `container.bind()` / `container.register()` calls with bindings collected in a module.
4. Remove `reflect-metadata`, and `experimentalDecorators` and `emitDecoratorMetadata` from your `tsconfig.json`.

You can migrate one module at a time: a Haywire container can sit next to the old one, with values passed between them by `withInstance()`.

## The same app in Haywire

Both examples below migrate to this:

```ts
import { bind, createContainer, createModule, identifier, singletonScope } from 'haywire';

interface Logger {
    log: (message: string) => void;
}
const loggerId = identifier<Logger>();
const dbUrlId = identifier<string>().named('dbUrl');

class ConsoleLogger implements Logger {
    log(message: string) {
        console.log(message);
    }
}

class UserRepository {
    constructor(
        private readonly logger: Logger,
        private readonly dbUrl: string
    ) {}
}

const container = createContainer(
    createModule(bind(loggerId).withFactory(() => new ConsoleLogger()).scoped(singletonScope))
        .addBinding(bind(dbUrlId).withInstance('postgres://localhost/app'))
        .addBinding(
            bind(UserRepository).withDependencies([loggerId, dbUrlId]).withConstructorProvider()
        )
);

const repository = container.get(UserRepository);
```

Forgetting a binding, binding `dbUrlId` to a number, or listing the dependencies in the wrong order are now compile errors.

## InversifyJS

```ts
// @experimentalDecorators: true
// @emitDecoratorMetadata: true
import 'reflect-metadata';
import { Container, inject, injectable } from 'inversify';

interface Logger {
    log: (message: string) => void;
}
const TYPES = { Logger: Symbol.for('Logger'), DbUrl: Symbol.for('DbUrl') };

@injectable()
class ConsoleLogger implements Logger {
    log(message: string) {
        console.log(message);
    }
}

@injectable()
class UserRepository {
    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(TYPES.DbUrl) private readonly dbUrl: string
    ) {}
}

const container = new Container();
container.bind<Logger>(TYPES.Logger).to(ConsoleLogger).inSingletonScope();
container.bind<string>(TYPES.DbUrl).toConstantValue('postgres://localhost/app');
container.bind(UserRepository).toSelf();

const repository = container.get(UserRepository);
```

| InversifyJS | Haywire |
|-------------|---------|
| `Symbol.for('Logger')`, `'Logger'` | `identifier<Logger>()`. Two ids of the same type need a name: `identifier<string>().named('dbUrl')`. |
| `@injectable()` with `@inject(TYPES.X)` parameters | `bind(Class).withDependencies([xId, ...]).withConstructorProvider()` |
| `bind(TYPES.X).to(Impl)` | `bind(xId).withDependencies([...]).withProvider((...deps) => new Impl(...deps))`, or `withFactory()` with no dependencies |
| `bind(X).toSelf()` | `bind(X).withConstructorProvider()` (or `withConstructorFactory()`) |
| `toConstantValue(value)` | `withInstance(value)` |
| `toDynamicValue(ctx => ...)` | `withProvider()`, or `withAsyncProvider()` for a promise. Dependencies are declared, not fetched from `ctx`. |
| `toFactory()`, `Factory<T>`, `Provider<T>` | Depend on `xId.supplier()` or `xId.supplier('async')`. See [Suppliers](/packages/haywire/guides/suppliers). |
| `inTransientScope()` (the default) | `transientScope` (the default) |
| `inSingletonScope()` | `.scoped(singletonScope)` |
| `inRequestScope()` | `.scoped(requestScope)`: one instance per `get()`. See [Scopes](/packages/haywire/guides/scopes). |
| `@multiInject(TYPES.X)`, `getAll()` | A list id, `identifier<X>().list()`, bound once per element. See [Lists](/packages/haywire/guides/lists). |
| `@named()`, `@tagged()` | A different id per name: `identifier<X>().named('primary')` |
| `@optional()` | No equivalent: every dependency must be bound. Bind a `.nullable()` id with `withInstance(null)`. |
| `LazyServiceIdentifier`, `@lazyInject` | Depend on `xId.deferred()`. See [Circular dependencies](/packages/haywire/guides/circular-dependencies). |
| `onDeactivation()`, `@preDestroy()` | `withDisposer()`, or `Symbol.asyncDispose` on the instance. See [Disposal](/packages/haywire/guides/disposal). |
| `onActivation()`, `@postConstruct()` | Do the work in the provider, with `withAsyncProvider()` if it is async. |
| `ContainerModule`, `container.load()` | `createModule()`, `module.mergeModule()` |
| `container.get()`, `getAsync()` | `container.get()`, `getAsync()` |
| `rebind()`, `unbind()` in tests | `module.replaceBinding()`, on a container built for the test. See [Testing](/packages/haywire/guides/testing). |
| Child containers | A container factory per request. See [Runtime values](/packages/haywire/guides/runtime-values). |

## TSyringe

```ts
// @experimentalDecorators: true
// @emitDecoratorMetadata: true
import 'reflect-metadata';
import { container, inject, injectable, singleton } from 'tsyringe';

interface Logger {
    log: (message: string) => void;
}

@singleton()
class ConsoleLogger implements Logger {
    log(message: string) {
        console.log(message);
    }
}

@injectable()
class UserRepository {
    constructor(
        @inject('Logger') private readonly logger: Logger,
        @inject('DbUrl') private readonly dbUrl: string
    ) {}
}

container.register('Logger', { useToken: ConsoleLogger });
container.register('DbUrl', { useValue: 'postgres://localhost/app' });

const repository = container.resolve(UserRepository);
```

| TSyringe | Haywire |
|----------|---------|
| `'Logger'`, `InjectionToken` | `identifier<Logger>()`. Two ids of the same type need a name: `identifier<string>().named('dbUrl')`. |
| `@injectable()` with `@inject('X')` parameters | `bind(Class).withDependencies([xId, ...]).withConstructorProvider()` |
| `{ useClass: Impl }` | `bind(xId).withDependencies([...]).withProvider((...deps) => new Impl(...deps))`, or `withFactory()` with no dependencies |
| `{ useValue: value }`, `registerInstance()` | `withInstance(value)` |
| `{ useFactory: c => ... }` | `withProvider()`. Dependencies are declared, not resolved from `c`. |
| `{ useToken: Other }` | `bind(xId).withDependencies([otherId]).withProvider(other => other)` |
| `Lifecycle.Transient` (the default) | `transientScope` (the default) |
| `@singleton()`, `Lifecycle.Singleton`, `registerSingleton()` | `.scoped(singletonScope)`. Singletons belong to the container, not the process: there is no global container. |
| `Lifecycle.ResolutionScoped` | `.scoped(requestScope)`: one instance per `get()` |
| `Lifecycle.ContainerScoped`, `createChildContainer()` | `.scoped(singletonScope)` on containers from a [container factory](/packages/haywire/guides/runtime-values), one per request |
| `@injectAll('X')`, `resolveAll()` | A list id, `identifier<X>().list()`, bound once per element. See [Lists](/packages/haywire/guides/lists). |
| `delay(() => X)` | Depend on `xId.deferred()`. See [Circular dependencies](/packages/haywire/guides/circular-dependencies). |
| `instanceCachingFactory()` | `withProvider()` with `.scoped(singletonScope)` |
| `Disposable`, `container.dispose()` | `Symbol.asyncDispose` or `withDisposer()`, and `container.disposeAsync()`. See [Disposal](/packages/haywire/guides/disposal). |
| `container.resolve()` | `container.get()`, or `getAsync()` if any provider is async |
| `container.reset()`, `clearInstances()` in tests | Build a new container in each test, swapping fakes in with `module.replaceBinding()`. See [Testing](/packages/haywire/guides/testing). |
