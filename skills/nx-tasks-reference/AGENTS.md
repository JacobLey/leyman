# Nx Task Reference

Every package in this repo is wired into the same lifecycle via `nx.json` `targetDefaults`. When adding or modifying a `project.json`, declare the targets the package needs as `{}` — the full implementation comes from the targetDefault.

The orchestration targets (e.g. `check:_`, `check:lint`, `check`) will be autopopulated via `nx run @leyman/main:lifecycle`. These are just NOOP commands, but ensure consistent order of execution (e.g. Ensures code is built before testing, and coverage reports are reset before writing new ones).

See [`lifecycle.json`](../../leyman/main/lifecycle.json) for the authoritative binding of each work target to its lifecycle hook.

`lifecycle.json` is this monorepo's implementation of [`nx-lifecycle`](../../apps/nx-lifecycle/)

---

## Work Targets

The following section is a description of what each task attempts to accomplish, as well as guidance of when to add it to `project.json`. Not every project is going to use every task (e.g. many "lib" type projects will skip integration testing). See `lifecycle.json` or `nx.json` to see how it fits into the orchestration.

No targets (beside repo-wide commands like `lifecycle` itself) should operate outside the `nx-lifecycle` orchestration.

That means if a new target is added, it should be added to `lifecycle.json`.

### `biome`

Formats source files in-place using [Biome](https://biomejs.dev/).

**Configurations:**
- *(default)* — formatting check, fails on violations
- `fix` — Runs in `--write` mode, formatting all files

**Add when:** Every package.

---

### `eslint`

Lints TypeScript source using ESLint. Uses the project-local `eslint.config.js`.

**Configurations:**
- *(default)* — lint check, fails on violations
- `fix` — auto-fixes fixable violations

**Add when:** Add to all TypeScript packages (has `tsconfig.json`).

---

### `barrelify`

Rewrites `index.ts` files that contain an `// AUTO-BARREL` marker with correct re-export statements. 

**Add when:** The package has any `index.ts` files marked with `// AUTO-BARREL`.

---

### `delete-dist`

Removes the `./dist` directory before building begins, ensuring no stale build artifacts carry over between runs.

**Add when:** The package compiles TypeScript to `./dist`. Add to all packages with a `tsc` target.

---

### `update-ts-references`

Keep `tsconfig.json` `references` in sync with the package's inter-package dependencies.

**Add when:** The package has a `tsconfig.json`.

---

### `tsc`

Compiles TypeScript using SWC (fast transpilation) and `tsc` (declaration file generation + type checking).

Output goes to `./dist`.

**Add when:** Add to all TypeScript packages (has `tsconfig.json`).

---

### `populate-files`

Generates static output files by running `load-populate-files` against `./dist/file-content.js`. Expects the package to export a default array of `PopulateFileParams` from `src/file-content.ts`. Output goes to `./out`.

**Add when:** The package defines a `src/file-content.ts` file.

---

### `coverage-reset`

Deletes the per-project coverage temp directory (`.coverage/project/{projectName}/tmp`) before tests run. Ensures coverage data from a previous run does not contaminate the current run.

**Add when:** The package has tests. Add whenever `mocha-unit-test` or `mocha-integration-test` is present.

---

### `mocha-unit-test`

Runs Mocha unit tests from `./dist/tests/unit/**/*.spec.*js` under C8 coverage instrumentation.

**Add when:** The package has unit tests in `src/tests/unit/`. Add to virtually all packages.

---

### `mocha-integration-test`

Runs Mocha integration tests from `./dist/tests/integration/**/*.spec.*js` under C8 coverage instrumentation.

**Add when:** The package has integration tests in `src/tests/integration/`.

---

### `coverage-report`

Validates 100% test coverage by merging all C8 temp data and checking thresholds. Uses `scripts/nx/coverage-report.sh`.

**Add when:** The package has mocha tests and must enforce coverage thresholds.

---

### `pnpm-dedicated-lockfile`

Computes a per-package hash of `pnpm-lock.yaml` and writes it to `.pnpm-lock-hash`. This hash is used as a `ts-source` input so that any dependency change invalidates the package's build and test caches.

**Lifecycle hook:** `install`

**Add when:** Every project should use this.

---

## Typical `project.json` Templates

### Standard TypeScript package (unit tests only)

```json
{
  "$schema": "../../leyman/main/node_modules/nx/schemas/project-schema.json",
  "name": "my-package",
  "targets": {
    "pnpm-dedicated-lockfile": {},
    "biome": {},
    "eslint": {},
    "update-ts-references": {},
    "delete-dist": {},
    "tsc": {},
    "coverage-reset": {},
    "mocha-unit-test": {},
    "coverage-report": {},
    "check:_": {},
    "check:lint": {},
    // lots more of ignorable nx-lifecycle managed targets
  }
}
```

Target order in `project.json` technically does not matter, but try to put them in the order described above, as they generally reflect the order they will run.

`nx-lifecycle` will ensure all orchestration targets go at the end.