---
description: Compile-time checked dependency injection for TypeScript — no decorators, no reflect-metadata, no global state.
---

# Haywire

<ProjectHeader />

Compile-time checked dependency injection for TypeScript: no decorators, no `reflect-metadata`, no global state.

If your container compiles, it is complete: missing bindings, mismatched types and duplicate registrations are all TypeScript errors, not runtime crashes.

```ts
import { bind, createContainer, createModule, identifier, singletonScope } from 'haywire';

interface Logger {
    info(message: string): void;
}
const loggerId = identifier<Logger>();
const dbUrlId = identifier<string>().named('dbUrl');

class UserService {
    constructor(
        private readonly logger: Logger,
        private readonly dbUrl: string
    ) {}
}

const appModule = createModule(bind(loggerId).withFactory(() => console).scoped(singletonScope))
    .addBinding(bind(dbUrlId).withInstance('postgres://localhost/app'))
    .addBinding(bind(UserService).withDependencies([loggerId, dbUrlId]).withConstructorProvider());

const container = createContainer(appModule);

const userService = container.get(UserService);
//    ^?
```

Hover over any identifier in the examples on this site to see its inferred type. Every example is type-checked against Haywire's published types when the site is built.

**[Get started →](/packages/haywire/getting-started)** · [Why Haywire?](/packages/haywire/why)

## Features

- **Wiring mistakes are type errors**: A missing dependency, a duplicate binding, the wrong id passed to `container.get()`, or a nullable value injected into a non-nullable parameter all fail to build.
- **Plain JavaScript**: Constructor injection with no decorators, `experimentalDecorators` or `reflect-metadata`. Works with private fields, and in plain JavaScript too.
- **Type-based ids, not strings**: `identifier<T>()` tells two `string` dependencies, such as a database URL and password, apart at the type level.
- **Real-world lifecycles**: [Singleton, request and transient scopes](/packages/haywire/guides/scopes), opt-in async initialization, explicit [circular dependencies](/packages/haywire/guides/circular-dependencies), [runtime values](/packages/haywire/guides/runtime-values) like an HTTP request supplied per call, and [`await using` disposal](/packages/haywire/guides/disposal) of what the container created.
- **Immutable and independent**: Modules never mutate, and containers share no global registry, so [tests](/packages/haywire/guides/testing) can build their own and swap in fakes with a type-checked `replaceBinding()`.

## Compared to

- [InversifyJS](https://www.npmjs.com/package/inversify), [TSyringe](https://www.npmjs.com/package/tsyringe), [TypeDI](https://www.npmjs.com/package/typedi) and [NestJS](https://nestjs.com/)'s injector rely on decorators and string or token keys, and find missing bindings at runtime.
- [Awilix](https://www.npmjs.com/package/awilix) avoids decorators, but resolves dependencies by name at runtime.

Haywire is the only one of these where a container that compiles is guaranteed to have every binding it needs.

## Related

<ProjectRelated />
