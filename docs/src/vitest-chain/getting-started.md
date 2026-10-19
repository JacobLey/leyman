---
description: Install vitest-chain, configure Vitest's hook order, and chain hooks to pass typed context.
---

# Getting started

## Install

::: code-group

```sh [npm]
npm i -D vitest-chain
```

```sh [pnpm]
pnpm add -D vitest-chain
```

```sh [yarn]
yarn add -D vitest-chain
```

:::

::: tip
vitest-chain wraps Vitest, which is a peer dependency. It is ESM only.
:::

## Run hooks in order

Context flows forward, from each hook to the next. By default (`sequence.hooks: 'stack'`), Vitest runs `afterEach` and `afterAll` hooks in reverse, so a teardown hook would run before the one it's chained to. Run them in the order they're declared instead:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        sequence: { hooks: 'list' },
    },
});
```

Without it, a hook that runs too early fails with `HookOrderError`, rather than receiving an incomplete context.

## Chain hooks

Import Vitest's hooks from `vitest-chain`. A hook that returns an object passes it to the hooks and tests chained to it:

```ts
interface Db {
    createUser(): Promise<{ id: number }>;
    deleteUser(id: number): Promise<void>;
    close(): Promise<void>;
}
declare const connect: () => Promise<Db>;
// ---cut---
import { expect } from 'vitest';
import { beforeAll, describe } from 'vitest-chain';

describe('Users', () => {
    const withDb = beforeAll(async () => ({ db: await connect() }));

    const withUser = withDb.beforeEach(async ({ db }) => ({ user: await db.createUser() }));

    withUser.test('has an id', ({ user }, { task }) => {
    //                                      ^?
        expect(user.id).toBeTypeOf('number');
    });

    withUser.afterEach(async ({ db, user }) => {
        await db.deleteUser(user.id);
    });

    withDb.afterAll(async ({ db }) => {
        await db.close();
    });
});
```

- Chained callbacks receive the context first, then Vitest's usual arguments: the test context for tests and per-test hooks, and the suite for `beforeAll` and `afterAll`. Hooks that aren't chained receive only Vitest's arguments.
- A hook that returns nothing passes the context on unchanged.
- If a hook fails, the `afterEach` and `afterAll` hooks chained to it still run, with the context from before the failure.

Chains follow the same rules as mocha-chain's. See [Chaining hooks](/mocha-chain/guides/chaining).

## Next steps

- [API reference](/vitest-chain/reference/api): every function.
- [mocha-chain](/mocha-chain/): the same, for Mocha.
