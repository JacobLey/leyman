<div style="text-align:center">

# mocha-chain
Chain mocha BDD methods together for deterministic and type safe tests.

[![npm package](https://badge.fury.io/js/mocha-chain.svg)](https://www.npmjs.com/package/mocha-chain)
[![License](https://img.shields.io/npm/l/mocha-chain.svg)](https://github.com/JacobLey/leyman/blob/main/tools/test-chain/mocha-chain/LICENSE)

</div>

## Contents

- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [Chaining hooks](#chaining-hooks)
- [API](#api)
    - [suite](#suitetitle-fn)
    - [before](#beforetitle-fn)
    - [beforeEach](#beforeeachtitle-fn)
    - [test](#testtitle-fn)
    - [afterEach](#aftereachtitle-fn)
    - [after](#aftertitle-fn)

Guides and the full reference are on the [docs site](https://jacobley.github.io/leyman/packages/mocha-chain/). For the problem this solves and design rationale, see [WHY-MOCHA-CHAIN.md](https://github.com/JacobLey/leyman/blob/main/tools/test-chain/mocha-chain/WHY-MOCHA-CHAIN.md).

## Install

```sh
npm i --save-dev mocha-chain mocha @types/mocha
```

`mocha-chain` is an ESM package for Node.js 24 or later, and must be imported (not required), so test files must be ES modules. It is not a replacement for mocha — it wraps mocha's native methods. `mocha` is a required peer dependency, and `@types/mocha` an optional one (for TypeScript). The two are fully interchangeable; you can mix `mocha-chain` and native mocha calls in the same suite.

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

    withDb.beforeEach(async ({ db }) => {
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

    withDbUser.test('Cannot update user', async ({ db, user }) => {
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

        withDbUser.test('Cannot re-add user', async ({ db, user }) => {
            const success = await db.insert(user);
            expect(success).to.equal(false);
        });

        withDbUser.test('Can update user', async ({ db, user }) => {
            const success = await db.update({
                ...user,
                name: 'Johnny B. Goode',
            });
            expect(success).to.equal(true);
        });
    });

    withDb.test.skip('Have not implemented yet', async ({ db }) => {
        const user = createFakeUserData();
        await db.delete(user);
    });

    withDb.afterEach(async ({ db }) => {
        // Successfully tear down data in a type safe way.
        await db.clearData();
    });

    withDb.after(async function ({ db }) {
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

The context object passed to each hook or test is a **shallow clone** of the accumulated context, so reassigning a key in one test does not affect others. Objects inside it, like `db`, are shared.

A hook returns an object, a `Promise` of one, or nothing (`undefined`, `null` or a `Promise<void>`); returning anything else (a number, a string) is a type error. Only the object's own enumerable properties are copied into the context, so return `{ db }` rather than a class instance (`return db`), whose methods would be typed on the context but missing at runtime. A hook written as an arrow function without braces (`beforeEach(() => db.clear())`) returns whatever that call returns, and merges it: use braces when the hook shouldn't add context.

If two hooks return the same key, the later value replaces the earlier at runtime, but the type is the intersection of both (`never` for unrelated types). Return a new key instead.

A callback that declares a second parameter after the context gets mocha's `done` callback, as in mocha: `test('Name', (ctx, done) => { ... })`.

All mocha features are preserved: async callbacks, named hooks, `this` as the hook/test instance, `.only()`, and `.skip()`.

`mocha-chain` also enforces that tests and hooks are not nested inside other tests or hooks. Native mocha silently ignores such nesting; `mocha-chain` throws immediately, causing the enclosing test to fail visibly.

A hook that runs before the hook it is chained from fails with `HookOrderError` (from [test-chain-core](https://www.npmjs.com/package/test-chain-core)) instead of receiving an incomplete context.

## Chaining hooks

Each hook can chain to a subset of other hooks. The table below shows which target hooks can be called on the return value of a source hook.

`suite` sets up hooks and tests but does not itself return chainable context. `test` can be called from hooks but does not return context to chain further.

| Source \ Target | `before` | `beforeEach` | `test` | `afterEach` | `after` |
|-----------------|:--------:|:------------:|:------:|:-----------:|:-------:|
| `before`        | ✅ | ✅ | ✅ | ✅ | ✅ |
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

The chain only decides which context a test receives. Which hooks _run_ is up to Mocha, as usual: every `beforeEach` in a suite runs before each of its tests, including tests chained from an earlier handle that never see its context. A hook whose side effects only some tests want (inserting rows, starting a server) belongs in a nested `suite` with those tests. See [Branching](https://jacobley.github.io/leyman/packages/mocha-chain/guides/chaining#branching).

A handle can be used inside nested suites, where a hook chained from it runs only for that suite's tests.

## API

### `suite(title, fn)`

Aliases: `describe`, `context`. Mirrors the mocha method of the same name.

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `title` | `string` | — | Required. Name of the suite. |
| `fn` | `() => void` | — | Required. Synchronous callback that registers hooks and tests. An async callback throws a `TypeError` ("Suite callback must be synchronous") when the file loads, and is a type error. |

`suite` does not return chainable context. Calling it inside a hook or test throws immediately.

Supports `.only()` and `.skip()` modifiers with the same parameters:

```ts
suite.only('Only this suite runs', () => {});
describe.skip('This suite is skipped', () => {});
```

`xdescribe` is `suite.skip`, and `xit` is `test.skip`.

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
