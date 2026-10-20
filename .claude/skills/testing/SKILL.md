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

Packages whose job is talking to a service (e.g. `tools/lease-cache` on Valkey, and demos in `demos/`, see [create-package](../create-package/SKILL.md#demo-packages)) test against the real service, running as a devcontainer sidecar and a Dagger service, rather than a mock. A mock could only assume how the service behaves, and that behavior (atomicity, expiry) is what these packages rely on. Each test isolates its keys (e.g. by a unique prefix) rather than clearing the shared service.

The services, at the same hostnames in the devcontainer and in Dagger's `Test`:

| Service | Reached at | Isolation |
|---|---|---|
| Valkey | `valkey:6379` | A unique key prefix per test |
| Postgres | `DATABASE_URL` (`postgres://postgres:postgres@postgres:5432/postgres`) | A database of its own per test, never the shared `postgres` database. Keep each test's pool small (a few connections): tests across parallel Nx tasks share the server's `max_connections` |

Without the service a test needs, it fails rather than skipping. Neither service keeps data across restarts, so a test sets up everything it relies on.

100% is the floor, not the goal: two `if`s are fully covered by two tests but have four paths. If code is hard to cover, first try controlling its real inputs: write fixtures to a temp dir, or run the CLI as a subprocess (coverage of child processes counts). Reach for `haywire` DI only when the real dependency can't be put into the needed state — see "Dependency injection" in the [coding-patterns skill](../coding-patterns/SKILL.md#dependency-injection-when-to-use-it-when-not-to). Never reach into internals instead.

## Layout

```
test/unit/          ← mirrors src/ (src/lib/foo.ts → test/unit/lib/foo.spec.ts)
test/integration/   ← user-level workflows (CLI runs, real file system), not per-file
test/data/          ← fixtures (any file type)
test/tsconfig.json  ← { "extends": "<relative>/configs/tsconfig.test.json", "references": [{ "path": ".." }] }
```

The reference to the package's own project is for the editor: tests import the package by name, which resolves to its `dist/`, and builds delete and rewrite `dist/`. With the reference, the language server reads `src/` instead, so a rebuild doesn't break types in open test files. `tsc -p ./test` still checks against `dist/`. e2e packages have no project of their own to reference.

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
- **Sinon** — stubs to inject via DI, only for dependencies that actually need DI (not file system or console access). Restore after every test:

```ts
import { verifyAndRestore } from 'sinon';
import { afterEach } from 'mocha-chain';

afterEach(() => {
    verifyAndRestore();
});
```

See the "Tests" sections of the [coding-patterns skill](../coding-patterns/SKILL.md) for how to write individual tests.
