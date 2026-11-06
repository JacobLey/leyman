<div style="text-align:center">

# @leyman/nx-plugin

Nx plugin inferring the build, test, lint and package-check targets of TypeScript ESM packages: SWC and tsc builds, Mocha or Vitest under c8, ESLint, Biome and check-package.

[![npm package](https://badge.fury.io/js/@leyman%2Fnx-plugin.svg)](https://www.npmjs.com/package/@leyman/nx-plugin)
[![License](https://img.shields.io/npm/l/@leyman/nx-plugin.svg)](https://github.com/JacobLey/leyman/blob/main/leyman/nx-plugin/LICENSE)

</div>

Work in progress: the target configurations, their inference and the scripts the targets run are here; the Nx plugin and the executor that writes the targets into `nx.json` come next.

## Scripts

Each is a bin, run by a target in the project's directory:

| Bin                      | Target            | What it does                                                                                                                         |
| ------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `leyman-clean-dist`      | `tsc`             | Clears `dist/`, keeping `tsc`'s build info and declarations while they are exactly those of the current sources.                     |
| `leyman-swc-compile`     | `tsc`, `tsc-test` | `leyman-swc-compile <source> <output> <swcrc>`: compiles with SWC, to the ES year of the package's support floor (`engines.node`).   |
| `leyman-coverage-report` | `coverage-report` | `leyman-coverage-report <c8rc> [c8 options...]`: checks the coverage the project's test targets wrote, together.                     |
| `leyman-biome-format`    | `biome`           | Formats with Biome; only checks in CI.                                                                                               |
| `leyman-sync-injected`   | `sync-injected`   | Mirrors the package into the copies pnpm injected into its dependents, and writes the fields of `package.json` that dependents hash. |
