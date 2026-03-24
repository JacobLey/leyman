<div style="text-align:center">

# mocha-chain
Chain mocha BDD methods together for deterministic and type safe tests.

[![npm package](https://badge.fury.io/js/mocha-chain.svg)](https://www.npmjs.com/package/mocha-chain)
[![License](https://img.shields.io/npm/l/mocha-chain.svg)](https://github.com/JacobLey/leyman/blob/main/tools/mocha-chain/LICENSE)

</div>

## Contents

- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [Chaining hooks](#chaining-hooks)
- [API](#api)
    - [suite](#suite)
    - [before](#before)
    - [beforeEach](#beforeeach)
    - [test](#test)
    - [afterEach](#aftereach)
    - [after](#after)

For the problem this solves and design rationale, see [WHY-MOCHA-CHAIN.md](./WHY-MOCHA-CHAIN.md).

## Install

```sh
npm i mocha-chain
```

`mocha-chain` is an ESM package and must be imported (not required). It is not a replacement for mocha — it wraps mocha's native methods and has a peer dependency on mocha. The two are fully interchangeable; you can mix `mocha-chain` and native mocha calls in the same suite.

## Example

```ts
import { before, beforeEach, suite } from 'mocha-chain';

suite('Example Database Test', () => {

    // Optionally name hooks
    const withDb = before('Setup DB', async () => {
        const db = await connectToLocalDb();

        await db.createTables();

        return { db };
    });

    withDb.beforeEach(({ db }) => {
        // Both sync and async hooks supported!
        await db.populateData();
    });

    const withDbUser = withDb.beforeEach(() => {
        const user = createFakeUserData();
        // Merge `user` with existing `db`.
        return ({ user });
    });

    withDbUser.test('Can add user', async ({ db, user }) => {
        const success = await db.insert(user);
        expect(success).to.equal(true);
    });

    withDbUser.test('Cannot update user', ({ db, user }) => {
        // This test uses the same `db` as the previous test,
        // but a new `user`!
        const success = await db.update({
            ...user,
            name: 'Johnny B. Goode',
        });
        expect(success).to.equal(false);
    });

    suite('User already exists', () => {

        // Just like normal mocha, this only runs for tests inside the suite
        withDbUser.beforeEach(async ({ db, user }) => {
            await db.insert(user);
        });

        withDbUser.test('Cannot re-add user', ({ db, user }) => {
            const success = await db.insert(user);
            expect(success).to.equal(false);
        });

        withDbUser.test('Can update user', ({ db, user }) => {
            const success = await db.update({
                ...user,
                name: 'Johnny B. Goode',
            });
            expect(success).to.equal(true);
        });
    });

    withDb.test.skip('Have not implemented yet', ({ db, user }) => {
        await db.delete(user);
    });

    withDb.afterEach(({ db }) => {
        // Successfully tear down data in a type safe way.
        await db.clearData();
    });

    withDb.after(function ({ db }) {
        // Access the hook instance, just like mocha!
        this.timeout(1000);
        await db.disconnect();
    });
});
```

## Usage

`mocha-chain` exports hook and test methods that mirror mocha's API. Each method calls the native mocha equivalent under the hood, but extends it with context chaining: if a hook returns an object, all its keys are shallow-merged into a context object that is passed as a parameter to any chained hooks or tests.

Hooks and tests are chained by calling methods on the return value of a hook:

```ts
const withUser = beforeEach(() => {
    return { user: createFakeUserData() };
});

// `user` is fully typed — no null assertions needed
withUser.test('User has a name', ({ user }) => {
    expect(user.name).to.be.a('string');
});
```

The context object passed to each hook or test is a **shallow clone** of the accumulated context, so mutations in one test do not affect others.

All mocha features are preserved: async callbacks, named hooks, `this` as the hook/test instance, `.only()`, and `.skip()`.

`mocha-chain` also enforces that tests and hooks are not nested inside other tests or hooks. Native mocha silently ignores such nesting; `mocha-chain` throws immediately, causing the enclosing test to fail visibly.

## Chaining hooks

Each hook can chain to a subset of other hooks. The table below shows which target hooks can be called on the return value of a source hook.

`suite` sets up hooks and tests but does not itself return chainable context. `test` can be called from hooks but does not return context to chain further.

| Source \ Target | `before` | `beforeEach` | `test` | `afterEach` | `after` |
|-----------------|:--------:|:------------:|:------:|:-----------:|:-------:|
| `before`        | ✅ | ❌ | ✅ | ✅ | ✅ |
| `beforeEach`    | ❌ | ✅ | ✅ | ✅ | ❌ |
| `afterEach`     | ❌ | ❌ | ❌ | ✅ | ❌ |
| `after`         | ❌ | ❌ | ❌ | ❌ | ✅ |

```ts
before(() => {
    return { abc: 123 };
}).beforeEach(({ abc }) => {
    return { efg: abc + 333 };
}).test('Chained', ({ abc, efg }) => {
    expect(abc).to.equal(123);
    expect(efg).to.equal(456);
});
```

## API

### `suite(title, fn)`

Aliases: `describe`, `context`. Mirrors the mocha method of the same name.

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `title` | `string` | — | Required. Name of the suite. |
| `fn` | `() => void` | — | Required. Synchronous callback that registers hooks and tests. Async callbacks result in a failure. |

`suite` does not return chainable context. Calling it inside a hook or test throws immediately.

Supports `.only()` and `.skip()` modifiers with the same parameters:

```ts
suite.only('Only this suite runs', () => {});
describe.skip('This suite is skipped', () => {});
```

---

### `before(title?, fn)`

Alias: `suiteSetup`. Mirrors the mocha method of the same name.

Runs once at the start of the enclosing suite.

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `title` | `string` | — | Optional. Name for the hook, shown in output on failure. |
| `fn` | `(ctx) => object \| void` | — | Required. The hook callback. May be async. If it returns an object, its keys are merged into the chained context. |

**Returns** a chainable handle. The context returned by this hook is accessible in chained `before`, `beforeEach`, `test`, `afterEach`, and `after` calls.

```ts
before('Optional title', () => {});
suiteSetup(async () => {});
```

---

### `beforeEach(title?, fn)`

Alias: `setup`. Mirrors the mocha method of the same name.

Runs before every test in the enclosing suite.

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `title` | `string` | — | Optional. Name for the hook. |
| `fn` | `(ctx) => object \| void` | — | Required. The hook callback. May be async. If it returns an object, its keys are merged into the chained context. |

**Returns** a chainable handle. The context returned by this hook is accessible in chained `beforeEach`, `test`, and `afterEach` calls.

---

### `test(title, fn)`

Aliases: `it`, `specify`. Mirrors the mocha method of the same name.

Runs the actual test.

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `title` | `string` | — | Required. Name of the test. |
| `fn` | `(ctx) => void` | — | Required. The test callback. May be async. |

`test` does not return chainable context.

Supports `.only()` and `.skip()` modifiers:

```ts
test.only('Only this test runs', () => {});
it.skip('This test is skipped', () => {});
```

---

### `afterEach(title?, fn)`

Alias: `teardown`. Mirrors the mocha method of the same name.

Runs after every test in the enclosing suite. Guaranteed to run even if the test fails.

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `title` | `string` | — | Optional. Name for the hook. |
| `fn` | `(ctx) => object \| void` | — | Required. The hook callback. May be async. If it returns an object, its keys are merged into the chained context. |

**Returns** a chainable handle. The context returned by this hook is accessible in chained `afterEach` calls only.

---

### `after(title?, fn)`

Alias: `suiteTeardown`. Mirrors the mocha method of the same name.

Runs once at the end of the enclosing suite. Guaranteed to run even if tests fail.

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `title` | `string` | — | Optional. Name for the hook. |
| `fn` | `(ctx) => object \| void` | — | Required. The hook callback. May be async. If it returns an object, its keys are merged into the chained context. |

**Returns** a chainable handle. The context returned by this hook is accessible in chained `after` calls only.

```ts
after('Optional title', () => {});
suiteTeardown(async () => {});
```
