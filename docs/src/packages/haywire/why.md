---
description: The problems Haywire solves, its requirements, how its type checks work, and how it compares to alternatives.
---

# Why Haywire?

## The Problem

Dependency injection is a powerful pattern, but JavaScript DI libraries tend to let bugs escape to runtime.

Here are the failure modes that motivated Haywire:

### Missing registrations only blow up at runtime

You add a new dependency to `UserService`, forget to wire it, and everything compiles fine. Then:

```
Error: Cannot read properties of undefined (reading 'query')
    at UserService.getUserById (user-service.js:12)
```

The container silently provided `undefined` to a parameter that was never supposed to be optional. If your DI library doesn't validate completeness at build time, your test suite or your users will discover this for you.

### String and symbol keys don't scale

Most DI frameworks identify dependencies by string tokens or symbols:

```ts
interface Logger {
    info(message: string): void;
}
declare class ConsoleLogger {}
declare class FileLogger {}
declare const container: {
    bind(token: string): { to(implementation: unknown): void };
    get<T>(token: string): T;
};
// ---cut---
container.bind('Logger').to(ConsoleLogger);
container.bind('Logger').to(FileLogger); // Silently overwrites
container.get<Logger>('Logger'); // No type guarantee
```

In a large codebase, you'll eventually have multiple things named `Logger`, `ApiClient`, or `Url`. Nothing stops you from injecting the wrong one.

### Decorators are a leaky abstraction

The most common JavaScript DI approach uses decorators:

```ts
declare const DATABASE_TOKEN: unique symbol;
declare class Database {}
declare function Injectable(): (target: unknown, context: ClassDecoratorContext) => void;
declare function Inject(
    token: symbol
): (target: undefined, context: ClassFieldDecoratorContext) => void;
// ---cut---
@Injectable()
class UserService {
    @Inject(DATABASE_TOKEN)
    private database!: Database; // Typed as always set, but not set by the constructor
}
```

Problems with this:

- Most libraries require `experimentalDecorators` and `reflect-metadata`, which is still a proposal.
- Property injection types fields as always set, but they are skipped at construction, so TypeScript is wrong about them.
- Private fields can't be injected at all.
- If your tsconfig changes, injection may silently stop working, with no build error.

### Null and undefined leak into consumers

When a binding can return `null` or `undefined`, consumers shouldn't receive it unless they explicitly opt in. Most frameworks don't track this in types, so you're left writing defensive code everywhere, or hoping the provider never returns null.

## Requirements

There are several TypeScript DI libraries. None meets all of these requirements at once:

- **Native JS support**: Decorators require extra tooling, and don't change the type of what they decorate, so they can't be fully type-safe.
- **Constructor-only injection**: Property injection is type-unsafe, and can't target private fields.
- **Circular dependency support**: Circular dependencies are an antipattern, but sometimes unavoidable. A library should let you opt into them explicitly, without deadlocking or recursing forever.
- **Singleton, request and transient scopes**: A database client should be shared. A request context should be scoped to one invocation. Everything else should be created fresh.
- **Optional asynchronous support**: Some resources need async initialization, like loading a secret from a remote store. Bindings shouldn't need to know whether their dependencies are sync or async.
- **No global state**: Global registries and `reflect-metadata` make independent containers, such as one for production and one for tests, impossible, and cause conflicts between packages.
- **Type-based identity**: A library should tell two `string` values, like a database URL and password, apart in types, not by naming convention.
- **Immutable data structures**: Adding a binding should never mutate an existing module.
- **Dynamic runtime values**: Not every dependency is known at startup. Runtime values, like an HTTP request, should be injectable without rebuilding the container on every request.
- **Compile-time type safety**: Missing bindings, mismatched types and duplicate registrations should be impossible to express in TypeScript, not just caught at runtime.

## How Haywire is different

Haywire meets all of them. It encodes every dependency relationship in TypeScript's type system, so:

- Duplicate bindings are **a type error**.
- Missing dependencies are **a type error**.
- Injecting a nullable value into a non-nullable parameter is **a type error**.
- Passing the wrong id to `container.get()` is **a type error**.

When the code compiles, the container is guaranteed to work, barring problems outside it like bad credentials or network failures. The checks types can't do, like detecting circular dependencies, are done by `container.check()`, which is designed to be called in your test suite.

## How the checks work

Some checks are plain TypeScript, like `nullable()` only accepting a boolean. Others, like rejecting a duplicate binding, depend on everything added so far. Haywire tracks that in generics, and validates each call against it.

Where possible, the error says what is wrong. Adding a second binding for an id fails with:

```
Property 'error' is missing in type 'Binding<...>' but required in type
'{ error: "Error: an output is already bound. Use replaceBinding() on a module to swap it."; }'.
```

A few checks have no argument to attach a message to, like `identifier<unknown>()`. They add a parameter that only exists in types, which is an empty tuple when the call is valid, and an impossible value when it isn't, so the error is "Expected 1 arguments". A set that only accepts values it doesn't already have shows the idea:

```ts
// @errors: 2554
// A value that never exists, so callers can't pass it
declare const impossible: unique symbol;

type ValidateAdd<Values, T> = [T] extends [Values] ? [typeof impossible] : [];

class PickySet<Values = never> {
    add<T>(value: T, ...invalidInput: ValidateAdd<Values, T>): PickySet<Values | T> {
        return new PickySet<Values | T>();
    }
}

const set = new PickySet().add(1 as const).add(2 as const);

set.add(2 as const);
```

Casting to `any` or using `// @ts-expect-error` gets around these checks, but then there is no type safety to expect.

## Comparisons

- [InversifyJS](https://www.npmjs.com/package/inversify): Decorators (`@injectable`, `@inject`) plus `reflect-metadata`, with string, symbol or class identifiers. A missing binding is an error thrown when the container resolves it.
- [TSyringe](https://www.npmjs.com/package/tsyringe): Microsoft's decorator-based container. Also needs `reflect-metadata`, keeps a global root container by default, and resolves tokens at runtime.
- [TypeDI](https://www.npmjs.com/package/typedi): Decorator-based with a global container. Supports property injection, with the type-safety gaps described above.
- [NestJS](https://nestjs.com/): Its injector is decorator-based and tied to the framework's module system. Unresolvable dependencies surface as "Nest can't resolve dependencies" at startup.
- [Awilix](https://www.npmjs.com/package/awilix): No decorators, but dependencies are resolved by registration name at runtime, so a typo or missing registration is not a type error.

Haywire is the only one of these where a container that compiles is guaranteed to have every binding it needs.
