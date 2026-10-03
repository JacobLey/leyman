---
name: testing
description: Writing and running tests (Mocha, mocha-chain, Sinon, C8)
---

# Testing

> Config: [`../../../nx.json`](../../../nx.json) (targets: `mocha-unit-test`, `mocha-integration-test`, `vitest-unit-test`, `coverage-report`) · [`../../../configs/c8rc.json`](../../../configs/c8rc.json)

## Running

```bash
test-only   # build + test, skips lint/format (-c no-check), stops on first failure
test-ci     # lint + build + test + coverage-report — what CI runs
```

Tests run against compiled `dist/`, so a test run always rebuilds first (cached when unchanged).

## Coverage

100% lines, statements, functions and branches, enforced by `coverage-report` as the last step of `test` (`test:report`). An incomplete package fails `test`.

Coverage is per package: only the package's own tests count, not tests of packages that depend on it. Every package must fully test itself.

100% is the floor, not the goal: two `if`s are fully covered by two tests but have four paths. If code is hard to cover, it is usually missing an abstraction. Use `haywire` DI (see `haywire-launcher` for covering CLI entry points) rather than reaching into internals.

## Layout

```
src/tests/unit/          ← mirrors src/ (src/lib/foo.ts → src/tests/unit/lib/foo.spec.ts)
src/tests/integration/   ← user-level workflows (CLI runs, real file system), not per-file
```

Not every file needs its own spec; files exercised as a side effect of other tests are fine.

## Libraries

- **[`mocha-chain`](../../../tools/test-chain/mocha-chain/)** — import `suite`, `test`, `beforeEach`, etc. from here instead of using Mocha globals (TDD interface). Hooks can return values that become typed context for later hooks and tests. `mocha` itself is still a dev dependency as the runner. Use `vitest-chain` + the `vitest-unit-test` target only for Vitest-specific packages.
- **[`@leyman/expect`](../../../leyman/expect/)** — `import { expect } from '@leyman/expect'`. Chai with `chai-as-promised` registered. Depend on it (dev) instead of `chai`.
- **`expect-type`** — `expectTypeOf(...)` for compile-time type assertions alongside runtime ones.
- **Sinon** + **[`sinon-typed-stub`](../../../tools/sinon-typed-stub/)** — stubs to inject via DI. Restore after every test:

```ts
import { verifyAndRestore } from 'sinon';
import { afterEach } from 'mocha-chain';

afterEach(() => {
    verifyAndRestore();
});
```

See the "Tests" sections of the [coding-patterns skill](../coding-patterns/SKILL.md) for how to write individual tests.
