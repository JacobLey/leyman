<div style="text-align:center">

# nx-lifecycle

[Nx](https://nx.dev/) plugin that derives every `dependsOn` from declared lifecycle stages (build, test, …) and the targets bound to them.

[![npm package](https://badge.fury.io/js/nx-lifecycle.svg)](https://www.npmjs.com/package/nx-lifecycle)
[![License](https://img.shields.io/npm/l/nx-lifecycle.svg)](https://github.com/JacobLey/leyman/blob/main/apps/nx-lifecycle/LICENSE)

</div>

Nx targets each do one task, such as codegen, type checking, linting, running tests or enforcing coverage. Some depend on each other, and others can run in parallel. Nx orders them with each target's [`dependsOn`](https://nx.dev/reference/project-configuration#dependson), but writing those by hand means every target has to know about the others, including those of its dependencies. Adding a step in the middle (a post-build step after `tsc`, say) means updating every target that depended on the step before it, in every project that has it.

`nx-lifecycle` is an Nx plugin that splits this into two parts. You declare the high-level stages once, like a `build` stage with hooks `pre`, `run` and `post`, and a `test` stage that runs after `build`. Then you bind your actual targets to those hooks (`tsc` to `build:run`, `mocha` to `test:run`), and the plugin works out every `dependsOn`. Running `nx run <project>:build` then runs whatever building means for that project, in the right order.

Adding a step (codegen, lint, a post-build step) is one new binding, and every target after it is rewired in every project. Each project only gets the bound targets it declares, so TypeScript, Go and Java projects can all share the same `build` and `test` stages.

The plugin infers these targets when Nx builds the project graph, so there is nothing to commit. If a project's own `dependsOn` breaks the wiring, it fails and tells you the entry to add. If you would rather have the wiring in your files, an executor writes it out instead.

Guides and the full reference are on the [docs site](https://jacobley.github.io/leyman/packages/nx-lifecycle/). For a worked example of the problem and how the stages solve it, see [WHY-NX-LIFECYCLE.md](https://github.com/JacobLey/leyman/blob/main/apps/nx-lifecycle/WHY-NX-LIFECYCLE.md).

## Contents

- [Install](#install)
- [Plugin](#plugin)
  - [Overriding inferred targets](#overriding-inferred-targets)
  - [Limitations](#limitations)
  - [Migrating from the executor](#migrating-from-the-executor)
- [Executor](#executor)
- [Configuration](#configuration)
  - [stages](#stages)
  - [bindings](#bindings)
  - [check](#check)
  - [dryRun](#dryrun)
- [CLI](#cli)
  - [explain](#explain)
- [Compared to alternatives](#compared-to-alternatives)

## Install

```sh
npm i -D nx-lifecycle
```

`nx-lifecycle` wires targets in one of two ways:

- The [plugin](#plugin) (recommended) infers the lifecycle targets whenever Nx builds the project graph. Nothing is written to files.
- The [executor](#executor) writes the lifecycle targets into `nx.json` and every `project.json`, to be committed. CI checks they are up to date.

Both take the same [stages](#stages) and [bindings](#bindings). Requires Node.js 24 or later. `nx` and `@nx/devkit` (`^23.3.0`) are regular dependencies of `nx-lifecycle` (not peers), so use the same Nx major version in the workspace.

The package ships a skill for coding agents, `skills/nx-lifecycle/SKILL.md`, which explains how the workspace orders its targets and how to add one without breaking the wiring. pnpm (12.11 or later) links it into your agent's skills once you approve it, with `pnpm approve` or `nx-lifecycle: { skills: true }` under `permissions` in `pnpm-workspace.yaml`.

## Plugin

Add the plugin to `nx.json`, with stages and bindings as its options. Install `nx-lifecycle` in the workspace root `package.json`, where Nx resolves plugins.

```json
// nx.json
{
    "plugins": [
        {
            "plugin": "nx-lifecycle/plugin",
            "options": {
                "stages": {
                    "build": {
                        "hooks": ["pre", "run", "post"],
                        "dependsOn": ["^build"]
                    },
                    "test": {
                        "hooks": ["run", "report"],
                        "dependsOn": ["build"]
                    }
                },
                "bindings": {
                    "tsc": "build:run",
                    "mocha": "test:run"
                }
            }
        }
    ]
}
```

The options type is `LifecyclePluginOptions`, exported from `nx-lifecycle/plugin` (`import type { LifecyclePluginOptions } from 'nx-lifecycle/plugin'`), so options written in TypeScript can be checked with `const options = { stages, bindings } satisfies LifecyclePluginOptions;`.

Every project with a `project.json` gets the [stage targets](#generated-targets), even if it declares nothing bound to them. A bound target is wired in a project when its `project.json` declares it (`"tsc": {}`), even if the implementation comes from `targetDefaults`. `nx show project <name>` lists the inferred targets.

### Overriding inferred targets

Nx applies `nx.json` `targetDefaults` and `project.json` on top of inferred targets. A `dependsOn` there replaces the inferred one rather than merging with it. So:

- Don't define the stage targets (`build`, `build:_`, `build:run`…) yourself.
- If a bound target sets its own `dependsOn`, include its lifecycle dependency, which is the hook before its own (or `<stage>:_` for the first hook).

```json
// project.json, with "e2e-test": "test:run"
{
    "targets": {
        "e2e-test": {
            "dependsOn": [{ "target": "build", "projects": ["my-server"] }, "test:_"]
        }
    }
}
```

Every time Nx builds the project graph, the plugin checks the merged configuration, and fails with the entry to add if a bound target lost its lifecycle dependency.

### Limitations

- Only projects with a `project.json` get lifecycle targets.
- A target created by another Nx plugin is only wired if it is also declared in `project.json`.
- Nx must load the plugin before it can build anything, so a workspace can't use the plugin from its own unbuilt source. Depend on a published version.

### Migrating from the executor

1. Add the plugin to `nx.json`, with the options of the executor.
2. Remove the `lifecycle` target that runs the executor.
3. In `nx.json` `targetDefaults`, delete every target with a `__lifecycle` configuration, and remove lifecycle targets from the `dependsOn` of bound targets. Delete `dependsOn` if nothing else is left in it, as an empty list replaces the inferred one.
4. Optionally delete the lifecycle targets (`"build:_": {}`…) from each `project.json`. They are empty, so they don't override anything.
5. Run `nx show projects`. The plugin reports any target that still overrides its wiring.

## Executor

Use the [plugin](#plugin) unless the workspace develops `nx-lifecycle` itself, or you want every `dependsOn` visible in the files.

Register it as a target in a `project.json`. Because `lifecycle` manages dependencies for the rest of your targets, it should live in a project outside your normal build and test graph, such as a root-level management package. See [Nx-lifecycle's own monorepo config](https://github.com/JacobLey/leyman/blob/main/leyman/main/lifecycle.json) for a real example.

```json
{
    "targets": {
        "lifecycle": {
            "executor": "nx-lifecycle:lifecycle",
            "options": {
                "cwd": "{projectRoot}",
                "configFile": "lifecycle.json"
            }
        }
    }
}
```

`nx-lifecycle` reads your stage and binding configuration, then writes `dependsOn` entries into `nx.json` and all relevant `project.json` files. The generated targets use the [noop](https://nx.dev/nx-api/nx/executors/noop) executor and should never be invoked directly or have their configuration edited by hand. Commit the generated output to version control, and rerun the executor whenever you add, remove, or rename targets.

Your own targets can depend on lifecycle-managed targets, and that is how it is meant to be used. Your targets depend on the abstract stages, and `nx-lifecycle` wires each stage to the concrete targets bound to it.

You can pass `stages` and `bindings` inline in the executor's `options` in `project.json`, or point the executor at a separate JSON file (`lifecycle.json` in the project root by default).

```json
// project.json — inline config
{
    "targets": {
        "lifecycle": {
            "executor": "nx-lifecycle:lifecycle",
            "options": {
                "stages": {
                    "build": {
                        "hooks": ["pre", "run", "post"],
                        "dependsOn": ["^build"]
                    },
                    "test": {
                        "hooks": ["run", "report"],
                        "dependsOn": ["build"]
                    }
                },
                "bindings": {
                    "tsc": "build:run",
                    "mocha": "test:run"
                }
            }
        }
    }
}
```

```json
// project.json — file-based config
{
    "targets": {
        "lifecycle": {
            "executor": "nx-lifecycle:lifecycle",
            "options": {
                "cwd": "{projectRoot}",
                "configFile": "my-lifecycle-config.json"
            }
        }
    }
}
```

```json
// lifecycle.json — the config file
{
    "stages": {
        "build": {
            "hooks": ["pre", "run", "post"],
            "dependsOn": ["^build"]
        },
        "test": {
            "hooks": ["run", "report"],
            "dependsOn": ["build"]
        }
    },
    "bindings": {
        "tsc": "build:run",
        "mocha": "test:run"
    }
}
```

## Configuration

### `stages`

Required. No default.

Declares the abstract workflow stages that `nx-lifecycle` will own. Each key is a stage name, and its value configures the stage's hooks and upstream dependencies.

| Field       | Type          | Default | Description                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------- | ------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hooks`     | `string[]`    | —       | Ordered list of sub-steps within the stage. The resulting target names are `stage:hook` (e.g. `build:run`). If omitted, the stage has no sub-steps and is referenced directly by name.                                                                                                                                                                                                                                                |
| `dependsOn` | `dependsOn[]` | —       | Upstream dependencies for this stage, using the same format as Nx's native [`dependsOn`](https://nx.dev/reference/project-configuration#dependson): `"build"` (this project's stage), `"^build"` (the stage of every dependency project), `{ "target": "build", "projects": ["my-server"] }`. Can name a stage or any other target, but not another stage's anchor or hook (`^build:post` is rejected, so depend on `build` instead). |

**Note:** If a stage declares `hooks`, bindings must reference a specific hook (`build:run`), not the stage name alone (`build`). A stage without hooks still generates an anchor: `lint:_ → eslint → lint`.

The config is checked whenever Nx builds the project graph, and fails for a binding that names a hook that doesn't exist, a stage that has hooks, an anchor (`build:_`) or a lifecycle target, and for a stage `dependsOn` on another stage's anchor or hook.

```json
{
    "stages": {
        "build": {
            "hooks": ["pre", "run", "post"],
            "dependsOn": ["^build"]
        },
        "test": {
            "hooks": ["run", "report"],
            "dependsOn": ["build"]
        }
    }
}
```

A stage without hooks (referenced directly by name):

```json
{
    "stages": {
        "build": {
            "dependsOn": ["^build"]
        }
    },
    "bindings": {
        "tsc": "build"
    }
}
```

#### Generated targets

Each stage generates a chain of `noop` targets. For `build` with hooks `pre`, `run`, `post`:

```
build:_ → build:pre → build:run → build:post → build
```

- `build:_` is the stage's **anchor**. It carries the stage's `dependsOn`, so every hook waits for it. Nothing can be bound to it.
- Each hook depends on the previous one, and a bound target depends on the hook before its own. Targets bound to the same hook run in parallel.
- `build` is the stage's public entry point. Other stages and your own targets should depend on it, not on its hooks.

### `bindings`

Required. No default.

Maps your project's concrete target names to lifecycle stage hooks. Each key is the name of an existing Nx target (like `tsc` or `mocha`), and its value is the stage or hook it runs in.

```json
{
    "bindings": {
        "tsc": "build:run",
        "mocha": "test:run"
    }
}
```

Multiple targets from different languages or toolchains can bind to the same hook:

```json
{
    "bindings": {
        "tsc": "build:run",
        "gradle": "build:run"
    }
}
```

A binding applies to every project that defines the target, through `targetDefaults` or its own `project.json`. A project opts in by defining it (e.g. `"tsc": {}`). A warning is logged for a binding that no `project.json` declares, since it is usually a typo. Targets inferred by Nx plugins are not declared in `project.json`, so they trigger the warning too. The plugin's `"warnUnusedBindings": false` turns it off, for bindings that cover targets projects add later.

#### Project-specific dependencies

With the plugin, see [Overriding inferred targets](#overriding-inferred-targets) instead. With the executor, a project can't change a stage's `dependsOn`, but it can add dependencies to its own bound targets. `nx-lifecycle` keeps any `dependsOn` entry that isn't a lifecycle target and appends the hook dependency after it:

```json
// project.json
{
    "targets": {
        "e2e-test": {
            "dependsOn": [{ "target": "build", "projects": ["my-server"] }]
        }
    }
}
```

Use this sparingly. If many projects need the same dependency, it belongs in the stage.

### `check`

Executor only.

| Type      | Default                         |
| --------- | ------------------------------- |
| `boolean` | `true` in CI, `false` otherwise |

When `true`, the executor writes nothing and fails if `nx.json` or any `project.json` is out of sync with what `nx-lifecycle` would generate. Use this in CI to verify that generated configs are committed and up to date before deployment proceeds.

### `dryRun`

Executor only.

| Type      | Default |
| --------- | ------- |
| `boolean` | `false` |

When `true`, performs all computation but skips writing any files. Can still fail when `check` is `true`.

## CLI

`nx-lifecycle` installs an `nx-lifecycle` command (also available as `lifecycle`). It does what the executor does. The CLI has no inline options, so it reads its configuration from a config file.

```sh
pnpx nx-lifecycle --help
pnpx nx-lifecycle --config-file ./my-lifecycle.json --dry-run
```

| Flag              | Type      | Default          | Description                              |
| ----------------- | --------- | ---------------- | ---------------------------------------- |
| `--config-file`   | `string`  | `lifecycle.json` | Path to the lifecycle config file.       |
| `--dry-run`       | `boolean` | `false`          | Compute changes without writing files.   |
| `--check`, `--ci` | `boolean` | `true` in CI     | Fail if any file is out of sync.         |
| `--cwd`           | `string`  | `.`              | Directory other paths are resolved from. |

### `explain`

Prints what runs, in which order, for the stages of a project: each stage after the stages it depends on, its hooks, and the bound targets the project declares. A `^` dependency lists the upstream projects it runs.

```sh
pnpx nx-lifecycle explain my-lib       # every stage
pnpx nx-lifecycle explain my-lib test  # test, and the stages it runs after
```

```
my-lib

1. build
   after: ^build (my-utils)
   build:pre (nothing bound)
   build:run
     tsc

2. test
   after: build
   test:run
     mocha
     e2e-test (also after: my-server:build)
   test:report
     coverage-report
```

Stages and bindings come from the [plugin](#plugin) options in `nx.json`, or else from `--config-file` (default `lifecycle.json`). Bound targets and their other dependencies come from the project as Nx resolves it, after `targetDefaults` and `project.json`.

## Compared to alternatives

Without nx-lifecycle, `dependsOn` is written by hand in `targetDefaults` and each `project.json`. Adding a step between two existing ones then means editing every target that depended on the first, in every project that has it.
