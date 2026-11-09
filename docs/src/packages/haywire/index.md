---
description: Dependency injection for TypeScript that checks the wiring at compile time, without decorators or reflect-metadata.
---

# Haywire

<ProjectHeader />

Haywire is dependency injection for TypeScript that tracks every binding and dependency in types. A missing binding, a mismatched type or a duplicate registration fails to compile. It does this without decorators, `reflect-metadata` or global state.

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

- A missing dependency, a duplicate binding, the wrong id passed to `container.get()`, or a nullable value injected into a parameter that isn't nullable all fail to build.
- Classes take their dependencies through the constructor, with no decorators, `experimentalDecorators` or `reflect-metadata`. That works with private fields, and in plain JavaScript too.
- Ids come from `identifier<T>()` rather than strings, so two `string` dependencies, such as a database URL and password, are told apart by their types.
- It has [singleton, request and transient scopes](/packages/haywire/guides/scopes), opt-in async initialization, explicit [circular dependencies](/packages/haywire/guides/circular-dependencies), [runtime values](/packages/haywire/guides/runtime-values) like an HTTP request supplied per call, and [`await using` disposal](/packages/haywire/guides/disposal) of what the container created.
- Modules never change once created, and containers share no global registry, so [tests](/packages/haywire/guides/testing) can build their own and swap in fakes with a type-checked `replaceBinding()`.

## Compared to

- [InversifyJS](https://www.npmjs.com/package/inversify), [TSyringe](https://www.npmjs.com/package/tsyringe), [TypeDI](https://www.npmjs.com/package/typedi) and [NestJS](https://nestjs.com/)'s injector rely on decorators and string or token keys, and find missing bindings at runtime.
- [Awilix](https://www.npmjs.com/package/awilix) avoids decorators, but resolves dependencies by name at runtime.

Of these, only Haywire checks at compile time that a container has every binding it needs.

## Related

<ProjectRelated />
