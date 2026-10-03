---
name: install-package
description: Installing a package dependency
---

# Installing a package

## 1. Add the version to the default `catalog:` in [`pnpm-workspace.yaml`](../../../pnpm-workspace.yaml)

Skip if it is already there. Use the default `catalog:` only. Don't add a named catalog: every package should use the same version.

The named catalogs under `catalogs:` are reserved for depending on the **npm-published** build of a package in this repo, to break a dev-time circular dependency. Read the comments there before adding to them.

## 2. Reference it from the package's `package.json`

```json
"dependencies": { "some-lib": "catalog:" },
"devDependencies": { "@leyman/expect": "workspace:^" }
```

External packages use `catalog:`. Packages in this repo use `workspace:^`. A `peerDependency` or `optionalDependency` must also be listed in `devDependencies` to be installed locally.

## 3. Install and build

```bash
pnpm i
nx run-many -t build
```

The build also syncs `tsconfig.json` `references` for new workspace dependencies.
