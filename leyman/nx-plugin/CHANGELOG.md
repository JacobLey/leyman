# @leyman/nx-plugin

## 0.2.0

### Minor Changes

- d9fb13b: `init` sets up all an empty workspace needs for a first package to pass `verify`: `@typescript/native` for `tsc`, a root `tsconfig.json`, a `.gitignore`, pnpm's `allowBuilds` for `nx` and `@swc/core`, check-package's `esm-only` profile, and nx-lifecycle without warnings for targets no project has yet. The generators take `@nx/*` plugins at the version of `nx`, and read ranges from the root `package.json` too.

## 0.1.0

### Minor Changes

- c36096d: First public release: an Nx plugin inferring the build, test, lint and package-check targets of TypeScript ESM packages from their files, a `targets` executor writing the same targets into `nx.json` and each `project.json`, an `init` generator (run by `nx add @leyman/nx-plugin`) setting a workspace up for it, and a `package` generator adding a package with its targets declared.
