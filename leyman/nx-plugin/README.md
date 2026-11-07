<div style="text-align:center">

# @leyman/nx-plugin

Nx plugin inferring the build, test, lint and package-check targets of TypeScript ESM packages: SWC and tsc builds, Mocha or Vitest under c8, ESLint, Biome and check-package.

[![npm package](https://badge.fury.io/js/@leyman%2Fnx-plugin.svg)](https://www.npmjs.com/package/@leyman/nx-plugin)
[![License](https://img.shields.io/npm/l/@leyman/nx-plugin.svg)](https://github.com/JacobLey/leyman/blob/main/leyman/nx-plugin/LICENSE)

</div>

- **Targets from files** — a project with `src/` and `tsconfig.json` gets `tsc`, one with `test/unit` and Mocha installed gets `mocha-unit-test`, a public one gets `check-package`, and so on.
- **Cached precisely** — each target hashes only what its result depends on: its sources, the shared configs, and the built output of its dependencies (not their source), so editing a dependency's tests reruns nothing downstream.
- **Builds that respect the support floor** — SWC compiles to the ES year of the oldest Node.js `engines.node` allows, and `tsc` checks types and writes declarations.
- **Coverage over all of a project's tests** — each test target runs under c8, and `coverage-report` checks the coverage of all of them together.
- **Overridable** — rename a target, turn it off, include or exclude projects, or override any part in `project.json`.
- **Generators** — `init` sets an Nx workspace up for the plugin (`nx add @leyman/nx-plugin` runs it), and `package` adds a package with the targets it gets already declared.
- **Or written out** — a workspace that can't load the plugin (because it builds it, say) writes the same targets into `nx.json` and each `project.json` with the `targets` executor, which fails on drift in CI.

It is the setup of the [leyman](https://github.com/JacobLey/leyman) monorepo, published as-is. Expect it to be opinionated and to change: see [Versioning](#versioning).

## Contents

- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [Targets](#targets)
- [Options](#options)
- [Generators](#generators)
- [The targets executor](#the-targets-executor)
- [API](#api)
- [Versioning](#versioning)

## Install

```sh
nx add @leyman/nx-plugin
```

That installs the plugin and runs its [`init`](#init) generator. Or install it yourself:

```sh
npm i -D @leyman/nx-plugin @leyman/configs
```

Each project then installs what its targets run: `@swc/cli`, `@swc/core` and `typescript` to build, `mocha` or `vitest` and `c8` to test, `eslint`, and `@biomejs/biome` at the workspace root. `check-package` runs [`@leyman/check-package`](https://www.npmjs.com/package/@leyman/check-package), and `update-ts-references` needs `@nx/js`.

## Example

`nx.json`:

```json
{
  "plugins": [
    {
      "plugin": "@leyman/nx-plugin",
      "options": {
        "checkPackage": { "profile": "esm-only" }
      }
    }
  ]
}
```

A package with `package.json` (with `mocha` in `devDependencies`), `project.json`, `tsconfig.json`, `src/`, `test/tsconfig.json`, `test/unit/` and `eslint.config.js` gets `biome`, `eslint`, `check-package`, `update-ts-references`, `tsc`, `tsc-test`, `mocha-unit-test` and `coverage-report`:

```sh
nx run my-package:tsc
nx run-many -t mocha-unit-test
```

## Usage

The plugin infers targets for each project with a `project.json`. It says how each target runs and what it hashes, not when: wire the order yourself with `dependsOn` (in `nx.json` `targetDefaults` or `project.json`), or with [nx-lifecycle](https://www.npmjs.com/package/nx-lifecycle), binding each target to a stage. nx-lifecycle wires the targets a `project.json` declares, so declare them there as `{}`.

Targets run from the project's directory. The defaults read the shared configs from the project's own `node_modules/@leyman/configs`, so each project installs [`@leyman/configs`](https://www.npmjs.com/package/@leyman/configs), as its `tsconfig.json` extends it anyway.

Anything in `project.json` is merged over the inferred target, key by key, so a project can change one option of a target and keep the rest.

## Targets

| Target                   | Inferred when                                                   | Runs                                                                                                              |
| ------------------------ | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `biome`                  | Always                                                          | `biome format --write .`, or only checks in CI. `-c check` only checks.                                           |
| `eslint`                 | `eslint.config.js`                                              | `eslint` on the project. `-c fix` fixes.                                                                          |
| `check-package`          | `tsc` is, and `package.json` isn't `private`                    | `check-package`, on the package as it would be published.                                                         |
| `update-ts-references`   | `tsconfig.json`                                                 | Nx's TypeScript sync generator, which keeps `references` in step with dependencies.                               |
| `tsc`                    | `tsconfig.json` and `src/`                                      | Clears `dist/`, compiles `src/` with SWC, then `tsc` for types and declarations.                                  |
| `tsc-test`               | `test/tsconfig.json`                                            | Compiles `test/` into `dist-test/` with SWC, then type-checks it with `tsc -p ./test`.                            |
| `mocha-unit-test`        | `test/unit/`, and `mocha` in `devDependencies`                  | Mocha on `dist-test/unit/**/*.spec.*js`, under c8.                                                                |
| `mocha-integration-test` | `test/integration/`, and `mocha` in `devDependencies`           | Mocha on `dist-test/integration/**/*.spec.*js`, under c8, with a 10 second timeout.                               |
| `vitest-unit-test`       | `test/unit/`, and `vitest` but not `mocha` in `devDependencies` | Vitest on the compiled tests, under c8.                                                                           |
| `coverage-report`        | `tsc` and a test target are                                     | Checks the coverage the test targets wrote, together, against the c8 config's thresholds.                         |
| `sync-injected`          | Another project's `package.json` depends on this one            | Mirrors the package into the copies pnpm injected into its dependents (`injectWorkspacePackages`), after a build. |

`tsc`, `tsc-test`, `coverage-report`, `biome` and `sync-injected` run the package's scripts, as its bins:

| Bin                      | Usage                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `leyman-clean-dist`      | Clears `dist/`, keeping `tsc`'s build info and declarations while they are exactly those of the current sources, so `tsc` stays fast. |
| `leyman-swc-compile`     | `leyman-swc-compile <source> <output> <swcrc>`: compiles with SWC, to the ES year of the package's support floor.                     |
| `leyman-coverage-report` | `leyman-coverage-report <c8rc> [c8 options...]`                                                                                       |
| `leyman-biome-format`    | Formats with Biome; only checks in CI.                                                                                                |
| `leyman-sync-injected`   | Mirrors the package into its injected copies, and writes the fields of `package.json` that dependents hash.                           |

The targets also define the named inputs `dependency-files`, `package-files`, `eslint-input`, `ts-source`, `dependency-builds` and `test-source` on each project.

## Options

All optional.

| Option                       | Default                                                                 | Description                                                                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `targets.<target>`           | `{}`                                                                    | `false` to infer the target nowhere, or `{ name, include, exclude }`: its name, and roots of projects that always or never get it.           |
| `configs.swc`                | `node_modules/@leyman/configs/swcrc.jsonc`                              | SWC config, relative to each project.                                                                                                        |
| `configs.c8`                 | `node_modules/@leyman/configs/c8rc.json`                                | c8 config, relative to each project.                                                                                                         |
| `configs.vitest`             | `node_modules/@leyman/configs/vitest.config.js`                         | Vitest config, relative to each project.                                                                                                     |
| `coverage`                   | —                                                                       | `{ branches, functions, lines, statements }`: thresholds passed to c8 over the c8 config's.                                                  |
| `checkPackage.profile`       | check-package's, `strict`                                               | `strict`, `node16` or `esm-only`.                                                                                                            |
| `checkPackage.floorTsconfig` | `@leyman/configs/tsconfig.node-{major}.json`                            | The config a package's `tsconfig.json` must extend for its support floor, or `false`.                                                        |
| `checkPackage.inputs`        | `[{ "externalDependencies": ["@leyman/check-package", "typescript"] }]` | What a change of check-package itself is hashed by.                                                                                          |
| `inputs.configs`             | `[{ "externalDependencies": ["@leyman/configs"] }]`                     | What a change of the shared configs is hashed by. A workspace keeping them in a project of its own lists their paths instead.                |
| `inputs.tools`               | `[{ "externalDependencies": ["@leyman/nx-plugin"] }]`                   | What a change of the scripts is hashed by.                                                                                                   |
| `scripts`                    | —                                                                       | A directory to run the scripts from instead of the bins, such as `${NX_WORKSPACE_ROOT}/tools/nx-plugin/scripts` for a copy in the workspace. |
| `namedInputs.<name>`         | —                                                                       | Inputs added to the end of a named input, such as `{ "test-source": ["{projectRoot}/schema.sql"] }` for a file the tests read.               |

The options are checked against [`out/schema.json`](./out/schema.json); an invalid one fails with its path.

## Generators

### `init`

```sh
nx g @leyman/nx-plugin:init
```

Sets the workspace up for the plugin, leaving alone anything already set:

- `nx.json`: the plugin, with `checkPackage.profile` `esm-only` for the packages the `package` generator writes, and [nx-lifecycle](https://www.npmjs.com/package/nx-lifecycle)'s plugin with the stages install, prepare (generate, format), check (lint), build (run, post, sync), test (compile, run, report) and verify, and each target bound to one, under the name the options give it. As every target is bound before any project has it, nx-lifecycle's `warnUnusedBindings` is off. `--lifecycle=false` leaves nx-lifecycle out.
- `devDependencies` of the root `package.json`: the plugin, `@leyman/configs`, `@biomejs/biome`, `@leyman/check-package`, `@nx/js`, `@typescript/native` (TypeScript 7, the `tsc` the targets run) and `nx-lifecycle`.
- `biome.json`, extending `@leyman/configs/biome.base.json`.
- `tsconfig.json`, with no files, for Nx's TypeScript sync generator to keep a reference to each package in.
- `.gitignore`: `node_modules`, `dist`, `dist-test`, and what the targets and Nx write at the root (`.coverage`, `.package-surface`, `.nx/cache` and `.nx/workspace-data`). check-package reads it for the files a package doesn't publish.
- `pnpm-workspace.yaml`, if there is one: `injectWorkspacePackages: true` and `dedupeInjectedDeps: false`, so dependents get workspace packages as published, which `sync-injected` keeps current, and `allowBuilds` `false` for `nx` and `@swc/core`, whose install scripts pnpm otherwise stops on. And for coding agents, `permissions` approving the skills the framework's packages ship (the [principles](https://jacobley.github.io/leyman/framework/principles) in `@leyman/configs`, and those of `@leyman/eslint-config`, `mocha-chain` and `nx-lifecycle`), with `skills.dirs` set to `.agents/skills`, so pnpm (12.11 or later) links each one there on install and the skills change with the installed versions.
- `.claude/skills`, a link to `.agents/skills`, the only skills directory Claude Code reads. One already there is left alone. `--skill=false` skips this and the skill settings.

Then it installs the dependencies, unless `--skipInstall`.

### `package`

```sh
nx g @leyman/nx-plugin:package packages/my-lib --description "Does things."
```

Adds a TypeScript ESM package: `package.json`, `tsconfig.json` (extending `@leyman/configs`), `src/index.ts`, a first test with its `test/tsconfig.json`, `eslint.config.js`, a `README.md`, and a `project.json` declaring as `{}` the targets the plugin infers from those files, so nx-lifecycle wires them. Then it installs the dependencies, unless `--skipInstall`, and `nx sync` adds the `tsconfig.json` references.

| Option            | Default                   | Description                                                                                                                                                                                             |
| ----------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `directory`       | —                         | Where the package goes, relative to the workspace root. The first argument.                                                                                                                             |
| `description`     | —                         | For `package.json` and the README.                                                                                                                                                                      |
| `name`            | The directory's last part | Name of the package.                                                                                                                                                                                    |
| `published`       | `false`                   | Published to npm, rather than `private`: it gets `engines`, extends its support floor's `@leyman/configs/tsconfig.node-{floor}.json`, takes `@types/node` of that major, and the workspace's `LICENSE`. |
| `floor`           | `22`                      | Major of the oldest Node.js a published package supports.                                                                                                                                               |
| `test`            | `mocha`                   | `mocha`, `vitest`, or `none`.                                                                                                                                                                           |
| `repository`      | —                         | URL of the workspace's GitHub repository, for a published package's `repository`, `homepage` and `bugs`.                                                                                                |
| `author`          | —                         | `author` of `package.json`.                                                                                                                                                                             |
| `license`         | —                         | `license` of `package.json`.                                                                                                                                                                            |
| `devDependencies` | —                         | More packages to add to `devDependencies`.                                                                                                                                                              |
| `config`          | The options in `nx.json`  | A file of the plugin [options](#options), for a workspace running the [targets executor](#the-targets-executor).                                                                                        |
| `skipInstall`     | `false`                   | Don't install the dependencies.                                                                                                                                                                         |

Set the ones a workspace always passes as defaults in `nx.json`:

```json
{
  "generators": {
    "@leyman/nx-plugin": {
      "package": { "repository": "https://github.com/owner/repo", "license": "MIT" }
    }
  }
}
```

Each dependency's version comes from the workspace if it can: `workspace:^` for one of its own packages, `catalog:` for one in the pnpm catalog (`catalog:node-{floor}` for a published package's `@types/node`), or the range another package (or the root `package.json`) already uses. Nx's own plugins, such as `@nx/js`, otherwise take the range of `nx`. Otherwise it is the version this plugin was published with, and a package with none of those fails.

## The targets executor

A workspace that can't load the plugin, such as one that builds it, writes the same targets out instead:

```json
{
  "targets": {
    "nx-plugin-targets": {
      "executor": "@leyman/nx-plugin:targets",
      "options": { "config": "tools/nx-plugin.json" }
    }
  }
}
```

`config` is a file of the [options](#options), relative to the workspace root, which can name `./node_modules/@leyman/nx-plugin/out/schema.json` as its `$schema`. The executor writes the named inputs and target defaults into `nx.json`, keeping each target default's `dependsOn`, and into each `project.json` the targets the project gets, as `{}`. A declaration with options of its own is kept. With `check` (the default when `CI` is set), it fails instead of writing when a file is out of date.

## API

The plugin's pieces, for tools built on it:

- `createNodes`, `name`: the Nx plugin.
- `resolveOptions(options?)`: every option, with defaults.
- `targetConfigurations(resolved)`, `namedInputs(resolved)`: each target's configuration and each named input.
- `inferTargets(project, resolved)`: the targets a project gets, from `{ root, packageJson, isDependency, has(path) }`; `inferencePaths` are the paths `has` is asked about.
- `loadProjects(workspaceRoot, roots)`: reads that for each project.
- `syncTargets({ root, projects, options, optionsSource, check })`: what the executor does.
- `initGenerator(tree, options?)`, `packageGenerator(tree, options)`: the generators. `lifecycleStages` and `lifecycleBindings` are the nx-lifecycle options `init` writes.
- `readWorkspaceVersions(tree)`, `resolveVersion(name, versions)`: the version a generator gives a dependency.
- `assertOptions(options, where)`, `optionsJsonSchema`, `executorJsonSchema`, `initGeneratorJsonSchema`, `packageGeneratorJsonSchema`: option validation and the JSON schemas.

## Versioning

Before 1.0, a release that can make a passing workspace fail (a new target inferred, a stricter command, a changed default) is a minor, and other changes are patches.
