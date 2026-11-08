# @leyman/nx-plugin

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
