# Change Log

## 2.0.6

### Patch Changes

- e718f38: Update dependencies

## 2.0.5

### Patch Changes

- bcd9e61: Bump dependencies
- 1387a8c: Bump sonarjs eslint and fix/ignore issues
- c4af482: Enforce type-file coverage via explicit test suite

## 2.0.4

### Patch Changes

- 3b3f77f: Bump dependencies
- 3285cb6: Bump biome version
- 7d6f471: Add support for type-only exports to barrels
- 9b58c82: Bump typescript version
- ff72123: Bump typescript eslint, apply/ignore rules

## 2.0.3

### Patch Changes

- 1de1659: Omit CHANGELOG from publish
- 725510a: Include npmignore ignore file

## 2.0.2

### Patch Changes

- 3dc29d2: Update JSDoc
- 31f81fa: Internal dependency updates
- 3e7ee18: Dependency bumps
- f6a4729: Update year in LICENSE
- 9c786d0: Update dependencies

## 2.0.0

### Changed

Static Emitter now is based off of `EventTarget` for environment-agnostic usage.

`EventTarget` itself only allow `string` for event names, and have a smaller set of native methods. It also requires every event that is emitted extend the `Event` class.

The exports have been split into a two classes:

- A type-only extension `StaticEventTarget` that _is_ `EventTarget` with support for type constraints on events.
- An extension of `StaticEventTarget`, `StaticEmitter` which includes the type constraints, as well as some lightweight helper methods for more "EventEmitter"-esque syntax with symbol support, and non-`Event` bodies. `StaticEmitter` is now a separate class from `EventTarget`, not just a type cast.

Declaring event structure has also been updated. There are now two methods for implementing.

The first is similar to original implementation, of explicitly declaring the `events` property of the emitter.

```ts
import { events, StaticEmitter } from "static-emitter";

class MyEmitter extends StaticEmitter {
  declare [events]: {
    foo: 123;
  };
}

new MyEmitter().emit("foo", 123);
```

Note that the attributes are no longer arrays, as `EventTarget` does not allow for arbitrary lengths of events.

The second is passing the event syntax via generic parameters. This can be done either when extending the class, or when instantiating the class directly.

```ts
import { StaticEmitter } from "static-emitter";

new StaticEmitter<{ foo: 123 }>().on("foo", (data: 123) =>
  console.log("My Data", data)
);
```

`StaticEventTarget` follows the same patterns.
