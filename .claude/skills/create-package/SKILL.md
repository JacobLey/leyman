---
name: create-package
description: Creating a new package in the monorepo
---

# Creating a New Package

There are no generators. Copy an existing package of similar shape and adapt it:

- Simple library: `tools/parse-cwd`, `tools/enum-to-array`
- Library with DI: `tools/haywire`
- CLI app: `apps/barrelify`, structured as in the [cli skill](../cli/SKILL.md)

Put it under `tools/` or `apps/` (see the [projects skill](../projects/SKILL.md)).

## Files

| File | Notes |
|------|-------|
| `package.json` | `"type": "module"`, version `0.0.1`. Dependencies via `catalog:` / `workspace:^` (see [install-package](../install-package/SKILL.md)). Tests need dev deps on `mocha`, `mocha-chain`, `@leyman/expect`, `c8`. Set `"repository": { "type": "git", "url": "git+https://github.com/JacobLey/leyman.git", "directory": "<path>" }` and `"homepage": "https://github.com/JacobLey/leyman/tree/main/<path>#readme"`. |
| `src/`, `test/`, `data/`, `out/` | Where files go decides what is cached; see [Project layout and caching](../nx-tasks-reference/SKILL.md#project-layout-and-caching). |
| `tsconfig.json` | `{ "extends": "<relative>/configs/tsconfig.build.json", "compilerOptions": { "outDir": "dist", "rootDir": "src", "tsBuildInfoFile": "dist/tsconfig.tsbuildinfo" }, "include": ["src", "*.d.ts"] }`. `references` are generated. |
| `test/tsconfig.json` | `{ "extends": "<relative>/configs/tsconfig.test.json", "references": [{ "path": ".." }] }` (no `references` in e2e packages). See the [testing skill](../testing/SKILL.md#layout). |
| `files` (in `package.json`) | Allow-list of what is published, which is also what workspace dependents get (see [`sync-injected`](../nx-tasks-reference/SKILL.md#sync-injected)): `["dist", "!dist/**/*.map", "!dist/tsconfig.tsbuildinfo"]`, plus any other entry points (`bin.mjs`, `out`, root `*.d.ts`) and `WHY-<PACKAGE>.md`. `package.json`, `README.md` and `LICENSE` are always included. Check the result with `pnpm pack --dry-run`; [`check-package`](../nx-tasks-reference/SKILL.md#check-package) fails on a top-level path that is neither published nor known not to be. |
| `project.json` | List only the work targets the package uses, as `{}` (see [nx-tasks-reference](../nx-tasks-reference/SKILL.md)). Orchestration targets are added by the lifecycle command. |
| `eslint.config.js` | Export `configGenerator(...)` from `@leyman/eslint-config` (see [linting-formatting](../linting-formatting/SKILL.md)). |
| `README.md` | Required. See [writing-readmes](../writing-readmes/SKILL.md). Published packages also get a row in the root `README.md` package table. |

## Then

```bash
pnpm i
nx run @leyman/main:lifecycle   # adds orchestration targets to project.json
nx run-many -t build            # syncs tsconfig references
```

Also add a row to the table in the [projects skill](../projects/SKILL.md), and a changeset if the package will be published (see [versioning](../versioning/SKILL.md)). A published package also goes in the `devDependencies` of [`e2e/published-entrypoints`](../../../e2e/published-entrypoints) (`workspace:^`), whose test fails for any public package missing there. Nx caches that test on its own inputs, so a passing cached run can hide this: run it with `--skip-nx-cache` after making a package public.

## E2E packages

A test-only package under `e2e/` checks other workspace packages together, e.g. a pairing that can't depend on each other directly. Copy `e2e/eslint-config-schema`. Compared to a regular package:

- `package.json`: named `@leyman/e2e-<name>`, `"private": true`, no `exports`, and only `devDependencies` (including the packages under test, via `workspace:^`).
- No `src/`, root `tsconfig.json` or `files`. Tests go in `test/integration/`.
- `project.json` targets: `biome`, `eslint`, `tsc-test`, `mocha-integration-test`. No `tsc` or `sync-injected` (nothing to build), and no `coverage-report` (no source of its own to cover).
- Import the packages under test by their public exports only. Add an export to a package if needed, rather than reaching into its `dist/`.

## Go projects

Nx is not limited to TypeScript. Copy `tools/constant-consistent-hash/go-impl`. Go is in the devcontainer and the Dagger pipeline (see the [devcontainer skill](../devcontainer/SKILL.md#version-parity-devcontainer--dagger)), and the gonx plugin makes a project of every `go.mod` (see [Go projects](../nx-tasks-reference/SKILL.md#go-projects)). Compared to a regular package:

- No `package.json`: pnpm doesn't need to know about it. Add a `project.json` named `@leyman/<name>` for the targets gonx doesn't infer.
- `go.mod`: module `github.com/JacobLey/leyman/<path>`, with a `go` directive no newer than the pinned Go version (Dagger sets `GOTOOLCHAIN=local`, so it never downloads a newer toolchain).
- Depend on another workspace Go module with `require <module> v0.0.0` plus `replace <module> => ../<path>`, and import it. gonx infers the Nx dependency from the import. To share data with TypeScript, give the other project a `go.mod` too, and `//go:embed` the data (see `tools/constant-consistent-hash/test-vectors`).
- Source and `_test.go` files at the project root.
- `project.json` targets: `biome` (formats `project.json`), `gofmt`, and `go-coverage-report` when it has tests (see the [Go template](../nx-tasks-reference/SKILL.md#go-project)). `go-vet` and `go-test` are inferred. No `tsconfig.json`, `eslint.config.js` or TypeScript targets.
- Not published: nothing deploys Go modules yet.
