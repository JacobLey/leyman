# Testing

> Framework docs: [Mocha](https://mochajs.org/) · [Chai](https://www.chaijs.com/) · [Sinon](https://sinonjs.org/) · [C8](https://github.com/bcoe/c8)
> Workspace test config: [`../../nx.json`](../../nx.json) (targets: `mocha-unit-test`, `mocha-integration-test`, `coverage-report`)

## Running Tests

```bash
# Full test suite for all packages (lint + build + test)
nx run-many -t test

# Tests + coverage enforcement (what CI runs)
test-ci

# Tests only — skip lint/format checks
test-only
```

> **Coverage is enforced separately** — `nx run-many -t test` runs tests and collects coverage data, but `nx run-many -t coverage-report` validates the 100% thresholds. Both must pass in CI.

That means coverage can come from tests on the package, as well as tests from dependents. That is useful for cases where "testing" the code requires a lot more work than just seeing it in action.

We should still test code in the package itself as much as possible, but do not overcomplicate unnecessarily.

## Coverage Requirements

All packages require **100% coverage** across lines, statements, functions, and branches (enforced by C8 via `configs/c8rc.json`). Coverage is collected during `mocha-unit-test` and `mocha-integration-test`, then merged and validated by `coverage-report`.

Coverage reports land at `.coverage/project/<package-name>/report/`.

100% coverage is a _minimum_ enforcement.

Take the example function:

```js
const doStuff = () => {
    if (foo) {
        doFoo();
    }
    if (bar) {
        doBar();
    }
}
```

There are technically 4 paths (not including the possibilty of throwing), but 100% coverage is possible in just 2 passes. That doesn't mean we have to (or should) test every possible cardinality, but it means that full test coverage just scrapes the surface of what is actually happening.

Code should be written such that it is testable, and therefore maintainable. Non-testable code means a missing abstraction or poor implementation. See packages like `haywire` and `haywire-laucher` for solutions around providing test coverage for package internals and top-level executables via dependency injection.

## Writing Tests

### File Structure

```
src/
  tests/
    unit/           ← unit tests (*.spec.ts)
    integration/    ← integration tests (*.spec.ts)
```

Unit tests should generally be named/placed after the file it tests.

e.g. a file under `src/models/lib/foo-bar.ts` should have a test `src/models/lib/foo-bar.spec.ts`. Not every file needs to have a test, especially if it is just plain exports or functions which are called as a side-effect of other tests.

Integration tests should _not_ try to match implementation files, and instead focus on the high level user workflow. For example testing the CLI functionality, or executing tasks on the actual codebase.

### Common Imports

#### [mocha-chain](../../tools/mocha-chain/)

A wrapper around [Mocha](https://mochajs.org/), provides better type safety, but otherwise follows same format.

Mocha must be installed (peer dependency) as it is still the core test runner, but doesn't need to be imported directly.

Tests are configured to use the `TDD` interface (`before`, `after`, `suite`...).

#### [Chai](https://www.chaijs.com/)

Assertion library. For assertions around promises (primarily "will reject") see `chai-as-promised`, usually wrapped via a `chai-hooks.ts` file.

#### [Sinon](https://sinonjs.org/)

Creates mockable and spyable instances to inject into tests (plays very well with `haywire`).

For better type-safe usage, see [sinon-typed-stub](../../tools/sinon-typed-stub/).

Always restore after each test.

```ts
import { verifyAndRestore } from 'sinon';

afterEach(() => {
    verifyAndRestore();
});
```