<div style="text-align:center">

# nx-lifecycle
[Nx](https://nx.dev/) plugin that derives every `dependsOn` from declared lifecycle stages (build, test, …) and the targets bound to them.

[![npm package](https://badge.fury.io/js/nx-lifecycle.svg)](https://www.npmjs.com/package/nx-lifecycle)
[![License](https://img.shields.io/npm/l/nx-lifecycle.svg)](https://github.com/JacobLey/leyman/blob/main/apps/nx-lifecycle/LICENSE)

</div>

Declare your workflow once — `build` runs hooks `pre` → `run` → `post`, `test` runs after `build` — then bind tools to hooks (`tsc` → `build:run`, `mocha` → `test:run`). Then `nx run <project>:build` runs the right steps, in the right order, in any project.

- **Add a step in one place** — binding a new target (codegen, lint, a post-build step) rewires every dependent automatically, across every project.
- **Per-project implementations** — each project opts into the bound targets it declares, so TypeScript, Go and Java projects can all answer to the same `build` and `test`.
- **Nothing to commit** — the plugin infers targets when Nx builds the project graph, and fails with the fix if a project's `dependsOn` breaks the wiring. An executor that writes the config to files is also available.

**Compared to** hand-written `dependsOn` in `targetDefaults` and each `project.json`: there, adding a step between two existing ones means editing every target that depended on the first, in every project that has it.

For the problem this solves and design rationale, see [WHY-NX-LIFECYCLE.md](https://github.com/JacobLey/leyman/blob/main/apps/nx-lifecycle/WHY-NX-LIFECYCLE.md).

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

## Install

```sh
npm i -D nx-lifecycle
```

`nx-lifecycle` wires targets in one of two ways:

- **[Plugin](#plugin)** (recommended): infers the lifecycle targets whenever Nx builds the project graph. Nothing is written to files.
- **[Executor](#executor)**: writes the lifecycle targets into `nx.json` and every `project.json`, to be committed. CI checks they are up to date.

Both take the same [stages](#stages) and [bindings](#bindings).

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

Every project with a `project.json` gets the [stage targets](#generated-targets). A bound target is wired in a project when its `project.json` declares it, e.g. `"tsc": {}`; the implementation can still come from `targetDefaults`. `nx show project <name>` lists the inferred targets.

### Overriding inferred targets

Nx applies `nx.json` `targetDefaults` and `project.json` on top of inferred targets. A `dependsOn` there replaces the inferred one rather than merging with it. So:

- Don't define the stage targets (`build`, `build:_`, `build:run`…) yourself.
- If a bound target sets its own `dependsOn`, include its lifecycle dependency: the hook before its own, or `<stage>:_` for the first hook.

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

Register it as a target in a `project.json`. Because `lifecycle` manages dependencies for the rest of your targets, it should live in a project outside your normal build/test graph — for example, a root-level management package. See [Nx-lifecycle's own monorepo config](https://github.com/JacobLey/leyman/blob/main/leyman/main/lifecycle.json) for a real example.

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

You may declare any of your own targets as depending on a lifecycle-managed target. That is the intended use: your targets reference abstract stage targets, and `nx-lifecycle` ensures those stages wire up to the correct concrete implementations.

Configuration can be provided in two ways:

- **Inline** — pass `stages` and `bindings` directly in the executor `options` inside `project.json`
- **Config file** — point the executor at a separate JSON file (defaults to `lifecycle.json` in the project root)

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

Declares the abstract workflow stages that `nx-lifecycle` will own. Each key is a stage name; the value configures that stage's structure and upstream dependencies.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `hooks` | `string[]` | — | Ordered list of sub-steps within the stage. The resulting target names are `stage:hook` (e.g. `build:run`). If omitted, the stage has no sub-steps and is referenced directly by name. |
| `dependsOn` | `dependsOn[]` | — | Upstream dependencies for this stage, using the same format as Nx's native [`dependsOn`](https://nx.dev/reference/project-configuration#dependson). Defines the relationship between this stage and others (or their upstream counterparts). |

**Note:** If a stage declares `hooks`, bindings must reference a specific hook (`build:run`), not the stage name alone (`build`).

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

Maps your project's concrete target names to lifecycle stage hooks. Each key is the name of an existing Nx target (e.g. `tsc`, `mocha`); the value is the stage or stage hook it should be bound to.

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

A binding applies to every project that defines the target, through `targetDefaults` or its own `project.json`. A project opts in by defining it (e.g. `"tsc": {}`). A warning is logged for a binding that no `project.json` declares, since it is usually a typo. Targets inferred by Nx plugins are not declared in `project.json`, so they trigger the warning too.

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

| Type | Default |
|------|---------|
| `boolean` | `true` in CI, `false` otherwise |

When `true`, the executor fails if `nx.json` or any `project.json` is out of sync with what `nx-lifecycle` would generate. Use this in CI to verify that generated configs are committed and up to date before deployment proceeds.

### `dryRun`

Executor only.

| Type | Default |
|------|---------|
| `boolean` | `false` |

When `true`, performs all computation but skips writing any files. Can still fail when `check` is `true`.

## CLI

`nx-lifecycle` can also be invoked directly as a CLI command. Configuration must be provided via a config file — inline options are not supported from the CLI.

```sh
pnpx nx-lifecycle --help
pnpx nx-lifecycle --config-file ./my-lifecycle.json --dry-run
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--config-file` | `string` | `lifecycle.json` | Path to the lifecycle config file. |
| `--dry-run` | `boolean` | `false` | Compute changes without writing files. |
| `--check` | `boolean` | `true` in CI | Fail if any file is out of sync. |

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
