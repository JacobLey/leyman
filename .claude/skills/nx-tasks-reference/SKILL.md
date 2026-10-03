---
name: nx-tasks-reference
description: What each nx.json target does and when to add it to project.json
---

# Nx Task Reference

Every package in this repo is wired into the same lifecycle via `nx.json` `targetDefaults`. When adding or modifying a `project.json`, declare the targets the package needs as `{}` — the full implementation comes from the targetDefault.

The orchestration targets (`check:_`, `check:lint`, `check`, …) are no-ops that only enforce ordering. `nx run @leyman/main:lifecycle` adds them to `project.json` and generates their `dependsOn` from [`lifecycle.json`](../../../leyman/main/lifecycle.json). See the [lifecycle skill](../../../leyman/main/.claude/skills/lifecycle/SKILL.md).

### Project layout and caching

Cache inputs are globs, so they only work if every package puts things in the same place. A file outside these locations is invisible to caching: changing it will not rerun anything.

| Path | Tracked | Role | Hashed as |
|------|---------|------|-----------|
| `src/` | yes | Source and tests. Only the package itself reads it | `ts-source` |
| `src/tests/` | yes | Tests and their fixtures (fixtures can be any file type) | `ts-source` |
| `dist/` | no | Build output (`tsc`). The only built code dependents may import | `dependency-builds`, for dependents |
| `out/` | yes | Generated files that ship (`populate-files`, e.g. JSON schemas) | `package-files` |
| `data/` | yes | Static files that ship and are read at runtime or by dependents | `package-files` |
| `package.json`, `bin.mjs`, `executors.json`, `*.d.ts` at the root | yes | Package entry points | `package-files` |

Named inputs in [`nx.json`](../../../nx.json):

- `ts-source`: the project's own source and build config. A change rebuilds the project.
- `dependency-builds`: the `.js` and `.d.ts` files in dependencies' `dist/`, via `dependentTasksOutputFiles`. Dependents rebuild when a dependency's build output changes, not when its source changes. One known over-invalidation: compiled tests also land in `dist/tests/`, and `dependentTasksOutputFiles` cannot exclude a directory, so changing a dependency's tests rebuilds its dependents too.
- `^package-files`: dependencies' tracked entry points (`package.json`, `bin.mjs`, `out/`, `data/`…). Targets list it directly, because Nx does not allow `^` inside a named input.
- `test-source`: `ts-source` plus the project's own `package-files`, its dependencies' builds, and the c8 config.
- `shared-globals`: the Node version. The cache is shared between worktrees through the `nx-cache` sidecar.

Gotchas, all verified on Nx 22:

- **Never hash `dist/` with a file glob.** `dist/` is gitignored, and Nx only sees git-visible files, so a glob like `^{projectRoot}/dist/**` silently matches nothing. Use `dependentTasksOutputFiles`.
- **`dependentTasksOutputFiles` does not support extglobs** like `*.(c|m)?js`. Use one entry per extension. Plain file inputs do support them.
- **A generator's inputs must include everything it reads,** not just the files it writes. `barrelify` hashes all of `src/`, since adding a sibling module changes the barrel.
- **Clean output inside the task that writes it** (as `tsc` and the test targets do), not in a separate uncached target. An uncached cleanup runs every time and forces every cached output to be copied back.

Nx hashes each project's npm dependencies (direct and transitive, resolved from `pnpm-lock.yaml`) through the project graph, so a lockfile change only invalidates projects that depend on the changed package. `ts-source` sets `{ "externalDependencies": [] }` to opt out of Nx's default for `nx:run-commands` targets, which hashes _every_ external package in the workspace (`AllExternalDependencies`) and busts all caches on any lockfile change.

Use `nx show target inputs <project>:<target>` to list the files a target hashes. Add `--check <path>` to test a single file. Neither shows `dependentTasksOutputFiles`, so test those by changing a dependency and checking that the dependent reruns.

---

## Work Targets

Every work target except repo-wide commands (like `lifecycle` itself) must be bound in `lifecycle.json`.

### `biome`

Formats with Biome (`scripts/nx/biome-format.sh`). Writes changes, except in CI where it only checks. `-c check` checks without writing.

**Add when:** Every package.

---

### `eslint`

Lints with the project's `eslint.config.js`. `-c fix` auto-fixes.

**Add when:** Add to all TypeScript packages (has `tsconfig.json`).

---

### `barrelify`

Rewrites `index.ts` files that contain an `// AUTO-BARREL` marker with correct re-export statements.

**Add when:** The package has any `index.ts` files marked with `// AUTO-BARREL`.

---

### `update-ts-references`

Keep `tsconfig.json` `references` in sync with the package's inter-package dependencies.

**Add when:** The package has a `tsconfig.json`.

---

### `tsc`

Deletes `./dist`, then compiles TypeScript using SWC (fast transpilation) and `tsc` (declaration file generation + type checking). Clearing `dist` inside the target means it only happens on a cache miss.

Output goes to `./dist`.

**Add when:** Add to all TypeScript packages (has `tsconfig.json`).

---

### `populate-files`

Generates static output files by running `load-populate-files` against `./dist/file-content.js`. Expects the package to export a default array of `PopulateFileParams` from `src/file-content.ts`. Output goes to `./out`.

**Add when:** The package defines a `src/file-content.ts` file.

---

### `mocha-unit-test`

Clears its coverage directory, then runs Mocha unit tests from `./dist/tests/unit/**/*.spec.*js` under C8 coverage instrumentation.

**Add when:** The package has unit tests in `src/tests/unit/`. Add to virtually all packages.

---

### `mocha-integration-test`

Clears its coverage directory, then runs Mocha integration tests from `./dist/tests/integration/**/*.spec.*js` under C8 coverage instrumentation.

**Add when:** The package has integration tests in `src/tests/integration/`.

---

### `vitest-unit-test`

Clears its coverage directory, then runs Vitest unit tests from `./dist/tests/unit/**/*.spec.js` under C8 coverage instrumentation, using the shared [`configs/vitest.config.js`](../../../configs/vitest.config.js).

The shared config runs pre-compiled tests with native `import` and the `threads` pool (so C8 can collect V8 coverage), and sets `sequence.hooks: "list"` (required by `vitest-chain`).

**Add when:** The package tests with Vitest instead of Mocha (e.g. `vitest-chain`). Use instead of `mocha-unit-test`.

---

### `coverage-report`

Validates 100% coverage using only the C8 data from this project's own test targets (`scripts/nx/coverage-report.sh`). Runs in `test:report`, after the test suites. Coverage from dependents' tests does not count.

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
    "tsc": {},
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
