# @leyman/nx-plugin

## 0.6.0

### Minor Changes

- a4bbe9c: The test targets store their coverage with a placeholder for the workspace root, and `coverage-report` puts the current root back before checking it, so a test result restored from a cache built at another path (in CI, or another checkout) now reports the right coverage. Adds the `leyman-portable-coverage` bin that does this.

## 0.5.0

### Minor Changes

- 3cb8150: Update dependencies: @nx/devkit@24.0.5, nx@24.0.5

### Patch Changes

- Updated dependencies [754dbcc]
  - juniper@2.8.3

## 0.4.2

### Patch Changes

- bf92cac: The bins print their usage with `--help` and exit with code 2 on an argument they don't take, instead of ignoring it: `leyman-biome-format --help` used to format every file under the current directory.
- b6d5a6e: `check-package` is inferred for every package that isn't `private`, not only those with a `tsc` target, so a package of config files is checked too.
- 7459b09: `dependency-files` hashes a dependency's root `*.sql` files, so a schema a package exports for its dependents to load (for example with `import.meta.resolve`) invalidates their cached results when it changes.
- Updated dependencies [5d33e46]
- Updated dependencies [2da2f30]
  - juniper@2.8.2
  - juniper-validator@0.6.2

## 0.4.1

### Patch Changes

- ebb0dbb: Rewrite the README to introduce the package in plainer prose.
- Updated dependencies [9e82d20]
  - juniper@2.8.1
  - juniper-validator@0.6.1

## 0.4.0

### Minor Changes

- 58e4ed9: The `package` generator's `floor` option is now a Node.js version (`<major>.<minor>.<patch>`), written to `engines.node` as `>=<floor>`, and defaults to 22.12.0 instead of the major 22. `>=22` claimed Node.js 22.0.0, which can't `require()` the package's ES modules and where its tests can't run: 22.12.0 is the oldest version mocha and vitest start on. The major still picks the `node-<major>` catalog for `@types/node` and the support floor's tsconfig.

## 0.3.1

### Patch Changes

- 6c7c141: `leyman-coverage-report` leaves out a project nested inside the one it reports on (a directory with its own `project.json`), which has its own coverage. `--all` counted its files as uncovered.

## 0.3.0

### Minor Changes

- d20634b: `init` has pnpm link the skills the framework's packages ship for coding agents (`@leyman/configs`' principles, and those of `@leyman/eslint-config`, `mocha-chain` and `nx-lifecycle`): it approves them under `permissions` in `pnpm-workspace.yaml`, sets `skills.dirs` to `.agents/skills`, and links `.claude/skills` to `.agents/skills`. It no longer writes a `.claude/skills/principles/SKILL.md` pointing at the docs site, so the principles change with the installed version. Needs pnpm 12.11 or later to link; settings already there are left alone.

### Patch Changes

- Updated dependencies [ee0b74b]
  - juniper@2.8.0

## 0.2.0

### Minor Changes

- d9fb13b: `init` sets up all an empty workspace needs for a first package to pass `verify`: `@typescript/native` for `tsc`, a root `tsconfig.json`, a `.gitignore`, pnpm's `allowBuilds` for `nx` and `@swc/core`, check-package's `esm-only` profile, and nx-lifecycle without warnings for targets no project has yet. The generators take `@nx/*` plugins at the version of `nx`, and read ranges from the root `package.json` too.

## 0.1.0

### Minor Changes

- c36096d: First public release: an Nx plugin inferring the build, test, lint and package-check targets of TypeScript ESM packages from their files, a `targets` executor writing the same targets into `nx.json` and each `project.json`, an `init` generator (run by `nx add @leyman/nx-plugin`) setting a workspace up for it, and a `package` generator adding a package with its targets declared.
