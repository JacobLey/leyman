---
name: nx-tasks-reference
description: What each nx.json target does and when to add it to project.json
---

# Nx Task Reference

Every package in this repo is wired into the same lifecycle via `nx.json` `targetDefaults`. When adding or modifying a `project.json`, declare the targets the package needs as `{}` — the full implementation comes from the targetDefault.

The orchestration targets (`check:_`, `check:lint`, `check`, …) are no-ops that only enforce ordering. `nx run @leyman/main:lifecycle` adds them to `project.json` and generates their `dependsOn` from [`lifecycle.json`](../../../leyman/main/lifecycle.json). See the [lifecycle skill](../../../leyman/main/.claude/skills/lifecycle/SKILL.md).

### Dependency changes and caching

Nx hashes each project's npm dependencies (direct and transitive, resolved from `pnpm-lock.yaml`) through the project graph, so a dependency change only invalidates caches of projects that actually depend on it. The `ts-source` named input sets `{ "externalDependencies": [] }` to opt out of Nx's default for `nx:run-commands` targets, which otherwise hashes _every_ external package in the workspace (`AllExternalDependencies`) and busts all caches on any lockfile change. Use `nx show target inputs <project>:<target>` to inspect what is hashed.

---

## Work Targets

Every work target except repo-wide commands (like `lifecycle` itself) and `coverage-report` must be bound in `lifecycle.json`.

### `biome`

Checks formatting with Biome. `-c fix` writes changes. `-c no-check` is a no-op.

**Add when:** Every package.

---

### `eslint`

Lints with the project's `eslint.config.js`. `-c fix` auto-fixes. `-c no-check` is a no-op.

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

**Add when:** The package has tests. Add whenever `mocha-unit-test`, `mocha-integration-test`, or `vitest-unit-test` is present.

---

### `mocha-unit-test`

Runs Mocha unit tests from `./dist/tests/unit/**/*.spec.*js` under C8 coverage instrumentation.

**Add when:** The package has unit tests in `src/tests/unit/`. Add to virtually all packages.

---

### `mocha-integration-test`

Runs Mocha integration tests from `./dist/tests/integration/**/*.spec.*js` under C8 coverage instrumentation.

**Add when:** The package has integration tests in `src/tests/integration/`.

---

### `vitest-unit-test`

Runs Vitest unit tests from `./dist/tests/unit/**/*.spec.js` under C8 coverage instrumentation, using the shared [`configs/vitest.config.js`](../../../configs/vitest.config.js).

The shared config runs pre-compiled tests with native `import` and the `threads` pool (so C8 can collect V8 coverage), and sets `sequence.hooks: "list"` (required by `vitest-chain`).

**Add when:** The package tests with Vitest instead of Mocha (e.g. `vitest-chain`). Use instead of `mocha-unit-test`.

---

### `coverage-report`

Validates 100% coverage by merging the C8 data from this project's tests and from every project that depends on it (`scripts/nx/coverage-report.sh`). Not part of the lifecycle; `test-ci` runs it after `test`.

**Add when:** The package has any test target.

---

## Typical `project.json` Templates

### Standard TypeScript package (unit tests only)

```json
{
  "$schema": "../../leyman/main/node_modules/nx/schemas/project-schema.json",
  "name": "my-package",
  "targets": {
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
