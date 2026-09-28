<div style="text-align:center">

# vitest-chain
Chain vitest hooks together for deterministic and type safe tests.

[![npm package](https://badge.fury.io/js/vitest-chain.svg)](https://www.npmjs.com/package/vitest-chain)
[![License](https://img.shields.io/npm/l/vitest-chain.svg)](https://github.com/JacobLey/leyman/blob/main/tools/test-chain/vitest-chain/LICENSE)

</div>

## Contents

- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)
- [Also See](#also-see)

## Install

```sh
npm i vitest-chain
```

## Example

```ts
import { beforeAll, describe } from 'vitest-chain';
import { expect } from 'vitest';

describe('Example Database Test', () => {
    const withDb = beforeAll(async () => {
        const db = await connect();
        return { db };
    });

    const withUser = withDb.beforeEach(async ({ db }) => {
        const user = await db.createUser();
        return { user };
    });

    withUser.test('Finds user', async ({ db, user }) => {
        expect(await db.findUser(user.id)).toEqual(user);
    });

    withUser.afterEach(async ({ db, user }) => {
        await db.deleteUser(user.id);
    });

    withDb.afterAll(async ({ db }) => {
        await db.disconnect();
    });
});
```

## Usage

`vitest-chain` is an ESM package that wraps vitest's native methods (a peer dependency). It is the vitest equivalent of [mocha-chain](../mocha-chain/README.md) — see [WHY-MOCHA-CHAIN.md](../mocha-chain/WHY-MOCHA-CHAIN.md) for the problem it solves.

Native vitest methods and `vitest-chain` methods can be mixed in the same suite.

**Hooks must run in registration order.** Context flows forward from one hook to the next, but vitest's default `sequence.hooks` (`"stack"`) runs `afterEach`/`afterAll` in reverse. Configure:

```ts
// vitest.config.ts
export default {
    test: {
        sequence: { hooks: 'list' },
    },
};
```

Hooks that execute out of order reject with `HookOrderError`, rather than silently receiving an incomplete context.

## API

Each hook returns an object of chained hooks/tests, which receive the merged context returned by all previous hooks in the chain as their first parameter. Returning a falsy value leaves the context unchanged.

Top-level ("entrypoint") hooks/tests receive vitest's native arguments. Chained hooks/tests receive the context, followed by vitest's native arguments.

| Method | Chains into | Native arguments |
|--------|-------------|------------------|
| `beforeAll(fn)` | `beforeAll`, `beforeEach`, `test`/`it`, `afterEach`, `afterAll` | `(context, suite)` |
| `beforeEach(fn)` | `beforeEach`, `test`/`it`, `afterEach` | `(testContext)` |
| `test(name, fn)` / `it` | — | `(testContext)` |
| `afterEach(fn)` | `afterEach` | `(testContext)` |
| `afterAll(fn)` | `afterAll` | `(context, suite)` |
| `describe(name, fn)` / `suite` | — | — |

`test` and `describe` also expose `.only` and `.skip`.

Declaring a hook, test, or suite while a hook/test is executing throws an error.

If a hook fails, downstream `afterEach`/`afterAll` hooks still run with the context produced before the failure.

## Also See

- [mocha-chain](../mocha-chain/README.md) — the same API for Mocha
- [test-chain-core](../test-chain-core/README.md) — framework-agnostic internals shared by both
