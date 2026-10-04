---
name: create-package
description: Creating a new package in the monorepo
---

# Creating a New Package

There are no generators. Copy an existing package of similar shape and adapt it:

- Simple library: `tools/parse-cwd`, `tools/enum-to-array`
- Library with DI: `tools/haywire`
- CLI app: `apps/barrelify`

Put it under `tools/` or `apps/` (see the [projects skill](../projects/SKILL.md)).

## Files

| File | Notes |
|------|-------|
| `package.json` | `"type": "module"`, version `0.0.1`. Dependencies via `catalog:` / `workspace:^` (see [install-package](../install-package/SKILL.md)). Tests need dev deps on `mocha`, `mocha-chain`, `@leyman/expect`, `c8`. Set `"repository": { "type": "git", "url": "git+https://github.com/JacobLey/leyman.git", "directory": "<path>" }` and `"homepage": "https://github.com/JacobLey/leyman/tree/main/<path>#readme"`. |
| `src/`, `test/`, `data/`, `out/` | Where files go decides what is cached; see [Project layout and caching](../nx-tasks-reference/SKILL.md#project-layout-and-caching). |
| `tsconfig.json` | `{ "extends": "<relative>/configs/tsconfig.build.json", "compilerOptions": { "outDir": "dist", "rootDir": "src", "tsBuildInfoFile": "dist/tsconfig.tsbuildinfo" }, "include": ["src", "*.d.ts"] }`. `references` are generated. |
| `test/tsconfig.json` | `{ "extends": "<relative>/configs/tsconfig.test.json" }`. See the [testing skill](../testing/SKILL.md#layout). |
| `.npmignore` | Copy from a sibling package; it excludes `src/`, `test/` and `dist-test/`. |
| `project.json` | List only the work targets the package uses, as `{}` (see [nx-tasks-reference](../nx-tasks-reference/SKILL.md)). Orchestration targets are added by the lifecycle command. |
| `eslint.config.js` | Export `configGenerator(...)` from `@leyman/eslint-config` (see [linting-formatting](../linting-formatting/SKILL.md)). |
| `README.md` | Required. See [writing-readmes](../writing-readmes/SKILL.md). |

## Then

```bash
pnpm i
nx run @leyman/main:lifecycle   # adds orchestration targets to project.json
nx run-many -t build            # syncs tsconfig references
```

Also add a row to the table in the [projects skill](../projects/SKILL.md), and a changeset if the package will be published (see [versioning](../versioning/SKILL.md)).

## E2E packages

A test-only package under `e2e/` checks other workspace packages together, e.g. a pairing that can't depend on each other directly. Copy `e2e/eslint-config-schema`. Compared to a regular package:

- `package.json`: named `@leyman/e2e-<name>`, `"private": true`, no `exports`, and only `devDependencies` (including the packages under test, via `workspace:^`).
- No `src/`, root `tsconfig.json` or `.npmignore`. Tests go in `test/integration/`.
- `project.json` targets: `biome`, `eslint`, `tsc-test`, `mocha-integration-test`. No `tsc` or `sync-injected` (nothing to build), and no `coverage-report` (no source of its own to cover).
- Import the packages under test by their public exports only. Add an export to a package if needed, rather than reaching into its `dist/`.
