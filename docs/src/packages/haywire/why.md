---
description: The problems Haywire solves, its requirements, how its type checks work, and how it compares to alternatives.
---

# Why Haywire?

## The Problem

Most JavaScript DI libraries leave wiring mistakes to be found at runtime. These are the mistakes that motivated Haywire.

### Missing registrations are only found at runtime

Say you add a new dependency to `UserService`, forget to wire it, and everything still compiles. Then you see this:

```
Error: Cannot read properties of undefined (reading 'query')
    at UserService.getUserById (user-service.js:12)
```

The container passed `undefined` to a parameter that was never supposed to be optional, without any warning. If the DI library doesn't check that every dependency is bound at build time, the mistake is only found when the code runs, either in your test suite or by your users.

### String and symbol keys

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

In a large codebase you will eventually have several things named `Logger`, `ApiClient` or `Url`, and nothing stops you from injecting the wrong one.

### Decorators

The most common approach in JavaScript is injection with decorators:

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

This has a few problems:

- Most libraries require `experimentalDecorators` and `reflect-metadata`, which is still a proposal.
- Property injection types the field as always set, but the constructor never sets it, so TypeScript is wrong about it.
- Private fields can't be injected at all.
- If your tsconfig changes, injection may stop working without any build error.

### Null and undefined reaching consumers

When a binding can return `null` or `undefined`, its consumers shouldn't receive that value unless they opt in to it. Most frameworks don't track this in types, so you either write defensive checks everywhere or hope the provider never returns null.

## Requirements

Haywire was written to meet the requirements below. Each of the other TypeScript DI libraries misses at least one of them.

- A DI library should work in plain JavaScript. Decorators need extra tooling, and they don't change the type of what they decorate, so they can't be fully type-safe.
- It should only inject through constructors. Property injection is type-unsafe, and it can't set private fields.
- Circular dependencies should be supported. They are an antipattern, but sometimes they can't be avoided, so a library should let you opt into them explicitly rather than deadlocking or recursing forever.
- There should be singleton, request and transient scopes. A database client should be shared, a request context should be scoped to one invocation, and everything else should be created fresh.
- Async should be optional. Some resources need async initialization, like a secret loaded from a remote store, but a binding shouldn't need to know whether its dependencies are sync or async.
- It shouldn't use global state. Global registries and `reflect-metadata` make it impossible to have independent containers (such as one for production and one for tests), and cause conflicts between packages.
- Dependencies should be identified by type. Two `string` values, like a database URL and password, should be told apart by their types rather than by a naming convention.
- Its data structures should be immutable, so adding a binding never changes an existing module.
- Values that are only known at runtime should be injectable, like an HTTP request, without rebuilding the container for every request.
- Wiring should be checked at compile time. Missing bindings, mismatched types and duplicate registrations should be impossible to write in TypeScript, rather than only caught at runtime.

## Haywire's approach

Haywire encodes the relationships between dependencies in TypeScript's type system, without decorators or global state. Each of these is a type error:

- A duplicate binding.
- A missing dependency.
- A nullable value injected into a parameter that isn't nullable.
- The wrong id passed to `container.get()`.

So when the code compiles, the container has a binding for everything it needs, and it works apart from problems outside it like bad credentials or network failures. The checks that types can't do, like detecting circular dependencies, are done by `container.check()`, which is meant to be called in your test suite.

## How the checks work

Some checks are plain TypeScript, like `nullable()` only accepting a boolean. Others, like rejecting a duplicate binding, depend on everything added so far, so Haywire tracks that in generics and validates each call against it.

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

- [InversifyJS](https://www.npmjs.com/package/inversify) uses decorators (`@injectable`, `@inject`) and `reflect-metadata`, with string, symbol or class identifiers. A missing binding is an error thrown when the container resolves it.
- [TSyringe](https://www.npmjs.com/package/tsyringe) is Microsoft's decorator-based container. It also needs `reflect-metadata`, keeps a global root container by default, and resolves tokens at runtime.
- [TypeDI](https://www.npmjs.com/package/typedi) is decorator-based with a global container. It supports property injection, with the type-safety gaps described above.
- [NestJS](https://nestjs.com/)'s injector is decorator-based and tied to the framework's module system. A dependency it can't resolve is reported as "Nest can't resolve dependencies" at startup.
- [Awilix](https://www.npmjs.com/package/awilix) has no decorators, but resolves dependencies by registration name at runtime, so a typo or a missing registration is not a type error.
