<div style="text-align:center">

# Why Haywire?

</div>

## The Problem

Dependency injection is a powerful pattern, but JavaScript DI libraries tend to let bugs escape to runtime — often at the worst moment.

Here are the failure modes that motivated Haywire:

### Missing registrations only blow up at runtime

You add a new dependency to `UserService`, forget to wire it, and everything compiles fine. Then:

```
Error: Cannot read properties of undefined (reading 'query')
    at UserService.getUserById (user-service.js:12)
```

The container silently provided `undefined` to a parameter that was never supposed to be optional. If your DI library doesn't validate completeness at build time, your test suite or your users will discover this for you.

### String and symbol keys don't scale

Most DI frameworks identify dependencies by string tokens or `Symbol`s:

```ts
container.bind('Logger').to(ConsoleLogger);
container.bind('Logger').to(FileLogger); // Oops — silently overwrites
container.get<Logger>('Logger');          // No type guarantee here
```

In a large codebase, you'll eventually have multiple things named `Logger`, `ApiClient`, or `Url`. Nothing stops you from injecting the wrong one.

### Decorators are a leaky abstraction

The most common JavaScript DI approach uses decorator-based injection:

```ts
@Injectable()
class UserService {
    @Inject(DATABASE_TOKEN)
    private database!: Database; // Marked non-optional, but never written in constructor
}
```

Problems with this:
- Requires `experimentalDecorators` and `reflect-metadata`, which is still a proposal
- Property injection marks fields as required in the type, but skips them at construction time — so you get a lie from TypeScript
- Private fields cannot be injected at all
- If your tsconfig changes, injection may silently stop working with no build error

### Null and undefined leak into consumers

When a binding can return `null` or `undefined`, consumers shouldn't receive it unless they explicitly opt in. But most frameworks don't track this at the type level, so you're left writing defensive code everywhere or hoping the provider never returns null.

---

## Why Existing Solutions Fall Short

There are several TypeScript DI libraries available. None satisfy all of the requirements below simultaneously:

- **Native JS support** — Decorator annotations are a common injection mechanism, but they require extra tooling and do not mutate the type of the decorated value, making true type safety impossible.
- **Constructor-only injection** — Property injection is type-unsafe (fields appear non-optional but are skipped during construction) and cannot target private fields.
- **Circular dependency support** — Circular dependencies are an antipattern, but sometimes unavoidable. A library should let you opt into them explicitly without silently deadlocking or infinitely recursing.
- **Singleton, Request, and Transient scopes** — Different resources have different lifecycle needs. A database client should be shared (singleton). A request context should be scoped to a single invocation. Everything else should be freshly created (transient).
- **Optional asynchronous support** — Some resources require async initialization (loading a secret from a remote store). Others are fully synchronous. Individual bindings should not need to know whether their dependencies are sync or async.
- **No global state** — Libraries that use `reflect-metadata` or global registries mutate shared state. This makes it impossible to have multiple independent containers (e.g. one for production, one for tests), and creates subtle conflicts between packages.
- **Type-based identity, not string-based** — Strings and symbols don't scale. A type-safe library should be able to distinguish between two `string`-typed values (e.g. `DATABASE_URL` vs `DATABASE_PASSWORD`) at the type level, without relying on naming conventions.
- **Immutable data structures** — Adding a binding should never mutate an existing module. Mutation leads to type-unsafe state and subtle shared-state bugs.
- **Dynamic runtime values** — Not every dependency is known at startup. A framework should support injecting runtime values (e.g. an HTTP `Request` object) without rebuilding the entire container on every request.
- **Compile-time type safety** — Invalid states — missing bindings, mismatched types, duplicate registrations — should be impossible to express in TypeScript, not just caught at runtime.

---

## How Haywire Is Different

Haywire checks every box above. It achieves type safety without decorators, without global state, and without runtime surprises by encoding dependency relationships entirely in TypeScript's type system.

- Duplicate bindings are **a type error**
- Missing dependencies are **a type error**
- Injecting a nullable value into a non-nullable parameter is **a type error**
- Passing the wrong identifier to `container.get()` is **a type error**

When the code compiles, the container is guaranteed to work (barring external runtime issues like bad credentials or network failures). The remaining runtime validation — circular dependency detection, sync supplier validation — is exposed via `container.check()`, which is designed to be called in your test suite.

The result: dependency injection that fails at build time, not in production.

