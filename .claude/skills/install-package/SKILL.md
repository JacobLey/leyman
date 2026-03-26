---
name: install-package
description: Installing a package dependency
---

# Installing a package

> Reference: https://pnpm.io/workspaces

This workspace uses pnpm to manage dependencies.

## Steps

### 1. Add the dependencies to [pnpm-workspace.yaml](../../../pnpm-workspace.yaml)

This is only required if the dependency deos not yet exist in the codebase, otherwise it should already be there.

Put the dependency under the default `catalog`. Do _not_ create a custom catalog key, we should encourage a single
version used consistently across the monorepo.

The only exception is adding dependencies on npm-based version of packages that are maintained in this repo. This is for rare cases
to work around circular dependencies that only show up in dev environments.

### 2. Create the package directory and files

Add the package to `package.json`'s dependencies (or devDependencies). Note that packages that are "optional" or "peer" dependencies will also need it as a dev dependency in order to develop locally against it.

### 3. Run install and build commands

Run `pnpm i` then `nx run-many -t build` to actually perform the install and cache bust nx projects.
