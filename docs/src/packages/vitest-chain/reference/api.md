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

`describe` and `test` also have `.only` and `.skip`.

Callbacks that aren't chained receive Vitest's arguments. Chained ones receive the chain's context first, then Vitest's arguments. A hook may return an object, or a `Promise` of one, to add its keys to the context. Returning a falsy value keeps the context unchanged.

## Requirements and errors

- Vitest must run hooks in declaration order: set `sequence.hooks: 'list'` in its config. A hook that runs before one it's chained to fails with `HookOrderError`.
- Declaring a suite, hook or test while a hook or test is running throws.
- If a hook fails, the `afterEach`/`afterAll` hooks chained to it still run, with the context produced before the failure.
