<div style="text-align:center">

# mocha-chain
Chain mocha BDD methods together for determinstic and type safe tests.

[![npm package](https://badge.fury.io/js/mocha-chain.svg)](https://www.npmjs.com/package/mocha-chain)
[![License](https://img.shields.io/npm/l/mocha-chain.svg)](https://github.com/JacobLey/leyman/blob/main/tools/mocha-chain/LICENSE)

</div>

## Table of Contents

* [Introduction](#introduction)
* [Installation](#installation)
* [Example](#example)
* [Usage](#usage)
* [Chaining hooks](#chaining-hooks)
* [API](#api)

## Introduction

[Mocha](https://mochajs.org/) is a powerful and popular testing framework. Refer to the linked documentation for the best examples, but this is a simple demonstration:

```ts
import { suite, beforeEach, test } from 'mocha';
import { expect } from 'chai';

suite('Division.divide', () => {

    let division: Division | null = null;

    beforeEach(() => {
        division = new Division();
    });

    test('success', () => {
        expect(division!.divide(12, 3)).to.equal(4);
    });

    test('failure', () => {
        expect(() => division!.divide(12, 0)).to.throw(Error);
    });
});
```

In the example above, we can create a new instance of our `Divison` class before every test that runs in the `Division.divide()` suite. Then we can assert the expected behavior in each test.

Functionally, this works exactly as we want, but has a few drawbacks.

The first is that it is not type safe. We have to define the `division` variable in the shared scope, but only define it inside the `beforeEach` hook. While we know the hook will run before our test, typescript is not convinced, so we have to explicitly override the types at test time. If our tests are not type safe themselves, how can we be confident they are testing type safe interfaces?

What if we just created a single instance of `Division` and shared it across all tests?

```ts
const division = new Division();;

test('success', () => {
    expect(division.divide(12, 3)).to.equal(4);
});
```

Now it is type safe! But what if our class is mutable, or has some other internal state that individual tests can impact? This may be the case if we are working with an local database, or using a library like [Sinon](https://sinonjs.org/) for setting up mocks _per test_.

So we could just ditch the `beforeEach` hook altogether, but this will begin to violate [DRY](https://en.wikipedia.org/wiki/Don%27t_repeat_yourself), and we lose out on all the perks of mocha hooks, like teardowns of mocks.

Ideally we can still use these mocha hooks, but chain the results to be accessed in following hooks and tests.

Entry `mocha-chain`, which does exactly that.

## Installation

`npm i mocha-chain`

Mocha-chain is an ESM package. It _must_ be imported.

The type safety of mocha-chain is a major benefit, but does not require typescript or any further build step to support. It is not a _replacement_ for mocha, but works alongside it. In fact there is a peer dependency on mocha and is completely interchangable.

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

`mocha-hookup` exports hook and test methods mirroring `mocha`. As stated above, this is not a _replacement_ of mocha as these methods will invoke the native `mocha` methods under the hood.

However they provide the extra benefit of chaining the methods so any values returned by that hook (and any previous hooks) will be available to following hooks and tests. The values are returned as an object, with all keys merged with existing context object.

Besides the extra context as a parameter and the added data in the response, it otherwise maintains the API of mocha methods, including async and sync support, named hooks, and passing the test instance as `this`.

Similarly you can mark tests and suites with `.only()` and `.skip()`.

Given that tests and hooks are just function calls, it is easy to _accidentally_ perform the following:
```ts
suite('FooBar', () => {

    test('Does foo', () => {

        test('Does bar', () => {
            // This will silently never run!
        });
    });
});
```
`mocha-hookup` will also enforce that the `Does bar` test above will immediately throw an error, causing `Does foo` to fail. 

Native mocha behavior does not support embedding tests (or hooks, or suites...), but also does not enforce against it.

## Chaining hooks

A `before` hook can have a context that is passed to a `beforeEach` hook. Similarly a `beforeEach` hook can have a context that is later referenced in both the test and the teardown `afterEach` hook.

But you can't access context of an `afterEach` hook in a test. Or `before` from an `after`.

The following table shows which hooks can be chained. 

Note that `suite` is just used for setting up further hooks and tests, and does not return a chainable interface itself. It also runs _before_ any hooks run, so it does not have any access to context itself.

Similarly `test` can chained from hooks, but does not return any context.


| chainable? | `before` | `beforeEach` | `afterEach` | `after` |
|------------|:------:|:------:|:------:|:------:|
| `before` | ✅ | ❌ | ❌ | ❌ |
| `beforeEach` | ✅ | ✅ | ❌ | ❌ |
| `test` | ✅ | ✅ | ✅ | ❌ |
| `afterEach` | ✅ | ✅ | ✅ | ❌ |
| `after` | ✅ | ❌ | ❌ | ✅ |

See the [API](#api) section below for more details on the individual hooks, but the chaining behavior is the same for all.

The chained hook (or test) will accept a callback which will now be called with an additional parameter which is the context of previous hooks. It can further return more context which will be merged with the existing.

Note that the context object passed to further hooks is a shallow clone of the returned context, so it will be a new object on for every hook and test.

```ts
before(() => {
    return { abc: 123 };
}).beforeEach(({ abc }) => {
    return ({ efg: abc + 333 });
}).test('Chained', ({ abc, efg }) => {
    expect(abc).to.equal(123);
    expect(efg).to.equal(456);
});
```

## API

### Methods

#### `suite`

Aliases `describe` and `context`. Mirrors `mocha` method of the same name.

First parameter is the title of the suite. The second is a callback function which can set up hooks and tests internally to the context of this suite.

Callback _must_ be synchronous, and async methods will result in a failure.

Calling this method inside another hook or test will result in an error.

Instead of using the method directly, may be modified with `.skip()` or `.only()` with the same parameters:

```ts
suite.only('Only this will run', () => {});
describe.skip('This does not run', () => {});
```

### `before`

Alias `suiteSetup`. Mirrors `mocha` method of the same name.

A hook that runs at the very start of a suite. Optionally supports a title as the first argument, otherwise takes a callback that will be invoked for the hook. The callback may be async.

```ts
before('Optional title', () => {});
suiteSetup(async () => {});
```

If the callback returns an object, all keys are cloned over to chained context. This context is accessible in chained hooks `before`, `beforeEach`, `test`, `afterEach`, and `after`.

### `beforeEach`

Alias `setup`. Mirrors `mocha` method of the same name.

A hook that runs before every test. Optionally supports a title as the first argument, otherwise takes a callback that will be invoked for the hook. The callback may be async.

If the callback returns an object, all keys are cloned over to chained context. This context is accessible in chained hooks `beforeEach`, `test`, `afterEach`.

### `test`

Alias `it`, `specify`. Mirrors `mocha` method of the same name.

Runs the actual test, supporting both synchronous and asynchronous execution.

Instead of using the method directly, may be modified with `.skip()` or `.only()` with the same parameters:

```ts
test.only('Only this will run', () => {});
it.skip('This does not run', () => {});
```

### `afterEach`

Alias `teardown`. Mirrors `mocha` method of the same name.

A hook that runs after every test. Optionally supports a title as the first argument, otherwise takes a callback that will be invoked for the hook. The callback may be async.

If the callback returns an object, all keys are cloned over to chained context. This context is accessible in chained hook `afterEach`.

### `before`

Alias `suiteTeardown`. Mirrors `mocha` method of the same name.

A hook that runs at the very end of a suite. Optionally supports a title as the first argument, otherwise takes a callback that will be invoked for the hook. The callback may be async.

```ts
after('Optional title', () => {});
suiteTeardown(async () => {});
```

If the callback returns an object, all keys are cloned over to chained context. This context is accessible in chained hook `after`.