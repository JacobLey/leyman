<div style="text-align:center">

# vitest-chain

Chain vitest hooks together for deterministic and type safe tests.

[![npm package](https://badge.fury.io/js/vitest-chain.svg)](https://www.npmjs.com/package/vitest-chain)
[![License](https://img.shields.io/npm/l/vitest-chain.svg)](https://github.com/JacobLey/leyman/blob/main/tools/test-chain/vitest-chain/LICENSE)

</div>

Setting up fresh state in a `beforeEach` usually means assigning it to a `let` variable in the suite, which TypeScript has to type as `T | undefined` and every test has to assert is set.

`vitest-chain` wraps Vitest's hooks so they can return that state instead. The object a hook returns is passed to the hooks and tests chained from it, merged with what earlier hooks returned, and fully typed. Chained callbacks still receive Vitest's own arguments (like the test context) after it, and you can mix native Vitest calls into the same suite.

It is the Vitest version of [mocha-chain](https://www.npmjs.com/package/mocha-chain), with the same API (apart from `beforeAll` and `afterAll` in place of Mocha's `before` and `after`). Context only flows forward, so Vitest has to be configured to run hooks in the order they're declared (see [Usage](#usage)).

Guides and the full reference are on the [docs site](https://jacobley.github.io/leyman/packages/vitest-chain/). For more on the problem, see [WHY-MOCHA-CHAIN.md](https://github.com/JacobLey/leyman/blob/main/tools/test-chain/mocha-chain/WHY-MOCHA-CHAIN.md).

## Contents

- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)
- [Also See](#also-see)

## Install

```sh
npm i --save-dev vitest-chain vitest
```

ESM only, for Node.js 22.12 or later. `vitest` is a required peer dependency.

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

`vitest-chain` is an ESM package that wraps vitest's native methods (a peer dependency). It is the vitest equivalent of [mocha-chain](https://www.npmjs.com/package/mocha-chain), and [WHY-MOCHA-CHAIN.md](https://github.com/JacobLey/leyman/blob/main/tools/test-chain/mocha-chain/WHY-MOCHA-CHAIN.md) explains the problem both solve.

Native vitest methods and `vitest-chain` methods can be mixed in the same suite.

Hooks must run in the order they're registered. Context flows forward from one hook to the next, but vitest's default `sequence.hooks` (`"stack"`) runs `afterEach`/`afterAll` in reverse, so set it to `"list"`:

```ts
// vitest.config.ts
export default {
    test: {
        sequence: { hooks: 'list' },
    },
};
```

Hooks that execute out of order reject with `HookOrderError` instead of receiving an incomplete context.

## API

Each hook returns an object of chained hooks/tests, which receive the merged context returned by all previous hooks in the chain as their first parameter. Returning nothing (`undefined` or `null`) leaves the context unchanged.

A hook returns a plain object, a `Promise` of one, or nothing. Only the object's own enumerable properties are copied into the context, so return `{ db }` rather than a class instance (`return db`), whose methods would be missing from the context. A number or a string, and an array, function, `Map`, `Set`, `Date` or `RegExp`, is a type error. Types can't tell a class instance from a plain object, so a hook that returns one (or any object whose prototype isn't `Object.prototype` or `null`) fails with `HookContextError`. A hook written as an arrow function without braces (`beforeEach(() => db.clear())`) returns whatever that call returns, and merges it, so use braces when the hook shouldn't add context. If two hooks return the same key, the later value replaces the earlier at runtime, but the type is the intersection of both (`never` for unrelated types).

Each test gets a shallow copy of the context, so reassigning a key in one test does not affect others, while objects inside it, like `db`, are shared.

Top-level ("entrypoint") hooks/tests receive vitest's native arguments. Chained hooks/tests receive the context, followed by vitest's native arguments.

| Method                         | Chains into                                                     | Native arguments   |
| ------------------------------ | --------------------------------------------------------------- | ------------------ |
| `beforeAll(fn)`                | `beforeAll`, `beforeEach`, `test`/`it`, `afterEach`, `afterAll` | `(context, suite)` |
| `beforeEach(fn)`               | `beforeEach`, `test`/`it`, `afterEach`                          | `(testContext)`    |
| `test(name, fn)` / `it`        | —                                                               | `(testContext)`    |
| `afterEach(fn)`                | `afterEach`                                                     | `(testContext)`    |
| `afterAll(fn)`                 | `afterAll`                                                      | `(context, suite)` |
| `describe(name, fn)` / `suite` | —                                                               | —                  |

`test` and `describe` also expose `.only` and `.skip`. Hooks and tests take only a callback (and a name), not vitest's timeout or options arguments, and there is no `.each`, `.concurrent`, `.todo` or `.skipIf`: use vitest's own functions for those.

Declaring a hook, test, or suite while a hook/test is executing throws an error.

If a hook fails, downstream `afterEach`/`afterAll` hooks still run with the context produced before the failure.

## Also See

- [mocha-chain](https://www.npmjs.com/package/mocha-chain) — the same API for Mocha
- [test-chain-core](https://www.npmjs.com/package/test-chain-core) — framework-agnostic internals shared by both
