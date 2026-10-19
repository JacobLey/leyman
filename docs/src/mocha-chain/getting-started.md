---
description: Install mocha-chain, chain hooks to pass typed context to tests, and clean up with the same context.
---

# Getting started

## Install

::: code-group

```sh [npm]
npm i -D mocha-chain
```

```sh [pnpm]
pnpm add -D mocha-chain
```

```sh [yarn]
yarn add -D mocha-chain
```

:::

::: tip
mocha-chain wraps Mocha, which is a peer dependency, along with `@types/mocha`. It is ESM only, so test files must be ES modules. Run tests with `mocha` as usual: nothing changes in its configuration.
:::

## Return context from a hook

Import Mocha's functions from `mocha-chain` instead of using the globals. A hook that returns an object passes it to the hooks and tests chained to it:

```ts
interface Db {
    insert(row: object): Promise<boolean>;
    clear(): Promise<void>;
    close(): Promise<void>;
}
declare const connect: () => Promise<Db>;
// ---cut---
import { expect } from 'chai';
import { before, suite } from 'mocha-chain';

suite('Users', () => {
    // Runs once, like Mocha's `before`
    const withDb = before('Connect', async () => ({ db: await connect() }));

    // Runs before each test, with the database from `before`
    const withUser = withDb.beforeEach(() => ({ user: { name: 'Ada' } }));

    withUser.test('Inserts a user', async ({ db, user }) => {
        expect(await db.insert(user)).to.equal(true);
    });

    withDb.afterEach(async ({ db }) => {
        await db.clear();
    });

    withDb.after(async ({ db }) => {
        await db.close();
    });
});
```

- The context is the merge of everything returned along the chain: `withUser`'s tests get both `db` and `user`.
- A hook that returns nothing (or `undefined`) passes the context on unchanged.
- Each test gets a shallow copy, so reassigning a field in one test doesn't affect another. Objects inside it, like `db`, are shared, as they would be with variables.
- Titles are optional for hooks, as in Mocha.

## `this` still works

Callbacks keep Mocha's `this`, for timeouts, retries and skipping. Use a `function`, as with Mocha:

```ts
import { before } from 'mocha-chain';

before(function () {
    this.timeout(10_000);
});
```

## Mixing with Mocha

mocha-chain calls Mocha's own `describe`, `before`, `it` and so on, so plain Mocha hooks and tests can sit next to chained ones, and `.only()` and `.skip()` work as usual. Mocha's other names are exported too: `describe`, `context`, `it`, `specify`, `suiteSetup`, `setup`, `teardown`, `suiteTeardown`, `xdescribe` and `xit`.

## Next steps

- [Chaining hooks](/mocha-chain/guides/chaining): which hooks can follow which, and when each one runs.
- [API reference](/mocha-chain/reference/api): every function.
- [vitest-chain](/vitest-chain/): the same, for Vitest.
