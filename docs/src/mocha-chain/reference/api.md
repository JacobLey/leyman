---
description: Every mocha-chain function and alias.
---

# API

Each function calls the Mocha function of the same name, and takes the same arguments. mocha-chain is ESM only, with `mocha` and `@types/mocha` as peer dependencies.

| Function | Aliases | Runs | Returns |
|----------|---------|------|---------|
| `suite(title, fn)` | `describe`, `context` | `fn` synchronously, to declare hooks and tests | nothing |
| `before(title?, fn)` | `suiteSetup` | once, before the suite's tests | a chain of `before`, `beforeEach`, `test`, `afterEach`, `after` |
| `beforeEach(title?, fn)` | `setup` | before each of the suite's tests | a chain of `beforeEach`, `test`, `afterEach` |
| `test(title, fn)` | `it`, `specify` | as a test | nothing |
| `afterEach(title?, fn)` | `teardown` | after each test, even a failed one | a chain of `afterEach` |
| `after(title?, fn)` | `suiteTeardown` | once, after the suite's tests, even failed ones | a chain of `after` |

`suite.only`, `suite.skip`, `test.only` and `test.skip` (and their aliases) work as in Mocha. `xdescribe` is `suite.skip`, and `xit` is `test.skip`.

## Callbacks

| Called as | Receives | `this` |
|-----------|----------|--------|
| `before(fn)`, … (not chained) | nothing | Mocha's context |
| `chain.before(fn)`, … | the context of every hook before it in the chain, merged | Mocha's context |

A hook may return an object, or a `Promise` of one, to add its keys to the context of what it chains to. Returning `undefined` (or nothing) keeps the context unchanged. Tests' return values are ignored, apart from Mocha waiting for a `Promise`.

Each test, and each run of a per-test hook, gets a shallow copy of the context. The merged type is an intersection: a key returned twice keeps the later value at runtime, but has the intersection of both types. See [Chaining hooks](/mocha-chain/guides/chaining).

## Errors

Declaring a suite, hook or test while a hook or test is running throws, failing it.

If a hook runs before a hook it's chained to (e.g. hooks declared in an order the framework doesn't run them in), it fails with a `HookOrderError` rather than receiving an incomplete context.
