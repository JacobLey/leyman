---
name: install-package
description: Installing a package dependency
---

# Installing a package

## 1. Add the version to the default `catalog:` in [`pnpm-workspace.yaml`](../../../pnpm-workspace.yaml)

Skip if it is already there. Use the default `catalog:` only. Don't add a named catalog: every package should use the same version.

A package in this repo is never installed from npm, even as a dev dependency, as [`check-workspace-dependencies`](../nx-tasks-reference/SKILL.md#check-workspace-dependencies) enforces. If a dependency would make a cycle, which pnpm fails on, change what depends on what instead.

## 2. Reference it from the package's `package.json`

```json
"dependencies": { "some-lib": "catalog:" },
"devDependencies": { "@leyman/expect": "workspace:^" }
```

External packages use `catalog:`. Packages in this repo use `workspace:^`. A `peerDependency` or `optionalDependency` must also be listed in `devDependencies` to be installed locally.

Workspace packages are injected, not symlinked: a dependent sees a copy of only the files the package publishes, and the package's peers resolve from the dependent, as they would from npm. The dependency's `build` keeps the copy current (see [`sync-injected`](../nx-tasks-reference/SKILL.md#sync-injected)).

## 3. Install and build

```bash
pnpm i
nx run-many -t build
```

The build also syncs `tsconfig.json` `references` for new workspace dependencies.
