---
description: The problems with hand-written error conversion, where existing libraries fall short, and the design of unknown-error.
---

# Why unknown-error?

## The Problem

In TypeScript's `strict` mode, a `catch` variable is `unknown`, and with reason: JavaScript can throw anything. To log it, report it or wrap it, you need an Error, so nearly every codebase ends up with something like this:

```ts
const toError = (value: unknown): Error =>
    value instanceof Error ? value : new Error(String(value));
```

It handles the cases that come to mind first: an Error, or a thrown string. It falls apart on the rest, and it fails inside the `catch` block that was meant to handle the failure.

### Errors from another realm aren't `instanceof Error`

Each realm (a `vm` context, an iframe, some test runners) has its own `Error` class. An Error from another realm fails `instanceof Error`, so the code above turns a perfectly good `TypeError` into `new Error("TypeError: x")`, losing its name, stack, cause and properties.

### Errors that crossed a boundary are plain objects

An error sent through JSON, `postMessage` or an RPC framework arrives as `{ name, message, stack, code }`. `String()` turns it into `Error: [object Object]`.

### Thrown objects become `[object Object]`

`throw { status: 404, reason: 'missing' }` is bad practice, but libraries do it. `String()` loses everything, and `JSON.stringify` throws on circular references and BigInts, which is why most conversions don't use it.

### The handler itself can throw

The thrown value controls what runs when you inspect it. A Proxy can throw from every trap, a `message` getter can throw, and so can `toString` and `toJSON`. `String(value)`, `value.message` and even `value instanceof Error` (which reads the prototype) run that code, so the conversion throws inside your `catch` and replaces the original error with a new one.

### Cause chains and AggregateError are trees

`cause` can be anything, including a non-Error or another realm's Error, and it can be circular. `AggregateError` adds a list of errors at each level. Code that follows `cause` with a `while` loop hangs on a cycle, and code that recurses overflows the call stack on a deep enough chain.

## Why Existing Solutions Fall Short

