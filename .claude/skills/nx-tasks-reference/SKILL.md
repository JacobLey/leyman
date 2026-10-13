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
| `src/` | yes | Shipped source. Only the package itself reads it | `ts-source` |
| `test/` | yes | Tests, fixtures (any file type) and `test/tsconfig.json` | `test-source` |
| `dist/` | no | Build output (`tsc`): exactly what ships. The only built code dependents may import | `dependency-builds`, for dependents |
| `dist-test/` | no | Compiled tests (`tsc-test`). Never seen by dependents | — |
| `out/` | yes | Generated files that ship (`populate-files`, e.g. JSON schemas) | `package-files` |
| `data/` | yes | Static files that ship and are read at runtime or by dependents | `package-files` |
| `package.json`, `bin.mjs`, `executors.json`, `*.d.ts` at the root | yes | Package entry points | `package-files` |

Named inputs in [`nx.json`](../../../nx.json):

- `ts-source`: the project's own source and build config. A change rebuilds the project.
- `dependency-builds`: the `.js` and `.d.ts` files in dependencies' `dist/`, via `dependentTasksOutputFiles`. Dependents rebuild when a dependency's build output changes, not when its source changes. This is why tests compile to `dist-test/` rather than `dist/tests/`: `dependentTasksOutputFiles` ignores negated outputs, so tests inside `dist/` would rebuild every dependent when they change.
- `^package-files`: dependencies' tracked entry points (`package.json`, `bin.mjs`, `out/`, `data/`…). Targets list it directly, because Nx does not allow `^` inside a named input.
- `test-source`: `ts-source` plus `test/`, `configs/tsconfig.test.json`, the project's own `package-files`, the builds of its dependencies and itself, and the c8 config.
- `goSource`: a Go project's `go.mod`, `go.sum` and `.go` files, defined per project by gonx. Go targets also hash `^goSource` and the Go version.
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

### `gofmt`

Formats Go source with `gofmt` (`scripts/nx/gofmt.sh`). Like `biome`, writes changes, except in CI where it fails listing the unformatted files.

**Add when:** Go projects (has `go.mod`).

---

### `eslint`

Lints with the project's `eslint.config.js`. `-c fix` auto-fixes.

**Add when:** Add to all TypeScript packages (has `tsconfig.json`).

---

### `check-package`

Packs the package with `pnpm pack`, exactly as it would be published, and checks the tarball (`leyman/main/scripts/check-package.mjs`):

