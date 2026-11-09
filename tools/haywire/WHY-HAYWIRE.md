<div style="text-align:center">

# Why Haywire?

</div>

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

Most DI frameworks identify dependencies by string tokens or `Symbol`s:

```ts
container.bind('Logger').to(ConsoleLogger);
container.bind('Logger').to(FileLogger); // Oops — silently overwrites
container.get<Logger>('Logger');          // No type guarantee here
```

In a large codebase you will eventually have several things named `Logger`, `ApiClient` or `Url`, and nothing stops you from injecting the wrong one.

### Decorators

The most common approach in JavaScript is injection with decorators:

```ts
@Injectable()
class UserService {
    @Inject(DATABASE_TOKEN)
    private database!: Database; // Marked non-optional, but never written in constructor
}
```

This has a few problems:

- It requires `experimentalDecorators` and `reflect-metadata`, which is still a proposal.
- Property injection types the field as always set, but the constructor never sets it, so TypeScript is wrong about it.
- Private fields can't be injected at all.
- If your tsconfig changes, injection may stop working without any build error.

### Null and undefined reaching consumers

When a binding can return `null` or `undefined`, its consumers shouldn't receive that value unless they opt in to it. Most frameworks don't track this in types, so you either write defensive checks everywhere or hope the provider never returns null.

---

## Requirements

Haywire was written to meet the requirements below. Each of the other TypeScript DI libraries misses at least one of them.

- A DI library should work in plain JavaScript. Decorators are a common way to mark injections, but they need extra tooling, and they don't change the type of what they decorate, so they can't be fully type-safe.
- It should only inject through constructors. Property injection is type-unsafe (fields look non-optional but are skipped during construction), and it can't set private fields.
- Circular dependencies should be supported. They are an antipattern, but sometimes they can't be avoided, so a library should let you opt into them explicitly rather than deadlocking or recursing forever.
- There should be singleton, request and transient scopes, since different resources need different lifecycles. A database client should be shared (singleton), a request context should be scoped to a single invocation (request), and everything else should be created fresh (transient).
- Async should be optional. Some resources need async initialization, like a secret loaded from a remote store, while others are fully synchronous. A binding shouldn't need to know whether its dependencies are sync or async.
- It shouldn't use global state. Libraries that use `reflect-metadata` or a global registry change shared state. That makes it impossible to have several independent containers (say one for production and one for tests), and can cause conflicts between packages.
- Dependencies should be identified by type rather than by string. Strings and symbols don't scale. A type-safe library should be able to tell two `string` values (like `DATABASE_URL` and `DATABASE_PASSWORD`) apart by their types, without relying on naming conventions.
- Its data structures should be immutable. Adding a binding shouldn't change an existing module, because changing it makes its type unsafe and causes bugs wherever else the module is used.
- Values that are only known at runtime should be injectable (like an HTTP `Request` object) without rebuilding the whole container for every request.
- Wiring should be checked at compile time. Missing bindings, mismatched types and duplicate registrations should be impossible to write in TypeScript, rather than only caught at runtime.

---

## Haywire's approach

Haywire gets type safety without decorators or global state by encoding the relationships between dependencies entirely in TypeScript's type system. Each of these is a type error:

- A duplicate binding.
- A missing dependency.
- A nullable value injected into a parameter that isn't nullable.
- The wrong id passed to `container.get()`.

So when the code compiles, the container has a binding for everything it needs, and it works apart from problems outside it like bad credentials or network failures. The checks that types can't do, like detecting circular dependencies and validating sync suppliers, are done by `container.check()`, which is meant to be called in your test suite.

---

## Comparisons

- [InversifyJS](https://www.npmjs.com/package/inversify) uses decorators (`@injectable`, `@inject`) and `reflect-metadata`, with string, symbol or class identifiers. A missing binding is an error thrown when the container resolves it.
- [TSyringe](https://www.npmjs.com/package/tsyringe) is Microsoft's decorator-based container. It also needs `reflect-metadata`, keeps a global root container by default, and resolves tokens at runtime.
- [TypeDI](https://www.npmjs.com/package/typedi) is decorator-based with a global container. It supports property injection, with the type-safety gaps described above.
- [NestJS](https://nestjs.com/)'s injector is decorator-based and tied to the framework's module system. A dependency it can't resolve is reported as "Nest can't resolve dependencies" at startup.
- [Awilix](https://www.npmjs.com/package/awilix) has no decorators, but resolves dependencies by registration name at runtime, so a typo or a missing registration is not a type error.
