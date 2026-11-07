---
name: mocha-chain
description: Writing Mocha tests with mocha-chain (hooks that return typed context to later hooks and tests, which hooks may chain from which, and why a hook's side effects still reach every test in its suite)
---

# mocha-chain

`mocha-chain` mirrors Mocha's TDD interface (`suite`, `before`, `beforeEach`, `test`, `afterEach`, `after`) and adds typed context: an object a hook returns is shallow-merged into the context passed to whatever is chained from it. Import them from `mocha-chain` instead of using Mocha's globals; `mocha` stays a dev dependency, as the runner. Reference: the package's [README](https://github.com/JacobLey/leyman/blob/main/tools/test-chain/mocha-chain/README.md).

```ts
import { before, suite } from 'mocha-chain';

suite('Users', () => {
    const withDb = before(async () => ({ db: await connect() }));
    const withUser = withDb.beforeEach(() => ({ user: fakeUser() }));

    withUser.test('Inserts a user', async ({ db, user }) => {
        expect(await db.insert(user)).to.equal(true);
    });

    withDb.after(async ({ db }) => {
        await db.close();
    });
});
```

## Rules

- **The chain passes context; the suite decides which hooks run.** `withA.beforeEach(fn)` is a plain Mocha `beforeEach` of the suite it's called in: it runs before every test there, including tests chained from other handles, which just don't receive its context. A hook with side effects only some tests want (inserting rows, starting a server) goes in a nested `suite` with those tests.
- A hook returns a plain object (or a `Promise` of one), or nothing. Return `{ db }`, never a class instance: only own enumerable properties are copied, and an instance fails with `HookContextError`. An arrow function without braces returns what its call returns, so use braces when a hook shouldn't add context.
- Return a new key rather than one an earlier hook returned: the later value wins at runtime, but the type is the intersection of both.
- What chains from what follows when hooks run: `before` chains to anything; `beforeEach` to `beforeEach`, `test` and `afterEach`; `afterEach` only to `afterEach`; `after` only to `after`. A hook that would run before the one it chains from fails with `HookOrderError`.
- Never declare a test or hook inside another test or hook: Mocha ignores it silently, `mocha-chain` throws.
- Everything else is Mocha's: `this` as the test or hook (use `function`, typed `this: Context`, for `this.timeout()`), a second `done` parameter, named hooks, `.only` and `.skip`.
