---
name: testing
description: Writing and running tests (Mocha, mocha-chain, Sinon, C8)
---

# Testing

> Config: [`../../../nx.json`](../../../nx.json) (targets: `mocha-unit-test`, `mocha-integration-test`, `vitest-unit-test`, `coverage-report`) · [`../../../configs/c8rc.json`](../../../configs/c8rc.json)

## Running

```bash
test-only   # build + test (no lint), stops on first failure
test-ci     # verify: lint + build + test + coverage-report — what CI runs
```

Tests run against compiled `dist/`, so a test run always rebuilds first (cached when unchanged).

## Coverage

100% lines, statements, functions and branches, enforced by `coverage-report` as the last step of `test` (`test:report`). An incomplete package fails `test`.

Coverage is per package: only the package's own tests count, not tests of packages that depend on it. Every package must fully test itself.

Checks that span packages, which no single package can test, go in a test-only package under `e2e/` (see [create-package](../create-package/SKILL.md#e2e-packages)). These have no source of their own, so no coverage report.

100% is the floor, not the goal: two `if`s are fully covered by two tests but have four paths. If code is hard to cover, first try controlling its real inputs: write fixtures to a temp dir, or run the CLI as a subprocess (coverage of child processes counts). Reach for `haywire` DI only when the real dependency can't be put into the needed state — see "Dependency injection" in the [coding-patterns skill](../coding-patterns/SKILL.md#dependency-injection-when-to-use-it-when-not-to). Never reach into internals instead.

## Layout

```
test/unit/          ← mirrors src/ (src/lib/foo.ts → test/unit/lib/foo.spec.ts)
test/integration/   ← user-level workflows (CLI runs, real file system), not per-file
test/data/          ← fixtures (any file type)
test/tsconfig.json  ← { "extends": "<relative>/configs/tsconfig.test.json" }
```

Not every file needs its own spec; files exercised as a side effect of other tests are fine.

Unit tests keep Mocha's 2s timeout. Integration tests get 10s, since starting processes is slow on a loaded machine. Give a test more with `this.timeout()` when it runs something heavier, like Nx or a bundler.

Never make a test depend on how long something takes. Assert on order or state, not elapsed time: timers fire in order of expiry, and a timer callback runs only after pending promises settle.

Tests are compiled into `dist-test/` (`tsc-test`) and run against the package's real `dist/`, type-checked against its published `.d.ts`. Paths built from `import.meta.dirname` resolve inside `dist-test/`, so use `../../test/data/...` to reach source fixtures.

## Importing the code under test

- **Public API first**: import the package by its own name (`import { identifier } from 'haywire'`). This tests what consumers get.
- **Internals only when needed**: edge cases that are impractical to reach through the public API import `#internal/<path in dist>` (e.g. `#internal/lib/barrel.js`), mapped in `package.json`:

  ```json
  "imports": { "#internal/*": "./dist/*" }
  ```

  Reuse an existing `#alias` when the package already defines one for that file.
- **Never import `../../src/...`**: it would load a second copy of the module (breaking `instanceof` and singletons) and skip the published types.

## Libraries

- **[`mocha-chain`](../../../tools/test-chain/mocha-chain/)** — import `suite`, `test`, `beforeEach`, etc. from here instead of using Mocha globals (TDD interface). Hooks can return values that become typed context for later hooks and tests. `mocha` itself is still a dev dependency as the runner. Use `vitest-chain` + the `vitest-unit-test` target only for Vitest-specific packages.
- **[`@leyman/expect`](../../../leyman/expect/)** — `import { expect } from '@leyman/expect'`. Chai with `chai-as-promised` registered. Depend on it (dev) instead of `chai`.
- **`expect-type`** — `expectTypeOf(...)` for compile-time type assertions alongside runtime ones.
- **Sinon** + **[`sinon-typed-stub`](../../../tools/sinon-typed-stub/)** — stubs to inject via DI, only for dependencies that actually need DI (not file system or console access). Restore after every test:

```ts
import { verifyAndRestore } from 'sinon';
import { afterEach } from 'mocha-chain';

afterEach(() => {
    verifyAndRestore();
});
```

See the "Tests" sections of the [coding-patterns skill](../coding-patterns/SKILL.md) for how to write individual tests.
