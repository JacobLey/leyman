---
description: Which mocha-chain and vitest-chain hooks can follow which, how context merges, and when each hook runs.
---

# Chaining hooks

Every hook returns a handle with the hooks and tests that can follow it. A chained hook or test receives the context of every hook before it in the chain, merged into one object.

## What can follow what

A hook can only be followed by hooks that run after it, for the same tests:

| After \ Can chain | `before` | `beforeEach` | `test` | `afterEach` | `after` |
|-------------------|:--------:|:------------:|:------:|:-----------:|:-------:|
| `before`          | ✅ | ✅ | ✅ | ✅ | ✅ |
| `beforeEach`      | | ✅ | ✅ | ✅ | |
| `afterEach`       | | | | ✅ | |
| `after`           | | | | | ✅ |

`suite` and `test` return nothing to chain. In [vitest-chain](/vitest-chain/), `before` and `after` are `beforeAll` and `afterAll`.

So a value from `beforeEach` can never reach `after`, which runs once for the whole suite, and teardown hooks only see setup that ran for the same tests:

```ts
import { before } from 'mocha-chain';

before(() => ({ abc: 123 }))
    .beforeEach(({ abc }) => ({ efg: abc + 333 }))
    .test('Chained', ({ abc, efg }) => {
    //                       ^?
    });
```

## Branching

A handle can be chained more than once. Each chain is separate:

```ts
import { beforeEach, suite } from 'mocha-chain';

suite('Branches', () => {
    const withA = beforeEach(() => ({ a: 1 }));
    const withB = withA.beforeEach(() => ({ b: 2 }));

    // Gets `a` only: `withB`'s hook still runs (it is in the same suite), but its context isn't passed here
    withA.test('a', ({ a }) => {});
    withB.test('a and b', ({ a, b }) => {});
});
```

The chain only decides which context a hook or test receives. When hooks run is up to the framework, as usual: every `beforeEach` in a suite runs before each of its tests, chained or not, in the order they were declared.

## Suites

Hooks and chains cross into nested suites, as Mocha's hooks do. A hook declared in a nested suite only runs for that suite's tests:

```ts
import { beforeEach, suite } from 'mocha-chain';

suite('Outer', () => {
    const withUser = beforeEach(() => ({ user: { name: 'Ada', admin: false } }));

    suite('Admins', () => {
        const withAdmin = withUser.beforeEach(({ user }) => ({ admin: { ...user, admin: true } }));

        withAdmin.test('is an admin', ({ admin }) => {});
    });

    withUser.test('is not an admin', ({ user }) => {});
});
```

At runtime, a field returned again replaces the earlier value. Its type is the intersection of both, though, so returning `user` with a different type would make it `never`. Add a new field instead, as `withAdmin` does.

## Misplaced declarations

Declaring a test, hook or suite while a test or hook is running throws, failing the test it was declared in. Mocha would silently never run it.
