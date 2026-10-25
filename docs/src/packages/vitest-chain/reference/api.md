---
description: Every vitest-chain function, and the arguments its callbacks receive.
---

# API

Each function calls the Vitest function of the same name. vitest-chain is ESM only, with `vitest` as a peer dependency.

| Function | Alias | Chains into | Vitest's arguments |
|----------|-------|-------------|--------------------|
| `describe(name, fn)` | `suite` | nothing | — |
| `beforeAll(fn)` | | `beforeAll`, `beforeEach`, `test`/`it`, `afterEach`, `afterAll` | `(context, suite)` |
| `beforeEach(fn)` | | `beforeEach`, `test`/`it`, `afterEach` | `(testContext)` |
| `test(name, fn)` | `it` | nothing | `(testContext)` |
| `afterEach(fn)` | | `afterEach` | `(testContext)` |
| `afterAll(fn)` | | `afterAll` | `(context, suite)` |

`describe` and `test` also have `.only` and `.skip`. Hooks and tests take only a callback (and a name), not vitest's timeout or options arguments, and there is no `.each`, `.concurrent`, `.todo` or `.skipIf`: use vitest's own functions for those.

Callbacks that aren't chained receive Vitest's arguments. Chained ones receive the chain's context first, then Vitest's arguments. A hook may return a plain object, or a `Promise` of one, to add its keys to the context. Returning nothing (`undefined` or `null`) keeps the context unchanged. Only the object's own enumerable properties are copied, so return `{ db }` rather than a class instance, whose methods would be missing from the context. A number or a string, and an array, function, `Map`, `Set`, `Date` or `RegExp`, is a type error. Types can't tell a class instance from a plain object, so a hook that returns one (or any object whose prototype isn't `Object.prototype` or `null`) fails with `HookContextError`. An arrow function without braces (`beforeEach(() => db.clear())`) returns, and merges, whatever the call returns.

## Requirements and errors

- Vitest must run hooks in declaration order: set `sequence.hooks: 'list'` in its config. A hook that runs before one it's chained to fails with `HookOrderError`.
- Declaring a suite, hook or test while a hook or test is running throws.
- If a hook fails, the `afterEach`/`afterAll` hooks chained to it still run, with the context produced before the failure.
