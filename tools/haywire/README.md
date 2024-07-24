<div style="text-align:center">

# haywire
A fully type-safe dependency injection library using native javascript.

[![npm package](https://badge.fury.io/js/hayire.svg)](https://www.npmjs.com/package/hayire)
[![License](https://img.shields.io/npm/l/hayire.svg)](https://github.com/JacobLey/leyman/blob/main/tools/hayire/LICENSE)
[![Quality](https://img.shields.io/npms-io/quality-score/hayire.svg)](https://github.com/JacobLey/leyman/blob/main/tools/hayire)

</div>

## Table of Contents

* [Introduction](#introduction)
* [Installation](#installation)
* [Example](#example)
* [Concepts](#concepts)
    * [Type tracking](#type-tracking)
    * [Binding an implementation to an id](#binding-an-implementation-to-an-id)
    * [Supplying a value](#supplying-a-value)
    * [Circular dependencies](#circular-dependencies)
    * [Collecting bindings in modules](#collecting-bindings-in-modules)
    * [Requesting instances from a container](#requesting-instances-from-a-container)
    * [Combining containers with dynamic runtime values](#combining-containers-with-dynamic-runtime-values)
    * [Scope Gotchas](#scope-gotchas)
    * [Validation using types](#validation-using-types)
    * [Typescript configuration](#typescript-configuration)
    * [Generics on classes and methods](#generics-on-classes-and-methods)
* [API](#api)
    * [Methods](#methods)
        * [identifier](#identifier)
        * [bind](#bind)
        * [createModule](#createmodule)
        * [createContainer](#createcontainer)
        * [isSyncContainer](#issynccontainer)
        * [createFactory](#createfactory)
    * [Classes](#classes)
        * [HaywireId](#haywireid)
        * [Binding](#binding)
        * [Module](#module)
        * [AsyncContainer](#asynccontainer)
        * [SyncContainer](#synccontainer)
        * [Factory](#factory)
    * [Types](#types)
        * [HaywireIdType](#haywireidtype)
        * [AsyncSupplier](#asyncsupplier)
        * [Supplier](#supplier)
        * [LateBinding](#latebinding)
    * [Errors](#errors)
        * [HaywireError](#haywireerror)
        * [HaywireModuleValidationError](#haywiremodulevalidationerror)
        * [HaywireContainerValidationError](#haywirecontainervalidationerror)
        * [HaywireInstanceValidationError](#haywireinstancevalidationerror)

## Introduction

Dependency injection is an incredibly powerful tool to implement inversion of control. It simplifies logic and produces more modular code that is easily testable.

Unfortunately, Javascript as a language lacks a DI framework on the level of quality of other langages, such as [Dagger] for Java.

There are some existing solutions, but none satisfy all of the following requirements:

* Native JS support
  * Decorators (Annotations in other languages) are a common way to annotate injections. There is a [proposal](https://github.com/tc39/proposal-decorators) but until that merges, will require additional tooling to transpile typescript. Until then, it is required to not depend on annotations. Furthermore decorators do not mutate the type of the value being decorated, so it can be tricky to write type-safe injection.
* Constructor only injection
  * An alternative is property injection. This is both type unsafe (fields are marked as non-optional, but not written during constructor) and does not support private fields.
* Circular dependencies
  * In general circular dependencies are an antipattern, but the reality is that it is not always possible. Being able to opt into circular depdencies (while maintaining all other requirements) is occasionally a necessity.
* Singleton, Request, and Transient scopes
  * It is important that some values are shared across resources, like a database client (singleton). Sometimes values need to be shared for the particular instantiation like a context object (request). Everything else should be created as requested (transient).
* Optional asynchronous support
  * Some resources _need_ be asynchronous, like a secret loaded from an external store. Other resources can be synchronous, like loading a local environment variable or constructing a class.
  * Individual bindings should not concern themselves with how other dependencies are loaded, and should be able to synchronously supply values that internally depend on asynchronous values.
* No global state or types
  * Mutating global state or overloading namespaces is not type safe. It mutates every other library that may be using dependency injection. It also makes it impossible to create more than one injector in an app (e.g. one for production, and one for local testing).
* Identify dependencies by their types, not names
  * Types do not exist at runtime in Javascript. Therefore most implementations rely on strings to identify on dependencies. In larger applications though, how many different instances can be named something like `Logger`, `EndpointUrl`, `ApiClient`, and `UserService`?
* Immutable data structures
  * When adding new bindings or editing ids, it is crucial that the original data structure is unchanged. Otherwise the data becomes type-unsafe and has unintended side effects.
* Ability to dynamically create containers based on runtime values
  * Most DI frameworks are used to wire an entire app at the start, and are not used to generate values much beyond that. What if we wanted to declare a dependency on a `Request` object from an incoming request? Or on a `User` object loaded from our database?
* Type safety
  * Last but absolutely not least. Type safety is about making invalid states impossible. Therefore it should be impossible to request or inject invalid data, and issues should be raised at build time. When the code runs, there should be a 100% guarantee of success (barring runtime issues like bad permissions).

Haywire is a solution that checks every box above.

## Installation

`npm i haywire`

Haywire is an ESM package. It _must_ be imported.

The type safety of haywire is a primary benefit, but does not require typescript or any further build step to support.

## Example

Below is an example service that wires up a database implementation to a user service.
It includes a logging implementation and safe references to environment variables.

Note the actual pattern of where to define `identifier`s and `bind`ings is just an example, and may be customized as you wish.

```ts
// types.ts
import { identifier } from 'haywire';

interface ILogger {
    info(message: string): void;
}
export const loggerId = identifier<ILogger>();

export interface IDatabase {
    getRowById<T>(table: string, id: number): T;
}
export const databaseId = identifier<IDatabase>();

export const dbUrlId = identifier<string>().named('dbUrl');
export const dbPasswordId = identifier<string>().named('dbPassword');
```

```ts
// logger.ts
import { bind, singletonScope } from 'haywire';

import { type ILogger, loggerId } from './types.js';

class Logger implements ILogger {
    info(message: string): void {
        console.log(message);
    }
}

export const loggerBinding = bind(loggerId)
    // Skip declaring dependencies if none exist
    .withGenerator(() => new Logger())
    // Ensure a single value is shared across all resources
    .scoped(singletonScope);
```

```ts
// env.ts
import { bind } from 'haywire';

import { dbUrlId, dbPasswordId } from './types.js';

export const urlBinding = bind(dbUrlId)
    // Provide singletong off the bat
    .withInstance(process.env.DATABASE_URL!);

export const passwordBinding = bind(dbPasswordId)
    // If env val does not exist at runtime, will throw an error
    // (unless binding/id is marked undefinable)
    // so guaranteed undefined will not leak to other resources
    .withInstance(process.env.DATABASE_PASSWORD!);
```

```ts
// database.ts
import { bind } from 'haywire';

import { dbUrlId, dbPasswordId, IDatabase, ILogger, loggerId } from './types.js';

export class Database implements IDatabase {

    private postgres: FakePostgresClient;

    constructor(private logger: ILogger, url: string, password: string) {
        this.postgres = new Postgres(url, password);
    }

    getRowById<T>(table: string, id: number): T {
        this.logger.info(`Loading ${id} from ${table}`);
        return this.postgres.query(`SELECT * FROM ${table} WHERE id = ${id}`);
    }
}

export const databaseBinding = bind(databaseId)
    .withDependencies([loggerId, dbUrlId, dbPasswordId])
    // Fully type safe! `url` below is a `string`
    .withProvider((logger, url, password) => new Database(logger, url, password));
```

```ts
// user-service.ts
import { bind } from 'haywire';

import { databaseId, loggerId} from './types.js';

export class UserService {

    constructor(private database: IDatabase, private logger?: ILogger) {}

    getUserById(id: number): User {
        const user = this.database.getRowById<User>(id);
        this.logger?.info(`Received user ${JSON.stringify(user)}`);
        return user;
    }
}

// If binding to a class directly (not an interface) you don't _have_ to use an identifier
export const userServiceBinding = bind(UserService)
    .withProvider((database: IDatabase, logger?: ILogger) => new UserService(database, logger))
    // Also type safe! Providing ids for other types will result in an error.
    // loggerId can be `undefinable` because implementation allow value to be missing
    .withDependencies([databaseId, loggerId.undefinable()]);
```

```ts
// index.ts
import { createContainer, createModule, identifier } from 'haywire';

import { loggerBinding } from './logger.js';
import { urlBinding, passwordBinding } from './env.js';
import { Database, databaseBiding } from './database.js';
import { UserService, userServiceBinding } from './user-service.js';

const module = createModule(loggerBinding)
    // Order does not matter
    .addBinding(databaseBindining)
    // If any binding is added that is:
    // > a duplicate
    // > requires a stricter (e.g. non-null) version of a declared binding
    // > Is a laxer (e.g. null) version of a declared dependency
    // Then typescript will fail to build!
    .addBinding(userServiceBinding);

// Error! We forgot to add the environment bindings.
createContainer(module);

const envModule = createModule(urlBinding).addBinding(passwordBinding);

// Success!
const container = createContainer(module.mergeModule(envModule));

const userService = container.get(UserService);
// Does the same thing!
container.get(identifier(UserService));

// Error (both in typescript and javascript)
// Because no binding was ever declared (we declared IDatabase)
container.get(Database);
```

## Concepts

### Type tracking

Types do not exist in Javascript, so we can't pass references to a type like we would in a strongly typed language.

However, we can pass classes around, and we can create a type "identifer" that will contain all necessary type identifer data.

When dealing with classes (such as the `UserService` above) we can simply pass the class directly to methods like `bind` and `get`.

But sometimes we need a little extra data around a type, such as the fact that it can be `null`. Or maybe the class is too "generic" like a `Map` and needs some extra qualifiers.

This is where the `identifer()` method comes into play. It is the most basic building block of our dependency injection.

`identifier` takes the class as the only parameter to the method. The resulting typed `HaywireId` is interchangable with the class in all APIs.

This `HaywireId` class has the extra perks of methods like `.nullable()` to indicate allowed values of `UserService | null`. We can also attach a name to the class to distinguish it from potential other implementations that are in use. `id.named('userService')`. A named id is _not_ interchangable with a non-named, or other named id. If you aren't feeling particularly clever about naming, you can guarantee uniqueness of your implementation using symbols:

```ts
const sym = Symbol();
const namedId = identifier(UserService).named(sym);
```

Just like everything else, this is 100% type safe! It is enforced that the symbol is "unique", and usages of a different unique symbol will result in different ids.

Sometimes we want to inject values that don't map directly to a class. Most likely because we are coding to an interface, or are dealing with combinations of types.

`identifer` can also be used parameter-less, passing the type as generic type parameter instead!


** **NOTE!!** ** This is the one place where Haywire is potentially type unsafe. Since types and generics do not exist at runtime, haywire has no way of knowing if an id has been instantiated before. Therefore it is _critical_ to only have a single instance of an id for a given type.

```ts
const userServiceId = identifer(UserService);
// true (and type safe!) because we can cache the id for this class
userServiceId === identifer(UserService);

// false (and type safe!) because we know only one has a constructor
userServiceId === identifer<UserService>();

const numberId = identifier<number>();
// false (and not type safe!) so haywire will not be able to distinguish between the two at build time
numberId === identifier<number>();
```

See the full api for `HaywireId` below. 

### Binding an implementation to an id

Now that we have our types declared in haywire, we need to tell Haywire how to construct a type. While there are a couple ways to write a binding, the information that is necessary is:

* What dependencies does this binding have?
* Can the instance be constructed synchronously?
* How often (and when) should this value be constructed?
* Is it acceptable to return `null`/`undefined`?
* How to generate the type?

Haywire cannot implicitly reference a constructor, nor will it infer how to bind interfaces to implementations. Haywire requires explicit instruction, but there are some shorthands to support instantiation.

All bindings begin with the `bind()` method. From there it expects both a provider and dependencies. The order in which you provide them is not enforced, and have competing benefits. If an instance has no dependencies, you can declare either an empty array, or a "generator" instead.

The parameters to the provider line up with order that dependencies are provided.

See below for examples of when/how to approach different binding patterns.

```ts
// Provider before dependencies.
export const userServiceBinding = bind(UserService)
    .withProvider((database: IDatabase, logger?: ILogger) => new UserService(database, logger))
    // `withDependencies` will be type checked, and will create a build failure if the provided id does not satisfy requirements
    .withDependencies([
        // Type error! Cannot be null
        databaseId.nullable(), 
        loggerId.undefinable(),
        // Type error! No matching parameter in provider
        dbUrlId,
    ]);


// Provider before dependencies:
export const userServiceBinding = bind(UserService)
    // If the id is backed by a class, we can just use the constructor without explicitly writing it out!
    .withConstructorProvider()
    // `withDependencies` will be type checked, and will create a build failure if the provided id does not satisfy requirements, such as if a third id was adda
    .withDependencies([
        // Type error! Cannot be null
        databaseId.nullable(), 
        loggerId.undefinable(),
        // Type error! No matching parameter in provider
        dbUrlId,
    ]);

// Dependencies before provider:
export const databaseBinding = bind(databaseId)
    .withDependencies([
        loggerId, 
        dbUrlId, 
        dbPasswordId,
        // Allowed to declare extra dependencies
        fooId,
    ])
    .withProvider((
        logger, 
        // Error! url is known to be a string
        url: number, 
        password
    ) => new Database(logger, url, password));

// Using a generator:
export const loggerBinding = bind(loggerId)
    // Implicitly skip specifying an empty dependency list
    // and tells the binding that it will need to be asynchronously invoked
    .withAsyncGenerator(async () => new Logger());

// Passing an instance directly:
export const urlBinding = bind(dbUrlId)
    // Error! Value is string | null but id expects string
    .withInstance(process.env.DATABASE_URL);
```

Once a binding has been created, it may be modified further. Note that like everything else in haywire, binding methods return a _new_ instance, and will always leave the existing instance unchanged.

A common use case is attaching a scope to a binding. Scopes tell Haywire when and how often to construct and instance.

In the [Example](#example) above, we scoped the logger as a singleton, meaning it will only ever be created once and every dependent on logger will receive the same instance.

```ts
const scopedloggerBinding = loggerBinding.scoped(singletonScope);
```

Note that singletons are not _globally_ singular, and just singular for a given container.

Scopes can also be "optimistic". This means that containers will _immediately_ attempt to construct this instance when a dependent is requested. Usually this is unnecessary but has two main advantage:
1. Optimistic bindings can instantiate async providers, then `supply` them _synchronously_ to dependents.
2. Expensive/slow operations can be pushed towards the start of processing, so that they are available earlier and will not block future requests.

```ts
class A {}
class B {
    constructor(private readonly a: A) {}
}
class C {
    constructor(private readonly bSupplier: () => B)
}

// A is instantiated _asynchronously_
// Perhaps it contains data from a remote network call
const aBinding = bind(A).withAsyncGenerator(async () => new A());
const bBinding = bind(B).withDependencies([A]).withProvider(a => new B(a));

const cBinding = bind(C).withDependencies([identifier(B).supplier({ sync: true, propagateScope: true })]).withProvider(bSupplier => new C(bSupplier));

// What the resulting container code looks like:
const c = cProvider(() => {
    // Invalid! A needs to be async
    const a = aProvider();
    return bProvider(a);
});
```

In the example above, combining these bindings into a module/container will not work as expected. `C` expects a method that _synchronously_ generates a new `B` every time. But `B` is dependent on `A` which is constructed _asynchronously_, which is impossible.

But if `A`'s binding were "optimistic", then `C` can generate `A` ahead of time!

```ts
import { optimisticRequestScope } from 'haywire';

const optimisticABinding = aBinding.scoped(optimisticRequestScope);

// What the resulting container code now looks like:
const optimisticA = await aProvider();
// Success! Full synchronous support
const c = cProvider(() => bProvider(a));
```

You will see we also introduced a new type of scope "requestScope".

This is a middle ground between singletons (one for the entire container) and the default transient scope (new value for every dependent).

Every call to `container.get()` is a new "request". Any calls to a supplier are _also_ new requests, _unless_ the identifier is marked as propagating scope (as it is above).

A request scope means a single value is created and shared for all values instantiated during that request. On a separate future request, a new value will be instantiated.

Scope options are:
* `transientScope`
  * This is the simplest, and the default. If X is transient and a binding declares it as a dependency, it is create a new X. If there is more than one dependent, both will receive unique instances. There is no "optimistic" version.
* `singletonScope`
  * A single value is created the first time it is requested. All future requests and dependencies will receive this same value.
* `optimisticSingletonScope`
  * Similar behavior as `singletonScope`, except this value is instantiated immediately during the "preload" stage.
* `requestScope`
  * A single value is created the first time it is requested for a single call to `container.get()`. All future dependencies will share this same value. Future requests will reinstantiate a new value.
* `optimisticReqeustScope`
  * Similar behavior as `requestScope`, expect this value is instantiated at the very beginning of a request before any other values.
* `supplierScope`
  * Similar to `requestScope`, but "opts out" of propagated scope from a supplier (if the current reqeust is inside a supplier). This is an uncommonly used scope for ensuring a new value is used every request including suppliers, but still can take advantage of caching. All dependencies on this binding will also be opted out of the parent request's scope.

### Supplying a value

In the [binding](#binding-an-implementation-to-an-id) section above, we introduced the concept that dependencies aren't only the literal type, but perhaps a function that instantiates these dependencies on-demand.

Naively, we could just type an id to be a method that returns out desired value:

```ts
const randomId = identifier<() => string>();

bind(randomId).toGenerator(() => {
    return () => {
        const rand = Math.random();
        return rand.toString(36).slice(2);
    };
});

class IdMiddleware {

    constructor(private readonly randomSupplier: () => string) {}
    
    attachId(req: Request) {
        req.id = randomSupplier();
    }
}
bind(IdMiddleware).withDependencies([randomId]).withConstructorProvider();
```

There a few problems with this though:
1. It makes it hard to downstream consumers to specify a dependency on the output of the method itself (`string` instead of `() => string`).
2. What if our "randomId" required dependencies of its own, such as a seed? In the implementation above, the inputs would be frozen when the method is generated, rather than dynamically refetching every time.

The solution is suppliers!

A supplier is declared on the identifier using the `.supplier()` annotation. This will update the type of the id from `T` to `() => T`. Don't worry, like all things Haywire this is type-safe, and won't interfere with other ids matching `() => T` (without the supplier annotation).

```ts
const randomId = identifier<string>();
const seedId = identifier<number>();

bind(randomId)
    .withProvider(seed => {
        const rand = Math.random() + seed;
        return rand.toString(36).slice(2);
    })
    .withDependencies([seedId]);

bind(IdMiddleware)
    .withDependencies([randomId.supplier()])
    .withConstructorProvider();
```

Supplier can take 5 forms, indicated by the parameters passed to `supplier()`.

| parameter | resulting type | shorthand | description |
|-----------|----------------|-----------|-------------|
| `{ sync: true, propagateScope: false }` | `() => T` | `true`, or even omitting all parameters. | A synchronous method which effectively acts like a new call to `container.get()` every time it is invoked. |
| `{ sync: false, propagateScope: false }` | `() => Promise<T>` | `'async'` | An asynchronous method which effectively acts like a new call to `container.getAsync()` every time it is invoked. |
| `{ sync: true, propagateScope: true }` | `() => T` | ❌ | A synchronous method which will _retain_ the current reqeust scope when instantiating more values. |
| `{ sync: false, propagateScope: true }` | `() => Promise<T>` | ❌ | An asynchronous method which will _retain_ the current reqeust scope when instantiating more values. |
| `false` | `T` | `false` | "Reverts" a supplier id back to a non-supplier |

Synchronous suppliers are usually ideal for developer experience, as they are simpler than promises. However that means the underlying bindings _must_ be able to instantiate every related dependency synchronously. See the above [bindings](#binding-an-implementation-to-an-id) section for discussion about "optimistic" scopes to work around internal async dependencies. Similarly see the `supplierScope` scope if you _need_ to opt out of 

Even if a container is flagged as async, it is possible to create synchronous suppliers internally.

** **NOTE!!** ** Current Haywire containers do not have a way to tell at build time (with type checking) whether the supplier will be able to successfully create a synchronous supplier.

When in doubt, rely on asynchrounous suppliers (which are fully type checked). It is also recommended to expose your container to unit tests and run `container.check()` to have it internally detect any possible issues during test time.

### Circular dependencies

In an ideal world, our dependencies map out linearly. A depends on B, B depends on C, and C depends on nothing so we can create that first.

Sometimes we end up with a literal chicken and egg problem. In order to create a chicken we need an egg, in order to create an egg we need a chicken.

A naive solution will either infinitely try create chickens and eggs until dependencies are settled, or will deadlock on either being created first. Haywire at least will discover this type of issues during `container.check()` and will prevent usage of container until the circular dependency is resolved.

** **NOTE!!** ** Haywire is not able to detect cicular dependencies at build time (using types). Similar to suppliers, it is recommended to expose your container to unit tests and run `container.check()` to enforce no circular dependencies exist.

Instead of expecting both the chicken and the egg to be synchronously available, we can instead perform "late binding" of one (or both...). This means accepting a `Promise` of the dependency rather than its actual value.

Similar to suppliers, we can indicate a late-binding dependency by marking the identifer as `.lateBinding()`. Don't worry, like all things Haywire, this is type safe and will not interfere with other identifiers that might declare a promise returning a similar type.

```ts
class Chicken {
    constructor(private readonly Egg) {}
}
class Egg {
    chicken?: Chicken
    constructor(chickenProm: Promise<Chicken>) {
        chickProm.then(chicken => {
            this.chicken = chicken;
        })
    }
}

const chickenBinding = bind(Chicken).withDependencies([Egg]).withConstructorProvider();
const eggBinding = bind(Egg).withDependencies([identifier(Chicken).lateBinding()]).withConstructorProvider();
```

Late bindings can be mixed with suppliers, and enjoy the benefits of both. In this case, it will be a promise that resolves to a supplier.

** **NOTE!!** ** The promise passed to provider _will not_ resolve before the provider returns. You should _never_ block the provider on the result of a late-bound promise. This will end up blocking the promise resolution infinitely. Since this issue is in provider implementation, it is not possible for Haywire to detect these kinds of issues at either build or execution time.

```ts
const eggBinding = bind(Egg).withDependencies([identifier(Chicken).lateBinding()]).withAsyncProvider(async chickenPromise => {
    // This will never move forward!
    const chicken = await chickenPromise;
    return new Egg(chicken);
});
```

The promise passed to the provider _will_ resolve before the request returns to the caller. However it is recommended to not expect all promises to be fully resolved at this point, since the actual callback execution of chained `.then()`s is not guaranteed to have finished by then, especially for synchronous requests.

An oversimplified look at how the container handles late binding internally:
```ts
import { defer } from 'p-defer';

// Synchronous requests are still supported
const getChicken = () => {

    const deferredChickenPromise = defer();
    // The chicken hasn't even begun to be created by the time Egg is created
    const egg = new Egg(deferredChickenPromise.promise);
    const chicken = new Chicken(egg);

    // Promise is resolved _before_ returning
    deferredChickenPromise.resolve(chicken);

    return chicken;
};
```

### Collecting bindings in modules

Bindings are the way to tell Haywire how to instantiate a single instance based on its dependencies. Similarly we can define a binding for every dependency.

However bindings by themselves are meaningless, bindings do not mutate any sort of global state and two bindings are completely unrelated by default. In fact you can bind a single identifer to multiple different providers depending on your context (e.g. targeting a local DB client when testing instead of your production client).

So in order to collect a set of bindings into a full implementation of all your resources, we use Modules.

You can turn a single binding into a Module using `createModule(<binding>)`. This method is an alias for `Module.fromBinding`, so use whichever you prefer.

You can continue to attach bindings to the module with `module.addBinding`. Like all things Haywire, this is type safe! So attaching a binding is an immutable operation, it does not mutate the existing module, but instead return a _new_ module with updated types.

You can also attach an entire other module! `module.mergeModule(otherModule)` will return a new module that is a combination of both. The order that bindings and modules are combined does not matter.

It is important that one-and-only-one binding is declared for every dependency, so Haywire enforces this with both type safety and runtime enforcement!

```ts
import { createModule } from '';

class A { a = 1 }
class B { b = 2 }
class C { c = 3 } 

const aBinding = bind(A).withDependencies([B, C]).withConstructorProvider();
const bBinding = bind(B).withDependencies([C]).withConstructorProvider();
const cBinding = bind(C).withConstructorGenerator();

const abModule = createModule(aBinding).addBinding(bBinding);

// Success
let abcModule = abModule.addBinding(cBinding);

// Type error! `A` binding is duplicate. Will also throw at runtime
abModule.addBinding(aBinding);

const cModule = createModule(cBinding);

// Also success!
abcModule = abModule.mergeModule(cModule);

const bcModule = createModule(bBinding).addBinding(cBinding);

// Type error! `B` binding is duplicate. Will also throw at runtime
abModule.mergeModule(cbModule);
```

Similarly to the enforcement that bindings are unique, there is enforcement that the collected module has outputs that successfully satisfy all dependencies. Note these enforcement are _only_ at build time. The equivalent runtime checks are enforced during the later `container.check()` stage.

If you declare a binding that returns a nullable value, Haywire will enforce that any and all dependencies on that type support null.

Similarly introducing dependencies that require a stricter version of existing outputs, is also an error.

```ts
const aModule = createModule(
    bind(A).withDependencies([
        identifer(B).nullable(), 
        identifer(C).undefinable()
    ]).withConstructorProvider()
);
const bModule = createModule(
    bind(B).withDependencies([C]).withConstructorProvider()
);
const cBinding = createModule(
    bind(C).withGenerator(() => new C).undefinable()
);

// Allowed, A requires B | null and we have connected B.
aModule.mergeModule(bModule);

// Allowed, A requires C | undefined and we have connected C | undefined.
aModule.mergeModule(cModule);

// Error! B requires C, but we have connected C | undefined.
bModule.mergeModule(cModule);
// Same error, still enforced regardless of order
cModule.mergeModule(BModule);
```

### Requesting instances from a container

So far we have:
* Defined the type with identifiers
* Bind providers based on dependencies
* Collected these bindings in a Module

A module by itself is not guaranteed to be a complete set of bindings, and may be missing some bindings. This is a feature, as it allows you to mix and match partial modules at will, such as an `envModule`, a `databaseModule`, and a `servicesModule` which have inter-related dependencies.

Once we do have a full set of dependencies, and have told Haywire how to create every type we will need, we can create a container!

The `createContainer(<module>)` API will return a container that is capable of instantiating resources on request. Yet again, this is type safe! If you try to pass a module that does not have every dependency satisfied, it will result in a type error!

```ts
import { bind, createContainer, createModule } from 'haywire';

// Error! No binding for B is found.
createContainer(
    createModule(
        bind(A).withDependencies([B]).withConstructorProvider()
    )
);
```

The container is the final goal of Haywire, and exposes an API to finally instantiate the types and bindings you defined earlier.

There are two types of Containers: 
* `AsyncContainer`
  * The default, which only supports instantiating values asynchronously `container.getAsync(<identifier>)`
* `SyncContainer`
  * Only created if _every_ binding in the module is synchronous. Supports the full async API for consistency, but also a `container.get(<identifier>)` which synchronously instantiates a value.

If you _need_ synchronous access, but have promises internally you have two options:
1. Use synchronous suppliers internally to take advantage of cached optimistic promises.
2. Provide promises instead of literal values. This is different than a latebinding promise though, and can quickly become unwieldy.

The container lifecylce happens in 4 stages. They may be explicitly activated or skipped, and internally any previous steps will be executed (and cached).

1. Checking: `container.check()`
    * Confirms the bindings from the module are complete and satisfy eachother.
    * This both reenforces any type checking that has been performed earlier, as well as additional checks like detecting circular dependencies and synchronous suppliers that have to be async.
    * It is highly recommended to expose this container to your test suite and call the check method to make sure the container will work at runtime.
2. Wiring: `container.wire()`
    * Links up bindings to their dependencies bindings. Ensures that later requests to the container execute with high performance.
    * Includes logic such as linking bindings to their internal optimistic dependencies which need to before they are actually requested.
    * Safe to also run in tests, but shouldn't any additional validations.
    * Recommended to run during startup, to perform any expensive compute ahead of time.
3. Preloading: `container.preloadAsync()` or `container.preload()` (SyncContainer only)
    * Initializes all optimistic singletons in the container.
    * The "request" to initialize is always unique to normal `.get()` requests, even if this step is invoked as part of a `get()`.
    * Unsafe to run at test time, since it instantiates real instances.
    * Recommended to run during startup, to perform any expensive compute ahead of time.
4. Instantiation: `container.getAsync(<identifer>)` or `container.get(<identifer>)` (SyncContainer only)
    * Initializes the requested value, respecting all dependencies, scopes, and bindings that have been declared up until this point.
    * Like other APIs, accepts both an identifier or a class.
    * Type checking enforces that the requested value is bound in the container. Requesting a non-declared identifier, or a value that is stricter than the binding (e.g. requesting `T` when binding is for `T | null`) will both raise a type failure and throw an error.

### Combining containers with dynamic runtime values

Creating a container directly from a module means that it is expected that every value is known or instantiatable at startup time. This is _usually_ the case, and can be considered the default way to use Haywire.

What if we wanted to inject values that aren't known until later though? Such as a `Request` object from an incoming request, or the corresponding `User` object from the authorization middleware?

Using normal modules and containers, we would need to create, check, wire, and preload a new container for every request, which is much more expensive than it should be.

What if we could check and wire an incomplete container, then register the last few implementations at runtime? We can use `Factory`s for this!

Instead of converting a module to a container, we can instead convert it to a factory. Unlike containers, there is no check to enforce that the dependencies are all satisfied by outputs yet. Then we can register implementations of the remaining identifiers, and once we have provided them all, turn the factory into a normal container for further usage using the same `createContainer` API. 

Like everything else in Haywire, `Factory`s are immutable and type safe, so adding a binding returns a _new_ `Factory` with updated typing. Attempting to attach a implementation that already exists or does not satisfy the dependency requirements will result in both type and runtime errors.

```ts
import { bind, createContainer, createFactory, identifier } from 'haywire';
import express from 'express';

const reqId = identifier<express.Request>();
const resId = identifier<express.Response>();

const factory = createFactory(
    createModule(
        bind(A).withDependencies([reqId, resId])
    )
);

// Same as `container.check()`. Safe (and recommended) to run during unit tests
factory.check();
// Also same as `container.wire()`
factory.wire();

express().get((req, res) => {

    // Error! We haven't registered all required depdendencies.
    factory.toContainer();

    // Error! We reqire a non-null version.
    factory.register(reqId.nullable(), req);

    const registeredFactory = factory
        .register(reqId, req)
        .register(resId, res);

    // Error! We already registered this value
    registeredFactory.register(reqId, req);

    // Allowed to add new ids, even if not previously a dependency.
    registeredFactory.register(B, new B());

    // This is a _unique_ container (unique singletons) for every request. But it inherits the existing checks + wiring, so it is initialized much faster!
    const container = registeredFactory.toContainer();
    const a = container.get(A);
});
```

Factories can only be provided with instances, you cannot define a new provider or dependencies at this stage.

### Scope Gotchas

Most scopes work as expected. Requesting a transient dependency results in a new value for every dependency. Requesting a singleton will share the same value across every request.

What if there is a dependency on a binding that is a singleton, which itself has a dependency on a request-scoped value?

The initial request that generates the singleton will have it's dependency shared with others in the same request, but will not in the future. To demonstrate:

```ts
import { bind, createModule, requestScope, singletonScope } from 'haywire';

class A {
    constructor(public b: B, public c: C) {}
}
class B {
    constructor(public c: C) {}
}
class C {
    constructor() {}
}

const aBinding = bind(A).withConstructorProvider().withDependencies([B, C]);
const bBinding = bind(B).withConstructorProvider().withDependencie([C]).scoped(singletonScope);
const cBinding = bind(C).withConstructorGenerator().scoped(requestScope);

const container = createModule(aBinding).addBinding(bBinding).addBinding(cBinding);

const a1 = container.get(A);
a1.b.c === a1.c // true! `b` was created this request and `c` was shared between dependencies

const a2 = container.get(A);
a2.b.c === a2.c // false! `b` is an older value, and therefore has an older version of `c`

a1.c === a2.b.c; // true
```

In practice this shouldn't cause issues, but this may be a reason to use the `optimisticSingleton` scopes. That will ensure all values are created in a different "request" than the current one.

It is also not recommended to depend on your dependency's dependencies. So hopefully this is not much of an issue in the first place.

This issue is not unique to Haywire, and could potentially happen with any dependency injection library that supports singleton and request scoping.

### Validation using types

Many of the Haywire APIs enforce valid state both at build time and during runtime. Runtime validations are done via traditional errors being thrown when requested.

Errors are nasty though, and we prefer to catch errors at build time before we even have a chance to run our broken code!

A lot of type validation is done using classic typescript. For example `id.nullable()` accepts an optional boolean value, so it can be written as:

```ts
class HaywireId {
    // In practice it is more complicated, but you get the idea...
    nullable(enabled?: boolean): HaywireId {}
}
```
So typescript enforces you can only pass a boolean, easy enough!

Other validations are much more complex though. Such as enforcing that a module does not have duplicate bindings, that a container's dependencies are all satisfied, or that a binding's dependencies match the type of the provider.

This is implemented by attaching a type-only parameter (does not exist at runtime) called `invalidInput` that when satisfied is spread as an empty array, but when not satisfied results in `never` which will cause typescript errors.

The best way to see this in action is the source code of this package, but a small example below can show an example of a "Set" that _only_ allows adding values that do not already exist.

```ts
// This value will never exist at runtime, so it is impossible for callers to correctly reference
declare const impossibleSym: unique symbol;

type ValidateAdd<Values, T> = 
    (
        // Wrapping in an array prevents the values from "spreading"
        [T] extends [Values]
            // "Illegal" state, so request an impossible value
            ? [typeof impossibleSym]
            // Happy state! Which will easily be satisfied by doing nothing
            : []
    )
    // Always join with an empty array to force to "never" when invalid
    & []

class PickySet<Values = never> {

    readonly #values: Values[] = [];

    public add<T>(
        value: T,
        // Only exists in typescript
        ...invalidInput: ValidateAdd<Values, T>
    ): PickySet<Values | T>;
    public add<T>(
        value: T
    ): PickySet<Values | T> {
        const cloned = new PickySet<Values | T>();
        cloned.#values.push(...this.#values, value);
        return cloned;
    }

    public has<T extends Values>(value: T): true;
    public has(value: unknown): false;
    public has(value: unknown): boolean {
        return new Set<unknown>(this.#values).has(value);
    }
}

const pickySet = new PickySet()
    .add(1 as const)
    .add(2 as const);

// Error! 2 has already been added!
pickySet.add(2 as const);

const yes: true = pickySet.has(1 as const);
const no: false = pickySet.has(2 as const);
```

Of course you can get around most of these validations by casting as `any` or using `// @ts-expect-error`, but then there is no reasonable expectation of type safety anyways.

### Typescript configuration

Due to the type safety requirements of Haywire, it is highly recommended to configure your `tsconfig.json` with the strictest possible configuration.

Haywire is 100% compatible with vanilla javascript, so using a laxer version of typescript _may_ work as intended. However it is only tested and maintained with the strictest settings.

These settings include:
* [strict](https://www.typescriptlang.org/tsconfig/#strict) `= true`
  * And all additional "strict" settings that are included in this
* [exactOptionalPropertyTypes](https://www.typescriptlang.org/tsconfig/#exactOptionalPropertyTypes) `= true`

### Generics on classes and methods

Haywire _extensively_ uses generics to track the state of various resources like bindings, modules, and containers. It is the secret sauce that allows so much type information to be passed around and [validated](#validation-using-types) to achieve type safety.

In general, users should _not_ consider the generics as part of the API. They should allow Typescript's default values to be used, perhaps with the occasional `as const` assertion to parameters.

That means the types of virtually all values should be inferred, rather than declared/enforced.

```ts
// Do this!
const myModule = createModule(myBinding);

// Not this!
const myTypedModule: Module<OutputId, DependencyA, Async> = createModule<OutputId, [DependencyA, DependencyB]>(myBinding);
```

This means it may be tricky to use haywire instances as either the parameters or return type of methods. This is ok though, dependency injection libraries should run at the top level. You ideally are not passing around things like identifiers within your business logic.

Any sort of "conditional" and "DRY" logic should be handled by mixing and matching modules based on your environment.

The two exceptions to this rule are:
* `identifier<T>()` allows a generic to define a type
* All types publically exposed in the [Types](#types) section of API.

## API

### Methods

#### `identifier`

Returns a `HaywireId` to be used as a type tracker in all Haywire APIs.

Method signatures:
* `identifier<T>(name?: string)`
  * Returns an id for an arbitrary type `T`. It will produce a _new and unique_ id every time it is called, so it is critical to only instantiate once!
  * Optionally provide a `name` to be included whenever the id is stringified in debug logs or errors. Default is `'haywire-id'`.
  * If the type is optionally `null` or `undefined`, will throw a type error. Those are special cases that should be handled via the `nullable()` and `undefinable()` methods respectively.
* `identifier(Foo)`
  * Returns an id for the class `Foo`. It will return the _same_ id every time, and is generally interchangable with providing the `Foo` class directly to APIs if necessary.
* `identifier(id)`
  * If a HaywireId is provided as input, the id is return unchanged.

#### `bind`

Begins the process of binding an identifier to a provider with dependencies. Does not directly return a binding, but instead returns a chainable (and immutable) instance that further attaches more data.

| Instance | Method | Parameters | Return Type | Notes |
|----------|--------|------------|-------------|-------|
| ❌ | `bind(idOrClass: HaywireId \| Foo)` | Either a `HaywireId` or a raw class (equivalent to `identifier(Foo)`) | `BindingBuilder` | |
| `BindingBuilder` | `withInstance(value: T)` | A singleton instance that satisfies the type of id | `Binding` | Scopes are irrelevant to resulting binding, because it is always a singleton |
| `BindingBuilder` | `withGenerator(() => T)` | A method with no parameters that returns the requested type | `Binding` | |
| `BindingBuilder` | `withAsyncGenerator(() => Promise<T>)` | A method with no parameters that asynchronously returns the requested type | `Binding` | Will result in container being async. |
| `BindingBuilder` | `withConstructorGenerator()` | Instructs Haywire to use the classes constructor directly with no parameters | `Binding` | Only available to ids constructed via a class |
| `BindingBuilder` | `withProvider(provider: (X, Y) => T)` | Declare a method that will construct the type based on dependencies | `ProviderBindingBuilder` | |
| `BindingBuilder` | `withAsyncProvider(provider: (X, Y) => Promise<T>)` | Declare a method that will asynchronously construct the type based on dependencies. | `AsyncProviderBindingBuilder` | Will result in container being async. |
| `BindingBuilder` | `withConstructorProvider()` | Tells Haywire to use the constructor of the class directly, and infer any dependencies for that. | `ProviderBindingBuilder` | Only available to ids constructed via a class |
| `BindingBuilder` | `withDependenices([X, Y])` | A list of Haywire ids or classes to depend on  | `DepsBindingBuilder` | |
| `ProviderBindingBuilder` | `withDependenices([X, Y])` | A list of Haywire ids or classes to depend on  | `DepsBindingBuilder` | The list is enforced via types to match types declared as parameters for the provider |
| `AsyncProviderBindingBuilder` | `withDependenices([X, Y])` | A list of Haywire ids or classes to depend on  | `DepsBindingBuilder` | The list is enforced via types to match types declared as parameters for the provider |
| `DepsBindingBuilder` | `withProvider(provider: (X, Y) => T)` | Declare a method that will construct the type based on dependencies | `Binding` | Types of parameters are auto-populated based on provided ids |
| `DepsBindingBuilder` | `withAsyncProvider(provider: (X, Y) => Promise<T>)` | Declare a method that will asynchronously construct the type based on dependencies. | `Binding` | Will result in container being async. |
| `DepsBindingBuilder` | `withConstructorProvider()` | Tells Haywire to use the constructor of the class directly.  | `ProviderBindingBuilder` | Enforces that the type signature of the constructor matches the provided dependencies |

#### `createModule`

Create a module out of a singular binding. If the binding happens to include an immediately circular dependency, will enforce that the output satisfies the type of dependency.

Alias for `Module.fromBinding()`

#### `createContainer`

Create a container from a module that has all dependencies satisfied. 
Also creates a container from a factory that has all dependencies registered.

If the module/factory is not complete, will result in a type error.

#### `isSyncContainer`

Takes a parameter of an `AsyncContainer` or `SyncContainer`. Will return true if value is a `SyncContainer` and unlocks usage of the synchronous `preload()` and `get()` methods.

Persists types better than a class `instanceof SyncContainer` check (although that is essentially the internal logic of this method).

#### `createFactory`

Create a factory from a module that does not have all dependencies satisfied.

### Classes

Note most classes are not directly instantiatable (private constructors) to enables additional validations. Instances should be created via their related methods

Not every class is actually exposed as an explicit export, and are only available as types to facilitate usage.

#### `HaywireId`

Represents a type that can be used to reference binding outputs, dependencies, and request instances from a container. Output of `identifier()`.

All methods on an id are chainable and revertable. They will also produce the exact same instance as before so long as the types are still a match. Order that methods are applied does not matter.

```ts
const id = identifer<number>();

const modifiedId = id.nullable().undefinable().supplier('async').named('foo-bar');

const originalId = modifiedId.nullable(false).undefinable(false).supplier(false).named(null);
originalId === id; // true!
```

| Method | Parameters | Type Modifier | Notes |
|--------|------------|---------------|-------|
| `toString()` | ❌ | ❌ | User friendly string representation of id. Based on class name or string parameter passed `identifier<T>('<foo-bar>') `|
| `nullable(enabled?: boolean)` | boolean (default=`true`). If false will "revert" to a non-nullable type | `T \| null` | |
| `undefinable(enabled?: boolean)` | boolean (default=`true`). If false, will "revert" to a non-undefined type | `T \| undefined` | |
| `named(name: string \| unique symbol \| null)` | A _literal_ string or a _unique_ symbol. Differentiates similarly typed ids. For example you may multiple different strings representing various environment variables. A `null` value will "revert" the naming to defaut omission | `T` | String unions and non-unique symbols will be rejected. |
| `supplier(options)` | `true` (default), `false`, `'async'` or an object `{ sync: boolean, propagateScope: boolean }` | `() => T` or `() => Promise<T>` | See [Supplying A Value](#supplying-a-value) above for more context about suppliers |
| `lateBinding(enabled?: boolean)` | boolean (default=`true`) | `Promise<T>` | See [Circular Dependencies](#circular-dependencies) above for more context about late binding |
| `baseId()` | ❌ | `T` | Strips all modifiers from the id and returns the original id value that would have come from `identifier()` |

#### `Binding`

Represents a combination of provider and dependencies. Eventual output of `bind()`.

| Method | Parameters | Notes |
|--------|------------|-------|
| `nullable(enabled?: true)` | _Only_ `true` | Marks the output as if you originally provided a `nullable()` id to original `bind()`. Useful if a class literal was used instead. Since providers have already been attached and type checked, it is not possible to "revert" |
| `undefinable(enabled?: true)` | _Only_ `true` | Marks the output as if you originally provided a `undefinable()` id to original `bind()`. Useful if a class literal was used instead. Since providers have already been attached and type checked, it is not possible to "revert" |
| `named(name: string \| unique symbol \| null)` | A _literal_ string or a _unique_ symbol. | Marks the output as if you originally provided a `named()` id to original `bind()`. Useful if a class literal was used instead. |
| `scoped(scope)` | scope (default=`transientScope`) | See [Binding an Implementation](#binding-an-implementation-to-an-id) above for more context about scopes and their impact on resource lifecycles |

#### `Module`

Represents a collection of `Binding`s, each for a unique identifier.

| Method | Parameters | Return Type | Notes |
|--------|------------|-------------|-------|
| `addBinding(binding)` | `Binding` | `Module` | Returns a _new_ module with extra binding attached. Type+runtime validations ensure it is a unique output and all dependencies are still satisfied |
| `mergeModule(module)` | `Module` | `Module` | Returns a _new_ module with two modules merged. Order does not matter (`A.mergeModule(B)` = `B.mergeModule(A)`). Type+runtime validations ensure all outputs are unique and all dependencies are still satisfied |
| `toContainer()` | ❌ | `AsyncContainer \| SyncContainer` | Returns a container of all bindings. Type enforcement ensures module is fully satisfied. Will be an AsyncContainer if any binding's provider is async. |
| `toFactory()` | ❌ | `Factory` | Returns a factory to register remaining dependencies. |

#### `AsyncContainer`

A collection of bindings that is capable of _asynchronously_ instantiating any requested output.

| Method | Parameters | Return Type | Notes |
|--------|------------|-------------|-------|
| `check()` | ❌ | `void` | Performs runtime enforcement that all dependencies are satisfied by a binding, and any [circular dependencies](#circular-dependencies) and [sync suppliers](#supplying-a-value) are handled properly. Successful result is cached, and any future calls will return immediately. |
| `wire()` | ❌ | `void` | Wires internal mappings to ensure proper ordering of dependency instantiation and optimistic bindings. Result is cached, and any future calls will return immediately. Calls `check()` internally first. |
| `preloadAsync()` | ❌ | `Promise<void>` | Instantiates all optimistic singletons. Result is cached, and any future calls will return immediately. Calls `wire()` internally first. |
| `getAsync(idOrClass)` | `HaywireId` or raw class of requested value | `Promise<T>` | _Asynchronously_ instantiates the requested value. Each call counts as a separate "request" for scoping. Will throw error if requested value does not exist in bindings, including requesting a non-null value when binding is declared `.nullable()` |

#### `SyncContainer`

Extends `AsyncContainer` and supports all methods in addition to synchronous versions of methods. Only available when every binding is synchronous.

| Method | Parameters | Return Type | Notes |
|--------|------------|-------------|-------|
| `preload()` | ❌ | `void` | Same behavior as `preloadAsync()`, only synchronous. Calling either will perform caching for both. |
| `get(idOrClass)` | `HaywireId` or raw class of requested value | `T` | Same behavior as `getAsync(idOrClass)`, only synchronous. |

#### `Factory`

Collection of incomplete bindings that can still be checked and wired like a container. Once remaining singletons are registered, can produce a container.

| Method | Parameters | Return Type | Notes |
|--------|------------|-------------|-------|
| `check()` | ❌ | `void` | Similar to `container.check()`. Assumes that all to-be-registered bindings are synchronous, optimistic singletons, with no dependencies. Operation will be cached for all containers generated. |
| `wire()` | ❌ | `void` | Similar to `container.wire()`. Operation will be cached for all containers generated. |
| `register(idOrClass, instance)` | First parameter is either a `HaywireId` or raw class declaring the type. Second parameter is an instance satisfying the requested type. | `Factory` | Returns a _new_ factory with value registered. Because of this, a factory instance may be shared across multiple contexts. If the factory has been checked/wired, that state will persist. |
| `toContainer()` | ❌ | `AynscContainer \| SyncContainer` | Returns a container with registered values bound. Will inherit factory's checked/wired state. Will be an AsyncContainer if any module binding's provider is async. |

### Types

The following types are exported and are part of the public interface. They may come in handy when typing providers based on your defined dependencies.

#### `HaywireIdType`

Takes one generic parameter that is the typeof a haywire id. Returns the type that the id represents. Mirrors the value that would be returned by `.get()`ing the id, or declaring it as a dependency.

```ts
const id = identifer<number>().nullable().supplier();

// () => number | null
type Id = HaywireIdType<typeof id>;
```

#### `AsyncSupplier`

Takes one generic parameter that is an arbitrary type `T`. Returns the type of a parameter-less method that return a `Promise<T>`.

Includes additional internal type annotations to distinguish between a normal asynchronous function, but otherwise effectively `() => Promise<T>`

This is the type used internally to represent `identifer<T>().supplier('async')`.

#### `Supplier`

Synchronous version of `AsyncSupplier`. A parameter-less method that returns `T`. 

Includes additional internal type annotations to distinguish between a normal function, but otherwise effectively `() => T`

This is the type used internally to represent `identifer<T>().supplier()`.

#### `LateBinding`

A `Promise` that resolves to `T`. 

Includes additional internal type annotations to distinguish between a normal function, but otherwise effectively `Promise<T>`.

This is the type used internally to represent `identifer<T>().lateBinding()`.

### Errors

These are errors that may be thrown by Haywire throughout the lifecycle of binding, wiring, and instantiating dependencies.

The actual error types may be more specific than what is provided, but will extend these classes.

It is not recommended to instantiate and throw these errors in your own code. Instead it can be used to detect existing thrown errors by comparing via `instanceof`.

#### `HaywireError`

All other errors thrown by Haywire will extend this class, and it is the most low level version.

#### `HaywireModuleValidationError`

Error potentially thrown during the `Module` stage of Haywire lifecycle.

Specific instances include attempting to add a binding for an id that already exists on the module.

#### `HaywireContainerValidationError`

Error potenitally thrown during the `Container.check()` stage.

Specific instances may report circular dependencies, or sync supplier that are incorrectly backed by async providers.

#### `HaywireInstanceValidationError`

Error thrown during request time, during `preload()` or `get()` (or will be rejected when using async versions).

Specific instances may report a value that is `null` for an id that is not declared as `.nullable()`, or the response is not an `instanceof` the requested class.