Every claim below is checked by the [comparison suite](https://github.com/JacobLey/leyman/blob/main/e2e/unknown-error-comparison/test/integration/comparison.spec.ts), which runs each library through the same cases.

- **[`normalize-exception`](https://www.npmjs.com/package/normalize-exception)** comes closest. It handles other realms, error-like objects and hostile values, and normalizes causes and `AggregateError` entries. But it modifies the error you pass in (replacing a non-Error `cause` in place), describes circular objects and objects containing BigInts as `[object Object]`, and recurses, so a 10,000-deep cause chain overflows the stack.
- **[`ensure-error`](https://www.npmjs.com/package/ensure-error)** uses `instanceof`, so it wraps another realm's Error in a `NonError` whose message is `{}`. It doesn't recognize error-like objects, throws on a Proxy or a throwing `message` getter, and also patches your error in place. It recurses too, and builds a new stack at every level, which gets slow on deep chains when `Error.stackTraceLimit` is raised (as Mocha does).
- **[`serialize-error`](https://www.npmjs.com/package/serialize-error)** is built to turn errors into JSON and back. Its `deserializeError` rebuilds error-like objects well, but prefixes thrown strings (`Non-error value: boom`), throws on hostile values, and doesn't walk causes.
- **[`pony-cause`](https://www.npmjs.com/package/pony-cause)** only formats `cause` chains of real Errors: it drops causes that aren't Errors (including other realms' Errors), ignores `AggregateError`, and recurses.
- **Hand-written conversions** like the one above fail most of these cases, and throw on three of them.

## How unknown-error Is Different

- **Every read is guarded.** Property reads, key listing and stringifying all catch errors from getters and Proxy traps, with fallbacks down to a fixed `[unprintable value]`. No function in the package throws, whatever it's given.
- **`Error.isError` where it exists.** It recognizes Errors from any realm, and can't be fooled by a Proxy or run any of its traps. Where it's missing (Chrome before 134, Firefox before 138, Safari before 18.4), a guarded `instanceof` and object-tag check takes over.
- **Your errors are never modified.** An Error is returned as it is. Error-like objects are copied into a new Error, and everything else is wrapped in a `NonError` that keeps the original value as `thrown`.
- **Readable descriptions.** Non-Errors are described as JSON with circular references marked `[Circular]` and BigInts kept as `1n`, falling back to `toString` and then the object's tag.
- **A walk, not recursion.** `walkErrors` uses an explicit stack, skips anything it has already visited, and stops at `maxDepth` (32 by default), marking where it stopped. `formatError` is built on it.

## Comparison

From the [comparison suite](https://github.com/JacobLey/leyman/blob/main/e2e/unknown-error-comparison/test/integration/comparison.spec.ts). ✅ handles it, ❌ doesn't, 💥 throws, — has no API for it.

| Case | unknown-error | normalize-exception | ensure-error | serialize-error | pony-cause | Hand-written |
|---|---|---|---|---|---|---|
| Uses a thrown string as the message, unchanged | ✅ | ✅ | ❌ quotes it | ❌ prefixes it | — | ✅ |
| Converts a thrown `null` | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| Keeps an Error from another realm | ✅ | ✅ | ❌ | ✅ | — | ❌ |
| Rebuilds an error-like object with its name, message, code and stack | ✅ | ✅ | ❌ | ✅ | — | ❌ |
| Describes a circular object | ✅ | ❌ | ❌ | ❌ | — | ❌ |
| Describes an object containing a BigInt | ✅ | ❌ | ❌ | ❌ | — | ❌ |
| Converts an object whose `toJSON` and `toString` throw | ✅ | ✅ | ✅ | ✅ | — | 💥 |
| Converts a Proxy that throws from every trap | ✅ | ✅ | 💥 | 💥 | — | 💥 |
| Reads the message of an Error whose `message` getter throws | ✅ | ✅ | 💥 | 💥 | — | 💥 |
| Leaves the Error passed in unmodified | ✅ | ❌ | ❌ | ✅ | — | ✅ |
| Includes a cause that is not an Error | ✅ | ✅ | ✅ | — | ❌ | — |
| Includes a cause from another realm | ✅ | ✅ | ❌ | — | ❌ | — |
| Ends a circular cause chain | ✅ | ✅ | ✅ | — | ✅ | — |
| Includes nested `AggregateError` entries | ✅ | ✅ | ✅ | — | ❌ | — |
| Handles a 10,000-deep cause chain | ✅ | 💥 | 💥 | — | 💥 | — |

## Design Decisions

- **Rebuild error-like objects, don't wrap them.** An object with a string `message` is almost always an error that lost its prototype on the way (through JSON or `postMessage`), so it becomes a plain `Error` with its name, stack, cause and other properties. Wrapping it in a `NonError` would bury its message in JSON.
- **Only real Errors match `hasCode`.** It narrows to `Error & { code }`, which would be a lie for a plain object. Convert first, with `hasCode(toError(err), code)`, to match error-like objects.
- **A depth limit by default.** A cause chain dozens of levels deep is almost always a bug (like an error wrapped on every retry), and printing all of it buries the useful part. `maxDepth` is 32, the walk says where it stopped, and `Infinity` turns the limit off.
- **A fallback for `Error.isError`, not a requirement.** It is the only way to recognize an Error from another realm without running a Proxy's traps, but browsers only shipped it in 2025 (Chrome 134, Firefox 138, Safari 18.4), so older ones lack it. Without it, `instanceof Error` and the `[object Error]` tag still recognize Errors from any realm, inside a `try` so a Proxy can't make them throw. The cost is that a Proxy around an Error, or an object with a forged `Symbol.toStringTag`, also passes. It is read on every call, so a polyfill loaded later is used.

## Non-Goals

- **Serializing errors.** To send an error over JSON, use [`serialize-error`](https://www.npmjs.com/package/serialize-error). unknown-error rebuilds what it receives on the other side.
- **Error class hierarchies.** It converts and inspects errors, and has no opinion on how you define them.
- **Recovering the throw location of non-Errors.** A thrown string has no stack. A `NonError`'s stack points at the `toError` call, the closest place that is known.

Back to the [overview](/unknown-error/).