- [publint](https://publint.dev/), in strict mode: `exports`, `bin` and other entry points exist in the tarball and are well formed.
- [Are The Types Wrong](https://arethetypeswrong.github.io/): every entry point resolves to JavaScript and types for ESM consumers, under both Node.js (`node16`) and bundler resolution. CommonJS and `node10` resolution are expected to fail for ESM-only packages, so they are not checked.
- Published files: every top-level path not ignored by `.gitignore` is either published, or on the script's `notPublished` list (`src`, `test`, `project.json`, ...), and nothing on that list is published. A new path, like `data/`, fails until it is added to one or the other.

`e2e/published-entrypoints` complements it at runtime, importing every entry point from the published files.

Runs in `check:lint`, after the package's own build, so a packaging mistake fails CI on the PR rather than after a release.

**Add when:** The package is published (not `"private"`).

---

### `go-vet`

Runs `go vet ./...`, Go's built-in static checks. Runs in `check:lint`, like `eslint`. Inferred by gonx (see [Go projects](#go-projects)).

**Add when:** Never: inferred for every Go project.

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

### `vitepress-build`

Builds a [VitePress](https://vitepress.dev/) site from `src/` into `./dist`, clearing it first.

Dependencies' builds are inputs, since the docs site type-checks its examples against them (see [`docs/README.md`](../../../docs/README.md)).

**Add when:** The project is a VitePress site. Only `docs/` today.

---

### `tsc-test`

Deletes `./dist-test`, compiles `test/` into it with SWC, then type-checks the tests with `tsc -p ./test` (no emit; `test/tsconfig.json` extends the shared [`configs/tsconfig.test.json`](../../../configs/tsconfig.test.json)). Runs in `test:compile`, after the package's own build, so tests are type-checked against its published `.d.ts` exactly as a consumer would see them.

**Add when:** The package has tests. Add whenever `mocha-unit-test`, `mocha-integration-test`, or `vitest-unit-test` is present.

---

### `populate-files`

Generates static output files by running `load-populate-files` against `./dist/file-content.js`. Expects the package to export a default array of `PopulateFileParams` from `src/file-content.ts`. Output goes to `./out`.

**Add when:** The package defines a `src/file-content.ts` file.

---

### `sync-injected`

Mirrors the package's published files (`pnpm pack --dry-run`) into its injected copies in `node_modules/.pnpm` (`leyman/main/scripts/sync-injected.mjs`). Workspace dependencies are installed as copies (`injectWorkspacePackages`), made at install time, so without this dependents would keep seeing the `dist/` from the last `pnpm install`. Never cached: it must also run when `tsc` is a cache hit, since restoring `dist/` doesn't update the copies.

A build outside Nx (e.g. running `tsc` directly) doesn't sync. Run the package's `build`, or `pnpm install`, which also refreshes every copy.

**Add when:** Every package with `tsc`.

---

### `playwright-install`

Downloads the Chromium, Firefox and WebKit builds for the project's Playwright version (`playwright install`), to `PLAYWRIGHT_BROWSERS_PATH`. Runs in `test:compile`, before the test suites. Never cached: the browsers live outside the workspace, and it is a quick no-op once they are downloaded. Their system libraries need root, so they come from the devcontainer image and the Dagger pipeline instead (see the [devcontainer skill](../devcontainer/SKILL.md)).

**Add when:** The package's tests drive browsers with Playwright.

---

### `mocha-unit-test`

Clears its coverage directory, then runs Mocha unit tests from `./dist-test/unit/**/*.spec.*js` under C8 coverage instrumentation.

**Add when:** The package has unit tests in `test/unit/`. Add to virtually all packages.

---

### `mocha-integration-test`

Clears its coverage directory, then runs Mocha integration tests from `./dist-test/integration/**/*.spec.*js` under C8 coverage instrumentation.

**Add when:** The package has integration tests in `test/integration/`.

---

### `vitest-unit-test`

Clears its coverage directory, then runs Vitest unit tests from `./dist-test/unit/**/*.spec.js` under C8 coverage instrumentation, using the shared [`configs/vitest.config.js`](../../../configs/vitest.config.js).

The shared config runs pre-compiled tests with native `import` and the `threads` pool (so C8 can collect V8 coverage), and sets `sequence.hooks: "list"` (required by `vitest-chain`).

**Add when:** The package tests with Vitest instead of Mocha (e.g. `vitest-chain`). Use instead of `mocha-unit-test`.

---

### `go-test`

Runs `go test -cover ./...`, writing Go's coverage profile to `cover.out` (gitignored). Inferred by gonx (see [Go projects](#go-projects)). Hashes dependencies' `package-files` too, since a Go module can `//go:embed` files (like `data/`) that gonx's `goSource` input does not cover.

**Add when:** Never: inferred for every Go project.

---

### `go-coverage-report`

Fails unless `go-test`'s `cover.out` shows 100% coverage (`scripts/nx/go-coverage-report.sh`), as `coverage-report` does for TypeScript. Runs in `test:report`.

**Add when:** Go projects with tests.

---

### `coverage-report`

Validates 100% coverage using only the C8 data from this project's own test targets (`scripts/nx/coverage-report.sh`). Runs in `test:report`, after the test suites. Coverage from dependents' tests does not count.

**Add when:** The package has any test target.

---

## Go projects

The [`@naxodev/gonx`](https://gonx.naxo.dev/) plugin (in `nx.json` `plugins`) turns every `go.mod` into a project, except under `dagger/` (`exclude`). It also infers dependencies between them from Go `import`s, following `replace` directives, the way Nx reads `package.json` dependencies. No `implicitDependencies` needed.

Its inferred targets are renamed with a `go-` prefix, so they don't collide with lifecycle targets like `build` and `test`. Only `go-vet` and `go-test` are bound in `lifecycle.json`, configured through name-keyed `targetDefaults` (inputs, `dependsOn`, and options such as `go vet` instead of gonx's default `go fmt`). Keep those defaults without an `executor`: a default naming a different executor than the inferred target is ignored. The others (`go-build`, `go-tidy`, `go-generate`, `go-serve`, `go-release-publish`) are unbound, and only run when called directly.

`gofmt` stays a repo target, since gonx's formatter always rewrites and can't only check in CI.

## Typical `project.json` Templates

### Standard TypeScript package (unit tests only)

```json
{
  "$schema": "../../leyman/main/node_modules/nx/schemas/project-schema.json",
  "name": "my-package",
  "targets": {
    "biome": {},
    "eslint": {},
    "check-package": {},
    "update-ts-references": {},
    "tsc": {},
    "tsc-test": {},
    "mocha-unit-test": {},
    "coverage-report": {},
    "sync-injected": {},
    "check:_": {},
    "check:lint": {},
    // lots more of ignorable nx-lifecycle managed targets
  }
}
```

### Go project

```json
{
  "$schema": "../../../leyman/main/node_modules/nx/schemas/project-schema.json",
  "name": "@leyman/my-go-project",
  "targets": {
    "biome": {},
    "gofmt": {},
    "go-coverage-report": {},
    // lots more of ignorable nx-lifecycle managed targets
  }
}
```

Target order in `project.json` technically does not matter, but try to put them in the order described above, as they generally reflect the order they will run.

`nx-lifecycle` will ensure all orchestration targets go at the end.
